const express = require('express');
const router = express.Router();
const {
  submitTextFeedback,
  submitVoiceFeedback,
  uploadVoice
} = require('../controllers/feedbackController');

// Public routes for customer app
router.post('/text', submitTextFeedback);
router.post('/voice', uploadVoice, submitVoiceFeedback);

module.exports = router;
