/**
 * CMC Module API Index
 *
 * This file exports all CMC module API routes and serves as the entry point
 * for CMC module functionality.
 */

import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import blueprintGeneratorRouter from './blueprint-generator.js';
import changeImpactSimulatorRouter from './change-impact-simulator.js';
import manufacturingTunerRouter from './manufacturing-tuner.js';
import preclinicalTranslatorRouter from './preclinical-translator.js';
import globalComplianceRouter from './global-compliance.js';
import auditRiskMonitorRouter from './audit-risk-monitor.js';
import cmcCopilotRouter from './cmc-copilot.js';

const router = express.Router();

// Register all CMC module routes
router.use('/blueprint-generator', blueprintGeneratorRouter);
router.use('/change-impact-simulator', changeImpactSimulatorRouter);
router.use('/manufacturing-tuner', manufacturingTunerRouter);
router.use('/preclinical-translator', preclinicalTranslatorRouter);
router.use('/global-compliance', globalComplianceRouter);
router.use('/audit-risk-monitor', auditRiskMonitorRouter);
router.use('/cmc-copilot', cmcCopilotRouter);

// Allowed CMC lifecycle event types that the test hook may emit.
// Mirrors the switch in server/services/cmcEvents.js::emitCMCEvent.
const ALLOWED_TEST_EVENT_TYPES = new Set([
  'spec.approved',
  'stability.updated',
  'method.validated',
  'manufacturing.updated',
  'batch.released',
]);

// Test endpoint to trigger CMC events.
//
// SECURITY: This is a development-only test hook that emits arbitrary CMC
// lifecycle events. It is hard-blocked in production (returns 404) and
// requires authentication everywhere else, and validates its input before
// emitting. Mirrors the gating pattern used by other test/demo routes in
// this repo (see server/routes/seed-demo.ts).
router.post('/test-event', requireAuth, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const { eventType, data } = req.body ?? {};

  if (typeof eventType !== 'string' || !ALLOWED_TEST_EVENT_TYPES.has(eventType)) {
    return res.status(400).json({
      error: 'Invalid or missing eventType',
      allowedEventTypes: Array.from(ALLOWED_TEST_EVENT_TYPES),
    });
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid or missing data: expected an object' });
  }

  try {
    const { emitCMCEvent } = await import('../../services/cmcEvents.js');
    const patch = await emitCMCEvent(eventType, data);

    res.json({
      success: true,
      message: `Event ${eventType} triggered`,
      patch,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get CMC module capability manifest.
//
// HONESTY: This is a static capability manifest (source: 'manifest'), not a
// live health probe. Each module is reported as 'available' because its router
// is mounted above via router.use(); we do not claim per-module 'operational'
// health that was never checked, and we do not report a fabricated build
// version. The API itself is 'active' by virtue of serving this response.
router.get('/status', (req, res) => {
  res.status(200).json({
    status: 'active',
    source: 'manifest',
    modules: [
      {
        id: 'blueprint-generator',
        name: 'AI-CMC Blueprint Generator',
        description: 'Auto-generate ICH-compliant Module 3 documents from molecule + process data.',
        status: 'available',
      },
      {
        id: 'change-impact-simulator',
        name: 'AI Change Impact Simulator (AICIS)',
        description:
          'Simulate change consequences across global filings before making a CMC change.',
        status: 'available',
      },
      {
        id: 'manufacturing-tuner',
        name: 'Manufacturing Intelligence Tuner',
        description: 'Benchmark and improve your process using AI + global precedent mining.',
        status: 'available',
      },
      {
        id: 'preclinical-translator',
        name: 'Preclinical-to-Process Translator',
        description: 'Instantly scale lab discoveries into commercial process frameworks.',
        status: 'available',
      },
      {
        id: 'global-compliance',
        name: 'Global Compliance Auto-Match',
        description: 'Auto-localize content for multiple health authorities.',
        status: 'available',
      },
      {
        id: 'audit-risk-monitor',
        name: 'Real-Time Audit Risk Monitor',
        description: 'AI-powered surveillance of compliance gaps.',
        status: 'available',
      },
      {
        id: 'cmc-copilot',
        name: 'CMC CoPilot',
        description: 'AI assistant available in every CMC screen.',
        status: 'available',
      },
    ],
    timestamp: new Date().toISOString(),
  });
});

export default router;
