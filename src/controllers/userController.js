// src/controllers/userController.js
const Url = require('../models/Url');
const { generateQRCode } = require('../utils/urlUtils');

// GET /api/user/urls - Get user's URLs
async function getUserUrls(req, res) {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const skip = (page - 1) * limit;

    let query = { userId: req.user._id };
    
    if (search) {
      query.$or = [
        { originalUrl: { $regex: search, $options: 'i' } },
        { shortCode: { $regex: search, $options: 'i' } },
        { customAlias: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const urls = await Url.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Url.countDocuments(query);

    const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    
    const formattedUrls = urls.map(url => ({
      id: url._id.toString(),
      shortId: url.shortCode, // Map shortCode to shortId for frontend compatibility
      shortCode: url.shortCode,
      customAlias: url.customAlias,
      originalUrl: url.originalUrl,
      shortUrl: `${base}/${url.shortCode}`,
      clicks: url.clicks,
      createdAt: url.createdAt,
      lastClicked: url.lastClicked,
      expiresAt: url.expiresAt,
      isExpired: url.expiresAt ? new Date() > new Date(url.expiresAt) : false,
      password: url.password ? '***' : undefined, // Don't send actual password
      tags: url.tags || [],
      isActive: url.isActive
    }));

    res.json({
      urls: formattedUrls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get user URLs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// PUT /api/user/urls/:id - Update user's URL
async function updateUserUrl(req, res) {
  try {
    const { id } = req.params;
    const { customAlias, expiresAt, password, tags, isActive } = req.body;

    const url = await Url.findOne({ _id: id, userId: req.user._id });

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    // Check if custom alias already exists (if changing)
    if (customAlias && customAlias !== url.customAlias) {
      const existingUrl = await Url.findOne({ 
        $or: [{ shortCode: customAlias }, { customAlias: customAlias }],
        _id: { $ne: id }
      });
      if (existingUrl) {
        return res.status(400).json({ error: 'Custom alias already exists' });
      }
    }

    // Update fields
    if (customAlias !== undefined) url.customAlias = customAlias;
    if (expiresAt !== undefined) url.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (password !== undefined) url.password = password;
    if (tags !== undefined) url.tags = tags;
    if (isActive !== undefined) url.isActive = isActive;

    await url.save();

    const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    
    res.json({
      message: 'URL updated successfully',
      url: {
        id: url._id.toString(),
        shortId: url.shortCode, // Map shortCode to shortId for frontend compatibility
        shortCode: url.shortCode,
        customAlias: url.customAlias,
        originalUrl: url.originalUrl,
        shortUrl: `${base}/${url.shortCode}`,
        clicks: url.clicks,
        createdAt: url.createdAt,
        lastClicked: url.lastClicked,
        expiresAt: url.expiresAt,
        isExpired: url.expiresAt ? new Date() > new Date(url.expiresAt) : false,
        password: url.password ? '***' : undefined,
        tags: url.tags || [],
        isActive: url.isActive
      }
    });
  } catch (error) {
    console.error('Update user URL error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// DELETE /api/user/urls/:id - Delete user's URL
async function deleteUserUrl(req, res) {
  try {
    const { id } = req.params;

    const url = await Url.findOne({ _id: id, userId: req.user._id });

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    await Url.deleteOne({ _id: id });

    res.json({ message: 'URL deleted successfully' });
  } catch (error) {
    console.error('Delete user URL error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/user/urls/:id/qr - Generate QR code for URL
async function generateUrlQR(req, res) {
  try {
    const { id } = req.params;

    const url = await Url.findOne({ _id: id, userId: req.user._id });

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    const shortUrl = `${base}/${url.shortCode}`;

    const qrCode = await generateQRCode(shortUrl);

    res.json({
      qrCode,
      shortUrl
    });
  } catch (error) {
    console.error('Generate QR code error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  getUserUrls,
  updateUserUrl,
  deleteUserUrl,
  generateUrlQR
};
