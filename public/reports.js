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

// Check authentication and redirect if not logged in
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/reports/check-auth`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (!data.authenticated) {
            window.location.href = 'reports-login.html';
            return false;
        }
        
        // Show user info in header
        const userInfo = document.getElementById('userInfo');
        if (userInfo && data.userid) {
            userInfo.textContent = `Logged in as: ${data.userid}`;
        }
        
        return true;
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = 'reports-login.html';
        return false;
    }
}

// Logout function
async function logout() {
    try {
        const response = await fetch(`${API_BASE}/reports/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
        const data = await response.json();
        if (data.success) {
            window.location.href = 'reports-login.html';
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Still redirect even if logout fails
        window.location.href = 'reports-login.html';
    }
}

// Load and display reports
async function loadReports() {
    const listDiv = document.getElementById('reportsList');
    listDiv.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Loading reports...</p>';
    
    try {
        const statusFilter = document.getElementById('statusFilter').value;
        const searchQuery = document.getElementById('searchInput').value.toLowerCase();
        
        const response = await fetch(`${API_BASE}/reports/entries`, {
            credentials: 'include'
        });
        
        if (response.status === 401) {
            window.location.href = 'reports-login.html';
            return;
        }
        
        const entries = await response.json();
        
        if (!entries || entries.length === 0) {
            listDiv.innerHTML = '<div class="no-data"><p>No vehicle entries found.</p></div>';
            return;
        }
        
        // Filter entries
        let filteredEntries = entries;
        if (statusFilter) {
            filteredEntries = filteredEntries.filter(entry => entry.status === statusFilter);
        }
        if (searchQuery) {
            filteredEntries = filteredEntries.filter(entry => {
                const vehicleNumber = (entry.vehicle_number || '').toLowerCase();
                const driverName = (entry.driver_name || '').toLowerCase();
                const qrCodeId = (entry.qr_code_id || '').toLowerCase();
                const purpose = (entry.purpose || '').toLowerCase();
                return vehicleNumber.includes(searchQuery) || 
                       driverName.includes(searchQuery) || 
                       qrCodeId.includes(searchQuery) ||
                       purpose.includes(searchQuery);
            });
        }
        
        if (filteredEntries.length === 0) {
            listDiv.innerHTML = '<div class="no-data"><p>No entries match your filters.</p></div>';
            return;
        }
        
        // Create table
        let tableHTML = `
            <table class="reports-table">
                <thead>
                    <tr>
                        <th>QR Code</th>
                        <th>QR Code ID</th>
                        <th>Vehicle Number</th>
                        <th>Driver Name</th>
                        <th>Mobile Number</th>
                        <th>Vehicle Type</th>
                        <th>Purpose</th>
                        <th>Status</th>
                        <th>Registered At</th>
                        <th>Last Updated</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        filteredEntries.forEach(entry => {
            const statusClass = entry.status === 'allowed' ? 'allowed' : 
                               entry.status === 'denied' ? 'denied' : 'pending';
            const qrCodePath = `qr_codes/${entry.qr_code_id}.png`;
            const registeredAt = new Date(entry.created_at).toLocaleString();
            const updatedAt = new Date(entry.updated_at).toLocaleString();
            
            tableHTML += `
                <tr>
                    <td>
                        <img src="${escapeHtml(qrCodePath)}" 
                             alt="QR Code ${escapeHtml(entry.qr_code_id)}" 
                             class="qr-code-img"
                             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'80\' height=\'80\'%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EN/A%3C/text%3E%3C/svg%3E'">
                    </td>
                    <td>${escapeHtml(entry.qr_code_id || 'N/A')}</td>
                    <td>${escapeHtml(entry.vehicle_number || 'N/A')}</td>
                    <td>${escapeHtml(entry.driver_name || 'N/A')}</td>
                    <td>${escapeHtml(entry.mobile_number || 'N/A')}</td>
                    <td>${escapeHtml(entry.vehicle_type || 'N/A')}</td>
                    <td>${escapeHtml(entry.purpose || 'N/A')}</td>
                    <td>
                        <span class="status-badge status-${statusClass}">
                            ${escapeHtml((entry.status || 'pending').toUpperCase())}
                        </span>
                    </td>
                    <td>${registeredAt}</td>
                    <td>${updatedAt}</td>
                </tr>
            `;
        });
        
        tableHTML += `
                </tbody>
            </table>
            <div style="margin-top: 20px; text-align: center; color: #666;">
                <p>Showing ${filteredEntries.length} of ${entries.length} entries</p>
            </div>
        `;
        
        listDiv.innerHTML = tableHTML;
    } catch (error) {
        listDiv.innerHTML = `<div class="no-data"><p class="status-message error">Error loading reports: ${error.message}</p></div>`;
    }
}

// Export to CSV
function exportToCSV() {
    const statusFilter = document.getElementById('statusFilter').value;
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();
    
    fetch(`${API_BASE}/reports/entries`, {
        credentials: 'include'
    })
    .then(response => response.json())
    .then(entries => {
        // Filter entries (same logic as loadReports)
        let filteredEntries = entries;
        if (statusFilter) {
            filteredEntries = filteredEntries.filter(entry => entry.status === statusFilter);
        }
        if (searchQuery) {
            filteredEntries = filteredEntries.filter(entry => {
                const vehicleNumber = (entry.vehicle_number || '').toLowerCase();
                const driverName = (entry.driver_name || '').toLowerCase();
                const qrCodeId = (entry.qr_code_id || '').toLowerCase();
                const purpose = (entry.purpose || '').toLowerCase();
                return vehicleNumber.includes(searchQuery) || 
                       driverName.includes(searchQuery) || 
                       qrCodeId.includes(searchQuery) ||
                       purpose.includes(searchQuery);
            });
        }
        
        // Create CSV content
        const headers = ['QR Code ID', 'Vehicle Number', 'Driver Name', 'Mobile Number', 'Vehicle Type', 'Purpose', 'Status', 'Registered At', 'Last Updated'];
        const rows = filteredEntries.map(entry => [
            entry.qr_code_id || '',
            entry.vehicle_number || '',
            entry.driver_name || '',
            entry.mobile_number || '',
            entry.vehicle_type || '',
            entry.purpose || '',
            entry.status || '',
            new Date(entry.created_at).toLocaleString(),
            new Date(entry.updated_at).toLocaleString()
        ]);
        
        // Convert to CSV
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `vehicle_entries_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    })
    .catch(error => {
        alert(`Error exporting CSV: ${error.message}`);
    });
}

// Load reports on page load
window.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
        loadReports();
    }
});
