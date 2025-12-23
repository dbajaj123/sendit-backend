const Business = require('../models/Business');
const Feedback = require('../models/Feedback');
const { generateToken } = require('../utils/jwt');

// @desc    Register new business
// @route   POST /api/business/register
// @access  Public (or Admin if you want controlled registration)
exports.register = async (req, res) => {
  try {
    const { businessName, ownerName, email, password, phone, address, businessType } = req.body;

    // Check if business already exists
    const existingBusiness = await Business.findOne({ email });
    if (existingBusiness) {
      return res.status(400).json({
        success: false,
        message: 'Business with this email already exists'
      });
    }

    // Create business
    const business = await Business.create({
      businessName,
      ownerName,
      email,
      password,
      phone,
      address,
      businessType
    });

    // Generate token
    const token = generateToken(business._id, 'business');

    res.status(201).json({
      success: true,
      message: 'Business registered successfully',
      token,
      data: {
        id: business._id,
        businessName: business.businessName,
        ownerName: business.ownerName,
        email: business.email,
        isVerified: business.isVerified
      }
    });
  } catch (error) {
    console.error('Business registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register business',
      error: error.message
    });
  }
};

// @desc    Business login
// @route   POST /api/business/login
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

    // Find business with password
    const business = await Business.findOne({ email }).select('+password');
    if (!business) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if business is active
    if (!business.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Check password
    const isPasswordMatch = await business.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken(business._id, 'business');

    res.status(200).json({
      success: true,
      token,
      data: {
        id: business._id,
        businessName: business.businessName,
        ownerName: business.ownerName,
        email: business.email,
        isVerified: business.isVerified
      }
    });
  } catch (error) {
    console.error('Business login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

// @desc    Get business profile
// @route   GET /api/business/profile
// @access  Private (Business)
exports.getProfile = async (req, res) => {
  try {
    const business = await Business.findById(req.business._id);

    res.status(200).json({
      success: true,
      data: business
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
};

// @desc    Update business profile
// @route   PUT /api/business/profile
// @access  Private (Business)
exports.updateProfile = async (req, res) => {
  try {
    const { businessName, ownerName, phone, address, businessType } = req.body;

    const business = await Business.findById(req.business._id);

    if (businessName) business.businessName = businessName;
    if (ownerName) business.ownerName = ownerName;
    if (phone) business.phone = phone;
    if (address) business.address = address;
    if (businessType) business.businessType = businessType;

    await business.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: business
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

// @desc    Get all feedback for business
// @route   GET /api/business/feedback
// @access  Private (Business)
exports.getFeedback = async (req, res) => {
  try {
    const { page = 1, limit = 20, feedbackType, isRead, isResolved, qrId, startDate, endDate } = req.query;

    // Build query
    const query = { businessId: req.business._id };

    if (feedbackType) query.feedbackType = feedbackType;
    if (isRead !== undefined) query.isRead = isRead === 'true';
    if (isResolved !== undefined) query.isResolved = isResolved === 'true';
    if (qrId) query.qrId = qrId;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Get feedback with pagination
    const feedback = await Feedback.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Feedback.countDocuments(query);

    res.status(200).json({
      success: true,
      count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      data: feedback
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get feedback',
      error: error.message
    });
  }
};

// @desc    Get single feedback details
// @route   GET /api/business/feedback/:id
// @access  Private (Business)
exports.getFeedbackById = async (req, res) => {
  try {
    const feedback = await Feedback.findOne({
      _id: req.params.id,
      businessId: req.business._id
    });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }

    // Mark as read if not already
    if (!feedback.isRead) {
      feedback.isRead = true;
      await feedback.save();
    }

    res.status(200).json({
      success: true,
      data: feedback
    });
  } catch (error) {
    console.error('Get feedback by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get feedback',
      error: error.message
    });
  }
};

// @desc    Update feedback (mark as read/resolved, add response, add tags)
// @route   PUT /api/business/feedback/:id
// @access  Private (Business)
exports.updateFeedback = async (req, res) => {
  try {
    const { isRead, isResolved, businessResponse, tags } = req.body;

    const feedback = await Feedback.findOne({
      _id: req.params.id,
      businessId: req.business._id
    });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }

    if (isRead !== undefined) feedback.isRead = isRead;
    if (isResolved !== undefined) feedback.isResolved = isResolved;
    if (businessResponse !== undefined) {
      feedback.businessResponse = businessResponse;
      feedback.respondedAt = new Date();
    }
    if (tags) feedback.tags = tags;

    await feedback.save();

    res.status(200).json({
      success: true,
      message: 'Feedback updated successfully',
      data: feedback
    });
  } catch (error) {
    console.error('Update feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update feedback',
      error: error.message
    });
  }
};

// @desc    Get feedback statistics
// @route   GET /api/business/stats
// @access  Private (Business)
exports.getStats = async (req, res) => {
  try {
    const businessId = req.business._id;

    const totalFeedback = await Feedback.countDocuments({ businessId });
    const unreadFeedback = await Feedback.countDocuments({ businessId, isRead: false });
    const resolvedFeedback = await Feedback.countDocuments({ businessId, isResolved: true });
    const textFeedback = await Feedback.countDocuments({ businessId, feedbackType: 'text' });
    const voiceFeedback = await Feedback.countDocuments({ businessId, feedbackType: 'voice' });

    // Get average rating
    const ratingStats = await Feedback.aggregate([
      { $match: { businessId: req.business._id, rating: { $exists: true } } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    const avgRating = ratingStats.length > 0 ? ratingStats[0].avgRating : 0;

    res.status(200).json({
      success: true,
      data: {
        totalFeedback,
        unreadFeedback,
        resolvedFeedback,
        textFeedback,
        voiceFeedback,
        averageRating: avgRating.toFixed(2),
        ratedFeedbackCount: ratingStats.length > 0 ? ratingStats[0].count : 0
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message
    });
  }
};
