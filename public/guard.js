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

let stream = null;
let scanning = false;
let scanInterval = null;
let currentQRId = null;

// Start camera for scanning
async function startScanning() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        
        const video = document.getElementById('video');
        video.srcObject = stream;
        
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('stopBtn').style.display = 'inline-block';
        
        scanning = true;
        scanQRCode();
        
        showStatus('Camera started. Point at QR code to scan.', 'info');
    } catch (error) {
        showStatus(`Error accessing camera: ${error.message}`, 'error');
    }
}

// Stop camera
function stopScanning() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    
    scanning = false;
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }
    
    document.getElementById('startBtn').style.display = 'inline-block';
    document.getElementById('stopBtn').style.display = 'none';
    
    showStatus('Camera stopped.', 'info');
}

// Scan QR code from video
function scanQRCode() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');
    
    scanInterval = setInterval(() => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code) {
                handleQRCodeScanned(code.data);
            }
        }
    }, 100);
}

// Manual QR code entry
function manualScan() {
    const qrId = prompt('Enter QR Code ID:');
    if (qrId && qrId.trim()) {
        handleQRCodeScanned(qrId.trim());
    }
}

// Handle scanned QR code
async function handleQRCodeScanned(qrId) {
    if (currentQRId === qrId) return; // Prevent duplicate scans
    currentQRId = qrId;
    
    showStatus(`Scanning QR code: ${qrId}...`, 'info');
    
    try {
        const response = await fetch(`${API_BASE}/guard/scan/${qrId}`);
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server returned non-JSON response. Please check if the server is running.');
        }
        
        const data = await response.json();
        
        if (data.error) {
            showStatus(`Error: ${data.error}`, 'error');
            return;
        }
        
        if (!data.registered) {
            // Unregistered - show registration form
            showRegistrationForm(qrId);
        } else {
            // Registered - show vehicle info
            showVehicleInfo(data.vehicle, qrId);
        }
    } catch (error) {
        showStatus(`Error: ${error.message}`, 'error');
    }
}

// Show registration form
function showRegistrationForm(qrId) {
    document.getElementById('qrCodeId').value = qrId;
    document.getElementById('vehicleInfoSection').style.display = 'none';
    document.getElementById('registerSection').style.display = 'block';
    showStatus('QR code is unregistered. Please enter vehicle details.', 'info');
}

// Show vehicle information
function showVehicleInfo(vehicle, qrId) {
    const infoDiv = document.getElementById('vehicleInfo');
    const statusClass = vehicle.status === 'allowed' ? 'allowed' : 'denied';
    
    const escapedQrId = escapeHtml(qrId).replace(/'/g, "\\'");
    infoDiv.innerHTML = `
        <div class="vehicle-info-card">
            <h3>Vehicle Details</h3>
            <div class="info-row">
                <span class="info-label">QR Code ID:</span>
                <span class="info-value">${escapeHtml(qrId)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Vehicle Number:</span>
                <span class="info-value">${escapeHtml(vehicle.vehicleNumber)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Driver Name:</span>
                <span class="info-value">${escapeHtml(vehicle.driverName)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Mobile Number:</span>
                <span class="info-value">${vehicle.mobileNumber ? escapeHtml(vehicle.mobileNumber) : '<span style="color: #999;">Not provided</span>'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Vehicle Type:</span>
                <span class="info-value">${escapeHtml(vehicle.vehicleType)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Purpose:</span>
                <span class="info-value">${escapeHtml(vehicle.purpose)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="info-value">
                    <span class="status-badge ${statusClass}">${escapeHtml(vehicle.status.toUpperCase())}</span>
                </span>
            </div>
            <div class="info-row">
                <span class="info-label">Registered:</span>
                <span class="info-value">${formatDateIST(vehicle.createdAt, true)}</span>
            </div>
            <div class="button-group" style="margin-top: 20px;">
                <button onclick="updateStatus('${escapedQrId}', 'allowed')" class="btn btn-success">Allow Entry</button>
                <button onclick="updateStatus('${escapedQrId}', 'denied')" class="btn btn-danger">Deny Entry</button>
            </div>
        </div>
    `;
    
    document.getElementById('registerSection').style.display = 'none';
    document.getElementById('vehicleInfoSection').style.display = 'block';
    showStatus('Vehicle information loaded.', 'success');
}

// Register vehicle form submission
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await registerVehicle('allowed');
});

// Deny entry
async function denyEntry() {
    await registerVehicle('denied');
}

// Register vehicle
async function registerVehicle(status) {
    const qrCodeId = document.getElementById('qrCodeId').value;
    const vehicleNumber = document.getElementById('vehicleNumber').value;
    const driverName = document.getElementById('driverName').value;
    const mobileNumber = document.getElementById('mobileNumber').value;
    const vehicleType = document.getElementById('vehicleType').value;
    const purpose = document.getElementById('purpose').value;
    
    try {
        const response = await fetch(`${API_BASE}/guard/register-vehicle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                qrCodeId,
                vehicleNumber: vehicleNumber ? vehicleNumber.trim() : '',
                driverName: driverName ? driverName.trim() : '',
                mobileNumber: mobileNumber && mobileNumber.trim() ? mobileNumber.trim() : null,
                vehicleType: vehicleType ? vehicleType.trim() : '',
                purpose: purpose ? purpose.trim() : '',
                status
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server returned non-JSON response. Please check if the server is running.');
        }
        
        const data = await response.json();
        
        if (data.success) {
            showStatus(`Vehicle registered successfully. Status: ${status.toUpperCase()}`, 'success');
            resetForm();
            loadEntries();
            // Reload the scan to show vehicle info
            setTimeout(() => handleQRCodeScanned(qrCodeId), 1000);
        } else {
            throw new Error(data.error || 'Failed to register vehicle');
        }
    } catch (error) {
        showStatus(`Error: ${error.message}`, 'error');
    }
}

// Update vehicle status
async function updateStatus(qrId, status) {
    try {
        const response = await fetch(`${API_BASE}/guard/update-status/${qrId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server returned non-JSON response. Please check if the server is running.');
        }
        
        const data = await response.json();
        
        if (data.success) {
            showStatus(`Status updated to ${status.toUpperCase()}`, 'success');
            loadEntries();
            // Reload vehicle info
            setTimeout(() => handleQRCodeScanned(qrId), 500);
        } else {
            throw new Error(data.error || 'Failed to update status');
        }
    } catch (error) {
        showStatus(`Error: ${error.message}`, 'error');
    }
}

// Reset form
function resetForm() {
    document.getElementById('registerForm').reset();
    document.getElementById('registerSection').style.display = 'none';
    document.getElementById('vehicleInfoSection').style.display = 'none';
    currentQRId = null;
}

// Load recent entries
async function loadEntries() {
    const listDiv = document.getElementById('entriesList');
    listDiv.innerHTML = '<p>Loading...</p>';
    
    try {
        const response = await fetch(`${API_BASE}/guard/entries`);
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server returned non-JSON response. Please check if the server is running.');
        }
        
        const entries = await response.json();
        
        if (entries.length === 0) {
            listDiv.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No entries yet.</p>';
            return;
        }
        
        listDiv.innerHTML = entries.map(entry => {
            const statusClass = entry.status === 'allowed' ? 'allowed' : entry.status === 'denied' ? 'denied' : 'pending';
            return `
                <div class="entry-card">
                    <div class="entry-header">
                        <h3>${escapeHtml(entry.vehicle_number)}</h3>
                        <span class="status-badge ${statusClass}">${escapeHtml(entry.status.toUpperCase())}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Driver:</span>
                        <span class="info-value">${escapeHtml(entry.driver_name)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Mobile Number:</span>
                        <span class="info-value">${entry.mobile_number ? escapeHtml(entry.mobile_number) : '<span style="color: #999;">Not provided</span>'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Type:</span>
                        <span class="info-value">${escapeHtml(entry.vehicle_type)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Purpose:</span>
                        <span class="info-value">${escapeHtml(entry.purpose)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">QR Code ID:</span>
                        <span class="info-value">${escapeHtml(entry.qr_code_id)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Last Updated:</span>
                        <span class="info-value">${formatDateIST(entry.updated_at, true)}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        listDiv.innerHTML = `<p class="status-message error">Error loading entries: ${error.message}</p>`;
    }
}

// Show status message
function showStatus(message, type) {
    const statusDiv = document.getElementById('scanStatus');
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message;
}

// Load entries on page load
window.addEventListener('DOMContentLoaded', () => {
    loadEntries();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopScanning();
});

