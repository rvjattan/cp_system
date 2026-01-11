# Vehicle Checkpoint System with QR Codes

A complete QR code-based vehicle checkpoint management system that allows pre-generating QR codes and registering vehicles at the checkpoint.

## Features

✅ **Pre-generate QR Codes** - Admin can generate 10, 50, or 100 blank QR codes in advance  
✅ **Admin Authentication** - Admin panel protected with username/password login  
✅ **QR Code Scanning** - Guards can scan QR codes using camera or manual entry  
✅ **Vehicle Registration** - Register vehicle details when QR code is first scanned  
✅ **Status Management** - Allow or deny entry, change status anytime  
✅ **Data Persistence** - All data stored in SQLite database  
✅ **Modern UI** - Beautiful, responsive interface  

## System Workflow

### Step 1: Admin - Login & Generate QR Codes
1. Go to Admin Panel (will redirect to login page)
2. Login with username and password
   - **Default Username:** `admin`
   - **Default Password:** `admin123`
   - ⚠️ **Change these credentials in production!**
3. Click "Generate 10/50/100 QR Codes"
4. QR codes are created with unique IDs
5. QR code images are saved and can be printed/distributed

### Step 2: Guard - Vehicle Arrives
1. Go to Guard Panel
2. Start camera and scan QR code (or enter manually)
3. If unregistered:
   - Enter vehicle details (Number, Driver Name, Type, Purpose)
   - Click "Allow Entry" or "Deny Entry"
4. If already registered:
   - View vehicle details and current status
   - Change status if needed

### Step 3: Future Scans
- Same QR code shows vehicle information
- Status can be updated without regenerating QR codes
- All data persists in database

## Installation

1. **Install Node.js** (if not already installed)
   - Download from https://nodejs.org/

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start the Server**
   ```bash
   npm start
   ```
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

4. **Access the Application**
   - Open browser and go to: `http://localhost:3000`
   - You'll see the home page with Admin and Guard panels

## Default Login Credentials

**Admin Panel:**
- Username: `admin`
- Password: `admin123`

⚠️ **IMPORTANT:** Change the default credentials in `server.js` before deploying to production!

To change credentials, edit the `ADMIN_CREDENTIALS` object in `server.js`:
```javascript
const ADMIN_CREDENTIALS = {
  username: 'your-username',
  password: 'your-secure-password'
};
```

## Project Structure

```
cp_system/
├── server.js              # Express server and API endpoints
├── package.json           # Dependencies and scripts
├── checkpoint.db          # SQLite database (created automatically)
├── public/
│   ├── index.html         # Home page
│   ├── admin.html         # Admin panel
│   ├── guard.html         # Guard panel
│   ├── styles.css         # Styling
│   ├── admin.js           # Admin functionality
│   ├── guard.js           # Guard functionality
│   └── qr_codes/          # Generated QR code images
└── README.md              # This file
```

## API Endpoints

### Authentication Endpoints
- `POST /api/admin/login` - Admin login (body: `{username, password}`)
- `GET /api/admin/check-auth` - Check authentication status
- `POST /api/admin/logout` - Admin logout

### Admin Endpoints (Protected - Requires Login)
- `POST /api/admin/generate-qr-codes` - Generate QR codes (body: `{count: 10|50|100}`)
- `GET /api/admin/qr-codes` - Get all QR codes with registration status

### Guard Endpoints
- `GET /api/guard/scan/:qrId` - Scan QR code and get vehicle info
- `POST /api/guard/register-vehicle` - Register new vehicle
- `PUT /api/guard/update-status/:qrId` - Update vehicle status
- `GET /api/guard/entries` - Get all vehicle entries

## Database Schema

### qr_codes
- `id` (TEXT, PRIMARY KEY) - Unique QR code identifier
- `generated_at` (DATETIME) - When QR code was created

### vehicle_entries
- `id` (INTEGER, PRIMARY KEY) - Auto-increment ID
- `qr_code_id` (TEXT, FOREIGN KEY) - Links to qr_codes table
- `vehicle_number` (TEXT) - Vehicle registration number
- `driver_name` (TEXT) - Driver's name
- `vehicle_type` (TEXT) - Type of vehicle
- `purpose` (TEXT) - Purpose of visit
- `status` (TEXT) - 'allowed', 'denied', or 'pending'
- `created_at` (DATETIME) - Registration timestamp
- `updated_at` (DATETIME) - Last update timestamp

## Usage Tips

1. **Generate QR codes in batches** - Generate 50-100 at a time for efficiency
2. **Print QR codes** - QR code images are saved in `public/qr_codes/` folder
3. **Camera access** - Browser will ask for camera permission on first scan
4. **Manual entry** - Use "Manual Entry" button if camera is not available
5. **Status updates** - You can change allow/deny status anytime without regenerating QR codes

## Technologies Used

- **Backend**: Node.js, Express.js
- **Database**: SQLite3
- **Authentication**: express-session (session-based)
- **QR Code Generation**: qrcode library
- **QR Code Scanning**: jsQR library (client-side)
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)

## Notes

- QR codes contain only unique IDs, not vehicle data
- All vehicle data is stored in the database
- QR codes can be reused - status can be changed without generating new codes
- Database file (`checkpoint.db`) is created automatically on first run
- QR code images are stored in `public/qr_codes/` directory

## Troubleshooting

**Camera not working?**
- Make sure you're using HTTPS or localhost
- Check browser permissions for camera access
- Use "Manual Entry" as alternative

**Database errors?**
- Delete `checkpoint.db` file and restart server
- Make sure you have write permissions in the project directory

**Port already in use?**
- Change PORT in `server.js` to a different port (e.g., 3001)

