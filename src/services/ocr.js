import TextRecognition from '@react-native-ml-kit/text-recognition';
export async function recognizeDocumentText(uri) {
    const result = await TextRecognition.recognize(uri);
    return result.text.trim();
}
