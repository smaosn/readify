import { extractField } from '../extractor';

describe('extractField - amountDue', () => {
    test('label and value on the same line', () => {
        const text = 'Account: 12345\nAmount Due: $84.20\nThank you.';
        const result = extractField(text, 'amountDue');
        expect(result).toEqual({
            value: '$84.20',
            confidence: 'high',
            evidence: 'Amount Due: $84.20',
        });
    });

    test('value on the next line', () => {
        const text = 'Statement summary\nAmount Due\n$84.20\nPlease pay promptly.';
        const result = extractField(text, 'amountDue');
        expect(result.value).toBe('$84.20');
        expect(result.confidence).toBe('high');
    });

    test('bill with both Minimum payment and Amount due returns the amount due', () => {
        const text = 'Minimum Payment Amount Due: $25.00\nAmount Due: $84.20';
        const result = extractField(text, 'amountDue');
        expect(result.value).toBe('$84.20');
        expect(result.confidence).toBe('high');
    });

    test('ignores a Previous balance line even when it mentions the label', () => {
        const text = 'Previous Balance Amount Due: $25.00\nTotal Amount Due: $84.20';
        const result = extractField(text, 'amountDue');
        expect(result.value).toBe('$84.20');
    });

    test('tolerates OCR noise where $ is read as S', () => {
        const text = 'Amount Due: S84.20';
        const result = extractField(text, 'amountDue');
        expect(result.value).toBe('$84.20');
        expect(result.confidence).toBe('high');
    });

    test('supports comma thousands separators', () => {
        const text = 'Total Amount Due: $1,234.56';
        const result = extractField(text, 'amountDue');
        expect(result.value).toBe('$1234.56');
    });

    test('missing label returns none', () => {
        const text = 'Thank you for being a customer.\nYour balance is $50.00';
        const result = extractField(text, 'amountDue');
        expect(result).toEqual({ value: null, confidence: 'none', evidence: '' });
    });

    test('empty text returns none', () => {
        expect(extractField('', 'amountDue')).toEqual({ value: null, confidence: 'none', evidence: '' });
    });
});

describe('extractField - dueDate', () => {
    test('two dates on the page: must return the due date, not the statement date', () => {
        const text = 'Statement Date: September 15, 2026\nDue Date: October 25, 2026';
        const result = extractField(text, 'dueDate');
        expect(result.value).toBe('2026-10-25');
        expect(result.confidence).toBe('high');
    });

    test('month-name date without a year', () => {
        const text = 'Payment Due: Oct 12';
        const result = extractField(text, 'dueDate');
        expect(result.value).toBe('10-12');
        expect(result.confidence).toBe('high');
    });

    test('day-month-year format', () => {
        const text = 'Due on: 12 October 2026';
        const result = extractField(text, 'dueDate');
        expect(result.value).toBe('2026-10-12');
        expect(result.confidence).toBe('high');
    });

    test('unambiguous numeric date (day > 12) resolves the order', () => {
        const text = 'Due Date: 10/25/2026';
        const result = extractField(text, 'dueDate');
        expect(result.value).toBe('2026-10-25');
        expect(result.confidence).toBe('high');
    });

    test('ambiguous numeric date returns low confidence and keeps the raw text', () => {
        const text = 'Due Date: 03/04/2026';
        const result = extractField(text, 'dueDate');
        expect(result.value).toBe('03/04/2026');
        expect(result.confidence).toBe('low');
    });

    test('value on the next line', () => {
        const text = 'Due Date\nOctober 25, 2026';
        const result = extractField(text, 'dueDate');
        expect(result.value).toBe('2026-10-25');
        expect(result.confidence).toBe('high');
    });

    test('missing label returns none', () => {
        const text = 'Thank you for your business.\nSee you next month.';
        const result = extractField(text, 'dueDate');
        expect(result).toEqual({ value: null, confidence: 'none', evidence: '' });
    });
});
