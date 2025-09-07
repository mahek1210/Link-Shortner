// src/controllers/adminController.js
const User = require('../models/User');
const Url = require('../models/Url');

// GET /api/admin/users - Get all users
async function getAllUsers(req, res) {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/admin/urls - Get all URLs
async function getAllUrls(req, res) {
  try {
    const { page = 1, limit = 20, search, userId } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    
    if (search) {
      query.$or = [
        { originalUrl: { $regex: search, $options: 'i' } },
        { shortCode: { $regex: search, $options: 'i' } },
        { customAlias: { $regex: search, $options: 'i' } }
      ];
    }

    if (userId) {
      query.userId = userId;
    }

    const urls = await Url.find(query)
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Url.countDocuments(query);

    const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    
    const formattedUrls = urls.map(url => ({
      id: url._id,
      shortCode: url.shortCode,
      customAlias: url.customAlias,
      originalUrl: url.originalUrl,
      shortUrl: `${base}/${url.shortCode}`,
      clicks: url.clicks,
      createdAt: url.createdAt,
      lastClicked: url.lastClicked,
      expiresAt: url.expiresAt,
      isExpired: url.expiresAt ? new Date() > new Date(url.expiresAt) : false,
      password: !!url.password,
      isActive: url.isActive,
      user: url.userId ? {
        id: url.userId._id,
        username: url.userId.username,
        email: url.userId.email
      } : null
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
    console.error('Get all URLs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// DELETE /api/admin/urls/:id - Delete URL (admin)
async function deleteUrl(req, res) {
  try {
    const { id } = req.params;

    const url = await Url.findById(id);

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    await Url.deleteOne({ _id: id });

    res.json({ message: 'URL deleted successfully' });
  } catch (error) {
    console.error('Delete URL error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// PUT /api/admin/users/:id - Update user status
async function updateUserStatus(req, res) {
  try {
    const { id } = req.params;
    const { isActive, role } = req.body;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (isActive !== undefined) user.isActive = isActive;
    if (role !== undefined) user.role = role;

    await user.save();

    res.json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/admin/stats - Get admin statistics
async function getAdminStats(req, res) {
  try {
    const totalUsers = await User.countDocuments();
    const totalUrls = await Url.countDocuments();
    const activeUrls = await Url.countDocuments({ isActive: true });
    const expiredUrls = await Url.countDocuments({ 
      expiresAt: { $lt: new Date() } 
    });

    const recentUrls = await Url.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'username')
      .lean();

    const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    
    const formattedRecentUrls = recentUrls.map(url => ({
      id: url._id,
      shortCode: url.shortCode,
      originalUrl: url.originalUrl,
      shortUrl: `${base}/${url.shortCode}`,
      clicks: url.clicks,
      createdAt: url.createdAt,
      user: url.userId ? {
        username: url.userId.username
      } : null
    }));

    res.json({
      stats: {
        totalUsers,
        totalUrls,
        activeUrls,
        expiredUrls
      },
      recentUrls: formattedRecentUrls
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  getAllUsers,
  getAllUrls,
  deleteUrl,
  updateUserStatus,
  getAdminStats
};
