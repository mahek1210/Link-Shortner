// src/routes/bulkRoutes.js
const express = require('express');
const { 
  upload, 
  bulkUploadUrls, 
  downloadUrlsCsv, 
  downloadCsvTemplate 
} = require('../controllers/bulkController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(auth);

// POST /api/bulk/upload - Bulk upload URLs from CSV
router.post('/upload', upload.single('csvFile'), bulkUploadUrls);

// GET /api/bulk/download - Download user's URLs as CSV
router.get('/download', downloadUrlsCsv);

// GET /api/bulk/template - Download CSV template
router.get('/template', downloadCsvTemplate);

module.exports = router;
