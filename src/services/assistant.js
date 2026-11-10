// Pure logic for the reader's voice assistant: turns what the user said
// into the one thing the app should do or say next. Keeps answers short so
// the user hears only what they asked for. No React / React Native imports.

import { formatAnswer } from './answers';
import { parseCommand } from './commands';
import { extractField } from './extractor';

/**
 * @typedef {import('./commands').Command} Command
 * @typedef {{ type: 'say', speech: string, display: string }
 *   | { type: 'stop' }
 *   | { type: 'scan' }
 *   | { type: 'close' }
 *   | { type: 'delete' }} Reply
 */

const FIELD_NAMES = {
    amountDue: 'the amount due',
    dueDate: 'the due date',
};

const EXAMPLES = 'For example: what is the due date? Or: how much do I owe? You can also say: read everything.';
const FINISHING = 'When you are finished, say: I am done. Or: delete this document.';

/**
 * Speech recognizers return several guesses; use the first one that is a
 * command we understand, so a near-miss top guess doesn't lose the question.
 * @param {string[]} transcripts
 * @returns {{ command: Command, heard: string }}
 */
export function interpret(transcripts) {
    for (const transcript of transcripts) {
        const command = parseCommand(transcript);
        if (command.type !== 'unknown') {
            return { command, heard: transcript };
        }
    }
    return { command: { type: 'unknown' }, heard: transcripts[0] ?? '' };
}

/**
 * Said when a document opens. The app is already listening afterwards, so
 * the user just asks.
 * @returns {string}
 */
export function introSpeech() {
    return `Your document is ready. Ask me a question. ${EXAMPLES} ${FINISHING}`;
}

/**
 * @param {Command} command
 * @param {{ documentText: string, documentSpeech: string, lastSpeech: string | null, screenReaderOn: boolean }} context
 * @returns {Reply}
 */
export function respond(command, { documentText, documentSpeech, lastSpeech, screenReaderOn }) {
    switch (command.type) {
        case 'field': {
            const answers = command.fields.map((field) => answerField(documentText, field));
            return { type: 'say', speech: answers.join(' '), display: answers.join('\n\n') };
        }
        case 'readAll':
            return { type: 'say', speech: documentSpeech || documentText, display: documentText };
        case 'repeat':
            return lastSpeech
                ? { type: 'say', speech: lastSpeech, display: lastSpeech }
                : say(`I have not read anything out yet. ${EXAMPLES}`);
        case 'help': {
            // Voice can't interrupt the app while it talks (it would hear
            // itself), so stopping it is still a tap.
            const tap = screenReaderOn ? 'double tap the Ask button' : 'tap the big button';
            return say(
                `Ask me about this document. ${EXAMPLES} To stop me talking, ${tap}. ` +
                    `To read a different document, say: scan a new document. ${FINISHING}`
            );
        }
        case 'stop':
        case 'scan':
        case 'close':
        case 'delete':
            return { type: command.type };
        default:
            return say(`Sorry, I did not understand. ${EXAMPLES}`);
    }
}

/**
 * @param {string} documentText
 * @param {'amountDue' | 'dueDate'} field
 * @returns {string}
 */
function answerField(documentText, field) {
    const result = extractField(documentText, field);
    if (result.value === null) {
        return `I could not find ${FIELD_NAMES[field]} on this document. Try scanning it again, or say: read everything.`;
    }
    const phrased = formatAnswer(field, result.value, 'full');
    return result.confidence === 'low' ? `${phrased} I am not fully sure about this one, please check it.` : phrased;
}

function say(text) {
    return { type: 'say', speech: text, display: text };
}
