const express = require('express');
const router = express.Router();
const { getAnalyticsMetrics } = require('../controllers/analyticsController');

router.get('/analytics/metrics', getAnalyticsMetrics);

module.exports = router;
