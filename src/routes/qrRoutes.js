const express = require('express');
const router = express.Router();
const {
  generateQRCode,
  bulkGenerateQRCodes,
  mapQRCodesToBusiness,
  getUnmappedQRCodes,
  getQRCodeByQrId,
  getQRCodesByBusiness,
  updateQRCode,
  deleteQRCode
} = require('../controllers/qrController');
const { protect, businessOnly, adminOnly } = require('../middleware/auth');

// Public route (for customer app to verify QR code)
router.get('/:qrId', getQRCodeByQrId);

// Protected routes (Business owner or Admin)
router.post('/generate', protect, generateQRCode);
router.get('/business/:businessId', protect, getQRCodesByBusiness);
router.put('/:qrId', protect, updateQRCode);
router.delete('/:qrId', protect, deleteQRCode);

// Admin only routes for bulk operations
router.post('/admin/bulk-generate', protect, adminOnly, bulkGenerateQRCodes);
router.post('/admin/map-to-business', protect, adminOnly, mapQRCodesToBusiness);
router.get('/admin/unmapped', protect, adminOnly, getUnmappedQRCodes);

module.exports = router;
