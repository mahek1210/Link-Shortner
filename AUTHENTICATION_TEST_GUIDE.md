# Authentication System Test Guide

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
MONGO_URI=mongodb://localhost:27017/link-shortener

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random

# Server Configuration
PORT=5000
NODE_ENV=development
```

## Postman Test Scenarios

### 1. Test User Signup
**POST** `http://localhost:5000/api/auth/signup`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123"
}
```

**Expected Response (201):**
```json
{
  "message": "User created successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "username": "testuser",
    "email": "test@example.com",
    "role": "user",
    "createdAt": "2023-09-06T10:30:00.000Z"
  }
}
```

### 2. Test User Login
**POST** `http://localhost:5000/api/auth/login`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "email": "test@example.com",
  "password": "password123"
}
```

**Expected Response (200):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "username": "testuser",
    "email": "test@example.com",
    "role": "user",
    "lastLogin": "2023-09-06T10:35:00.000Z"
  }
}
```

### 3. Test Protected Route (GET /api/user/urls)
**GET** `http://localhost:5000/api/user/urls`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN_HERE
Content-Type: application/json
```

**Expected Response (200):**
```json
{
  "urls": []
}
```

### 4. Test Protected Route Without Token (Should Fail)
**GET** `http://localhost:5000/api/user/urls`

**Headers:**
```
Content-Type: application/json
```

**Expected Response (401):**
```json
{
  "error": "Access denied. No token provided.",
  "message": "Please provide a valid JWT token in the Authorization header"
}
```

### 5. Test URL Creation (Protected Route)
**POST** `http://localhost:5000/api/shorten`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN_HERE
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "originalUrl": "https://www.google.com"
}
```

**Expected Response (201):**
```json
{
  "message": "URL shortened successfully",
  "shortUrl": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d1",
    "originalUrl": "https://www.google.com",
    "shortId": "abc123",
    "shortUrl": "http://localhost:5000/abc123",
    "clicks": 0,
    "createdAt": "2023-09-06T10:40:00.000Z"
  }
}
```

### 6. Test URL Creation Without Token (Should Fail)
**POST** `http://localhost:5000/api/shorten`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "originalUrl": "https://www.google.com"
}
```

**Expected Response (401):**
```json
{
  "error": "Access denied. No token provided.",
  "message": "Please provide a valid JWT token in the Authorization header"
}
```

### 7. Test Get User Profile
**GET** `http://localhost:5000/api/auth/me`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN_HERE
Content-Type: application/json
```

**Expected Response (200):**
```json
{
  "user": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "username": "testuser",
    "email": "test@example.com",
    "role": "user",
    "isActive": true,
    "createdAt": "2023-09-06T10:30:00.000Z",
    "lastLogin": "2023-09-06T10:35:00.000Z"
  }
}
```

## Error Testing

### Invalid Credentials
**POST** `http://localhost:5000/api/auth/login`

**Body (JSON):**
```json
{
  "email": "test@example.com",
  "password": "wrongpassword"
}
```

**Expected Response (401):**
```json
{
  "error": "Invalid email or password"
}
```

### Duplicate User Signup
**POST** `http://localhost:5000/api/auth/signup`

**Body (JSON):**
```json
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123"
}
```

**Expected Response (409):**
```json
{
  "error": "User with this email already exists",
  "field": "email"
}
```

### Expired Token
Use an expired token in the Authorization header and expect a 401 response with "Token expired" error.

## Summary of Fixes Applied

1. **User Model (`src/models/User.js`)**:
   - Added email validation with regex pattern
   - Enhanced password validation with stronger requirements
   - Added indexes for better query performance
   - Improved schema validation messages
   - Added `toJSON` method to exclude password from responses

2. **Auth Controller (`src/controllers/authController.js`)**:
   - Added JWT_SECRET validation
   - Enhanced error handling with specific error types
   - Improved input validation
   - Better security practices (no password in responses)
   - Added proper HTTP status codes
   - Enhanced token generation with more secure options

3. **Auth Routes (`src/routes/authRoutes.js`)**:
   - Added logout route
   - Enhanced route organization
   - Added proper route documentation
   - Improved error handling consistency

4. **Auth Middleware (`src/middleware/auth.js`)**:
   - Added JWT_SECRET validation
   - Enhanced error handling with specific error types
   - Improved token extraction from multiple sources
   - Better error messages for different scenarios
   - Added proper HTTP status codes
   - Enhanced adminAuth middleware
   - Added token validation with issuer/audience

5. **URL Routes (`src/routes/urlRoutes.js`)**:
   - Added authentication middleware to `/api/shorten` route
   - Added proper route documentation
   - Organized routes by authentication requirement

## Security Features

- ✅ Password hashing with bcryptjs (salt rounds: 12)
- ✅ JWT token generation with expiration (7 days)
- ✅ Secure password storage (never returned in responses)
- ✅ Input validation and sanitization
- ✅ Rate limiting on auth endpoints
- ✅ Proper error handling without information leakage
- ✅ Token verification with issuer/audience validation
- ✅ Account deactivation support
- ✅ Protected routes requiring authentication
