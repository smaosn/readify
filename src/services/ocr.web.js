import { createWorker } from 'tesseract.js';
import { reconstructText } from './layout';

export async function recognizeDocumentText(uri) {
    const worker = await createWorker('eng');
    try {
        const result = await worker.recognize(uri, {}, { blocks: true });

        const segments = (result.data.blocks ?? []).flatMap((block) =>
            block.paragraphs.flatMap((paragraph) =>
                paragraph.lines.map((line) => ({
                    text: line.text,
                    x: line.bbox.x0,
                    y: line.bbox.y0,
                    height: line.bbox.y1 - line.bbox.y0,
                }))
            )
        );

        if (segments.length > 0) {
            return reconstructText(segments).trim();
        }
        return (result.data.text || '').trim();
    }
    finally {
        await worker.terminate();
    }
}
