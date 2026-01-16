/**
 * Demo Data API Routes
 * Serves mock demo data for client presentations
 */

import express from 'express';
import mockDemoData from '../../src/data/mockDemoData.js';

const router = express.Router();

/**
 * GET /api/demo/scenarios
 * Returns all available demo scenarios
 */
router.get('/api/demo/scenarios', (req, res) => {
  try {
    res.json({
      success: true,
      scenarios: Object.keys(mockDemoData.mockDemoScenarios),
      description: 'Available demo scenarios for client presentations',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/scenario/:name
 * Returns a specific scenario with all its data
 */
router.get('/api/demo/scenario/:name', (req, res) => {
  try {
    const scenario = mockDemoData.mockDemoScenarios[req.params.name];
    if (!scenario) {
      return res.status(404).json({
        success: false,
        error: `Scenario "${req.params.name}" not found`,
        available: Object.keys(mockDemoData.mockDemoScenarios),
      });
    }
    res.json({
      success: true,
      scenario,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/clients
 * Returns all demo organizations
 */
router.get('/api/demo/clients', (req, res) => {
  try {
    res.json({
      success: true,
      clients: mockDemoData.mockDemoClients,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/devices
 * Returns all device profiles
 */
router.get('/api/demo/devices', (req, res) => {
  try {
    res.json({
      success: true,
      devices: mockDemoData.mockDeviceProfiles,
      totalStages: mockDemoData.mockDeviceProfiles.length,
      description: 'Complete workflow progression from startup to FDA approval',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/devices/:stage
 * Returns a specific device at a completion stage
 */
router.get('/api/demo/devices/:stage', (req, res) => {
  try {
    const stage = parseInt(req.params.stage);
    const device = mockDemoData.mockDeviceProfiles[stage - 1];
    if (!device) {
      return res.status(404).json({
        success: false,
        error: `Stage ${stage} not found`,
        totalStages: mockDemoData.mockDeviceProfiles.length,
      });
    }
    res.json({
      success: true,
      stage,
      device,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/documents
 * Returns all demo documents
 */
router.get('/api/demo/documents', (req, res) => {
  try {
    res.json({
      success: true,
      documents: mockDemoData.mockDocuments,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/predicates
 * Returns FDA predicate devices
 */
router.get('/api/demo/predicates', (req, res) => {
  try {
    res.json({
      success: true,
      predicates: mockDemoData.mockPredicateDevices,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/equivalence
 * Returns equivalence analysis examples
 */
router.get('/api/demo/equivalence', (req, res) => {
  try {
    res.json({
      success: true,
      analyses: mockDemoData.mockEquivalenceAnalyses,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/compliance
 * Returns compliance check examples
 */
router.get('/api/demo/compliance', (req, res) => {
  try {
    res.json({
      success: true,
      checks: mockDemoData.mockComplianceChecks,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/submissions
 * Returns FDA submission examples
 */
router.get('/api/demo/submissions', (req, res) => {
  try {
    res.json({
      success: true,
      submissions: mockDemoData.mockFDASubmissions,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/summary
 * Returns summary statistics for all demo data
 */
router.get('/api/demo/summary', (req, res) => {
  try {
    const summary = {
      success: true,
      summary: {
        organizationsCount: mockDemoData.mockDemoClients.length,
        devicesCount: mockDemoData.mockDeviceProfiles.length,
        deviceStages: mockDemoData.mockDeviceProfiles.map((d, i) => ({
          stage: i + 1,
          name: d.deviceName,
          completion: d.completionPercentage,
          status: d.status,
        })),
        documentsCount: mockDemoData.mockDocuments.length,
        predicateDevicesCount: mockDemoData.mockPredicateDevices.length,
        equivalenceAnalysesCount: mockDemoData.mockEquivalenceAnalyses.length,
        complianceChecksCount: mockDemoData.mockComplianceChecks.length,
        fdaSubmissionsCount: mockDemoData.mockFDASubmissions.length,
        scenariosCount: Object.keys(mockDemoData.mockDemoScenarios).length,
        scenarios: Object.keys(mockDemoData.mockDemoScenarios),
      },
    };
    res.json(summary);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/health
 * Health check for demo data system
 */
router.get('/api/demo/health', (req, res) => {
  res.json({
    success: true,
    status: 'Demo data system is operational',
    timestamp: new Date().toISOString(),
    dataPoints: {
      clients: mockDemoData.mockDemoClients.length,
      devices: mockDemoData.mockDeviceProfiles.length,
      documents: mockDemoData.mockDocuments.length,
      scenarios: Object.keys(mockDemoData.mockDemoScenarios).length,
    },
  });
});

export default router;
