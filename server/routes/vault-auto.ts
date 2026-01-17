import express from 'express';
import { AutoVaultIngest } from '../cer2v/auto-vault';

const router = express.Router();

router.post('/link-csr', async (req, res) => {
  try {
    const { programId, csrData, isRealData, organizationId } = req.body;
    const vaultService = req.app.locals.vaultDmsService;

    if (!vaultService) {
      return res.status(500).json({ error: 'VaultDMSService is not available.' });
    }
    if (!programId) {
      return res.status(400).json({ error: 'programId is required.' });
    }
    if (!csrData) {
      return res.status(400).json({ error: 'csrData is required.' });
    }

    const vault = await AutoVaultIngest.create(vaultService, programId, organizationId);
    const docId = await vault.saveCSREvidence(csrData, Boolean(isRealData));
    res.json({ success: true, documentId: docId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/link-submission', async (req, res) => {
  try {
    const { programId, zipBuffer, modulesCompleted, organizationId } = req.body;
    const vaultService = req.app.locals.vaultDmsService;

    if (!vaultService) {
      return res.status(500).json({ error: 'VaultDMSService is not available.' });
    }
    if (!programId) {
      return res.status(400).json({ error: 'programId is required.' });
    }
    if (!zipBuffer) {
      return res.status(400).json({ error: 'zipBuffer is required.' });
    }

    const vault = await AutoVaultIngest.create(vaultService, programId, organizationId);
    const buffer = Buffer.isBuffer(zipBuffer) ? zipBuffer : Buffer.from(zipBuffer);
    const docId = await vault.saveSubmissionPackage(buffer, Number(modulesCompleted || 0));
    res.json({ success: true, documentId: docId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
