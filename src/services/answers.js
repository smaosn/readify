// Pure phrasing logic that turns an extracted field value into
// speech-friendly wording. No React / React Native imports here.

/**
 * @typedef {'amountDue' | 'dueDate'} Field
 * @typedef {'short' | 'full'} AnswerMode
 */

const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

/**
 * @param {Field} field
 * @param {string} value
 * @param {AnswerMode} mode
 * @returns {string}
 */
export function formatAnswer(field, value, mode) {
    return field === 'amountDue' ? formatAmount(value, mode) : formatDate(value, mode);
}

function formatAmount(value, mode) {
    const cleaned = value.replace(/[^0-9.]/g, '');
    const [dollarsStr, centsStr] = cleaned.split('.');
    const dollars = parseInt(dollarsStr, 10) || 0;
    const dollarsWord = `${dollars} dollar${dollars === 1 ? '' : 's'}`;

    let spoken = dollarsWord;
    if (centsStr) {
        const cents = parseInt(centsStr.padEnd(2, '0').slice(0, 2), 10);
        spoken = `${dollarsWord} and ${cents} cent${cents === 1 ? '' : 's'}`;
    }

    return mode === 'short' ? spoken : `Your amount due is ${spoken}.`;
}

function formatDate(value, mode) {
    const parsed = parseDateValue(value);
    if (!parsed) {
        return mode === 'short' ? value : `Your payment is due on ${value}.`;
    }

    const monthName = MONTH_NAMES[parsed.month - 1];
    const dayPhrase = `${monthName} ${parsed.day}`;

    if (mode === 'short') {
        return dayPhrase;
    }

    const yearPhrase = parsed.year ? `, ${parsed.year}` : '';
    return `Your payment is due on ${dayPhrase}${yearPhrase}.`;
}

/**
 * @param {string} raw
 * @returns {{ month: number, day: number, year: string | null } | null}
 */
function parseDateValue(raw) {
    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        return { year: match[1], month: Number(match[2]), day: Number(match[3]) };
    }

    match = raw.match(/^(\d{2})-(\d{2})$/);
    if (match) {
        return { year: null, month: Number(match[1]), day: Number(match[2]) };
    }

    match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
        return { year: match[3], month: Number(match[1]), day: Number(match[2]) };
    }

    return null;
}
