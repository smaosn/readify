import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DocumentCamera } from '@/components/document-camera';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVoiceQuestion } from '@/hooks/use-voice-question';
import { interpret, introSpeech, respond } from '@/services/assistant';
import { parseConfirmation } from '@/services/commands';
import { documentToSpeech, structureDocument } from '@/services/document';
import { problemFeedback, tapFeedback, yourTurnFeedback } from '@/services/feedback';
import { isTextClear } from '@/services/framing';
import { recognizeDocumentText } from '@/services/ocr';
import { speak, stopSpeaking } from '@/services/speech';

const TAKE_A_PICTURE = 'To read a document, say: take a picture.';
const WELCOME = `Welcome to Readify. ${TAKE_A_PICTURE}`;
const HOME_HELP = `${TAKE_A_PICTURE} You can also tap the Take picture button at the bottom of the screen.`;
const HOME_UNKNOWN = `Sorry, I did not catch that. ${TAKE_A_PICTURE}`;
const READER_CLOSED = `Okay, you are back on the home screen. ${TAKE_A_PICTURE}`;
const READER_DELETED = `Document deleted. You are back on the home screen. ${TAKE_A_PICTURE}`;
const VOICE_PAUSED = 'I am having trouble listening, so voice control is paused. ' +
    'To turn it back on, tap the Speak button at the top of the screen.';
const PHOTO_TAKEN = 'Your photo has been taken.';
const PHOTO_UNCLEAR = 'The photo is unclear. Please take it again.';
// Added after the second unclear photo in a row.
const UNCLEAR_TIP = 'Try turning on a light, or moving the page somewhere brighter.';
const VOICE_UNAVAILABLE =
    'Voice questions are turned off, because Readify cannot use the microphone or speech recognition. ' +
    'You can turn them on in Settings. For now, use the buttons on the screen.';

const CONFIRM_QUESTION = 'Would you like to read this document? Say yes or no.';
// How many times to ask again when no yes/no answer is heard. After that the
// app keeps listening quietly instead of nagging.
const MAX_CONFIRM_RETRIES = 2;

// Readify listens on its own whenever it isn't talking, so the user never
// has to press a button. This pause after it stops talking keeps the tail of
// its own voice from being heard as a command.
// Kept short because people answer a question straight away, and anything
// said before the microphone opens is lost.
const RELISTEN_DELAY_MS = 250;
// Listening errors in a row (other than silence) before voice control pauses,
// so a broken microphone doesn't cause an endless loop of error messages.
const MAX_LISTEN_ERRORS = 3;

// Gives a screen time to finish closing before the camera opens on top of
// it; iOS won't present a new screen over one that is still closing.
const REOPEN_SCANNER_DELAY_MS = 600;

export default function HomeScreen() {
    const insets = useSafeAreaInsets();
    const theme = useTheme();
    const [recognizedText, setRecognizedText] = useState(null);
    const [isReading, setIsReading] = useState(false);
    const [ocrError, setOcrError] = useState(null);
    // Starts true: the welcome message plays as soon as the app opens.
    const [isSpeaking, setIsSpeaking] = useState(true);
    const [appActive, setAppActive] = useState(true);
    // Set after repeated listening errors; tapping Speak turns it back on.
    const [voicePaused, setVoicePaused] = useState(false);
    const listenErrorsRef = useRef(0);
    // Set whenever Readify speaks, so the next time the microphone opens it
    // gives a "your turn" tap. Not on the quiet restarts after silence.
    const justSpokeRef = useRef(true);
    // The last thing the recognizer heard, shown on the yes/no screen.
    const [lastHeard, setLastHeard] = useState('');
    const [answer, setAnswer] = useState(null);
    const [lastSpeech, setLastSpeech] = useState(null);
    const [voiceUnavailable, setVoiceUnavailable] = useState(false);
    const [screenReaderOn, setScreenReaderOn] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    // True between the photo being taken and knowing whether it's clear.
    const [isChecking, setIsChecking] = useState(false);
    // True while waiting for the reader to close before the camera opens.
    const [cameraOpening, setCameraOpening] = useState(false);
    const unclearCountRef = useRef(0);
    // A scanned page waiting for the user to confirm they want it read.
    const [pendingUri, setPendingUri] = useState(null);
    // Text recognition for the pending page, started as soon as it's taken
    // so it's ready by the time the user answers.
    const pendingTextRef = useRef(null);
    const confirmRetriesRef = useRef(0);
    const documentSpeech = useMemo(() => documentToSpeech(structureDocument(recognizedText)), [recognizedText]);
    const readerOpen = recognizedText !== null;

    useEffect(() => {
        AccessibilityInfo.isScreenReaderEnabled().then(setScreenReaderOn);
        const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReaderOn);
        return () => subscription.remove();
    }, []);

    useEffect(() => {
        const finished = () => setIsSpeaking(false);
        speak(WELCOME, { onDone: finished, onStopped: finished, onError: finished });
    }, []);

    /**
     * Speaks `text`. If `display` is given it also becomes the answer shown
     * on screen, and is what "repeat" says again. `onFinished` runs only if
     * the speech plays to the end without being stopped.
     */
    const say = (text, display, onFinished) => {
        if (display !== undefined) {
            setAnswer(display);
            setLastSpeech(text);
        }
        // Never listen while talking, or Readify hears itself.
        voice.cancel();
        justSpokeRef.current = true;
        setIsSpeaking(true);
        speak(text, {
            onDone: () => {
                setIsSpeaking(false);
                onFinished?.();
            },
            onStopped: () => setIsSpeaking(false),
            onError: () => setIsSpeaking(false),
        });
    };
    // Speaks `text` and resolves once it has finished, been stopped, or failed.
    const sayAndWait = (text) => new Promise((resolve) => {
        const finished = () => {
            setIsSpeaking(false);
            resolve();
        };
        voice.cancel();
        justSpokeRef.current = true;
        setIsSpeaking(true);
        speak(text, { onDone: finished, onStopped: finished, onError: finished });
    });
    const handleStopSpeaking = () => {
        stopSpeaking();
        setIsSpeaking(false);
    };

    // Opens the guided camera. It talks the user into lining up the page and
    // takes one photo, which arrives in handlePhotoTaken.
    const scanDocument = () => {
        if (isReading || isChecking)
            return;
        voice.cancel();
        handleStopSpeaking();
        setOcrError(null);
        setPendingUri(null);
        pendingTextRef.current = null;
        setCameraOpen(true);
    };
    const handlePhotoTaken = async (uri) => {
        setCameraOpen(false);
        setIsChecking(true);
        // The camera already buzzed at the moment the photo was taken.
        // Read the text while the confirmation is being said, so the clarity
        // check is usually done by the time it finishes.
        const [, result] = await Promise.all([
            sayAndWait(PHOTO_TAKEN),
            recognizeDocumentText(uri).then((text) => ({ text, failed: false }), () => ({ text: '', failed: true })),
        ]);
        setIsChecking(false);
        if (result.failed || !isTextClear(result.text)) {
            unclearCountRef.current += 1;
            problemFeedback();
            const message = unclearCountRef.current >= 2 ? `${PHOTO_UNCLEAR} ${UNCLEAR_TIP}` : PHOTO_UNCLEAR;
            // The camera screen closed long ago, so it can reopen straight
            // away, before listening would start.
            say(message, undefined, scanDocument);
            return;
        }
        unclearCountRef.current = 0;
        pendingTextRef.current = Promise.resolve(result);
        confirmRetriesRef.current = 0;
        setLastHeard('');
        setPendingUri(uri);
        say(CONFIRM_QUESTION);
    };
    const handleCameraCancel = () => {
        setCameraOpen(false);
        unclearCountRef.current = 0;
        say(`Camera closed. ${TAKE_A_PICTURE}`);
    };
    const handleCameraError = (message) => {
        setCameraOpen(false);
        reportScanError(message);
    };
    // The answer is picked up by the automatic listening once this is said.
    const askToReadPendingAgain = (reason) => {
        confirmRetriesRef.current += 1;
        say(`${reason} ${CONFIRM_QUESTION}`);
    };
    const readPendingDocument = async () => {
        const pending = pendingTextRef.current;
        if (!pending)
            return;
        pendingTextRef.current = null;
        voice.cancel();
        handleStopSpeaking();
        setPendingUri(null);
        setIsReading(true);
        const { text, failed } = await pending;
        setIsReading(false);
        if (failed) {
            reportScanError('We could not read this document. Please try scanning it again.');
            return;
        }
        if (!text) {
            reportScanError('No text was found. Try scanning again with more light.');
            return;
        }
        setAnswer(null);
        setLastSpeech(null);
        setRecognizedText(text);
        say(introSpeech());
    };
    const cancelPendingDocument = () => {
        pendingTextRef.current = null;
        voice.cancel();
        setPendingUri(null);
        say(`Okay, that photo was discarded. ${TAKE_A_PICTURE}`);
    };
    const handleConfirmation = (transcripts) => {
        const confirmation = transcripts.map(parseConfirmation).find(Boolean);
        if (confirmation === 'yes') {
            readPendingDocument();
        }
        else if (confirmation === 'no') {
            scanDocument();
        }
        else if (confirmation === 'cancel') {
            cancelPendingDocument();
        }
        else {
            // Saying back what was heard tells the user why it didn't work
            // (e.g. "yes" heard as "guess").
            const heard = transcripts[0];
            askToReadPendingAgain(heard ? `Sorry, I heard: ${heard}.` : 'Sorry, I did not catch that.');
        }
    };
    const reportScanError = (message) => {
        setOcrError(message);
        say(message);
    };

    const closeReader = () => {
        voice.cancel();
        handleStopSpeaking();
        setAnswer(null);
        setLastSpeech(null);
        setRecognizedText(null);
    };
    // Closes the document (nothing is kept) and says where the user is now.
    const leaveReader = (message) => {
        closeReader();
        say(message);
    };

    const runCommand = (command) => {
        if (!readerOpen) {
            switch (command.type) {
                // "Read a document" on the home screen means take a picture.
                case 'scan':
                case 'readAll':
                    scanDocument();
                    break;
                case 'stop':
                    handleStopSpeaking();
                    break;
                case 'help':
                    say(HOME_HELP);
                    break;
                default:
                    say(HOME_UNKNOWN);
            }
            return;
        }
        const reply = respond(command, { documentText: recognizedText, documentSpeech, lastSpeech, screenReaderOn });
        switch (reply.type) {
            case 'say':
                say(reply.speech, reply.display);
                break;
            case 'stop':
                handleStopSpeaking();
                break;
            case 'close':
                leaveReader(READER_CLOSED);
                break;
            case 'delete':
                leaveReader(READER_DELETED);
                break;
            case 'scan':
                closeReader();
                setCameraOpening(true);
                setTimeout(() => {
                    setCameraOpening(false);
                    scanDocument();
                }, REOPEN_SCANNER_DELAY_MS);
                break;
        }
    };

    const voice = useVoiceQuestion({
        onResult: (transcripts) => {
            listenErrorsRef.current = 0;
            tapFeedback();
            setLastHeard(transcripts[0] ?? '');
            if (pendingUri) {
                handleConfirmation(transcripts);
                return;
            }
            runCommand(interpret(transcripts).command);
        },
        onError: (reason) => {
            // Nobody spoke. Normal when listening all the time: just listen
            // again, apart from re-asking an unanswered yes/no question a
            // couple of times.
            if (reason === 'no-speech' || reason === 'speech-timeout') {
                listenErrorsRef.current = 0;
                if (pendingUri && confirmRetriesRef.current < MAX_CONFIRM_RETRIES) {
                    askToReadPendingAgain('I did not hear an answer.');
                }
                return;
            }
            problemFeedback();
            if (['not-allowed', 'service-not-allowed', 'unavailable', 'language-not-supported'].includes(reason)) {
                setVoiceUnavailable(true);
                say(VOICE_UNAVAILABLE);
                return;
            }
            listenErrorsRef.current += 1;
            if (listenErrorsRef.current >= MAX_LISTEN_ERRORS) {
                setVoicePaused(true);
                say(VOICE_PAUSED);
            }
            // Otherwise the automatic listening just tries again.
        },
    });

    // Listen whenever Readify is waiting for the user: not talking, not in
    // the camera, and not busy checking or opening a photo.
    const shouldListen = appActive && !voiceUnavailable && !voicePaused && !cameraOpen && !cameraOpening && !isChecking && !isReading && !isSpeaking && !voice.isListening;
    // The latest `voice`, for effects that shouldn't re-run on every render.
    const voiceRef = useRef(voice);
    useEffect(() => {
        voiceRef.current = voice;
    });
    useEffect(() => {
        if (!shouldListen) {
            return;
        }
        const timer = setTimeout(() => {
            if (justSpokeRef.current) {
                justSpokeRef.current = false;
                yourTurnFeedback();
            }
            voiceRef.current.listen();
        }, RELISTEN_DELAY_MS);
        return () => clearTimeout(timer);
    }, [shouldListen]);
    // Stop listening while the app is in the background.
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            const active = state === 'active';
            setAppActive(active);
            if (!active) {
                voiceRef.current.cancel();
            }
        });
        return () => subscription.remove();
    }, []);

    // The one main button. While Readify is talking it stops the talking
    // (listening then starts again by itself); while listening it finishes
    // the question early; if voice control was paused it turns it back on.
    const toggleAsk = () => {
        tapFeedback();
        if (voice.isListening) {
            voice.stop();
            return;
        }
        if (isSpeaking) {
            handleStopSpeaking();
            return;
        }
        // Also retries after the microphone was unavailable (e.g. permission
        // since turned on in Settings); if it still isn't, onError says so.
        listenErrorsRef.current = 0;
        setVoicePaused(false);
        setVoiceUnavailable(false);
        voice.listen();
    };

    const homeSpeakLabel = voicePaused || voiceUnavailable
        ? 'Turn voice on'
        : voice.isListening && !readerOpen ? 'Listening…' : 'Speak';
    const askTitle = voice.isListening ? 'Listening…' : isSpeaking ? 'Tap to stop' : 'Tap to ask';
    const askSubtitle = voice.isListening
        ? voice.transcript ? `“${voice.transcript}”` : 'Say what you want to know'
        : isSpeaking ? 'Then ask another question' : 'Like “due date” or “amount due”';
    const askLabel = voice.isListening ? 'Listening' : isSpeaking ? 'Stop and ask a question' : 'Ask a question';
    const askHint = voice.isListening
        ? 'Say your question. Double tap to finish early.'
        : 'Then say what you want to know, like due date, amount due, or read everything.';

    const homePadding = {
        paddingTop: Math.max(insets.top, Spacing.three),
        paddingBottom: insets.bottom + BottomTabInset + Spacing.three,
    };

    return (<ThemedView style={styles.container}>
      {pendingUri ? (<View style={[styles.confirmView, homePadding]}>
          <View accessible accessibilityRole="header" accessibilityLabel={`Photo taken. ${voice.isListening ? 'Listening. Say yes or no.' : 'Would you like to read this document?'}`}>
            <ThemedText style={styles.confirmTitle}>Photo taken</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.confirmSubtitle}>
              {voice.isListening ? 'Listening… say yes or no' : 'Would you like to read this document?'}
            </ThemedText>
            {lastHeard !== '' && (<ThemedText themeColor="textSecondary" style={styles.confirmSubtitle}>
                Heard: “{lastHeard}”
              </ThemedText>)}
          </View>
          <Image source={{ uri: pendingUri }} style={styles.confirmImage} resizeMode="contain"/>
          <Pressable accessibilityRole="button" accessibilityLabel="Yes, read this document" onPress={readPendingDocument} style={({ pressed }) => [styles.confirmButton, styles.speakButton, pressed && styles.pressed]}>
            <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} tintColor="#FFFFFF" size={44}/>
            <ThemedText style={[styles.confirmButtonText, { color: '#FFFFFF' }]}>Yes, read it</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="No, take another picture" onPress={scanDocument} style={({ pressed }) => [styles.confirmButton, styles.cameraButton, pressed && styles.pressed]}>
            <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'camera' }} tintColor="#173B3F" size={44}/>
            <ThemedText style={[styles.confirmButtonText, { color: '#173B3F' }]}>No, take another</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" accessibilityHint="Goes back without reading the picture" onPress={cancelPendingDocument} style={({ pressed }) => [styles.cancelButton, { backgroundColor: theme.backgroundElement }, pressed && styles.pressed]}>
            <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
          </Pressable>
        </View>) : (<View style={[styles.homeButtons, homePadding]}>
        <Pressable accessibilityRole="button" accessibilityLabel={homeSpeakLabel} accessibilityHint={voicePaused || voiceUnavailable ? 'Turns voice control back on' : 'Readify is already listening. Just say: take a picture.'} onPress={toggleAsk} style={({ pressed }) => [styles.homeButton, styles.speakButton, pressed && styles.pressed]}>
          <SymbolView name={{ ios: 'mic.fill', android: 'mic', web: 'mic' }} tintColor="#FFFFFF" size={96}/>
          <ThemedText style={[styles.homeButtonText, { color: '#FFFFFF' }]}>
            {homeSpeakLabel}
          </ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={isReading ? 'Reading document' : isChecking ? 'Checking photo' : 'Take a picture'} accessibilityHint="Opens the camera. Readify tells you how to move the phone, then takes the photo for you." accessibilityState={{ busy: isReading || isChecking, disabled: isReading || isChecking }} disabled={isReading || isChecking} onPress={scanDocument} style={({ pressed }) => [styles.homeButton, styles.cameraButton, pressed && styles.pressed]}>
          <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'camera' }} tintColor="#173B3F" size={96}/>
          <ThemedText style={[styles.homeButtonText, { color: '#173B3F' }]}>
            {isReading ? 'Reading...' : isChecking ? 'Checking...' : 'Take picture'}
          </ThemedText>
          {ocrError && <ThemedText style={styles.ocrError}>{ocrError}</ThemedText>}
        </Pressable>
      </View>)}

      <DocumentCamera visible={cameraOpen} onCapture={handlePhotoTaken} onCancel={handleCameraCancel} onError={handleCameraError}/>

      <Modal animationType="slide" visible={readerOpen} onRequestClose={() => leaveReader(READER_CLOSED)}>
        {/* VoiceOver: two-finger double tap (Magic Tap) asks a question from
            anywhere, and the two-finger "Z" scrub closes the reader. */}
        <View accessibilityViewIsModal onMagicTap={toggleAsk} onAccessibilityEscape={() => leaveReader(READER_CLOSED)} style={[
            styles.readerScreen,
            {
                backgroundColor: theme.background,
                paddingTop: insets.top + Spacing.three,
                paddingBottom: insets.bottom + Spacing.three,
                paddingLeft: insets.left + Spacing.three,
                paddingRight: insets.right + Spacing.three,
            },
        ]}>
          <Pressable accessibilityRole="button" accessibilityLabel={askLabel} accessibilityHint={askHint} onPress={toggleAsk} style={({ pressed }) => [
            styles.askButton,
            voice.isListening && styles.askButtonListening,
            isSpeaking && !voice.isListening && styles.askButtonSpeaking,
            pressed && styles.pressed,
        ]}>
            <SymbolView name={voice.isListening
            ? { ios: 'waveform', android: 'graphic_eq', web: 'graphic_eq' }
            : isSpeaking
                ? { ios: 'stop.fill', android: 'stop', web: 'stop' }
                : { ios: 'mic.fill', android: 'mic', web: 'mic' }} tintColor="#FFFFFF" size={88}/>
            <ThemedText style={styles.askTitle}>{askTitle}</ThemedText>
            <ThemedText style={styles.askSubtitle}>{askSubtitle}</ThemedText>
          </Pressable>

          {voiceUnavailable && (<View style={styles.fallbackRow}>
              <FallbackButton label="Amount due" icon={{ ios: 'dollarsign.circle.fill', android: 'attach_money', web: 'attach_money' }} onPress={() => runCommand({ type: 'field', fields: ['amountDue'] })}/>
              <FallbackButton label="Due date" icon={{ ios: 'calendar', android: 'event', web: 'event' }} onPress={() => runCommand({ type: 'field', fields: ['dueDate'] })}/>
              <FallbackButton label="Read all" icon={{ ios: 'text.alignleft', android: 'subject', web: 'subject' }} onPress={() => runCommand({ type: 'readAll' })}/>
            </View>)}

          {answer && (<ScrollView style={styles.answerScroll} accessibilityLabel="Last answer">
              <ThemedView type="backgroundElement" style={styles.answerCard}>
                <ThemedText style={styles.answerText}>{answer}</ThemedText>
              </ThemedView>
            </ScrollView>)}

          <Pressable accessibilityRole="button" accessibilityLabel="Scan a new document" accessibilityHint="Closes this document and opens the camera" onPress={() => runCommand({ type: 'scan' })} style={({ pressed }) => [styles.scanNewButton, pressed && styles.pressed]}>
            <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'camera' }} tintColor="#173B3F" size={28}/>
            <ThemedText style={styles.scanNewText}>Scan new document</ThemedText>
          </Pressable>
        </View>
      </Modal>
    </ThemedView>);
}

function FallbackButton({ label, icon, onPress }) {
    return (<Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.fallbackButton, pressed && styles.pressed]}>
      <SymbolView name={icon} tintColor="#FFFFFF" size={26}/>
      <ThemedText style={styles.fallbackText}>{label}</ThemedText>
    </Pressable>);
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    pressed: {
        opacity: 0.72,
    },
    ocrError: {
        color: '#7A1C14',
        fontSize: 18,
        lineHeight: 24,
        fontWeight: '700',
        textAlign: 'center',
        paddingHorizontal: Spacing.four,
    },
    readerScreen: {
        flex: 1,
        gap: Spacing.three,
    },
    askButton: {
        flex: 1,
        minHeight: 260,
        borderRadius: 32,
        backgroundColor: '#173B3F',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.three,
        padding: Spacing.four,
    },
    askButtonListening: {
        backgroundColor: '#0B6E4F',
    },
    askButtonSpeaking: {
        backgroundColor: '#8C1D18',
    },
    askTitle: {
        color: '#FFFFFF',
        fontSize: 44,
        lineHeight: 52,
        fontWeight: '800',
        textAlign: 'center',
    },
    askSubtitle: {
        color: '#FFFFFF',
        fontSize: 22,
        lineHeight: 30,
        fontWeight: '600',
        textAlign: 'center',
    },
    fallbackRow: {
        flexDirection: 'row',
        gap: Spacing.two,
    },
    fallbackButton: {
        flex: 1,
        minHeight: 88,
        borderRadius: 20,
        backgroundColor: '#173B3F',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.one,
        padding: Spacing.two,
    },
    fallbackText: {
        color: '#FFFFFF',
        fontSize: 18,
        lineHeight: 24,
        fontWeight: '700',
        textAlign: 'center',
    },
    answerScroll: {
        flexGrow: 0,
        maxHeight: '40%',
    },
    answerCard: {
        borderRadius: 20,
        padding: Spacing.four,
    },
    answerText: {
        fontSize: 28,
        lineHeight: 38,
        fontWeight: '700',
    },
    scanNewButton: {
        minHeight: 72,
        borderRadius: 20,
        backgroundColor: '#F5C36A',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.three,
    },
    scanNewText: {
        color: '#173B3F',
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '800',
    },
    confirmView: {
        flex: 1,
        paddingHorizontal: Spacing.three,
        gap: Spacing.three,
    },
    confirmTitle: {
        fontSize: 36,
        lineHeight: 44,
        fontWeight: '800',
        textAlign: 'center',
    },
    confirmSubtitle: {
        fontSize: 22,
        lineHeight: 30,
        fontWeight: '600',
        textAlign: 'center',
    },
    confirmImage: {
        flex: 1,
        minHeight: 120,
    },
    confirmButton: {
        minHeight: 110,
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.three,
    },
    confirmButtonText: {
        fontSize: 30,
        lineHeight: 38,
        fontWeight: '800',
    },
    cancelButton: {
        minHeight: 64,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButtonText: {
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '700',
    },
    homeButtons: {
        flex: 1,
        paddingHorizontal: Spacing.three,
        gap: Spacing.three,
    },
    homeButton: {
        flex: 1,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.three,
    },
    speakButton: {
        backgroundColor: '#173B3F',
    },
    cameraButton: {
        backgroundColor: '#F5C36A',
    },
    homeButtonText: {
        fontSize: 40,
        lineHeight: 48,
        fontWeight: '800',
    },
});
