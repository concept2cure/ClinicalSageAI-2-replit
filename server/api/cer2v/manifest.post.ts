import type { Request, Response } from 'express';
import { CSRIntelligenceSequence } from '../../cer2v/csr-intelligence-sequence';
import { ECTDExporter } from '../../cer2v/ectd-exporter';

const sequence = new CSRIntelligenceSequence();
const exporter = new ECTDExporter();

export default async function handler(req: Request, res: Response) {
  try {
    const { csrIds } = req.body || {};

    if (!csrIds || !Array.isArray(csrIds) || csrIds.length === 0) {
      return res.status(400).json({ error: 'csrIds array required' });
    }

    const csrId = csrIds[0];
    const { cerDocument } = await sequence.executeSequence(csrId);
    const manifest = exporter.buildRegTraceManifest(cerDocument, { csrId });

    return res.status(200).json({ success: true, manifest });
  } catch (error: any) {
    console.error('CER2V manifest error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Manifest generation failed',
    });
  }
}
