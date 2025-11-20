/**
 * FDA Compliance API Routes
 *
 * These routes provide FDA 21 CFR Part 11 compliance data to the frontend,
 * including compliance status, blockchain verification, and audit logs.
 */

const express = require('express');
const router = express.Router();
const fdaComplianceService = require('../services/fda-compliance-service');

// Middleware to verify JWT token if authentication is required
// We'll implement this in the future when we add authentication
const verifyToken = (req, res, next) => {
  // For now, we'll just pass through
  next();
};

/**
 * Get FDA compliance status
 */
router.get('/status', verifyToken, (req, res) => {
  res.json(fdaComplianceService.getComplianceStatus());
});

/**
 * Get validation data for FDA compliance
 */
router.get('/validation', verifyToken, (req, res) => {
  res.json(fdaComplianceService.getValidationData());
});

/**
 * Get blockchain security status
 */
router.get('/blockchain-status', verifyToken, (req, res) => {
  res.json(fdaComplianceService.getBlockchainStatus());
});

/**
 * Get blockchain verification events
 */
router.get('/verification-events', verifyToken, (req, res) => {
  res.json(fdaComplianceService.getVerificationEvents());
});

/**
 * Get audit logs with pagination and filtering
 */
router.get('/audit-logs', verifyToken, (req, res) => {
  // Parse query parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const eventType = req.query.eventType ? req.query.eventType.split(',') : [];
  const user = req.query.user ? req.query.user.split(',') : [];
  const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
  const search = req.query.search || '';

  const options = {
    page,
    limit,
    eventType,
    user,
    fromDate,
    search,
  };

  res.json(fdaComplianceService.getAuditLogs(options));
});

/**
 * Get compliance documentation by category
 */
router.get('/documents', verifyToken, (req, res) => {
  const category = req.query.category || 'guidance';
  res.json(fdaComplianceService.getComplianceDocuments(category));
});

module.exports = router;
