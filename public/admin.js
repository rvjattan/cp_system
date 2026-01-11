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

// Load all QR codes
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
        
        listDiv.innerHTML = qrCodes.map((qr, index) => {
            const isRegistered = qr.vehicle_number !== null;
            const statusClass = isRegistered ? 'registered' : 'unregistered';
            const statusText = isRegistered ? 'Registered' : 'Unregistered';
            
            const escapedId = escapeHtml(qr.id);
            const escapedVehicleNumber = isRegistered ? escapeHtml(qr.vehicle_number) : '';
            return `
                <div class="qr-code-card" data-qr-id="${escapedId}">
                    <div class="qr-card-checkbox">
                        <input type="checkbox" class="qr-checkbox" id="qr-${index}" value="${escapedId}" onchange="updateSelectionCount()">
                        <label for="qr-${index}"></label>
                    </div>
                    <img src="/qr_codes/${escapedId}.png" alt="QR Code ${escapedId}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'150\' height=\'150\'%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EQR Code%3C/text%3E%3C/svg%3E'">
                    <div class="qr-id">${escapedId}</div>
                    <div class="status ${statusClass}">${statusText}</div>
                    ${isRegistered ? `<div style="margin-top: 10px; font-size: 0.85em; color: #666;">Vehicle: ${escapedVehicleNumber}</div>` : ''}
                    <div style="margin-top: 5px; font-size: 0.75em; color: #999;">Generated: ${formatDateIST(qr.generated_at, false)}</div>
                    <div class="qr-card-actions" style="margin-top: 10px; display: flex; gap: 5px; justify-content: center;">
                        <button onclick="printSingle('${escapedId.replace(/'/g, "\\'")}')" class="btn-small btn-secondary" title="Print">🖨️</button>
                        <button onclick="downloadSingle('${escapedId.replace(/'/g, "\\'")}')" class="btn-small btn-secondary" title="Download">💾</button>
                    </div>
                </div>
            `;
        }).join('');
        
        updateSelectionCount();
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

// Download multiple selected QR codes as ZIP (using JSZip if available, or individual downloads)
async function downloadSelected() {
    const selectedIds = getSelectedQRIds();
    
    if (selectedIds.length === 0) {
        alert('Please select at least one QR code to download.');
        return;
    }
    
    if (selectedIds.length === 1) {
        // Single download
        downloadSingle(selectedIds[0]);
        return;
    }
    
    // For multiple downloads, we'll download them one by one
    // (In a production environment, you might want to create a ZIP file on the server)
    const confirmDownload = confirm(`Download ${selectedIds.length} QR codes? They will download one by one.`);
    
    if (confirmDownload) {
        for (let i = 0; i < selectedIds.length; i++) {
            setTimeout(() => {
                downloadSingle(selectedIds[i]);
            }, i * 300); // Stagger downloads to avoid browser blocking
        }
    }
}

// Load QR codes on page load
window.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
        loadQRCodes();
    }
});

