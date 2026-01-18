import type { Request, Response } from 'express';
import { verifyIntegrity } from '../../cer2v/integrity';

export default async function handler(req: Request, res: Response) {
  try {
    const { hashes, merkleRoot, manifest } = req.body || {};

    const resolvedHashes = Array.isArray(hashes)
      ? hashes
      : Array.isArray(manifest?.evidence)
        ? manifest.evidence.map((item: any) => item.sha256).filter(Boolean)
        : [];

    const resolvedRoot = merkleRoot ?? manifest?.integrity?.merkleRoot ?? null;

    if (!resolvedHashes.length || !resolvedRoot) {
      return res.status(400).json({
        success: false,
        error: 'hashes array and merkleRoot are required (or provide manifest with evidence and integrity.merkleRoot)',
      });
    }

    const result = verifyIntegrity(resolvedHashes, resolvedRoot);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Integrity verification failed',
    });
  }
}
