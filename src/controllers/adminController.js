const Admin = require('../models/Admin');
const Business = require('../models/Business');
const QRCode = require('../models/QRCode');
const Feedback = require('../models/Feedback');
const { generateToken } = require('../utils/jwt');
const fs = require('fs');
const path = require('path');

// @desc    Admin login
// @route   POST /api/admin/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Normalize email and find admin with password
    const normalizedEmail = String(email).trim().toLowerCase();
    // Log attempt (do not log password)
    console.log(`[AdminLogin] attempt email=${normalizedEmail} ip=${req.ip} ua=${req.get('user-agent') || ''}`);
    const admin = await Admin.findOne({ email: normalizedEmail }).select('+password');
    if (!admin) {
      console.warn(`[AdminLogin] no account for email=${normalizedEmail} ip=${req.ip}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if admin is active
    if (!admin.isActive) {
      console.warn(`[AdminLogin] deactivated account email=${normalizedEmail} ip=${req.ip}`);
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated'
      });
    }

    // Check password
    const isPasswordMatch = await admin.comparePassword(password);
    if (process.env.DEBUG_ADMIN) console.log('Password match:', !!isPasswordMatch);
    if (!isPasswordMatch) {
      console.warn(`[AdminLogin] invalid password for email=${normalizedEmail} ip=${req.ip}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate token
    const token = generateToken(admin._id, 'admin');

    // Log successful login
    console.log(`[AdminLogin] success email=${normalizedEmail} id=${admin._id} ip=${req.ip}`);

    res.status(200).json({
      success: true,
      token,
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

// @desc    Get all businesses
// @route   GET /api/admin/businesses
// @access  Private (Admin)
exports.getAllBusinesses = async (req, res) => {
  try {
    const { page = 1, limit = 20, isVerified, isActive, search } = req.query;

    // Build query
    const query = {};
    if (isVerified !== undefined) query.isVerified = isVerified === 'true';
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { businessName: { $regex: search, $options: 'i' } },
        { ownerName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const businesses = await Business.find(query)
      .select('businessName ownerName email phone address businessType createdAt isVerified isActive verificationCode')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Business.countDocuments(query);

    res.status(200).json({
      success: true,
      count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      data: businesses
    });
  } catch (error) {
    console.error('Get all businesses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get businesses',
      error: error.message
    });
  }
};

// @desc    Get business by ID
// @route   GET /api/admin/businesses/:id
// @access  Private (Admin)
exports.getBusinessById = async (req, res) => {
  try {
    const business = await Business.findById(req.params.id).select('-password');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      });
    }

    // Get related stats
    const qrCount = await QRCode.countDocuments({ businessId: business._id });
    const feedbackCount = await Feedback.countDocuments({ businessId: business._id });

    res.status(200).json({
      success: true,
      data: {
        ...business.toObject(),
        stats: {
          qrCodeCount: qrCount,
          feedbackCount: feedbackCount
        }
      }
    });
  } catch (error) {
    console.error('Get business by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get business',
      error: error.message
    });
  }
};

// @desc    Verify/unverify business
// @route   PUT /api/admin/businesses/:id/verify
// @access  Private (Admin)
exports.verifyBusiness = async (req, res) => {
  try {
    const { isVerified } = req.body;

    const business = await Business.findById(req.params.id);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      });
    }

    business.isVerified = isVerified;
    // If admin manually verifies, clear any existing verification code
    if (isVerified) {
      business.verificationCode = null;
    }
    await business.save();

    res.status(200).json({
      success: true,
      message: `Business ${isVerified ? 'verified' : 'unverified'} successfully`,
      data: business
    });
  } catch (error) {
    console.error('Verify business error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify business',
      error: error.message
    });
  }
};

// @desc    Activate/deactivate business
// @route   PUT /api/admin/businesses/:id/status
// @access  Private (Admin)
exports.updateBusinessStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    const business = await Business.findById(req.params.id);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      });
    }

    business.isActive = isActive;
    await business.save();

    res.status(200).json({
      success: true,
      message: `Business ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: business
    });
  } catch (error) {
    console.error('Update business status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update business status',
      error: error.message
    });
  }
};

// @desc    Get system statistics
// @route   GET /api/admin/stats
// @access  Private (Admin)
exports.getSystemStats = async (req, res) => {
  try {
    const totalBusinesses = await Business.countDocuments();
    const verifiedBusinesses = await Business.countDocuments({ isVerified: true });
    const activeBusinesses = await Business.countDocuments({ isActive: true });
    const totalQRCodes = await QRCode.countDocuments();
    const activeQRCodes = await QRCode.countDocuments({ isActive: true });
    const totalFeedback = await Feedback.countDocuments();

    // Get feedback count by type
    const feedbackByType = await Feedback.aggregate([
      { $group: { _id: '$feedbackType', count: { $sum: 1 } } }
    ]);

    // Get recent businesses
    const recentBusinesses = await Business.find()
      .select('businessName ownerName email phone createdAt isVerified verificationCode')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        businesses: {
          total: totalBusinesses,
          verified: verifiedBusinesses,
          active: activeBusinesses
        },
        qrCodes: {
          total: totalQRCodes,
          active: activeQRCodes
        },
        feedback: {
          total: totalFeedback,
          byType: feedbackByType
        },
        recentBusinesses
      }
    });
  } catch (error) {
    console.error('Get system stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system statistics',
      error: error.message
    });
  }
};

// @desc    Create new admin (super-admin only)
// @route   POST /api/admin/create
// @access  Private (Super Admin)
exports.createAdmin = async (req, res) => {
  try {
    const { name, email, password, role, permissions } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin with this email already exists'
      });
    }

    // Create admin
    const admin = await Admin.create({
      name,
      email,
      password,
      role: role || 'admin',
      permissions: permissions || {}
    });

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create admin',
      error: error.message
    });
  }
};

// @desc    Update business details (admin)
// @route   PUT /api/admin/businesses/:id
// @access  Private (Admin)
exports.updateBusiness = async (req, res) => {
  try {
    const { businessName, ownerName, email, phone, address, businessType, isVerified } = req.body;
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ success: false, message: 'Business not found' });
    }

    if (businessName !== undefined) business.businessName = businessName;
    if (ownerName !== undefined) business.ownerName = ownerName;
    if (email !== undefined) business.email = email;
    if (phone !== undefined) business.phone = phone;
    if (address !== undefined) business.address = address;
    if (businessType !== undefined) business.businessType = businessType;
    if (isVerified !== undefined) business.isVerified = isVerified;

    await business.save();

    res.status(200).json({ success: true, message: 'Business updated', data: business });
  } catch (error) {
    console.error('Update business error:', error);
    res.status(500).json({ success: false, message: 'Failed to update business', error: error.message });
  }
};

// @desc    Delete business (admin)
// @route   DELETE /api/admin/businesses/:id
// @access  Private (Admin)
exports.deleteBusiness = async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ success: false, message: 'Business not found' });
    }

    // Remove related QRs and feedbacks
    await QRCode.deleteMany({ businessId: business._id });
    await Feedback.deleteMany({ businessId: business._id });
    // use deleteOne on the document (remove() may be unavailable in some mongoose versions)
    await business.deleteOne();

    res.status(200).json({ success: true, message: 'Business and related data deleted' });
  } catch (error) {
    console.error('Delete business error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete business', error: error.message });
  }
};

// @desc    Get all QR codes (admin)
// @route   GET /api/admin/qrs
// @access  Private (Admin)
exports.getAllQRCodes = async (req, res) => {
  try {
    const { page = 1, limit = 50, businessId } = req.query;
    const query = {};
    if (businessId) query.businessId = businessId;

    const qrs = await QRCode.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((page - 1) * limit);

    const count = await QRCode.countDocuments(query);

    res.status(200).json({
      success: true,
      count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      data: qrs
    });
  } catch (error) {
    console.error('Get all QRs error:', error);
    res.status(500).json({ success: false, message: 'Failed to get QR codes', error: error.message });
  }
};

// @desc    Metrics compatibility endpoint (alias of stats)
// @route   GET /api/admin/metrics
// @access  Private (Admin)
exports.getMetrics = async (req, res) => {
  return exports.getSystemStats(req, res);
};

// @desc    Get recent system logs (tail)
// @route   GET /api/admin/logs
// @access  Private (Admin)
exports.getLogs = async (req, res) => {
  try {
    const maxLines = parseInt(req.query.lines || '200');
    const logFile = process.env.LOG_FILE || path.join(process.cwd(), 'logs', 'server.log');

    if (!fs.existsSync(logFile)) {
      return res.status(200).json({ success: true, lines: [], message: 'Log file not found' });
    }

    const content = fs.readFileSync(logFile, 'utf8');
    const allLines = content.split(/\r?\n/).filter(Boolean);
    const start = Math.max(0, allLines.length - maxLines);
    const slice = allLines.slice(start);

    res.status(200).json({ success: true, lines: slice });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to read logs', error: error.message });
  }
};
