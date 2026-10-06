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

/**
 * @typedef {{ text: string, x: number, y: number, height: number }} OcrSegment
 */

/**
 * @param {OcrSegment[]} segments
 * @returns {string}
 */
export function reconstructText(segments) {
    const usable = segments.filter((segment) => segment.text && segment.text.trim());
    if (usable.length === 0) {
        return '';
    }

    const sorted = [...usable].sort((a, b) => a.y - b.y);
    const rows = [];

    for (const segment of sorted) {
        const center = segment.y + segment.height / 2;
        const row = rows.find((candidate) => {
            const rowCenter = candidate.top + candidate.height / 2;
            const tolerance = Math.max(segment.height, candidate.height) * 0.6;
            return Math.abs(center - rowCenter) <= tolerance;
        });

        if (row) {
            row.segments.push(segment);
            row.top = Math.min(row.top, segment.y);
            row.height = Math.max(row.height, segment.height);
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
