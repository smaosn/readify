import { CameraView, useCameraPermissions } from 'expo-camera';
import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAnswer } from '@/services/answers';
import { documentToSpeech, structureDocument } from '@/services/document';
import { extractField } from '@/services/extractor';
import { recognizeDocumentText } from '@/services/ocr';
import { speak, stopSpeaking } from '@/services/speech';

const FIELD_LABELS = {
    amountDue: 'Amount due',
    dueDate: 'Due date',
};

export default function HomeScreen() {
    const insets = useSafeAreaInsets();
    const theme = useTheme();
    const cameraRef = useRef(null);
    const [permission, requestPermission] = useCameraPermissions();
    const [cameraOpen, setCameraOpen] = useState(false);
    const [capturedUri, setCapturedUri] = useState(null);
    const [recognizedText, setRecognizedText] = useState(null);
    const [isReading, setIsReading] = useState(false);
    const [ocrError, setOcrError] = useState(null);
    const [answerMode, setAnswerMode] = useState('short');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [fieldAnswer, setFieldAnswer] = useState(null);
    const documentBlocks = useMemo(() => structureDocument(recognizedText), [recognizedText]);
    const startListening = () => {
        // TODO: hook up speech recognition (e.g. expo-speech-recognition).
        speak('Voice commands are not available yet. Use the take picture button below to scan a document.');
    };
    const openCamera = async () => {
        if (!permission?.granted) {
            const response = await requestPermission();
            if (!response.granted) {
                return;
            }
        }
        setCameraOpen(true);
    };
    const captureDocument = async () => {
        const picture = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
        if (picture?.uri) {
            setCapturedUri(picture.uri);
        }
    };
    const closeCamera = () => {
        setCameraOpen(false);
        setCapturedUri(null);
    };
    const readDocument = async () => {
        if (!capturedUri)
            return;
        setIsReading(true);
        setOcrError(null);
        try {
            const text = await recognizeDocumentText(capturedUri);
            setFieldAnswer(null);
            setRecognizedText(text || 'No text was detected. Try taking another photo with better lighting.');
            closeCamera();
            AccessibilityInfo.announceForAccessibility(text
                ? 'Document ready. The read aloud button is at the top of the screen.'
                : 'No text was detected. Try taking another photo with better lighting.');
        }
        catch {
            setOcrError('We could not read this image. Try retaking the photo with the document in focus.');
        }
        finally {
            setIsReading(false);
        }
    };
    const closeReader = () => {
        stopSpeaking();
        setIsSpeaking(false);
        setFieldAnswer(null);
        setRecognizedText(null);
    };
    const handleStopSpeaking = () => {
        stopSpeaking();
        setIsSpeaking(false);
    };
    const readWholePage = () => {
        if (!recognizedText)
            return;
        setIsSpeaking(true);
        speak(documentToSpeech(documentBlocks) || recognizedText, {
            onDone: () => setIsSpeaking(false),
            onStopped: () => setIsSpeaking(false),
            onError: () => setIsSpeaking(false),
        });
    };
    const handleField = (field) => {
        if (!recognizedText)
            return;
        const result = extractField(recognizedText, field);
        let spokenText;
        let displayText;
        if (result.value === null) {
            spokenText = 'I could not find that clearly. Please scan again.';
            displayText = spokenText;
        }
        else {
            const phrased = formatAnswer(field, result.value, answerMode);
            displayText = phrased;
            spokenText =
                result.confidence === 'low'
                    ? `${phrased} I am not fully sure about this one, please check it.`
                    : phrased;
        }
        setFieldAnswer({ field, text: displayText, confidence: result.confidence });
        AccessibilityInfo.announceForAccessibility(spokenText);
        setIsSpeaking(true);
        speak(spokenText, {
            onDone: () => setIsSpeaking(false),
            onStopped: () => setIsSpeaking(false),
            onError: () => setIsSpeaking(false),
        });
    };
    return (<ThemedView style={styles.container}>
      <View style={[
            styles.homeButtons,
            {
                paddingTop: Math.max(insets.top, Spacing.three),
                paddingBottom: insets.bottom + BottomTabInset + Spacing.three,
            },
        ]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Start speaking" accessibilityHint="Ask Readify a question with your voice" onPress={startListening} style={({ pressed }) => [styles.homeButton, styles.speakButton, pressed && styles.pressed]}>
          <SymbolView name={{ ios: 'mic.fill', android: 'mic', web: 'mic' }} tintColor="#FFFFFF" size={96}/>
          <ThemedText style={[styles.homeButtonText, { color: '#FFFFFF' }]}>Speak</ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Take a picture" accessibilityHint="Opens the camera to scan a document" onPress={openCamera} style={({ pressed }) => [styles.homeButton, styles.cameraButton, pressed && styles.pressed]}>
          <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'camera' }} tintColor="#173B3F" size={96}/>
          <ThemedText style={[styles.homeButtonText, { color: '#173B3F' }]}>Take picture</ThemedText>
        </Pressable>
      </View>

      <Modal animationType="slide" presentationStyle="fullScreen" visible={cameraOpen}>
        <ThemedView style={styles.cameraScreen}>
          {capturedUri ? (<View style={[
                styles.previewContainer,
                {
                    paddingTop: insets.top + Spacing.two,
                    paddingBottom: insets.bottom + Spacing.three,
                    paddingLeft: insets.left + Spacing.four,
                    paddingRight: insets.right + Spacing.four,
                },
            ]}>
              <View style={styles.previewHeader}>
                <Pressable accessibilityLabel="Retake document photo" accessibilityRole="button" onPress={() => setCapturedUri(null)} style={({ pressed }) => [styles.cameraCloseButton, pressed && styles.pressed]}>
                  <SymbolView name={{ ios: 'arrow.counterclockwise', android: 'refresh', web: 'refresh' }} tintColor="#FFFFFF" size={21}/>
                </Pressable>
                <ThemedText style={styles.cameraTitle}>Check your document</ThemedText>
                <Pressable accessibilityLabel="Close document scanner" accessibilityRole="button" onPress={closeCamera} style={({ pressed }) => [styles.cameraCloseButton, pressed && styles.pressed]}>
                  <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor="#FFFFFF" size={21}/>
                </Pressable>
              </View>
              <Image source={{ uri: capturedUri }} style={styles.previewImage} resizeMode="contain"/>
              <View style={styles.previewActions}>
                <ThemedText style={styles.previewHint}>Make sure all the text is in focus.</ThemedText>
                <Pressable accessibilityLabel="Use this document" accessibilityRole="button" disabled={isReading} onPress={readDocument} style={({ pressed }) => [styles.usePhotoButton, pressed && styles.pressed]}>
                  <ThemedText style={styles.usePhotoText}>
                    {isReading ? 'Reading document...' : 'Read this document'}
                  </ThemedText>
                </Pressable>
                {ocrError && <ThemedText style={styles.ocrError}>{ocrError}</ThemedText>}
              </View>
            </View>) : (<View style={styles.cameraContainer}>
              <CameraView ref={cameraRef} style={styles.camera} facing="back" mode="picture"/>
              <View style={[
                styles.cameraOverlay,
                {
                    paddingTop: insets.top + Spacing.two,
                    paddingBottom: insets.bottom + Spacing.four,
                    paddingLeft: insets.left,
                    paddingRight: insets.right,
                },
            ]} pointerEvents="box-none">
                <View style={styles.cameraHeader}>
                  <ThemedText style={styles.cameraTitle}>Scan a document</ThemedText>
                  <Pressable accessibilityLabel="Close document scanner" accessibilityRole="button" onPress={closeCamera} style={({ pressed }) => [styles.cameraCloseButton, pressed && styles.pressed]}>
                    <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor="#FFFFFF" size={21}/>
                  </Pressable>
                </View>
                <View style={styles.scanFrame}/>
                <ThemedText style={styles.cameraHint}>Fit the whole document inside the frame</ThemedText>
                <Pressable accessibilityLabel="Take document photo" accessibilityRole="button" onPress={captureDocument} style={({ pressed }) => [styles.shutterButton, pressed && styles.pressed]}>
                  <View style={styles.shutterInner}/>
                </Pressable>
              </View>
            </View>)}
        </ThemedView>
      </Modal>

      <Modal animationType="slide" visible={recognizedText !== null}>
        <View style={[
            styles.readerScreen,
            {
                backgroundColor: theme.background,
                paddingTop: insets.top,
                paddingLeft: insets.left + Spacing.four,
                paddingRight: insets.right + Spacing.four,
            },
        ]}>
          <View style={styles.readerHeader}>
            <View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
                DOCUMENT TEXT
              </ThemedText>
              <ThemedText style={styles.readerTitle}>Your document</ThemedText>
            </View>
            <Pressable accessibilityLabel="Close reading view" accessibilityRole="button" onPress={closeReader} style={({ pressed }) => [styles.readerCloseButton, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor={theme.text} size={21}/>
            </Pressable>
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel={isSpeaking ? 'Stop reading' : 'Read aloud'} accessibilityHint={isSpeaking ? 'Stops the voice reading immediately' : 'Reads the whole document out loud'} onPress={isSpeaking ? handleStopSpeaking : readWholePage} style={({ pressed }) => [styles.readAloudButton, isSpeaking && styles.readAloudButtonStop, pressed && styles.pressed]}>
            <SymbolView name={isSpeaking
            ? { ios: 'stop.fill', android: 'stop', web: 'stop' }
            : { ios: 'speaker.wave.2.fill', android: 'volume_up', web: 'volume_up' }} tintColor="#FFFFFF" size={28}/>
            <ThemedText style={styles.readAloudText}>{isSpeaking ? 'Stop reading' : 'Read aloud'}</ThemedText>
          </Pressable>

          <ScrollView contentContainerStyle={[styles.readerContent, { paddingBottom: insets.bottom + Spacing.six }]} accessibilityLabel="Recognized document text">
            <ThemedView type="backgroundElement" style={styles.askSection}>
              <ThemedText style={styles.askSectionTitle}>Ask about this document</ThemedText>

              <View style={styles.toggleRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  Answer length
                </ThemedText>
                <Pressable accessibilityRole="switch" accessibilityLabel="Answer length" accessibilityState={{ checked: answerMode === 'full' }} accessibilityValue={{ text: answerMode === 'short' ? 'Short answer' : 'Full answer' }} accessibilityHint="Double tap to switch between a short answer and a full sentence" onPress={() => setAnswerMode((mode) => (mode === 'short' ? 'full' : 'short'))} style={({ pressed }) => [styles.toggleTrack, { backgroundColor: theme.background }, pressed && styles.pressed]}>
                  <View style={[styles.toggleOption, answerMode === 'short' && { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText type="smallBold" style={styles.toggleOptionText}>
                      Short answer
                    </ThemedText>
                  </View>
                  <View style={[styles.toggleOption, answerMode === 'full' && { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText type="smallBold" style={styles.toggleOptionText}>
                      Full answer
                    </ThemedText>
                  </View>
                </Pressable>
              </View>

              <View style={styles.fieldButtonRow}>
                <Pressable accessibilityRole="button" accessibilityLabel="Amount due" accessibilityHint="Finds and speaks the amount you owe on this document" onPress={() => handleField('amountDue')} style={({ pressed }) => [styles.fieldButton, pressed && styles.pressed]}>
                  <SymbolView name={{ ios: 'dollarsign.circle.fill', android: 'attach_money', web: 'attach_money' }} tintColor="#FFFFFF" size={22}/>
                  <ThemedText style={styles.fieldButtonText}>Amount due</ThemedText>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Due date" accessibilityHint="Finds and speaks the date this bill is due" onPress={() => handleField('dueDate')} style={({ pressed }) => [styles.fieldButton, pressed && styles.pressed]}>
                  <SymbolView name={{ ios: 'calendar', android: 'event', web: 'event' }} tintColor="#FFFFFF" size={22}/>
                  <ThemedText style={styles.fieldButtonText}>Due date</ThemedText>
                </Pressable>
              </View>

              {fieldAnswer && (
                <ThemedView style={[styles.answerCard, fieldAnswer.confidence === 'low' && styles.answerCardLow]} accessibilityLabel={`${FIELD_LABELS[fieldAnswer.field]}: ${fieldAnswer.text}`}>
                  <ThemedText style={[styles.answerText, fieldAnswer.confidence === 'low' && styles.answerTextLow]}>{fieldAnswer.text}</ThemedText>
                </ThemedView>
              )}
            </ThemedView>

            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.rawTextLabel}>
              DOCUMENT
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.documentCard}>
              {documentBlocks.map((block, index) => {
                if (block.type === 'heading') {
                    return (<ThemedText key={index} accessibilityRole="header" style={styles.docHeading}>
                      {block.text}
                    </ThemedText>);
                }
                if (block.type === 'fields') {
                    return (<View key={index} style={styles.docFields}>
                      {block.items.map((item, itemIndex) => (<View key={itemIndex} style={[styles.docField, itemIndex > 0 && { borderTopColor: theme.backgroundSelected, borderTopWidth: 1 }]}>
                          <ThemedText type="small" themeColor="textSecondary" style={styles.docFieldLabel}>
                            {item.label}
                          </ThemedText>
                          <ThemedText style={styles.docFieldValue}>{item.value}</ThemedText>
                        </View>))}
                    </View>);
                }
                return (<ThemedText key={index} style={styles.docParagraph}>
                    {block.lines.join('\n')}
                  </ThemedText>);
            })}
            </ThemedView>
          </ScrollView>
        </View>
      </Modal>
    </ThemedView>);
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    eyebrow: {
        fontSize: 11,
        lineHeight: 16,
        letterSpacing: 1.2,
        fontWeight: '700',
    },
    pressed: {
        opacity: 0.72,
    },
    cameraScreen: {
        flex: 1,
        backgroundColor: '#101A1B',
    },
    cameraContainer: {
        flex: 1,
        position: 'relative',
    },
    camera: {
        flex: 1,
    },
    cameraOverlay: {
        ...StyleSheet.absoluteFill,
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cameraHeader: {
        width: '100%',
        paddingHorizontal: Spacing.four,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cameraTitle: {
        color: '#FFFFFF',
        fontSize: 19,
        lineHeight: 25,
        fontWeight: '700',
    },
    cameraCloseButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(16, 26, 27, 0.7)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scanFrame: {
        width: '78%',
        aspectRatio: 0.7,
        maxHeight: '55%',
        borderWidth: 2,
        borderColor: '#FFFFFF',
        borderRadius: 16,
    },
    cameraHint: {
        color: '#FFFFFF',
        backgroundColor: 'rgba(16, 26, 27, 0.7)',
        borderRadius: 12,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        overflow: 'hidden',
    },
    shutterButton: {
        width: 78,
        height: 78,
        borderRadius: 39,
        borderWidth: 5,
        borderColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    shutterInner: {
        width: 62,
        height: 62,
        borderRadius: 31,
        backgroundColor: '#FFFFFF',
    },
    previewContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.four,
    },
    previewImage: {
        width: '100%',
        flex: 1,
    },
    previewHeader: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    previewActions: {
        width: '100%',
        alignItems: 'center',
        gap: Spacing.three,
    },
    previewHint: {
        color: '#B9C9C8',
        textAlign: 'center',
    },
    usePhotoButton: {
        minHeight: 56,
        alignSelf: 'stretch',
        borderRadius: 16,
        backgroundColor: '#D9EEE7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    usePhotoText: {
        color: '#173B3F',
        fontSize: 16,
        lineHeight: 22,
        fontWeight: '700',
    },
    ocrError: {
        color: '#F2A494',
        textAlign: 'center',
    },
    readerScreen: {
        flex: 1,
    },
    readerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: Spacing.three,
    },
    readerTitle: {
        fontSize: 29,
        lineHeight: 35,
        fontWeight: '700',
    },
    readerCloseButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    readerContent: {
        paddingTop: Spacing.three,
    },
    askSection: {
        borderRadius: 20,
        padding: Spacing.four,
        gap: Spacing.four,
    },
    rawTextLabel: {
        marginTop: Spacing.five,
        fontSize: 12,
        letterSpacing: 1,
    },
    askSectionTitle: {
        fontSize: 19,
        lineHeight: 26,
        fontWeight: '700',
    },
    toggleRow: {
        gap: Spacing.two,
    },
    toggleTrack: {
        flexDirection: 'row',
        minHeight: 48,
        borderRadius: 14,
        padding: Spacing.half,
        gap: Spacing.half,
    },
    toggleOption: {
        flex: 1,
        minHeight: 44,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.two,
    },
    toggleOptionText: {
        fontSize: 14,
        lineHeight: 20,
    },
    fieldButtonRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.three,
    },
    fieldButton: {
        flexGrow: 1,
        flexBasis: 140,
        minHeight: 56,
        borderRadius: 16,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        backgroundColor: '#173B3F',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.two,
    },
    fieldButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        lineHeight: 22,
        fontWeight: '700',
        flexShrink: 1,
    },
    answerCard: {
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#B9DDD1',
        padding: Spacing.four,
    },
    answerCardLow: {
        borderColor: '#9A6414',
        backgroundColor: '#F9E7B7',
    },
    answerText: {
        fontSize: 26,
        lineHeight: 34,
        fontWeight: '700',
    },
    answerTextLow: {
        color: '#3D2A06',
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
    readAloudButton: {
        minHeight: 72,
        marginBottom: Spacing.three,
        borderRadius: 20,
        backgroundColor: '#173B3F',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.three,
    },
    readAloudButtonStop: {
        backgroundColor: '#B3261E',
    },
    readAloudText: {
        color: '#FFFFFF',
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '700',
    },
    documentCard: {
        marginTop: Spacing.two,
        borderRadius: 20,
        padding: Spacing.four,
        gap: Spacing.three,
    },
    docHeading: {
        fontSize: 20,
        lineHeight: 26,
        fontWeight: '700',
        marginTop: Spacing.one,
    },
    docFields: {
        gap: 0,
    },
    docField: {
        paddingVertical: Spacing.two,
        gap: Spacing.half,
    },
    docFieldLabel: {
        fontWeight: '600',
    },
    docFieldValue: {
        fontSize: 18,
        lineHeight: 24,
        fontWeight: '700',
    },
    docParagraph: {
        fontSize: 17,
        lineHeight: 26,
    },
});
