// The native document scanner isn't available in the browser, so fall back
// to the file picker (which offers the rear camera on mobile browsers).
// Resolves to an object URL for the chosen image, or null if cancelled.
export function scanDocumentImage() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = () => {
            const file = input.files?.[0];
            resolve(file ? URL.createObjectURL(file) : null);
        };
        input.oncancel = () => resolve(null);
        input.click();
    });
}
