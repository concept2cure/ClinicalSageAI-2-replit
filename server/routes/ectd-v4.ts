/**
 * eCTD v4.0 + controlled-vocabulary + qualification API.
 *
 * Read/validate-oriented endpoints that expose the v4.0 (HL7 RPS) engine and
 * the controlled-vocabulary service to the client. Deterministic packaging and
 * the governed transmit path stay on the existing gated routes; nothing here
 * transmits or freezes.
 *
 *   GET  /api/ectd/controlled-vocab                  — list all CV lists (v3 + v4)
 *   GET  /api/ectd/controlled-vocab/:listId          — one v4.0 CV list's codes
 *   POST /api/ectd/v4/validate                        — validate an RPS message model
 *   POST /api/ectd/v4/forward-compat                  — preview v3.2.2 → v4.0 conversion
 *   GET  /api/ectd/qualification/spec-versions        — spec versions we qualify against
 *
 * All endpoints require an authenticated tenant (401/403 fail-closed), matching
 * the eCTD export route. Mounted at /api/ectd via register-document-routes.
 *
 * @module server/routes/ectd-v4
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  V4_CODE_LISTS,
  V3_CODE_LISTS,
  getV4List,
  FDA_REGIONAL_IG_OID,
  type V4ListId,
} from '../services/ectd/controlled-vocab';
import {
  validateRpsMessage,
  forwardCompatToV4,
  buildRpsMessage,
  type RpsMessageInput,
} from '../services/ectd/ectd4';
import { SPEC_VERSIONS } from '../services/ectd/qualification';
import type { EctdLeaf } from '../services/submission-gateways/regional-packager';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('ectd-v4');

/** Fail-closed tenant gate (401 unauth / 403 no-org), mirroring ectd-export. */
function requireTenant(req: Request, res: Response): number | null {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const raw = user.organizationId ?? (req as any).tenantContext?.organizationId;
  const orgId = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(orgId)) {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }
  return orgId;
}

/* ─── zod schemas ─────────────────────────────────────────────────── */

const keywordSchema = z.object({
  code: z.string().min(1),
  codeSystem: z.string().min(1),
  value: z.string().optional(),
  displayName: z.string().optional(),
});

const couSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  codeSystem: z.string().min(1),
  title: z.string().optional(),
  priorityNumber: z.number(),
  status: z.enum(['active', 'suspended']),
  documentId: z.string().min(1),
  keywords: z.array(keywordSchema).optional(),
  relatedContextOfUseId: z.string().optional(),
  operation: z.enum(['create', 'revise', 'append', 'remove', 'nullify']).optional(),
});

const documentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  href: z.string().min(1),
  mediaType: z.string().min(1),
  checksum: z.string(),
  checksumType: z.literal('SHA256'),
});

const messageSchema = z.object({
  submissionUnit: z.object({
    id: z.string().min(1),
    unitTypeCode: z.string().min(1),
    title: z.string(),
    sequenceNumber: z.string(),
    status: z.literal('active'),
  }),
  submission: z.object({ typeCode: z.string().min(1), number: z.string().optional() }),
  application: z.object({
    number: z.string().min(1),
    typeCode: z.string().min(1),
    center: z.enum(['cder', 'cber', 'cdrh']),
  }),
  contextsOfUse: z.array(couSchema),
  documents: z.array(documentSchema),
  messageId: z.string().optional(),
  creationTime: z.string().optional(),
});

const leafSchema = z.object({
  ctdSection: z.string().min(1),
  operation: z.enum(['new', 'append', 'replace', 'delete']),
  sourcePath: z.string().default(''),
  fileName: z.string().min(1),
  title: z.string(),
  md5: z.string().optional(),
  modifiedFile: z.string().optional(),
});

const forwardCompatSchema = z.object({
  application: z.object({
    number: z.string().min(1),
    typeCode: z.string().min(1),
    center: z.enum(['cder', 'cber', 'cdrh']),
  }),
  submission: z.object({ typeCode: z.string().min(1), number: z.string().optional() }),
  submissionUnit: z.object({
    id: z.string().min(1),
    unitTypeCode: z.string().min(1),
    title: z.string(),
    sequenceNumber: z.string(),
    status: z.literal('active'),
  }),
  leaves: z.array(leafSchema),
  priorSequenceNumber: z.string().optional(),
});

export function createEctdV4Router(): Router {
  const router = Router();

  // ── Controlled vocabulary: list all lists (v3 + v4) ──────────────
  router.get('/controlled-vocab', (req, res) => {
    if (requireTenant(req, res) == null) return;
    res.json({
      regionalIgOid: FDA_REGIONAL_IG_OID,
      v4: Object.values(V4_CODE_LISTS).map((l) => ({
        id: l.id,
        shortName: l.shortName,
        oid: l.oid,
        codeCount: l.codes.length,
      })),
      v3: Object.entries(V3_CODE_LISTS).map(([id, codes]) => ({ id, codeCount: codes.length })),
    });
  });

  // ── Controlled vocabulary: one v4.0 list's codes ─────────────────
  router.get('/controlled-vocab/:listId', (req, res) => {
    if (requireTenant(req, res) == null) return;
    const listId = req.params.listId as V4ListId;
    // hasOwnProperty, not `in`: `in` walks the prototype chain, so
    // /controlled-vocab/__proto__ (or /constructor, /toString) answered 200
    // with a nonsense body instead of 404. Not reachable from the UI — the
    // client only ever sends an id the server itself supplied — so this is
    // hardening, not an outage. The route is public API surface all the same.
    if (!Object.prototype.hasOwnProperty.call(V4_CODE_LISTS, listId)) {
      res.status(404).json({ error: `Unknown v4.0 code list "${listId}"` });
      return;
    }
    res.json(getV4List(listId));
  });

  // ── Validate an RPS message model ────────────────────────────────
  router.post('/v4/validate', (req, res) => {
    if (requireTenant(req, res) == null) return;
    const parsed = messageSchema.safeParse(req.body?.message ?? req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid RPS message', details: parsed.error.flatten() });
      return;
    }
    const expectedSeq: string | undefined = req.body?.expectedSequenceNumber;
    const result = validateRpsMessage(parsed.data as RpsMessageInput, expectedSeq);
    res.json(result);
  });

  // ── Preview a v3.2.2 → v4.0 forward-compat conversion ────────────
  router.post('/v4/forward-compat', (req, res) => {
    if (requireTenant(req, res) == null) return;
    const parsed = forwardCompatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid forward-compat input', details: parsed.error.flatten() });
      return;
    }
    try {
      const { message, notes } = forwardCompatToV4({
        ...parsed.data,
        leaves: parsed.data.leaves as EctdLeaf[],
      });
      const validation = validateRpsMessage(message, message.submissionUnit.sequenceNumber);
      // Return the message, a serialized preview, notes, and its validation.
      res.json({
        message,
        submissionUnitXml: buildRpsMessage(message),
        notes,
        validation,
      });
    } catch (err) {
      log.error('forward-compat failed', { err: String(err) });
      res.status(500).json({ error: 'Forward-compat conversion failed' });
    }
  });

  // ── Spec versions we qualify against ─────────────────────────────
  router.get('/qualification/spec-versions', (req, res) => {
    if (requireTenant(req, res) == null) return;
    res.json(SPEC_VERSIONS);
  });

  return router;
}

export default createEctdV4Router;
