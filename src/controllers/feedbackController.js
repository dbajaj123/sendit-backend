const Feedback = require('../models/Feedback');
const QRCode = require('../models/QRCode');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for voice file uploads
// Use absolute path for uploads so PM2/systemd cwd doesn't break file writes
const UPLOAD_DIR = path.join(__dirname, '../../uploads/voice');
// Ensure upload directory exists
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { console.error('Failed to ensure upload dir', e); }

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      // Ensure directory exists at the time of each upload (handles race/perm issues)
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    } catch (e) {
      console.error('Failed to ensure upload dir in destination()', e && e.stack ? e.stack : e);
      cb(e);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'voice-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 26214400 }, // 25MB default
  fileFilter: function (req, file, cb) {
    const allowedTypes = /mp3|wav|m4a|ogg|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    // Accept common audio/* mime types (some servers use 'audio/mpeg' etc.)
    const mimetypeIsAudio = !!(file.mimetype && file.mimetype.startsWith('audio/'));

    if (mimetypeIsAudio || extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

exports.uploadVoice = upload.single('voice');

// Wrapper to log incoming upload details and handle multer errors with JSON responses
exports.uploadVoice = (req, res, next) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const cl = req.headers['content-length'] || 'unknown';
    const ct = req.headers['content-type'] || 'unknown';
    console.log(`[UploadVoice] incoming from=${ip} content-length=${cl} content-type=${ct}`);

    const handler = upload.single('voice');
    handler(req, res, function (err) {
      if (err) {
        console.error('[UploadVoice] multer error:', err && err.code ? err.code : (err && err.message) || err);
        if (err && err.stack) console.error(err.stack);
        // Multer file size limit
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ success: false, message: 'File too large' });
        }
        // Other multer errors
        return res.status(400).json({ success: false, message: err.message || 'Upload error' });
      }
      // Log actual received file size if available
      if (req.file) {
        console.log(`[UploadVoice] saved file=${req.file.filename} size=${req.file.size}`);
      } else {
        console.log('[UploadVoice] no file in request after multer');
      }
      next();
    });
  } catch (e) {
    console.error('[UploadVoice] wrapper error', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Submit text feedback
// @route   POST /api/feedback/text
// @access  Public
exports.submitTextFeedback = async (req, res) => {
  try {
    const { qrId, content, customerName, customerContact, rating, classification, category } = req.body;

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
      rating,
      classification: classification || 'feedback',
      category: category || 'general'
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
    const { qrId, customerName, customerContact, rating, voiceDuration, classification, category } = req.body;

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
      rating,
      classification: classification || 'feedback',
      category: category || 'general'
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
