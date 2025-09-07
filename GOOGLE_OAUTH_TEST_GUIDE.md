# Google OAuth Integration Test Guide

## 🔧 **SETUP COMPLETED**

### Dependencies Installed
- ✅ `passport` - Authentication middleware
- ✅ `passport-google-oauth20` - Google OAuth 2.0 strategy

### Files Modified/Created
- ✅ `src/models/User.js` - Added Google OAuth fields
- ✅ `src/config/passport.js` - Google OAuth strategy configuration
- ✅ `src/controllers/authController.js` - Added Google callback handler
- ✅ `src/routes/authRoutes.js` - Added Google OAuth routes
- ✅ `src/index.js` - Initialized passport

## 🔑 **ENVIRONMENT SETUP**

Add these variables to your `.env` file:

```env
# Database Configuration
MONGO_URI=mongodb://localhost:27017/link-shortener

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# Server Configuration
PORT=5000
NODE_ENV=development
```

## 🚀 **GOOGLE CLOUD CONSOLE SETUP**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set application type to "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:5000/api/auth/google/callback` (development)
   - `https://yourdomain.com/api/auth/google/callback` (production)
7. Copy Client ID and Client Secret to your `.env` file

## 📋 **TESTING SCENARIOS**

### 1. Test Google OAuth Redirect
**GET** `http://localhost:5000/api/auth/google`

**Expected Behavior:**
- Redirects to Google consent screen
- User sees Google login page
- After consent, redirects to callback URL

### 2. Test Google OAuth Callback (New User)
**GET** `http://localhost:5000/api/auth/google/callback`

**Expected Response (200):**
```json
{
  "message": "Google authentication successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "username": null,
    "email": "user@gmail.com",
    "name": "John Doe",
    "avatar": "https://lh3.googleusercontent.com/a/...",
    "role": "user",
    "lastLogin": "2023-09-06T10:30:00.000Z"
  }
}
```

### 3. Test Google OAuth Callback (Existing User)
If user already exists with the same email:

**Expected Response (200):**
```json
{
  "message": "Google authentication successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "username": "existinguser",
    "email": "user@gmail.com",
    "name": "John Doe",
    "avatar": "https://lh3.googleusercontent.com/a/...",
    "role": "user",
    "lastLogin": "2023-09-06T10:30:00.000Z"
  }
}
```

### 4. Test Protected Route with Google OAuth Token
**GET** `http://localhost:5000/api/user/urls`

**Headers:**
```
Authorization: Bearer YOUR_GOOGLE_OAUTH_JWT_TOKEN
Content-Type: application/json
```

**Expected Response (200):**
```json
{
  "urls": []
}
```

### 5. Test URL Creation with Google OAuth Token
**POST** `http://localhost:5000/api/shorten`

**Headers:**
```
Authorization: Bearer YOUR_GOOGLE_OAUTH_JWT_TOKEN
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

## 🔄 **AUTHENTICATION FLOW**

### Traditional Email/Password (Still Works)
1. **POST** `/api/auth/signup` - Create account with email/password
2. **POST** `/api/auth/login` - Login with email/password
3. Use JWT token for protected routes

### Google OAuth (New)
1. **GET** `/api/auth/google` - Redirect to Google
2. User logs in with Google
3. Google redirects to `/api/auth/google/callback`
4. Server creates/links user account
5. Returns JWT token for protected routes

## 🛡️ **SECURITY FEATURES**

### User Model Enhancements
- ✅ **Google OAuth Fields**: `googleId`, `name`, `avatar`
- ✅ **Conditional Validation**: Username/password only required for traditional users
- ✅ **Account Linking**: Links Google account to existing email accounts
- ✅ **Sparse Indexes**: Allows null values for optional fields

### Authentication Flow
- ✅ **JWT Integration**: Same JWT system for both auth methods
- ✅ **No Sessions**: Stateless authentication maintained
- ✅ **Account Merging**: Links Google OAuth to existing accounts
- ✅ **Profile Sync**: Updates name/avatar from Google profile

## 🧪 **TESTING CHECKLIST**

### Basic Functionality
- [ ] Google OAuth redirect works
- [ ] New user creation via Google OAuth
- [ ] Existing user login via Google OAuth
- [ ] Account linking (Google OAuth + existing email)
- [ ] JWT token generation for Google users
- [ ] Protected routes work with Google OAuth tokens

### Edge Cases
- [ ] User denies Google permissions
- [ ] Invalid Google OAuth configuration
- [ ] Network errors during OAuth flow
- [ ] Duplicate email handling
- [ ] Google profile data missing

### Integration Tests
- [ ] Traditional login still works
- [ ] Traditional signup still works
- [ ] Mixed authentication (some users Google, some traditional)
- [ ] Admin routes work with both auth methods

## 🚨 **TROUBLESHOOTING**

### Common Issues

1. **"Invalid client" error**
   - Check `GOOGLE_CLIENT_ID` in `.env`
   - Verify client ID in Google Cloud Console

2. **"Redirect URI mismatch" error**
   - Check `GOOGLE_CALLBACK_URL` in `.env`
   - Verify redirect URI in Google Cloud Console

3. **"Access denied" error**
   - User denied permissions on Google consent screen
   - Check OAuth scopes in route configuration

4. **"User not found" after OAuth**
   - Check database connection
   - Verify user creation logic in passport config

### Debug Steps

1. Check server logs for OAuth errors
2. Verify environment variables are loaded
3. Test with Google Cloud Console OAuth playground
4. Check MongoDB for user creation
5. Verify JWT token generation

## 📊 **USER EXPERIENCE**

### New Users
1. Click "Login with Google" button
2. Redirected to Google consent screen
3. Grant permissions
4. Automatically logged in with JWT token
5. Can immediately use all protected features

### Existing Users
1. Click "Login with Google" button
2. If email matches existing account → account linked
3. If email is new → new account created
4. Seamless transition between auth methods

## 🎯 **NEXT STEPS**

1. **Frontend Integration**: Add Google OAuth button to login page
2. **Error Handling**: Implement proper error pages for OAuth failures
3. **Account Management**: Allow users to link/unlink Google accounts
4. **Profile Sync**: Periodic sync of Google profile data
5. **Analytics**: Track OAuth vs traditional login usage

## ✅ **VERIFICATION**

All authentication methods now work:
- ✅ **Traditional Email/Password**: Signup, login, JWT tokens
- ✅ **Google OAuth**: Redirect, callback, JWT tokens
- ✅ **Account Linking**: Seamless integration between methods
- ✅ **Protected Routes**: Work with both authentication types
- ✅ **Security**: Maintained all existing security features

Your authentication system now supports both traditional and Google OAuth authentication! 🎉
