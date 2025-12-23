const Feedback = require('../models/Feedback');
const QRCode = require('../models/QRCode');
const multer = require('multer');
const path = require('path');

// Configure multer for voice file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/voice/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'voice-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 }, // 10MB default
  fileFilter: function (req, file, cb) {
    const allowedTypes = /mp3|wav|m4a|ogg|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

exports.uploadVoice = upload.single('voice');

// @desc    Submit text feedback
// @route   POST /api/feedback/text
// @access  Public
exports.submitTextFeedback = async (req, res) => {
  try {
    const { qrId, content, customerName, customerContact, rating } = req.body;

    // Validate required fields
    if (!qrId || !content) {
      return res.status(400).json({
        success: false,
        message: 'QR ID and content are required'
      });
    }

    // Verify QR code exists and is active
    const qrCode = await QRCode.findOne({ qrId });
    if (!qrCode) {
      return res.status(404).json({
        success: false,
        message: 'Invalid QR code'
      });
    }

    if (!qrCode.isActive) {
      return res.status(400).json({
        success: false,
        message: 'This QR code is no longer active'
      });
    }

    // Create feedback
    const feedback = await Feedback.create({
      businessId: qrCode.businessId,
      qrId,
      feedbackType: 'text',
      content,
      customerName,
      customerContact,
      rating
    });

    // Update QR code feedback count
    qrCode.feedbackCount += 1;
    await qrCode.save();

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: {
        feedbackId: feedback._id
      }
    });
  } catch (error) {
    console.error('Submit text feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback',
      error: error.message
    });
  }
};

// @desc    Submit voice feedback
// @route   POST /api/feedback/voice
// @access  Public
exports.submitVoiceFeedback = async (req, res) => {
  try {
    const { qrId, customerName, customerContact, rating, voiceDuration } = req.body;

    // Validate required fields
    if (!qrId) {
      return res.status(400).json({
        success: false,
        message: 'QR ID is required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Voice file is required'
      });
    }

    // Verify QR code exists and is active
    const qrCode = await QRCode.findOne({ qrId });
    if (!qrCode) {
      return res.status(404).json({
        success: false,
        message: 'Invalid QR code'
      });
    }

    if (!qrCode.isActive) {
      return res.status(400).json({
        success: false,
        message: 'This QR code is no longer active'
      });
    }

    // Create feedback with voice file URL
    const voiceFileUrl = `/uploads/voice/${req.file.filename}`;
    
    const feedback = await Feedback.create({
      businessId: qrCode.businessId,
      qrId,
      feedbackType: 'voice',
      voiceFileUrl,
      voiceDuration: voiceDuration || 0,
      customerName,
      customerContact,
      rating
    });

    // Update QR code feedback count
    qrCode.feedbackCount += 1;
    await qrCode.save();

    res.status(201).json({
      success: true,
      message: 'Voice feedback submitted successfully',
      data: {
        feedbackId: feedback._id
      }
    });
  } catch (error) {
    console.error('Submit voice feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit voice feedback',
      error: error.message
    });
  }
};
