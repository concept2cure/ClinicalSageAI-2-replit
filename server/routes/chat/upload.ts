/**
 * server/routes/chat/upload.ts
 *
 * Governed file upload handler for chat.
 *
 * Handles POST /api/chat/upload. Stores file metadata in the `file_uploads` table
 * and, when a valid projectId + organizationId are present, also creates a
 * governed concept2cure_artifact (category='source') for unified Data Room access
 * and embeds the content into lumen_data_atoms for pgvector retrieval.
 *
 * Extracted from the legacy monolithic server/routes/chat.ts as part of the
 * Phase 4 chat-route decomposition. This module exports the handler only; the
 * Express Router wiring lives in the parent chat module.
 */

import type { Request, Response } from 'express';
import { pool } from '../../db.js';
import { resolveGovernedContext } from '../../services/concept2cure/governedDocumentContractService.js';
import { sha256 } from './provenance.js';

export const uploadHandler = async (req: Request, res: Response) => {
  try {
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fileName = (req as any).file?.originalname || req.body?.fileName || 'uploaded_file';
    const mimeType =
      (req as any).file?.mimetype || req.body?.mimeType || 'application/octet-stream';
    const fileSize = (req as any).file?.size || req.body?.fileSize || 0;
    const projectId = req.body?.projectId || req.body?.project_id;
    const userId = (req as any).user?.id || null;
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    // Store in uploads directory
    const storagePath = `uploads/${fileId}`;

    // Save metadata to DB
    await pool.query(
      `INSERT INTO file_uploads (id, user_id, original_name, mime_type, file_size, storage_path, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'uploaded', NOW())`,
      [fileId, userId, fileName, mimeType, fileSize, storagePath]
    );

    // ── Data Room convergence: create artifact + embed for retrieval ──
    let artifactId: string | null = null;
    if (projectId && orgId) {
      const numericProjectId = parseInt(String(projectId).replace('proj_', ''), 10);
      const numericOrgId = parseInt(String(orgId), 10);
      if (isNaN(numericProjectId) || isNaN(numericOrgId)) {
        return res.status(400).json({
          error: 'projectId and organizationId must be valid for governed upload',
          code: 'GOVERNED_UPLOAD_CONTEXT_INVALID',
        });
      }

      const artId = `artifact_chat_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const fileBuffer = (req as any).file?.buffer;
      const extractedText = fileBuffer && mimeType.startsWith('text/')
        ? fileBuffer.toString('utf8')
        : `[Uploaded via chat: ${fileName}] (${mimeType}, ${fileSize} bytes)`;
      const boundedContent = extractedText.substring(0, 100000);

      const governedResolution = resolveGovernedContext({
        req,
        projectId: numericProjectId,
        artifactId: null,
        documentType: 'source_document',
        generationMode: 'imported',
        lifecycleStatus: 'draft',
        originSurface: 'api_route',
        clientTrack: 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        evidenceMode: 'mixed',
        documentClass: 'evidence_memo',
        readinessGate: 'internal_review',
        approvalPathType: 'single_reviewer',
        recommendationSource: 'report_engine',
        workspaceTarget: 'project',
        regulatorIntent: 'evidence_analysis',
        placementContainerId: String(numericProjectId),
        title: fileName,
        content: boundedContent,
        sourceRefs: [`upload:${fileId}`],
        provider: 'chat_upload',
        model: 'file_ingest',
        exportAllowed: false,
        eventType: 'artifact.created',
      });

      if (!governedResolution.validation.valid) {
        return res.status(400).json({
          error: 'Governed document contract validation failed',
          code: 'GOVERNED_CONTRACT_INVALID',
          details: {
            errors: governedResolution.validation.errors,
            warnings: governedResolution.validation.warnings,
            resolved: governedResolution.resolved,
          },
        });
      }

      try {
        const contentHash = sha256(boundedContent);
        await pool.query(
          `INSERT INTO concept2cure_artifacts
             (organization_id, project_id, artifact_id, type, category, title, content, content_hash, version, metadata, created_by_id)
           VALUES ($1, $2, $3, 'source_document', 'source', $4, $5, $6, 1, $7, $8)`,
          [
            numericOrgId,
            numericProjectId,
            artId,
            fileName,
            boundedContent,
            contentHash,
            JSON.stringify({
              uploadSource: 'chat',
              fileId,
              mimeType,
              fileSize,
              harness: {
                clientTrack: governedResolution.contract.clientTrack,
                submissionProgram: governedResolution.contract.submissionProgram,
                persona: governedResolution.contract.persona,
                regulatorScope: governedResolution.contract.regulatorScope,
                documentClass: governedResolution.contract.documentClass,
                readinessGate: governedResolution.contract.readinessGate,
                workspaceTarget: governedResolution.contract.workspaceTarget,
                originSurface: governedResolution.contract.originSurface,
                recommendationSource: governedResolution.contract.recommendationSource,
                regulatorIntent: governedResolution.contract.regulatorIntent,
                gateChecks: governedResolution.contract.exportEligibility.gateChecks,
                blockingReasons: governedResolution.contract.exportEligibility.blockingReasons,
                readinessOutcome: governedResolution.contract.exportEligibility.readinessOutcome,
              },
            }),
            userId,
          ]
        );
        artifactId = artId;
      } catch (artErr: any) {
        console.error('[AnA] Chat upload governed artifact persistence failed:', artErr.message);
        return res.status(500).json({
          error: 'Governed artifact persistence failed for upload',
          code: 'ARTIFACT_CONSEQUENCE_REQUIRED',
        });
      }

      // Auto-embed into lumen_data_atoms for pgvector retrieval
      try {
        const atomResult = await pool.query(
          `INSERT INTO lumen_data_atoms
             (organization_id, source_type, source_id, atom_type, title, content, tags, confidence, status)
           VALUES ($1, 'chat_upload', $2, 'source_document', $3, $4, '{source,chat_upload}', 0.85, 'active')
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [numericOrgId, artId, fileName, boundedContent.substring(0, 16000)]
        );
        if (atomResult.rows.length > 0) {
          const { getEmbeddingService } = await import('../../services/enhancedEmbeddingService.js');
          const embeddingService = getEmbeddingService(pool);
          await embeddingService.embedAtom(atomResult.rows[0].id);
        }
      } catch (embedErr: any) {
        console.warn('[AnA] Chat upload embedding failed (non-fatal):', embedErr.message);
      }
    }

    res.json({
      fileId,
      message: 'File uploaded successfully',
      status: 'ready',
      fileName,
      artifactId,
    });
  } catch (error: any) {
    console.error('[AnA] Upload error:', error);
    res.status(500).json({
      error: 'Failed to upload file',
      code: 'UPLOAD_ERROR',
    });
  }
};
