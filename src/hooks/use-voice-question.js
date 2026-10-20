import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useRef, useState } from 'react';

// Words the recognizer should favour, so short commands aren't misheard.
const CONTEXTUAL_STRINGS = [
    'due date',
    'amount due',
    'how much do I owe',
    'read everything',
    'repeat',
    'stop',
    'help',
    'scan a new document',
];

/**
 * Listens for one spoken question at a time. Calls `onResult` with the
 * recognizer's guesses (best first) or `onError` with a reason such as
 * 'no-speech' or 'not-allowed'. Every listen ends in exactly one of the two.
 *
 * @param {{ onResult: (transcripts: string[]) => void, onError: (reason: string) => void }} handlers
 */
export function useVoiceQuestion({ onResult, onError }) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    // Set once this listen has reported a result or error, so the trailing
    // 'end' event doesn't report it a second time.
    const settledRef = useRef(true);

    const settle = (report) => {
        if (settledRef.current) {
            return;
        }
        settledRef.current = true;
        report();
    };

    useSpeechRecognitionEvent('result', (event) => {
        const transcripts = event.results.map((result) => result.transcript.trim()).filter(Boolean);
        setTranscript(transcripts[0] ?? '');
        if (event.isFinal) {
            settle(() => (transcripts.length > 0 ? onResult(transcripts) : onError('no-speech')));
        }
    });
    useSpeechRecognitionEvent('nomatch', () => settle(() => onError('no-speech')));
    useSpeechRecognitionEvent('error', (event) => {
        // 'aborted' only happens when we cancel on purpose.
        if (event.error === 'aborted') {
            settledRef.current = true;
            return;
        }
        settle(() => onError(event.error));
    });
    useSpeechRecognitionEvent('end', () => {
        setIsListening(false);
        settle(() => onError('no-speech'));
    });

    const listen = async () => {
        if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
            onError('unavailable');
            return;
        }
        const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!permission.granted) {
            onError('not-allowed');
            return;
        }
        settledRef.current = false;
        setTranscript('');
        setIsListening(true);
        ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            continuous: false,
            maxAlternatives: 3,
            contextualStrings: CONTEXTUAL_STRINGS,
            // The default iOS 'measurement' mode makes speech played
            // afterwards very quiet; keep normal volume through the speaker.
            iosCategory: {
                category: 'playAndRecord',
                categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
                mode: 'default',
            },
        });
    };

    // Stops listening but still reports whatever was heard so far.
    const stop = () => ExpoSpeechRecognitionModule.stop();

    // Stops listening and discards the question.
    const cancel = () => {
        settledRef.current = true;
        setIsListening(false);
        ExpoSpeechRecognitionModule.abort();
    };

    return { isListening, transcript, listen, stop, cancel };
}
