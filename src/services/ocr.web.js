import { createWorker } from 'tesseract.js';
export async function recognizeDocumentText(uri) {
    const worker = await createWorker('eng');
    try {
        const result = await worker.recognize(uri);
        return result.data.text.trim();
    }
    finally {
        await worker.terminate();
    }
}
