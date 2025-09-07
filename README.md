# Advanced Link Shortener API

A full-featured URL shortener built with Node.js, Express, MongoDB, and React.

## Features

### 🔗 URL Shortening
- Generate short URLs with nanoid
- Custom aliases support
- Password-protected links
- Expiration dates
- QR code generation
- Bulk URL operations (CSV upload/download)

### 📊 Advanced Analytics
- Click tracking with timestamps
- Device and browser detection
- Referrer tracking
- IP-based geolocation
- Unique visitor tracking
- Time-series analytics
- Detailed visit logs
- Visualization-ready APIs

### 👤 User Management
- JWT authentication
- User registration and login
- Google OAuth integration
- Personal URL dashboard
- URL management (CRUD)
- User profiles

### 🛡️ Admin Panel
- User management
- URL monitoring
- Abuse detection
- System statistics
- Content moderation

### 🚀 Advanced Features
- Rate limiting
- Error handling
- Input validation
- Security middleware
- API key management for developers
- Bulk operations (CSV import/export)
- Production-ready

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file:
   ```env
   # Database Configuration
   MONGO_URI=mongodb://localhost:27017/link-shortener
   
   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-make-it-long-and-random
   
   # Google OAuth Configuration
   GOOGLE_CLIENT_ID=your-google-oauth-client-id-here
   GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret-here
   GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
   
   # Frontend Configuration
   FRONTEND_URL=http://localhost:3000
   
   # Server Configuration
   PORT=5000
   NODE_ENV=development
   BASE_URL=http://localhost:5000
   ```

4. Set up Google OAuth (Optional):
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable Google+ API
   - Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
   - Set application type to "Web application"
   - Add authorized redirect URIs:
     - `http://localhost:5000/auth/google/callback` (development)
     - `https://yourdomain.com/auth/google/callback` (production)
   - Copy Client ID and Client Secret to your `.env` file

5. Start the server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get user profile
- `GET /auth/google` - Google OAuth login (redirects to Google)
- `GET /auth/google/callback` - Google OAuth callback handler

### URL Management
- `POST /api/shorten` - Create short URL
- `GET /:shortId` - Redirect to original URL
- `GET /api/analytics/:shortId` - Get URL analytics

### User Dashboard
- `GET /api/user/urls` - Get user's URLs
- `PUT /api/user/urls/:id` - Update URL
- `DELETE /api/user/urls/:id` - Delete URL
- `GET /api/user/urls/:id/qr` - Generate QR code

### Admin Panel
- `GET /api/admin/stats` - System statistics
- `GET /api/admin/users` - All users
- `GET /api/admin/urls` - All URLs
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/urls/:id` - Delete URL

## Testing

Run tests:
```bash
npm test
```

## Production

For production deployment:
1. Set `NODE_ENV=production`
2. Use a strong `JWT_SECRET`
3. Configure MongoDB Atlas or production database
4. Set up proper `BASE_URL`
5. Configure rate limiting as needed
