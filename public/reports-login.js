const API_BASE = '/api';

// Check if already logged in
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/reports/check-auth`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.authenticated) {
            // Already logged in, redirect to reports panel
            window.location.href = 'reports.html';
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

// Handle login form submission
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userid = document.getElementById('userid').value;
    const password = document.getElementById('password').value;
    const statusDiv = document.getElementById('loginStatus');
    
    statusDiv.className = 'status-message info';
    statusDiv.textContent = 'Logging in...';
    
    try {
        const response = await fetch(`${API_BASE}/reports/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ userid, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            statusDiv.className = 'status-message success';
            statusDiv.textContent = 'Login successful! Redirecting...';
            setTimeout(() => {
                window.location.href = 'reports.html';
            }, 1000);
        } else {
            throw new Error(data.error || 'Login failed');
        }
    } catch (error) {
        statusDiv.className = 'status-message error';
        statusDiv.textContent = `Error: ${error.message}`;
    }
});

// Check authentication on page load
window.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});
