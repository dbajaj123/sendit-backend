const express = require('express');
const router = express.Router();
const {
  login,
  getAllBusinesses,
  getBusinessById,
  verifyBusiness,
  updateBusinessStatus,
  getSystemStats,
  createAdmin
} = require('../controllers/adminController');
const { protect, adminOnly, checkPermission } = require('../middleware/auth');

// Public routes
router.post('/login', login);

// Protected routes (Admins only)
router.get('/businesses', protect, adminOnly, checkPermission('canManageBusinesses'), getAllBusinesses);
router.get('/businesses/:id', protect, adminOnly, checkPermission('canManageBusinesses'), getBusinessById);
router.put('/businesses/:id/verify', protect, adminOnly, checkPermission('canManageBusinesses'), verifyBusiness);
router.put('/businesses/:id/status', protect, adminOnly, checkPermission('canManageBusinesses'), updateBusinessStatus);
router.get('/stats', protect, adminOnly, checkPermission('canViewSystemLogs'), getSystemStats);

// Super admin only
router.post('/create', protect, adminOnly, checkPermission('canManageAdmins'), createAdmin);

module.exports = router;
