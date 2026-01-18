import type { Request, Response } from 'express';
import { ECTDGenerator } from '../../cer2v/ectd-generator';

const generator = new ECTDGenerator();

export default async function handler(req: Request, res: Response) {
  try {
    const { deviceName, indication, canadianCSRIds } = req.body || {};

    if (!deviceName || !indication || !canadianCSRIds?.length) {
      return res.status(400).json({
        error: 'Missing required: deviceName, indication, canadianCSRIds',
      });
    }

    // Production-grade report generation
    const cer = await generator.generateCER2V({
      name: deviceName,
      indication,
      canadianCSRs: canadianCSRIds,
    });

    const ectdXml = generator.exportToECTD(cer);

    res.status(200).json({
      success: true,
      cerId: `CER2V-${Date.now()}`,
      regulatoryPathway: cer.regulatoryPathway,
      clinicalEvidenceCount: cer.clinicalEvidence.length,
      ectdXml,
      summary: `Generated CER2V for ${deviceName} with ${cer.clinicalEvidence.length} evidence sources`,
    });
  } catch (error: any) {
    console.error('CER2V generation error:', error);
    res.status(500).json({
      error: 'CER2V generation failed',
      details: error?.message || 'Unknown error',
    });
  }
}
