// Turns raw OCR text into simple display blocks (headings, label/value
// fields and paragraphs) so the reader can lay a document out cleanly
// instead of dumping one long run of text. No React / React Native imports.

/**
 * @typedef {{ label: string, value: string }} DocumentField
 * @typedef {{ type: 'heading', text: string }
 *   | { type: 'fields', items: DocumentField[] }
 *   | { type: 'paragraph', lines: string[] }} DocumentBlock
 */

// "Due date: 20/09/2023", "Invoice No.: 042045"
const COLON_FIELD = /^([A-Za-z][^:]{0,40}?)\s*:\s*(\S.*)$/;
// "Total $84.20", "Amount Due 1,204.00" - a short label ending in a money value.
const AMOUNT_FIELD = /^([A-Za-z][A-Za-z .#/&()'-]{1,40}?)\s+(\$\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*\.\d{2})$/;
// Prose lines at least this long are treated as wrapped text and joined.
const WRAPPED_LINE_LENGTH = 35;

/**
 * @param {string} text
 * @returns {DocumentBlock[]}
 */
export function structureDocument(text) {
    if (!text) {
        return [];
    }

    const lines = text.split(/\r?\n/).map(cleanLine);
    const blocks = [];
    let paragraph = null;
    let fields = null;

    const closeOpenBlocks = () => {
        paragraph = null;
        fields = null;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!line) {
            closeOpenBlocks();
            continue;
        }

        const field = parseField(line, lines[i + 1]);
        if (field) {
            if (field.consumedNext) {
                i++;
            }
            paragraph = null;
            if (!fields) {
                fields = { type: 'fields', items: [] };
                blocks.push(fields);
            }
            fields.items.push({ label: field.label, value: field.value });
            continue;
        }

        if (isHeading(line)) {
            closeOpenBlocks();
            blocks.push({ type: 'heading', text: line });
            continue;
        }

        fields = null;
        if (!paragraph) {
            paragraph = { type: 'paragraph', lines: [line] };
            blocks.push(paragraph);
            continue;
        }

        const last = paragraph.lines[paragraph.lines.length - 1];
        if (last.endsWith('-') && /^[a-z]/.test(line)) {
            // Word split across lines: "docu-" + "ment".
            paragraph.lines[paragraph.lines.length - 1] = last.slice(0, -1) + line;
        } else if (isWrappedContinuation(last, line)) {
            paragraph.lines[paragraph.lines.length - 1] = `${last} ${line}`;
        } else {
            paragraph.lines.push(line);
        }
    }

    return blocks;
}

/**
 * Plain text for text-to-speech, with punctuation added so the voice pauses
 * between headings, fields and paragraphs.
 * @param {DocumentBlock[]} blocks
 * @returns {string}
 */
export function documentToSpeech(blocks) {
    return blocks
        .map((block) => {
            if (block.type === 'heading') {
                return endSentence(block.text);
            }
            if (block.type === 'fields') {
                return block.items.map((item) => endSentence(`${item.label}: ${item.value}`)).join(' ');
            }
            return block.lines.map(endSentence).join(' ');
        })
        .join('\n\n');
}

function cleanLine(raw) {
    const line = raw.replace(/\s+/g, ' ').trim();
    // Drop OCR noise such as "-----" or "|||" that has no letters or digits.
    return /[A-Za-z0-9]/.test(line) ? line : '';
}

function parseField(line, nextLine) {
    let match = line.match(COLON_FIELD);
    // Skip URLs ("https://...") and times ("Open 9:30").
    if (match && !/^https?$/i.test(match[1]) && !(/\d$/.test(match[1]) && /^\d/.test(match[2]))) {
        return { label: match[1].trim(), value: match[2].trim(), consumedNext: false };
    }

    match = line.match(AMOUNT_FIELD);
    if (match) {
        return { label: match[1].trim(), value: match[2].replace(/\s/g, ''), consumedNext: false };
    }

    // "Due date:" on its own line with the value directly underneath.
    if (line.endsWith(':') && line.length <= 40 && nextLine && nextLine.length <= 30 && !nextLine.endsWith(':')) {
        return { label: line.slice(0, -1).trim(), value: nextLine, consumedNext: true };
    }

    return null;
}

function isHeading(line) {
    const letters = line.replace(/[^A-Za-z]/g, '');
    const words = line.split(' ').length;
    return letters.length >= 3 && letters === letters.toUpperCase() && words <= 6 && !/[.,;]$/.test(line);
}

function isWrappedContinuation(previous, current) {
    if (/^[a-z]/.test(current)) {
        return true;
    }
    return previous.length >= WRAPPED_LINE_LENGTH && !/[.!?:]$/.test(previous);
}

function endSentence(text) {
    return /[.!?]$/.test(text) ? text : `${text}.`;
}
