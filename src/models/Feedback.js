const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: [true, 'Business ID is required']
  },
  qrId: {
    type: String,
    required: [true, 'QR ID is required']
  },
  feedbackType: {
    type: String,
    enum: ['text', 'voice'],
    required: [true, 'Feedback type is required']
  },
  content: {
    type: String,
    required: function() {
      return this.feedbackType === 'text';
    }
  },
  voiceFileUrl: {
    type: String,
    required: function() {
      return this.feedbackType === 'voice';
    }
  },
  voiceDuration: {
    type: Number // in seconds
  },
  customerName: {
    type: String,
    trim: true
  },
  customerContact: {
    type: String,
    trim: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  tags: [{
    type: String,
    trim: true
  }],
  isRead: {
    type: Boolean,
    default: false
  },
  isResolved: {
    type: Boolean,
    default: false
  },
  businessResponse: {
    type: String,
    trim: true
  },
  respondedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient queries
feedbackSchema.index({ businessId: 1, createdAt: -1 });
feedbackSchema.index({ qrId: 1 });
feedbackSchema.index({ isRead: 1 });
feedbackSchema.index({ isResolved: 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
