/**
 * CMC Module API Index
 *
 * This file exports all CMC module API routes and serves as the entry point
 * for CMC module functionality.
 */

import express from 'express';
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

// Test endpoint to trigger CMC events
router.post('/test-event', async (req, res) => {
  const { eventType, data } = req.body;
  
  try {
    const { emitCMCEvent } = await import('../../services/cmcEvents.js');
    const patch = await emitCMCEvent(eventType, data);
    
    res.json({ 
      success: true, 
      message: `Event ${eventType} triggered`,
      patch 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get CMC module status and capabilities
router.get('/status', (req, res) => {
  res.status(200).json({
    status: 'active',
    modules: [
      {
        id: 'blueprint-generator',
        name: 'AI-CMC Blueprint Generator',
        description: 'Auto-generate ICH-compliant Module 3 documents from molecule + process data.',
        status: 'operational',
      },
      {
        id: 'change-impact-simulator',
        name: 'AI Change Impact Simulator (AICIS)',
        description:
          'Simulate change consequences across global filings before making a CMC change.',
        status: 'operational',
      },
      {
        id: 'manufacturing-tuner',
        name: 'Manufacturing Intelligence Tuner',
        description: 'Benchmark and improve your process using AI + global precedent mining.',
        status: 'operational',
      },
      {
        id: 'preclinical-translator',
        name: 'Preclinical-to-Process Translator',
        description: 'Instantly scale lab discoveries into commercial process frameworks.',
        status: 'operational',
      },
      {
        id: 'global-compliance',
        name: 'Global Compliance Auto-Match',
        description: 'Auto-localize content for multiple health authorities.',
        status: 'operational',
      },
      {
        id: 'audit-risk-monitor',
        name: 'Real-Time Audit Risk Monitor',
        description: 'AI-powered surveillance of compliance gaps.',
        status: 'operational',
      },
      {
        id: 'cmc-copilot',
        name: 'CMC CoPilot',
        description: 'AI assistant available in every CMC screen.',
        status: 'operational',
      },
    ],
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

export default router;
