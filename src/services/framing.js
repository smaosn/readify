// Works out how the user should move the phone so the whole document is in
// the photo, from where the text lines sit in a live camera frame.
//
// Directions assume the usual way of photographing a page on a table: the
// phone held flat above it, screen facing up, with the top of the phone
// pointing away from the user. So the top of the camera image is "forward"
// and the bottom is "back toward you". The back camera isn't mirrored, so
// image left is the user's left.

/**
 * @typedef {{ left: number, top: number, right: number, bottom: number }} Box
 * @typedef {'none' | 'further' | 'closer' | 'left' | 'right' | 'forward' | 'back' | 'ready'} FramingStatus
 */

// Text this close to an edge (as a fraction of the frame) is treated as cut
// off, since the page probably carries on past the edge of the picture.
const EDGE_MARGIN = 0.04;
// If the text covers less than this much of the frame in both directions,
// the phone is too far away for the words to be read well.
const MIN_COVERAGE = 0.5;
// When the text is too small and also this far off-centre, centre it first;
// moving closer would push it out of the frame.
const OFF_CENTRE = 0.18;
// Boxes may overshoot the frame slightly because of rounding.
const FIT_TOLERANCE = 1.02;

/** What to say for each status. */
export const FRAMING_CUES = {
    none: 'I cannot see any writing. Hold the phone flat over the page, about one foot above it.',
    further: 'Move the phone further away.',
    closer: 'Move the phone closer.',
    left: 'Move the phone left.',
    right: 'Move the phone right.',
    forward: 'Move the phone forward, away from you.',
    back: 'Move the phone back, toward you.',
    ready: 'Hold still.',
};

/**
 * @param {{ lines: Box[], width: number, height: number }} frame
 *   Text line boxes from one camera frame, and the frame's size. The size may
 *   be the raw sensor size (landscape) even when the boxes are upright, so
 *   both orientations are tried.
 * @returns {FramingStatus}
 */
export function analyzeFraming({ lines, width, height }) {
    // Normalised so a box with its edges swapped (some OCR libraries use a
    // flipped y-axis) still counts; only empty boxes are dropped.
    const boxes = (lines ?? [])
        .map((box) => ({
            left: Math.min(box.left, box.right),
            right: Math.max(box.left, box.right),
            top: Math.min(box.top, box.bottom),
            bottom: Math.max(box.top, box.bottom),
        }))
        .filter((box) => box.right > box.left && box.bottom > box.top);
    if (boxes.length === 0 || !(width > 0) || !(height > 0)) {
        return 'none';
    }

    const extent = {
        left: Math.min(...boxes.map((box) => box.left)),
        top: Math.min(...boxes.map((box) => box.top)),
        right: Math.max(...boxes.map((box) => box.right)),
        bottom: Math.max(...boxes.map((box) => box.bottom)),
    };
    const [frameWidth, frameHeight] = uprightSize(extent, width, height);

    const left = extent.left / frameWidth;
    const right = extent.right / frameWidth;
    const top = extent.top / frameHeight;
    const bottom = extent.bottom / frameHeight;

    const cutLeft = left < EDGE_MARGIN;
    const cutRight = right > 1 - EDGE_MARGIN;
    const cutTop = top < EDGE_MARGIN;
    const cutBottom = bottom > 1 - EDGE_MARGIN;

    if ((cutLeft && cutRight) || (cutTop && cutBottom)) {
        return 'further';
    }
    if (cutLeft) {
        return 'left';
    }
    if (cutRight) {
        return 'right';
    }
    if (cutTop) {
        return 'forward';
    }
    if (cutBottom) {
        return 'back';
    }

    if (Math.max(right - left, bottom - top) < MIN_COVERAGE) {
        const centreX = (left + right) / 2 - 0.5;
        const centreY = (top + bottom) / 2 - 0.5;
        if (Math.max(Math.abs(centreX), Math.abs(centreY)) > OFF_CENTRE) {
            if (Math.abs(centreX) >= Math.abs(centreY)) {
                return centreX < 0 ? 'left' : 'right';
            }
            return centreY < 0 ? 'forward' : 'back';
        }
        return 'closer';
    }

    return 'ready';
}

// The app only runs in portrait, so prefer the tall reading of the frame
// size, unless the text boxes only fit the wide one.
function uprightSize(extent, width, height) {
    const portrait = [Math.min(width, height), Math.max(width, height)];
    const landscape = [portrait[1], portrait[0]];
    const fits = ([w, h]) => extent.right <= w * FIT_TOLERANCE && extent.bottom <= h * FIT_TOLERANCE;
    return fits(portrait) || !fits(landscape) ? portrait : landscape;
}

/**
 * Turns the stream of per-frame framing results into spoken cues and a single
 * capture, so the user isn't flooded with instructions.
 * - A new direction is only spoken once it has held for `settleMs`, so a
 *   result that flickers for one frame isn't announced.
 * - The same direction is repeated every `repeatMs` while it still applies.
 * - "Hold still" is said as soon as the page is framed, and `capture` is
 *   returned once it has stayed framed for `holdMs`.
 *
 * @param {{ settleMs?: number, repeatMs?: number, holdMs?: number }} [options]
 */
export function createFramingCoach({ settleMs = 400, repeatMs = 4000, holdMs = 1000 } = {}) {
    let candidate = null;
    let candidateSince = 0;
    let spoken = null;
    let spokenAt = -Infinity;
    let readySince = null;

    return {
        /**
         * @param {FramingStatus} status This frame's result.
         * @param {number} now Current time in milliseconds.
         * @param {boolean} [canSpeak] False while something that mustn't be
         *   interrupted is being said; cues wait until it has finished.
         * @returns {{ say?: FramingStatus, capture?: true }}
         */
        update(status, now, canSpeak = true) {
            if (status !== candidate) {
                candidate = status;
                candidateSince = now;
            }
            if (status === 'ready') {
                readySince ??= now;
                if (now - readySince >= holdMs) {
                    return { capture: true };
                }
            }
            else {
                readySince = null;
            }
            const settled = status === 'ready' || now - candidateSince >= settleMs;
            const due = status !== spoken || now - spokenAt >= repeatMs;
            if (canSpeak && settled && due) {
                spoken = status;
                spokenAt = now;
                return { say: status };
            }
            return {};
        },
    };
}

// A recognised word: letters (allowing a capital first letter or all caps),
// or a number such as an amount, date or account number.
const WORD = /^(?:[A-Za-z][a-z]{2,}|[A-Z]{2,}|[$€£]?\d[\d.,/:-]*%?)$/;
const MIN_WORDS = 5;
const MIN_WORD_RATIO = 0.5;

/**
 * Whether text recognised from a photo looks like real reading material
 * rather than the scattered fragments a blurry or dark photo produces.
 * @param {string | null | undefined} text
 * @returns {boolean}
 */
export function isTextClear(text) {
    const tokens = (text ?? '')
        .split(/\s+/)
        .map((token) => token.replace(/^[^\w$€£]+|[^\w%]+$/g, ''))
        .filter(Boolean);
    if (tokens.length === 0) {
        return false;
    }
    const words = tokens.filter((token) => WORD.test(token)).length;
    return words >= MIN_WORDS && words / tokens.length >= MIN_WORD_RATIO;
}
