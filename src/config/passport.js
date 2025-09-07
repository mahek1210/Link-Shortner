/*
 * FIXES APPLIED:
 * 1. Created Google OAuth 2.0 strategy configuration
 * 2. Added user creation/login logic for Google users
 * 3. Integrated with existing JWT authentication system
 * 4. Added proper error handling
 * 5. Maintained compatibility with existing email/password auth
 * 6. Added graceful handling of missing environment variables
 * 7. Added configuration validation with warnings instead of errors
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// Check for required environment variables with warnings
const requiredEnvVars = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL
};

const missingVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value || value === 'your-google-oauth-client-id-here' || value === 'your-google-oauth-client-secret-here')
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.warn('⚠️  Google OAuth Configuration Warning:');
  console.warn(`   Missing or default values for: ${missingVars.join(', ')}`);
  console.warn('   Google OAuth routes will return 500 errors until configured.');
  console.warn('   Please set these environment variables in your .env file:');
  missingVars.forEach(key => {
    console.warn(`   ${key}=your-actual-value-here`);
  });
  console.warn('');
}

// Only configure Google strategy if all required variables are present
const isGoogleOAuthConfigured = missingVars.length === 0;

// Configure Google OAuth Strategy only if environment variables are present
if (isGoogleOAuthConfigured) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('Google OAuth Profile:', profile);
      
      // Check if user already exists with this Google ID
      let user = await User.findOne({ googleId: profile.id });
      
      if (user) {
        // User exists, update last login
        user.lastLogin = new Date();
        await user.save();
        return done(null, user);
      }
      
      // Check if user exists with same email (account linking)
      user = await User.findOne({ email: profile.emails[0].value });
      
      if (user) {
        // Link Google account to existing user
        user.googleId = profile.id;
        user.name = profile.displayName;
        user.avatar = profile.photos[0]?.value;
        user.lastLogin = new Date();
        await user.save();
        return done(null, user);
      }
      
      // Create new user
      user = new User({
        googleId: profile.id,
        email: profile.emails[0].value,
        name: profile.displayName,
        avatar: profile.photos[0]?.value,
        lastLogin: new Date()
      });
      
      await user.save();
      return done(null, user);
      
    } catch (error) {
      console.error('Google OAuth error:', error);
      return done(error, null);
    }
  }));
} else {
  console.warn('⚠️  Google OAuth strategy not configured due to missing environment variables');
}

// Serialize user for session (we don't use sessions, but passport requires this)
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Export both passport and configuration status
module.exports = {
  passport,
  isGoogleOAuthConfigured
};
