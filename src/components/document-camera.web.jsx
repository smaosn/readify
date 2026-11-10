import { useEffect, useRef } from 'react';

// The guided camera needs native ML Kit, which isn't available in the
// browser, so fall back to the file picker (which offers the rear camera on
// mobile browsers). Same props as the native DocumentCamera.
export function DocumentCamera({ visible, onCapture, onCancel }) {
    const handlersRef = useRef({ onCapture, onCancel });
    useEffect(() => {
        handlersRef.current = { onCapture, onCancel };
    });

    useEffect(() => {
        if (!visible) {
            return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = () => {
            const file = input.files?.[0];
            if (file) {
                handlersRef.current.onCapture(URL.createObjectURL(file));
            }
            else {
                handlersRef.current.onCancel();
            }
        };
        input.oncancel = () => handlersRef.current.onCancel();
        input.click();
    }, [visible]);

    return null;
}
