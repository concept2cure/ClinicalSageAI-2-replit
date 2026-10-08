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
import { checkSigningAuthority } from '../services/part11/signing-authority-gate';
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
  startVaultLifecycleRecord,
  supersedeOnVaultApproval,
  SupersessionRefused,
  vaultApprovalRefusal,
} from '../services/regulatory/vault-lifecycle-record';
import {
  buildLifecycleBindings,
  type LifecycleBindingDeps,
} from '../services/regulatory/lifecycleBindings';
import {
  deriveLifecycleBinding,
  LIFECYCLE_DECLARED_MEANING,
  LIFECYCLE_SIGNATURE_TYPE,
  lifecycleTarget,
  LifecycleSignatureRefusal,
  vaultSourceId,
  type LifecycleBinding,
  type LifecycleSigner,
} from '../services/regulatory/lifecycle-signature';
import {
  drizzleSignatureClient,
  persistGovernedActionSignature,
  type SignatureDbClient,
} from '../services/part11/signature-persistence';
import { recordGovernedAction } from './c2c/actions';
import { requireGovernedReason } from './governed-reason';
import {
  assertSignerIsNotAuthor,
  SeparationOfDutiesAuthorUnresolvedError,
  SeparationOfDutiesError,
  SeparationOfDutiesUnverifiedError,
} from '../services/governance/separation-of-duties';
import type { LifecycleBindings } from '../services/regulatory/documentLifecycleOrchestrator';
import {
  canAdvanceDocument,
  verifyAuditChain,
  type ApprovalSignature,
  type DocumentStage,
} from '../../shared/regulatory/document-lifecycle';
import {
  makeUpsertLeafBinding,
  LeafBindingRefusal,
} from '../services/regulatory/lifecycle-leaf-binding';
import {
  upsertLeaf,
  SubmissionError,
  SUBMISSION_ERROR_STATUS,
} from '../services/submission-service/submission-service';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('document-lifecycle');

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

/**
 * A sign-off carries the signer's own reason (VR-13): the 400 to answer when it
 * does not, else null. Asked before the ceremony; a reason is never written for
 * the signer.
 */
function reasonRefusal(value: unknown): { ok: false; error: 'REASON_REQUIRED'; message: string } | null {
  const reason = requireGovernedReason(value);
  return reason.ok ? null : { ok: false, error: 'REASON_REQUIRED', message: `${reason.error} Nothing was signed.` };
}

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
   * The identity is the authenticated user or nothing (401); authority
   * (§11.10(g)) is the platform's one policy, checkSigningAuthority, which
   * reads the role from the membership row — until 2026-10-08 (P-27) this
   * judged the request's role (resolveUserRole), which the membership
   * resolver's own header calls unreliable on signing routes; then the signer
   * re-verifies. The role recorded on the signature is still the request's
   * reading, never the body's. Writes the response and returns null on any
   * refusal.
   */
  async function reverifiedSigner(
    req: Request,
    res: Response,
  ): Promise<{ userId: number; role: string; authenticationMethod: string; secondFactorVerified: boolean } | null> {
    const userId = resolveUserId(req);
    if (userId === null) {
      res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
      return null;
    }
    const orgId = resolveOrgId(req);
    if (orgId === null) {
      res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
      return null;
    }
    const authority = await checkSigningAuthority(userId, orgId);
    if (authority) {
      res.status(authority.status).json({ ok: false, error: authority.code, message: authority.message });
      return null;
    }
    const role = resolveUserRole(req);
    const verdict = await reverify(userId, { password: req.body?.password, mfaToken: req.body?.mfaToken });
    if (!verdict.ok) {
      res.status(verdict.status).json({ ok: false, error: verdict.code, message: verdict.error });
      return null;
    }
    return {
      userId,
      role,
      authenticationMethod: verdict.authenticationMethod,
      secondFactorVerified: verdict.secondFactorVerified,
    };
  }

  // The runtime db is resolved lazily so importing this module never forces a
  // pool. Tests always pass opts.db. This is an ES module ("type": "module"):
  // `require` is not defined here, so the runtime db is a dynamic import. The
  // bare require threw on every write after the role gate and answered 500, so
  // Send for review (POST /api/regulatory/documents) could never start a record.
  const getDb = async (): Promise<CanonicalStoreDb> => {
    if (opts.db) return opts.db;
    const { db } = await import('../db');
    // The runtime handle carries the shared schema's generic, which
    // CanonicalStoreDb does not; the store reads the same node-postgres surface
    // either way. This is the assertion the removed `require` cast made too.
    return db as unknown as CanonicalStoreDb;
  };

  // Async handlers must not throw into Express unguarded (Express 4 does not
  // catch async rejections — the request would hang). Every handler is wrapped
  // so a failure returns a clean 500. The reason goes to the log against the
  // request id, never into the body: a Drizzle failure's message is the SQL
  // text with its table and column names (P1-17, IAM-18 (1)).
  const wrap =
    (fn: (req: Request, res: Response) => Promise<Response | void>) =>
    async (req: Request, res: Response): Promise<Response | void> => {
      try {
        return await fn(req, res);
      } catch (err) {
        return serverError(res, log, 'handling the document lifecycle request', err);
      }
    };

  /**
   * Before any credential is asked for (F-27), a sign-off must be one that can
   * be recorded: an authenticated signer who is not an author of the record
   * (the platform's one separation-of-duties check; for a Vault-made document
   * the uploader is an author too), over content the server can read. Returns
   * the binding, or the refusal to answer with. Runs on the signing
   * transaction, under the document's row lock.
   */
  async function signingPrecheck(
    req: Request,
    client: SignatureDbClient,
    doc: ProjectionInput,
    meaning: 'REVIEWED' | 'APPROVED',
  ): Promise<{ binding: LifecycleBinding } | { status: number; body: unknown }> {
    const userId = resolveUserId(req);
    if (userId === null) return { status: 401, body: { ok: false, error: 'AUTH_REQUIRED' } };
    try {
      await assertSignerIsNotAuthor(lifecycleTarget(doc.canonicalId), doc.organizationId, userId, {
        command: 'sign',
        meaning,
        client,
      });
    } catch (err) {
      if (err instanceof SeparationOfDutiesError) {
        return { status: 403, body: { ok: false, error: 'SELF_APPROVAL', message: err.message } };
      }
      if (err instanceof SeparationOfDutiesAuthorUnresolvedError) {
        return { status: 409, body: { ok: false, error: err.code, message: err.message } };
      }
      if (err instanceof SeparationOfDutiesUnverifiedError) {
        return { status: 503, body: { ok: false, error: err.code, message: err.message } };
      }
      throw err;
    }
    try {
      return { binding: await deriveLifecycleBinding(client, doc) };
    } catch (err) {
      if (err instanceof LifecycleSignatureRefusal) {
        return { status: err.status, body: { ok: false, error: err.code, message: err.message } };
      }
      throw err;
    }
  }

  /**
   * Record one lifecycle sign-off as a Part 11 record (VR-12): the governed
   * ledger pair (the chained audit_logs row and its c2c_ana_actions row), then
   * ONE electronic_signatures row with the printed name, declared meaning and
   * time, bound to `binding`, all on `client`, the transaction that records the
   * lifecycle change. Returns the canonical row's copy, which names the record
   * (`esig:<id>`). A failure throws and rolls everything back.
   *
   * Called only after reverifiedSigner has passed, and it lives here, beside
   * that ceremony, for that reason. Before, a sign-off was a `csig:<uuid>`
   * object with no signature record behind it.
   */
  async function recordLifecycleSignature(
    client: SignatureDbClient,
    params: {
      doc: ProjectionInput;
      meaning: 'reviewed' | 'approved';
      signer: LifecycleSigner;
      binding: LifecycleBinding;
      /** The signer's own reason, required and validated by the route (never written for them). */
      reason: string;
      occurredAt: Date;
    },
  ): Promise<ApprovalSignature> {
    const { doc, signer, binding, occurredAt } = params;
    const target = lifecycleTarget(doc.canonicalId);
    const meaning = LIFECYCLE_DECLARED_MEANING[params.meaning];
    const reason = params.reason;

    const gov = await recordGovernedAction(client, {
      orgId: doc.organizationId,
      userId: signer.userId,
      command: 'sign',
      target,
      reason,
      payload: { meaning, contentDigest: binding.digest, bindingBasis: binding.basis, version: doc.version, stage: doc.stage },
      domain: 'regulatory',
      surface: 'document-lifecycle',
    });
    const signed = await persistGovernedActionSignature(client, {
      orgId: doc.organizationId,
      userId: signer.userId,
      target,
      reason,
      payload: { meaning },
      actionId: gov.actionId,
      auditId: gov.auditId,
      sha256Chain: gov.sha256Chain,
      authenticationMethod: signer.authenticationMethod,
      secondFactorVerified: signer.secondFactorVerified,
      ipAddress: signer.ipAddress ?? null,
      occurredAt,
      signatureType: LIFECYCLE_SIGNATURE_TYPE,
      manifestKind: LIFECYCLE_SIGNATURE_TYPE,
      command: 'sign',
      binding: { digest: binding.digest, basis: binding.basis, note: binding.note },
      extraManifest: { canonicalId: doc.canonicalId, title: doc.title, version: doc.version, stage: doc.stage },
      complianceStatement:
        'Regulated-document lifecycle sign-off applied as an electronic signature under 21 CFR Part 11 §11.50/§11.70/§11.200; ' +
        'ledger-chained to the audit_logs sha256 chain, in the same transaction as the lifecycle record.',
    });
    return {
      actor: String(signer.userId),
      role: signer.role,
      signatureRef: `esig:${signed.id}`,
      signedAt: occurredAt.toISOString(),
      meaning: params.meaning,
      boundContentHash: binding.contentHash,
      bindingBasis: binding.basis,
    };
  }

  /**
   * Prepare in_review → approved, which signs. It goes through the same
   * ceremony as /:id/sign, and the approval's signatureRef is the record the
   * binding writes: a `signatureRef` in the request body is never read, so no
   * caller can cite a signature into the audit trail.
   *
   * The GATE is asked first, then the signing precheck (author, content). A
   * transition that will be refused must not cost the signer a credential
   * check: a wrong password counts against the account's lockout (F-27).
   * advanceDocument asks the gate again; this is the same pure check, not a
   * second policy.
   *
   * Returns the applySignature binding (a Part 11 record on this transaction,
   * VR-12), or the outcome to answer with.
   */
  async function prepareApproval(
    req: Request,
    res: Response,
    client: SignatureDbClient,
    input: ProjectionInput,
    state: ReturnType<typeof projectCanonicalDocument>['state'],
  ): Promise<{ applySignature: NonNullable<LifecycleBindingDeps['applySignature']> } | Outcome> {
    const gate = canAdvanceDocument(state, 'approved');
    if (!gate.allowed) {
      return { status: 409, body: { ok: false, from: state.stage, to: 'approved', blockedBy: gate.blockedBy } };
    }
    const refusal = await vaultApprovalRefusal(client, input, resolveUserId(req));
    if (refusal) return refusal;
    const pre = await signingPrecheck(req, client, input, 'APPROVED');
    if (!('binding' in pre)) return pre;
    const signer = await reverifiedSigner(req, res);
    if (!signer) return { responded: true };
    return {
      applySignature: async (_doc, meaning, signCtx) => {
        if (meaning !== 'approved') throw new Error(`A lifecycle approval signs as approved, not ${meaning}.`);
        return recordLifecycleSignature(client, {
          doc: input,
          meaning,
          signer: { ...signer, ipAddress: req.ip ?? null },
          binding: pre.binding,
          // Validated by the advance route before anything ran; never written for the signer.
          reason: signCtx.reason ?? '',
          occurredAt: new Date(signCtx.at),
        });
      },
    };
  }

  /** Create a canonical document (starts at `authoring`). */
  // Every write is gated like the canonical leaf write it can lead to
  // (PUT /sequences/:seqId/leaves, requireRole(AUTHOR)): a viewer holds no
  // regulatory-author grant (ORG_ROLE_FUNCTIONAL_GRANTS). Before 2026-09-24 no
  // route here was gated, so a viewer could create, sign and place.
  router.post('/', requireRole(AUTHOR), wrap(async (req: Request, res: Response) => {
    const organizationId = resolveOrgId(req);
    if (organizationId === null) return res.status(403).json({ ok: false, error: 'organization_context_required' });

    const createdBy = resolveUserId(req);
    if (createdBy === null) return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });

    // A body `contentHash` is not read (VR-12): the hash a signature binds is
    // the server's reading. A document made from a Vault version is that
    // version's record (VR-13): see startVaultLifecycle.
    const { title, documentType, projectId, hasContent, sources } = req.body ?? {};
    const vaultId = vaultSourceId(sources);
    if (vaultId !== null) {
      const started = await startVaultLifecycleRecord(await getDb(), { organizationId, createdBy, vaultId });
      return res.status(started.status).json(started.body);
    }
    if (typeof title !== 'string' || !title.trim() || typeof documentType !== 'string' || !documentType.trim()) {
      return res.status(400).json({ ok: false, error: 'title_and_document_type_required' });
    }

    const canonicalId = await createCanonicalDocument(await getDb(), {
      organizationId,
      createdBy,
      title: title.trim(),
      documentType: documentType.trim(),
      projectId: typeof projectId === 'string' ? projectId : undefined,
      hasContent: Boolean(hasContent),
      contentHash: '',
      sources,
    });
    // Report how many blueprint sections were instantiated as the outline.
    const outline = await readOutline(await getDb(), canonicalId, organizationId);
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
    // A sign-off carries the signer's own reason; none is written for them.
    const noReason = reasonRefusal(req.body?.reason);
    if (noReason) return res.status(400).json(noReason);
    const reason = String(req.body.reason).trim();
    const id = String(req.params.id);

    let outcome: Outcome;
    try {
      outcome = await (await getDb()).transaction(async (tx): Promise<Outcome> => {
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
        const client = drizzleSignatureClient(tx);
        const pre = await signingPrecheck(req, client, existing, 'REVIEWED');
        if (!('binding' in pre)) return pre;

        const signer = await reverifiedSigner(req, res);
        if (!signer) return { responded: true };

        // The Part 11 record (VR-12): the chained ledger row and one
        // electronic_signatures row on this transaction, then the canonical
        // copy, which names it. That ledger row is the sign-off's org-wide
        // audit record. Any failure rolls all of it back.
        const signature = await recordLifecycleSignature(client, {
          doc: existing,
          meaning: 'reviewed',
          signer: { ...signer, ipAddress: req.ip ?? null },
          binding: pre.binding,
          reason,
          occurredAt: new Date(),
        });
        const event = await recordReviewSignature(tx, id, organizationId, signature);
        // Unreachable under the row lock; thrown, not answered, so the
        // signature written above rolls back.
        if (!event) throw new Error(`Canonical document ${id} disappeared while its sign-off was recorded`);
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
    // Approving signs, so it carries the signer's own reason (as /:id/sign does).
    const noReason = to === 'approved' ? reasonRefusal(req.body?.reason) : null;
    if (noReason) return res.status(400).json(noReason);
    const id = String(req.params.id);

    let outcome: Outcome;
    try {
      outcome = await (await getDb()).transaction(async (tx): Promise<Outcome> => {
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

        // Approving signs; see prepareApproval. placed → approved un-places a
        // document whose approval is already recorded (VR-03): it asks for no
        // credentials and mints nothing.
        const client = drizzleSignatureClient(tx);
        let applySignature: LifecycleBindingDeps['applySignature'];
        if (to === 'approved' && projected.state.stage === 'in_review') {
          const prepared = await prepareApproval(req, res, client, input, projected.state);
          if (!('applySignature' in prepared)) return prepared;
          applySignature = prepared.applySignature;
        }

        // The content hash is the stored one. A body `contentHash` is not read
        // (VR-12): before, the trail recorded whatever the request said.
        const ctx = {
          actor,
          at: new Date().toISOString(),
          reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
          contentHash: input.contentHash,
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
          client,
          ...(applySignature ? { applySignature } : {}),
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
        // Approving a Vault version supersedes the version it replaces, on this
        // transaction (VR-13). A failure rolls the approval back with it.
        const superseded =
          to === 'approved' && projected.state.stage === 'in_review'
            ? await supersedeOnVaultApproval(tx, client, input, bindings, ctx)
            : [];
        return {
          status: 200,
          body: { ok: true, from: result.from, to: result.to, stage: result.state.stage, auditEvent: sealed, superseded },
        };
      });
    } catch (err) {
      if (err instanceof LifecycleRecordRefusal) return res.status(409).json(refusalBody(err));
      if (err instanceof SupersessionRefused) {
        return res.status(409).json({ ok: false, error: err.code, message: `${err.message} Nothing was approved.` });
      }
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

    const db = await getDb();
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
