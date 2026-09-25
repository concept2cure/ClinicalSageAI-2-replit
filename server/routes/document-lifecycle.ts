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
import { resolveOrgId, resolveUserId, resolveUserRole } from '../types/auth-request';
import { requireRole } from '../middleware/auth';
import {
  reverifySigner,
  type SignerCredentials,
  type SignerReverification,
} from '../services/part11/reverify-signer.js';
import { signerReverificationDeps } from '../services/part11/reverify-signer-deps.js';
import { isSigningAuthorized } from '../services/part11/signing-authority';
import {
  advanceDocument,
  assertCanonicalIdentity,
  projectCanonicalDocument,
  type ProjectionInput,
} from '../services/regulatory/documentLifecycleOrchestrator';
import {
  createCanonicalDocument,
  hashLifecyclePayload,
  LifecycleRecordRefusal,
  loadProjectionInput,
  persistState,
  readOutline,
  recordReviewSignature,
  reviewSignatureRefusal,
  type CanonicalStoreDb,
} from '../services/regulatory/canonicalDocumentStore';
import {
  buildLifecycleBindings,
  type LifecycleBindingDeps,
} from '../services/regulatory/lifecycleBindings';
import type { LifecycleBindings } from '../services/regulatory/documentLifecycleOrchestrator';
import {
  canAdvanceDocument,
  verifyAuditChain,
  type ApprovalSignature,
  type DocumentStage,
} from '../../shared/regulatory/document-lifecycle';
import { randomUUID } from 'crypto';
import {
  makeUpsertLeafBinding,
  LeafBindingRefusal,
} from '../services/regulatory/lifecycle-leaf-binding';
import {
  upsertLeaf,
  SubmissionError,
  SUBMISSION_ERROR_STATUS,
} from '../services/submission-service/submission-service';

export interface DocumentLifecycleRouterOptions {
  /** Drizzle handle. Defaults to the runtime db. */
  db?: CanonicalStoreDb;
  /** Override the bindings (tests inject captures / delegates). */
  bindingsFactory?: (deps: LifecycleBindingDeps) => LifecycleBindings;
  /**
   * The signing ceremony. Defaults to the platform's one (reverifySigner with
   * the production deps: account standing, lockout, password, enrolled second
   * factor). Tests inject a stand-in; nothing else should.
   */
  reverify?: (userId: number, credentials: SignerCredentials) => Promise<SignerReverification>;
}

/** The functional role the canonical leaf write requires (routes/submissions.ts). */
const AUTHOR = 'regulatory-author';

const isStage = (v: unknown): v is DocumentStage =>
  typeof v === 'string' &&
  ['authoring', 'in_review', 'approved', 'placed', 'packaged', 'submitted', 'superseded', 'withdrawn'].includes(v);

export function createDocumentLifecycleRouter(opts: DocumentLifecycleRouterOptions = {}): Router {
  const router = express.Router();
  const bindingsFactory = opts.bindingsFactory ?? buildLifecycleBindings;
  const reverify =
    opts.reverify ?? ((userId: number, creds: SignerCredentials) => reverifySigner(userId, creds, signerReverificationDeps()));

  /**
   * Every signature this router records goes through the platform's one
   * ceremony. Before 2026-09-24 neither did:
   *
   *  - POST /:id/sign recorded a "reviewed" or "approved" Part 11 signature from
   *    the session alone — no password, no second factor (§11.200) — with the
   *    signer's ROLE taken from the request body and the actor falling back to
   *    the string 'unknown' when no user id resolved;
   *  - POST /:id/advance {to:'approved'} minted an approval through the
   *    applySignature binding, citing whatever `signatureRef` the request body
   *    supplied.
   *
   * The identity is the authenticated user or nothing (401); the role is the
   * server's reading (resolveUserRole), never the body's; the role must carry
   * signing authority (§11.10(g), the same policy every signing route uses);
   * then the signer re-verifies. Writes the response and returns null on any
   * refusal.
   */
  async function reverifiedSigner(
    req: Request,
    res: Response,
  ): Promise<{ userId: number; role: string; authenticationMethod: string } | null> {
    const userId = resolveUserId(req);
    if (userId === null) {
      res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
      return null;
    }
    const role = resolveUserRole(req);
    if (!isSigningAuthorized(role)) {
      res.status(403).json({
        ok: false,
        error: 'ESIGNATURE_NO_AUTHORITY',
        message: 'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)).',
      });
      return null;
    }
    const verdict = await reverify(userId, { password: req.body?.password, mfaToken: req.body?.mfaToken });
    if (!verdict.ok) {
      res.status(verdict.status).json({ ok: false, error: verdict.code, message: verdict.error });
      return null;
    }
    return { userId, role, authenticationMethod: verdict.authenticationMethod };
  }

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
  // Every write is gated like the canonical leaf write it can lead to
  // (PUT /sequences/:seqId/leaves, requireRole(AUTHOR)): a viewer holds no
  // regulatory-author grant (ORG_ROLE_FUNCTIONAL_GRANTS). Before 2026-09-24 no
  // route here was gated, so a viewer could create, sign and place.
  router.post('/', requireRole(AUTHOR), wrap(async (req: Request, res: Response) => {
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

  /**
   * What a handler that runs inside a transaction decided. The response is
   * written only after the transaction has COMMITTED, so a client is never told
   * a sign-off or a transition was recorded when the commit then failed.
   * `responded` means the ceremony refused and already wrote its own response
   * (before any write — the transaction commits nothing).
   */
  type Outcome = { responded: true } | { status: number; body: unknown };
  const send = (res: Response, outcome: Outcome): Response | void =>
    'responded' in outcome ? undefined : res.status(outcome.status).json(outcome.body);
  const refusalBody = (err: LifecycleRecordRefusal) => ({ ok: false, error: err.code, message: err.message });

  /**
   * Record the review sign-off (Part 11) for the current review round.
   *
   * Since VR-03 (2026-09-25): write-once per round, sealed into the document's
   * trail as its own event and written to the org-wide audit, all under the
   * document's row lock. Before, this overwrote either signature at any stage,
   * appended no event and wrote no audit row — the signature it replaced left no
   * trace. An approval is not recorded here: approving is the in_review →
   * approved transition, which signs (POST /:id/advance). This route recording
   * the same column was how an approval came to be replaced.
   */
  router.post('/:id/sign', requireRole(AUTHOR), wrap(async (req: Request, res: Response) => {
    const organizationId = resolveOrgId(req);
    if (organizationId === null) return res.status(403).json({ ok: false, error: 'organization_context_required' });

    const meaning = req.body?.meaning;
    if (meaning !== 'reviewed' && meaning !== 'approved') {
      return res.status(400).json({ ok: false, error: 'meaning_must_be_reviewed_or_approved' });
    }
    const id = String(req.params.id);

    let outcome: Outcome;
    try {
      outcome = await getDb().transaction(async (tx): Promise<Outcome> => {
        const existing = await loadProjectionInput(tx, id, organizationId, { forUpdate: true });
        if (!existing) return { status: 404, body: { ok: false, error: 'not_found' } };
        if (meaning === 'approved') {
          return {
            status: 409,
            body: {
              ok: false,
              error: 'APPROVAL_IS_RECORDED_BY_ADVANCING',
              message: 'An approval is recorded by advancing the document to approved, which signs.',
            },
          };
        }
        // Asked before the ceremony: a sign-off that will be refused must not
        // cost the signer a credential check (F-27, as on /:id/advance).
        const refusal = reviewSignatureRefusal(existing);
        if (refusal) return { status: 409, body: refusalBody(refusal) };

        const signer = await reverifiedSigner(req, res);
        if (!signer) return { responded: true };

        const signature: ApprovalSignature = {
          actor: String(signer.userId),
          role: signer.role,
          signatureRef: `csig:${randomUUID()}`,
          signedAt: new Date().toISOString(),
          meaning: 'reviewed',
        };
        const event = await recordReviewSignature(tx, id, organizationId, signature);
        if (!event) return { status: 404, body: { ok: false, error: 'not_found' } };
        // The org-wide trail, inside the same transaction's lifetime: if it
        // cannot be written, the sign-off rolls back with it.
        await bindingsFactory({ organizationId, actor: signature.actor, signerRole: signer.role }).audit(event);
        return { status: 200, body: { ok: true, signature } };
      });
    } catch (err) {
      if (err instanceof LifecycleRecordRefusal) return res.status(409).json(refusalBody(err));
      throw err;
    }
    return send(res, outcome);
  }));

  /**
   * Advance the document one gated stage.
   *
   * The whole transition — read, gate, ceremony, bound effects, write — runs
   * under the document's row lock (VR-03). A second transition on the same
   * document waits, then reads the stage the first one wrote, so the gate
   * refuses it before any effect runs. Before, both read the same stage, both
   * passed, both wrote org-wide audit rows, and the per-document trail kept
   * whichever append landed last.
   */
  router.post('/:id/advance', requireRole(AUTHOR), wrap(async (req: Request, res: Response) => {
    const organizationId = resolveOrgId(req);
    if (organizationId === null) return res.status(403).json({ ok: false, error: 'organization_context_required' });

    const to = req.body?.to;
    if (!isStage(to)) return res.status(400).json({ ok: false, error: 'invalid_target_stage' });
    const id = String(req.params.id);

    let outcome: Outcome;
    try {
      outcome = await getDb().transaction(async (tx): Promise<Outcome> => {
        const input = await loadProjectionInput(tx, id, organizationId, { forUpdate: true });
        if (!input) return { status: 404, body: { ok: false, error: 'not_found' } };

        const projected = projectCanonicalDocument(input);
        try {
          assertCanonicalIdentity(projected.document);
        } catch (err) {
          return { status: 422, body: { ok: false, error: 'unidentified_document', detail: (err as Error).message } };
        }
        if (projected.violations.length) {
          return { status: 422, body: { ok: false, error: 'invariant_violation', violations: projected.violations } };
        }

        const actorUserId = resolveUserId(req);
        if (actorUserId === null) return { status: 401, body: { ok: false, error: 'AUTH_REQUIRED' } };
        const actor = String(actorUserId);

        // Approving signs. It goes through the same ceremony as /:id/sign, and the
        // approval's signatureRef is minted server-side by the binding — a
        // `signatureRef` in the request body is no longer read by any transition,
        // so no caller can cite a signature into the audit trail.
        //
        // The GATE is asked first. A transition the gate refuses must not cost the
        // signer a credential check: a wrong password counts against the account's
        // lockout (F-27), so asking for one on a request that is refused anyway
        // would let an illegal jump burn a signer's attempts. advanceDocument asks
        // the gate again; this is the same pure check, not a second policy.
        //
        // Only in_review → approved signs. placed → approved un-places a document
        // whose approval is already recorded (VR-03): it asks for no credentials
        // and mints nothing.
        let signerRole: string | undefined;
        if (to === 'approved' && projected.state.stage === 'in_review') {
          const gate = canAdvanceDocument(projected.state, to);
          if (!gate.allowed) {
            return { status: 409, body: { ok: false, from: projected.state.stage, to, blockedBy: gate.blockedBy } };
          }
          const signer = await reverifiedSigner(req, res);
          if (!signer) return { responded: true };
          signerRole = signer.role;
        }

        const ctx = {
          actor,
          at: new Date().toISOString(),
          reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
          contentHash: typeof req.body?.contentHash === 'string' ? req.body.contentHash : input.contentHash,
          placement: req.body?.placement,
        };
        /* The real leaf writer. Without it the orchestrator refuses `placed`
           outright (PLACEMENT_BINDING_NOT_WIRED) — correctly, because the default it
           replaced minted a `leaf:${uuid}` for a submission_leaves row that was
           never written, and attested it in the audit trail. Injecting the genuine
           writer is what makes the refusal unnecessary rather than permanent.

           `upsertLeaf` is the canonical governed write: it re-checks that the
           document belongs to this organisation, pins the source digest, and
           refuses a frozen or dispatched sequence. */
        const bindings = bindingsFactory({
          organizationId,
          actor,
          ...(signerRole ? { signerRole } : {}),
          upsertLeaf: makeUpsertLeafBinding({
            upsertLeaf: (leafInput, leafCtx) => upsertLeaf(leafInput as never, leafCtx),
            organizationId,
            userId: actorUserId,
          }),
        });

        let result: Awaited<ReturnType<typeof advanceDocument>>;
        try {
          result = await advanceDocument(projected.state, to, ctx, bindings, projected.document);
        } catch (err) {
          /* A binding that cannot write a leaf refuses with a REASON, and that is a
             409 in the orchestrator's own shape — not a 500. The distinction is the
             point: 500 says the server broke, 409 says the request named something
             that cannot be filed and here is which part. */
          if (err instanceof LeafBindingRefusal) {
            return {
              status: 409,
              body: { ok: false, from: projected.state.stage, to, blockedBy: [`${err.code}: ${err.message}`] },
            };
          }
          /* The leaf writer refuses too — a frozen or dispatched sequence, one that
             is not this organisation's — and its refusal keeps the status the
             canonical route gives it (routes/submissions.ts), in the same shape. */
          if (err instanceof SubmissionError) {
            return {
              status: SUBMISSION_ERROR_STATUS[err.code],
              body: { ok: false, from: projected.state.stage, to, blockedBy: [`${err.code}: ${err.message}`] },
            };
          }
          throw err;
        }
        if (!result.ok) {
          return { status: 409, body: { ok: false, from: result.from, to: result.to, blockedBy: result.blockedBy } };
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

        const sealed = await persistState(tx, id, organizationId, result.state, result.auditEvent!, exportFacet);
        return {
          status: 200,
          body: { ok: true, from: result.from, to: result.to, stage: result.state.stage, auditEvent: sealed },
        };
      });
    } catch (err) {
      if (err instanceof LifecycleRecordRefusal) return res.status(409).json(refusalBody(err));
      throw err;
    }
    return send(res, outcome);
  }));

  /**
   * Read the projection and verify the audit chain. The verifier RECOMPUTES every
   * event's hash (VR-03): linkage alone read an event edited in place, hashes
   * left intact, as a valid chain.
   */
  router.get('/:id', wrap(async (req: Request, res: Response) => {
    const organizationId = resolveOrgId(req);
    if (organizationId === null) return res.status(403).json({ ok: false, error: 'organization_context_required' });

    const db = getDb();
    const input = await loadProjectionInput(db, String(req.params.id), organizationId);
    if (!input) return res.status(404).json({ ok: false, error: 'not_found' });

    const chain = verifyAuditChain(input.audit, hashLifecyclePayload);
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
      chainBrokenAt: chain.brokenAt,
      chainHashesRecomputed: chain.hashesRecomputed,
    });
  }));
  return router;
}

export default createDocumentLifecycleRouter;
