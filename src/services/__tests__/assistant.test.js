import { interpret, introSpeech, respond } from '../assistant';

const BILL = 'City Water\nAmount due: $84.20\nDue date: 2023-09-20\nThank you for your payment.';

const context = (overrides = {}) => ({
    documentText: BILL,
    documentSpeech: 'City Water. Amount due, $84.20.',
    lastSpeech: null,
    screenReaderOn: false,
    ...overrides,
});

describe('interpret', () => {
    test('uses the first alternative that is a known command', () => {
        const result = interpret(['the dew dale', 'the due date']);
        expect(result.command).toEqual({ type: 'field', fields: ['dueDate'] });
        expect(result.heard).toBe('the due date');
    });

    test('falls back to unknown with the top guess', () => {
        expect(interpret(['banana pancakes', 'banana pans'])).toEqual({
            command: { type: 'unknown' },
            heard: 'banana pancakes',
        });
    });

    test('handles no transcripts', () => {
        expect(interpret([])).toEqual({ command: { type: 'unknown' }, heard: '' });
    });
});

describe('respond', () => {
    test.each([
        ['I want to know the due date', 'Your payment is due on September 20, 2023.'],
        ['I want to know the amount due', 'Your amount due is 84 dollars and 20 cents.'],
    ])('"%s" says only that field', (said, expected) => {
        const reply = respond(interpret([said]).command, context());
        expect(reply).toEqual({ type: 'say', speech: expected, display: expected });
    });

    test('asking for both answers both', () => {
        const reply = respond(interpret(['how much do I owe and when']).command, context());
        expect(reply.speech).toBe(
            'Your amount due is 84 dollars and 20 cents. Your payment is due on September 20, 2023.'
        );
    });

    test('a missing field says it could not be found', () => {
        const reply = respond({ type: 'field', fields: ['dueDate'] }, context({ documentText: 'Hello there' }));
        expect(reply.speech).toMatch(/could not find the due date/);
    });

    test('read everything speaks the document and shows its text', () => {
        expect(respond({ type: 'readAll' }, context())).toEqual({
            type: 'say',
            speech: 'City Water. Amount due, $84.20.',
            display: BILL,
        });
    });

    test('repeat says the last answer again', () => {
        const reply = respond({ type: 'repeat' }, context({ lastSpeech: 'Your amount due is 5 dollars.' }));
        expect(reply.speech).toBe('Your amount due is 5 dollars.');
    });

    test('repeat with nothing said yet explains what to ask', () => {
        expect(respond({ type: 'repeat' }, context()).speech).toMatch(/not read anything/);
    });

    test.each(['stop', 'scan', 'close'])('%s is passed through as an action', (type) => {
        expect(respond({ type }, context())).toEqual({ type });
    });

    test('unknown questions suggest what to say', () => {
        expect(respond({ type: 'unknown' }, context()).speech).toMatch(/^Sorry, I did not understand/);
    });

    test('help mentions double tap when a screen reader is on', () => {
        expect(respond({ type: 'help' }, context({ screenReaderOn: true })).speech).toMatch(/double tap/);
    });
});

describe('introSpeech', () => {
    test('tells screen reader users to double tap', () => {
        expect(introSpeech(true)).toMatch(/Double tap the Ask button/);
        expect(introSpeech(false)).toMatch(/Tap the big button/);
    });
});
