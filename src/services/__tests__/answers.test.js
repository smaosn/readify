import { formatAnswer } from '../answers';

describe('formatAnswer - amountDue', () => {
    test('short answer', () => {
        expect(formatAnswer('amountDue', '$84.20', 'short')).toBe('84 dollars and 20 cents');
    });

    test('full answer', () => {
        expect(formatAnswer('amountDue', '$84.20', 'full')).toBe('Your amount due is 84 dollars and 20 cents.');
    });

    test('whole dollar amount with no cents', () => {
        expect(formatAnswer('amountDue', '$50', 'short')).toBe('50 dollars');
    });

    test('singular dollar and cent', () => {
        expect(formatAnswer('amountDue', '$1.01', 'short')).toBe('1 dollar and 1 cent');
    });
});

describe('formatAnswer - dueDate', () => {
    test('short answer from an ISO value', () => {
        expect(formatAnswer('dueDate', '2026-10-12', 'short')).toBe('October 12');
    });

    test('full answer from an ISO value', () => {
        expect(formatAnswer('dueDate', '2026-10-12', 'full')).toBe('Your payment is due on October 12, 2026.');
    });

    test('full answer from a slash-formatted value', () => {
        expect(formatAnswer('dueDate', '10/12/2026', 'full')).toBe('Your payment is due on October 12, 2026.');
    });

    test('full answer omits the year when it is not known', () => {
        expect(formatAnswer('dueDate', '10-12', 'full')).toBe('Your payment is due on October 12.');
    });

    test('falls back to the raw value when it is not a recognized date format', () => {
        // formatAnswer has no confidence info, so it always assumes MM/DD/YYYY
        // for slash dates (same as the spec's own "10/12/2026" example). Only
        // genuinely unparsable text falls back to being spoken as-is.
        expect(formatAnswer('dueDate', 'see enclosed insert', 'short')).toBe('see enclosed insert');
        expect(formatAnswer('dueDate', 'see enclosed insert', 'full')).toBe(
            'Your payment is due on see enclosed insert.'
        );
    });
});
