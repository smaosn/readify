import DocumentScanner, { ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';

// Opens the platform document scanner (VisionKit on iOS, the ML Kit document
// scanner on Android). These find the page edges, auto-capture, correct the
// perspective and clean up the image, so OCR gets a flat, cropped page
// instead of a raw photo. Resolves to the scanned image's URI, or null if
// the user cancelled.
export async function scanDocumentImage() {
    const { scannedImages, status } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        croppedImageQuality: 100,
    });
    if (status !== ScanDocumentResponseStatus.Success || !scannedImages?.length) {
        return null;
    }
    return scannedImages[0];
}
