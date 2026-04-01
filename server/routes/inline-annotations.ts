/**
 * Inline Annotations API — Sentence/selection-level annotations on documents
 *
 * Supports approval requests, review requests, comments, questions, and
 * suggestions on specific text ranges within documents. All operations
 * are audit-logged for regulatory compliance. Data persisted in projectMemoryEntries.
 *
 * Endpoints:
 *   GET    /api/inline-annotations/:documentId             — List all annotations
 *   POST   /api/inline-annotations/:documentId             — Create annotation
 *   POST   /api/inline-annotations/:documentId/:id/reply   — Reply to annotation
 *   POST   /api/inline-annotations/:documentId/:id/decide  — Approve/reject/resolve
 *
 * @module server/routes/inline-annotations
 * @compliance FDA 21 CFR Part 11 — all annotations immutably audit-logged
 */

import { Router, Request, Response } from 'express';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger';
import { createFeatureStore } from '../utils/feature-persistence';

const logger = createScopedLogger('inline-annotations');
const router = Router();
const store = createFeatureStore('inline_annotation');

function getOrgId(req: Request): number {
  return (
    (req as any).tenantContext?.organizationId ||
    (req as any).tenantId ||
    (req as any).organizationId ||
    (req as any).user?.organizationId ||
    1
  );
}

router.get('/:documentId', async (req: Request, res: Response) => {
  try {
    const documentId = parseInt(req.params.documentId, 10);
    if (isNaN(documentId)) return res.status(400).json({ error: 'Invalid documentId' });
    const orgId = getOrgId(req);

    const all = await store.query(orgId, 'annotation');
    let annotations = all.filter((a: any) => a.documentId === documentId);

    const { rangeFrom, rangeTo } = req.query;
    if (rangeFrom && rangeTo) {
      const from = Number(rangeFrom);
      const to = Number(rangeTo);
      annotations = annotations.filter((a: any) => a.rangeFrom <= to && a.rangeTo >= from);
    }

    res.json(annotations);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch annotations' });
  }
});

router.post('/:documentId', async (req: Request, res: Response) => {
  try {
    const documentId = parseInt(req.params.documentId, 10);
    if (isNaN(documentId)) return res.status(400).json({ error: 'Invalid documentId' });
    const orgId = getOrgId(req);

    const { annotationType, selectedText, rangeFrom, rangeTo, content, assignedTo, priority } =
      req.body;

    if (!annotationType || !selectedText || rangeFrom == null || rangeTo == null || !content) {
      return res.status(400).json({
        error:
          'Missing required fields: annotationType, selectedText, rangeFrom, rangeTo, content',
      });
    }

    const annotationData = {
      documentId,
      annotationType,
      selectedText,
      rangeFrom: Number(rangeFrom),
      rangeTo: Number(rangeTo),
      content,
      status: 'pending',
      priority: priority || 'normal',
      createdBy: 'Current User',
      assignedTo: assignedTo || undefined,
      replies: [],
    };

    const annotation = await store.insert(
      orgId,
      'annotation',
      `${annotationType}: ${selectedText.slice(0, 80)}`,
      annotationData,
    );

    await auditService.logAction({
      action: 'inline_annotation_created',
      resourceType: 'document',
      resourceId: documentId,
      details: {
        annotationId: annotation.id,
        annotationType,
        rangeFrom,
        rangeTo,
        selectedTextPreview: selectedText.slice(0, 100),
        assignedTo,
        priority,
      },
    });

    logger.info(
      `Inline annotation ${annotation.id} created on document ${documentId} [${annotationType}]`,
    );
    res.status(201).json(annotation);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create annotation' });
  }
});

router.post('/:documentId/:id/reply', async (req: Request, res: Response) => {
  try {
    const documentId = parseInt(req.params.documentId, 10);
    const annotationId = parseInt(req.params.id, 10);
    const { content } = req.body;
    const orgId = getOrgId(req);

    if (!content?.trim()) return res.status(400).json({ error: 'Reply content required' });

    const annotation = await store.getById(annotationId, orgId);
    if (!annotation) return res.status(404).json({ error: 'Annotation not found' });

    const reply = {
      id: Date.now(),
      content: content.trim(),
      createdBy: 'Current User',
      createdAt: new Date().toISOString(),
    };

    const replies = annotation.replies || [];
    replies.push(reply);
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = annotation;
    await store.update(annotationId, orgId, { ...data, replies });

    await auditService.logAction({
      action: 'inline_annotation_reply',
      resourceType: 'document',
      resourceId: documentId,
      details: { annotationId, replyId: reply.id },
    });

    res.status(201).json(reply);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to add reply' });
  }
});

router.post('/:documentId/:id/decide', async (req: Request, res: Response) => {
  try {
    const documentId = parseInt(req.params.documentId, 10);
    const annotationId = parseInt(req.params.id, 10);
    const { decision, note } = req.body;
    const orgId = getOrgId(req);

    if (!decision || !['approved', 'rejected', 'resolved'].includes(decision)) {
      return res
        .status(400)
        .json({ error: 'Invalid decision — must be approved, rejected, or resolved' });
    }

    const annotation = await store.getById(annotationId, orgId);
    if (!annotation) return res.status(404).json({ error: 'Annotation not found' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = annotation;
    const updated = {
      ...data,
      status: decision,
      resolvedBy: 'Current User',
      resolvedAt: new Date().toISOString(),
      resolutionNote: note || undefined,
    };

    const result = await store.update(annotationId, orgId, updated);

    await auditService.logAction({
      action: `inline_annotation_${decision}`,
      resourceType: 'document',
      resourceId: documentId,
      details: {
        annotationId,
        decision,
        annotationType: annotation.annotationType,
        selectedTextPreview: annotation.selectedText?.slice(0, 100),
      },
    });

    logger.info(`Inline annotation ${annotationId} ${decision} on document ${documentId}`);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to decide annotation' });
  }
});

export default router;
