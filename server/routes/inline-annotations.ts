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

/**
 * Resolve the organization, or nothing.
 *
 * This ended `|| 1`. A request carrying no tenant context did not fail — it
 * read and wrote ORGANIZATION 1's annotations, and its approve/reject
 * decisions, on documents belonging to a tenant nobody named. The `/api` auth
 * boundary establishes tenant context ahead of this mount, so the fallback was
 * reachable only in warn mode or for a principal with no organizationId;
 * neither is a reason to keep a default on a route that decides whether text in
 * a regulated document is approved.
 */
function resolveOrgId(req: Request): number | null {
  const raw =
    (req as any).tenantContext?.organizationId ??
    (req as any).tenantId ??
    (req as any).organizationId ??
    (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Who is acting — from the request, never invented.
 *
 * `createdBy` and `resolvedBy` were the literal string 'Current User', in three
 * places, on a route whose header claims 21 CFR Part 11 audit coverage. The
 * record of who approved or rejected a passage of a regulated document read
 * "Current User". There is no display name to fall back to that would be true,
 * so this returns null and the write is refused instead.
 */
function resolveActor(req: Request): { id: number | null; label: string } | null {
  const u = (req as any).user as { id?: unknown; name?: unknown; email?: unknown } | undefined;
  if (!u) return null;
  const idRaw = u.id;
  const id = idRaw == null ? null : Number.isFinite(Number(idRaw)) ? Number(idRaw) : null;
  const name = typeof u.name === 'string' && u.name.trim() !== '' ? u.name.trim() : null;
  const email = typeof u.email === 'string' && u.email.trim() !== '' ? u.email.trim() : null;
  const label = name ?? email ?? (id == null ? null : `user #${id}`);
  if (!label) return null;
  return { id, label };
}

/** Where the resolved org and actor are parked for the handlers, per request. */
const ANN_CTX = Symbol.for('inlineAnnotations.ctx');

interface AnnotationContext {
  orgId: number;
  actor: { id: number | null; label: string } | null;
}

/* One gate for all four endpoints, so a new one cannot be added without it. */
router.use((req: Request, res: Response, next) => {
  const orgId = resolveOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: 'Organization context required.' });
  }
  (req as any)[ANN_CTX] = { orgId, actor: resolveActor(req) } satisfies AnnotationContext;
  next();
});

function ctxOf(req: Request): AnnotationContext {
  return (req as any)[ANN_CTX] as AnnotationContext;
}

function getOrgId(req: Request): number {
  return ctxOf(req).orgId;
}

/**
 * The actor for a WRITE, or a refusal. A reply, an annotation or a decision
 * that cannot name who made it is not recorded.
 */
function requireActor(req: Request, res: Response): { id: number | null; label: string } | null {
  const { actor } = ctxOf(req);
  if (!actor) {
    res.status(403).json({
      error: 'The signed-in user could not be identified, so this action was not recorded.',
    });
    return null;
  }
  return actor;
}

router.get('/:documentId', async (req: Request, res: Response) => {
  try {
    const documentId = parseInt(String(req.params.documentId), 10);
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
  } catch (err) {
    logger.error('inline-annotation list failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to fetch annotations' });
  }
});

router.post('/:documentId', async (req: Request, res: Response) => {
  try {
    const documentId = parseInt(String(req.params.documentId), 10);
    if (isNaN(documentId)) return res.status(400).json({ error: 'Invalid documentId' });
    const orgId = getOrgId(req);
    const actor = requireActor(req, res);
    if (!actor) return;

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
      createdBy: actor.label,
      createdByUserId: actor.id,
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
      /* tenantId and userId were both absent, so every row this Part 11-labelled
         route wrote landed under tenant 0 with a null actor — an audit trail
         that records neither whose document it was nor who touched it. */
      tenantId: orgId,
      userId: actor.id ?? undefined,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
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
  } catch (err) {
    logger.error('inline-annotation create failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to create annotation' });
  }
});

router.post('/:documentId/:id/reply', async (req: Request, res: Response) => {
  try {
    const documentId = parseInt(String(req.params.documentId), 10);
    const annotationId = parseInt(String(req.params.id), 10);
    const { content } = req.body;
    const orgId = getOrgId(req);
    const actor = requireActor(req, res);
    if (!actor) return;

    if (!content?.trim()) return res.status(400).json({ error: 'Reply content required' });

    const annotation = await store.getById(annotationId, orgId);
    if (!annotation) return res.status(404).json({ error: 'Annotation not found' });

    const reply = {
      id: Date.now(),
      content: content.trim(),
      createdBy: actor.label,
      createdByUserId: actor.id,
      createdAt: new Date().toISOString(),
    };

    const replies = annotation.replies || [];
    replies.push(reply);
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = annotation;
    await store.update(annotationId, orgId, { ...data, replies });

    await auditService.logAction({
      tenantId: orgId,
      userId: actor.id ?? undefined,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      action: 'inline_annotation_reply',
      resourceType: 'document',
      resourceId: documentId,
      details: { annotationId, replyId: reply.id },
    });

    res.status(201).json(reply);
  } catch (err) {
    logger.error('inline-annotation reply failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to add reply' });
  }
});

router.post('/:documentId/:id/decide', async (req: Request, res: Response) => {
  try {
    const documentId = parseInt(String(req.params.documentId), 10);
    const annotationId = parseInt(String(req.params.id), 10);
    const { decision, note } = req.body;
    const orgId = getOrgId(req);
    const actor = requireActor(req, res);
    if (!actor) return;

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
      resolvedBy: actor.label,
      resolvedByUserId: actor.id,
      resolvedAt: new Date().toISOString(),
      resolutionNote: note || undefined,
    };

    const result = await store.update(annotationId, orgId, updated);

    await auditService.logAction({
      tenantId: orgId,
      userId: actor.id ?? undefined,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
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
  } catch (err) {
    logger.error('inline-annotation decide failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to decide annotation' });
  }
});

export default router;
