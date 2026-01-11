const API_BASE = 'http://localhost:3000/api';

// Check if already logged in
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/admin/check-auth`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.authenticated) {
            // Already logged in, redirect to admin panel
            window.location.href = 'admin.html';
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

// Handle login form submission
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const statusDiv = document.getElementById('loginStatus');
    
    statusDiv.className = 'status-message info';
    statusDiv.textContent = 'Logging in...';
    
    try {
        const response = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            statusDiv.className = 'status-message success';
            statusDiv.textContent = 'Login successful! Redirecting...';
            setTimeout(() => {
                window.location.href = 'admin.html';
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

