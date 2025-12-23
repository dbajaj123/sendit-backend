# 📦 SenditBox Backend - Complete Overview

## ✅ What's Been Created

A fully functional REST API backend for the SenditBox feedback platform with:

### 🏗️ Core Architecture
- **Node.js + Express** - Web framework
- **MongoDB + Mongoose** - Database and ORM
- **JWT Authentication** - Secure token-based auth
- **File Upload Support** - Multer for voice feedback
- **Error Handling** - Centralized error management
- **CORS Support** - Cross-origin resource sharing

### 📊 Database Models (4 Collections)

1. **Business** - Business owner accounts
   - Registration, login, profile management
   - Subscription tracking
   - Verification status

2. **QRCode** - QR code management
   - Unique QR IDs mapped to businesses
   - Location tracking
   - Scan and feedback counters

3. **Feedback** - Customer feedback
   - Text and voice feedback support
   - Rating system (1-5 stars)
   - Read/resolved status
   - Business response capability
   - Tags for organization

4. **Admin** - Platform administrators
   - Role-based permissions
   - Super-admin, admin, support roles
   - Activity tracking

### 🔐 Authentication & Authorization

- **JWT-based authentication**
- **Role separation**: Business owners vs Admins
- **Permission system** for admin roles
- **Password hashing** with bcryptjs
- **Protected routes** with middleware

### 🌐 API Endpoints (20+ endpoints)

#### Customer App (Public)
- Submit text feedback
- Submit voice feedback
- Get QR code details

#### Business Owner App (Protected)
- Register/Login
- Manage profile
- View/filter feedback
- Mark feedback as read/resolved
- Add responses and tags
- View statistics
- Generate QR codes
- Manage QR codes

#### Admin Interface (Protected)
- Admin login
- List all businesses
- View business details
- Verify businesses
- Activate/deactivate businesses
- System statistics
- Create new admins

### 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js              # MongoDB connection
│   ├── controllers/
│   │   ├── adminController.js       # Admin logic (9 endpoints)
│   │   ├── businessController.js    # Business logic (8 endpoints)
│   │   ├── feedbackController.js    # Feedback submission (2 endpoints)
│   │   └── qrController.js          # QR management (5 endpoints)
│   ├── middleware/
│   │   ├── auth.js                  # Authentication & authorization
│   │   └── error.js                 # Error handling
│   ├── models/
│   │   ├── Admin.js                 # Admin schema
│   │   ├── Business.js              # Business schema
│   │   ├── Feedback.js              # Feedback schema
│   │   └── QRCode.js                # QR Code schema
│   ├── routes/
│   │   ├── adminRoutes.js           # Admin API routes
│   │   ├── businessRoutes.js        # Business API routes
│   │   ├── feedbackRoutes.js        # Feedback API routes
│   │   └── qrRoutes.js              # QR API routes
│   ├── scripts/
│   │   └── createSuperAdmin.js      # Create initial admin
│   ├── utils/
│   │   └── jwt.js                   # JWT utilities
│   └── server.js                    # Main application entry
├── uploads/
│   └── voice/                       # Voice feedback storage
├── .env.example                     # Environment template
├── .gitignore
├── package.json
├── start.bat                        # Windows quick start
├── API_DOCS.md                      # Complete API documentation
├── SETUP.md                         # Detailed setup guide
├── README.md                        # Project overview
└── SenditBox_API.postman_collection.json  # Postman tests
```

## 🎯 Key Features Implemented

### 1. QR Code System
- ✅ Generate unique QR codes per business
- ✅ Map QR codes to business IDs
- ✅ Track scans and feedback counts
- ✅ Multiple QR codes per business (different locations)
- ✅ Activate/deactivate QR codes

### 2. Feedback Management
- ✅ Text feedback submission
- ✅ Voice feedback with file upload
- ✅ Optional customer details
- ✅ Rating system (1-5 stars)
- ✅ Read/unread tracking
- ✅ Resolved status
- ✅ Business responses
- ✅ Tagging system
- ✅ Advanced filtering (date, type, status, QR)
- ✅ Pagination support

### 3. Business Owner Features
- ✅ Self-registration
- ✅ Login/authentication
- ✅ Profile management
- ✅ Feedback inbox with filters
- ✅ Statistics dashboard
- ✅ QR code generation
- ✅ Data ownership (no admin access to feedback)

### 4. Admin Features
- ✅ Secure admin login
- ✅ Business listing and search
- ✅ Business verification
- ✅ Business activation/deactivation
- ✅ System-wide statistics
- ✅ Admin creation (super-admin only)
- ✅ Permission-based access
- ✅ No access to feedback content (privacy)

### 5. Security Features
- ✅ Password hashing
- ✅ JWT token authentication
- ✅ Role-based access control
- ✅ Permission system
- ✅ Input validation
- ✅ Error handling
- ✅ CORS configuration

## 🚀 Getting Started

### Quick Start (3 steps)

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your MongoDB connection
   ```

3. **Start the server**
   ```bash
   npm run dev
   ```

Or on Windows, just double-click `start.bat`!

### Create Initial Admin
```bash
npm run create-admin
```

Login credentials:
- Email: `admin@senditbox.com`
- Password: `admin123456`

## 📖 Documentation

- **[SETUP.md](SETUP.md)** - Complete setup instructions
- **[API_DOCS.md](API_DOCS.md)** - Full API reference
- **[SenditBox_API.postman_collection.json](SenditBox_API.postman_collection.json)** - Postman collection for testing

## 🧪 Testing

### Using Postman
1. Import `SenditBox_API.postman_collection.json`
2. Test all endpoints with pre-configured requests
3. Tokens are automatically saved after login

### Using cURL
```bash
# Test server
curl http://localhost:5000/

# Admin login
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@senditbox.com","password":"admin123456"}'
```

## 📊 Database Collections

- **businesses** - Business owner accounts
- **qrcodes** - QR code mappings
- **feedbacks** - Customer feedback
- **admins** - Platform administrators

## 🔄 Typical User Flows

### Customer Submits Feedback
1. Customer scans QR code
2. App gets QR details: `GET /api/qr/:qrId`
3. Customer submits feedback: `POST /api/feedback/text` or `/voice`
4. Feedback stored with business mapping
5. QR feedback counter incremented

### Business Owner Views Feedback
1. Owner logs in: `POST /api/business/login`
2. Gets feedback list: `GET /api/business/feedback`
3. Views specific feedback: `GET /api/business/feedback/:id`
4. Marks as read/resolved: `PUT /api/business/feedback/:id`
5. Views stats: `GET /api/business/stats`

### Admin Manages Platform
1. Admin logs in: `POST /api/admin/login`
2. Views all businesses: `GET /api/admin/businesses`
3. Verifies business: `PUT /api/admin/businesses/:id/verify`
4. Views system stats: `GET /api/admin/stats`

## 🎨 Next Steps - Frontend Apps

Now that the backend is ready, you can build:

### 1. Customer Mobile App
- QR code scanner
- Feedback submission form (text/voice)
- Simple, no-login interface
- Tech: React Native, Flutter, or PWA

### 2. Business Owner App
- Login/dashboard
- Feedback inbox with filters
- Statistics and analytics
- QR code generator
- Tech: React, Vue, or Angular

### 3. Admin Web Portal
- Business management
- System monitoring
- Analytics dashboard
- Admin user management
- Tech: React Admin, Vue, or custom

## 🔒 Security Checklist for Production

Before deploying:

- [ ] Change default admin password
- [ ] Use strong JWT_SECRET (random 64+ chars)
- [ ] Enable MongoDB authentication
- [ ] Use MongoDB Atlas or secure MongoDB instance
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS for specific domains
- [ ] Add rate limiting (express-rate-limit)
- [ ] Add request validation
- [ ] Set up logging (Winston, Morgan)
- [ ] Add monitoring (PM2, New Relic)
- [ ] Use environment variables for all secrets
- [ ] Implement backup strategy
- [ ] Add API versioning

## 📈 Scalability Considerations

The backend is designed for scale:

- **Indexed database queries** for fast lookups
- **Pagination** on all list endpoints
- **Stateless authentication** (JWT) for horizontal scaling
- **File upload** ready (can be moved to S3/CloudStorage)
- **Separated concerns** (easy to microservice later)

## 🛠️ Technologies Used

- **Node.js** - Runtime
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **Bcrypt** - Password hashing
- **Multer** - File uploads
- **QRCode** - QR generation
- **UUID** - Unique IDs
- **CORS** - Cross-origin support
- **Dotenv** - Environment config

## 📝 License

This is a proprietary project for SenditBox.

---

**Status: ✅ Backend Complete and Ready for Integration**

The backend is fully functional and ready to support all three applications:
- Customer App
- Business Owner App
- Admin Interface

You can now proceed with frontend development!
