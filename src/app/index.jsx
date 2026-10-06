import { CameraView, useCameraPermissions } from 'expo-camera';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAnswer } from '@/services/answers';
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
        speak(recognizedText, {
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
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[
            styles.content,
            {
                paddingTop: Math.max(insets.top, Spacing.three),
                paddingBottom: insets.bottom + BottomTabInset + Spacing.five,
            },
        ]}>
          <View style={styles.header}>
            <View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
                YOUR READING SPACE
              </ThemedText>
              <ThemedText style={styles.greeting}>Good morning</ThemedText>
            </View>
            <Pressable accessibilityLabel="Open accessibility settings" accessibilityRole="button" style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}>
              <ThemedText style={styles.profileInitial}>A</ThemedText>
            </Pressable>
          </View>

          <ThemedView style={styles.heroCard}>
            <View style={styles.heroCopy}>
              <View style={styles.heroIcon}>
                <SymbolView name={{ ios: 'viewfinder', android: 'center_focus_strong', web: 'scan' }} tintColor="#173B3F" size={25}/>
              </View>
              <ThemedText style={styles.heroTitle}>Make any page easier to read.</ThemedText>
              <ThemedText style={styles.heroBody}>
                Scan a bill or document and Readify will bring the important details into focus.
              </ThemedText>
            </View>
            <Pressable accessibilityLabel="Scan a document" accessibilityRole="button" onPress={openCamera} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'camera' }} tintColor="#FFFFFF" size={19}/>
              <ThemedText style={styles.primaryButtonText}>Scan a document</ThemedText>
              <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_right' }} tintColor="#FFFFFF" size={17}/>
            </Pressable>
          </ThemedView>

          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Pick up where you left off</ThemedText>
            <Pressable accessibilityRole="button">
              <ThemedText style={styles.seeAll}>See all</ThemedText>
            </Pressable>
          </View>

          <Pressable accessibilityLabel="Open electricity bill" accessibilityRole="button" style={({ pressed }) => [styles.documentRow, pressed && styles.pressed]}>
            <View style={styles.documentIcon}>
              <SymbolView name={{ ios: 'doc.text.fill', android: 'description', web: 'description' }} tintColor="#F06A4F" size={23}/>
            </View>
            <View style={styles.documentCopy}>
              <ThemedText style={styles.documentTitle}>Electricity bill</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Last opened yesterday
              </ThemedText>
            </View>
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor={theme.textSecondary} size={18}/>
          </Pressable>

          <ThemedView type="backgroundElement" style={styles.tipCard}>
            <View style={styles.tipIcon}>
              <SymbolView name={{ ios: 'sun.max.fill', android: 'light_mode', web: 'light_mode' }} tintColor="#9A6414" size={19}/>
            </View>
            <View style={styles.tipCopy}>
              <ThemedText style={styles.tipTitle}>A calmer way to read</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                You can adjust text size, spacing, and contrast anytime.
              </ThemedText>
            </View>
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor={theme.textSecondary} size={18}/>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>

      <Modal animationType="slide" presentationStyle="fullScreen" visible={cameraOpen}>
        <ThemedView style={styles.cameraScreen}>
          {capturedUri ? (<View style={styles.previewContainer}>
              <Image source={{ uri: capturedUri }} style={styles.previewImage} resizeMode="contain"/>
              <View style={styles.previewHeader}>
                <Pressable accessibilityLabel="Retake document photo" accessibilityRole="button" onPress={() => setCapturedUri(null)} style={({ pressed }) => [styles.cameraCloseButton, pressed && styles.pressed]}>
                  <SymbolView name={{ ios: 'arrow.counterclockwise', android: 'refresh', web: 'refresh' }} tintColor="#FFFFFF" size={21}/>
                </Pressable>
                <ThemedText style={styles.cameraTitle}>Check your document</ThemedText>
                <Pressable accessibilityLabel="Close document scanner" accessibilityRole="button" onPress={closeCamera} style={({ pressed }) => [styles.cameraCloseButton, pressed && styles.pressed]}>
                  <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor="#FFFFFF" size={21}/>
                </Pressable>
              </View>
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
              <View style={styles.cameraOverlay} pointerEvents="box-none">
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
        <SafeAreaView style={styles.readerScreen}>
          <View style={styles.readerHeader}>
            <View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
                DOCUMENT TEXT
              </ThemedText>
              <ThemedText style={styles.readerTitle}>Your document</ThemedText>
            </View>
            <Pressable accessibilityLabel="Close reading view" accessibilityRole="button" onPress={closeReader} style={({ pressed }) => [styles.readerCloseButton, pressed && styles.pressed]}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor={theme.text} size={21}/>
            </Pressable>
          </View>

          {isSpeaking && (
            <Pressable accessibilityRole="button" accessibilityLabel="Stop speaking" accessibilityHint="Stops the voice reading immediately" onPress={handleStopSpeaking} style={({ pressed }) => [styles.stopBar, pressed && styles.pressed]}>
              <SymbolView name={{ ios: 'stop.fill', android: 'stop', web: 'stop' }} tintColor="#FFFFFF" size={20}/>
              <ThemedText style={styles.stopBarText}>Stop speaking</ThemedText>
            </Pressable>
          )}

          <ScrollView contentContainerStyle={styles.readerContent} accessibilityLabel="Recognized document text">
            <ThemedView type="backgroundElement" style={styles.askSection}>
              <ThemedText style={styles.askSectionTitle}>Ask about this document</ThemedText>

              <View style={styles.toggleRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  Answer length
                </ThemedText>
                <Pressable accessibilityRole="switch" accessibilityLabel="Answer length" accessibilityState={{ checked: answerMode === 'full' }} accessibilityValue={{ text: answerMode === 'short' ? 'Short answer' : 'Full answer' }} accessibilityHint="Double tap to switch between a short answer and a full sentence" onPress={() => setAnswerMode((mode) => (mode === 'short' ? 'full' : 'short'))} style={({ pressed }) => [styles.toggleTrack, pressed && styles.pressed]}>
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
                  <ThemedText style={styles.answerText}>{fieldAnswer.text}</ThemedText>
                </ThemedView>
              )}

              <Pressable accessibilityRole="button" accessibilityLabel="Read whole page" accessibilityHint="Speaks all of the text recognized on this document" onPress={readWholePage} style={({ pressed }) => [styles.readWholeButton, pressed && styles.pressed]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.readWholeText}>
                  Read whole page
                </ThemedText>
              </Pressable>
            </ThemedView>

            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.rawTextLabel}>
              FULL RECOGNIZED TEXT
            </ThemedText>
            <ThemedText style={styles.readerText}>{recognizedText}</ThemedText>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </ThemedView>);
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
        alignItems: 'center',
    },
    content: {
        alignSelf: 'stretch',
        flexGrow: 1,
        maxWidth: MaxContentWidth,
        paddingHorizontal: Spacing.four,
        gap: Spacing.four,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    eyebrow: {
        fontSize: 11,
        lineHeight: 16,
        letterSpacing: 1.2,
        fontWeight: '700',
    },
    greeting: {
        fontSize: 29,
        lineHeight: 35,
        fontWeight: '700',
    },
    profileButton: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: '#F5C36A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    profileInitial: {
        color: '#173B3F',
        fontSize: 18,
        lineHeight: 22,
        fontWeight: '700',
    },
    heroCard: {
        backgroundColor: '#D9EEE7',
        borderRadius: 24,
        padding: Spacing.four,
        gap: Spacing.four,
    },
    heroCopy: {
        gap: Spacing.two,
    },
    heroIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: '#B9DDD1',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.one,
    },
    heroTitle: {
        color: '#173B3F',
        fontSize: 30,
        lineHeight: 35,
        fontWeight: '700',
        maxWidth: 340,
    },
    heroBody: {
        color: '#426365',
        fontSize: 16,
        lineHeight: 24,
        fontWeight: '500',
        maxWidth: 390,
    },
    primaryButton: {
        minHeight: 56,
        borderRadius: 16,
        paddingHorizontal: Spacing.three,
        backgroundColor: '#173B3F',
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        lineHeight: 22,
        fontWeight: '700',
        flex: 1,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: Spacing.one,
    },
    sectionTitle: {
        fontSize: 19,
        lineHeight: 26,
        fontWeight: '700',
    },
    seeAll: {
        color: '#D45B43',
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '700',
    },
    documentRow: {
        minHeight: 82,
        borderRadius: 18,
        padding: Spacing.three,
        backgroundColor: '#FFF4EC',
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.three,
    },
    documentIcon: {
        width: 46,
        height: 46,
        borderRadius: 14,
        backgroundColor: '#FFE0D2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    documentCopy: {
        flex: 1,
        gap: Spacing.one,
    },
    documentTitle: {
        fontSize: 16,
        lineHeight: 21,
        fontWeight: '700',
    },
    tipCard: {
        borderRadius: 18,
        padding: Spacing.three,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.three,
    },
    tipIcon: {
        width: 42,
        height: 42,
        borderRadius: 13,
        backgroundColor: '#F9E7B7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    tipCopy: {
        flex: 1,
        gap: Spacing.one,
    },
    tipTitle: {
        fontSize: 15,
        lineHeight: 20,
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
        paddingTop: 56,
        paddingBottom: 40,
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
        padding: Spacing.four,
        gap: Spacing.four,
    },
    previewImage: {
        width: '100%',
        flex: 1,
    },
    previewHeader: {
        position: 'absolute',
        top: 56,
        left: Spacing.four,
        right: Spacing.four,
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
        paddingHorizontal: Spacing.four,
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
        backgroundColor: '#E5E7E6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    readerContent: {
        paddingTop: Spacing.three,
        paddingBottom: Spacing.six,
    },
    readerText: {
        fontSize: 24,
        lineHeight: 38,
        fontWeight: '500',
    },
    stopBar: {
        minHeight: 56,
        marginHorizontal: Spacing.four,
        marginBottom: Spacing.three,
        borderRadius: 16,
        backgroundColor: '#B3261E',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.two,
    },
    stopBarText: {
        color: '#FFFFFF',
        fontSize: 17,
        lineHeight: 23,
        fontWeight: '700',
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
        backgroundColor: '#E5E7E6',
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
    readWholeButton: {
        minHeight: 48,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#9AA6A5',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    readWholeText: {
        fontWeight: '600',
    },
});
