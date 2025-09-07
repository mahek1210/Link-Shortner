const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");

// Load environment variables FIRST
dotenv.config();

// Import passport configuration AFTER dotenv
const { passport, isGoogleOAuthConfigured } = require("./config/passport");

// Import routes
const urlRoutes = require("./routes/urlRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const bulkRoutes = require("./routes/bulkRoutes");
const apiRoutes = require("./routes/apiRoutes");

// Import middleware
const errorHandler = require("./middleware/errorHandler");
const { generalLimiter } = require("./middleware/rateLimit");

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(generalLimiter);

// Initialize Passport
app.use(passport.initialize());

// Log Google OAuth configuration status
if (isGoogleOAuthConfigured) {
  console.log('✅ Google OAuth configured and ready');
} else {
  console.log('⚠️  Google OAuth not configured - OAuth routes will return errors');
}

// Routes
app.get("/", (req, res) => {
  res.send("🚀 Advanced Link Shortener API is running...");
});

// API routes
app.use("/api", urlRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bulk", bulkRoutes);
app.use("/api/keys", apiRoutes);

// Google OAuth routes (mounted at root level)
app.use("/auth", authRoutes);

// Redirect route at root
app.use("/", urlRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
