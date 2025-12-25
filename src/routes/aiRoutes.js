const express = require('express');
const router = express.Router();
const { analyzeNow } = require('../controllers/aiController');
const auth = require('../middleware/auth');

// Run analysis on-demand (owner must be authenticated)
router.post('/analyze', auth, analyzeNow);

module.exports = router;
