// Pure text extraction logic. No React / React Native imports here so it
// can be unit tested in plain Node and reused by any screen.

/**
 * @typedef {'amountDue' | 'dueDate'} FieldType
 * @typedef {'high' | 'low' | 'none'} Confidence
 * @typedef {{ value: string | null, confidence: Confidence, evidence: string }} ExtractResult
 */

const NONE_RESULT = { value: null, confidence: 'none', evidence: '' };

/**
 * @param {string} ocrText
 * @param {FieldType} field
 * @returns {ExtractResult}
 */
export function extractField(ocrText, field) {
    if (!ocrText || !ocrText.trim()) {
        return NONE_RESULT;
    }
    return field === 'amountDue' ? extractAmountDue(ocrText) : extractDueDate(ocrText);
}

// ---------------------------------------------------------------------------
// Amount due
// ---------------------------------------------------------------------------

// Priority order: the first label that is found (with a nearby value) wins.
const AMOUNT_LABELS = [
    'total amount due',
    'amount due',
    'total due',
    'balance due',
    'pay this amount',
    'amount payable',
];

// Lines containing any of these words are skipped, even if they also contain
// a label above, so a "Minimum payment" line never gets returned by mistake.
const AMOUNT_EXCLUDE_KEYWORDS = ['minimum', 'previous balance', 'last payment', 'credit'];

// Requires either a currency symbol (or the OCR slip "S" for "$") or a
// two-digit decimal part, so we don't pick up unrelated plain integers
// (account numbers, page numbers, etc.) from nearby lines.
const CURRENCY_PATTERN = /(?:[$S]\s?\d[\d,]*(?:\.\d{2})?)|(?:\d[\d,]*\.\d{2})/;

function extractAmountDue(ocrText) {
    const lines = ocrText.split(/\r?\n/);

    for (const label of AMOUNT_LABELS) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lower = line.toLowerCase();
            const labelIndex = lower.indexOf(label);
            if (labelIndex === -1 || containsExcluded(lower, AMOUNT_EXCLUDE_KEYWORDS)) {
                continue;
            }

            // Same line, after the label text.
            const afterLabel = line.slice(labelIndex + label.length);
            const sameLineMatch = afterLabel.match(CURRENCY_PATTERN);
            if (sameLineMatch) {
                return buildAmountResult(sameLineMatch[0], line.trim());
            }

            // Next 1-2 lines.
            for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
                const nextLine = lines[j];
                if (containsExcluded(nextLine.toLowerCase(), AMOUNT_EXCLUDE_KEYWORDS)) {
                    continue;
                }
                const nextMatch = nextLine.match(CURRENCY_PATTERN);
                if (nextMatch) {
                    return buildAmountResult(nextMatch[0], `${line.trim()} / ${nextLine.trim()}`);
                }
            }
        }
    }

    return NONE_RESULT;
}

function buildAmountResult(rawMatch, evidence) {
    const digitsOnly = rawMatch.replace(/[^0-9.]/g, '');
    return { value: `$${digitsOnly}`, confidence: 'high', evidence };
}

function containsExcluded(lowerLine, keywords) {
    return keywords.some((keyword) => lowerLine.includes(keyword));
}

// ---------------------------------------------------------------------------
// Due date
// ---------------------------------------------------------------------------

const DATE_LABELS = ['due date', 'payment due', 'pay by', 'due on', 'due by'];

const MONTH_NAMES = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
];

const MONTH_WORD =
    '(January|February|March|April|May|June|July|August|September|October|November|December|' +
    'Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';

// The (?!\d) after each day group stops it from swallowing the first two
// digits of a following 4-digit year (e.g. "October 2026" is NOT "day 20").
const MONTH_DAY_YEAR = new RegExp(
    `${MONTH_WORD}\\.?\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?,?\\s*(\\d{4})?`,
    'i'
);
const DAY_MONTH_YEAR = new RegExp(
    `(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?\\s+${MONTH_WORD}\\.?,?\\s*(\\d{4})?`,
    'i'
);
const ISO_DATE = /(\d{4})-(\d{2})-(\d{2})/;
const SLASH_DATE = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/;

function extractDueDate(ocrText) {
    const lines = ocrText.split(/\r?\n/);

    for (const label of DATE_LABELS) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lower = line.toLowerCase();
            if (lower.indexOf(label) === -1) {
                continue;
            }

            const sameLineResult = parseDateCandidate(line);
            if (sameLineResult) {
                return { ...sameLineResult, evidence: line.trim() };
            }

            for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
                const nextLine = lines[j];
                const result = parseDateCandidate(nextLine);
                if (result) {
                    return { ...result, evidence: `${line.trim()} / ${nextLine.trim()}` };
                }
            }
        }
    }

    return NONE_RESULT;
}

/**
 * @param {string} text
 * @returns {{ value: string, confidence: Confidence } | null}
 */
function parseDateCandidate(text) {
    let match = ISO_DATE.exec(text);
    if (match) {
        return { value: `${match[1]}-${match[2]}-${match[3]}`, confidence: 'high' };
    }

    match = SLASH_DATE.exec(text);
    if (match) {
        const first = Number(match[1]);
        const second = Number(match[2]);
        const year = match[3];

        if (first <= 12 && second <= 12) {
            // Could be MM/DD/YYYY or DD/MM/YYYY - genuinely ambiguous, don't guess.
            return { value: match[0], confidence: 'low' };
        }

        // Whichever part is > 12 can only be the day.
        const month = first > 12 ? second : first;
        const day = first > 12 ? first : second;
        return { value: `${year}-${pad(month)}-${pad(day)}`, confidence: 'high' };
    }

    match = MONTH_DAY_YEAR.exec(text);
    if (match) {
        const month = monthNumberFromName(match[1]);
        if (month) {
            const day = Number(match[2]);
            const year = match[3];
            return { value: dateValue(year, month, day), confidence: 'high' };
        }
    }

    match = DAY_MONTH_YEAR.exec(text);
    if (match) {
        const month = monthNumberFromName(match[2]);
        if (month) {
            const day = Number(match[1]);
            const year = match[3];
            return { value: dateValue(year, month, day), confidence: 'high' };
        }
    }

    return null;
}

function dateValue(year, month, day) {
    return year ? `${year}-${pad(month)}-${pad(day)}` : `${pad(month)}-${pad(day)}`;
}

function monthNumberFromName(name) {
    const lower = name.toLowerCase();
    let index = MONTH_NAMES.indexOf(lower);
    if (index === -1) {
        index = MONTH_NAMES.findIndex((full) => full.startsWith(lower.slice(0, 3)));
    }
    return index === -1 ? null : index + 1;
}

function pad(value) {
    return String(value).padStart(2, '0');
}
