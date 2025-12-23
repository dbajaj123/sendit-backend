const express = require('express');
const router = express.Router();
const {
  generateQRCode,
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

module.exports = router;
