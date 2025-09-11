// src/routes/adminRoutes.js
const express = require('express');
const { 
  getAllUsers, 
  getAllUrls, 
  deleteUrl, 
  updateUserStatus, 
  getAdminStats 
} = require('../controllers/adminController');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// All routes require admin authentication
router.use(adminAuth);

// GET /api/admin/stats - Get admin statistics
router.get('/stats', getAdminStats);

// GET /api/admin/users - Get all users
router.get('/users', getAllUsers);

// PUT /api/admin/users/:id - Update user status
router.put('/users/:id', updateUserStatus);

// GET /api/admin/urls - Get all URLs
router.get('/urls', getAllUrls);

// DELETE /api/admin/urls/:id - Delete URL (admin)
router.delete('/urls/:id', deleteUrl);

module.exports = router;
