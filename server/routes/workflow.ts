/**
 * Workflow Routes
 * Document workflow management
 */
import { Router } from 'express';
import { ComplianceCertificateGenerator } from '../../services/proof/ComplianceCertificate';
import { ProofVerificationService } from '../../services/proof/ProofVerificationService';
import logger from '../utils/logger';

const router = Router();
const certificateGenerator = new ComplianceCertificateGenerator();
const proofVerifier = new ProofVerificationService();

router.get('/status', (req, res) => {
  res.json({
    status: 'ready',
    workflows: [],
    message: 'Workflow service ready',
  });
});

router.get('/tasks', (req, res) => {
  res.json({ tasks: [] });
});

router.post('/tasks', (req, res) => {
  res.json({
    success: true,
    task: { id: Date.now(), ...req.body },
  });
});

// Proof system endpoints
router.get('/proofs/certificate/:workflowRunId', async (req, res) => {
  try {
    if (!req.params.workflowRunId) {
      return res.status(400).json({ error: 'Missing workflowRunId' });
    }
    const certificate = await certificateGenerator.generateCertificate(req.params.workflowRunId);
    logger.info('proof.certificate.generated', {
      workflowRunId: req.params.workflowRunId,
      certificateId: certificate.certificateId,
      submissionType: certificate.submissionType,
    });
    res.json(certificate);
  } catch (error) {
    logger.error('proof.certificate.failed', {
      workflowRunId: req.params.workflowRunId,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    res.status(500).json({ error: 'Failed to generate certificate' });
  }
});

router.post('/proofs/verify', (req, res) => {
  try {
    if (!req.body?.workflowRunId) {
      return res.status(400).json({ error: 'Missing workflowRunId' });
    }
    const result = proofVerifier.verifyCertificate(req.body);
    logger.info('proof.certificate.verified', {
      workflowRunId: req.body?.workflowRunId,
      valid: result.valid,
      failures: result.failures?.length || 0,
    });
    res.json(result);
  } catch (error) {
    logger.error('proof.certificate.verify_failed', {
      workflowRunId: req.body?.workflowRunId,
      error: error instanceof Error ? error.message : 'invalid_payload',
    });
    res.status(400).json({ error: 'Invalid certificate payload' });
  }
});

export default router;
