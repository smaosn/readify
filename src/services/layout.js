// Groups OCR text segments (lines, as already assembled by the OCR engine)
// into visual rows using their bounding boxes, then joins same-row segments
// left-to-right. This corrects for OCR engines that return text in
// block/column order rather than true reading order - the common case on a
// two-column invoice where a left-hand label ("Due date:") and its
// right-hand value ("20/09/2023") are detected as separate blocks and can
// end up many lines apart in the flat text output.
//
// Each segment should already be a correctly-spaced unit of text (an OCR
// "line", not an individual word) - this only re-orders and re-groups those
// units by position, it does not re-join words within a segment.
//
// If segments carry corner points, the page is deskewed first. On a tilted
// photo, axis-aligned boxes grow taller and the right end of each line sits
// higher or lower than the left, so neighbouring lines would otherwise be
// merged into one row.

/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{
 *   text: string,
 *   x: number,
 *   y: number,
 *   height: number,
 *   corners?: readonly [Point, Point, Point, Point],
 * }} OcrSegment
 * `corners` are top-left, top-right, bottom-right, bottom-left relative to
 * the text, as ML Kit returns them.
 */

// Tilts smaller than this don't affect row grouping enough to correct.
const MIN_SKEW_RADIANS = (0.5 * Math.PI) / 180;

/**
 * @param {OcrSegment[]} segments
 * @returns {string}
 */
export function reconstructText(segments) {
    const usable = segments.filter((segment) => segment.text && segment.text.trim());
    if (usable.length === 0) {
        return '';
    }

    const sorted = deskew(usable).sort((a, b) => a.y - b.y);
    const rows = [];

    for (const segment of sorted) {
        const center = segment.y + segment.height / 2;
        let row = null;
        let bestDistance = Infinity;
        for (const candidate of rows) {
            const rowCenter = candidate.top + candidate.height / 2;
            const tolerance = Math.max(segment.height, candidate.height) * 0.6;
            const distance = Math.abs(center - rowCenter);
            if (distance <= tolerance && distance < bestDistance) {
                row = candidate;
                bestDistance = distance;
            }
        }

        if (row) {
            const bottom = Math.max(row.top + row.height, segment.y + segment.height);
            row.segments.push(segment);
            row.top = Math.min(row.top, segment.y);
            row.height = bottom - row.top;
        } else {
            rows.push({ top: segment.y, height: segment.height, segments: [segment] });
        }
    }

    rows.sort((a, b) => a.top - b.top);

    return rows
        .map((row) =>
            row.segments
                .slice()
                .sort((a, b) => a.x - b.x)
                .map((segment) => segment.text)
                .join(' ')
        )
        .join('\n');
}

/**
 * Rotates segments so the dominant text direction is horizontal, replacing
 * x/y/height with values measured in that straightened space. Returns the
 * segments unchanged unless every one has corner points.
 *
 * @param {OcrSegment[]} segments
 * @returns {OcrSegment[]}
 */
function deskew(segments) {
    if (!segments.every((segment) => segment.corners?.length === 4)) {
        return [...segments];
    }

    const angle = weightedMedian(
        segments.map(({ corners: [topLeft, topRight] }) => ({
            value: Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x),
            weight: Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y),
        }))
    );
    if (Math.abs(angle) < MIN_SKEW_RADIANS) {
        return [...segments];
    }

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotate = ({ x, y }) => ({ x: x * cos + y * sin, y: -x * sin + y * cos });

    return segments.map((segment) => {
        const [topLeft, topRight, bottomRight, bottomLeft] = segment.corners.map(rotate);
        const top = Math.min(topLeft.y, topRight.y);
        const bottom = Math.max(bottomLeft.y, bottomRight.y);
        return {
            text: segment.text,
            x: Math.min(topLeft.x, bottomLeft.x),
            y: top,
            height: bottom - top,
        };
    });
}

/**
 * @param {{ value: number, weight: number }[]} entries
 * @returns {number}
 */
function weightedMedian(entries) {
    const sorted = [...entries].sort((a, b) => a.value - b.value);
    const half = sorted.reduce((sum, entry) => sum + entry.weight, 0) / 2;
    let running = 0;
    for (const entry of sorted) {
        running += entry.weight;
        if (running >= half) {
            return entry.value;
        }
    }
    return sorted[sorted.length - 1].value;
}
