# Security Setup Guide

This guide explains the security improvements and how to configure them properly for production use.

## Security Improvements Applied

### ✅ 1. Environment Variables
- Credentials and secrets are now loaded from environment variables
- Uses `dotenv` package to load `.env` file
- Fallback to defaults for development (NOT secure for production)

### ✅ 2. Password Hashing (bcrypt)
- Passwords can now be stored as bcrypt hashes
- Supports both hashed passwords (production) and plain text (development only)
- Backward compatible with existing plain text passwords during transition

### ✅ 3. Session Security
- Session secret loaded from environment variable
- Added `sameSite: 'strict'` cookie attribute for CSRF protection
- Secure cookie flag can be enabled via environment variable (for HTTPS)

## Setup Instructions

### Step 1: Create `.env` File

Create a `.env` file in the project root directory:

```bash
# Copy the example (if available) or create new
cp .env.example .env
# OR create manually
```

### Step 2: Generate Password Hashes

You need to generate bcrypt hashes for your passwords. You can use Node.js:

```javascript
const bcrypt = require('bcrypt');

// Generate hash for admin password
bcrypt.hash('your-admin-password', 10).then(hash => {
  console.log('Admin password hash:', hash);
});

// Generate hash for reports password
bcrypt.hash('your-reports-password', 10).then(hash => {
  console.log('Reports password hash:', hash);
});
```

Or use the provided helper script (see below).

### Step 3: Configure `.env` File

Add the following to your `.env` file:

```env
# Session Configuration
SESSION_SECRET=your-very-secure-random-session-secret-key-minimum-32-characters

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$10$YourGeneratedBcryptHashHere

# Reports Credentials
REPORTS_USERID=admin
REPORTS_PASSWORD_HASH=$2b$10$YourGeneratedBcryptHashHere

# Server Configuration
NODE_ENV=production
PORT=3000

# Session Cookie Security (set to true when using HTTPS)
SESSION_SECURE=true
```

### Step 4: Generate Secure Session Secret

Generate a random session secret (minimum 32 characters):

```bash
# On Linux/Mac:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# On Windows PowerShell:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Password Hash Generator Script

Create a file `generate-hash.js`:

```javascript
const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter password to hash: ', (password) => {
  bcrypt.hash(password, 10).then(hash => {
    console.log('\nHash generated:');
    console.log(hash);
    console.log('\nAdd this to your .env file:');
    console.log(`PASSWORD_HASH=${hash}`);
    rl.close();
  });
});
```

Run it: `node generate-hash.js`

## Production Checklist

- [ ] Create `.env` file with secure values
- [ ] Generate bcrypt password hashes for all accounts
- [ ] Generate strong session secret (32+ characters)
- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Set `SESSION_SECURE=true` when using HTTPS
- [ ] Never commit `.env` file to version control
- [ ] Use HTTPS in production
- [ ] Regularly rotate passwords and session secrets
- [ ] Keep dependencies updated (`npm audit`)

## Security Notes

1. **Development vs Production**
   - Development: Uses plain text passwords as fallback
   - Production: MUST use bcrypt hashed passwords
   - System will warn if plain text is used in production

2. **Backward Compatibility**
   - System supports both hashed and plain text passwords
   - Use this during migration period
   - Remove plain text fallbacks after full migration

3. **Session Security**
   - `sameSite: 'strict'` helps prevent CSRF attacks
   - `secure: true` required for HTTPS (prevents cookie theft)
   - `httpOnly: true` prevents JavaScript access to cookies

4. **Environment Variables**
   - `.env` file should be in `.gitignore`
   - Use different credentials for dev/staging/production
   - Store production secrets securely (e.g., secrets manager)

## Additional Security Recommendations

1. **CSRF Protection** (Optional)
   - Consider adding CSRF tokens for state-changing operations
   - Current `sameSite: 'strict'` provides basic protection
   - Full CSRF protection requires token-based implementation

2. **Helmet.js** (Optional)
   - Additional security headers middleware
   - Can be added if needed: `npm install helmet`

3. **Rate Limiting** (Already Implemented)
   - Login endpoints have rate limiting (5 attempts per 15 minutes)
   - Consider adding rate limiting to other endpoints if needed

4. **Logging**
   - Monitor failed login attempts
   - Log security events for audit trail
   - Set up alerts for suspicious activity

## Troubleshooting

**Password not working after adding hash?**
- Ensure the hash starts with `$2b$10$`
- Check for extra spaces in `.env` file
- Verify the hash was generated correctly

**Session not persisting?**
- Check `SESSION_SECRET` is set correctly
- Verify cookie settings match your deployment (HTTP vs HTTPS)
- Check browser cookie settings

**Plain text password warning in production?**
- Ensure `NODE_ENV=production` is set
- Verify password hashes are correctly set in `.env`
- Check that hashes start with `$2b$10$`
