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
    // Android rejects utterances over Speech.maxSpeechInputLength (~4000
    // chars), so long documents are queued as several smaller chunks.
    const chunks = splitIntoChunks(text, MAX_CHUNK_LENGTH);
    if (chunks.length === 0) {
        callbacks.onDone?.();
        return;
    }
    chunks.forEach((chunk, index) => {
        const isFirst = index === 0;
        const isLast = index === chunks.length - 1;
        Speech.speak(chunk, {
            onStart: isFirst ? callbacks.onStart : undefined,
            onDone: isLast ? callbacks.onDone : undefined,
            onStopped: callbacks.onStopped,
            onError: callbacks.onError,
        });
    });
}

const MAX_CHUNK_LENGTH = 3000;

function splitIntoChunks(text, maxLength) {
    const chunks = [];
    let remaining = text;
    while (remaining.length > maxLength) {
        const slice = remaining.slice(0, maxLength);
        // Prefer breaking after a sentence, then at a space.
        const breakAt = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'));
        const cut = breakAt > 0 ? breakAt + 1 : slice.lastIndexOf(' ') > 0 ? slice.lastIndexOf(' ') : maxLength;
        chunks.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut);
    }
    if (remaining.trim()) {
        chunks.push(remaining.trim());
    }
    return chunks;
}

export function stopSpeaking() {
    Speech.stop();
}
