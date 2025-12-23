const { verifyToken } = require('../utils/jwt');
const Business = require('../models/Business');
const Admin = require('../models/Admin');

// Protect routes - verify JWT token
exports.protect = async (req, res, next) => {
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    // Verify token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Check user type and attach to request
    if (decoded.type === 'business') {
      const business = await Business.findById(decoded.id).select('-password');
      if (!business) {
        return res.status(401).json({
          success: false,
          message: 'Business not found'
        });
      }
      if (!business.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Business account is inactive'
        });
      }
      req.business = business;
      req.userType = 'business';
    } else if (decoded.type === 'admin') {
      const admin = await Admin.findById(decoded.id).select('-password');
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Admin not found'
        });
      }
      if (!admin.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Admin account is inactive'
        });
      }
      req.admin = admin;
      req.userType = 'admin';
    } else {
      return res.status(401).json({
        success: false,
        message: 'Invalid user type'
      });
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

// Restrict to business owners only
exports.businessOnly = (req, res, next) => {
  if (req.userType !== 'business') {
    return res.status(403).json({
      success: false,
      message: 'Access restricted to business owners only'
    });
  }
  next();
};

// Restrict to admins only
exports.adminOnly = (req, res, next) => {
  if (req.userType !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access restricted to admins only'
    });
  }
  next();
};

// Check specific admin permissions
exports.checkPermission = (permission) => {
  return (req, res, next) => {
    if (req.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access restricted to admins only'
      });
    }

    if (req.admin.role === 'super-admin' || req.admin.permissions[permission]) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions'
    });
  };
};
