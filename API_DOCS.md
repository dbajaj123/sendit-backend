# SenditBox API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication
Most endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

---

## 📱 Customer App Endpoints (Public)

### Submit Text Feedback
```http
POST /feedback/text
Content-Type: application/json

{
  "qrId": "uuid-here",
  "content": "Great service!",
  "customerName": "John Doe (optional)",
  "customerContact": "john@example.com (optional)",
  "rating": 5 (optional, 1-5)
}
```

### Submit Voice Feedback
```http
POST /feedback/voice
Content-Type: multipart/form-data

{
  "qrId": "uuid-here",
  "voice": <audio file>,
  "voiceDuration": 30 (optional, in seconds),
  "customerName": "John Doe (optional)",
  "customerContact": "john@example.com (optional)",
  "rating": 5 (optional, 1-5)
}
```

### Get QR Code Details
```http
GET /qr/:qrId
```

---

## 🏢 Business Owner Endpoints

### Register Business
```http
POST /business/register
Content-Type: application/json

{
  "businessName": "Coffee Shop",
  "ownerName": "Jane Smith",
  "email": "jane@coffeeshop.com",
  "password": "securepassword",
  "phone": "+1234567890",
  "address": "123 Main St",
  "businessType": "Restaurant"
}
```

### Business Login
```http
POST /business/login
Content-Type: application/json

{
  "email": "jane@coffeeshop.com",
  "password": "securepassword"
}
```

### Get Business Profile
```http
GET /business/profile
Authorization: Bearer <token>
```

### Update Business Profile
```http
PUT /business/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "businessName": "New Name",
  "phone": "+1234567890",
  "address": "New Address"
}
```

### Get All Feedback
```http
GET /business/feedback?page=1&limit=20&feedbackType=text&isRead=false
Authorization: Bearer <token>

Query Parameters:
- page: Page number (default: 1)
- limit: Items per page (default: 20)
- feedbackType: "text" or "voice"
- isRead: true/false
- isResolved: true/false
- qrId: Filter by specific QR code
- startDate: Filter from date (ISO format)
- endDate: Filter to date (ISO format)
```

### Get Single Feedback
```http
GET /business/feedback/:id
Authorization: Bearer <token>
```

### Update Feedback
```http
PUT /business/feedback/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "isRead": true,
  "isResolved": true,
  "businessResponse": "Thank you for your feedback!",
  "tags": ["positive", "service"]
}
```

### Get Statistics
```http
GET /business/stats
Authorization: Bearer <token>
```

### Generate QR Code
```http
POST /qr/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "businessId": "business_id_here",
  "location": "Front Desk",
  "description": "Main entrance QR code"
}
```

### Get QR Codes for Business
```http
GET /qr/business/:businessId
Authorization: Bearer <token>
```

### Update QR Code
```http
PUT /qr/:qrId
Authorization: Bearer <token>
Content-Type: application/json

{
  "isActive": true,
  "location": "Updated Location",
  "description": "Updated description"
}
```

### Delete QR Code
```http
DELETE /qr/:qrId
Authorization: Bearer <token>
```

---

## 👨‍💼 Admin Endpoints

### Admin Login
```http
POST /admin/login
Content-Type: application/json

{
  "email": "admin@senditbox.com",
  "password": "admin123456"
}
```

### Get All Businesses
```http
GET /admin/businesses?page=1&limit=20&isVerified=true&search=coffee
Authorization: Bearer <token>

Query Parameters:
- page: Page number
- limit: Items per page
- isVerified: Filter by verification status
- isActive: Filter by active status
- search: Search by name, owner, or email
```

### Get Business by ID
```http
GET /admin/businesses/:id
Authorization: Bearer <token>
```

### Verify Business
```http
PUT /admin/businesses/:id/verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "isVerified": true
}
```

### Update Business Status
```http
PUT /admin/businesses/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "isActive": true
}
```

### Get System Statistics
```http
GET /admin/stats
Authorization: Bearer <token>
```

### Create New Admin
```http
POST /admin/create
Authorization: Bearer <token> (Super Admin only)
Content-Type: application/json

{
  "name": "New Admin",
  "email": "newadmin@senditbox.com",
  "password": "securepassword",
  "role": "admin",
  "permissions": {
    "canManageBusinesses": true,
    "canManageQRCodes": true,
    "canViewSystemLogs": true,
    "canManageAdmins": false
  }
}
```

---

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message",
  "errors": ["Optional array of error details"]
}
```

---

## Status Codes

- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error
