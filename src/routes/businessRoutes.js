const express = require('express');
const router = express.Router();
const {
  register,
  login,
  toggleVerification,
  getProfile,
  updateProfile,
  getFeedback,
  getFeedbackById,
  updateFeedback,
  getStats
} = require('../controllers/businessController');
const { protect, businessOnly } = require('../middleware/auth');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/:businessId/toggle-verification', toggleVerification);

// Protected routes (Business owners only)
router.get('/profile', protect, businessOnly, getProfile);
router.put('/profile', protect, businessOnly, updateProfile);
router.get('/feedback', protect, businessOnly, getFeedback);
router.get('/feedback/:id', protect, businessOnly, getFeedbackById);
router.put('/feedback/:id', protect, businessOnly, updateFeedback);
router.get('/stats', protect, businessOnly, getStats);

module.exports = router;
