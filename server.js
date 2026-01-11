// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Session configuration
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'checkpoint-system-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.SESSION_SECURE === 'true', // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict' // CSRF protection
  }
}));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
  next();
});

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// Body parser with size limits
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Initialize database
const db = new sqlite3.Database('./checkpoint.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Admin credentials - use environment variables or default (for development only)
// In production, use environment variables with hashed passwords
const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || 'admin',
  passwordHash: process.env.ADMIN_PASSWORD_HASH || null // If not set, will use plain text fallback (dev only)
};

// Reports credentials
const REPORTS_CREDENTIALS = {
  userid: process.env.REPORTS_USERID || 'admin',
  passwordHash: process.env.REPORTS_PASSWORD_HASH || null // If not set, will use plain text fallback (dev only)
};

// Helper function to verify password (supports both bcrypt hashed and plain text for backward compatibility)
async function verifyPassword(inputPassword, storedHash, fallbackPlainText) {
  // If hash is provided, use bcrypt
  if (storedHash && storedHash.startsWith('$2b$')) {
    try {
      return await bcrypt.compare(inputPassword, storedHash);
    } catch (err) {
      console.error('Error verifying password hash:', err);
      return false;
    }
  }
  // Fallback to plain text comparison (development only - NOT for production!)
  if (process.env.NODE_ENV === 'production') {
    console.warn('WARNING: Using plain text password comparison in production!');
  }
  return inputPassword === fallbackPlainText;
}

// Initialize database tables
function initializeDatabase() {
  db.serialize(() => {
    // QR Codes table - stores pre-generated QR codes
    db.run(`
      CREATE TABLE IF NOT EXISTS qr_codes (
        id TEXT PRIMARY KEY,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Vehicle entries table - stores vehicle details linked to QR codes
    db.run(`
      CREATE TABLE IF NOT EXISTS vehicle_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        qr_code_id TEXT NOT NULL,
        vehicle_number TEXT NOT NULL,
        driver_name TEXT NOT NULL,
        mobile_number TEXT,
        vehicle_type TEXT NOT NULL,
        purpose TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id)
      )
    `);

    // Add mobile_number column if it doesn't exist (for existing databases)
    // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check first
    db.get(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='vehicle_entries'
    `, (err, table) => {
      if (table) {
        db.all(`
          PRAGMA table_info(vehicle_entries)
        `, (err, columns) => {
          if (!err) {
            const hasMobileNumber = columns.some(col => col.name === 'mobile_number');
            if (!hasMobileNumber) {
              db.run(`
                ALTER TABLE vehicle_entries 
                ADD COLUMN mobile_number TEXT
              `, (alterErr) => {
                if (alterErr) {
                  console.log('Error adding mobile_number column:', alterErr.message);
                } else {
                  console.log('Added mobile_number column to vehicle_entries table');
                }
              });
            }
          }
        });
      }
    });
  });
}

// Authentication middleware for admin routes
function requireAuth(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return next();
  } else {
    return res.status(401).json({ error: 'Unauthorized - Please login' });
  }
}

// Ensure qr_codes directory exists
const qrCodesDir = path.join(__dirname, 'public', 'qr_codes');
if (!fs.existsSync(qrCodesDir)) {
  fs.mkdirSync(qrCodesDir, { recursive: true });
}

// Validate QR code ID format (5 alphanumeric characters)
function isValidQRCodeId(qrId) {
  if (!qrId || typeof qrId !== 'string') return false;
  // Must be exactly 5 alphanumeric characters (0-9, A-Z)
  return /^[0-9A-Z]{5}$/.test(qrId);
}

// Sanitize QR code ID to prevent path traversal
function sanitizeQRCodeId(qrId) {
  if (!qrId) return null;
  // Remove any path traversal characters and ensure it's alphanumeric
  return qrId.replace(/[^0-9A-Za-z]/g, '').substring(0, 10).toUpperCase();
}

// Generate unique 5-digit alphanumeric QR code ID
function generateQRCodeId() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let qrId = '';
  
  // Generate random 5-digit alphanumeric code
  for (let i = 0; i < 5; i++) {
    qrId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return qrId;
}

// Check if QR code ID exists in database (returns Promise)
function qrCodeIdExists(qrId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM qr_codes WHERE id = ?', [qrId], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(!!row);
      }
    });
  });
}

// Generate unique QR code ID with uniqueness check
async function generateUniqueQRCodeId(maxRetries = 100) {
  let qrId;
  let retries = 0;
  
  do {
    qrId = generateQRCodeId();
    const exists = await qrCodeIdExists(qrId);
    if (!exists) {
      return qrId;
    }
    retries++;
  } while (retries < maxRetries);
  
  // If max retries reached, append a random character to ensure uniqueness
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return qrId + chars.charAt(Math.floor(Math.random() * chars.length));
}

// ==================== AUTHENTICATION ENDPOINTS ====================

// Simple rate limiting for login (in-memory store)
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Clean up old login attempts periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of loginAttempts.entries()) {
    if (now - data.lastAttempt > LOGIN_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, 60000); // Clean up every minute

// Admin login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Rate limiting check
  const now = Date.now();
  const attempts = loginAttempts.get(clientIp) || { count: 0, lastAttempt: 0 };
  
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    const timeSinceLastAttempt = now - attempts.lastAttempt;
    if (timeSinceLastAttempt < LOGIN_WINDOW_MS) {
      const remainingTime = Math.ceil((LOGIN_WINDOW_MS - timeSinceLastAttempt) / 1000 / 60);
      return res.status(429).json({ 
        error: `Too many login attempts. Please try again in ${remainingTime} minute(s).` 
      });
    } else {
      // Reset after window expires
      attempts.count = 0;
    }
  }

  // Validate input length
  if (username.length > 100 || password.length > 100) {
    return res.status(400).json({ error: 'Invalid input length' });
  }

  try {
    // Verify credentials
    const usernameMatch = username === ADMIN_CREDENTIALS.username;
    const passwordMatch = await verifyPassword(
      password, 
      ADMIN_CREDENTIALS.passwordHash, 
      'admin123' // Fallback plain text (development only)
    );

    if (usernameMatch && passwordMatch) {
      // Successful login - reset attempts
      loginAttempts.delete(clientIp);
      req.session.isAuthenticated = true;
      req.session.username = username;
      res.json({
        success: true,
        message: 'Login successful'
      });
    } else {
      // Failed login - increment attempts
      attempts.count++;
      attempts.lastAttempt = now;
      loginAttempts.set(clientIp, attempts);
      res.status(401).json({ error: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check authentication status
app.get('/api/admin/check-auth', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    res.json({
      authenticated: true,
      username: req.session.username
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Error logging out' });
    }
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
});

// ==================== ADMIN ENDPOINTS (PROTECTED) ====================

// Generate multiple QR codes
app.post('/api/admin/generate-qr-codes', requireAuth, async (req, res) => {
  const { count } = req.body;
  
  if (!count || ![10, 50, 100].includes(count)) {
    return res.status(400).json({ error: 'Count must be 10, 50, or 100' });
  }

  const qrCodes = [];
  const errors = [];

  for (let i = 0; i < count; i++) {
    try {
      // Generate unique 5-digit alphanumeric QR code ID
      const qrId = await generateUniqueQRCodeId();
      
      // Validate generated ID
      if (!isValidQRCodeId(qrId)) {
        errors.push({ error: 'Generated invalid QR code ID' });
        continue;
      }
      
      // Generate QR code image - path.join prevents path traversal
      const qrPath = path.join(qrCodesDir, `${qrId}.png`);
      
      // Additional security: ensure path is within qrCodesDir
      const resolvedPath = path.resolve(qrPath);
      const resolvedDir = path.resolve(qrCodesDir);
      if (!resolvedPath.startsWith(resolvedDir)) {
        errors.push({ qrId, error: 'Invalid file path' });
        continue;
      }
      await QRCode.toFile(qrPath, qrId, {
        width: 300,
        margin: 2
      });

      // Store in database
      await new Promise((resolve, reject) => {
        db.run('INSERT INTO qr_codes (id) VALUES (?)', [qrId], (err) => {
          if (err) {
            // If duplicate key error, try generating a new ID
            if (err.message.includes('UNIQUE constraint') || err.message.includes('PRIMARY KEY')) {
              // This shouldn't happen if generateUniqueQRCodeId works correctly,
              // but handle it just in case
              errors.push({ qrId, error: 'Duplicate ID detected' });
            } else {
              errors.push({ qrId, error: err.message });
            }
            reject(err);
          } else {
            resolve();
          }
        });
      });

      qrCodes.push({
        id: qrId,
        imageUrl: `/qr_codes/${qrId}.png`
      });
    } catch (error) {
      errors.push({ error: error.message });
    }
  }

  res.json({
    success: true,
    count: qrCodes.length,
    qrCodes,
    errors: errors.length > 0 ? errors : undefined
  });
});

// Get all QR codes
app.get('/api/admin/qr-codes', requireAuth, (req, res) => {
  db.all(`
    SELECT 
      qc.id,
      qc.generated_at,
      ve.vehicle_number,
      ve.driver_name,
      ve.status,
      ve.created_at as registered_at
    FROM qr_codes qc
    LEFT JOIN vehicle_entries ve ON qc.id = ve.qr_code_id
    ORDER BY qc.generated_at DESC
  `, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Delete single QR code
app.delete('/api/admin/qr-codes/:qrId', requireAuth, (req, res) => {
  let { qrId } = req.params;
  
  // Validate and sanitize QR code ID
  qrId = sanitizeQRCodeId(qrId);
  if (!qrId || !isValidQRCodeId(qrId)) {
    return res.status(400).json({ error: 'Invalid QR code ID format' });
  }

  // Delete QR code image file
  const qrPath = path.join(qrCodesDir, `${qrId}.png`);
  const resolvedPath = path.resolve(qrPath);
  const resolvedDir = path.resolve(qrCodesDir);
  
  // Security check: ensure path is within qrCodesDir
  if (!resolvedPath.startsWith(resolvedDir)) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  // Delete from database (cascade will handle vehicle_entries)
  db.run('DELETE FROM qr_codes WHERE id = ?', [qrId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    // Delete image file if it exists
    if (fs.existsSync(qrPath)) {
      fs.unlink(qrPath, (unlinkErr) => {
        if (unlinkErr) {
          console.error('Error deleting QR code image:', unlinkErr);
          // Still return success since database entry is deleted
        }
      });
    }

    res.json({
      success: true,
      message: 'QR code deleted successfully'
    });
  });
});

// Delete multiple QR codes
app.delete('/api/admin/qr-codes', requireAuth, (req, res) => {
  const { qrIds } = req.body;

  if (!qrIds || !Array.isArray(qrIds) || qrIds.length === 0) {
    return res.status(400).json({ error: 'QR code IDs array required' });
  }

  // Validate all QR code IDs
  const validQrIds = [];
  for (const qrId of qrIds) {
    const sanitized = sanitizeQRCodeId(qrId);
    if (sanitized && isValidQRCodeId(sanitized)) {
      validQrIds.push(sanitized);
    }
  }

  if (validQrIds.length === 0) {
    return res.status(400).json({ error: 'No valid QR code IDs provided' });
  }

  // Delete from database
  const placeholders = validQrIds.map(() => '?').join(',');
  db.run(`DELETE FROM qr_codes WHERE id IN (${placeholders})`, validQrIds, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const deletedCount = this.changes;

    // Delete image files
    let deletedFiles = 0;
    validQrIds.forEach(qrId => {
      const qrPath = path.join(qrCodesDir, `${qrId}.png`);
      const resolvedPath = path.resolve(qrPath);
      const resolvedDir = path.resolve(qrCodesDir);
      
      if (resolvedPath.startsWith(resolvedDir) && fs.existsSync(qrPath)) {
        fs.unlink(qrPath, (unlinkErr) => {
          if (!unlinkErr) {
            deletedFiles++;
          }
        });
      }
    });

    res.json({
      success: true,
      message: `Deleted ${deletedCount} QR code(s) successfully`,
      deletedCount
    });
  });
});

// ==================== GUARD ENDPOINTS ====================

// Scan QR code - get vehicle info or return unregistered
app.get('/api/guard/scan/:qrId', (req, res) => {
  let { qrId } = req.params;
  
  // Validate and sanitize QR code ID
  qrId = sanitizeQRCodeId(qrId);
  if (!qrId || !isValidQRCodeId(qrId)) {
    return res.status(400).json({ error: 'Invalid QR code ID format' });
  }

  // First check if QR code exists
  db.get('SELECT * FROM qr_codes WHERE id = ?', [qrId], (err, qrCode) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    // Check if vehicle is registered
    db.get(
      'SELECT * FROM vehicle_entries WHERE qr_code_id = ? ORDER BY created_at DESC LIMIT 1',
      [qrId],
      (err, vehicle) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        if (!vehicle) {
          return res.json({
            qrCodeId: qrId,
            registered: false,
            message: 'Unregistered - Please enter vehicle details'
          });
        }

        res.json({
          qrCodeId: qrId,
          registered: true,
          vehicle: {
            id: vehicle.id,
            vehicleNumber: vehicle.vehicle_number,
            driverName: vehicle.driver_name,
            mobileNumber: vehicle.mobile_number || '',
            vehicleType: vehicle.vehicle_type,
            purpose: vehicle.purpose,
            status: vehicle.status,
            createdAt: vehicle.created_at,
            updatedAt: vehicle.updated_at
          }
        });
      }
    );
  });
});

// Input validation helper
function validateInput(input, maxLength = 255) {
  if (!input || typeof input !== 'string') return false;
  if (input.length > maxLength) return false;
  // Allow alphanumeric, spaces, hyphens, and common punctuation
  return /^[a-zA-Z0-9\s\-.,!?()]+$/.test(input.trim());
}

// Validate mobile number (allows digits, spaces, hyphens, plus sign, parentheses)
function validateMobileNumber(mobile) {
  if (!mobile || typeof mobile !== 'string') return true; // Optional field
  if (mobile.length > 20) return false;
  // Allow digits, spaces, hyphens, plus, parentheses for international formats
  return /^[\d\s\-\+\(\)]+$/.test(mobile.trim());
}

// Register vehicle (first time scan)
app.post('/api/guard/register-vehicle', (req, res) => {
  let { qrCodeId, vehicleNumber, driverName, mobileNumber, vehicleType, purpose, status } = req.body;

  // Validate and sanitize inputs
  qrCodeId = sanitizeQRCodeId(qrCodeId);
  if (!qrCodeId || !isValidQRCodeId(qrCodeId)) {
    return res.status(400).json({ error: 'Invalid QR code ID format' });
  }

  // Validate input lengths and format only if fields are provided (all fields are optional)
  if (vehicleNumber && vehicleNumber.trim() && !validateInput(vehicleNumber, 50)) {
    return res.status(400).json({ error: 'Invalid vehicle number format or length exceeded' });
  }
  if (driverName && driverName.trim() && !validateInput(driverName, 100)) {
    return res.status(400).json({ error: 'Invalid driver name format or length exceeded' });
  }
  if (vehicleType && vehicleType.trim() && !validateInput(vehicleType, 50)) {
    return res.status(400).json({ error: 'Invalid vehicle type format or length exceeded' });
  }
  if (purpose && purpose.trim() && !validateInput(purpose, 200)) {
    return res.status(400).json({ error: 'Invalid purpose format or length exceeded' });
  }

  // Validate mobile number if provided
  if (mobileNumber && mobileNumber.trim() && !validateMobileNumber(mobileNumber)) {
    return res.status(400).json({ error: 'Invalid mobile number format' });
  }

  // Trim and sanitize inputs (use empty strings for missing fields since DB has NOT NULL constraints)
  vehicleNumber = vehicleNumber ? vehicleNumber.trim().substring(0, 50) : '';
  driverName = driverName ? driverName.trim().substring(0, 100) : '';
  mobileNumber = mobileNumber && mobileNumber.trim() ? mobileNumber.trim().substring(0, 20) : null;
  vehicleType = vehicleType ? vehicleType.trim().substring(0, 50) : '';
  purpose = purpose ? purpose.trim().substring(0, 200) : '';

  // Verify QR code exists
  db.get('SELECT * FROM qr_codes WHERE id = ?', [qrCodeId], (err, qrCode) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    // Insert vehicle entry
    const finalStatus = status || 'allowed';
    db.run(
      `INSERT INTO vehicle_entries (qr_code_id, vehicle_number, driver_name, mobile_number, vehicle_type, purpose, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [qrCodeId, vehicleNumber, driverName, mobileNumber, vehicleType, purpose, finalStatus],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        res.json({
          success: true,
          message: 'Vehicle registered successfully',
          entryId: this.lastID
        });
      }
    );
  });
});

// Update vehicle status (allow/deny)
app.put('/api/guard/update-status/:qrId', (req, res) => {
  let { qrId } = req.params;
  const { status } = req.body;

  // Validate and sanitize QR code ID
  qrId = sanitizeQRCodeId(qrId);
  if (!qrId || !isValidQRCodeId(qrId)) {
    return res.status(400).json({ error: 'Invalid QR code ID format' });
  }

  if (!status || !['allowed', 'denied'].includes(status)) {
    return res.status(400).json({ error: 'Status must be "allowed" or "denied"' });
  }

  db.run(
    `UPDATE vehicle_entries 
     SET status = ?, updated_at = CURRENT_TIMESTAMP 
     WHERE qr_code_id = ?`,
    [status, qrId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Vehicle entry not found' });
      }

      res.json({
        success: true,
        message: `Status updated to ${status}`
      });
    }
  );
});

// Get all vehicle entries
app.get('/api/guard/entries', (req, res) => {
  db.all(`
    SELECT 
      ve.*,
      qc.generated_at as qr_generated_at
    FROM vehicle_entries ve
    JOIN qr_codes qc ON ve.qr_code_id = qc.id
    ORDER BY ve.updated_at DESC
  `, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// ==================== REPORTS ENDPOINTS ====================

// Reports authentication middleware
function requireReportsAuth(req, res, next) {
  if (req.session && req.session.reportsAuthenticated) {
    return next();
  } else {
    return res.status(401).json({ error: 'Unauthorized - Please login' });
  }
}

// Reports login
app.post('/api/reports/login', async (req, res) => {
  const { userid, password } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

  if (!userid || !password) {
    return res.status(400).json({ error: 'User ID and password required' });
  }

  // Rate limiting check (reuse admin rate limiting)
  const now = Date.now();
  const attempts = loginAttempts.get(clientIp) || { count: 0, lastAttempt: 0 };
  
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    const timeSinceLastAttempt = now - attempts.lastAttempt;
    if (timeSinceLastAttempt < LOGIN_WINDOW_MS) {
      const remainingTime = Math.ceil((LOGIN_WINDOW_MS - timeSinceLastAttempt) / 1000 / 60);
      return res.status(429).json({ 
        error: `Too many login attempts. Please try again in ${remainingTime} minute(s).` 
      });
    } else {
      // Reset after window expires
      attempts.count = 0;
    }
  }

  // Validate input length
  if (userid.length > 100 || password.length > 100) {
    return res.status(400).json({ error: 'Invalid input length' });
  }

  try {
    // Verify credentials
    const useridMatch = userid === REPORTS_CREDENTIALS.userid;
    const passwordMatch = await verifyPassword(
      password, 
      REPORTS_CREDENTIALS.passwordHash, 
      'Ravi@2026' // Fallback plain text (development only)
    );

    if (useridMatch && passwordMatch) {
      // Successful login - reset attempts
      loginAttempts.delete(clientIp);
      req.session.reportsAuthenticated = true;
      req.session.reportsUserid = userid;
      res.json({
        success: true,
        message: 'Login successful'
      });
    } else {
      // Failed login - increment attempts
      attempts.count++;
      attempts.lastAttempt = now;
      loginAttempts.set(clientIp, attempts);
      res.status(401).json({ error: 'Invalid user ID or password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check reports authentication status
app.get('/api/reports/check-auth', (req, res) => {
  if (req.session && req.session.reportsAuthenticated) {
    res.json({
      authenticated: true,
      userid: req.session.reportsUserid
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

// Reports logout
app.post('/api/reports/logout', (req, res) => {
  req.session.reportsAuthenticated = false;
  req.session.reportsUserid = null;
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Get all vehicle entries for reports (protected)
app.get('/api/reports/entries', requireReportsAuth, (req, res) => {
  db.all(`
    SELECT 
      ve.*,
      qc.generated_at as qr_generated_at
    FROM vehicle_entries ve
    JOIN qr_codes qc ON ve.qr_code_id = qc.id
    ORDER BY ve.updated_at DESC
  `, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 404 handler for API routes (must be before static middleware fallback)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

