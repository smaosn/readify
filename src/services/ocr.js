import TextRecognition from '@react-native-ml-kit/text-recognition';
import { reconstructText } from './layout';

export async function recognizeDocumentText(uri) {
    const result = await TextRecognition.recognize(uri);

    const segments = [];
    let hasPositions = true;
    for (const block of result.blocks ?? []) {
        for (const line of block.lines ?? []) {
            if (!line.frame) {
                hasPositions = false;
                continue;
            }
            segments.push({
                text: line.text,
                x: line.frame.left,
                y: line.frame.top,
                height: line.frame.height,
            });
        }
    }

    if (hasPositions && segments.length > 0) {
        return reconstructText(segments).trim();
    }
    return (result.text || '').trim();
}
