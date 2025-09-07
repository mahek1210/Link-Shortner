// src/controllers/bulkController.js
const multer = require('multer');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const Url = require('../models/Url');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Generate unique short code with retry logic
const generateShortCode = async () => {
  let shortCode;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (!isUnique && attempts < maxAttempts) {
    shortCode = nanoid(8);
    try {
      const existing = await Url.findOne({ shortCode });
      if (!existing) {
        isUnique = true;
      }
    } catch (error) {
      console.error('Error checking shortCode uniqueness:', error);
      throw new Error('Database error while generating short code');
    }
    attempts++;
  }
  
  if (!isUnique) {
    throw new Error('Failed to generate unique short code after multiple attempts');
  }
  
  return shortCode;
};

// POST /api/bulk/upload - Bulk upload URLs from CSV
const bulkUploadUrls = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No CSV file uploaded'
      });
    }

    const results = [];
    const errors = [];
    const csvData = [];

    // Parse CSV data
    const csvString = req.file.buffer.toString('utf8');
    const lines = csvString.split('\n');
    
    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    // Validate required columns
    if (!headers.includes('url') && !headers.includes('originalurl')) {
      return res.status(400).json({
        success: false,
        error: 'CSV must contain a "url" or "originalUrl" column'
      });
    }

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      
      csvData.push(row);
    }

    console.log(`Processing ${csvData.length} URLs from CSV`);

    // Process each URL
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const originalUrl = row.url || row.originalurl || row.original_url;
      const customAlias = row.alias || row.custom_alias || row.customalias;
      const tags = row.tags ? row.tags.split(';').filter(t => t.trim()) : [];
      const expiresAt = row.expires_at || row.expiresat ? new Date(row.expires_at || row.expiresat) : null;

      try {
        // Validate URL
        if (!originalUrl) {
          errors.push({
            row: i + 2, // +2 because of header and 0-based index
            error: 'Missing URL'
          });
          continue;
        }

        // Validate URL format
        try {
          new URL(originalUrl);
        } catch {
          errors.push({
            row: i + 2,
            error: 'Invalid URL format',
            url: originalUrl
          });
          continue;
        }

        let shortCode;

        // Handle custom alias
        if (customAlias && customAlias.trim() !== '') {
          const existing = await Url.findOne({ 
            $or: [{ shortCode: customAlias }, { customAlias: customAlias }] 
          });
          
          if (existing) {
            errors.push({
              row: i + 2,
              error: 'Custom alias already exists',
              alias: customAlias,
              url: originalUrl
            });
            continue;
          }
          
          shortCode = customAlias.trim();
        } else {
          shortCode = await generateShortCode();
        }

        // Create URL document
        const urlData = {
          originalUrl: originalUrl.trim(),
          shortCode: shortCode,
          userId: req.user._id,
          ...(customAlias && customAlias.trim() !== '' && { customAlias: customAlias.trim() }),
          ...(expiresAt && !isNaN(expiresAt.getTime()) && { expiresAt }),
          ...(tags.length > 0 && { tags })
        };

        const urlDoc = new Url(urlData);
        await urlDoc.save();

        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
        
        results.push({
          row: i + 2,
          originalUrl: urlDoc.originalUrl,
          shortCode: urlDoc.shortCode,
          shortUrl: `${baseUrl}/${urlDoc.shortCode}`,
          customAlias: urlDoc.customAlias,
          tags: urlDoc.tags || [],
          expiresAt: urlDoc.expiresAt,
          createdAt: urlDoc.createdAt
        });

      } catch (error) {
        console.error(`Error processing row ${i + 2}:`, error);
        errors.push({
          row: i + 2,
          error: error.message,
          url: originalUrl
        });
      }
    }

    res.json({
      success: true,
      data: {
        processed: results.length,
        errors: errors.length,
        results: results,
        errors: errors
      }
    });

  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during bulk upload'
    });
  }
};

// GET /api/bulk/download - Download user's URLs as CSV
const downloadUrlsCsv = async (req, res) => {
  try {
    const { includeAnalytics = false } = req.query;
    
    // Get user's URLs
    const urls = await Url.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    if (urls.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No URLs found to export'
      });
    }

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    
    // Prepare CSV data
    const csvData = urls.map(url => ({
      originalUrl: url.originalUrl,
      shortCode: url.shortCode,
      shortUrl: `${baseUrl}/${url.shortCode}`,
      customAlias: url.customAlias || '',
      clicks: url.clicks || 0,
      tags: (url.tags || []).join(';'),
      isActive: url.isActive,
      createdAt: url.createdAt.toISOString(),
      lastClicked: url.lastClicked ? url.lastClicked.toISOString() : '',
      expiresAt: url.expiresAt ? url.expiresAt.toISOString() : '',
      isExpired: url.expiresAt ? new Date() > new Date(url.expiresAt) : false
    }));

    // Create temporary file
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filename = `urls_export_${Date.now()}.csv`;
    const filepath = path.join(tempDir, filename);

    const csvWriter = createCsvWriter({
      path: filepath,
      header: [
        { id: 'originalUrl', title: 'Original URL' },
        { id: 'shortCode', title: 'Short Code' },
        { id: 'shortUrl', title: 'Short URL' },
        { id: 'customAlias', title: 'Custom Alias' },
        { id: 'clicks', title: 'Clicks' },
        { id: 'tags', title: 'Tags' },
        { id: 'isActive', title: 'Active' },
        { id: 'createdAt', title: 'Created At' },
        { id: 'lastClicked', title: 'Last Clicked' },
        { id: 'expiresAt', title: 'Expires At' },
        { id: 'isExpired', title: 'Is Expired' }
      ]
    });

    await csvWriter.writeRecords(csvData);

    // Send file
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      
      // Clean up temp file
      fs.unlink(filepath, (unlinkErr) => {
        if (unlinkErr) {
          console.error('Error deleting temp file:', unlinkErr);
        }
      });
    });

  } catch (error) {
    console.error('Download CSV error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during CSV export'
    });
  }
};

// GET /api/bulk/template - Download CSV template
const downloadCsvTemplate = (req, res) => {
  try {
    const templateData = [
      {
        url: 'https://example.com',
        alias: 'example',
        tags: 'social;marketing',
        expires_at: '2024-12-31T23:59:59.000Z'
      },
      {
        url: 'https://google.com',
        alias: '',
        tags: 'search',
        expires_at: ''
      }
    ];

    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filename = 'bulk_upload_template.csv';
    const filepath = path.join(tempDir, filename);

    const csvWriter = createCsvWriter({
      path: filepath,
      header: [
        { id: 'url', title: 'url' },
        { id: 'alias', title: 'alias' },
        { id: 'tags', title: 'tags' },
        { id: 'expires_at', title: 'expires_at' }
      ]
    });

    csvWriter.writeRecords(templateData).then(() => {
      res.download(filepath, filename, (err) => {
        if (err) {
          console.error('Error sending template file:', err);
        }
        
        // Clean up temp file
        fs.unlink(filepath, (unlinkErr) => {
          if (unlinkErr) {
            console.error('Error deleting temp template file:', unlinkErr);
          }
        });
      });
    });

  } catch (error) {
    console.error('Download template error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during template download'
    });
  }
};

module.exports = {
  upload,
  bulkUploadUrls,
  downloadUrlsCsv,
  downloadCsvTemplate
};
