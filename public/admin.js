const API_BASE = '/api';

// HTML escaping function to prevent XSS
function escapeHtml(text) {
    if (text == null) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Convert date to Indian Standard Time (IST - UTC+5:30) and format
function formatDateIST(dateString, includeTime = true) {
    if (!dateString) return 'N/A';
    
    // SQLite returns dates as "YYYY-MM-DD HH:MM:SS" (UTC without timezone indicator)
    // Convert to ISO format with 'Z' to indicate UTC
    let isoString = dateString;
    if (typeof dateString === 'string' && !dateString.endsWith('Z') && !dateString.includes('T')) {
        // Format: "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SSZ"
        isoString = dateString.replace(' ', 'T') + 'Z';
    } else if (typeof dateString === 'string' && !dateString.endsWith('Z') && dateString.includes('T')) {
        // Format: "YYYY-MM-DDTHH:MM:SS" -> "YYYY-MM-DDTHH:MM:SSZ"
        isoString = dateString + 'Z';
    }
    
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
    const istTimestamp = date.getTime() + istOffset;
    const istDate = new Date(istTimestamp);
    
    // Format: DD/MM/YYYY HH:MM:SS (IST) or DD/MM/YYYY
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const year = istDate.getUTCFullYear();
    
    if (includeTime) {
        const hours = String(istDate.getUTCHours()).padStart(2, '0');
        const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
        const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds} IST`;
    } else {
        return `${day}/${month}/${year}`;
    }
}

// Check authentication and redirect if not logged in
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/admin/check-auth`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (!data.authenticated) {
            window.location.href = 'admin-login.html';
            return false;
        }
        
        // Show username in header
        const userInfo = document.getElementById('userInfo');
        if (userInfo && data.username) {
            userInfo.textContent = `Logged in as: ${data.username}`;
        }
        
        return true;
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = 'admin-login.html';
        return false;
    }
}

// Logout function
async function logout() {
    try {
        const response = await fetch(`${API_BASE}/admin/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
        const data = await response.json();
        if (data.success) {
            window.location.href = 'admin-login.html';
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Still redirect even if logout fails
        window.location.href = 'admin-login.html';
    }
}

// Generate QR codes from input field
function generateQRCodesFromInput() {
    const input = document.getElementById('qrCountInput');
    const count = parseInt(input.value, 10);
    
    if (!count || count < 1 || count > 1000) {
        const statusDiv = document.getElementById('generateStatus');
        statusDiv.className = 'status-message error';
        statusDiv.textContent = 'Please enter a valid number between 1 and 1000.';
        input.focus();
        return;
    }
    
    generateQRCodes(count);
}

// Generate QR codes
async function generateQRCodes(count) {
    const statusDiv = document.getElementById('generateStatus');
    statusDiv.className = 'status-message info';
    statusDiv.textContent = `Generating ${count} QR codes...`;

    try {
        const response = await fetch(`${API_BASE}/admin/generate-qr-codes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ count })
        });
        
        if (response.status === 401) {
            window.location.href = 'admin-login.html';
            return;
        }

        const data = await response.json();

        if (data.success) {
            statusDiv.className = 'status-message success';
            statusDiv.textContent = `Successfully generated ${data.count} QR codes!`;
            loadQRCodes();
        } else {
            throw new Error(data.error || 'Failed to generate QR codes');
        }
    } catch (error) {
        statusDiv.className = 'status-message error';
        statusDiv.textContent = `Error: ${error.message}`;
    }
}

// Load all QR codes grouped by date
async function loadQRCodes() {
    const listDiv = document.getElementById('qrCodesList');
    listDiv.innerHTML = '<p>Loading...</p>';

    try {
        const response = await fetch(`${API_BASE}/admin/qr-codes`, {
            credentials: 'include'
        });
        
        if (response.status === 401) {
            window.location.href = 'admin-login.html';
            return;
        }
        
        const qrCodes = await response.json();

        if (qrCodes.length === 0) {
            listDiv.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No QR codes generated yet. Generate some QR codes to get started!</p>';
            return;
        }

        // Store QR codes globally for print/download functions
        window.allQRCodes = qrCodes;
        
        // Group QR codes by batch_id (each generation creates a new batch)
        const groupedByBatch = {};
        qrCodes.forEach(qr => {
            // Use batch_id if available, otherwise group by generation time (for backward compatibility)
            const batchKey = qr.batch_id || `batch_${new Date(qr.generated_at).getTime()}`;
            
            if (!groupedByBatch[batchKey]) {
                groupedByBatch[batchKey] = [];
            }
            groupedByBatch[batchKey].push(qr);
        });
        
        // Store batch information globally for selection
        window.allBatches = groupedByBatch;
        
        // Sort batches by generation time (newest first)
        const sortedBatches = Object.keys(groupedByBatch).sort((a, b) => {
            const batchA = groupedByBatch[a];
            const batchB = groupedByBatch[b];
            const timeA = new Date(batchA[0].generated_at).getTime();
            const timeB = new Date(batchB[0].generated_at).getTime();
            return timeB - timeA;
        });
        
        // Build HTML for grouped list
        let html = '<div class="qr-groups-list">';
        
        sortedBatches.forEach((batchKey, groupIndex) => {
            const groupQRCodes = groupedByBatch[batchKey];
            const firstQR = groupQRCodes[0];
            const dateObj = new Date(firstQR.generated_at);
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(dateObj.getTime() + istOffset);
            
            // Format date and time for display
            const dateOnly = formatDateIST(firstQR.generated_at, false);
            const dateTimeFull = formatDateIST(firstQR.generated_at, true);
            
            const groupId = `group-${groupIndex}`;
            const escapedBatchKey = escapeHtml(batchKey);
            
            html += `
                <div class="qr-group-item">
                    <div class="qr-group-header" onclick="toggleGroup('${groupId}')">
                        <div class="qr-group-header-left">
                            <div class="qr-batch-checkbox" onclick="event.stopPropagation();">
                                <input type="checkbox" class="batch-checkbox" id="batch-${groupIndex}" value="${escapedBatchKey}" onchange="updateBatchSelectionCount()">
                                <label for="batch-${groupIndex}"></label>
                            </div>
                            <span class="qr-group-toggle" id="toggle-${groupId}">▼</span>
                            <div class="qr-group-info">
                                <span class="qr-group-date">${escapeHtml(dateOnly)}</span>
                                <span class="qr-group-time">${escapeHtml(dateTimeFull)}</span>
                                <span class="qr-group-count">(${groupQRCodes.length} QR code${groupQRCodes.length !== 1 ? 's' : ''})</span>
                            </div>
                        </div>
                        <div class="qr-group-actions">
                            <button class="btn btn-primary btn-small" onclick="event.stopPropagation(); downloadBatchQRs('${escapedBatchKey}', ${groupIndex})" title="Download all QR codes from this batch as ZIP">
                                💾 Download ZIP (${groupQRCodes.length})
                            </button>
                            <button class="btn btn-danger btn-small" onclick="event.stopPropagation(); deleteBatchQRs('${escapedBatchKey}', ${groupIndex})" title="Delete all QR codes from this batch">
                                🗑️ Delete All (${groupQRCodes.length})
                            </button>
                        </div>
                    </div>
                    <div class="qr-group-content" id="${groupId}" style="display: none;">
                        <div class="qr-codes-grid">
            `;
            
            groupQRCodes.forEach((qr, index) => {
                const isRegistered = qr.vehicle_number !== null;
                const statusClass = isRegistered ? 'registered' : 'unregistered';
                const statusText = isRegistered ? 'Registered' : 'Unregistered';
                
                const escapedId = escapeHtml(qr.id);
                const escapedVehicleNumber = isRegistered ? escapeHtml(qr.vehicle_number) : '';
                const uniqueIndex = `${groupIndex}-${index}`;
                
                html += `
                    <div class="qr-code-card" data-qr-id="${escapedId}">
                        <div class="qr-card-checkbox">
                            <input type="checkbox" class="qr-checkbox" id="qr-${uniqueIndex}" value="${escapedId}" onchange="updateSelectionCount()">
                            <label for="qr-${uniqueIndex}"></label>
                        </div>
                        <img src="/qr_codes/${escapedId}.png" alt="QR Code ${escapedId}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'150\' height=\'150\'%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EQR Code%3C/text%3E%3C/svg%3E'">
                        <div class="qr-id">${escapedId}</div>
                        <div class="status ${statusClass}">${statusText}</div>
                        ${isRegistered ? `<div style="margin-top: 10px; font-size: 0.85em; color: #666;">Vehicle: ${escapedVehicleNumber}</div>` : ''}
                        <div class="qr-card-actions" style="margin-top: 10px; display: flex; gap: 5px; justify-content: center;">
                            <button onclick="printSingle('${escapedId.replace(/'/g, "\\'")}')" class="btn-small btn-secondary" title="Print">🖨️</button>
                            <button onclick="downloadSingle('${escapedId.replace(/'/g, "\\'")}')" class="btn-small btn-secondary" title="Download">💾</button>
                            <button onclick="deleteSingleQR('${escapedId.replace(/'/g, "\\'")}')" class="btn-small btn-danger" title="Delete">🗑️</button>
                        </div>
                    </div>
                `;
            });
            
            html += `
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        listDiv.innerHTML = html;
        
        updateSelectionCount();
        updateBatchSelectionCount();
    } catch (error) {
        listDiv.innerHTML = `<p class="status-message error">Error loading QR codes: ${error.message}</p>`;
    }
}

// Selection management
function selectAll() {
    const checkboxes = document.querySelectorAll('.qr-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    updateSelectionCount();
}

function deselectAll() {
    const checkboxes = document.querySelectorAll('.qr-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateSelectionCount();
}

function updateSelectionCount() {
    const checked = document.querySelectorAll('.qr-checkbox:checked').length;
    const total = document.querySelectorAll('.qr-checkbox').length;
    const countElement = document.getElementById('selectionCount');
    if (countElement) {
        countElement.textContent = `${checked} of ${total} selected`;
        countElement.style.display = checked > 0 ? 'inline-block' : 'none';
    }
}

// Batch selection management
function selectAllBatches() {
    const checkboxes = document.querySelectorAll('.batch-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    updateBatchSelectionCount();
}

function deselectAllBatches() {
    const checkboxes = document.querySelectorAll('.batch-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateBatchSelectionCount();
}

function updateBatchSelectionCount() {
    const checked = document.querySelectorAll('.batch-checkbox:checked').length;
    const total = document.querySelectorAll('.batch-checkbox').length;
    const countElement = document.getElementById('batchSelectionCount');
    if (countElement) {
        countElement.textContent = `${checked} batch${checked !== 1 ? 'es' : ''} selected`;
        countElement.style.display = checked > 0 ? 'inline-block' : 'none';
    }
}

function getSelectedBatchKeys() {
    const checkboxes = document.querySelectorAll('.batch-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function getSelectedQRIds() {
    const checkboxes = document.querySelectorAll('.qr-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// Print single QR code
function printSingle(qrId) {
    const qrCode = window.allQRCodes.find(qr => qr.id === qrId);
    if (!qrCode) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>QR Code - ${qrId}</title>
            <style>
                @media print {
                    @page {
                        size: A4;
                        margin: 20mm;
                    }
                    body {
                        margin: 0;
                        padding: 0;
                    }
                }
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    padding: 20px;
                }
                .qr-container {
                    text-align: center;
                    page-break-inside: avoid;
                }
                .qr-image {
                    max-width: 300px;
                    height: auto;
                    margin: 20px 0;
                }
                .qr-id {
                    font-size: 18px;
                    font-weight: bold;
                    margin: 10px 0;
                    color: #333;
                }
                .qr-info {
                    font-size: 14px;
                    color: #666;
                    margin-top: 10px;
                }
            </style>
        </head>
        <body>
            <div class="qr-container">
                <div class="qr-id">${escapeHtml(qrId)}</div>
                <img src="${window.location.origin}/qr_codes/${escapeHtml(qrId)}.png" alt="QR Code" class="qr-image" onerror="this.style.display='none';">
                <div class="qr-info">Generated: ${formatDateIST(qrCode.generated_at, true)}</div>
                ${qrCode.vehicle_number ? `<div class="qr-info">Vehicle: ${escapeHtml(qrCode.vehicle_number)}</div>` : ''}
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
    }, 250);
}

// Download single QR code
function downloadSingle(qrId) {
    const link = document.createElement('a');
    link.href = `/qr_codes/${qrId}.png`;
    link.download = `QR_Code_${qrId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Print multiple selected QR codes
function printSelected() {
    const selectedIds = getSelectedQRIds();
    
    if (selectedIds.length === 0) {
        alert('Please select at least one QR code to print.');
        return;
    }
    
    const selectedQRCodes = window.allQRCodes.filter(qr => selectedIds.includes(qr.id));
    
    const printWindow = window.open('', '_blank');
    let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>QR Codes - ${selectedIds.length} codes</title>
            <style>
                @media print {
                    @page {
                        size: A4;
                        margin: 15mm;
                    }
                    body {
                        margin: 0;
                        padding: 0;
                    }
                }
                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                }
                .qr-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 30px;
                    margin-bottom: 30px;
                }
                .qr-container {
                    text-align: center;
                    page-break-inside: avoid;
                    border: 1px solid #ddd;
                    padding: 15px;
                    border-radius: 8px;
                }
                .qr-image {
                    max-width: 200px;
                    height: auto;
                    margin: 10px 0;
                }
                .qr-id {
                    font-size: 14px;
                    font-weight: bold;
                    margin: 10px 0;
                    color: #333;
                    word-break: break-all;
                }
                .qr-info {
                    font-size: 12px;
                    color: #666;
                    margin-top: 5px;
                }
            </style>
        </head>
        <body>
            <h1 style="text-align: center; margin-bottom: 30px;">QR Codes (${selectedIds.length} codes)</h1>
            <div class="qr-grid">
    `;
    
    selectedQRCodes.forEach(qr => {
        htmlContent += `
            <div class="qr-container">
                <div class="qr-id">${escapeHtml(qr.id)}</div>
                <img src="${window.location.origin}/qr_codes/${escapeHtml(qr.id)}.png" alt="QR Code" class="qr-image" onerror="this.style.display='none';">
                <div class="qr-info">${formatDateIST(qr.generated_at, false)}</div>
                ${qr.vehicle_number ? `<div class="qr-info">Vehicle: ${escapeHtml(qr.vehicle_number)}</div>` : ''}
            </div>
        `;
    });
    
    htmlContent += `
            </div>
        </body>
        </html>
    `;
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
    }, 250);
}

// Download selected batches as ZIP file
async function downloadSelectedBatches() {
    const selectedBatchKeys = getSelectedBatchKeys();
    
    if (selectedBatchKeys.length === 0) {
        alert('Please select at least one batch to download.');
        return;
    }
    
    // Check if JSZip is available
    if (typeof JSZip === 'undefined') {
        alert('ZIP functionality not available. Please download batches individually.');
        return;
    }
    
    // Collect all QR codes from selected batches
    const selectedQRCodes = [];
    let totalCount = 0;
    
    selectedBatchKeys.forEach(batchKey => {
        const batchQRCodes = window.allBatches[batchKey] || [];
        selectedQRCodes.push(...batchQRCodes);
        totalCount += batchQRCodes.length;
    });
    
    if (selectedQRCodes.length === 0) {
        alert('No QR codes found in selected batches.');
        return;
    }
    
    try {
        // Show loading message
        const statusDiv = document.getElementById('generateStatus');
        if (statusDiv) {
            statusDiv.className = 'status-message info';
            statusDiv.textContent = `Preparing ZIP file with ${totalCount} QR code(s) from ${selectedBatchKeys.length} batch${selectedBatchKeys.length !== 1 ? 'es' : ''}...`;
        }
        
        const zip = new JSZip();
        const promises = [];
        
        // Fetch all QR code images and add them to ZIP
        for (const qr of selectedQRCodes) {
            const promise = fetch(`/qr_codes/${qr.id}.png`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch QR code ${qr.id}`);
                    }
                    return response.blob();
                })
                .then(blob => {
                    // Add file to ZIP with descriptive name
                    zip.file(`QR_Code_${qr.id}.png`, blob);
                })
                .catch(error => {
                    console.error(`Error fetching QR code ${qr.id}:`, error);
                    // Continue with other files even if one fails
                });
            
            promises.push(promise);
        }
        
        // Wait for all images to be fetched
        await Promise.all(promises);
        
        // Generate ZIP file
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        // Create download link
        const link = document.createElement('a');
        const url = URL.createObjectURL(zipBlob);
        const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
        link.href = url;
        link.download = `QR_Codes_${selectedBatchKeys.length}_Batches_${totalCount}_${timestamp}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        // Show success message
        if (statusDiv) {
            statusDiv.className = 'status-message success';
            statusDiv.textContent = `Successfully downloaded ${totalCount} QR code(s) from ${selectedBatchKeys.length} selected batch${selectedBatchKeys.length !== 1 ? 'es' : ''}!`;
            setTimeout(() => {
                statusDiv.textContent = '';
            }, 3000);
        }
    } catch (error) {
        console.error('Error creating ZIP file:', error);
        alert(`Error creating ZIP file: ${error.message}. Please try downloading individually.`);
    }
}

// Download all QR codes as ZIP file
async function downloadAll() {
    // Check if QR codes are loaded
    if (!window.allQRCodes || window.allQRCodes.length === 0) {
        alert('No QR codes available. Please refresh the list first.');
        return;
    }
    
    // Check if JSZip is available
    if (typeof JSZip === 'undefined') {
        alert('ZIP functionality not available. Please download QR codes individually.');
        return;
    }
    
    const allQRCodes = window.allQRCodes;
    
    try {
        // Show loading message
        const statusDiv = document.getElementById('generateStatus');
        if (statusDiv) {
            statusDiv.className = 'status-message info';
            statusDiv.textContent = `Preparing ZIP file with all ${allQRCodes.length} QR code(s)...`;
        }
        
        const zip = new JSZip();
        const promises = [];
        
        // Fetch all QR code images and add them to ZIP
        for (const qr of allQRCodes) {
            const promise = fetch(`/qr_codes/${qr.id}.png`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch QR code ${qr.id}`);
                    }
                    return response.blob();
                })
                .then(blob => {
                    // Add file to ZIP with descriptive name
                    zip.file(`QR_Code_${qr.id}.png`, blob);
                })
                .catch(error => {
                    console.error(`Error fetching QR code ${qr.id}:`, error);
                    // Continue with other files even if one fails
                });
            
            promises.push(promise);
        }
        
        // Wait for all images to be fetched
        await Promise.all(promises);
        
        // Generate ZIP file
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        // Create download link
        const link = document.createElement('a');
        const url = URL.createObjectURL(zipBlob);
        const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
        link.href = url;
        link.download = `QR_Codes_All_${allQRCodes.length}_${timestamp}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        // Show success message
        if (statusDiv) {
            statusDiv.className = 'status-message success';
            statusDiv.textContent = `Successfully downloaded all ${allQRCodes.length} QR code(s) as ZIP file!`;
            setTimeout(() => {
                statusDiv.textContent = '';
            }, 3000);
        }
    } catch (error) {
        console.error('Error creating ZIP file:', error);
        alert(`Error creating ZIP file: ${error.message}. Please try downloading individually.`);
    }
}

// Download multiple selected QR codes as ZIP file
async function downloadSelected() {
    const selectedIds = getSelectedQRIds();
    
    if (selectedIds.length === 0) {
        alert('Please select at least one QR code to download.');
        return;
    }
    
    // Check if JSZip is available
    if (typeof JSZip === 'undefined') {
        // Fallback to single download if JSZip not loaded
        if (selectedIds.length === 1) {
            downloadSingle(selectedIds[0]);
        } else {
            alert('ZIP functionality not available. Please download QR codes individually.');
        }
        return;
    }
    
    try {
        // Show loading message
        const statusDiv = document.getElementById('generateStatus');
        if (statusDiv) {
            statusDiv.className = 'status-message info';
            statusDiv.textContent = `Preparing ZIP file with ${selectedIds.length} QR code(s)...`;
        }
        
        const zip = new JSZip();
        const promises = [];
        
        // Fetch all QR code images and add them to ZIP
        for (const qrId of selectedIds) {
            const promise = fetch(`/qr_codes/${qrId}.png`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch QR code ${qrId}`);
                    }
                    return response.blob();
                })
                .then(blob => {
                    // Add file to ZIP with descriptive name
                    zip.file(`QR_Code_${qrId}.png`, blob);
                })
                .catch(error => {
                    console.error(`Error fetching QR code ${qrId}:`, error);
                    // Continue with other files even if one fails
                });
            
            promises.push(promise);
        }
        
        // Wait for all images to be fetched
        await Promise.all(promises);
        
        // Generate ZIP file
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        // Create download link
        const link = document.createElement('a');
        const url = URL.createObjectURL(zipBlob);
        const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
        link.href = url;
        link.download = `QR_Codes_${selectedIds.length}_${timestamp}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        // Show success message
        if (statusDiv) {
            statusDiv.className = 'status-message success';
            statusDiv.textContent = `Successfully downloaded ${selectedIds.length} QR code(s) as ZIP file!`;
            setTimeout(() => {
                statusDiv.textContent = '';
            }, 3000);
        }
    } catch (error) {
        console.error('Error creating ZIP file:', error);
        alert(`Error creating ZIP file: ${error.message}. Please try downloading individually.`);
        
        // Fallback to individual downloads
        if (selectedIds.length === 1) {
            downloadSingle(selectedIds[0]);
        }
    }
}

// Toggle group expand/collapse
function toggleGroup(groupId) {
    const content = document.getElementById(groupId);
    const toggle = document.getElementById(`toggle-${groupId}`);
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        content.style.display = 'none';
        toggle.textContent = '▶';
    }
}

// Download all QR codes from a specific batch
async function downloadBatchQRs(batchKey, groupIndex) {
    if (typeof JSZip === 'undefined') {
        alert('ZIP functionality not available. Please download QR codes individually.');
        return;
    }
    
    // Get all QR codes from this batch
    const batchQRCodes = window.allBatches && window.allBatches[batchKey] ? window.allBatches[batchKey] : [];
    
    if (batchQRCodes.length === 0) {
        alert('No QR codes found for this batch.');
        return;
    }
    
    try {
        // Show loading message
        const statusDiv = document.getElementById('generateStatus');
        if (statusDiv) {
            statusDiv.className = 'status-message info';
            statusDiv.textContent = `Preparing ZIP file with ${batchQRCodes.length} QR code(s) from ${formatDateIST(batchQRCodes[0].generated_at, true)}...`;
        }
        
        const zip = new JSZip();
        const promises = [];
        
        // Fetch all QR code images and add them to ZIP
        for (const qr of batchQRCodes) {
            const promise = fetch(`/qr_codes/${qr.id}.png`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch QR code ${qr.id}`);
                    }
                    return response.blob();
                })
                .then(blob => {
                    // Add file to ZIP with descriptive name
                    zip.file(`QR_Code_${qr.id}.png`, blob);
                })
                .catch(error => {
                    console.error(`Error fetching QR code ${qr.id}:`, error);
                });
            
            promises.push(promise);
        }
        
        // Wait for all images to be fetched
        await Promise.all(promises);
        
        // Generate ZIP file
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        // Create download link
        const link = document.createElement('a');
        const url = URL.createObjectURL(zipBlob);
        const dateFormatted = formatDateIST(batchQRCodes[0].generated_at, true).replace(/[\/\s:]/g, '_').replace('_IST', '');
        link.href = url;
        link.download = `QR_Codes_Batch_${dateFormatted}_${batchQRCodes.length}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        // Show success message
        if (statusDiv) {
            statusDiv.className = 'status-message success';
            statusDiv.textContent = `Successfully downloaded ${batchQRCodes.length} QR code(s) from batch generated at ${formatDateIST(batchQRCodes[0].generated_at, true)}!`;
            setTimeout(() => {
                statusDiv.textContent = '';
            }, 3000);
        }
    } catch (error) {
        console.error('Error creating ZIP file:', error);
        alert(`Error creating ZIP file: ${error.message}`);
    }
}

// Delete single QR code
async function deleteSingleQR(qrId) {
    if (!confirm(`Are you sure you want to delete QR code ${qrId}? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/qr-codes/${qrId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.status === 401) {
            window.location.href = 'admin-login.html';
            return;
        }

        const data = await response.json();

        if (data.success) {
            // Reload QR codes list
            loadQRCodes();
            // Show success message
            const statusDiv = document.getElementById('generateStatus');
            if (statusDiv) {
                statusDiv.className = 'status-message success';
                statusDiv.textContent = 'QR code deleted successfully!';
                setTimeout(() => {
                    statusDiv.textContent = '';
                }, 3000);
            }
        } else {
            throw new Error(data.error || 'Failed to delete QR code');
        }
    } catch (error) {
        alert(`Error deleting QR code: ${error.message}`);
    }
}

// Delete selected QR codes
async function deleteSelected() {
    const selectedIds = getSelectedQRIds();

    if (selectedIds.length === 0) {
        alert('Please select at least one QR code to delete.');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedIds.length} QR code(s)? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/qr-codes`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ qrIds: selectedIds })
        });

        if (response.status === 401) {
            window.location.href = 'admin-login.html';
            return;
        }

        const data = await response.json();

        if (data.success) {
            // Reload QR codes list
            loadQRCodes();
            // Show success message
            const statusDiv = document.getElementById('generateStatus');
            if (statusDiv) {
                statusDiv.className = 'status-message success';
                statusDiv.textContent = `Successfully deleted ${data.deletedCount} QR code(s)!`;
                setTimeout(() => {
                    statusDiv.textContent = '';
                }, 3000);
            }
        } else {
            throw new Error(data.error || 'Failed to delete QR codes');
        }
    } catch (error) {
        alert(`Error deleting QR codes: ${error.message}`);
    }
}

// Delete all QR codes from a specific batch
async function deleteBatchQRs(batchKey, groupIndex) {
    // Get all QR codes from this batch
    const batchQRCodes = window.allBatches && window.allBatches[batchKey] ? window.allBatches[batchKey] : [];
    
    if (batchQRCodes.length === 0) {
        alert('No QR codes found for this batch.');
        return;
    }

    if (!confirm(`Are you sure you want to delete all ${batchQRCodes.length} QR code(s) from batch generated at ${formatDateIST(batchQRCodes[0].generated_at, true)}? This action cannot be undone.`)) {
        return;
    }

    try {
        const qrIds = batchQRCodes.map(qr => qr.id);
        
        const response = await fetch(`${API_BASE}/admin/qr-codes`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ qrIds })
        });

        if (response.status === 401) {
            window.location.href = 'admin-login.html';
            return;
        }

        const data = await response.json();

        if (data.success) {
            // Reload QR codes list
            loadQRCodes();
            // Show success message
            const statusDiv = document.getElementById('generateStatus');
            if (statusDiv) {
                statusDiv.className = 'status-message success';
                statusDiv.textContent = `Successfully deleted ${data.deletedCount} QR code(s) from batch generated at ${formatDateIST(batchQRCodes[0].generated_at, true)}!`;
                setTimeout(() => {
                    statusDiv.textContent = '';
                }, 3000);
            }
        } else {
            throw new Error(data.error || 'Failed to delete QR codes');
        }
    } catch (error) {
        alert(`Error deleting QR codes: ${error.message}`);
    }
}

// Allow Enter key to trigger generation
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('qrCountInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                generateQRCodesFromInput();
            }
        });
    }
});

// Load QR codes on page load
window.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
        loadQRCodes();
    }
});

