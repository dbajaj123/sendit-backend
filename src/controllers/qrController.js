const QRCode = require('../models/QRCode');
const Business = require('../models/Business');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

// @desc    Generate new QR code for a business
// @route   POST /api/qr/generate
// @access  Admin or Business Owner
exports.generateQRCode = async (req, res) => {
  try {
    const { businessId, location, description } = req.body;

    // Verify business exists
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      });
    }

    // Check authorization
    if (req.userType === 'business' && req.business._id.toString() !== businessId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to generate QR code for this business'
      });
    }

    // Generate unique QR ID
    const qrId = uuidv4();

    // Create QR code data URL
    // This URL should point to your customer app with the QR ID
    const qrData = `${process.env.CUSTOMER_APP_URL || 'https://senditbox.app'}/feedback/${qrId}`;
    const qrCodeUrl = await qrcode.toDataURL(qrData);

    // Save QR code to database
    const newQRCode = await QRCode.create({
      qrId,
      businessId,
      qrCodeUrl,
      location: location || 'Main Location',
      description
    });

    res.status(201).json({
      success: true,
      data: newQRCode
    });
  } catch (error) {
    console.error('Generate QR code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code',
      error: error.message
    });
  }
};

// @desc    Get QR code details by QR ID
// @route   GET /api/qr/:qrId
// @access  Public (needed for customer app)
exports.getQRCodeByQrId = async (req, res) => {
  try {
    const { qrId } = req.params;

    const qrCode = await QRCode.findOne({ qrId }).populate('businessId', 'businessName businessType');

    if (!qrCode) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found'
      });
    }

    if (!qrCode.isActive) {
      return res.status(400).json({
        success: false,
        message: 'This QR code is no longer active'
      });
    }

    // Update scan count and last scanned time
    qrCode.scanCount += 1;
    qrCode.lastScannedAt = new Date();
    await qrCode.save();

    res.status(200).json({
      success: true,
      data: {
        qrId: qrCode.qrId,
        businessName: qrCode.businessId.businessName,
        businessType: qrCode.businessId.businessType,
        location: qrCode.location
      }
    });
  } catch (error) {
    console.error('Get QR code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get QR code details',
      error: error.message
    });
  }
};

// @desc    Get all QR codes for a business
// @route   GET /api/qr/business/:businessId
// @access  Business Owner or Admin
exports.getQRCodesByBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;

    // Check authorization
    if (req.userType === 'business' && req.business._id.toString() !== businessId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view QR codes for this business'
      });
    }

    const qrCodes = await QRCode.find({ businessId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: qrCodes.length,
      data: qrCodes
    });
  } catch (error) {
    console.error('Get business QR codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get QR codes',
      error: error.message
    });
  }
};

// @desc    Update QR code (activate/deactivate, update location)
// @route   PUT /api/qr/:qrId
// @access  Business Owner or Admin
exports.updateQRCode = async (req, res) => {
  try {
    const { qrId } = req.params;
    const { isActive, location, description } = req.body;

    const qrCode = await QRCode.findOne({ qrId });

    if (!qrCode) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found'
      });
    }

    // Check authorization
    if (req.userType === 'business' && req.business._id.toString() !== qrCode.businessId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this QR code'
      });
    }

    // Update fields
    if (isActive !== undefined) qrCode.isActive = isActive;
    if (location) qrCode.location = location;
    if (description !== undefined) qrCode.description = description;

    await qrCode.save();

    res.status(200).json({
      success: true,
      data: qrCode
    });
  } catch (error) {
    console.error('Update QR code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update QR code',
      error: error.message
    });
  }
};

// @desc    Delete QR code
// @route   DELETE /api/qr/:qrId
// @access  Business Owner or Admin
exports.deleteQRCode = async (req, res) => {
  try {
    const { qrId } = req.params;

    const qrCode = await QRCode.findOne({ qrId });

    if (!qrCode) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found'
      });
    }

    // Check authorization
    if (req.userType === 'business' && req.business._id.toString() !== qrCode.businessId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this QR code'
      });
    }

    await QRCode.deleteOne({ qrId });

    res.status(200).json({
      success: true,
      message: 'QR code deleted successfully'
    });
  } catch (error) {
    console.error('Delete QR code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete QR code',
      error: error.message
    });
  }
};
