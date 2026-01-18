import type { Request, Response } from 'express';
import { resolveCitationsFromDb } from '../../cer2v/citation-resolver';
import { db } from '../../db';

const getTenantKey = (req: Request, programId?: string) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  return `org-${organizationId}-program-${programId || 'default'}`;
};

export default async function handler(req: Request, res: Response) {
  try {
    const { programId, content } = req.body || {};
    if (!content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }
    if (!db || !programId) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
    const result = await resolveCitationsFromDb(
      db,
      organizationId,
      programId,
      String(content)
    );

    return res.json({
      success: true,
      ...result,
      citationSummary: {
        totalTokens: result.tokens.length,
        resolvedTokens: result.resolved.length,
        unresolvedTokens: result.unresolved.length,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to resolve citations',
    });
  }
}
