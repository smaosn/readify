import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVoiceQuestion } from '@/hooks/use-voice-question';
import { interpret, introSpeech, respond } from '@/services/assistant';
import { parseConfirmation } from '@/services/commands';
import { documentToSpeech, structureDocument } from '@/services/document';
import { recognizeDocumentText } from '@/services/ocr';
import { scanDocumentImage } from '@/services/scanner';
import { speak, stopSpeaking } from '@/services/speech';

const HOME_HELP = 'To read a document, say: scan a document. Or tap the Take picture button at the bottom of the screen.';
const VOICE_UNAVAILABLE =
    'Voice questions are turned off, because Readify cannot use the microphone or speech recognition. ' +
    'You can turn them on in Settings. For now, use the buttons on the screen.';

const CONFIRM_QUESTION = 'Do you want me to read this document? Say yes or no.';
// How many times to ask again when the yes/no answer isn't heard, before
// leaving it to the buttons.
const MAX_CONFIRM_RETRIES = 2;

// Gives the reader screen time to finish closing before the scanner opens
// on top of it; iOS won't present the scanner over a closing screen.
const REOPEN_SCANNER_DELAY_MS = 600;

export default function HomeScreen() {
    const insets = useSafeAreaInsets();
    const theme = useTheme();
    const [recognizedText, setRecognizedText] = useState(null);
    const [isReading, setIsReading] = useState(false);
    const [ocrError, setOcrError] = useState(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [answer, setAnswer] = useState(null);
    const [lastSpeech, setLastSpeech] = useState(null);
    const [voiceUnavailable, setVoiceUnavailable] = useState(false);
    const [screenReaderOn, setScreenReaderOn] = useState(false);
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
    const handleStopSpeaking = () => {
        stopSpeaking();
        setIsSpeaking(false);
    };

    const scanDocument = async () => {
        if (isReading)
            return;
        voice.cancel();
        handleStopSpeaking();
        setOcrError(null);
        setPendingUri(null);
        pendingTextRef.current = null;
        let uri;
        try {
            uri = await scanDocumentImage();
        }
        catch {
            reportScanError('The scanner could not start. Please try again.');
            return;
        }
        if (!uri) {
            say('Scanning cancelled.');
            return;
        }
        pendingTextRef.current = recognizeDocumentText(uri).then((text) => ({ text, failed: false }), () => ({ text: '', failed: true }));
        confirmRetriesRef.current = 0;
        setPendingUri(uri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        askToReadPending(`Picture taken. ${CONFIRM_QUESTION}`);
    };
    // Asks the yes/no question, then listens for the answer once it's been said.
    const askToReadPending = (question) => {
        say(question, undefined, () => voice.listen());
    };
    const askToReadPendingAgain = (reason) => {
        confirmRetriesRef.current += 1;
        if (confirmRetriesRef.current > MAX_CONFIRM_RETRIES) {
            say(`${reason} You can use the buttons on the screen instead. Read this document is at the top.`);
            return;
        }
        askToReadPending(`${reason} ${CONFIRM_QUESTION}`);
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
        say('Reading your document.');
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
        say(introSpeech(screenReaderOn));
    };
    const cancelPendingDocument = () => {
        pendingTextRef.current = null;
        voice.cancel();
        setPendingUri(null);
        say('Okay. The picture was not read.');
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
            askToReadPendingAgain('Sorry, I did not catch that.');
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

    const runCommand = (command) => {
        if (!readerOpen) {
            if (command.type === 'scan') {
                scanDocument();
            }
            else if (command.type === 'stop') {
                handleStopSpeaking();
            }
            else {
                say(HOME_HELP);
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
                closeReader();
                break;
            case 'scan':
                closeReader();
                setTimeout(scanDocument, REOPEN_SCANNER_DELAY_MS);
                break;
        }
    };

    const voice = useVoiceQuestion({
        onResult: (transcripts) => {
            Haptics.selectionAsync();
            if (pendingUri) {
                handleConfirmation(transcripts);
                return;
            }
            runCommand(interpret(transcripts).command);
        },
        onError: (reason) => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const voiceOff = ['not-allowed', 'service-not-allowed', 'unavailable', 'language-not-supported'].includes(reason);
            if (pendingUri && !voiceOff) {
                askToReadPendingAgain(reason === 'no-speech' || reason === 'speech-timeout'
                    ? 'I did not hear an answer.'
                    : 'Sorry, something went wrong while listening.');
            }
            else if (voiceOff) {
                setVoiceUnavailable(true);
                say(VOICE_UNAVAILABLE);
            }
            else if (reason === 'no-speech' || reason === 'speech-timeout') {
                say('I did not hear a question.');
            }
            else {
                say('Sorry, something went wrong while listening. Please try again.');
            }
        },
    });

    // The one main action: stop anything being said and listen for a question.
    // Tapping again while listening finishes the question early.
    const toggleAsk = () => {
        if (voice.isListening) {
            voice.stop();
            return;
        }
        handleStopSpeaking();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        voice.listen();
    };

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
          <View accessible accessibilityRole="header" accessibilityLabel={`Picture taken. ${voice.isListening ? 'Listening. Say yes or no.' : 'Read this document?'}`}>
            <ThemedText style={styles.confirmTitle}>Picture taken</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.confirmSubtitle}>
              {voice.isListening ? 'Listening… say yes or no' : 'Read this document?'}
            </ThemedText>
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
        <Pressable accessibilityRole="button" accessibilityLabel={voice.isListening && !readerOpen ? 'Listening' : 'Speak'} accessibilityHint="Then say: scan a document" onPress={toggleAsk} style={({ pressed }) => [styles.homeButton, styles.speakButton, pressed && styles.pressed]}>
          <SymbolView name={{ ios: 'mic.fill', android: 'mic', web: 'mic' }} tintColor="#FFFFFF" size={96}/>
          <ThemedText style={[styles.homeButtonText, { color: '#FFFFFF' }]}>
            {voice.isListening && !readerOpen ? 'Listening…' : 'Speak'}
          </ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={isReading ? 'Reading document' : 'Take a picture'} accessibilityHint="Opens the document scanner" accessibilityState={{ busy: isReading, disabled: isReading }} disabled={isReading} onPress={scanDocument} style={({ pressed }) => [styles.homeButton, styles.cameraButton, pressed && styles.pressed]}>
          <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'camera' }} tintColor="#173B3F" size={96}/>
          <ThemedText style={[styles.homeButtonText, { color: '#173B3F' }]}>
            {isReading ? 'Reading...' : 'Take picture'}
          </ThemedText>
          {ocrError && <ThemedText style={styles.ocrError}>{ocrError}</ThemedText>}
        </Pressable>
      </View>)}

      <Modal animationType="slide" visible={readerOpen} onRequestClose={closeReader}>
        {/* VoiceOver: two-finger double tap (Magic Tap) asks a question from
            anywhere, and the two-finger "Z" scrub closes the reader. */}
        <View accessibilityViewIsModal onMagicTap={toggleAsk} onAccessibilityEscape={closeReader} style={[
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

          <Pressable accessibilityRole="button" accessibilityLabel="Scan a new document" accessibilityHint="Closes this document and opens the scanner" onPress={() => runCommand({ type: 'scan' })} style={({ pressed }) => [styles.scanNewButton, pressed && styles.pressed]}>
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
