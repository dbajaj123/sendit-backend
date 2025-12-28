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
const aiRoutes = require('./routes/aiRoutes');
const cron = require('node-cron');
const Business = require('./models/Business');
const { runForBusiness } = require('./controllers/aiController');

// Initialize express app
const app = express();

// Connect to database
connectDB();

// Middleware
// Configure CORS to support comma-separated origins in CORS_ORIGIN env
// Example: CORS_ORIGIN=https://client.example.com,https://admin.example.com,http://localhost:3000
const rawOrigins = process.env.CORS_ORIGIN || '*';
const allowedOrigins = rawOrigins
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (like curl, postman, or native mobile)
    if (!origin) return callback(null, true);

    // allow any origin if wildcard present
    if (allowedOrigins.includes('*')) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    // explicitly disallow
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Ensure caching proxies vary by Origin header when present
app.use((req, res, next) => {
  if (req.headers.origin) res.header('Vary', 'Origin');
  next();
});

// Request logging middleware (helpful for debugging uploads/proxy issues)
app.use((req, res, next) => {
  try {
    if (req.method === 'POST' || req.method === 'PUT') {
      const cl = req.headers['content-length'] || 'unknown';
      const ct = req.headers['content-type'] || 'unknown';
      const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      console.log(`[ReqLog] ${req.method} ${req.originalUrl} from=${ip} content-length=${cl} content-type=${ct}`);
    }
  } catch (e) {
    console.error('[ReqLog] failure', e);
  }
  next();
});

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
app.use('/api/ai', aiRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Schedule weekly AI reports for businesses with aiEnabled (configurable)
try{
  const enableCron = process.env.AI_CRON_ENABLED !== 'false';
  const schedule = process.env.AI_CRON_SCHEDULE || '0 3 * * 1'; // weekly Mon 03:00
  if(enableCron){
    cron.schedule(schedule, async () => {
      try{
        const list = await Business.find({ aiEnabled: true }).lean();
        for(const b of list){
          try{ await runForBusiness(b._id); }catch(e){ console.error('AI report failed for', b._id, e); }
        }
      }catch(e){ console.error('AI cron top-level error', e); }
    });
    console.log('AI cron scheduled:', schedule);
  }
}catch(e){ console.error('Failed to schedule AI cron', e); }

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = app;
