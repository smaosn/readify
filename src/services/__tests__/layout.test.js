import { extractField } from '../extractor';
import { reconstructText } from '../layout';

// A realistic OCR "line" list for a two-column invoice: the engine grouped
// all left-column labels into one reading pass and all right-column values
// into another, so in raw block order the label and its value are three
// lines apart instead of adjacent.
const TWO_COLUMN_INVOICE_LINES = [
    { text: 'Invoice No.:', x: 10, y: 10, height: 20 },
    { text: 'Issue date:', x: 10, y: 40, height: 20 },
    { text: 'Due date:', x: 10, y: 70, height: 20 },
    { text: '042045', x: 300, y: 12, height: 20 },
    { text: '06/09/2023', x: 300, y: 42, height: 20 },
    { text: '20/09/2023', x: 300, y: 72, height: 20 },
];

describe('reconstructText', () => {
    test('rebuilds row order from a two-column layout where OCR returns labels and values out of order', () => {
        const text = reconstructText(TWO_COLUMN_INVOICE_LINES);

        expect(text).toBe('Invoice No.: 042045\nIssue date: 06/09/2023\nDue date: 20/09/2023');
    });

    test('an empty segment list returns an empty string', () => {
        expect(reconstructText([])).toBe('');
    });

    test('segments with only whitespace text are dropped', () => {
        const segments = [
            { text: 'Total', x: 0, y: 0, height: 20 },
            { text: '   ', x: 50, y: 0, height: 20 },
            { text: '$10.00', x: 80, y: 0, height: 20 },
        ];
        expect(reconstructText(segments)).toBe('Total $10.00');
    });

    test('vertically stacked segments (label above value) stay on separate lines', () => {
        const segments = [
            { text: 'Amount Due', x: 10, y: 10, height: 20 },
            { text: '$84.20', x: 10, y: 40, height: 20 },
        ];
        expect(reconstructText(segments)).toBe('Amount Due\n$84.20');
    });
});

// Simulates the same invoice photographed at an angle: each line is rotated
// about the origin, and x/y/height become the axis-aligned box ML Kit
// reports for the rotated line, with the true corners alongside.
function tilt(lines, degrees, width = 120) {
    const angle = (degrees * Math.PI) / 180;
    const rotate = ({ x, y }) => ({
        x: x * Math.cos(angle) - y * Math.sin(angle),
        y: x * Math.sin(angle) + y * Math.cos(angle),
    });
    return lines.map(({ text, x, y, height }) => {
        const corners = [
            { x, y },
            { x: x + width, y },
            { x: x + width, y: y + height },
            { x, y: y + height },
        ].map(rotate);
        const xs = corners.map((point) => point.x);
        const ys = corners.map((point) => point.y);
        return {
            text,
            x: Math.min(...xs),
            y: Math.min(...ys),
            height: Math.max(...ys) - Math.min(...ys),
            corners,
        };
    });
}

describe('reconstructText on a tilted page', () => {
    test.each([5, -5, 8])('rebuilds rows when the page is rotated %i degrees', (degrees) => {
        const text = reconstructText(tilt(TWO_COLUMN_INVOICE_LINES, degrees));

        expect(text).toBe('Invoice No.: 042045\nIssue date: 06/09/2023\nDue date: 20/09/2023');
    });

    test('a nearly straight page is left as-is', () => {
        const text = reconstructText(tilt(TWO_COLUMN_INVOICE_LINES, 0.2));

        expect(text).toBe('Invoice No.: 042045\nIssue date: 06/09/2023\nDue date: 20/09/2023');
    });

    test('ignores corners unless every segment has them', () => {
        const segments = tilt(TWO_COLUMN_INVOICE_LINES, 0);
        delete segments[0].corners;

        expect(reconstructText(segments)).toBe('Invoice No.: 042045\nIssue date: 06/09/2023\nDue date: 20/09/2023');
    });
});

describe('reconstructText + extractField (two-column invoice regression)', () => {
    test('finds the due date even though the label and value are far apart in raw block order', () => {
        const text = reconstructText(TWO_COLUMN_INVOICE_LINES);
        const result = extractField(text, 'dueDate');

        expect(result.value).toBe('2023-09-20');
        expect(result.confidence).toBe('high');
    });
});
