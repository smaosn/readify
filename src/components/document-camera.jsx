import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CommonResolutions, useCameraDevice, useCameraPermission, useFrameOutput, usePhotoOutput } from 'react-native-vision-camera';
import { useTextRecognition } from 'react-native-vision-camera-mlkit';
import { scheduleOnRN } from 'react-native-worklets';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { cueFeedback, holdStillFeedback, photoTakenFeedback, problemFeedback } from '@/services/feedback';
import { analyzeFraming, createFramingCoach, FRAMING_CUES } from '@/services/framing';
import { speak } from '@/services/speech';

const INTRO = 'Camera on. Hold your phone flat over the page, screen facing up, about one foot above it. ' +
    'I will tell you how to move it, and take the photo when the whole page is in view.';
const PERMISSION_MESSAGE = 'Readify needs the camera to take photos of documents. You can turn on camera access for Readify in Settings.';
const CAMERA_FAILED = 'The camera stopped working. Please try again.';
const CAPTURE_FAILED = 'The photo could not be taken. Please hold still and I will try again.';

// Passed by reference so the recognizer isn't recreated on every render.
const TEXT_RECOGNITION_OPTIONS = { language: 'LATIN' };

// What the live check looks at. 1440 x 1920 is enough for ML Kit to find
// normal-sized body text on a full page; much lower and small print is
// missed, so the page could be judged "in view" with its footer cut off.
const ANALYSIS_RESOLUTION = CommonResolutions.FHD_4_3;
// Same 4:3 shape as the analysis frames, so the photo shows the same view
// the guidance was based on.
const PHOTO_RESOLUTION = CommonResolutions.UHD_4_3;

// Reading text takes longer than one camera frame, so frames that arrive
// while the last one is still being read are skipped on purpose. Without this
// handler VisionCamera logs a "Frame Dropped" warning for every one of them.
const ignoreDroppedFrame = () => { };

const STATUS_TEXT = {
    none: 'Looking for writing…',
    further: 'Move further away',
    closer: 'Move closer',
    left: 'Move left',
    right: 'Move right',
    forward: 'Move forward',
    back: 'Move back',
    ready: 'Hold still…',
};

/**
 * Full-screen camera that talks the user into framing the whole document,
 * then takes exactly one photo by itself.
 *
 * @param {{
 *   visible: boolean,
 *   onCapture: (uri: string) => void,
 *   onCancel: () => void,
 *   onError: (message: string) => void,
 * }} props
 */
export function DocumentCamera({ visible, onCapture, onCancel, onError }) {
    return (<Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      {/* Mounted only while open, so every visit starts fresh. */}
      {visible && <CameraScreen onCapture={onCapture} onCancel={onCancel} onError={onError}/>}
    </Modal>);
}

function CameraScreen({ onCapture, onCancel, onError }) {
    const insets = useSafeAreaInsets();
    const device = useCameraDevice('back');
    const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
    const photoOutput = usePhotoOutput({ targetResolution: PHOTO_RESOLUTION, qualityPrioritization: 'quality' });
    const { textRecognition } = useTextRecognition(TEXT_RECOGNITION_OPTIONS);
    const [coach] = useState(createFramingCoach);
    const [status, setStatus] = useState('none');
    const [isCapturing, setIsCapturing] = useState(false);
    // Set once a photo is on its way, so only one is ever taken.
    const capturedRef = useRef(false);
    // Cues wait until the opening instructions have been said.
    const introPlayingRef = useRef(true);

    useEffect(() => {
        const finished = () => {
            introPlayingRef.current = false;
        };
        speak(INTRO, { onDone: finished, onStopped: finished, onError: finished });
    }, []);

    // Latest onError without re-running the permission request when the
    // parent passes a new function.
    const onErrorRef = useRef(onError);
    useEffect(() => {
        onErrorRef.current = onError;
    });
    useEffect(() => {
        if (hasPermission) {
            return;
        }
        if (canRequestPermission) {
            requestPermission().then((granted) => {
                if (!granted) {
                    onErrorRef.current(PERMISSION_MESSAGE);
                }
            });
        }
        else {
            onErrorRef.current(PERMISSION_MESSAGE);
        }
    }, [hasPermission, canRequestPermission, requestPermission]);

    const takePhoto = async () => {
        if (capturedRef.current) {
            return;
        }
        capturedRef.current = true;
        setIsCapturing(true);
        try {
            // Buzz the moment the picture is taken, not after it's saved; if
            // the camera never reports that moment, buzz once it's saved.
            let buzzed = false;
            const onDidCapturePhoto = () => {
                buzzed = true;
                photoTakenFeedback();
            };
            const file = await photoOutput.capturePhotoToFile({ flashMode: 'off', enableShutterSound: true }, { onDidCapturePhoto });
            if (!buzzed) {
                photoTakenFeedback();
            }
            onCapture(file.filePath.startsWith('file://') ? file.filePath : `file://${file.filePath}`);
        }
        catch {
            capturedRef.current = false;
            setIsCapturing(false);
            problemFeedback();
            speak(CAPTURE_FAILED);
        }
    };

    const handleFrame = (frame) => {
        if (capturedRef.current) {
            return;
        }
        const result = analyzeFraming(frame);
        setStatus(result);
        const { say, capture } = coach.update(result, Date.now(), !introPlayingRef.current);
        if (capture) {
            takePhoto();
            return;
        }
        if (say) {
            if (say === 'ready') {
                holdStillFeedback();
            }
            else {
                cueFeedback();
            }
            speak(FRAMING_CUES[say]);
        }
    };
    // The frame worklet keeps a stable function to call back into, which
    // always runs the latest handleFrame.
    const handleFrameRef = useRef(handleFrame);
    useEffect(() => {
        handleFrameRef.current = handleFrame;
    });
    const onFrameResult = useCallback((frame) => handleFrameRef.current(frame), []);

    const onFrame = useCallback((frame) => {
        'worklet';
        try {
            const result = textRecognition(frame, { outputOrientation: 'portrait' });
            const lines = [];
            for (const block of result.blocks) {
                for (const line of block.lines) {
                    // Built from the centre and size because on iOS the
                    // plugin reports top/bottom swapped (flipped y-axis);
                    // centre and size are correct on both platforms.
                    const { centerX, centerY, width, height } = line.bounds;
                    lines.push({
                        left: centerX - width / 2,
                        top: centerY - height / 2,
                        right: centerX + width / 2,
                        bottom: centerY + height / 2,
                    });
                }
            }
            scheduleOnRN(onFrameResult, { lines, width: frame.width, height: frame.height });
        }
        catch {
            // Skip a frame that couldn't be read; the next one will be.
        }
        finally {
            frame.dispose();
        }
    }, [textRecognition, onFrameResult]);
    const frameOutput = useFrameOutput({ targetResolution: ANALYSIS_RESOLUTION, pixelFormat: 'yuv', onFrame, onFrameDropped: ignoreDroppedFrame });

    return (<View accessibilityViewIsModal onAccessibilityEscape={onCancel} onMagicTap={takePhoto} style={styles.screen}>
      {hasPermission && device && (<Camera style={StyleSheet.absoluteFill} device={device} isActive outputs={[photoOutput, frameOutput]} constraints={[{ resolutionBias: photoOutput }]} onError={() => onError(CAMERA_FAILED)}/>)}

      <View style={[styles.overlay, { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close camera" accessibilityHint="Goes back without taking a photo" onPress={onCancel} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <ThemedText style={styles.closeText}>Close</ThemedText>
        </Pressable>

        {/* Spoken aloud already, so not announced again by the screen reader. */}
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.statusCard}>
          <ThemedText style={styles.statusText}>{isCapturing ? 'Taking photo…' : STATUS_TEXT[status]}</ThemedText>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Take photo now" accessibilityHint="Takes the photo straight away instead of waiting for the page to be lined up" accessibilityState={{ disabled: isCapturing }} disabled={isCapturing} onPress={takePhoto} style={({ pressed }) => [styles.shutterButton, pressed && styles.pressed]}>
          <ThemedText style={styles.shutterText}>Take photo now</ThemedText>
        </Pressable>
      </View>
    </View>);
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#000000',
    },
    overlay: {
        flex: 1,
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.three,
    },
    pressed: {
        opacity: 0.72,
    },
    closeButton: {
        alignSelf: 'flex-start',
        minHeight: 64,
        minWidth: 120,
        borderRadius: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.four,
    },
    closeText: {
        color: '#FFFFFF',
        fontSize: 24,
        lineHeight: 30,
        fontWeight: '800',
    },
    statusCard: {
        alignSelf: 'center',
        borderRadius: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.three,
    },
    statusText: {
        color: '#FFFFFF',
        fontSize: 34,
        lineHeight: 42,
        fontWeight: '800',
        textAlign: 'center',
    },
    shutterButton: {
        minHeight: 110,
        borderRadius: 28,
        backgroundColor: '#F5C36A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    shutterText: {
        color: '#173B3F',
        fontSize: 30,
        lineHeight: 38,
        fontWeight: '800',
    },
});
