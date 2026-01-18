import type { Request, Response } from 'express';
import { CSRIntelligenceSequence } from '../../cer2v/csr-intelligence-sequence';
import { ECTDExporter } from '../../cer2v/ectd-exporter';
import { addExportRecord } from '../../cer2v/submissions-store';
import { logCerv2AuditEvent } from '../../cer2v/audit';
import { db } from '../../db';
import { getCitationSummary } from '../../cer2v/citation-summary-store';
import { cerv2Evidence } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

const sequence = new CSRIntelligenceSequence();
const exporter = new ECTDExporter();

const getOrgId = (req: Request) =>
  Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);

export default async function handler(req: Request, res: Response) {
  try {
    const { csrIds, programId, citationSummary, allowUnresolved } = req.body || {};

    if (!csrIds || !Array.isArray(csrIds) || csrIds.length === 0) {
      return res.status(400).json({ error: 'csrIds array required' });
    }

    const csrId = csrIds[0];
    const { cerDocument } = await sequence.executeSequence(csrId);
    const storedSummary = programId
      ? getCitationSummary(getOrgId(req), programId)
      : null;
    const resolvedSummary = citationSummary
      ? {
          totalTokens: Number(citationSummary.totalTokens || 0),
          resolvedTokens: Number(citationSummary.resolvedTokens || 0),
          unresolvedTokens: Number(citationSummary.unresolvedTokens || 0),
        }
      : storedSummary
        ? {
            totalTokens: storedSummary.totalTokens,
            resolvedTokens: storedSummary.resolvedTokens,
            unresolvedTokens: storedSummary.unresolvedTokens,
          }
        : undefined;

    if (resolvedSummary && resolvedSummary.unresolvedTokens > 0 && !allowUnresolved) {
      return res.status(409).json({
        success: false,
        error: 'Unresolved citations detected. Resolve before export or pass allowUnresolved=true.',
        citationSummary: resolvedSummary,
      });
    }

    let evidenceFiles = undefined as
      | { name: string; path: string }[]
      | undefined;

    if (db && programId) {
      const rows = await db
        .select()
        .from(cerv2Evidence)
        .where(
          and(
            eq(cerv2Evidence.organizationId, getOrgId(req)),
            eq(cerv2Evidence.programId, programId)
          )
        );
      evidenceFiles = rows
        .filter(row => row.filePath)
        .map(row => ({ name: row.name, path: row.filePath }));
    }

    const result = await exporter.exportZip(cerDocument, {
      csrId,
      citationSummary: resolvedSummary,
      evidenceFiles,
    });

    addExportRecord(getOrgId(req), programId || 'default', {
      exportId: result.manifest.exportId,
      programId: programId || 'default',
      filename: result.filename,
      createdAt: result.manifest.generatedAt,
      csrId: csrId || null,
      integrity: {
        merkleRoot: result.manifest.integrity.merkleRoot,
        evidenceCount: result.manifest.integrity.evidenceCount,
      },
    });
    await logCerv2AuditEvent(db, req, {
      programId: programId || 'default',
      action: 'export_generated',
      entityType: 'submission',
      entityId: result.manifest.exportId,
      diffSummary: `Generated export ${result.filename}`,
      metadata: {
        filename: result.filename,
        merkleRoot: result.manifest.integrity.merkleRoot,
        evidenceCount: result.manifest.integrity.evidenceCount,
      },
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length.toString());

    return res.status(200).send(result.buffer);
  } catch (error: any) {
    console.error('CER2V export error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Export failed',
    });
  }
}
