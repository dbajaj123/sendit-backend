const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const qrCodeSchema = new mongoose.Schema({
  qrId: {
    type: String,
    required: true,
    unique: true,
    default: () => uuidv4()
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: [true, 'Business ID is required']
  },
  qrCodeUrl: {
    type: String,
    required: true
  },
  // The actual target URL encoded in the QR (e.g., https://client.example.com/feedback/<qrId>)
  targetUrl: {
    type: String
  },
  location: {
    type: String,
    trim: true,
    default: 'Main Location'
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  scanCount: {
    type: Number,
    default: 0
  },
  feedbackCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastScannedAt: Date
});

qrCodeSchema.index({ businessId: 1 });

module.exports = mongoose.model('QRCode', qrCodeSchema);
