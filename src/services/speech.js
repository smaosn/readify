import * as Speech from 'expo-speech';

// NOTE (iOS): expo-speech plays through the "silent switch" media channel,
// so the phone must not be in silent/mute mode or no sound will be heard.

/**
 * Speaks the given text out loud. If something is already being spoken,
 * it is stopped first so speech never overlaps.
 * @param {string} text
 * @param {{ onStart?: () => void, onDone?: () => void, onStopped?: () => void, onError?: () => void }} [callbacks]
 */
export function speak(text, callbacks = {}) {
    Speech.stop();
    Speech.speak(text, {
        onStart: callbacks.onStart,
        onDone: callbacks.onDone,
        onStopped: callbacks.onStopped,
        onError: callbacks.onError,
    });
}

export function stopSpeaking() {
    Speech.stop();
}
