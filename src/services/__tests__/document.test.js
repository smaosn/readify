import { documentToSpeech, structureDocument } from '../document';

describe('structureDocument', () => {
    test('empty text gives no blocks', () => {
        expect(structureDocument('')).toEqual([]);
        expect(structureDocument(null)).toEqual([]);
    });

    test('groups consecutive label/value lines into one fields block', () => {
        const blocks = structureDocument('Invoice No.: 042045\nDue date: 20/09/2023\nTotal $84.20');
        expect(blocks).toEqual([
            {
                type: 'fields',
                items: [
                    { label: 'Invoice No.', value: '042045' },
                    { label: 'Due date', value: '20/09/2023' },
                    { label: 'Total', value: '$84.20' },
                ],
            },
        ]);
    });

    test('a label on its own line takes the value from the next line', () => {
        expect(structureDocument('Amount Due:\n$84.20')).toEqual([
            { type: 'fields', items: [{ label: 'Amount Due', value: '$84.20' }] },
        ]);
    });

    test('short all-caps lines become headings', () => {
        const blocks = structureDocument('HYDRO OTTAWA\nAccount: 12345');
        expect(blocks[0]).toEqual({ type: 'heading', text: 'HYDRO OTTAWA' });
        expect(blocks[1].type).toBe('fields');
    });

    test('wrapped prose lines are joined into one paragraph, hyphenated words rejoined', () => {
        const text =
            'Thank you for being a valued customer of our\n' +
            'service. Please keep this docu-\n' +
            'ment for your records.';
        expect(structureDocument(text)).toEqual([
            {
                type: 'paragraph',
                lines: ['Thank you for being a valued customer of our service. Please keep this document for your records.'],
            },
        ]);
    });

    test('short address-style lines stay on separate lines', () => {
        expect(structureDocument('123 Main Street\nOttawa ON K1N 6N5')).toEqual([
            { type: 'paragraph', lines: ['123 Main Street', 'Ottawa ON K1N 6N5'] },
        ]);
    });

    test('times and URLs are not treated as fields', () => {
        expect(structureDocument('Open 9:30 to 5')).toEqual([{ type: 'paragraph', lines: ['Open 9:30 to 5'] }]);
        expect(structureDocument('https://example.com')).toEqual([
            { type: 'paragraph', lines: ['https://example.com'] },
        ]);
    });

    test('drops OCR noise lines and collapses extra spaces', () => {
        expect(structureDocument('-------\nHello    there')).toEqual([
            { type: 'paragraph', lines: ['Hello there'] },
        ]);
    });
});

describe('documentToSpeech', () => {
    test('adds pauses between headings, fields and paragraphs', () => {
        const blocks = structureDocument('HYDRO OTTAWA\nDue date: 20/09/2023\n\nPay online');
        expect(documentToSpeech(blocks)).toBe('HYDRO OTTAWA.\n\nDue date: 20/09/2023.\n\nPay online.');
    });
});
