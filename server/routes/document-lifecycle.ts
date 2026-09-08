/**
 * Document lifecycle route — the HTTP entry point to the ONE governed pipeline.
 *
 * A canonical document is created, its content signed off, and then advanced one
 * gated stage at a time (authoring → in_review → approved → placed → packaged →
 * submitted). Every transition runs the fail-closed gate
 * (canAdvanceDocument), routes to the bound effect (lifecycleBindings), and
 * appends exactly one hash-chained event to the per-document audit trail.
 *
 * The router is a factory so tests can inject a PGlite db and/or override the
 * lifecycle bindings; production uses the runtime db and the live bindings.
 *
 * @module server/routes/document-lifecycle
 */
import express, { type Request, type Response, type Router } from 'express';
import { resolveOrgId, resolveUserId } from '../types/auth-request';
import {
  advanceDocument,
  assertCanonicalIdentity,
  projectCanonicalDocument,
  type ProjectionInput,
} from '../services/regulatory/documentLifecycleOrchestrator';
import {
  createCanonicalDocument,
  loadProjectionInput,
  persistState,
  readOutline,
  recordSignature,
  type CanonicalStoreDb,
} from '../services/regulatory/canonicalDocumentStore';
import {
  buildLifecycleBindings,
  type LifecycleBindingDeps,
} from '../services/regulatory/lifecycleBindings';
import type { LifecycleBindings } from '../services/regulatory/documentLifecycleOrchestrator';
import {
  verifyAuditChain,
  type ApprovalSignature,
  type DocumentStage,
} from '../../shared/regulatory/document-lifecycle';
import { randomUUID } from 'crypto';

export interface DocumentLifecycleRouterOptions {
  /** Drizzle handle. Defaults to the runtime db. */
  db?: CanonicalStoreDb;
  /** Override the bindings (tests inject captures / delegates). */
  bindingsFactory?: (deps: LifecycleBindingDeps) => LifecycleBindings;
}

const isStage = (v: unknown): v is DocumentStage =>
  typeof v === 'string' &&
  ['authoring', 'in_review', 'approved', 'placed', 'packaged', 'submitted', 'superseded', 'withdrawn'].includes(v);

export function createDocumentLifecycleRouter(opts: DocumentLifecycleRouterOptions = {}): Router {
  const router = express.Router();
  const bindingsFactory = opts.bindingsFactory ?? buildLifecycleBindings;

  // The runtime db is resolved lazily so importing this module never forces a
  // pool. Tests always pass opts.db.
  const getDb = (): CanonicalStoreDb => {
    if (opts.db) return opts.db;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { db } = require('../db') as { db: CanonicalStoreDb };
    return db;
  };

  // Async handlers must not throw into Express unguarded (Express 4 does not
  // catch async rejections — the request would hang). Every handler is wrapped
  // so a failure returns a clean 500 with the reason.
  const wrap =
    (fn: (req: Request, res: Response) => Promise<Response | void>) =>
    async (req: Request, res: Response): Promise<Response | void> => {
      try {
        return await fn(req, res);
      } catch (err) {
        return res
          .status(500)
          .json({ ok: false, error: 'internal_error', detail: err instanceof Error ? err.message : String(err) });
      }
    };

  /** Create a canonical document (starts at `authoring`). */
  router.post('/', wrap(async (req: Request, res: Response) => {
    const organizationId = resolveOrgId(req);
    if (organizationId === null) return res.status(403).json({ ok: false, error: 'organization_context_required' });

    const { title, documentType, projectId, hasContent, contentHash, sources } = req.body ?? {};
    if (typeof title !== 'string' || !title.trim() || typeof documentType !== 'string' || !documentType.trim()) {
      return res.status(400).json({ ok: false, error: 'title_and_document_type_required' });
    }

    const canonicalId = await createCanonicalDocument(getDb(), {
      organizationId,
      title: title.trim(),
      documentType: documentType.trim(),
      projectId: typeof projectId === 'string' ? projectId : undefined,
      hasContent: Boolean(hasContent),
      contentHash: typeof contentHash === 'string' ? contentHash : undefined,
      sources,
    });
    // Report how many blueprint sections were instantiated as the outline.
    const outline = await readOutline(getDb(), canonicalId, organizationId);
    return res.status(201).json({ ok: true, canonicalId, sectionCount: outline.length });
  }));

  /** Record a review or approval sign-off (Part 11) on the document. */
  router.post('/:id/sign', wrap(async (req: Request, res: Response) => {
    const organizationId = resolveOrgId(req);
    if (organizationId === null) return res.status(403).json({ ok: false, error: 'organization_context_required' });

    const meaning = req.body?.meaning;
    if (meaning !== 'reviewed' && meaning !== 'approved') {
      return res.status(400).json({ ok: false, error: 'meaning_must_be_reviewed_or_approved' });
    }
    const existing = await loadProjectionInput(getDb(), String(req.params.id), organizationId);
    if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });

    const signature: ApprovalSignature = {
      actor: String(resolveUserId(req) ?? 'unknown'),
      role: typeof req.body?.role === 'string' ? req.body.role : 'regulatory',
      signatureRef: `csig:${randomUUID()}`,
      signedAt: new Date().toISOString(),
      meaning,
    };
    await recordSignature(getDb(), String(req.params.id), organizationId, meaning, signature);
    return res.json({ ok: true, signature });
  }));

  /** Advance the document one gated stage. */
  router.post('/:id/advance', wrap(async (req: Request, res: Response) => {
    const organizationId = resolveOrgId(req);
    if (organizationId === null) return res.status(403).json({ ok: false, error: 'organization_context_required' });

    const to = req.body?.to;
    if (!isStage(to)) return res.status(400).json({ ok: false, error: 'invalid_target_stage' });

    const db = getDb();
    const input = await loadProjectionInput(db, String(req.params.id), organizationId);
    if (!input) return res.status(404).json({ ok: false, error: 'not_found' });

    const projected = projectCanonicalDocument(input);
    try {
      assertCanonicalIdentity(projected.document);
    } catch (err) {
      return res.status(422).json({ ok: false, error: 'unidentified_document', detail: (err as Error).message });
    }
    if (projected.violations.length) {
      return res.status(422).json({ ok: false, error: 'invariant_violation', violations: projected.violations });
    }

    const actor = String(resolveUserId(req) ?? 'unknown');
    const ctx = {
      actor,
      at: new Date().toISOString(),
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      signatureRef: typeof req.body?.signatureRef === 'string' ? req.body.signatureRef : undefined,
      contentHash: typeof req.body?.contentHash === 'string' ? req.body.contentHash : input.contentHash,
      placement: req.body?.placement,
    };
    const bindings = bindingsFactory({ organizationId, actor });

    const result = await advanceDocument(projected.state, to, ctx, bindings, projected.document);
    if (!result.ok) {
      return res.status(409).json({ ok: false, from: result.from, to: result.to, blockedBy: result.blockedBy });
    }

    // On packaging, seal the canonical export representation from the digest the
    // assemble binding actually produced.
    //
    // This used to hash the STRING `"${document.id}:${contentHash}"` and store
    // the result as the package md5/sha256 — a seal over bytes no file ever
    // had, persisted and attested in the audit trail. A seal is only written
    // when a real assembly returned one; with no assembler wired the transition
    // is refused upstream, so there is nothing to seal.
    let exportFacet: ProjectionInput['exportFacet'];
    if (to === 'packaged' && result.packageSha256) {
      exportFacet = {
        format: 'pdf_a',
        leafId: result.state.placement?.leafId,
        sha256: result.packageSha256,
        // Absent when the assembler did not report one: the canonical validator
        // then raises EXPORTED_WITHOUT_HASHES, which is the truthful outcome —
        // better than satisfying the check with a digest of something else.
        ...(result.packageMd5 ? { md5: result.packageMd5 } : {}),
      };
    }

    await persistState(db, String(req.params.id), organizationId, result.state, result.auditEvent!, exportFacet);
    return res.json({
      ok: true,
      from: result.from,
      to: result.to,
      stage: result.state.stage,
      auditEvent: result.auditEvent,
    });
  }));

  /** Read the projection + verify the audit chain. */
  router.get('/:id', wrap(async (req: Request, res: Response) => {
    const organizationId = resolveOrgId(req);
    if (organizationId === null) return res.status(403).json({ ok: false, error: 'organization_context_required' });

    const db = getDb();
    const input = await loadProjectionInput(db, String(req.params.id), organizationId);
    if (!input) return res.status(404).json({ ok: false, error: 'not_found' });

    const chain = verifyAuditChain(input.audit);
    const outline = await readOutline(db, String(req.params.id), organizationId);
    return res.json({
      ok: true,
      canonicalId: input.canonicalId,
      stage: input.stage,
      version: input.version,
      hasContent: input.hasContent,
      placement: input.placement,
      outline,
      sectionCount: outline.length,
      audit: input.audit,
      chainValid: chain.valid,
    });
  }));

  return router;
}

export default createDocumentLifecycleRouter;
