// Pure voice command parsing. Turns what the user said into a single
// action so the reader screen only does what was asked. No React / React
// Native imports here.

/**
 * @typedef {'amountDue' | 'dueDate'} Field
 * @typedef {{ type: 'stop' }
 *   | { type: 'scan' }
 *   | { type: 'close' }
 *   | { type: 'delete' }
 *   | { type: 'help' }
 *   | { type: 'repeat' }
 *   | { type: 'readAll' }
 *   | { type: 'field', fields: Field[] }
 *   | { type: 'unknown' }} Command
 */

const STOP_PHRASES = ['stop', 'quiet', 'shut up', 'pause', 'cancel', 'enough'];
const SCAN_PHRASES = [
    'scan',
    'new document',
    'another document',
    'take a picture',
    'take a photo',
    'take another',
    'new picture',
    'another picture',
    'new photo',
    'another photo',
    'open the camera',
    'open camera',
    'camera',
];
const DELETE_PHRASES = ['delete', 'remove', 'discard', 'erase', 'throw away', 'throw it away', 'get rid of'];
const CLOSE_PHRASES = [
    'close',
    'go back',
    'go home',
    'home page',
    'main menu',
    'exit',
    'quit',
    'done',
    'finished',
    "that's all",
    'thats all',
    'no more questions',
];
const HELP_PHRASES = ['help', 'what can i say', 'what can you do', 'options', 'what do i say'];
const REPEAT_PHRASES = ['repeat', 'again', 'say that', 'pardon', 'what did you say'];
const READ_ALL_PHRASES = [
    'everything',
    'whole',
    'entire',
    'all of it',
    'read all',
    'read it',
    'read the document',
    'read the page',
    'read the letter',
    'read the bill',
    'read out',
    'read aloud',
    'read this',
];

const AMOUNT_PHRASES = [
    'amount',
    'how much',
    'owe',
    'total',
    'balance',
    'cost',
    'price',
    'money',
    'dollar',
    'charge',
    'payable',
];
const DATE_PHRASES = ['date', 'when', 'deadline', 'what day', 'due by', 'pay by', 'pay before', 'last day'];

// Answers to "Do you want me to read this document?"
const CANCEL_PHRASES = [
    'cancel',
    'stop',
    'never mind',
    'nevermind',
    'go back',
    'go home',
    'forget it',
    'exit',
    'close',
    'delete',
    'discard',
];
const NO_PHRASES = [
    'no',
    'nope',
    'nah',
    'not',
    "don't",
    'retake',
    'again',
    'another',
    'new picture',
    'new one',
    'scan',
];
const YES_PHRASES = [
    'yes',
    'yeah',
    'yep',
    'yup',
    // How a short "yes" is often misheard. Only used for this yes/no
    // question, so there's little risk of a false yes.
    'yea',
    'ya',
    'yah',
    'yess',
    'yas',
    'jess',
    'sure',
    'ok',
    'okay',
    'please',
    'go ahead',
    'continue',
    'read',
    'correct',
    'right',
    'do it',
];

/**
 * @param {string} transcript
 * @returns {'yes' | 'no' | 'cancel' | null}
 */
export function parseConfirmation(transcript) {
    const text = normalize(transcript);
    if (!text) {
        return null;
    }
    if (includesAnyWord(text, CANCEL_PHRASES)) {
        return 'cancel';
    }
    // "No" is checked before "yes" so "no, scan it again" and "please don't"
    // are never taken as a yes.
    if (includesAnyWord(text, NO_PHRASES)) {
        return 'no';
    }
    if (includesAnyWord(text, YES_PHRASES)) {
        return 'yes';
    }
    return null;
}

/**
 * @param {string} transcript
 * @returns {Command}
 */
export function parseCommand(transcript) {
    const text = normalize(transcript);
    if (!text) {
        return { type: 'unknown' };
    }

    const fields = [];
    if (includesAny(text, AMOUNT_PHRASES) && !isOnlyAboutWhen(text)) {
        fields.push('amountDue');
    }
    if (includesAny(text, DATE_PHRASES)) {
        fields.push('dueDate');
    }

    if (includesAny(text, STOP_PHRASES)) {
        return { type: 'stop' };
    }
    // Before scan and close, so "delete this and scan another" and "I'm done,
    // delete it" are never taken as keeping the document.
    if (includesAny(text, DELETE_PHRASES)) {
        return { type: 'delete' };
    }
    if (includesAny(text, SCAN_PHRASES)) {
        return { type: 'scan' };
    }
    if (includesAny(text, CLOSE_PHRASES)) {
        return { type: 'close' };
    }
    if (includesAny(text, HELP_PHRASES)) {
        return { type: 'help' };
    }
    // Field questions win over "read" so "read me the amount due" only
    // reads the amount, not the whole document.
    if (fields.length > 0) {
        return { type: 'field', fields };
    }
    if (includesAny(text, REPEAT_PHRASES)) {
        return { type: 'repeat' };
    }
    if (includesAny(text, READ_ALL_PHRASES)) {
        return { type: 'readAll' };
    }
    return { type: 'unknown' };
}

// "When is the amount due?" asks for the date, even though it says "amount".
// "How much and when" still asks for both.
function isOnlyAboutWhen(text) {
    return includesAny(text, ['when', 'what day', 'deadline']) && !includesAny(text, ['how much', 'owe', 'cost']);
}

function normalize(transcript) {
    return (transcript ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function includesAny(text, phrases) {
    const padded = ` ${text} `;
    return phrases.some((phrase) => padded.includes(` ${phrase} `) || padded.includes(` ${phrase}`));
}

// Whole words only, so short answers like "no" don't match "now" or "note".
function includesAnyWord(text, phrases) {
    const padded = ` ${text} `;
    return phrases.some((phrase) => padded.includes(` ${phrase} `));
}
