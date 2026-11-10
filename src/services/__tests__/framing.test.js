import { analyzeFraming, createFramingCoach, isTextClear } from '../framing';

// A portrait frame, 1000 x 1000 units scaled to 0..1 for readability.
const W = 1000;
const H = 1000;
const box = (left, top, right, bottom) => ({ left: left * W, top: top * H, right: right * W, bottom: bottom * H });
const frame = (...lines) => ({ lines, width: W, height: H });

describe('analyzeFraming', () => {
    test('no text', () => {
        expect(analyzeFraming(frame())).toBe('none');
        expect(analyzeFraming({ lines: undefined, width: W, height: H })).toBe('none');
    });

    test('whole page in view and big enough is ready', () => {
        expect(analyzeFraming(frame(box(0.1, 0.1, 0.9, 0.15), box(0.1, 0.8, 0.7, 0.85)))).toBe('ready');
    });

    test('text cut off on the left means move left', () => {
        expect(analyzeFraming(frame(box(0.01, 0.2, 0.7, 0.25), box(0.2, 0.7, 0.8, 0.75)))).toBe('left');
    });

    test('text cut off on the right means move right', () => {
        expect(analyzeFraming(frame(box(0.3, 0.2, 0.99, 0.25), box(0.3, 0.7, 0.8, 0.75)))).toBe('right');
    });

    test('text cut off at the top means move forward', () => {
        expect(analyzeFraming(frame(box(0.1, 0.0, 0.9, 0.05), box(0.1, 0.7, 0.9, 0.75)))).toBe('forward');
    });

    test('text cut off at the bottom means move back', () => {
        expect(analyzeFraming(frame(box(0.1, 0.3, 0.9, 0.35), box(0.1, 0.9, 0.9, 0.99)))).toBe('back');
    });

    test('text cut off on opposite sides means move further away', () => {
        expect(analyzeFraming(frame(box(0.0, 0.3, 1.0, 0.35), box(0.1, 0.6, 0.9, 0.65)))).toBe('further');
        expect(analyzeFraming(frame(box(0.2, 0.0, 0.8, 0.05), box(0.2, 0.97, 0.8, 1.0)))).toBe('further');
    });

    test('small centred text means move closer', () => {
        expect(analyzeFraming(frame(box(0.35, 0.4, 0.65, 0.45), box(0.35, 0.55, 0.6, 0.6)))).toBe('closer');
    });

    test('small text off to one side is centred before moving closer', () => {
        expect(analyzeFraming(frame(box(0.05, 0.45, 0.3, 0.5)))).toBe('left');
        expect(analyzeFraming(frame(box(0.45, 0.75, 0.6, 0.8)))).toBe('back');
    });

    test('landscape frame size with upright boxes is read as portrait', () => {
        // Sensor buffer reported as 1920 x 1440, text boxes in upright 1440 x 1920 space.
        const lines = [
            { left: 150, top: 200, right: 1300, bottom: 260 },
            { left: 150, top: 1600, right: 1100, bottom: 1660 },
        ];
        expect(analyzeFraming({ lines, width: 1920, height: 1440 })).toBe('ready');
    });

    test('boxes with top and bottom swapped still count', () => {
        const flipped = (left, top, right, bottom) => ({ ...box(left, top, right, bottom), top: bottom * H, bottom: top * H });
        expect(analyzeFraming(frame(flipped(0.1, 0.1, 0.9, 0.15), flipped(0.1, 0.8, 0.7, 0.85)))).toBe('ready');
    });

    test('ignores empty boxes', () => {
        expect(analyzeFraming(frame({ left: 5, top: 5, right: 5, bottom: 5 }))).toBe('none');
    });
});

describe('createFramingCoach', () => {
    const options = { settleMs: 400, repeatMs: 4000, holdMs: 1000 };

    test('waits for a direction to settle before saying it', () => {
        const coach = createFramingCoach(options);
        expect(coach.update('left', 0)).toEqual({});
        expect(coach.update('left', 200)).toEqual({});
        expect(coach.update('left', 400)).toEqual({ say: 'left' });
    });

    test('a one-frame flicker is never announced', () => {
        const coach = createFramingCoach(options);
        coach.update('left', 0);
        coach.update('left', 500);
        expect(coach.update('right', 600)).toEqual({});
        expect(coach.update('left', 700)).toEqual({});
    });

    test('repeats the same direction only after repeatMs', () => {
        const coach = createFramingCoach(options);
        coach.update('closer', 0);
        expect(coach.update('closer', 400)).toEqual({ say: 'closer' });
        expect(coach.update('closer', 3000)).toEqual({});
        expect(coach.update('closer', 4400)).toEqual({ say: 'closer' });
    });

    test('says hold still straight away, then captures once after holding', () => {
        const coach = createFramingCoach(options);
        expect(coach.update('ready', 0)).toEqual({ say: 'ready' });
        expect(coach.update('ready', 500)).toEqual({});
        expect(coach.update('ready', 1000)).toEqual({ capture: true });
    });

    test('moving out of frame restarts the hold', () => {
        const coach = createFramingCoach(options);
        coach.update('ready', 0);
        coach.update('left', 600);
        expect(coach.update('left', 1000)).toEqual({ say: 'left' });
        expect(coach.update('ready', 1100)).toEqual({ say: 'ready' });
        expect(coach.update('ready', 1600)).toEqual({});
        expect(coach.update('ready', 2100)).toEqual({ capture: true });
    });

    test('holds cues while speech cannot be interrupted, then says them', () => {
        const coach = createFramingCoach(options);
        coach.update('left', 0);
        expect(coach.update('left', 500, false)).toEqual({});
        expect(coach.update('left', 600, true)).toEqual({ say: 'left' });
    });
});

describe('isTextClear', () => {
    test('a readable bill is clear', () => {
        expect(isTextClear('Hydro Ottawa\nAccount number 1234 5678\nAmount due: $84.20\nDue date: 2026-11-20')).toBe(true);
    });

    test('empty or missing text is unclear', () => {
        expect(isTextClear('')).toBe(false);
        expect(isTextClear(null)).toBe(false);
    });

    test('a few words are not enough', () => {
        expect(isTextClear('Amount due')).toBe(false);
    });

    test('blurry fragments are unclear', () => {
        expect(isTextClear('lI ;: rn ,. Ii ~ eo II| 1l .. ~~ wv Tn :; ol')).toBe(false);
    });
});
