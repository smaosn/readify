import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

// Every vibration the app makes, in one place so they're easy to tune.
//
// Two kinds of vibration:
// - Haptics (expo-haptics) are short taps from the Taptic Engine. Good for
//   small "something happened" signals, but subtle, and on iPhone they only
//   work when Settings > Sounds & Haptics > System Haptics is on.
// - Vibration (React Native) is the phone's full buzz, like a phone call:
//   much easier to notice, so it marks the important moments. On iPhone each
//   buzz is a fixed ~0.4 s and pattern numbers are the pauses between buzzes;
//   on Android the pattern is [wait, buzz, wait, buzz, ...] in milliseconds.
//
// iOS mutes both while the microphone is recording, so nothing here is used
// for moments when Readify is listening.

function buzz({ ios, android }) {
    if (Platform.OS === 'web') {
        return;
    }
    Vibration.vibrate(Platform.OS === 'ios' ? ios : android);
}

/** A camera instruction ("move left") was spoken. */
export function cueFeedback() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** The page is lined up: "Hold still". Firmer than an instruction. */
export function holdStillFeedback() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

/** The photo was just taken: one long, strong buzz. */
export function photoTakenFeedback() {
    buzz({ ios: [0], android: 600 });
}

/** The photo was unclear, or something went wrong: two buzzes. */
export function problemFeedback() {
    buzz({ ios: [0, 250], android: [0, 300, 200, 300] });
}

/**
 * Readify has finished talking and the microphone is opening: "your turn".
 * Played just before recording starts, because iOS mutes vibration while
 * recording.
 */
export function yourTurnFeedback() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** A spoken command was understood, or a button was pressed. */
export function tapFeedback() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}
