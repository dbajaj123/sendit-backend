const express = require('express');
const router = express.Router();
const {
  login,
  getAllBusinesses,
  getBusinessById,
  verifyBusiness,
  updateBusinessStatus,
  getSystemStats,
  getAllQRCodes,
  getMetrics,
  getLogs,
  createAdmin
} = require('../controllers/adminController');
const { protect, adminOnly, checkPermission } = require('../middleware/auth');

// Public routes
router.post('/login', login);

// Additional admin endpoints for UI compatibility
router.get('/qrs', protect, adminOnly, checkPermission('canManageQRCodes'), getAllQRCodes);
router.get('/metrics', protect, adminOnly, checkPermission('canViewSystemLogs'), getMetrics);

// Logs viewer
router.get('/logs', protect, adminOnly, checkPermission('canViewSystemLogs'), getLogs);

// Protected routes (Admins only)
router.get('/businesses', protect, adminOnly, checkPermission('canManageBusinesses'), getAllBusinesses);
router.get('/businesses/:id', protect, adminOnly, checkPermission('canManageBusinesses'), getBusinessById);
router.put('/businesses/:id/verify', protect, adminOnly, checkPermission('canManageBusinesses'), verifyBusiness);
router.put('/businesses/:id/status', protect, adminOnly, checkPermission('canManageBusinesses'), updateBusinessStatus);
router.put('/businesses/:id', protect, adminOnly, checkPermission('canManageBusinesses'), require('../controllers/adminController').updateBusiness);
router.delete('/businesses/:id', protect, adminOnly, checkPermission('canManageBusinesses'), require('../controllers/adminController').deleteBusiness);
router.get('/stats', protect, adminOnly, checkPermission('canViewSystemLogs'), getSystemStats);

// Super admin only
router.post('/create', protect, adminOnly, checkPermission('canManageAdmins'), createAdmin);

module.exports = router;
