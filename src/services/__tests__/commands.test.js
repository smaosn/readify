import { parseCommand, parseConfirmation } from '../commands';

describe('parseCommand - single field', () => {
    test.each([
        'Amount due',
        'Read out the amount due',
        'How much do I owe?',
        'What is the total',
        "What's my balance",
    ])('"%s" only asks for the amount', (said) => {
        expect(parseCommand(said)).toEqual({ type: 'field', fields: ['amountDue'] });
    });

    test.each([
        'Due date',
        'Read me the due date',
        'When do I have to pay?',
        'When is the amount due?',
        "What's the deadline",
    ])('"%s" only asks for the date', (said) => {
        expect(parseCommand(said)).toEqual({ type: 'field', fields: ['dueDate'] });
    });

    test('asking for both returns both, amount first', () => {
        expect(parseCommand('How much do I owe and when')).toEqual({
            type: 'field',
            fields: ['amountDue', 'dueDate'],
        });
    });
});

describe('parseCommand - other commands', () => {
    test.each([
        ['Read everything', 'readAll'],
        ['Read the whole document', 'readAll'],
        ['Read it', 'readAll'],
        ['Stop', 'stop'],
        ['Stop reading', 'stop'],
        ['Be quiet', 'stop'],
        ['Close', 'close'],
        ['Scan again', 'scan'],
        ['Scan a new document', 'scan'],
        ['Take a picture', 'scan'],
        ['Go back', 'close'],
        ['Help', 'help'],
        ['What can I say?', 'help'],
        ['Say that again', 'repeat'],
        ['Repeat', 'repeat'],
        ['Take a photo', 'scan'],
        ['Open the camera', 'scan'],
        ['Scan a document', 'scan'],
        ['I am done reading', 'close'],
        ["I'm done", 'close'],
        ["That's all", 'close'],
        ['Go home', 'close'],
        ['Delete this document', 'delete'],
        ['Throw it away', 'delete'],
        ["I'm done, delete it", 'delete'],
        ['Delete this and scan another one', 'delete'],
    ])('"%s" -> %s', (said, type) => {
        expect(parseCommand(said).type).toBe(type);
    });

    test('unrecognized or empty speech is unknown', () => {
        expect(parseCommand('banana pancakes').type).toBe('unknown');
        expect(parseCommand('').type).toBe('unknown');
        expect(parseCommand(undefined).type).toBe('unknown');
    });
});

describe('parseCommand - other wordings for the fields', () => {
    test.each([
        'What is the total amount',
        'What is the final amount',
        'What are the charges',
        'What is payable',
    ])('"%s" asks for the amount', (said) => {
        expect(parseCommand(said)).toEqual({ type: 'field', fields: ['amountDue'] });
    });

    test.each(["What's the last day to pay", 'When is it due', 'What is the pay before date'])(
        '"%s" asks for the date',
        (said) => {
            expect(parseCommand(said)).toEqual({ type: 'field', fields: ['dueDate'] });
        }
    );
});

describe('parseConfirmation', () => {
    test.each(['Yes', 'Yes.', 'Yeah please', 'Okay', 'Sure', 'Read it', 'Go ahead', 'Yes read it now', 'Yea', 'Yess', 'Jess'])(
        '"%s" is yes',
        (said) => {
            expect(parseConfirmation(said)).toBe('yes');
        }
    );

    test.each(['No', 'Nope', 'No, scan it again', 'Retake', 'Take another one', "Please don't", 'Not this one'])(
        '"%s" is no',
        (said) => {
            expect(parseConfirmation(said)).toBe('no');
        }
    );

    test.each(['Cancel', 'Never mind', 'Go back', 'Stop', 'Delete it', 'Go home'])('"%s" is cancel', (said) => {
        expect(parseConfirmation(said)).toBe('cancel');
    });

    test('short answers only match whole words', () => {
        expect(parseConfirmation('note')).toBeNull();
        expect(parseConfirmation('banana')).toBeNull();
        expect(parseConfirmation('')).toBeNull();
    });
});
