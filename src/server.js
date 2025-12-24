require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/database');
const { errorHandler, notFound } = require('./middleware/error');

// Import routes
const feedbackRoutes = require('./routes/feedbackRoutes');
const qrRoutes = require('./routes/qrRoutes');
const businessRoutes = require('./routes/businessRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Initialize express app
const app = express();

// Connect to database
connectDB();

// Middleware
// Configure CORS to support comma-separated origins in CORS_ORIGIN env
const rawOrigins = process.env.CORS_ORIGIN || '*';
const allowedOrigins = rawOrigins.split(',').map(s => s.trim());
app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (like curl, postman, or mobile clients)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf('*') !== -1 || allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (for uploaded voice files)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'SenditBox API is running',
    version: '1.0.0'
  });
});

app.use('/api/feedback', feedbackRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/admin', adminRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = app;
