const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (id, type) => {
  return jwt.sign(
    { id, type }, // type: 'business' or 'admin'
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateToken,
  verifyToken
};
