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

    // Create target URL (where customers will open the feedback form)
    const customerBase = process.env.CUSTOMER_APP_URL || 'https://senditbox.app';
    const qrData = `${customerBase.replace(/\/$/, '')}/feedback/${qrId}`;
    const qrCodeUrl = await qrcode.toDataURL(qrData);

    // Save QR code to database (include targetUrl for clarity)
    const newQRCode = await QRCode.create({
      qrId,
      businessId,
      qrCodeUrl,
      targetUrl: qrData,
      location: location || 'Main Location',
      description,
      isMapped: true,
      isActive: true
    });

    res.status(201).json({
      success: true,
      data: newQRCode,
      link: qrData
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

// @desc    Generate QR codes in bulk (unmapped)
// @route   POST /api/qr/bulk-generate
// @access  Admin only
exports.bulkGenerateQRCodes = async (req, res) => {
  try {
    const { count, batchName } = req.body;

    if (!count || count < 1 || count > 100) {
      return res.status(400).json({
        success: false,
        message: 'Count must be between 1 and 100'
      });
    }

    const customerBase = process.env.CUSTOMER_APP_URL || 'https://senditbox.app';
    const createdQRs = [];

    // Generate QR codes
    for (let i = 0; i < count; i++) {
      const qrId = uuidv4();
      const qrData = `${customerBase.replace(/\/$/, '')}/feedback/${qrId}`;
      const qrCodeUrl = await qrcode.toDataURL(qrData);

      const newQRCode = await QRCode.create({
        qrId,
        businessId: null,
        qrCodeUrl,
        targetUrl: qrData,
        location: batchName || `Unmapped QR`,
        description: `Bulk generated QR - ${batchName || 'Batch'}`,
        isMapped: false,
        isActive: true
      });

      createdQRs.push(newQRCode);
    }

    res.status(201).json({
      success: true,
      message: `Successfully generated ${count} QR codes`,
      count: createdQRs.length,
      data: createdQRs
    });
  } catch (error) {
    console.error('Bulk generate QR codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR codes in bulk',
      error: error.message
    });
  }
};

// @desc    Map unmapped QR codes to a business
// @route   POST /api/qr/map-to-business
// @access  Admin only
exports.mapQRCodesToBusiness = async (req, res) => {
  try {
    const { qrIds, businessId, location } = req.body;

    if (!Array.isArray(qrIds) || qrIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'qrIds must be a non-empty array'
      });
    }

    // Verify business exists
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      });
    }

    // Map QR codes to business
    const result = await QRCode.updateMany(
      { qrId: { $in: qrIds }, isMapped: false },
      {
        $set: {
          businessId,
          isMapped: true,
          location: location || 'Main Location'
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No unmapped QR codes found with the provided IDs'
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully mapped ${result.modifiedCount} QR codes to ${business.businessName}`,
      mapped: result.modifiedCount,
      failed: result.matchedCount - result.modifiedCount
    });
  } catch (error) {
    console.error('Map QR codes to business error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to map QR codes',
      error: error.message
    });
  }
};

// @desc    Get unmapped QR codes
// @route   GET /api/qr/unmapped
// @access  Admin only
exports.getUnmappedQRCodes = async (req, res) => {
  try {
    const qrCodes = await QRCode.find({ isMapped: false, businessId: null }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: qrCodes.length,
      data: qrCodes
    });
  } catch (error) {
    console.error('Get unmapped QR codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unmapped QR codes',
      error: error.message
    });
  }
}

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
        businessName: qrCode.businessId ? qrCode.businessId.businessName : null,
        businessType: qrCode.businessId ? qrCode.businessId.businessType : null,
        location: qrCode.location,
        isMapped: qrCode.isMapped
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
