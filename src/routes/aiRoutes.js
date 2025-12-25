const express = require('express');
const router = express.Router();
const { analyzeNow, computeTopics } = require('../controllers/aiController');
const { protect, businessOnly } = require('../middleware/auth');

// Run analysis on-demand (owner must be authenticated)
router.post('/analyze', protect, businessOnly, analyzeNow);
router.get('/topics', protect, businessOnly, computeTopics);

module.exports = router;
