# 🚀 SenditBox Backend - Setup Guide

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or MongoDB Atlas)
- npm or yarn

## Installation Steps

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Environment Setup
Create a `.env` file in the backend directory:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
PORT=5000
NODE_ENV=development

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/senditbox
# OR use MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/senditbox

# JWT Secret (change this to a random string in production)
JWT_SECRET=your_super_secret_jwt_key_change_in_production
JWT_EXPIRE=30d

# File Upload
MAX_FILE_SIZE=10485760

# CORS
CORS_ORIGIN=http://localhost:3000

# Customer App URL (for QR code generation)
CUSTOMER_APP_URL=https://senditbox.app
```

### 3. Set Up MongoDB

**Option A: Local MongoDB**
```bash
# Start MongoDB service
# Windows:
net start MongoDB

# macOS (with Homebrew):
brew services start mongodb-community

# Linux:
sudo systemctl start mongod
```

**Option B: MongoDB Atlas (Cloud)**
1. Create account at https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Get connection string
4. Update MONGODB_URI in `.env`

### 4. Create Super Admin
```bash
npm run create-admin
```

This will create a default admin account:
- Email: `admin@senditbox.com`
- Password: `admin123456`

**⚠️ Important: Change this password immediately after first login!**

### 5. Start the Server

**Development Mode (with auto-reload):**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

The server will start on `http://localhost:5000`

## Testing the API

### Test Server Status
```bash
curl http://localhost:5000/
```

### Test Admin Login
```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@senditbox.com","password":"admin123456"}'
```

### Test Business Registration
```bash
curl -X POST http://localhost:5000/api/business/register \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Coffee Shop",
    "ownerName": "John Doe",
    "email": "john@test.com",
    "password": "password123",
    "phone": "+1234567890",
    "businessType": "Restaurant"
  }'
```

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # MongoDB connection
│   ├── controllers/
│   │   ├── adminController.js   # Admin operations
│   │   ├── businessController.js # Business operations
│   │   ├── feedbackController.js # Feedback submission
│   │   └── qrController.js      # QR code management
│   ├── middleware/
│   │   ├── auth.js              # Authentication & authorization
│   │   └── error.js             # Error handling
│   ├── models/
│   │   ├── Admin.js             # Admin schema
│   │   ├── Business.js          # Business schema
│   │   ├── Feedback.js          # Feedback schema
│   │   └── QRCode.js            # QR Code schema
│   ├── routes/
│   │   ├── adminRoutes.js       # Admin endpoints
│   │   ├── businessRoutes.js    # Business endpoints
│   │   ├── feedbackRoutes.js    # Feedback endpoints
│   │   └── qrRoutes.js          # QR code endpoints
│   ├── scripts/
│   │   └── createSuperAdmin.js  # Admin creation script
│   ├── utils/
│   │   └── jwt.js               # JWT utilities
│   └── server.js                # Main server file
├── uploads/
│   └── voice/                   # Voice feedback files
├── .env.example                 # Environment template
├── .gitignore
├── package.json
├── API_DOCS.md                  # API documentation
└── README.md
```

## API Endpoints Overview

### Public Endpoints (Customer App)
- `POST /api/feedback/text` - Submit text feedback
- `POST /api/feedback/voice` - Submit voice feedback
- `GET /api/qr/:qrId` - Get QR code details

### Business Owner Endpoints
- `POST /api/business/register` - Register business
- `POST /api/business/login` - Login
- `GET /api/business/profile` - Get profile
- `GET /api/business/feedback` - Get all feedback
- `GET /api/business/stats` - Get statistics
- `POST /api/qr/generate` - Generate QR code

### Admin Endpoints
- `POST /api/admin/login` - Admin login
- `GET /api/admin/businesses` - List all businesses
- `PUT /api/admin/businesses/:id/verify` - Verify business
- `GET /api/admin/stats` - System statistics

See [API_DOCS.md](API_DOCS.md) for complete API documentation.

## Development Workflow

1. **Make changes to code**
2. **Server auto-reloads** (if using `npm run dev`)
3. **Test endpoints** using Postman, curl, or your frontend
4. **Check logs** in terminal for errors

## Common Issues

### MongoDB Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution:** Make sure MongoDB is running

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::5000
```
**Solution:** Change PORT in `.env` or kill the process using port 5000

### JWT Secret Not Set
**Solution:** Make sure JWT_SECRET is set in `.env`

## Next Steps

1. ✅ Backend is ready
2. 🎨 Build Customer App (QR scanner + feedback form)
3. 💼 Build Business Owner App (feedback dashboard)
4. 👨‍💼 Build Admin Interface (business management)

## Security Recommendations

Before deploying to production:

- [ ] Change all default passwords
- [ ] Use strong JWT_SECRET
- [ ] Enable HTTPS
- [ ] Set up rate limiting
- [ ] Configure CORS properly
- [ ] Add input validation
- [ ] Set up monitoring and logging
- [ ] Use environment-specific configs
- [ ] Enable MongoDB authentication

## Support

For issues or questions, check:
- API_DOCS.md for API reference
- MongoDB logs for database issues
- Server terminal for runtime errors
