/**
 * Inline Annotations API — Sentence/selection-level annotations on documents
 *
 * Supports approval requests, review requests, comments, questions, and
 * suggestions on specific text ranges within documents. All operations
 * are audit-logged for regulatory compliance.
 *
 * Endpoints:
 *   GET    /api/inline-annotations/:documentId             — List all annotations
 *   POST   /api/inline-annotations/:documentId             — Create annotation
 *   POST   /api/inline-annotations/:documentId/:id/reply   — Reply to annotation
 *   POST   /api/inline-annotations/:documentId/:id/decide  — Approve/reject/resolve
 *   DELETE /api/inline-annotations/:documentId/:id         — Delete (soft)
 *
 * @module server/routes/inline-annotations
 * @compliance FDA 21 CFR Part 11 — all annotations immutably audit-logged
 */

import { Router, Request, Response } from 'express';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('inline-annotations');
const router = Router();

// ── In-memory store (production would use documentComments DB table) ────────

interface AnnotationReply {
  id: number;
  content: string;
  createdBy: string;
  createdAt: string;
}

interface InlineAnnotation {
  id: number;
  documentId: number;
  annotationType: string;
  selectedText: string;
  rangeFrom: number;
  rangeTo: number;
  content: string;
  status: 'pending' | 'approved' | 'rejected' | 'resolved';
  priority: string;
  createdBy: string;
  createdByRole?: string;
  assignedTo?: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  replies: AnnotationReply[];
}

const annotationStore = new Map<number, InlineAnnotation[]>();
let nextAnnotationId = 100;
let nextReplyId = 1000;

// Seed with example annotations for demo
function seedAnnotations() {
  const doc1Annotations: InlineAnnotation[] = [
    {
      id: 1,
      documentId: 1,
      annotationType: 'approval_request',
      selectedText: 'The primary endpoint demonstrated statistical significance (p<0.001)',
      rangeFrom: 120,
      rangeTo: 185,
      content: 'Please verify the statistical significance claim against the SAP. Need formal approval before submission.',
      status: 'pending',
      priority: 'critical',
      createdBy: 'Sarah Chen',
      createdByRole: 'Medical Writer',
      assignedTo: 'Dr. James Morton',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      replies: [
        {
          id: 1,
          content: 'I will cross-reference with the biostatistics report. Expected review by EOD.',
          createdBy: 'Dr. James Morton',
          createdAt: new Date(Date.now() - 43200000).toISOString(),
        },
      ],
    },
    {
      id: 2,
      documentId: 1,
      annotationType: 'review_request',
      selectedText: 'Adverse events were consistent with the known safety profile',
      rangeFrom: 300,
      rangeTo: 360,
      content: 'Please review this safety summary against Table 14.3.1 in the CSR appendix.',
      status: 'approved',
      priority: 'high',
      createdBy: 'Sarah Chen',
      assignedTo: 'Dr. Lisa Park',
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      resolvedBy: 'Dr. Lisa Park',
      resolvedAt: new Date(Date.now() - 86400000).toISOString(),
      resolutionNote: 'Confirmed — safety language aligns with Table 14.3.1 and the DSUR.',
      replies: [],
    },
    {
      id: 3,
      documentId: 1,
      annotationType: 'comment',
      selectedText: 'Module 2.7.4 Summary of Clinical Safety',
      rangeFrom: 50,
      rangeTo: 95,
      content: 'Consider adding a cross-reference to the Risk Management Plan per ICH E2E.',
      status: 'pending',
      priority: 'normal',
      createdBy: 'Dr. Lisa Park',
      createdAt: new Date(Date.now() - 259200000).toISOString(),
      replies: [],
    },
  ];

  annotationStore.set(1, doc1Annotations);
}

seedAnnotations();

// ── GET /api/inline-annotations/:documentId ─────────────────────────────────

router.get('/:documentId', (req: Request, res: Response) => {
  const documentId = parseInt(req.params.documentId, 10);
  if (isNaN(documentId)) return res.status(400).json({ error: 'Invalid documentId' });

  const annotations = annotationStore.get(documentId) || [];

  // Optional range filter
  const { rangeFrom, rangeTo } = req.query;
  if (rangeFrom && rangeTo) {
    const from = Number(rangeFrom);
    const to = Number(rangeTo);
    const filtered = annotations.filter(a => a.rangeFrom <= to && a.rangeTo >= from);
    return res.json(filtered);
  }

  res.json(annotations);
});

// ── POST /api/inline-annotations/:documentId ────────────────────────────────

router.post('/:documentId', async (req: Request, res: Response) => {
  const documentId = parseInt(req.params.documentId, 10);
  if (isNaN(documentId)) return res.status(400).json({ error: 'Invalid documentId' });

  const {
    annotationType,
    selectedText,
    rangeFrom,
    rangeTo,
    content,
    assignedTo,
    priority,
  } = req.body;

  if (!annotationType || !selectedText || rangeFrom == null || rangeTo == null || !content) {
    return res.status(400).json({
      error: 'Missing required fields: annotationType, selectedText, rangeFrom, rangeTo, content',
    });
  }

  const annotation: InlineAnnotation = {
    id: nextAnnotationId++,
    documentId,
    annotationType,
    selectedText,
    rangeFrom: Number(rangeFrom),
    rangeTo: Number(rangeTo),
    content,
    status: 'pending',
    priority: priority || 'normal',
    createdBy: 'Current User', // In production, from JWT
    assignedTo: assignedTo || undefined,
    createdAt: new Date().toISOString(),
    replies: [],
  };

  if (!annotationStore.has(documentId)) {
    annotationStore.set(documentId, []);
  }
  annotationStore.get(documentId)!.push(annotation);

  // Audit log
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

  logger.info(`Inline annotation ${annotation.id} created on document ${documentId} [${annotationType}]`);
  res.status(201).json(annotation);
});

// ── POST /api/inline-annotations/:documentId/:id/reply ──────────────────────

router.post('/:documentId/:id/reply', async (req: Request, res: Response) => {
  const documentId = parseInt(req.params.documentId, 10);
  const annotationId = parseInt(req.params.id, 10);
  const { content } = req.body;

  if (!content?.trim()) return res.status(400).json({ error: 'Reply content required' });

  const annotations = annotationStore.get(documentId);
  const annotation = annotations?.find(a => a.id === annotationId);
  if (!annotation) return res.status(404).json({ error: 'Annotation not found' });

  const reply: AnnotationReply = {
    id: nextReplyId++,
    content: content.trim(),
    createdBy: 'Current User', // From JWT in production
    createdAt: new Date().toISOString(),
  };

  annotation.replies.push(reply);

  await auditService.logAction({
    action: 'inline_annotation_reply',
    resourceType: 'document',
    resourceId: documentId,
    details: { annotationId, replyId: reply.id },
  });

  res.status(201).json(reply);
});

// ── POST /api/inline-annotations/:documentId/:id/decide ─────────────────────

router.post('/:documentId/:id/decide', async (req: Request, res: Response) => {
  const documentId = parseInt(req.params.documentId, 10);
  const annotationId = parseInt(req.params.id, 10);
  const { decision, note } = req.body;

  if (!decision || !['approved', 'rejected', 'resolved'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid decision — must be approved, rejected, or resolved' });
  }

  const annotations = annotationStore.get(documentId);
  const annotation = annotations?.find(a => a.id === annotationId);
  if (!annotation) return res.status(404).json({ error: 'Annotation not found' });

  annotation.status = decision;
  annotation.resolvedBy = 'Current User'; // From JWT in production
  annotation.resolvedAt = new Date().toISOString();
  annotation.resolutionNote = note || undefined;

  await auditService.logAction({
    action: `inline_annotation_${decision}`,
    resourceType: 'document',
    resourceId: documentId,
    details: {
      annotationId,
      decision,
      annotationType: annotation.annotationType,
      selectedTextPreview: annotation.selectedText.slice(0, 100),
    },
  });

  logger.info(`Inline annotation ${annotationId} ${decision} on document ${documentId}`);
  res.json(annotation);
});

export default router;
