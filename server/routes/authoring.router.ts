import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parseDraftEnvelope } from './authoring-draft-envelope.js';
import fs from 'fs';
import path from 'path';
// spawn — reserved for future PDF generation pipeline
import crypto from 'crypto';
// Lazy load docx to prevent startup failures
import { verifyJwtWithRotation } from '../utils/jwtVerify';
import { nonAccessTokenReason } from '../middleware/tokenType';
import { enforceOrgMembership } from '../middleware/orgMembership';
import { getPool } from '../db';
import { currentTenantOrgUuid, TenantKeyRequiredError } from '../db/currentTenant';
import auditService, { writeChainedAuditRow } from '../services/auditService';
import { isSigningAuthorized } from '../services/part11/signing-authority.js';
import { resolveSignerOrgRole } from '../services/part11/resolve-signer-role.js';
import { reverifySigner, type SignerReverified } from '../services/part11/reverify-signer.js';
import { signerReverificationDeps } from '../services/part11/reverify-signer-deps.js';
import { authedOrgId } from '../utils/authedOrgId';
import { createScopedLogger } from '../utils/logger';
// c2c_documents is the system of record for a filing; this router is the
// editing layer over it. This resolves which governed document an authored
// document belongs to. See server/services/c2c/governed-document-binding.ts.
import { DocumentAliasConflictError } from '../services/c2c/document-alias-map.js';
import {
  commitSectionToFiling,
  type CommitSectionResult,
} from '../services/c2c/commit-section-to-filing.js';
// Span lineage: every span of an authored document must trace to where it came
// from. The gate is factored into one helper so every authored-content write
// (interactive save AND section create) applies the identical rule.
// See server/services/clinical-regulatory-evidence/lineage-gate.ts.
import { enforceAuthorLineage } from '../services/clinical-regulatory-evidence/lineage-gate';
import {
  authoringPrincipalFromRequest,
  decideAuthoringPermission,
  resolveAuthoringSectionScope,
} from '../services/authoring/authoring-permissions';
import { sectionStructureIssues } from '../../shared/regulatory/section-code';
import { serverError } from '../lib/api-response';
import {
  verifyLedger,
  type RevisionOrigin,
  machineContributors,
  acceptedMachineText,
  ANA_MACHINE_AUTHOR_ID,
  MACHINE_AUTHOR_IDS,
} from '../services/authoring/revision-ledger';
import {
  checkSectionWritable,
  checkDocumentWritable,
  LOCKED_DOCUMENT_STATUSES as LOCKED_STATUSES,
} from '../services/authoring/document-lock';
// The document/section creators, the Part 11 evidence writers and the export
// renderer were the bodies of POST /docs, POST /sections and POST
// /docs/:docId/export in this file (WM, 2026-09-21, docs/design/
// ANA_DOCUMENT_CANVAS.md). They moved into services so the from-draft route,
// the vault filing and the AnA `draft_authoring_document` tool write the SAME
// rows through the SAME code. The handlers here are the HTTP mapping they
// always were.
import { createDocument, createSection } from '../services/authoring/authoring-documents';
import { requireGovernedReason, optionalGovernedReason } from './governed-reason';
import {
  createDocumentFromDraft,
  parseDraftInput,
  readDocumentProvenance,
} from '../services/authoring/authoring-from-draft';
import {
  writeAuthoringAuditTrail,
  createRevision as createRevisionOn,
  bindingColumnState as bindingColumnStateOn,
  type AuthoringAuditContext,
  type CreateAuditTrailOptions,
} from '../services/authoring/authoring-evidence';
import {
  renderAuthoringExport,
  logExport,
  computeDocHash as computeDocHashOn,
  sectionsDigest,
  readSignaturesForExport,
  anySignatureCovers,
  EXPORT_FORMATS,
} from '../services/authoring/authoring-export';
import {
  fileAuthoringDocumentToVault,
  isPlausibleFolderId,
  VAULT_FILE_FORMATS,
  type VaultFileFormat,
} from '../services/authoring/authoring-file-to-vault';

const logger = createScopedLogger('authoring-router');

const router = Router();


// REQUIRED JWT verification middleware for 21 CFR Part 11 compliance.
//
// This composes the CANONICAL auth primitives so the authoring surface enforces
// IDENTICAL semantics to server/middleware/auth.ts authenticateToken in EVERY
// environment — not only where the /api boundary happens to run in enforce mode
// (C2C-SEC-001). It replaces a bespoke jose verifier that omitted two canonical
// controls: non-access token-class rejection (AUTH_008) and the live
// organization_users membership re-check (AUTH_009).
//
// Twin-safety (see server/middleware/orgMembership.ts): every import here
// resolves to the same file under vitest, tsx, and the production build —
// verifyJwtWithRotation via ../utils/jwtVerify (whose .js is a shim that
// re-exports the .ts), nonAccessTokenReason via ../middleware/tokenType (no .js
// twin), enforceOrgMembership via ../middleware/orgMembership (no .js twin). An
// extensionless import of '../middleware/auth' would instead bind to the stale
// auth.js twin under vitest and silently drop AUTH_008/AUTH_009.
router.use((req: Request, res: Response, next: any) => {
  // SECURITY (ledger C-18): drop every caller-supplied identity header BEFORE
  // anything downstream reads them. requireAny() reads x-roles, createAuditTrail
  // reads x-user-email; a client value must never survive to a route. This runs
  // first so it applies on every path, including rejection.
  delete (req.headers as any)['x-roles'];
  delete (req.headers as any)['x-user-email'];
  delete (req.headers as any)['x-tenant-id'];

  const auth = req.headers.authorization || (req.headers as any).Authorization;
  if (!auth || !/^Bearer\s+\S+$/i.test(auth)) {
    return res
      .status(401)
      .json({ error: 'Authentication required for 21 CFR Part 11 compliance' });
  }

  let decoded: any;
  try {
    // Canonical rotation-aware HS256 verification (JWT_SECRET_{ENV} ?? JWT_SECRET),
    // identical to authenticateToken — replaces the router-only AUTH_JWT_SECRET
    // path (dead config nothing signs with).
    decoded = verifyJwtWithRotation(auth.replace(/^Bearer\s+/i, ''));
  } catch {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  // AUTH_008 (fail-closed): a non-access token (refresh / MFA challenge / MFA
  // partial) is signed with the same secret and must never authenticate here.
  if (nonAccessTokenReason(decoded)) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  // AUTH_007: a signed token with no usable subject must not authenticate.
  const subject = decoded.userId ?? decoded.id ?? decoded.sub;
  if (subject === undefined || subject === null || subject === '' || subject === 0) {
    return res
      .status(401)
      .json({ error: 'Authentication required for 21 CFR Part 11 compliance' });
  }

  // Expose the verified principal on req.user so actor-identity helpers
  // (getActorId / getActorEmail / getTenantId → authedOrgId) derive attribution
  // from the token only. Populated by this router's own first middleware — via
  // the canonical primitives — so the token-class and membership invariants are
  // enforced by the router itself in all environments.
  req.user = {
    id: subject,
    userId: subject,
    email: decoded.email ? String(decoded.email).toLowerCase() : undefined,
    role: decoded.role,
    roles: Array.isArray(decoded.roles)
      ? decoded.roles
      : decoded.roles
        ? String(decoded.roles).split(',')
        : undefined,
    organizationId: decoded.organizationId ?? decoded.orgId ?? decoded.tenant_id,
  };

  // Re-derive the sanitized identity headers legacy readers consume, from the
  // VERIFIED principal only (absence of a claim ⇒ absence of the header).
  const setOrClear = (header: string, value: string | number | undefined) => {
    if (value === undefined) delete (req.headers as any)[header];
    else (req.headers as any)[header] = value;
  };
  setOrClear('x-user-email', req.user.email);
  const roleList = Array.isArray(req.user.roles) && req.user.roles.length ? req.user.roles : undefined;
  setOrClear('x-roles', roleList ? roleList.map((r) => String(r).toUpperCase()).join(',') : undefined);
  const tenantId = authedOrgId(req);
  setOrClear('x-tenant-id', tenantId == null ? undefined : tenantId);

  // AUTH_009 (terminal): live organization_users re-check — fail-closed 403 on a
  // revoked membership, fail-open only on infra-indeterminate. Same control and
  // ~60s cache as authenticateToken.
  return enforceOrgMembership(req, res, next);
});
/* A disk-backed multer instance and its MIME allowlist stood here, attached
   to no route. The two upload routes this file does serve build their own
   memory-storage instances further down (imageUpload, docxImport); an unused
   /tmp writer with a 25MB limit was a configuration nobody could reach and
   nobody was maintaining. */

// Use centralized database pool
const pool = getPool();

// A minimal "thing that runs a query" — satisfied by both the shared Pool and a
// pooled client obtained via pool.connect(). Lifecycle mutations (section save,
// freeze, e-sign, sign) run all their writes on ONE such client inside a
// BEGIN/COMMIT so a mid-way failure ROLLs BACK rather than leaving partial
// state; the query helpers below accept the executor so those writes route
// through the same transaction. Non-transactional callers omit it and get the
// pool, preserving prior behavior.
type Queryable = { query: (text: string, params?: any[]) => Promise<any> };

/**
 * Document states in which the record is LOCKED and its sections are immutable.
 *
 * Matches the freeze handler's own check (`doc.status === 'FROZEN' ||
 * doc.status === 'APPROVED'`). Compared case-insensitively because the router
 * writes both cases — `POST /docs` inserts `'draft'` and the analytics query
 * counts `'approved'` in lower case, while freeze/approve write `'FROZEN'` /
 * `'APPROVED'` in upper case. A case-sensitive comparison would silently miss a
 * locked record.
 */
/* Re-exported from the canonical lock service rather than redeclared: the set
   is also read by the write gate below and by the client's frozen affordance,
   and three copies of "which statuses seal a record" is three chances for them
   to disagree about a Part 11 guarantee. */
const LOCKED_DOCUMENT_STATUSES = LOCKED_STATUSES;

/**
 * Is the fine-grained per-user section-permission matrix enforced?
 *
 * 21 CFR Part 11 §11.10(d) — "limiting system access to authorized individuals".
 * The matrix used to be strictly opt-in behind `AUTH_ENFORCE_SECTION_PERMS === '1'`,
 * and that flag is set NOWHERE in this repository outside tests. The effective
 * production rule was therefore "any authenticated member of the owning tenant may
 * edit any unlocked section of that tenant" — no per-user grant, and PATCH
 * /sections/:sectionId carries no coarse role gate either. A viewer-tier member, or
 * any member with no grant on the document, could edit a regulated IND/CTD section
 * they were never authorized to author.
 *
 * Enforced by DEFAULT in production and staging; the flag remains as a non-production
 * kill-switch (`'0'` disables, `'1'` forces on) so local development and fixtures that
 * predate the grant store keep working. Production cannot be opted out.
 *
 * Paired with the creator auto-grant on POST /docs — without that grant this control
 * is a lockout rather than a permission model.
 */
function sectionPermsEnforced(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  const flag = process.env.AUTH_ENFORCE_SECTION_PERMS;
  if (flag === '1') return true;
  if (flag === '0') return false;
  return process.env.NODE_ENV === 'staging';
}

/**
 * Section-level write authorization (C2C-AUTHOR-001 / C2C-AUTHOR-002).
 *
 * WHAT WAS WRONG
 * --------------
 * 1. DEFAULT ALLOW-ALL. The whole function opened with
 *      `if (process.env.AUTH_ENFORCE_SECTION_PERMS !== '1') return true;`
 *    and that flag is set NOWHERE in this repository. So the deployed default
 *    returned true before establishing anything at all — not the caller's
 *    tenant, not that the section existed, not the document's state.
 * 2. IMMUTABILITY WAS FLAG-GATED. The APPROVED check lived INSIDE that
 *    short-circuit, so with the flag off (i.e. always) a signed, frozen IND
 *    document's sections stayed editable. Record immutability is not a feature
 *    flag — it is 21 CFR Part 11 §11.10(c)/(e). It is now unconditional.
 *    FROZEN was never checked at all, at any flag setting.
 * 3. NO TENANT SCOPE. Neither query carried a tenant predicate, so with the
 *    flag ON a grant in tenant B could authorise a write in tenant A. Both
 *    queries are now anchored to the VERIFIED tenant.
 * 4. HEADER-DERIVED IDENTITY. Identity came from `x-user-email` and roles from
 *    `x-roles`. This router's own first middleware strips caller-supplied
 *    copies and re-derives them from verified claims, so these were not
 *    directly forgeable HERE — but authorization must not depend on a mutable
 *    header at all (one mis-ordered middleware and the class is back). Both now
 *    read the verified principal, matching requireAny() and ledger C-18.
 * 5. AND/OR PRECEDENCE. `WHERE s.id = $1 AND … OR (p.section_id IS NULL AND …)`
 *    binds AND tighter than OR, so the right-hand branch was NOT anchored to
 *    the requested section: ANY doc-level grant the caller held on ANY document
 *    satisfied a write to ANY other section. Every predicate is now anchored to
 *    the requested section AND the caller's tenant.
 * 6. PHANTOM TABLE. `doc_permissions` had no CREATE statement anywhere in the
 *    repo, so the flag-on path could only ever deny (relation does not exist →
 *    catch → false). A control that cannot be switched on is not a control,
 *    which is precisely why the insecure default was never turned off. The
 *    table is now provisioned by the canonical loop-tables migration and
 *    carried by the authoring provisioning unit.
 *
 * WHAT THE FLAG NOW GATES
 * -----------------------
 * ONLY the optional per-user object matrix — and that matrix is decided by the
 * canonical service (decideAuthoringPermission), never by a second query here.
 * The non-negotiable
 * guarantees — verified principal, tenant isolation, object existence within
 * that tenant, and the Part 11 immutability lock — run on every call regardless
 * of configuration. Flag-off is therefore no longer allow-all: it is
 * "a verified member of the owning tenant may edit an unlocked section of that
 * tenant", which is what keeps collaborative authoring working. It deliberately
 * does NOT prove a per-user grant; that is what the flag buys.
 *
 * FAILS CLOSED. Any throw, any missing tenant claim, any unknown section
 * denies. Never returns true on an error path.
 */
async function canEditSection(
  req: Request,
  sectionId: string | string[] | undefined
): Promise<boolean> {
  try {
    // A repeated ?sectionId or a missing param is not an identifiable object.
    if (typeof sectionId !== 'string' || sectionId.length === 0) return false;

    // Identity and tenant come from the VERIFIED principal only — never a
    // header, body or query value.
    if (!getActorId(req)) return false;
    const tenantId = authedOrgId(req);
    if (tenantId == null) return false;

    // ── UNCONDITIONAL: object existence + tenant + record immutability ───────
    // Resolving the section THROUGH its tenant proves three things at once: the
    // section exists, it belongs to the caller's tenant, and its parent
    // document is tenant-consistent (the join matches on tenant as well as id).
    const parent = (
      await pool.query(
        `SELECT d.status
           FROM authoring_sections s
           JOIN authoring_documents d
             ON d.id = s.doc_id AND d.tenant_id = s.tenant_id
          WHERE s.id = $1 AND s.tenant_id = $2
          LIMIT 1`,
        [sectionId, tenantId]
      )
    ).rows[0] as { status?: string | null } | undefined;

    // Unknown section, or a section belonging to another tenant.
    if (!parent) return false;

    // 21 CFR Part 11 record integrity: a frozen or approved record is closed to
    // edits for EVERY caller, including QA/RA_CMC, at every flag setting.
    if (LOCKED_DOCUMENT_STATUSES.has(String(parent.status ?? '').toUpperCase())) {
      return false;
    }

    // ── Fine-grained per-user matrix: ON by default in prod/staging ──────────
    if (!sectionPermsEnforced()) return true;

    // ONE implementation of the object-level decision.
    //
    // This used to be a second copy: an email-only join over doc_permissions
    // that accepted AUTHOR and REVIEWER, ignored revoked_at and valid_until, and
    // let a bare QA / RA_CMC role edit any section of the tenant. In production
    // that copy never decided anything — the canonical middleware
    // (server/middleware/authoringObjectAuthorization.ts, mounted on /api ahead
    // of this router) had already refused every caller it would have admitted,
    // and a revoked grant it would still have honoured was already dead at the
    // gateway. Two gates with two rule sets is exactly the divergence the
    // working agreement forbids, and the proof-tier tests were proving the
    // copy production never ran. The decision now comes from
    // decideAuthoringPermission, so a revocation, an expiry, an OWNER grant or
    // a global-admin role means the same thing here as it does at the gateway.
    // This gate stays as the fail-closed backstop the middleware is documented
    // to have: one mis-ordered mount and it is still the last word.
    const principal = authoringPrincipalFromRequest(req);
    if (!principal) return false;
    const scope = await resolveAuthoringSectionScope(pool, tenantId, sectionId);
    if (!scope) return false;
    const decision = await decideAuthoringPermission({
      pool,
      principal,
      scope,
      action: 'edit',
    });
    return decision.allowed;
  } catch (error) {
    // Fail CLOSED: a permission store that cannot be consulted authorises
    // nothing. Logged so an operator sees a broken store rather than a silent
    // deny storm.
    logger.error('canEditSection failed; denying the section edit', {
      sectionId: typeof sectionId === 'string' ? sectionId : null,
      err: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// Role-based access control helper
/**
 * Role gate.
 *
 * Reads the VERIFIED claim (req.user.roles) rather than the x-roles header.
 * The middleware above now derives and sanitises that header, so the two agree —
 * but authorization must not depend on a mutable header at all. One middleware
 * ordering mistake, one route mounted without this router's own JWT middleware,
 * and a header-reading gate is bypassable again. Reading the claim removes the
 * whole class. See ledger C-18.
 */
const requireAny = (roles: string[]) => {
  return (req: Request, res: Response, next: any) => {
    const claimed = ((req.user as { roles?: unknown } | undefined)?.roles ?? []) as unknown[];
    const userRoles = (Array.isArray(claimed) ? claimed : [claimed]).map(r =>
      String(r).toUpperCase()
    );
    const hasRole = roles.some(role => userRoles.includes(role.toUpperCase()));
    if (!hasRole) {
      return res.status(403).json({ error: `Requires one of: ${roles.join(', ')}` });
    }
    next();
  };
};

// Guard for section changes & token refresh.
//
// Belt-and-braces: canEditSection already fails closed internally, but this
// middleware must never be able to fall through to next() — or to reject into
// Express's error handler — on a throw. Either outcome is a fail-OPEN or a
// request that gets no answer at all. next() is deliberately OUTSIDE the try so
// an error raised by a downstream handler cannot be mistaken for a gate failure
// and trigger a second response.
router.use('/sections/:sectionId', async (req: Request, res: Response, next: any) => {
  try {
    if (['PATCH', 'POST', 'DELETE'].includes(req.method)) {
      /* ── Say WHICH refusal this is (MDX UAT item A4) ──────────────────────
         `canEditSection` already refuses a FROZEN or APPROVED document — that
         part of Part 11 §11.10(c)/(e) has been enforced here all along, on the
         editor save, the history revert and the AnA draft accept alike (this
         middleware is a prefix match, so all three are covered).

         What it could not do is say WHY, because it returns a boolean: a
         sealed record and a missing grant both came back as
         403 "No edit permission for this section". Those are different facts
         with different remedies — one is "ask an administrator", the other is
         "this content is signed; create a new version" — and the author who
         typed a paragraph into a frozen section was told the wrong one.

         Reading the lock first names the seal in the payload. It is the same
         query `canEditSection` runs, through the canonical helper, so the two
         cannot drift; `canEditSection` keeps its own lock check as the
         fail-closed backstop this middleware is documented to be.

         The STATUS stays 403. A sealed record is arguably a 409, and the
         contract test that pins this says in its own words that "the record
         itself is what matters, not the status code" — but 403 is the answer
         this endpoint has always given, and changing a status is a change to
         every client that branches on it, which is not this fix's to make. The
         distinction the UI needs travels in `error` and `message`, which
         nothing was reading before because nothing was sent. */
      const tenantId = authedOrgId(req);
      if (tenantId != null && typeof req.params.sectionId === 'string') {
        const lock = await checkSectionWritable(pool, req.params.sectionId, tenantId);
        if (!lock.writable && lock.code === 'DOCUMENT_FROZEN') {
          return res.status(403).json({
            error: 'DOCUMENT_FROZEN',
            message: lock.reason,
          });
        }
      }

      const ok = await canEditSection(req, req.params.sectionId);
      if (!ok) return res.status(403).json({ error: 'No edit permission for this section' });
    }
  } catch (error) {
    logger.error('section edit guard failed; denying the request', {
      method: req.method,
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(403).json({ error: 'No edit permission for this section' });
  }
  return next();
});

// Source tenant id from the verified JWT. The previous header / query /
// body fallback was attacker-controlled and is the IDOR shape PRs
// #496-#499 closed.
const getTenantId = (req: Request): number => {
  const tenantId = authedOrgId(req);
  if (tenantId == null) {
    throw new Error('Tenant context required');
  }
  return tenantId;
};

// Source the actor identity used for attribution / audit (created_by,
// updated_by, resolved_by, etc.) from the verified JWT only. Client-supplied
// `req.body.created_by` / `x-user-id` headers were attacker-controlled and let
// a user attribute authored content to another user or "system" (21 CFR Part
// 11 audit-trail integrity gap). Returns null when unauthenticated so the
// caller can respond 401.
const getActorId = (req: Request): string | null => {
  const subject = req.user?.id ?? req.user?.userId;
  if (subject === undefined || subject === null || subject === '') {
    return null;
  }
  return String(subject);
};

// Email-based actor attribution (created_by/submitted_by columns that store an
// email string). Sourced from the verified JWT only — never from
// `x-user-email` / `req.body.*` which were attacker-controlled. Returns null
// when the JWT carries no email/subject so the caller can respond 401.
const getActorEmail = (req: Request): string | null => {
  if (req.user?.email) {
    return String(req.user.email);
  }
  // Fall back to the JWT subject id so attribution is still tied to the
  // authenticated principal when the token omits an email claim.
  const subject = req.user?.id ?? req.user?.userId;
  if (subject === undefined || subject === null || subject === '') {
    return null;
  }
  return String(subject);
};

/**
 * The frozen snapshot a signature taken right now would cover — the most recent
 * frozen_documents row for this document, or null if it has never been frozen.
 *
 * Part 11 §11.70 requires a signature to be linked to the record version it
 * attests to. Signing an unfrozen document is allowed (an author may sign before
 * QA freezes), and that case is recorded as null rather than guessed at.
 */
const currentFrozenSnapshot = async (
  docId: string | string[] | undefined,
  tenantId: number
): Promise<{ version: string; contentHash: string } | null> => {
  const r = await pool.query(
    `SELECT version, content_hash FROM frozen_documents
      WHERE document_id = $1 AND tenant_id = $2
      ORDER BY frozen_at DESC LIMIT 1`,
    [docId, tenantId]
  );
  if ((r.rowCount ?? 0) === 0) return null;
  const row = r.rows[0] as { version: string; content_hash: string };
  return { version: row.version, contentHash: row.content_hash };
};

/**
 * A signature digest that an auditor can RECOMPUTE from the stored row.
 *
 * Every input is a durable column; nothing here is a timestamp. The previous
 * digest on /sign hashed `new Date().toISOString()`, which made it impossible to
 * verify — a hash nobody can reproduce proves nothing. Binding
 * coveredContentHash into the digest is what ties the signature to a specific
 * frozen snapshot cryptographically rather than by mere reference
 * (ledger C-11 residual 2).
 *
 * The `authoring-sig-v1` prefix keeps a future scheme change distinguishable
 * instead of silently incompatible.
 */
const AUTHORING_SIGNATURE_DIGEST_VERSION = 'authoring-sig-v1';

const computeSignatureDigest = (input: {
  signerEmail: string;
  meaning: string;
  contentHash: string;
  coveredContentHash: string | null;
}): string =>
  crypto
    .createHash('sha256')
    .update(
      [
        AUTHORING_SIGNATURE_DIGEST_VERSION,
        input.signerEmail,
        input.meaning,
        input.contentHash,
        input.coveredContentHash ?? '',
      ].join('|')
    )
    .digest('hex');

// Helper function to compute document hash for signatures. The digest itself
// is services/authoring/authoring-export.ts computeDocHash, so the vault filing
// records the same doc_sha256 the export route does.
const computeDocHash = (docId: string | string[] | undefined, tenantId: number): Promise<string> =>
  computeDocHashOn(pool, docId, tenantId);

/**
 * 21 CFR Part 11 §11.10(g) — may this signer apply a signature at all?
 *
 * "Use of ... controls to ensure that persons who ... electronically sign
 * records ... have the authority to do so." Identity is NOT authority: this
 * router verified a PIN (§11.200 second component) and a token, and then let
 * any authenticated member sign — including `meaning: 'APPROVER'`, which flips
 * the document to APPROVED and inserts a frozen_documents row. A viewer with a
 * PIN could approve and seal a regulated record.
 *
 * The policy already existed and this router simply never asked it.
 * signing-authority.ts is the single source of truth (its own header names the
 * surfaces that consult it — /api/esignature/sign, sign-release, the AnA
 * verified-seal route — and this file was not among them), and the role comes
 * from resolveSignerOrgRole, which reads `organization_users` rather than
 * `req.user.role`: the resolver's header is explicit that the request-borne
 * role "is not reliably populated on every signing route".
 *
 * Fails closed — no membership row, or a role outside the allowlist, is not
 * authorized. Deployments tune the allowlist with ESIGNATURE_SIGNING_ROLES.
 *
 * @compliance 21 CFR Part 11 §11.10(d), §11.10(g)
 */
async function assertSigningAuthority(
  req: Request,
  res: Response,
): Promise<boolean> {
  const actorId = Number(getActorId(req));
  const orgId = getTenantId(req);
  const role = await resolveSignerOrgRole(actorId, orgId);
  if (!isSigningAuthorized(role)) {
    res.status(403).json({
      error:
        'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)).',
      code: 'ESIGNATURE_NO_AUTHORITY',
    });
    return false;
  }
  return true;
}

/**
 * Does this document exist for this tenant?
 *
 * computeDocHash hashes the section rows and returns sha256("") when there are
 * none — which is indistinguishable from an unknown or cross-tenant docId. So a
 * signature could be written, an approval flip attempted against zero rows, and
 * a frozen_documents row inserted, all bound to the hash of the empty string,
 * and the caller told the document was signed and approved. §11.70 requires a
 * signature to be linked to its record; a signature bound to no record is not.
 */
// Does `authoring_documents` carry `c2c_document_id` in THIS deployment?
// Three-valued ('unknown' when the probe could not run) — the probe itself is
// services/authoring/authoring-evidence.ts bindingColumnState; this keeps the
// pool default every call site here relies on.
const bindingColumnState = (executor: Queryable = pool) => bindingColumnStateOn(executor);

async function documentExistsForTenant(
  docId: string | string[] | undefined,
  tenantId: number,
  executor: Queryable = pool,
): Promise<boolean> {
  const r = await executor.query(
    'SELECT 1 FROM authoring_documents WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [docId, tenantId],
  );
  return (r.rowCount ?? 0) > 0;
}

// Comprehensive audit logging for 21 CFR Part 11 compliance.
//
// The writer itself — the authoring_audit_trail row, the audit_logs index entry
// on the standalone path, the hash-chained entry when enlisted in a caller's
// transaction, and the fail-closed policy — is
// services/authoring/authoring-evidence.ts writeAuthoringAuditTrail, so the
// creators in services/authoring/authoring-documents.ts write the same rows
// from this router and from the AnA tool. This adapter derives the actor from
// the VERIFIED principal exactly as before and keeps every call site unchanged.
const auditContextFromRequest = (req: Request): AuthoringAuditContext => ({
  tenantId: getTenantId(req),
  actorId: getActorId(req) ?? undefined,
  actorEmail: (req.headers as any)['x-user-email'] || 'unknown',
  actorRole: (req.headers as any)['x-roles'] || 'unknown',
  ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
  userAgent: (req.headers['user-agent'] as string | undefined) || 'unknown',
  sessionId: (req.headers as any)['x-session-id'] || undefined,
  pool,
});

const createAuditTrail = async (
  req: Request,
  docId: string | string[] | undefined,
  sectionId: string | string[] | undefined | null,
  operationType: string,
  beforeContent: string | null,
  afterContent: string | null,
  changeReason: string | null,
  metadata: any = {},
  // When part of a lifecycle transaction, the caller passes its BEGIN'd client
  // so the audit row commits (or rolls back) atomically with the mutation it
  // records. Defaults to the pool for standalone callers.
  executor: Queryable = pool,
  auditOpts: CreateAuditTrailOptions = {}
) => {
  let ctx: AuthoringAuditContext;
  try {
    ctx = auditContextFromRequest(req);
  } catch (error) {
    // The writer's own policy, applied to a context that could not be derived
    // (a synthesized request without a tenant): never silent, fatal on a
    // caller's transaction, best-effort standalone outside production.
    console.error('CRITICAL: Failed to create audit trail:', error);
    if (executor !== pool) throw error;
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Audit logging failed - operation aborted for compliance', { cause: error });
    }
    return;
  }
  await writeAuthoringAuditTrail(ctx, {
    docId,
    sectionId,
    operationType,
    beforeContent,
    afterContent,
    changeReason,
    metadata,
    executor,
    auditOpts,
  });
};

/** The service context a create handler hands to authoring-documents.ts. */
const createContext = (req: Request, tenantId: number, actorId: string) => ({
  pool,
  tenantId,
  actor: { id: actorId, email: req.user?.email ? String(req.user.email).toLowerCase() : null },
  audit: auditContextFromRequest(req),
});

// Legacy wrapper for backward compatibility
const createAuditEvent = async (
  docId: string | string[] | undefined,
  eventType: string,
  actor: string,
  metadata: any,
  tenantId: number,
  // Threaded through to createAuditTrail so this legacy wrapper can enlist in a
  // lifecycle transaction (see POST /docs/:docId/sign). Defaults to the pool.
  executor: Queryable = pool,
  auditOpts: CreateAuditTrailOptions = {}
) => {
  // Synthesize the request shape createAuditTrail reads from. `user` is the
  // important part: getTenantId sources the tenant from the VERIFIED JWT
  // (req.user.organizationId) rather than the x-tenant-id header it used to
  // trust, so a headers-only stand-in made getTenantId throw "Tenant context
  // required" — inside createAuditTrail's catch, which meant every audit event
  // routed through this helper was silently dropped. The caller has already
  // resolved the tenant from the real request; pass it through explicitly.
  // Named for what it is: a real request CONTEXT assembled from real values
  // (the caller's resolved tenant and actor), not a mock. It was `mockReq`,
  // which was both inaccurate — nothing here is fabricated — and the single
  // genuine hit of ci:no-mock-in-prod-routes once that guard was repaired to
  // match identifier forms in code rather than the bare word in comments.
  const auditRequestContext = {
    user: { organizationId: tenantId, email: actor },
    headers: { 'x-user-email': actor, 'x-tenant-id': tenantId },
    ip: 'legacy-call',
    connection: { remoteAddress: 'legacy-call' },
  } as any;

  await createAuditTrail(
    auditRequestContext,
    docId,
    null,
    eventType,
    null,
    null,
    'Legacy audit event',
    metadata,
    executor,
    auditOpts
  );
};

// Helper function to ensure token table exists
// authoring_tokens is now provisioned by db/migrations/20260730_authoring_runtime_ddl.sql.
// Retained as a no-op so existing call sites need no change; the router no longer
// issues runtime DDL (see authoring-schema-contract test).
const ensureTokenTableExists = async () => {};

// authoring_templates / template_guidance / template_usage / section_guidance are
// now provisioned by db/migrations/20260730_authoring_runtime_ddl.sql. Retained as
// a no-op so existing call sites need no change; the router no longer issues
// runtime DDL (see authoring-schema-contract test).
const ensureTemplateTablesExist = async () => {};

/**
 * §11.200(a)(1): re-verify the signer at the moment of signing, with the
 * platform's one ceremony (services/part11/reverify-signer.ts): the account
 * password, the second factor whenever one is enrolled, and the account's
 * lockout. Answers the refusal itself and returns null when the signature must
 * not be applied.
 *
 * This router verified a separate "signing PIN" instead (VSR-001 §13.3 item 3).
 * A signer with an authenticator enrolled signed without it; the PIN was first
 * set by POST /users/pin with a session alone, so possession of a session was
 * possession of the signing credential; and the product had two credential
 * stores with two lockouts for one act. The PIN routes and verifier are deleted;
 * the replacement for each is named where it stood.
 *
 * Called after every other check, so a code is consumed only by a signature
 * that is otherwise ready to apply.
 */
async function reverifyAuthoringSigner(req: Request, res: Response): Promise<SignerReverified | null> {
  const actor = getActorId(req);
  const userId = actor !== null && /^\d+$/.test(actor) ? Number(actor) : null;
  if (userId === null) {
    res.status(401).json({ error: 'Signing requires an account the server can re-verify', code: 'SIGNER_NOT_VERIFIABLE' });
    return null;
  }
  const { password, mfaToken } = (req.body ?? {}) as { password?: unknown; mfaToken?: unknown };
  const verified = await reverifySigner(userId, { password, mfaToken }, signerReverificationDeps());
  if (!verified.ok) {
    res.status(verified.status).json({ error: verified.error, code: verified.code });
    return null;
  }
  return verified;
}

/**
 * The signer's PRINTED NAME, for 21 CFR §11.50(a)(1).
 *
 * ── The defect this replaces ─────────────────────────────────────────────────
 * Both sign paths read the name as
 *
 *     ((req.user as { name?: string })?.name) || email
 *
 * and this router's own first middleware builds `req.user` from the verified
 * token as `{ id, userId, email, role, roles, organizationId }` — there is no
 * `name` key, and the access token carries no `name` claim to put in one. The
 * left side was therefore ALWAYS undefined, so `signer_name` on every
 * `authoring_signatures` row ever written is the signer's EMAIL ADDRESS.
 *
 * §11.50(a)(1) requires the printed name of the signer. An email address is an
 * identifier, not a printed name, and the fallback silently substituted one for
 * the other on a legally binding attestation.
 *
 * ── Why NULL rather than the email when it cannot be resolved ────────────────
 * Returning the email is what produced the defect: it is indistinguishable, at
 * every later point, from a genuinely resolved name. `signer_name` is nullable,
 * so NULL is available and is the honest value — it lets the manifestation say
 * "no printed name on record for this signer" instead of presenting an address
 * as if it satisfied §11.50(a)(1). The signature itself is NOT refused: a
 * missing display name is a record-quality problem, and blocking a signer from
 * attesting over it would be the worse failure.
 *
 * `users.email` is UNIQUE and `users.name` is NOT NULL, so a matched row always
 * yields a name.
 */
/**
 * The closed set of §11.50(a)(3) signature meanings this subsystem stores.
 * Declared once: `/e-sign` inlined this list and `/sign` had no check at all.
 */
const SIGNATURE_MEANINGS = ['AUTHOR', 'REVIEWER', 'APPROVER'] as const;

// The §11.50(b) manifestation (meaning labels, the ordered manifest lines and
// the tenant-scoped signature read) moved to services/authoring/authoring-export.ts
// with the renderer that is its only consumer.

const resolveSignerName = async (email: string): Promise<string | null> => {
  try {
    // Both call sites (the /e-sign PIN path and the /sign path) pass
    // getActorEmail(req) — the AUTHENTICATED actor's own address, never a body
    // or header value. That was the point of the earlier fix noting
    // "x-user-email here meant anyone could sign as anyone".
    //
    // tenant-isolation-safe: self-lookup of the caller's own §11.50(a)(1) printed name; `users` is the global identity table (membership lives in organization_users) so it has no tenant column to filter on, and getActorEmail(req) makes the caller's own row the only one reachable.
    const r = await pool.query<{ name: string | null }>(
      'SELECT name FROM users WHERE lower(email) = lower($1) LIMIT 1',
      [email]
    );
    const name = r.rows[0]?.name?.trim();
    return name ? name : null;
  } catch (error) {
    // A failed lookup must not take down the signing act. NULL is the honest
    // outcome and the manifestation reports it as unresolved.
    console.error('Signer name lookup failed:', error);
    return null;
  }
};

// Helper to create or update user PIN

// Helper function to create revision automatically — the hash-chained
// doc_revisions writer is services/authoring/authoring-evidence.ts
// createRevision (see its header for the ledger); this keeps the pool default
// the non-transactional call sites here rely on.
const createRevision = (
  sectionId: string | string[] | undefined,
  content: string,
  updatedBy: string,
  tenantId: number,
  executor: Queryable = pool,
  origin: RevisionOrigin = 'human-edit',
  contributors: { id: string; name: string }[] = []
) => createRevisionOn(executor, { sectionId, content, updatedBy, tenantId, origin, contributors });

// ============= Token Operations =============
router.post('/sections/:sectionId/tokens', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { cite_id, token_key, payload, source_refs } = req.body;
    const tenantId = getTenantId(req);
    const userEmail = (req.headers['x-user-email'] as string) || 'system';

    await ensureTokenTableExists();

    const sha256 = payload
      ? crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
      : null;

    const result = await pool.query(
      `INSERT INTO authoring_tokens
        (section_id, cite_id, token_key, payload, payload_sha256, source_refs, created_by, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (section_id, cite_id)
       DO UPDATE SET
         token_key = $3,
         payload = $4,
         payload_sha256 = $5,
         source_refs = $6,
         updated_at = NOW()
       RETURNING *`,
      [sectionId, cite_id, token_key, payload, sha256, source_refs, userEmail, tenantId]
    );

    res.json({
      success: true,
      token: result.rows[0],
    });
  } catch (error) {
    console.error('Error saving token:', error);
    return serverError(res, logger, 'saving tokens', error);
  }
});

// DELETE /api/authoring/sections/:sectionId/tokens/:citeId - Delete a token
router.delete('/sections/:sectionId/tokens/:citeId', async (req: Request, res: Response) => {
  try {
    const { sectionId, citeId } = req.params;
    const tenantId = getTenantId(req);

    await ensureTokenTableExists();

    const result = await pool.query(
      `DELETE FROM authoring_tokens
       WHERE section_id = $1 AND cite_id = $2 AND tenant_id = $3
       RETURNING *`,
      [sectionId, citeId, tenantId]
    );

    res.json({
      success: true,
      deleted: ((result.rowCount ?? 0) > 0),
    });
  } catch (error) {
    console.error('Error deleting token:', error);
    return serverError(res, logger, 'deleting tokens', error);
  }
});

// ============= Template Operations =============

// Initialize template tables on startup
(async () => {
  try {
    await ensureTemplateTablesExist();
    console.log('✅ Template tables initialized');
  } catch (error) {
    console.error('Failed to initialize template tables:', error);
  }
})();

// GET /api/authoring/templates - List all available templates
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const { category, template_type, search } = req.query;
    const tenantId = getTenantId(req);

    // Every column here is one that authoring_templates actually has.
    //
    // This SELECT asked for t.name, t.module, t.region, t.description,
    // t.section_count and t.active — SIX columns the table does not define
    // (ensureTemplateTablesExist above creates template_name, regions and
    // is_active). PostgreSQL rejects an unknown column at plan time, so this
    // was an unconditional 42703: the endpoint 500'd on every request it had
    // ever received.
    //
    // It failed quietly because the only caller degrades well —
    // v2/surfaces/AuthoringCreateExport.tsx:53 wraps the fetch in
    // `catch { /* picker stays blank-only */ }` and only populates when the
    // body parses. So the "Start from" dropdown in the New Document dialog has
    // silently offered nothing but "None" for the life of the feature, with no
    // error anywhere a user or an operator would see.
    //
    // The `// template_type filter removed - column doesn't exist` note below
    // is a previous encounter with this same bug, patched one filter at a time;
    // template_type does exist, and that comment is wrong too. Fixing the
    // SELECT is what actually resolves it.
    //
    // Aliased to the shape the client reads (`t.name ?? t.title`) so the
    // response contract is unchanged.
    let query = `
      SELECT
        t.id,
        t.template_name AS name,
        t.template_name,
        t.template_type,
        t.category,
        t.regions,
        t.metadata ->> 'description' AS description,
        CASE WHEN jsonb_typeof(t.template_content -> 'sections') = 'array'
             THEN jsonb_array_length(t.template_content -> 'sections')
             ELSE 0 END AS section_count,
        t.created_at,
        t.is_active AS active
      FROM authoring_templates t
      WHERE t.tenant_id = $1 AND t.is_active = true
    `;

    const params: any[] = [tenantId];
    let paramCount = 1;

    if (category) {
      paramCount++;
      query += ` AND t.category = $${paramCount}`;
      params.push(category);
    }

    // template_type DOES exist (see ensureTemplateTablesExist); the filter was
    // removed under the mistaken belief that it did not. Restored.
    if (template_type) {
      paramCount++;
      query += ` AND t.template_type = $${paramCount}`;
      params.push(template_type);
    }

    if (search) {
      // Was `OR LOWER(t.name)` — t.name does not exist, so this branch was part
      // of the same 42703.
      paramCount++;
      query += ` AND LOWER(t.template_name) LIKE LOWER($${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY t.created_at DESC`;

    const result = await pool.query(query, params);
    // Same rule the globals get below: a template with zero sections cannot
    // seed anything and POST /docs refuses it with a 404 — listing it here
    // offered an option the create endpoint was guaranteed to reject.
    const orgRows = result.rows.filter((r: any) => Number(r.section_count) > 0);

    // ── Merge in the GLOBAL regulatory reference templates ──
    //
    // POST /docs resolves template_id against intelligence.document_templates
    // first — the deliberately untenanted store of agency-expectation
    // skeletons (CTD section sets, response letters). A picker that lists only
    // the org's own rows offers a different universe from the one create
    // consumes; with authoring_templates shipping empty, it offered NOTHING
    // for the life of the feature. Org rows stay first (customer content
    // before reference data); shape is aliased to the same contract.
    //
    // FAIL SOFT on the global read: the intelligence schema is a separate
    // bundle, absent in some deployments and in the authoring test harness. An
    // org's own templates must not vanish because the reference store is
    // unreachable.
    let globalRows: any[] = [];
    let globalCatalog: 'ok' | 'unavailable' = 'ok';
    try {
      let globalQuery = `
        SELECT
          t.id,
          t.template_name AS name,
          t.template_name,
          t.document_type AS template_type,
          'Regulatory reference' AS category,
          ARRAY[t.agency]::text[] AS regions,
          t.description,
          (SELECT count(*)::int FROM intelligence.template_sections ts WHERE ts.template_id = t.id) AS section_count,
          t.created_at,
          true AS active
        FROM intelligence.document_templates t
        WHERE t.status = 'active'
      `;
      const globalParams: any[] = [];
      if (category) {
        // Globals carry the synthetic category 'Regulatory reference'; a
        // category filter for anything else excludes them.
        if (String(category) !== 'Regulatory reference') globalQuery += ` AND false`;
      }
      if (template_type) {
        globalParams.push(template_type);
        globalQuery += ` AND t.document_type = $${globalParams.length}`;
      }
      if (search) {
        globalParams.push(`%${search}%`);
        globalQuery += ` AND LOWER(t.template_name) LIKE LOWER($${globalParams.length})`;
      }
      globalQuery += ` ORDER BY t.template_name ASC`;
      const globalResult = await pool.query(globalQuery, globalParams);
      // A template with zero sections cannot seed anything — offering it in
      // "Start from" would recreate the sectionless-document lie server-side.
      globalRows = globalResult.rows.filter((r: any) => Number(r.section_count) > 0);
    } catch (globalErr) {
      logger.warn('Global template store unavailable; listing org templates only', {
        error: globalErr instanceof Error ? globalErr.message : String(globalErr),
      });
      // The fail-soft is deliberate (an unreachable reference catalog must not
      // hide the org's own templates) — but the caller must be able to tell a
      // SHORT list from a FAILED half: the picker says so instead of letting
      // "no shared templates" and "the catalog read failed" render identically.
      globalCatalog = 'unavailable';
    }

    const merged = [...orgRows, ...globalRows];
    res.json({
      success: true,
      templates: merged,
      globalCatalog,
      // rows.length, not rowCount: rowCount is a node-postgres field and is not
      // populated by every driver this code is exercised against.
      count: merged.length,
    });
  } catch (error) {
    console.error('Error listing templates:', error);
    return serverError(res, logger, 'loading templates', error);
  }
});

// GET /api/authoring/templates/:id - Get template with guidance
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId(req);

    const templateResult = await pool.query(
      `SELECT id, template_name, template_type, category, regions, template_content, guidance_content, metadata, is_active, usage_count, created_at, updated_at, created_by, tenant_id FROM authoring_templates WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (((templateResult.rowCount ?? 0) === 0)) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const guidanceResult = await pool.query(
      `SELECT id, template_id, section_name, section_code, guidance_text, examples, regulatory_references, ai_prompts, compliance_checklist, created_at, updated_at, tenant_id FROM template_guidance WHERE template_id = $1 AND tenant_id = $2 ORDER BY section_code`,
      [id, tenantId]
    );

    res.json({
      success: true,
      template: templateResult.rows[0],
      guidance: guidanceResult.rows,
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    return serverError(res, logger, 'loading templates', error);
  }
});

// POST /api/authoring/templates - Create new template
router.post(
  '/templates',
  requireAny(['ADMIN', 'RA_CMC', 'QA']),
  async (req: Request, res: Response) => {
    try {
      const {
        template_name,
        template_type,
        category,
        regions,
        template_content,
        guidance_content,
        metadata,
      } = req.body;
      const tenantId = getTenantId(req);
      const createdBy = getActorEmail(req);
      if (!createdBy) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const result = await pool.query(
        `INSERT INTO authoring_templates
       (template_name, template_type, category, regions, template_content, guidance_content, metadata, created_by, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
        [
          template_name,
          template_type,
          category,
          regions,
          template_content,
          guidance_content,
          metadata,
          createdBy,
          tenantId,
        ]
      );

      res.status(201).json({
        success: true,
        template: result.rows[0],
      });
    } catch (error) {
      console.error('Error creating template:', error);
      return serverError(res, logger, 'saving templates', error);
    }
  }
);

/* POST /templates/apply/:id is DELETED, not moved. It upserted section
 * content with no revision, no audit row, no lock check and no role gate —
 * an ungoverned overwrite of regulated content on a FROZEN or signed
 * document included — and nothing in the client ever called it (it is in
 * the orphan-endpoints report). The governed equivalent already exists:
 * POST /docs/:docId/apply-template takes a pre-template snapshot revision,
 * records 'template-apply' attribution, and runs in a transaction. Anything
 * that wants apply-onto-existing-document wires there, never here. */

// GET /api/authoring/guidance/:sectionId - Get contextual guidance
router.get('/guidance/:sectionId', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const tenantId = getTenantId(req);

    // Get section-specific guidance
    const guidanceResult = await pool.query(
      `SELECT id, section_id, document_type, guidance_type, content, metadata, priority, created_at, updated_at, tenant_id FROM section_guidance
       WHERE section_id = $1 AND tenant_id = $2
       ORDER BY priority DESC, guidance_type`,
      [sectionId, tenantId]
    );

    // Get template guidance if section is from a template
    const templateGuidanceResult = await pool.query(
      `SELECT tg.id, tg.template_id, tg.section_name, tg.section_code, tg.guidance_text, tg.examples, tg.regulatory_references, tg.ai_prompts, tg.compliance_checklist, tg.created_at, tg.updated_at, tg.tenant_id FROM template_guidance tg
       JOIN authoring_sections s ON s.code = tg.section_code
       WHERE s.id = $1 AND tg.tenant_id = $2`,
      [sectionId, tenantId]
    );

    res.json({
      success: true,
      guidance: guidanceResult.rows,
      template_guidance: templateGuidanceResult.rows,
      section_id: sectionId,
    });
  } catch (error) {
    console.error('Error fetching guidance:', error);
    return serverError(res, logger, 'loading guidance', error);
  }
});

// POST /api/authoring/guidance - Create/update guidance for a section
router.post(
  '/guidance',
  requireAny(['ADMIN', 'RA_CMC', 'QA']),
  async (req: Request, res: Response) => {
    try {
      const { section_id, document_type, guidance_type, content, metadata, priority } = req.body;
      const tenantId = getTenantId(req);

      const result = await pool.query(
        `INSERT INTO section_guidance
       (section_id, document_type, guidance_type, content, metadata, priority, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (section_id, guidance_type, tenant_id)
       DO UPDATE SET
         content = $4,
         metadata = $5,
         priority = $6,
         updated_at = NOW()
       RETURNING *`,
        [section_id, document_type, guidance_type, content, metadata, priority || 0, tenantId]
      );

      res.json({
        success: true,
        guidance: result.rows[0],
      });
    } catch (error) {
      console.error('Error saving guidance:', error);
      return serverError(res, logger, 'saving guidance', error);
    }
  }
);

// ============= CRUD Operations =============

// GET /api/authoring/docs?module=M3 - List documents by module
router.get('/docs', async (req: Request, res: Response) => {
  try {
    /*
     * `module` has NO default, and that is the fix.
     *
     * It used to read `module = 'M3'`, and the filter below applies whatever
     * `module` holds — unconditionally. So a caller that deliberately sent no
     * `module` got an M3-only list and no way to tell.
     *
     * The editor is exactly that caller, and says so in as many words
     * (DocumentAuthoring.tsx:282): "No `module` filter. Every filter on this
     * route is optional server-side, and pinning one hid the rest of the
     * dossier behind a dropdown — the outline is what selects a section now,
     * so the document list must span all modules for it to select into."
     * Every filter on this route was optional except the one the client was
     * counting on being optional.
     *
     * The POST default at :1182 is untouched — a new document does need a
     * module, and M3 is a reasonable one to start from.
     */
    /* BP-W0-7: `status` had a `= 'draft'` default here, which is the same defect
       the `module = 'M3'` default above was fixed for and documented at length —
       a caller that deliberately sent no status filter got one anyway and had no
       way to tell. Combined with the case-sensitive comparison below, that made
       draft the only state the API would answer about by default. No default. */
    const { module, product_code, status, programId } = req.query;
    const tenantId = getTenantId(req);

    let query = `
      SELECT
        d.id,
        d.title,
        d.module,
        d.product_code,
        d.locale,
        d.status,
        d.created_at,
        d.updated_at,
        d.created_by,
        COUNT(s.id) as section_count,
        COALESCE(SUM(LENGTH(s.content)), 0) as total_content_length
      FROM authoring_documents d
      LEFT JOIN authoring_sections s ON s.doc_id = d.id
      WHERE d.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramCount = 1;

    if (module) {
      paramCount++;
      query += ` AND d.module = $${paramCount}`;
      params.push(module);
    }

    if (product_code) {
      paramCount++;
      query += ` AND d.product_code = $${paramCount}`;
      params.push(product_code);
    }

    /*
     * BP-W0-7 — "frozen documents are unreachable under all status filters".
     *
     * They were, and so was everything else that had left draft. This compared
     * `d.status = $n` case-SENSITIVELY against a vocabulary the router writes in
     * two cases. `POST /docs` inserts `'draft'`; submit writes `'IN_REVIEW'`
     * (:5204), approve writes `'APPROVED'` (:5399, :5415) and freeze writes
     * `'FROZEN'` (:3859). The editor's dropdown offers `['draft', 'in_review',
     * 'approved']`, all lower case. So:
     *
     *   status=draft       matched                        (both sides lower)
     *   status=in_review   matched NOTHING                (server wrote IN_REVIEW)
     *   status=approved    matched NOTHING                (server wrote APPROVED)
     *   FROZEN             had no dropdown option at all
     *
     * A document was therefore reachable only while it was a draft. The moment
     * it was submitted it vanished from the surface that authors it — freezing
     * was just the most visible instance.
     *
     * This file had already met this exact split and solved it: the comment on
     * LOCKED_DOCUMENT_STATUSES above spells out that the router writes both
     * cases and that "a case-sensitive comparison would silently miss a locked
     * record". That reasoning was applied to the lock check and never to this
     * filter. Same fix, same reason.
     *
     * `all` (and an explicitly empty string) means no status predicate. That is
     * the part that makes this durable rather than another enumeration to keep
     * in sync: whatever status a future handler invents, the document stays
     * reachable, which is the property the acceptance criterion actually asks
     * for. Normalising the stored values instead would need a data migration
     * across live tenants and would break the equality checks in the freeze and
     * approve handlers; this is the change that fixes retrieval without touching
     * the Part 11 chain.
     */
    const statusFilter = typeof status === 'string' ? status.trim() : '';
    if (statusFilter && statusFilter.toLowerCase() !== 'all') {
      paramCount++;
      query += ` AND upper(d.status) = upper($${paramCount})`;
      params.push(statusFilter);
    }

    // Project scope (optional): filter to one regulatory_programs UUID. The
    // new column is referenced ONLY when programId is supplied, so the org-wide
    // path — and any database without the 20260727 migration — is untouched.
    if (programId) {
      paramCount++;
      query += ` AND d.client_program_id = $${paramCount}`;
      params.push(programId);
    }

    query += ` GROUP BY d.id ORDER BY d.updated_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      documents: result.rows,
      count: result.rowCount,
      filters: { module, product_code, status, programId },
    });
  } catch (error) {
    console.error('Error listing documents:', error);
    return serverError(res, logger, 'loading docs', error);
  }
});

// POST /api/authoring/docs - Create new document
router.post('/docs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const createdBy = getActorId(req);
    if (!createdBy) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // The create itself — template resolution before any write, the governed
    // binding, ONE transaction for the document, its identity aliases, its
    // seeded sections and their Part 11 evidence, then the creator's
    // OWNER/AUTHOR grants — is services/authoring/authoring-documents.ts
    // createDocument, shared with POST /docs/from-draft and the AnA tool.
    const outcome = await createDocument(createContext(req, tenantId, createdBy), req.body ?? {});
    if (outcome.kind === 'refused') {
      return res.status(outcome.status).json({ success: false, error: outcome.error });
    }

    res.status(201).json({
      success: true,
      document: outcome.document,
      // How many sections the chosen template actually seeded (absent for a
      // blank create) — the client's confirmation states it instead of
      // implying it.
      ...(outcome.templateSectionCount !== null ? { sections_seeded: outcome.templateSectionCount } : {}),
      message: 'Document created successfully',
      // The binding outcome, always present. A document that is NOT attached to
      // a governed filing must say so at the moment it is created — an unbound
      // document is a legitimate state, but a silently unbound one is how the
      // two stores drifted apart in the first place.
      governance: outcome.binding.documentId
        ? { bound: true, c2cDocumentId: outcome.binding.documentId }
        : { bound: false, reason: outcome.binding.reason },
    });
  } catch (error) {
    if (error instanceof DocumentAliasConflictError) {
      // Nothing was persisted: the alias write is inside the transaction.
      return res.status(409).json({
        error: 'DOCUMENT_ALIAS_CONFLICT',
        message: `${error.message}. Nothing was created.`,
      });
    }
    console.error('Error creating document:', error);
    return serverError(res, logger, 'saving docs', error);
  }
});

// POST /api/authoring/docs/from-draft — a drafted document becomes an authoring
// document in one transaction (WM, 2026-09-21, docs/design/ANA_DOCUMENT_CANVAS.md).
//
// body { programId, title, module?, documentType?,
//        sections: [{ code, title, content }],
//        provenance: { source: 'ana' | 'seed' | 'import', conversationId?, turnId?, model?, note? } }
// → 201 { data: { doc, sections } }. Content is sanitized HTML (the server-side
// mirror of the client's audited allowlist); provenance is stored on the row
// and returned by GET /docs/:docId. 400 on an empty section list or a missing
// programId, 403 without a tenant, 503 (nothing written) when the deployment
// cannot record provenance.
router.post('/docs/from-draft', async (req: Request, res: Response) => {
  try {
    const tenantId = authedOrgId(req);
    if (tenantId == null) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const createdBy = getActorId(req);
    if (!createdBy) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const parsed = parseDraftInput(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    const outcome = await createDocumentFromDraft(createContext(req, tenantId, createdBy), parsed.value);
    if (outcome.kind === 'refused') {
      return res.status(outcome.status).json({ success: false, error: outcome.error });
    }
    res.status(201).json({
      success: true,
      data: {
        doc: { ...outcome.document, provenance: outcome.provenance },
        sections: outcome.sections,
      },
      governance: outcome.binding.documentId
        ? { bound: true, c2cDocumentId: outcome.binding.documentId }
        : { bound: false, reason: outcome.binding.reason },
    });
  } catch (error) {
    if (error instanceof DocumentAliasConflictError) {
      return res.status(409).json({
        error: 'DOCUMENT_ALIAS_CONFLICT',
        message: `${error.message}. Nothing was created.`,
      });
    }
    console.error('Error creating document from draft:', error);
    return serverError(res, logger, 'saving docs', error);
  }
});

// GET /api/authoring/docs/:docId - Get document details
router.get('/docs/:docId', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const tenantId = getTenantId(req);

    const docResult = await pool.query(
      `SELECT
        d.id, d.title, d.module, d.product_code, d.locale, d.status, d.created_at, d.updated_at, d.created_by, d.template_id, d.submitted_at, d.current_workflow_id, d.approved_at, d.frozen_at, d.locked_at, d.locked_by, d.tenant_id, d.version,
        COUNT(DISTINCT s.id) as section_count,
        COUNT(DISTINCT c.id) as comment_count,
        COUNT(DISTINCT r.id) as revision_count
       FROM authoring_documents d
       -- Same defect, same fix as the per-section counters below: only the
       -- document was tenant-scoped, so its own section / comment / revision
       -- counts included rows belonging to other tenants.
       LEFT JOIN authoring_sections s ON s.doc_id     = d.id AND s.tenant_id = d.tenant_id
       LEFT JOIN authoring_comments c ON c.doc_id     = d.id AND c.tenant_id = d.tenant_id
       LEFT JOIN doc_revisions r      ON r.section_id = s.id AND r.tenant_id = s.tenant_id
       WHERE d.id = $1 AND d.tenant_id = $2
       GROUP BY d.id`,
      [docId, tenantId]
    );

    if (((docResult.rowCount ?? 0) === 0)) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    /* Provenance (WM, 2026-09-21): whether AnA drafted this document, a seed
       produced it or it was imported — NULL when a person authored it. Read
       through the service so a deployment without the 20260921 column reports
       `provenanceStore` honestly instead of a null that reads as "a person". */
    const prov = await readDocumentProvenance(pool, String(docId), tenantId);
    res.json({
      success: true,
      document: { ...docResult.rows[0], provenance: prov.provenance },
      ...(prov.provenanceStore !== 'present' ? { provenanceStore: prov.provenanceStore } : {}),
    });
  } catch (error) {
    console.error('Error getting document:', error);
    return serverError(res, logger, 'loading docs', error);
  }
});

// GET /api/authoring/docs/:docId/sections - Get all sections for a document
router.get('/docs/:docId/sections', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const tenantId = getTenantId(req);

    const result = await pool.query(
      `SELECT
        s.id, s.doc_id, s.code, s.title, s.content, s.order_index, s.track_changes, s.created_at, s.updated_at, s.tenant_id,
        COUNT(DISTINCT c.id) as comment_count,
        COUNT(DISTINCT r.id) as revision_count,
        COUNT(DISTINCT ct.id) as citation_count
       FROM authoring_sections s
       -- The counters must count what the panels list (MDX UAT item A5).
       -- Reported as an off-by-one: the toolbar read "History 2" / "2 revisions"
       -- while the history panel said "No prior revisions". It is not an
       -- off-by-one -- the two sides ran differently-scoped queries. Only the
       -- section carried a tenant predicate, so these joins counted every row in
       -- the three child tables that matched on id ALONE, across tenants, while
       -- every panel that LISTS them is tenant-scoped (history, comments and
       -- citations all filter their own tenant_id). Any row whose tenant_id did
       -- not match the section's -- another tenant's, or a null one -- was
       -- counted and then not shown.
       --
       -- Scoping the joins makes the label and the list the same question. It
       -- also closes a cross-tenant count leak: the old form disclosed the
       -- existence of other tenants' rows through a number on the toolbar.
       LEFT JOIN authoring_comments c  ON c.section_id  = s.id AND c.tenant_id  = s.tenant_id
       LEFT JOIN doc_revisions r       ON r.section_id  = s.id AND r.tenant_id  = s.tenant_id
       LEFT JOIN authoring_citations ct ON ct.section_id = s.id AND ct.tenant_id = s.tenant_id
       WHERE s.doc_id = $1 AND s.tenant_id = $2
       GROUP BY s.id
       ORDER BY s.order_index, s.created_at`,
      [docId, tenantId]
    );

    /* Two structural facts about the document as a whole, computed from the
       rows just read — no second query, and every client that already reads
       this endpoint gets them.

       They are worth stating because neither is visible from any one section:
       a code filed twice puts two 3.2.S in the assembled dossier with nothing
       to say which is meant, and a stored order that disagrees with the codes
       means the dossier assembles in the wrong order. Documents created before
       the section-create path assigned a real position have every section at
       index 0, so this is how one is recognised. */
    const structure = sectionStructureIssues(
      result.rows.map((r: { code?: string | null }) => String(r.code ?? '')),
    );

    res.json({
      success: true,
      sections: result.rows,
      count: result.rowCount,
      structure,
    });
  } catch (error) {
    console.error('Error getting sections:', error);
    return serverError(res, logger, 'loading sections', error);
  }
});

// POST /api/authoring/sections - Create new section
router.post('/sections', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const createdBy = getActorId(req);
    if (!createdBy) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // The create — the parent's immutability lock, the position the code
    // belongs at (FOR UPDATE), the INSERT + lineage gate in one transaction,
    // then the genesis revision and the CREATE audit row — is
    // services/authoring/authoring-documents.ts createSection.
    const outcome = await createSection(createContext(req, tenantId, createdBy), req.body ?? {});
    if (outcome.kind === 'refused') {
      return res.status(outcome.status).json({ success: false, error: outcome.error });
    }
    if (outcome.kind === 'lineage_failed') {
      return res.status(500).json({
        success: false,
        error: {
          code: 'LINEAGE_REQUIRED',
          message:
            'The section was not created: its data lineage could not be recorded. ' +
            'Saving content without provenance is not permitted.',
        },
      });
    }

    res.status(201).json({
      success: true,
      section: outcome.section,
      message: 'Section created successfully',
    });
  } catch (error) {
    console.error('Error creating section:', error);
    return serverError(res, logger, 'saving sections', error);
  }
});

// PATCH /api/authoring/sections/:sectionId - Update section (with automatic revision)
router.patch('/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { content, track_changes, title, code } = req.body;
    /* Who authored the accepted suggestions this save carries in. The client
       reads them off the marks before accepting strips them; the server keeps
       only the ones it recognises as non-human, because a human co-author is
       already named by created_by. */
    const contributors = machineContributors(req.body?.acceptedAuthors);
    /* And the accepted text itself. `contributors` says who drafted SOME of
       this save; this says WHICH words, so the lineage gate can record the
       machine's clauses as the machine's — accepted by this actor — instead
       of as this actor's own assertion. Same closed vocabulary, same boundary:
       an author the server does not name is dropped here. */
    const acceptedMachine = acceptedMachineText(req.body?.acceptedMachineText);
    const tenantId = getTenantId(req);
    const updatedByUser = getActorId(req);
    if (!updatedByUser) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Get current section data for revision
    const currentSection = await pool.query(
      'SELECT id, doc_id, code, title, content, order_index, track_changes, created_at, updated_at, tenant_id FROM authoring_sections WHERE id = $1 AND tenant_id = $2',
      [sectionId, tenantId]
    );

    if (((currentSection.rowCount ?? 0) === 0)) {
      return res.status(404).json({
        success: false,
        error: 'Section not found',
      });
    }

    /* LAST WRITE NO LONGER SILENTLY WINS.
     *
     * This UPDATE was `WHERE id = $n AND tenant_id = $n` and nothing else, and
     * the client sent only `{ content }`. So two authors on one section — the
     * normal case for a CTD module, where a writer and a reviewer work the same
     * §3.2.P.5 at once — ended with whoever saved second replacing the OTHER'S
     * ENTIRE SECTION. No 409, no warning, no merge, no "this changed while you
     * were editing". The overwrite then entered the hash-chained revision
     * ledger as an ordinary authored revision, so the record does not show a
     * collision either; the only way back is for someone to notice and revert.
     *
     * `updated_at` is the concurrency token because it is already on the row
     * the client loaded, already returned by every read, and already bumped by
     * every write — no new column, no new migration, nothing to keep in sync.
     *
     * OPT-IN, deliberately. A client that sends no `expectedUpdatedAt` keeps
     * the old behaviour rather than being refused: several callers (the MDX
     * dossier drawer among them) PATCH sections without having read a
     * timestamp, and failing those closed would break saving to fix a race
     * they cannot hit. The editor sends it; anything that does not is exactly
     * as safe as it was yesterday and no less. */
    const expectedUpdatedAt = req.body?.expectedUpdatedAt;
    if (typeof expectedUpdatedAt === 'string' && expectedUpdatedAt.trim()) {
      const current = currentSection.rows[0]?.updated_at;
      const currentMs = current ? new Date(current).getTime() : NaN;
      const expectedMs = new Date(expectedUpdatedAt).getTime();
      if (Number.isFinite(currentMs) && Number.isFinite(expectedMs) && currentMs !== expectedMs) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'SECTION_CHANGED',
            message:
              'This section was changed by someone else while you were editing. ' +
              'Your text has not been saved and nothing was overwritten — reload the ' +
              'section to see their version, then reapply your changes.',
          },
          /* The caller can show WHEN it moved under them without another read. */
          currentUpdatedAt: current,
        });
      }
    }

    /* ── A SECTION'S CODE IS ITS IDENTITY IN THE FILING ──
     *
     * `commitSectionToFiling` matches `authoring_sections.code` to
     * `c2c_document_sections.section_key`. So changing the code on a BOUND
     * document does not rename anything — it silently re-points the section to
     * a DIFFERENT filing slot (or to none), and the next content save lands
     * there instead, orphaning the old slot's content. Nothing warned; the
     * rename dialog offered the code as a freely editable field.
     *
     * Refused, fail-closed. The title renames freely — that is a label. The
     * code is structure, and re-keying a bound section is not a rename. If a
     * "move this section to another filing slot" operation is ever wanted, it
     * is a deliberate feature with its own rules (is the target occupied? is it
     * in the rule pack?), not a side effect of the rename field. An UNBOUND
     * document has no filing linkage to break, so its codes stay editable. */
    if (code !== undefined && String(code) !== String(currentSection.rows[0].code ?? '')) {
      /* This predicate names c2c_document_id, which a deployment carrying the
         authoring bundle without the c2c one does not have — the same shape the
         create path above already copes with, and which
         commit-section-to-filing.ts treats as a supported deployment rather
         than an error. Unguarded, the catalog raises 42703 and a section
         rename answers 500 on those deployments.

         Each state has a different correct answer, so they are not collapsed:
           present — ask, and lock the code if the document is bound.
           absent  — no document here CAN be bound, so there is no filing
                     linkage to break and the code stays editable, exactly as
                     the comment above says of an unbound document.
           unknown — the check did not run, so whether this document is bound
                     is not known. Refuse. The lock exists to stop a rename
                     silently re-pointing a section to a different filing slot
                     and orphaning the old slot's content; allowing it on an
                     unverified guess risks that, while refusing costs a retry. */
      const columnState = await bindingColumnState();
      if (columnState === 'unknown') {
        return res.status(503).json({
          success: false,
          error: {
            code: 'BINDING_CHECK_UNAVAILABLE',
            message:
              'Whether this section is bound to a filing slot could not be checked, so its code ' +
              'was not changed. Nothing was modified. Try again.',
          },
        });
      }
      const bound =
        columnState === 'present'
          ? await pool.query(
              `SELECT 1 FROM authoring_documents
                WHERE id = $1 AND tenant_id = $2 AND c2c_document_id IS NOT NULL`,
              [currentSection.rows[0].doc_id, tenantId],
            )
          : { rowCount: 0 };
      if ((bound.rowCount ?? 0) > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'CODE_LOCKED_TO_FILING',
            message:
              'This section’s code is its place in the filing, so it cannot be changed here. ' +
              'Re-coding it would break the link between this section and the filing slot it fills, ' +
              'and its content would stop reaching the filing. The title can be renamed freely.',
          },
        });
      }
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 0;
    let recordRevision = false;

    if (content !== undefined) {
      paramCount++;
      updates.push(`content = ${paramCount}`);
      values.push(content);
      recordRevision = true;
    }

    // §11.10(e): a content change carries its reason, checked here rather
    // than trusted from the client, and refused before anything is written.
    let changeReason: string | null = null;
    if (recordRevision) {
      const verdict = requireGovernedReason(req.body?.changeReason);
      if (!verdict.ok) return res.status(400).json({ error: verdict.error, field: 'changeReason' });
      changeReason = verdict.reason;
    }

    if (title !== undefined) {
      paramCount++;
      updates.push(`title = $${paramCount}`);
      values.push(title);
    }

    if (code !== undefined) {
      paramCount++;
      updates.push(`code = $${paramCount}`);
      values.push(code);
    }

    if (track_changes !== undefined) {
      paramCount++;
      updates.push(`track_changes = $${paramCount}`);
      values.push(track_changes);
    }

    // Always update the updated_at timestamp
    updates.push('updated_at = NOW()');

    // Add section_id and tenant_id to values
    values.push(sectionId, tenantId);

    const updateQuery = `
      UPDATE authoring_sections
      SET ${updates.join(', ')}
      WHERE id = $${paramCount + 1} AND tenant_id = $${paramCount + 2}
      RETURNING *
    `;

    // ── One atomic save ───────────────────────────────────────────────────────
    // Revision + section update + lineage + filing commit + audit are ONE atomic
    // unit on ONE connection. Previously the revision and audit writes ran as
    // their own pool commits while the lineage/filing gate ran in a separate
    // transaction, so a failure between them left the trail out of step with the
    // section — or, worse, produced saved text with no provenance and no signal
    // it had happened. A single BEGIN/COMMIT makes all of it land together or not
    // at all; any error rolls the whole thing back and the caller is told. A
    // refused save is recoverable; a document that quietly lost its provenance,
    // its filing commit, or its audit record is not.
    const client = await pool.connect();
    let result: { rows: any[] };
    // Whether the text reached the filing, and when it did not, why. Reported
    // on the response rather than dropped: an unbound save is legitimate, a
    // silently unbound one is how the two stores drifted apart.
    let governedCommit: CommitSectionResult | null = null;
    try {
      await client.query('BEGIN');

      // A revision row means "this content, by this author, as of this time".
      // POST /sections already recorded (new content, author); this makes the
      // edit path agree with it. The prior content is not lost — it is the
      // preceding row. Only when content changed.
      if (recordRevision) {
        /* A save that incorporates accepted machine-authored text is not a
           plain human edit, and saying so is the whole point: the origin marks
           it in the chain hash, the contributor list names who drafted it. */
        await createRevision(
          sectionId,
          content,
          updatedByUser,
          tenantId,
          client,
          contributors.length ? 'ai-draft-accept' : 'human-edit',
          contributors,
        );
      }

      result = await client.query(updateQuery, values);

      // The lineage gate: record an author span per clause and assert coverage,
      // in this transaction, so content and provenance commit together. Empty /
      // undefined content (a metadata-only update) is a no-op inside the helper.
      // req.params is typed `string | string[]`; document_id is the join key
      // every later read depends on, so coerce rather than let an array
      // stringify itself into one.
      await enforceAuthorLineage(
        client,
        tenantId,
        { documentTable: 'authoring_sections', documentId: String(sectionId) },
        content,
        updatedByUser,
        { acceptedMachineText: acceptedMachine },
      );

      // ── Commit the working copy into the filing ─────────────────────────────
      // c2c_documents is the system of record; this store is the editing layer
      // over it. In THIS transaction on purpose: the filing and the working copy
      // move together or neither does, exactly like the lineage gate above.
      // Only when content changed, and only when the document is bound.
      if (content !== undefined) {
        governedCommit = await commitSectionToFiling({
          client,
          sectionId: String(sectionId),
          content: String(content ?? ''),
          actorId: String(updatedByUser),
          tenantId,
          reason: typeof req.body?.changeReason === 'string' ? req.body.changeReason : undefined,
          // Same signal createRevision's `origin` already uses two blocks up.
          // Only the machine-author id is ever written here — never a guessed
          // 'human' for the zero-contributor case, see commit-section-to-filing.ts.
          draftSource: contributors.length > 0 ? contributors[0].id : null,
        });
      }

      // Part 11 change record: operation, actor, before/after content, a SHA-256
      // of each side, reason, IP, user agent, session. Written on the same
      // transaction client so the audit row commits atomically with the edit it
      // records. In production createAuditTrail throws on failure, which rolls
      // the whole edit back rather than committing an un-audited change.
      if (recordRevision) {
        await createAuditTrail(
          req,
          result.rows[0]?.doc_id,
          sectionId,
          'UPDATE',
          currentSection.rows[0].content ?? null,
          content ?? null,
          changeReason,
          { titleChanged: title !== undefined },
          client,
        );
      } else {
        /* A METADATA CHANGE IS STILL A CHANGE TO A GOVERNED RECORD.
         *
         * The audit block above fired only on a content change, so a save that
         * renamed a section, re-coded it, or toggled its track-changes mode
         * updated the row and left NO audit trail at all. Renaming a CTD code
         * is not cosmetic — `commitSectionToFiling` matches a section to its
         * filing slot BY that code — and §11.10(e) wants every change to a
         * governed record recorded with who, when, and what moved.
         *
         * No revision (the revision ledger is for content, and none changed)
         * and no reason prompt (the action names itself, exactly like the
         * revert): the row records the field and its before/after, which is a
         * complete answer to "what changed". It rides the same transaction, so
         * a metadata change and its audit row commit together or neither does —
         * and because it goes through createAuditTrail on the caller's client,
         * it lands in the hash-chained ledger too, not only the soft table. */
        const cur = currentSection.rows[0] ?? {};
        const metaChanges: Array<{ field: string; from: unknown; to: unknown }> = [];
        if (title !== undefined && String(title) !== String(cur.title ?? '')) {
          metaChanges.push({ field: 'title', from: cur.title ?? null, to: title });
        }
        if (code !== undefined && String(code) !== String(cur.code ?? '')) {
          metaChanges.push({ field: 'code', from: cur.code ?? null, to: code });
        }
        if (
          track_changes !== undefined &&
          Boolean(track_changes) !== Boolean(cur.track_changes)
        ) {
          metaChanges.push({
            field: 'track_changes',
            from: Boolean(cur.track_changes),
            to: Boolean(track_changes),
          });
        }
        if (metaChanges.length) {
          const renamed = metaChanges.some((c) => c.field === 'title' || c.field === 'code');
          await createAuditTrail(
            req,
            result.rows[0]?.doc_id,
            sectionId,
            renamed ? 'RENAME' : 'TRACK_CHANGES',
            null,
            null,
            null,
            { source: 'section-metadata', changes: metaChanges },
            client,
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error('Section save refused — content and lineage rolled back together', {
        sectionId,
        tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({
        success: false,
        error: {
          code: 'LINEAGE_REQUIRED',
          message:
            'The section was not saved: its data lineage could not be recorded. ' +
            'Saving content without provenance is not permitted.',
        },
      });
    } finally {
      client.release();
    }

    res.json({
      success: true,
      section: result.rows[0],
      message: 'Section updated successfully',
      revision_created: content !== undefined,
      // Whether the text reached the filing. Present on every content save:
      // an unbound save is legitimate, a silently unbound one is the drift.
      ...(governedCommit
        ? {
            filing: governedCommit.committed
              ? { committed: true, documentId: governedCommit.documentId, sectionKey: governedCommit.sectionKey }
              : { committed: false, reason: governedCommit.reason },
          }
        : {}),
    });
  } catch (error) {
    console.error('Error updating section:', error);
    return serverError(res, logger, 'updating sections', error);
  }
});

// ============= History & Revisions =============

// GET /api/authoring/sections/:sectionId/history - Get revision history
router.get('/sections/:sectionId/history', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { limit = 50 } = req.query;
    const tenantId = getTenantId(req);

    const result = await pool.query(
      `SELECT
        r.id, r.section_id, r.content, r.created_by, r.created_at, r.tenant_id,
        r.content_sha256, r.chain_sha256, r.origin,
        u.name as created_by_name,
        u.email as created_by_email
       FROM doc_revisions r
       -- users.id is a serial (shared/schema.ts, migrations/0000_sweet_joseph.sql)
       -- and doc_revisions.created_by is TEXT holding String(req.user.id). The
       -- previous join was u.id = r.created_by::uuid — integer = uuid, which
       -- Postgres rejects at PARSE time (42883), so this endpoint returned 500
       -- on every call regardless of how many revisions existed, and the client
       -- rendered that failure as "No prior revisions".
       --
       -- Comparing as text is the codebase's established shape for joining a
       -- typed id to a free-text reference column (see the sources ↔ citations
       -- join): it cannot raise 22P02 on a non-numeric created_by, it simply
       -- fails to match and the LEFT JOIN yields a null name.
       LEFT JOIN users u ON u.id::text = r.created_by
       WHERE r.section_id = $1 AND r.tenant_id = $2
       ORDER BY r.created_at DESC
       LIMIT $3`,
      [sectionId, tenantId, limit]
    );

    res.json({
      success: true,
      revisions: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    console.error('Error getting revision history:', error);
    return serverError(res, logger, 'loading history', error);
  }
});

// GET /api/authoring/sections/:sectionId/history/verify — recompute the
// revision ledger. Every verdict is recomputed from stored content; the hash
// columns are treated as claims to check, never as answers. An intact chain
// means: no revision's content was altered after it was written, no link was
// re-pointed, and nothing was appended unchained since the ledger was adopted.
// Rows predating the ledger are reported as pre-ledger, honestly, rather than
// backfilled into an integrity history nobody recorded at the time.
router.get('/sections/:sectionId/history/verify', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const tenantId = getTenantId(req);
    const { rows } = await pool.query(
      `SELECT id, content, created_by, origin, content_sha256, prev_chain_sha256, chain_sha256
         FROM doc_revisions
        WHERE section_id = $1 AND tenant_id = $2
        ORDER BY created_at ASC, id ASC`,
      [sectionId, tenantId]
    );
    const verdict = verifyLedger(rows);
    res.json({ success: true, revisionCount: rows.length, ...verdict });
  } catch (error) {
    console.error('Error verifying revision ledger:', error);
    res.status(500).json({ success: false, error: 'Failed to verify the revision ledger' });
  }
});

// POST /api/authoring/sections/:sectionId/revert - Revert to specific revision
router.post('/sections/:sectionId/revert', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { rev_id } = req.body;
    const tenantId = getTenantId(req);
    const revertedBy = getActorId(req);
    if (!revertedBy) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!rev_id) {
      return res.status(400).json({
        success: false,
        error: 'rev_id is required',
      });
    }

    // Get the revision
    const revResult = await pool.query(
      'SELECT id, section_id, content, created_by, created_at, tenant_id FROM doc_revisions WHERE id = $1 AND section_id = $2 AND tenant_id = $3',
      [rev_id, sectionId, tenantId]
    );

    if (((revResult.rowCount ?? 0) === 0)) {
      return res.status(404).json({
        success: false,
        error: 'Revision not found',
      });
    }

    const revision = revResult.rows[0];

    const currentSection = await pool.query(
      'SELECT content FROM authoring_sections WHERE id = $1 AND tenant_id = $2',
      [sectionId, tenantId]
    );
    if (((currentSection.rowCount ?? 0) === 0)) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    /* Content, its lineage and its ledger entry commit together or not at all
       — the identical rule the interactive save and the AI accept follow.
       Revert was the one content writer left non-transactional AND outside
       the lineage gate, so a reverted section's provenance quietly went stale.
       The restorer IS asserting this content now: author lineage records
       exactly that, and the revision's `origin: 'revert'` records that it was
       a restoration rather than fresh authorship. The section-row lock the
       UPDATE takes also serializes the ledger chain extension. */
    const client = await pool.connect();
    let result: { rows: any[] };
    try {
      await client.query('BEGIN');
      result = await client.query(
        `UPDATE authoring_sections
         SET content = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING *`,
        [revision.content, sectionId, tenantId]
      );
      await enforceAuthorLineage(
        client,
        tenantId,
        { documentTable: 'authoring_sections', documentId: String(sectionId) },
        revision.content ?? '',
        revertedBy,
      );
      // The revert is itself an authored state: this content, restored by this
      // actor, now. Written AFTER the update for the same reason as the edit
      // path, and it replaces a pre-update createRevision that stored the
      // content being replaced under the reverter's name — the same
      // misattribution the edit path had.
      await createRevision(sectionId, revision.content, revertedBy, tenantId, client, 'revert');

      /* AND THE FILING MOVES WITH IT.
       *
       * This call was missing, and its absence reopened on the revert path the
       * exact divergence `commitSectionToFiling` exists to close. Revert wrote
       * the restored text to `authoring_sections` — the working copy — and left
       * `c2c_document_sections`, which is what the filing IS, holding whatever
       * the last PATCH had put there.
       *
       * So an author who reverted a bad edit saw the good text in the editor,
       * the revision ledger recorded the restoration, the audit trail recorded
       * a REVERT, and the filed document still contained the bad text. Every
       * record agreed a revert had happened and the one artifact that matters
       * disagreed — and nothing surfaced the disagreement, because each store
       * was internally consistent.
       *
       * The reason is stated rather than defaulted, and that is not the
       * fabrication REASON_NOT_STATED guards against: on an ordinary save the
       * system does not know why a human changed the words, so it must not
       * invent one. Here it does know — this is a restoration of a named
       * revision, which is a complete and truthful answer to "why did this
       * change". A mechanism describing itself is not a person being
       * impersonated. */
      await commitSectionToFiling({
        client,
        sectionId: String(sectionId),
        content: String(revision.content ?? ''),
        actorId: String(revertedBy),
        tenantId,
        reason: `Reverted to revision ${rev_id}`,
      });

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    await createAuditTrail(
      req,
      result.rows[0]?.doc_id,
      sectionId,
      'REVERT',
      currentSection.rows[0]?.content ?? null,
      revision.content ?? null,
      `Reverted to revision ${rev_id}`,
      { revisionId: rev_id, revisionCreatedAt: revision.created_at },
    );

    res.json({
      success: true,
      section: result.rows[0],
      message: `Section reverted to revision ${rev_id}`,
      reverted_from: revision.created_at,
    });
  } catch (error) {
    console.error('Error reverting section:', error);
    return serverError(res, logger, 'saving revert', error);
  }
});

// ============= Comments & Review =============

// POST /api/authoring/sections/:sectionId/comment - Add comment
// THE comment-creation endpoint. There used to be two: this one, which the
// editor calls (DocumentAuthoring.tsx:471), and a `POST /comments` that wrote
// the same table with a fuller row — author name and email, threading parent,
// anchor position — and then INSERTed into a `authoring_comment_activity`
// table that no migration creates, so it 500'd after the comment had already
// been written. Nothing called it.
//
// The duplicate is gone and its capability moved here rather than being
// dropped with it: the read path GET /documents/:id/comments selects
// user_name, user_email, parent_comment_id and position_data, and renders
// `COALESCE(c.user_name, c.created_by) AS author_name` — so with only the thin
// write, every comment in the UI was attributed to a raw actor id and no reply
// could ever be threaded.
router.post('/sections/:sectionId/comment', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { body, anchor, doc_id, parent_comment_id, position_data } = req.body;
    const tenantId = getTenantId(req);
    const commentId = crypto.randomUUID();
    // Identity from the VERIFIED JWT only — never from a header or the body.
    const createdBy = getActorId(req);
    if (!createdBy) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const userEmail = req.user?.email ?? null;
    const userName = userEmail || createdBy;

    if (!body) {
      return res.status(400).json({
        success: false,
        error: 'Comment body is required',
      });
    }

    // The section must belong to this tenant before anything is attached to
    // it. The comment row itself always carried the caller's tenant_id (reads
    // stayed scoped), but without this check a comment could be pinned to a
    // foreign section UUID — and 201-vs-500 confirmed foreign ids.
    const sectionOwned = await pool.query(
      'SELECT id FROM authoring_sections WHERE id = $1 AND tenant_id = $2',
      [sectionId, tenantId]
    );
    if (((sectionOwned.rowCount ?? 0) === 0)) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    const result = await pool.query(
      `INSERT INTO authoring_comments
       (id, section_id, doc_id, body, anchor, status, created_by, user_name, user_email,
        parent_comment_id, position_data, created_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, NOW(), $11)
       RETURNING *`,
      [
        commentId,
        sectionId,
        doc_id,
        body,
        anchor,
        createdBy,
        userName,
        userEmail,
        parent_comment_id ?? null,
        position_data ?? null,
        tenantId,
      ]
    );

    await createAuditEvent(
      doc_id,
      parent_comment_id ? 'reply_added' : 'comment_added',
      userName,
      { comment_id: commentId, section_id: sectionId, anchor },
      tenantId
    );

    res.status(201).json({
      success: true,
      comment: result.rows[0],
      message: 'Comment added successfully',
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    return serverError(res, logger, 'saving comment', error);
  }
});

// PATCH /api/authoring/comments/:commentId - Update comment status
router.patch('/comments/:commentId', async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const { status, resolution_note } = req.body;
    const tenantId = getTenantId(req);
    const resolvedBy = getActorId(req);
    if (!resolvedBy) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const validStatuses = ['open', 'resolved', 'dismissed', 'in_review'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const updates = [];
    const values = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(status);

      if (status === 'resolved') {
        paramCount++;
        updates.push(`resolved_at = NOW(), resolved_by = $${paramCount}`);
        // The same principal convention comment CREATION records (user_name =
        // verified email, falling back to the actor id): the rail displays
        // this value, and "Resolved by 1" is an attribution no reader can use.
        // Still JWT-sourced either way — never a header, never the body.
        values.push(req.user?.email ?? resolvedBy);
        // The resolution RECORD is this resolution's, whole: a re-resolve
        // without a stated reason must not display the PREVIOUS resolver's
        // note under the new resolver's name. The prior resolution stays in
        // the audit ledger; the row carries only the current one.
        paramCount++;
        updates.push(`resolution_note = $${paramCount}`);
        values.push(resolution_note || null);
      } else if (status === 'open') {
        // Reopen clears the resolution fields — the row reflects CURRENT
        // state ("this thread is open"), and the who/when/why of the earlier
        // resolution lives in the audit trail, not on an open thread.
        updates.push('resolved_at = NULL, resolved_by = NULL, resolution_note = NULL');
      }
    } else if (resolution_note) {
      paramCount++;
      updates.push(`resolution_note = $${paramCount}`);
      values.push(resolution_note);
    }

    if (updates.length === 0) {
      // An empty body used to build `SET  WHERE id = $1` — malformed SQL
      // answered as a 500 with the driver's message in the payload.
      return res.status(400).json({ success: false, error: 'No comment changes supplied' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const before = await client.query(
        `SELECT doc_id, section_id, status, resolution_note
           FROM authoring_comments
          WHERE id = $1 AND tenant_id = $2
          FOR UPDATE`,
        [commentId, tenantId]
      );
      if (((before.rowCount ?? 0) === 0)) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Comment not found' });
      }

      values.push(commentId, tenantId);
      const result = await client.query(
        `UPDATE authoring_comments
            SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $${paramCount + 1} AND tenant_id = $${paramCount + 2}
          RETURNING *`,
        values
      );

      const updated = result.rows[0];
      const eventType = status === 'resolved' ? 'comment_resolved' : 'comment_updated';
      const actor = req.user?.email ?? resolvedBy;
      await createAuditEvent(
        updated.doc_id,
        eventType,
        actor,
        {
          comment_id: commentId,
          section_id: updated.section_id,
          previous_status: before.rows[0].status,
          status: updated.status,
          previous_resolution_note: before.rows[0].resolution_note ?? null,
          resolution_note: updated.resolution_note ?? null,
        },
        tenantId,
        client
      );

      await client.query('COMMIT');
      res.json({
        success: true,
        comment: updated,
        message: 'Comment updated successfully',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating comment:', error);
    return serverError(res, logger, 'updating comments', error);
  }
});

// ============= Citations & Data Tokens =============

// POST /api/authoring/sections/:sectionId/cite - Add citation
router.post('/sections/:sectionId/cite', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { source, anchor, citation_text, reference_id } = req.body;
    const tenantId = getTenantId(req);
    const citationId = crypto.randomUUID();
    const createdBy = getActorId(req);
    if (!createdBy) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!source) {
      return res.status(400).json({
        success: false,
        error: 'Citation source is required',
      });
    }

    const result = await pool.query(
      `INSERT INTO authoring_citations
       (id, section_id, source, anchor, citation_text, reference_id, created_by, created_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
       RETURNING *`,
      [citationId, sectionId, source, anchor, citation_text, reference_id, createdBy, tenantId]
    );

    res.status(201).json({
      success: true,
      citation: result.rows[0],
      message: 'Citation added successfully',
    });
  } catch (error) {
    console.error('Error adding citation:', error);
    return serverError(res, logger, 'saving cite', error);
  }
});

// ── Canonical source citations ─────────────────────────────────────────────
// The Data Room holds canonical source identities; these endpoints are how a
// section records which of them it was drafted from, and how that record is read
// back. They go through source-usage.service so the convention
// (source = 'cre_evidence_source', reference_id = the source id,
// payload_sha256 = the source's checksum at cite time) is enforced server-side
// rather than trusted from the request body — POST /cite above takes `source` as
// free text, which is why nothing could ever be read back by source id.

// GET /api/authoring/sections/:sectionId/sources — what this section is written from
router.get('/sections/:sectionId/sources', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { listSectionSources } = await import(
      '../services/clinical-regulatory-evidence/source-usage.service.js'
    );
    const usages = await listSectionSources(tenantId, String(req.params.sectionId));
    res.json({ success: true, sectionId: String(req.params.sectionId), sources: usages });
  } catch (error) {
    console.error('GET /sections/:sectionId/sources', error);
    res.status(500).json({ success: false, error: 'Failed to load section sources' });
  }
});

// POST /api/authoring/sections/:sectionId/cite-source — record a source citation
router.post('/sections/:sectionId/cite-source', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const createdBy = getActorId(req);
    if (!createdBy) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { citeSource, SourceUsageError } = await import(
      '../services/clinical-regulatory-evidence/source-usage.service.js'
    );
    try {
      const result = await citeSource(tenantId, {
        sectionId: String(req.params.sectionId),
        sourceId: req.body?.source_id,
        citationText: req.body?.citation_text ?? null,
        anchor: req.body?.anchor ?? null,
        createdBy,
      });
      // 201 on a new citation, 200 on re-resolve — the caller can tell whether it
      // added a source or refreshed one the section already had.
      return res.status(result.created ? 201 : 200).json({ success: true, ...result });
    } catch (e) {
      if (e instanceof SourceUsageError) {
        return res.status(400).json({ success: false, error: e.message });
      }
      throw e;
    }
  } catch (error) {
    console.error('POST /sections/:sectionId/cite-source', error);
    res.status(500).json({ success: false, error: 'Failed to record the source citation' });
  }
});

// DELETE /api/authoring/sections/:sectionId/cite-source/:sourceId — stop citing it
router.delete('/sections/:sectionId/cite-source/:sourceId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { removeSourceCitation } = await import(
      '../services/clinical-regulatory-evidence/source-usage.service.js'
    );
    const removed = await removeSourceCitation(
      tenantId,
      String(req.params.sectionId),
      String(req.params.sourceId),
    );
    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'No removable citation of that source on this section (a frozen citation is immutable)',
      });
    }
    res.json({ success: true, removed: true });
  } catch (error) {
    console.error('DELETE /sections/:sectionId/cite-source/:sourceId', error);
    res.status(500).json({ success: false, error: 'Failed to remove the source citation' });
  }
});

// GET /api/authoring/sections/:sectionId/citations - Get all citations
router.get('/sections/:sectionId/citations', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const tenantId = getTenantId(req);

    const result = await pool.query(
      `SELECT id, section_id, source, anchor, citation_text, reference_id, created_by, created_at, tenant_id, payload_sha256, frozen_at FROM authoring_citations
       WHERE section_id = $1 AND tenant_id = $2
       ORDER BY created_at`,
      [sectionId, tenantId]
    );

    res.json({
      success: true,
      citations: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    console.error('Error getting citations:', error);
    return serverError(res, logger, 'loading citations', error);
  }
});

// ============= Comments and Reviews =============

// GET /api/authoring/documents/:id/comments - Get all comments for document
router.get('/documents/:id/comments', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId(req);
    const { status, author, includeReplies = 'true' } = req.query;

    let query = `
      SELECT
        c.id, c.doc_id, c.section_id, c.body, c.anchor, c.status, c.created_by, c.user_name, c.user_email, c.parent_comment_id, c.position_data, c.resolution_note, c.resolved_by, c.resolved_at, c.created_at, c.updated_at, c.tenant_id,
        COALESCE(c.user_name, c.created_by) as author_name,
        c.user_email as author_email,
        COUNT(DISTINCT r.id) as reply_count,
        s.code as section_code,
        s.title as section_title
      FROM authoring_comments c
      LEFT JOIN authoring_sections s ON c.section_id = s.id
      LEFT JOIN authoring_comments r ON r.parent_comment_id = c.id
      WHERE c.doc_id = $1 AND c.tenant_id = $2
    `;

    const params: any[] = [id, tenantId];
    let paramIndex = 3;

    if (status) {
      query += ` AND c.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (author) {
      query += ` AND c.created_by = $${paramIndex}`;
      params.push(author);
      paramIndex++;
    }

    // Only get top-level comments by default
    if (includeReplies === 'false') {
      query += ` AND c.parent_comment_id IS NULL`;
    }

    query += ` GROUP BY c.id, s.code, s.title ORDER BY c.created_at DESC`;

    const result = await pool.query(query, params);

    // If includeReplies is true, fetch replies for each comment
    let comments = result.rows;
    if (includeReplies === 'true') {
      for (const comment of comments) {
        if (!comment.parent_comment_id) {
          const repliesResult = await pool.query(
            `SELECT
              c.id, c.doc_id, c.section_id, c.body, c.anchor, c.status, c.created_by, c.user_name, c.user_email, c.parent_comment_id, c.position_data, c.resolution_note, c.resolved_by, c.resolved_at, c.created_at, c.updated_at, c.tenant_id,
              COALESCE(c.user_name, c.created_by) as author_name,
              c.user_email as author_email
             FROM authoring_comments c
             WHERE c.parent_comment_id = $1 AND c.tenant_id = $2
             ORDER BY c.created_at ASC`,
            [comment.id, tenantId]
          );
          comment.replies = repliesResult.rows;
        }
      }
      // Filter out replies from top level
      comments = comments.filter(c => !c.parent_comment_id);
    }

    res.json({
      success: true,
      comments,
      total: comments.length,
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return serverError(res, logger, 'loading comments', error);
  }
});

/* PUT /comments/:id and DELETE /comments/:id are DELETED, not moved. Neither
 * was reachable from the client (the rail's only status writer is
 * PATCH /comments/:id), and both let any authenticated tenant member rewrite
 * or hard-delete ANY user's review comment: the PUT updated `body` in place
 * with no prior-text capture anywhere (the audit event logged that an edit
 * happened, never what changed), and the DELETE removed the row and its
 * replies for good with only the comment id in the ledger — the reviewer's
 * actual words unrecoverable even from the audit trail. Review history is
 * immutable here: threads are resolved or reopened through PATCH (verified
 * resolver, resolved_at, note kept), never rewritten, never erased. If
 * retraction is ever wanted, it is a tombstone that retains and renders the
 * original content as retracted — a new capability, not these routes. */

// GET /api/authoring/documents/:id/reviews - Get review status
router.get('/documents/:id/reviews', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId(req);

    const result = await pool.query(
      `SELECT id, doc_id, reviewer_id, reviewer_name, reviewer_email, review_status, review_comments, reviewed_at, requested_at, requested_by, created_at, updated_at, tenant_id FROM authoring_reviews
       WHERE doc_id = $1 AND tenant_id = $2
       ORDER BY requested_at DESC`,
      [id, tenantId]
    );

    const stats = {
      total: result.rowCount,
      pending: result.rows.filter(r => r.review_status === 'pending').length,
      approved: result.rows.filter(r => r.review_status === 'approved').length,
      rejected: result.rows.filter(r => r.review_status === 'rejected').length,
      changes_requested: result.rows.filter(r => r.review_status === 'changes_requested').length,
    };

    res.json({
      success: true,
      reviews: result.rows,
      stats,
      canApprove: stats.pending === 0 && stats.rejected === 0 && stats.changes_requested === 0,
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return serverError(res, logger, 'loading reviews', error);
  }
});

// POST /api/authoring/documents/:id/review - Submit review
router.post('/documents/:id/review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { review_status, review_comments } = req.body;
    if (!['approved', 'rejected', 'changes_requested'].includes(review_status)) {
      return res.status(400).json({ success: false, error: 'review_status must be approved, rejected or changes_requested' });
    }
    // §11.10(e): a change request or a rejection carries the reason the author
    // acts on; an approval may carry one. Checked here, not only in Review.tsx.
    const commentsVerdict = review_status === 'approved'
      ? optionalGovernedReason(review_comments)
      : requireGovernedReason(review_comments);
    if (!commentsVerdict.ok) return res.status(400).json({ success: false, error: commentsVerdict.error, field: 'review_comments' });
    const reviewComments = commentsVerdict.reason;
    const tenantId = getTenantId(req);
    // SECURITY (21 CFR Part 11): reviewer identity must come from the verified
    // JWT, never from headers / req.body — a review sign-off cannot be
    // attributed to another user.
    const reviewerId = getActorId(req);
    if (!reviewerId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const reviewerEmail = req.user?.email ?? null;
    const reviewerName = reviewerEmail || reviewerId;

    // Check if reviewer already has a review
    const existingReview = await pool.query(
      `SELECT id FROM authoring_reviews
       WHERE doc_id = $1 AND reviewer_id = $2 AND tenant_id = $3`,
      [id, reviewerId, tenantId]
    );

    let result;
    if (((existingReview.rowCount ?? 0) > 0)) {
      // Update existing review
      result = await pool.query(
        `UPDATE authoring_reviews
         SET review_status = $1, review_comments = $2, reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4
         RETURNING *`,
        [review_status, reviewComments, existingReview.rows[0].id, tenantId]
      );
    } else {
      // Create new review
      const reviewId = crypto.randomUUID();
      result = await pool.query(
        `INSERT INTO authoring_reviews
         (id, doc_id, reviewer_id, reviewer_name, reviewer_email, review_status, review_comments, reviewed_at, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, NOW())
         RETURNING *`,
        [
          reviewId,
          id,
          reviewerId,
          reviewerName,
          reviewerEmail,
          review_status,
          reviewComments,
          tenantId,
        ]
      );
    }

    // Create audit event
    await createAuditEvent(
      id,
      'document_reviewed',
      reviewerName,
      { review_status, review_comments },
      tenantId
    );

    res.json({
      success: true,
      review: result.rows[0],
      message: `Document ${review_status.replace('_', ' ')} successfully`,
    });
  } catch (error) {
    console.error('Error submitting review:', error);
    return serverError(res, logger, 'saving review', error);
  }
});

// POST /api/authoring/documents/:id/request-review - Request review from users
router.post('/documents/:id/request-review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reviewers } = req.body; // Array of { id, name, email }
    const tenantId = getTenantId(req);
    // SECURITY (21 CFR Part 11): who requested the review is attribution, and
    // attribution comes from the verified JWT — never `x-user-name`, which the
    // caller sets. The sibling submit-review handler was hardened this way; this
    // one kept the header, and it only stayed harmless because the table did not
    // exist. Making the endpoint work without fixing this would ship the defect.
    const requestedBy = req.user?.email ?? getActorId(req);
    if (!requestedBy) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!Array.isArray(reviewers) || reviewers.length === 0) {
      return res.status(400).json({ success: false, error: 'reviewers must be a non-empty array' });
    }

    const createdReviews = [];
    for (const reviewer of reviewers) {
      const reviewId = crypto.randomUUID();
      const result = await pool.query(
        `INSERT INTO authoring_reviews
         (id, doc_id, reviewer_id, reviewer_name, reviewer_email, review_status, requested_by, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW())
         ON CONFLICT (doc_id, reviewer_id, tenant_id)
         DO UPDATE SET requested_at = NOW(), requested_by = $6
         RETURNING *`,
        [reviewId, id, reviewer.id, reviewer.name, reviewer.email, requestedBy, tenantId]
      );
      createdReviews.push(result.rows[0]);
    }

    res.json({
      success: true,
      reviews: createdReviews,
      message: `Review requested from ${reviewers.length} reviewer(s)`,
    });
  } catch (error) {
    console.error('Error requesting review:', error);
    return serverError(res, logger, 'saving request review', error);
  }
});

// ============= AI Integration =============

// POST /api/authoring/sections/:sectionId/ai/draft - Generate AI draft
router.post('/sections/:sectionId/ai/draft', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { tone = 'professional', region = 'FDA', context, requirements } = req.body;
    const tenantId = getTenantId(req);

    // Get section details
    const sectionResult = await pool.query(
      `SELECT s.id, s.doc_id, s.code, s.title, s.content, s.order_index, s.track_changes, s.created_at, s.updated_at, s.tenant_id, d.module, d.product_code
       FROM authoring_sections s
       JOIN authoring_documents d ON d.id = s.doc_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [sectionId, tenantId]
    );

    if (((sectionResult.rowCount ?? 0) === 0)) {
      return res.status(404).json({
        success: false,
        error: 'Section not found',
      });
    }

    const section = sectionResult.rows[0];

    // ── Retrieve Data Room evidence for section context ───────────────
    let evidenceBlock = '';
    let sourcesRetrieved = 0;
    /** Whether Data Room retrieval ran, and what it found. 'empty' (ran, found
     *  nothing) and 'failed' (did not run to completion) are different facts
     *  and only one of them says anything about the corpus. */
    let retrievalStatus: 'ok' | 'empty' | 'failed' = 'empty';
    let retrievalError: string | null = null;
    // The chunks this draft is retrieved from, captured so the accept endpoint can
    // record verified source spans against them (source-attribution Phase 3). Each
    // carries the raw lumen_data_atoms.source_id that searchHybrid now returns
    // (#1285); it is resolved to a canonical cre_evidence_sources.id below — at the
    // generation boundary, which holds the numeric orgId the resolver needs. Read
    // defensively (best-effort): a build without the retrieval enrichment simply
    // leaves sourceId null and the draft is still attributed honestly (all author).
    const retrievedChunks: Array<{ content: string; title: string; sourceId: string | null }> = [];
    try {
      const { getEmbeddingService } = await import('../services/enhancedEmbeddingService.js');
      const embeddingService = getEmbeddingService(pool);
      const searchQuery = `${section.module} ${section.code} ${section.title} ${
        section.product_code || ''
      }`.trim();
      // The session's tenant key. This search used to pass none, so it ranked
      // every tenant's Data Room atoms wherever RLS was not filtering — a CTD
      // section draft could cite another sponsor's evidence. No key is a failed
      // retrieval, reported as one below, never an unscoped search.
      const orgUuid = await currentTenantOrgUuid(pool);
      if (!orgUuid) throw new TenantKeyRequiredError('no tenant key for this session');
      const searchResults = await embeddingService.searchHybrid(searchQuery, 5, 0.65, orgUuid);
      if (searchResults.length > 0) {
        sourcesRetrieved = searchResults.length;
        for (const r of searchResults as any[]) {
          retrievedChunks.push({
            content: typeof r.content === 'string' ? r.content : '',
            title: typeof r.title === 'string' ? r.title : '',
            sourceId: typeof r.sourceId === 'string' ? r.sourceId : null,
          });
        }
        evidenceBlock =
          '\n\n--- RETRIEVED EVIDENCE FROM DATA ROOM (cite as [SRC-n]) ---\n' +
          searchResults
            .map((r: any, i: number) => {
              const content =
                r.content.length > 600 ? r.content.substring(0, 600) + '…' : r.content;
              return `[SRC-${i + 1}] "${r.title}"\n${content}`;
            })
            .join('\n\n') +
          '\n--- END EVIDENCE ---\n\n' +
          'Record which sources you used ONLY through the structured "attributions" ' +
          'field requested below — do NOT put [SRC-n] markers in the drafted prose, ' +
          'and never cite a source not shown above.';
        retrievalStatus = 'ok';
      } else {
        // Retrieval RAN and the corpus had nothing above threshold. Distinct
        // from a failure: here we know there is no evidence, which is itself a
        // fact about the Data Room.
        retrievalStatus = 'empty';
      }
    } catch (e: any) {
      /* A failed retrieval used to warn to the console and continue, leaving
         `sourcesRetrieved = 0` — indistinguishable from "the corpus had
         nothing". The model then drafted with no evidence block and the
         response said "AI draft generated successfully". So the one case where
         a reviewer most needs to know the draft is ungrounded looked exactly
         like the ordinary case. Recorded and reported instead. */
      retrievalStatus = 'failed';
      retrievalError = e?.message ? String(e.message).slice(0, 300) : 'unknown error';
      console.warn('[Authoring] Data Room retrieval failed (non-fatal):', retrievalError);
    }

    // ── Generate with the AI gateway. There is no other source of a draft. ──
    //
    // This route used to fall through to a hardcoded section skeleton when no
    // provider was enabled or the model call failed, answering HTTP 200
    // `success:false, degraded:true, source:'template'` with a full template
    // body — and the client rendered it as a draft (VSR-001 §8 F-10). A
    // deployment with no enabled provider is refused with 503
    // GATEWAY_UNAVAILABLE, the same code AnA answers with, and NO draft body;
    // a gateway failure is refused with its own classified code; a fault of
    // ours is a 500. Nothing on this path fabricates content (URS-AUTH-012;
    // working agreement: fail closed, never fabricate).
    const { getGateway } = await import('../services/ai-gateway/gateway.js');
    const { GATEWAY_ERROR_HTTP_STATUS, classifyGatewayError, isGatewayError } = await import(
      '../services/ai-gateway/gateway-error-map.js'
    );
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      logger.warn('ai/draft refused: no AI provider is enabled on the gateway', { sectionId });
      return res.status(503).json({
        success: false,
        error: {
          code: 'GATEWAY_UNAVAILABLE',
          message:
            'No AI provider is configured for this deployment, so this section cannot be drafted. Nothing was changed.',
        },
      });
    }

    const prompt = `Generate professional ${region} regulatory content for:
Module: ${section.module}
Section: ${section.code} - ${section.title}
Product: ${section.product_code || 'Medical Product'}
Tone: ${tone}
${context ? `Context: ${context}` : ''}
${requirements ? `Requirements: ${requirements}` : ''}
${evidenceBlock}

Return ONLY a JSON object of this exact shape:
{"content": "<the drafted section as clean prose>", "attributions": [{"quote": "<a sentence copied verbatim from content>", "src": <the SRC number>}]}
- "content" is the full section a reviewer reads — do NOT put [SRC-n] markers in it.
- Add one "attributions" entry for each sentence you DERIVED from a provided [SRC-n] source: "quote" copied EXACTLY from "content", "src" the integer n.
- Omit sentences that are your own analysis or not based on a provided source. Never cite a src not shown above.
Provide detailed, compliance-ready content following ${region} guidelines.`;

    let gwResponse: Awaited<ReturnType<typeof gw.route>>;
    try {
      gwResponse = await gw.route({
        taskType: 'document_drafting',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 3000,
        temperature: 0.3,
        // Structured envelope so the model can report which sentences it derived
        // from which source (source-attribution Phase 4). On the default
        // Anthropic provider jsonMode is prompt-instructed; the parse below is
        // tolerant and degrades to plain prose so a malformed response can never
        // break drafting.
        jsonMode: true,
        callerModule: 'authoring-router/generate-draft',
      });
    } catch (aiError) {
      /* A gateway refusal (rate limit, overload, too large, no provider that
         could serve it) answers with its classified code and status; a fault of
         ours is a 500. Neither ever answers with content. */
      if (isGatewayError(aiError)) {
        const { code, message } = classifyGatewayError(aiError);
        logger.warn('ai/draft refused: the AI gateway declined the request', { code, sectionId });
        return res
          .status(GATEWAY_ERROR_HTTP_STATUS[code])
          .json({ success: false, error: { code, message } });
      }
      return serverError(res, logger, 'drafting AI', aiError);
    }

    // Parse the structured envelope tolerantly. On ANY shortfall the whole
    // response becomes the draft with no attributions — the draft still lands
    // and is attributed by verified quotes + author lineage (Phase 3).
    // Structured paraphrase is additive; it must never break drafting. The
    // parser is pure and lives in authoring-draft-envelope.ts so the malformed
    // shapes it has to survive are unit-testable without the route.
    const { content: generatedContent, attributions: modelAttributions } =
      parseDraftEnvelope(gwResponse.content);
    if (!generatedContent) {
      /* The provider answered and said nothing usable. That is not a draft and
         it is not an outage; it is refused as an invalid response. */
      logger.warn('ai/draft refused: the provider returned no draft content', {
        sectionId,
        model: gwResponse.model ?? null,
      });
      return res.status(GATEWAY_ERROR_HTTP_STATUS.INVALID_AI_RESPONSE).json({
        success: false,
        error: {
          code: 'INVALID_AI_RESPONSE',
          message:
            'The AI provider returned no draft content, so nothing was drafted. Nothing was changed.',
        },
      });
    }
    // Park the draft + the sources it came from so the accept endpoint can
    // record verified span-level source lineage (Phase 3). Best-effort:
    // attribution prep must never break drafting, so any failure just omits
    // draftId and the client falls back to a plain save (author lineage).
    let draftId: string | undefined;
    let attributableSources = 0;
    try {
      const rawSourceIds = [
        ...new Set(
          retrievedChunks
            .map((c) => c.sourceId)
            .filter((s): s is string => typeof s === 'string' && s.length > 0),
        ),
      ];
      let evidenceByRaw = new Map<string, number>();
      if (rawSourceIds.length > 0) {
        const { resolveEvidenceSourceIdsByArtifact } = await import(
          '../services/clinical-regulatory-evidence/retrieval-source-link.js'
        );
        // tenantId is the numeric org id (getTenantId → authedOrgId), exactly
        // what the resolver and the lineage writers require.
        evidenceByRaw = await resolveEvidenceSourceIdsByArtifact(tenantId, rawSourceIds);
      }
      const candidateSources = retrievedChunks
        .filter((c) => c.sourceId && evidenceByRaw.has(c.sourceId))
        .map((c) => ({
          evidenceSourceId: evidenceByRaw.get(c.sourceId as string) as number,
          content: c.content,
          title: c.title || null,
        }));
      attributableSources = new Set(candidateSources.map((s) => s.evidenceSourceId)).size;

      // Resolve the model's [SRC-n] paraphrase claims to canonical source
      // ids. SRC-n is the 1-based position in retrievedChunks (the order the
      // evidence block showed the model); keep only a claim whose chunk
      // resolved to a canonical cre_evidence_sources.id — an unresolved or
      // out-of-range src is dropped, never guessed at. The accept gate
      // re-checks each id is one that was retrieved before recording it.
      const assertions = modelAttributions
        .map((a) => {
          const chunk = retrievedChunks[a.src - 1];
          const esid = chunk && chunk.sourceId ? evidenceByRaw.get(chunk.sourceId) : undefined;
          return esid && a.quote.trim() ? { quote: a.quote, sourceId: esid } : null;
        })
        .filter((x): x is { quote: string; sourceId: number } => x !== null);

      const { createDraftCandidate } = await import(
        '../services/clinical-regulatory-evidence/draft-candidate-store.js'
      );
      const candidate = await createDraftCandidate(
        tenantId,
        String(sectionId),
        generatedContent,
        candidateSources,
        getActorId(req),
        undefined,
        /* What produced this draft, parked with the source chunks rather
           than round-tripped through the client — "which model wrote
           this" must not be a forgeable claim. The prompt is composed
           inline here, so there is no version to name and a digest of
           the bytes actually sent is the honest identifier. */
        {
          model: gwResponse.model ?? null,
          provider: gwResponse.provider ?? null,
          promptSha256: crypto.createHash('sha256').update(prompt).digest('hex'),
          generatedAt: new Date().toISOString(),
        },
        assertions,
      );
      draftId = candidate.id;
    } catch (attrErr: any) {
      console.warn(
        '[Authoring] draft-candidate creation failed (non-fatal):',
        attrErr?.message,
      );
    }

    return res.json({
      success: true,
      /* The only source a draft can have. Declared so a reader of the envelope
         never has to infer from the absence of a `degraded` flag. */
      source: 'model',
      draft: {
        content: generatedContent,
        // Present when the draft was parked for attributed acceptance; POST
        // …/ai/draft/accept with this id records source + author lineage.
        draftId,
        metadata: {
          tone,
          region,
          generated_at: new Date().toISOString(),
          model: gwResponse.model,
          provider: gwResponse.provider,
          source: 'model',
          sourcesRetrieved,
          attributableSources,
          /* Carried so a reader can tell an ungrounded draft from a
             grounded one, and a retrieval outage from an empty corpus. */
          retrievalStatus,
          retrievalError,
        },
      },
      message:
        sourcesRetrieved > 0
          ? `AI draft generated with ${sourcesRetrieved} Data Room source${
              sourcesRetrieved !== 1 ? 's' : ''
            }`
          : retrievalStatus === 'failed'
            ? 'AI draft generated WITHOUT Data Room evidence — retrieval failed, so this draft is ungrounded and its claims are unverified'
            : 'AI draft generated with no Data Room sources above the relevance threshold',
    });
  } catch (error) {
    console.error('Error generating AI draft:', error);
    return serverError(res, logger, 'drafting AI', error);
  }
});

// POST /api/authoring/sections/:sectionId/ai/draft/accept - Adopt an AI draft as
// section content AND record span-level source + author lineage, atomically.
//
// This is the persistence point automated source attribution needs: the draft's
// retrieved chunks (parked by POST …/ai/draft) and the accepted text are both in
// hand here, so verified quotes can be recorded against the exact sources the
// draft came from, in the SAME transaction as the content. The save fails closed
// if lineage cannot be recorded — exactly like the manual save gate on
// PATCH /sections/:id. See docs/architecture/SOURCE_ATTRIBUTION_AUTOMATED_DESIGN.md
// Phase 3.
router.post('/sections/:sectionId/ai/draft/accept', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { draftId } = req.body ?? {};
    const tenantId = getTenantId(req);
    const actor = getActorId(req);
    if (!actor) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!draftId || typeof draftId !== 'string') {
      return res.status(400).json({ success: false, error: 'draftId is required' });
    }

    // Section must exist and belong to this tenant.
    const sectionResult = await pool.query(
      `SELECT id, doc_id, content FROM authoring_sections WHERE id = $1 AND tenant_id = $2`,
      [sectionId, tenantId],
    );
    if ((sectionResult.rowCount ?? 0) === 0) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    const priorContent: string | null = sectionResult.rows[0].content ?? null;

    const { consumeDraftCandidate } = await import(
      '../services/clinical-regulatory-evidence/draft-candidate-store.js'
    );
    const { enforceSourceAndAuthorLineage } = await import(
      '../services/clinical-regulatory-evidence/lineage-gate.js'
    );

    // Content, its source citations and its author spans commit together or not at
    // all — the same one-connection transaction + gate the manual save uses. The
    // candidate is claimed INSIDE the transaction (single-use), so a rolled-back
    // accept leaves it available for a retry.
    const client = await pool.connect();
    let saved: { rows: any[] } = { rows: [] };
    let acceptedContent = '';
    let attribution = { sourceSpans: 0, authorSpans: 0, distinctSources: 0, coverage: 0 };
    /* Held for the audit entry below. The candidate row is claimed with
       DELETE … RETURNING, so this is the last moment the generator exists
       anywhere — after the transaction it lives only in what we record. */
    let generator: Record<string, unknown> | null = null;
    /* Whether the caller's accepted text still IS the generated draft. */
    let draftModifiedOnAccept = false;
    /* Whether the accepted content reached the bound filing, and when it did
       not, why — surfaced on the response exactly as the manual save does. */
    let governedCommit: CommitSectionResult | null = null;
    try {
      await client.query('BEGIN');

      const candidate = await consumeDraftCandidate(tenantId, String(sectionId), draftId, client);
      if (!candidate) {
        await client.query('ROLLBACK').catch(() => {});
        return res.status(410).json({
          success: false,
          error: {
            code: 'DRAFT_EXPIRED',
            message:
              'This AI draft has expired or was already accepted. Regenerate the draft and try again.',
          },
        });
      }
      generator = candidate.generator as Record<string, unknown> | null;

      // The author may have edited the draft before accepting; attribute what they
      // actually save. Fall back to the draft as generated when no edit is sent.
      // Whether the accepted text still IS the generated draft is recorded on
      // the audit row (draft_modified_on_accept below): "accepted AI draft"
      // must not vouch for words the model never produced.
      acceptedContent =
        typeof req.body?.content === 'string' ? req.body.content : candidate.content;
      draftModifiedOnAccept = acceptedContent !== candidate.content;

      saved = await client.query(
        `UPDATE authoring_sections SET content = $1, updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3 RETURNING *`,
        [acceptedContent, sectionId, tenantId],
      );

      const sources = candidate.sources.map((s) => ({
        sourceId: s.evidenceSourceId,
        content: s.content,
        title: s.title,
      }));
      attribution = await enforceSourceAndAuthorLineage(
        client,
        tenantId,
        { documentTable: 'authoring_sections', documentId: String(sectionId) },
        acceptedContent,
        actor,
        sources,
        // The model's own paraphrase claims, parked at draft time with their
        // source ids already resolved. The gate records each still-present,
        // still-retrieved one as a usage='paraphrased' span — an assertion behind
        // the verified-quote pass, never ahead of it.
        {
          assertions: candidate.assertions,
          // The accepted content IS the machine's draft wherever the author
          // left it unedited: a clause verbatim in what was generated is
          // recorded as AnA's, accepted by this actor; a clause the author
          // changed is the author's own. Attribution by verbatim match against
          // the draft as generated — never by a flag on the whole save.
          acceptedMachineText: [{ authorId: ANA_MACHINE_AUTHOR_ID, text: candidate.content }],
        },
      );

      /* AND THE ACCEPTED DRAFT REACHES THE FILING.
       *
       * This call was missing, exactly as it was on the revert path, and with
       * the same consequence: accepting an AI draft wrote the working copy
       * (`authoring_sections`) and its lineage, and left `c2c_document_sections`
       * — what the filing IS — holding the pre-draft content. So an author
       * accepted a page of regulatory text, saw it in the editor, the audit
       * trail recorded it, and the system of record still showed the old text.
       * AI-assisted drafting is a primary use of this surface, which made this
       * the widest instance of the working-copy/filing drift `commitSectionToFiling`
       * exists to close.
       *
       * In THIS transaction, so the working copy and the filing move together
       * or neither does — the same guarantee the manual save gives. The reason
       * is the author's if they stated one, and otherwise NOT invented: the
       * fact that it came from an AI draft is provenance, recorded on the
       * revision origin and the audit metadata, not a justification for the
       * change. */
      governedCommit = await commitSectionToFiling({
        client,
        sectionId: String(sectionId),
        content: String(acceptedContent ?? ''),
        actorId: String(actor),
        tenantId,
        reason:
          typeof req.body?.changeReason === 'string' && req.body.changeReason.trim()
            ? req.body.changeReason
            : undefined,
        // Unconditional, unlike the manual-save call site above: this whole
        // route exists to accept an AI draft, so the content it commits is by
        // definition AI-drafted — there is no ambiguous zero-contributor case
        // here the way there is on an ordinary interactive save.
        draftSource: 'ana',
      });

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error('AI draft accept refused — content and lineage rolled back together', {
        sectionId,
        tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({
        success: false,
        error: {
          code: 'LINEAGE_REQUIRED',
          message:
            'The draft was not saved: its source/author lineage could not be recorded. ' +
            'Saving content without provenance is not permitted.',
        },
      });
    } finally {
      client.release();
    }

    // Revision + Part 11 audit record, mirroring PATCH /sections — additive, on
    // their own connections, after the content+lineage commit, and non-fatal (the
    // edit already landed; failing here would report failure for a change that
    // succeeded).
    try {
      await createRevision(String(sectionId), acceptedContent, actor, tenantId, pool, 'ai-draft-accept');
    } catch (revErr: any) {
      console.warn('[Authoring] AI draft accept: revision write failed (non-fatal):', revErr?.message);
    }
    await createAuditTrail(
      req,
      saved.rows[0]?.doc_id,
      sectionId,
      'UPDATE',
      priorContent,
      acceptedContent,
      /* THE REASON IS THE AUTHOR'S, OR NOT STATED — never "Accepted AI draft".
         That fallback put a MECHANISM in the reason-for-change field, where it
         read as a human's justification for the edit; it is the same pattern
         removed from the manual save's `app.reason` default. Accepting an AI
         draft is provenance (recorded on the revision origin 'ai-draft-accept'
         and in the metadata below), not a reason WHY this regulatory text was
         chosen. When the author states a reason it is used; when they do not,
         the record says so rather than inventing one. */
      typeof req.body?.changeReason === 'string' && req.body.changeReason.trim()
        ? req.body.changeReason
        : null,
      /* Which model, which provider, which prompt. All three existed at draft
         time and used to reach the browser and stop there, so "what produced
         this text?" was answerable for about as long as the tab stayed open —
         the first question an assessor asks about AI-assisted content, and the
         one piece of provenance being collected and then discarded. */
      /* draft_modified_on_accept: the accept endpoint allows the author to
         hand-edit the draft before accepting, so the provenance must not vouch
         for words the model never produced. True here means the saved text
         differs from the generated candidate — the generator metadata
         describes the draft's origin, not the final wording. */
      { source: 'ai-draft-accept', generator, draft_modified_on_accept: draftModifiedOnAccept },
    );

    res.json({
      success: true,
      section: saved.rows[0],
      attribution,
      message: `AI draft accepted — ${attribution.sourceSpans} verified source citation(s) across ${attribution.distinctSources} source(s); ${attribution.coverage}% of content quoted, the remainder recorded as author-original.`,
      /* Whether the accepted text reached the filing — honest either way, the
         same as the manual save. An unbound accept says it did not, rather than
         letting the two stores drift apart in silence. */
      ...(governedCommit
        ? {
            filing: governedCommit.committed
              ? { committed: true, documentId: governedCommit.documentId, sectionKey: governedCommit.sectionKey }
              : { committed: false, reason: governedCommit.reason },
          }
        : {}),
    });
  } catch (error) {
    console.error('Error accepting AI draft:', error);
    return serverError(res, logger, 'saving accept', error);
  }
});

// POST /api/authoring/sections/:sectionId/ai/deficiency-scan - Scan for deficiencies
router.post('/sections/:sectionId/ai/deficiency-scan', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { region = 'FDA', scan_type = 'comprehensive' } = req.body;
    const tenantId = getTenantId(req);

    // Get section content
    const sectionResult = await pool.query(
      `SELECT s.id, s.doc_id, s.code, s.title, s.content, s.order_index, s.track_changes, s.created_at, s.updated_at, s.tenant_id, d.module
       FROM authoring_sections s
       JOIN authoring_documents d ON d.id = s.doc_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [sectionId, tenantId]
    );

    if (((sectionResult.rowCount ?? 0) === 0)) {
      return res.status(404).json({
        success: false,
        error: 'Section not found',
      });
    }

    const section = sectionResult.rows[0];

    // Perform deficiency analysis
    const deficiencies: Array<Record<string, unknown>> = [];
    const content = section.content || '';
    const contentLength = content.length;

    /* Which distinct checks ran, and which of them flagged.
       The score was `(10 - deficiencies.length) / 10`, where 10 was a constant
       unrelated to the checks actually performed. The module-keyword check
       alone pushes one deficiency PER missing term — six of them — so a poor
       section reached thirteen deficiencies and scored -30%. A percentage
       below zero is not a signal, it is a bug wearing one. Counting distinct
       checks makes the denominator mean something and keeps the range 0-100,
       and it lets the response say "passed N of M" instead of asking a reader
       to trust a bare number. */
    const checks: Array<{ id: string; flagged: boolean }> = [];
    const runCheck = (id: string, fn: () => void) => {
      const before = deficiencies.length;
      fn();
      checks.push({ id, flagged: deficiencies.length > before });
    };

    const contentLower = content.toLowerCase();

    runCheck('content_length', () => {
      if (contentLength < 100) {
        deficiencies.push({
          type: 'content_length',
          severity: 'high',
          message:
            'Section content appears insufficient. Regulatory sections typically require detailed information.',
          recommendation: 'Expand content to include all required regulatory elements.',
          location: 'entire_section',
        });
      }
    });

    // Check for required regulatory keywords based on module
    const requiredKeywords: Record<string, string[]> = {
      M3: ['specification', 'validation', 'stability', 'quality', 'manufacture', 'control'],
      M5: ['efficacy', 'safety', 'adverse', 'clinical', 'endpoint', 'statistical'],
      M2: ['summary', 'overview', 'quality', 'nonclinical', 'clinical'],
      M4: ['toxicology', 'pharmacology', 'ADME', 'carcinogenicity'],
      M1: ['form', 'administrative', 'regulatory'],
    };

    runCheck('module_keywords', () => {
      const moduleKeywords = requiredKeywords[section.module] || requiredKeywords['M3'];
      moduleKeywords.forEach(keyword => {
        if (!contentLower.includes(keyword)) {
          deficiencies.push({
            type: 'missing_keyword',
            severity: 'medium',
            message: `Missing expected regulatory term: "${keyword}"`,
            recommendation: `Include discussion of ${keyword} as required by ${region} guidelines`,
            location: 'content',
          });
        }
      });
    });

    /* CTD required-element check, migrated from POST /ai/validate-compliance.
       That endpoint was a second, callerless implementation of this same
       capability — heuristic keyword presence over section content — and it
       reported `overall_compliance: 'PASS'` whenever its list came back empty.
       Its list was only ever populated for five hardcoded 3.2.S.* codes, so
       for every other section in the CTD it checked nothing and answered PASS.
       The useful half is these per-section element lists; they belong on the
       one scan that has a caller and an honest frame, and the endpoint is
       deleted in the same change (zero duplication). */
    const ctdRequiredElements: Record<string, string[]> = {
      '3.2.S.1': ['nomenclature', 'structure', 'general properties'],
      '3.2.S.2': ['manufacturer', 'manufacturing process', 'controls'],
      '3.2.S.3': ['elucidation of structure', 'impurities'],
      '3.2.S.4': ['specifications', 'analytical procedures', 'validation'],
      '3.2.S.7': ['stability data', 'post-approval stability', 'storage conditions'],
    };
    const ctdElements = ctdRequiredElements[String(section.code)];
    /* Only counted as a check when there IS a list for this section code.
       Running it against a section it has no expectations for and recording a
       pass would inflate the score with a check that never looked at anything
       — the exact arithmetic that let the deleted endpoint answer PASS. */
    if (ctdElements) {
      runCheck('ctd_required_elements', () => {
        ctdElements.forEach(element => {
          if (!contentLower.includes(element)) {
            deficiencies.push({
              type: 'missing_ctd_element',
              severity: 'medium',
              message: `Section ${section.code} would normally discuss ${element}`,
              recommendation: `Add information about ${element} to ${section.code}`,
              location: 'content',
            });
          }
        });
      });
    }

    runCheck('data_presence', () => {
      if (!content.includes('[') && !content.includes('Table') && !content.includes('Figure')) {
        deficiencies.push({
          type: 'missing_data',
          severity: 'medium',
          message: 'No data tables or figures detected',
          recommendation: 'Consider adding supporting data, tables, or figures',
          location: 'content',
        });
      }
    });

    runCheck('placeholder_text', () => {
      const placeholderPatterns = [/\[.*?\]/g, /TBD/gi, /TODO/gi, /XXX/gi];
      placeholderPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches && matches.length > 0) {
          deficiencies.push({
            type: 'placeholder_text',
            severity: 'high',
            message: `Found placeholder text: ${matches.slice(0, 3).join(', ')}${
              matches.length > 3 ? '...' : ''
            }`,
            recommendation: 'Replace all placeholder text with actual content',
            location: 'multiple',
          });
        }
      });
    });

    runCheck('structure', () => {
      if (!content.includes('\n') || content.split('\n').length < 5) {
        deficiencies.push({
          type: 'poor_structure',
          severity: 'low',
          message: 'Content lacks proper structure and formatting',
          recommendation: 'Add headings, paragraphs, and proper formatting',
          location: 'formatting',
        });
      }
    });

    // Heuristic quality/completeness signal — NOT a 21 CFR compliance
    // determination. It is derived purely from word-count and keyword presence
    // and cannot prove regulatory compliance; labelling a section "compliant" /
    // "non_compliant" on that basis overstates what the check establishes. It is
    // reported as a review signal ('review required' / 'heuristic quality').
    const checksRun = checks.length;
    const checksPassed = checks.filter(c => !c.flagged).length;
    const qualityScore = checksRun > 0 ? Math.round((checksPassed / checksRun) * 100) : 0;

    res.json({
      success: true,
      scan_results: {
        section_id: sectionId,
        section_code: section.code,
        section_title: section.title,
        scan_type,
        region,
        // Heuristic quality/completeness signal. `compliance_score` is retained
        // for backward compatibility with existing readers, but it mirrors the
        // quality signal and is not a compliance determination.
        signal_type: 'heuristic_quality',
        quality_score: qualityScore,
        compliance_score: qualityScore,
        /* The denominator, so a reader is never asked to take the percentage
           on trust — and so the UI can name how many checks actually ran
           rather than hardcoding a number that drifts from the code. */
        checks_run: checksRun,
        checks_passed: checksPassed,
        status:
          qualityScore >= 80
            ? 'heuristic_ok'
            : qualityScore >= 60
            ? 'review_recommended'
            : 'review_required',
        deficiencies,
        deficiency_count: deficiencies.length,
        scanned_at: new Date().toISOString(),
      },
      message:
        'Heuristic quality scan completed (word-count/keyword signal, not a compliance determination)',
    });
  } catch (error) {
    console.error('Error scanning for deficiencies:', error);
    return serverError(res, logger, 'saving deficiency scan', error);
  }
});

// ============= Export =============
// Additional endpoints for comprehensive functionality

// NOTE: Removed duplicate database-based templates endpoint - using file-based templates at line ~1834

// GET /api/authoring/stats - Get authoring statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const stats = await pool.query(
      `
      SELECT
        COUNT(DISTINCT d.id) as total_documents,
        -- The store holds MIXED-case statuses: create writes 'draft', the
        -- workflow writes 'IN_REVIEW'/'APPROVED', freeze writes 'FROZEN'. The
        -- old literals ('draft'/'review'/'approved') matched only the first,
        -- so every counter past draft sat at 0 forever (BP-W0-7 defect class).
        COUNT(DISTINCT CASE WHEN upper(d.status) = 'DRAFT' THEN d.id END) as draft_documents,
        COUNT(DISTINCT CASE WHEN upper(d.status) = 'IN_REVIEW' THEN d.id END) as review_documents,
        COUNT(DISTINCT CASE WHEN upper(d.status) = 'APPROVED' THEN d.id END) as approved_documents,
        COUNT(DISTINCT s.id) as total_sections,
        COUNT(DISTINCT c.id) as total_comments,
        COUNT(DISTINCT CASE WHEN c.status = 'open' THEN c.id END) as open_comments,
        COUNT(DISTINCT r.id) as total_revisions
      FROM authoring_documents d
      LEFT JOIN authoring_sections s ON s.doc_id = d.id
      LEFT JOIN authoring_comments c ON c.doc_id = d.id
      LEFT JOIN doc_revisions r ON r.section_id = s.id
      WHERE d.tenant_id = $1
    `,
      [tenantId]
    );

    res.json({
      success: true,
      statistics: stats.rows[0],
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    return serverError(res, logger, 'loading stats', error);
  }
});

/* The three "Step 5 helpers" that stood here — sha256(), extractPlainText()
   and buildPdfFromDocx() — were called by nothing. buildPdfFromDocx was the
   one worth naming: it took a DOCX buffer, ignored it, and returned an EMPTY
   PDF, with a comment calling that a placeholder. A helper that answers a
   request for a rendered document with a blank one is the fabrication this
   repo refuses; leaving it in place meant the next caller would ship empty
   exports and see nothing wrong. Hashing goes through sha256Hex / crypto
   directly at each site, which is where the rest of the file already does it.
*/

// ============= Step 5 Export, Submit, Sign, Freeze Endpoints =============

// ============= 21 CFR Part 11 Compliance Endpoints =============

/* POST /api/authoring/docs/:docId/create-pin has been DELETED.
 *
 * It was a second endpoint for the same thing POST /users/pin does — setting
 * the signing PIN that gates every electronic signature in this router — with
 * no caller anywhere, and it bypassed both controls the canonical one exists
 * to enforce.
 *
 * NO OLD-PIN CHECK. /users/pin requires the current PIN, bcrypt-verified,
 * before it will overwrite an existing one; its own header records why, citing
 * §11.200(a)(1): possession of a session must not become possession of the
 * signing credential. This route called createUserPin() straight through, so
 * any authenticated session could replace another sitting PIN it did not know.
 *
 * IT CLEARED THE LOCKOUT. createUserPin's upsert ended in
 * `failed_attempts = 0, locked_until = NULL`. verifyUserPin enforces three
 * attempts and a thirty-minute lockout, and this endpoint reset both — so the
 * brute-force control could be cleared between guesses by the same session
 * doing the guessing.
 *
 * createUserPin() is deleted with it: this was its only call site.
 *
 * NOTE, deliberately left as a finding rather than fixed here: `pin_expires_at`
 * was written ONLY by createUserPin (90 days) and is read by nothing —
 * verifyUserPin selects pin_hash, failed_attempts and locked_until and never
 * consults it. PIN aging therefore looks implemented and is not enforced, and
 * after this deletion the column has no writer either. Enforcing expiry would
 * start locking real signers out of a governed action, which is a product
 * decision and not a cleanup.
 *
 * 2026-09-23: moot. /users/pin and verifyUserPin are deleted as well, and the
 * PIN signs nothing; see "Signing credential" below.
 */


// POST /api/authoring/docs/:docId/freeze - Freeze document with immutable snapshot
router.post('/docs/:docId/freeze', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { reason, version } = req.body;
    // §11.10(e): the reason is validated here and recorded as given — never
    // replaced by a placeholder in the ledger.
    const reasonVerdict = requireGovernedReason(reason);
    if (!reasonVerdict.ok) return res.status(400).json({ error: reasonVerdict.error, field: 'reason' });
    const freezeReason = reasonVerdict.reason;
    // Freeze attribution from the verified JWT; the old x-user-email ||
    // 'system' fallback let an unauthenticated caller freeze as "system".
    const email = getActorEmail(req) || null;
    if (!email) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const tenantId = getTenantId(req);

    // Get current document content
    const docResult = await pool.query(
      'SELECT id, title, module, product_code, locale, status, created_at, updated_at, created_by, template_id, submitted_at, current_workflow_id, approved_at, frozen_at, locked_at, locked_by, tenant_id, version FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
      [docId, tenantId]
    );

    if (((docResult.rowCount ?? 0) === 0)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    // Check if already frozen. Case-insensitive on purpose: the store holds
    // mixed-case statuses, and an idempotency guard that only recognises one
    // casing lets the same document be frozen twice.
    if (['FROZEN', 'APPROVED'].includes(String(doc.status ?? '').toUpperCase())) {
      return res.status(400).json({ error: 'Document is already frozen' });
    }

    // Get all sections
    const sectionsResult = await pool.query(
      // 2026-09-23 (W5/D7, co-author final pass): the seal's section order is the editor's
      // (order_index, created_at; id makes it total), the order the filing copy assembles in.
      'SELECT id, doc_id, code, title, content, order_index, track_changes, created_at, updated_at, tenant_id FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index, created_at, id',
      [docId, tenantId]
    );

    /* ── A FROZEN DOCUMENT IS NOT ALLOWED TO STILL BE ASKING QUESTIONS ──
     *
     * Freeze is the seal: after it the content is seseal-hashed, signed under
     * §11.50 and filed. Nothing here checked whether the document was actually
     * finished, so a section carrying forty open reviewer comments and a dozen
     * unaccepted tracked changes could be frozen, signed and submitted.
     *
     * Both then disappear in a way nobody can see downstream. Comments are not
     * part of the exported content at all, so the questions simply do not
     * travel — the filed document looks settled and the forty unanswered
     * queries exist only in a UI nobody opens after the seal. Unresolved
     * suggestions do travel, and now travel visibly (they render as
     * `[-old-][+new+]`), which means an unfinished sentence reaches a reviewer
     * mid-argument.
     *
     * So the refusal is the honest default: a document with outstanding work is
     * not ready to be sealed, and the seal is exactly the wrong moment to
     * discover that.
     *
     * It is a refusal, not a prohibition. Freezing a draft with open comments
     * is legitimate — an internal baseline before a review round is a real
     * thing to want — so the caller may proceed by SAYING SO, and what they
     * acknowledged is recorded in the audit trail and in the freeze reason.
     * That is the Part 11 shape: you may act, but you must state that you know,
     * and the record keeps it. Silently sealing an unfinished document is the
     * only option removed. */
    const openComments = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM authoring_comments
        WHERE doc_id = $1 AND tenant_id = $2 AND status = 'open'`,
      [docId, tenantId]
    );
    const openCommentCount = Number(openComments.rows[0]?.n ?? 0);

    /* The same census the export takes, from the same parser, so the two can
       never disagree about whether a document has unsettled edits. */
    const { sectionContentToBlocks: toBlocks, countPendingSuggestions: countPending } =
      await import('../export/authoring-section-content.js');
    let pendingEdits = 0;
    for (const section of sectionsResult.rows) {
      const p = countPending(toBlocks(section.content));
      pendingEdits += p.insertions + p.deletions;
    }

    const acknowledged = req.body?.acknowledgeUnresolved === true;
    if ((openCommentCount > 0 || pendingEdits > 0) && !acknowledged) {
      const parts: string[] = [];
      if (openCommentCount > 0) {
        parts.push(
          `${openCommentCount} unresolved comment${openCommentCount === 1 ? '' : 's'}`
        );
      }
      if (pendingEdits > 0) {
        parts.push(`${pendingEdits} tracked change${pendingEdits === 1 ? '' : 's'} nobody has accepted or rejected`);
      }
      return res.status(409).json({
        success: false,
        error: {
          code: 'DOCUMENT_NOT_SETTLED',
          message:
            `Not frozen — this document still has ${parts.join(' and ')}. ` +
            'Freezing seals the content for signature and filing, so the questions ' +
            'would go unanswered and the proposed edits would reach a reviewer ' +
            'undecided. Resolve them, or freeze again confirming you intend to ' +
            'seal it as it stands.',
        },
        unresolved: { openComments: openCommentCount, pendingEdits },
      });
    }

    /* What was sealed over is part of why it was sealed, so it goes into the
       reason the frozen record carries rather than only into the audit row. */
    const acknowledgedNote =
      acknowledged && (openCommentCount > 0 || pendingEdits > 0)
        ? ` [Sealed with ${openCommentCount} unresolved comment(s) and ` +
          `${pendingEdits} undecided tracked change(s), acknowledged by ${email}.]`
        : '';

    // Create frozen content snapshot
    const frozenContent = JSON.stringify({
      document: doc,
      sections: sectionsResult.rows,
      frozenAt: new Date().toISOString(),
    });

    const contentHash = crypto.createHash('sha256').update(frozenContent).digest('hex');
    const versionNumber = version || `v${doc.version || '1.0'}.frozen`;

    // Frozen-snapshot insert + status flip + audit are ONE atomic unit. Run as
    // separate pool commits, a failure after the snapshot but before the status
    // update left a frozen_documents row for a document still marked editable
    // (or the reverse), and a failure before the audit left a freeze with no
    // trail. A single BEGIN/COMMIT makes the three land together or roll back
    // together.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Store frozen snapshot
      await client.query(
        `INSERT INTO frozen_documents
         (document_id, version, frozen_content, content_hash, frozen_by, frozen_reason, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [docId, versionNumber, frozenContent, contentHash, email,
         `${freezeReason}${acknowledgedNote}`, tenantId]
      );

      // Update document status
      await client.query(
        'UPDATE authoring_documents SET status = $1 WHERE id = $2 AND tenant_id = $3',
        ['FROZEN', docId, tenantId]
      );

      // Create audit trail
      await createAuditTrail(
        req,
        docId,
        null,
        'FREEZE',
        null,
        frozenContent,
        `${freezeReason}${acknowledgedNote}`,
        { contentHash, version: versionNumber, openCommentCount, pendingEdits, acknowledged },
        client,
        // This handler writes its own richer chained row below.
        { chainedRowWrittenByCaller: true },
      );

      /* §11.10(e) — the HASH-CHAINED ledger, on this transaction.
         `createAuditTrail` above writes authoring_audit_trail, which carries no
         chain and no HMAC, and its mirror into the chained `audit_logs` runs
         ONLY when the executor is the pool (see the guard at its foot). Every
         governed handler here passes its own transaction client — correctly, so
         the record commits with the mutation — which meant the mirror was
         skipped and these events never reached the chain at all. So
         verifyAuditChain had nothing to verify for the three actions that most
         need it, and the document's own audit view read an unchained table.
         writeChainedAuditRow is the primitive built for this case and is what
         /api/esignature/sign already uses: on the caller's client, so if the
         audit row cannot be written the whole transaction rolls back and the
         signature never exists either. */
      await writeChainedAuditRow(client, {
        tenantId,
        userId: getActorId(req) ?? undefined,
        action: 'authoring.document.freeze',
        resourceType: 'authoring_document',
        resourceId: String(docId ?? ''),
        ipAddress: (req.ip ?? undefined) as string | undefined,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: { contentHash, version: versionNumber, reason: reason ?? null },
      });

      await client.query('COMMIT');
    } catch (txError) {
      try { await client.query('ROLLBACK'); } catch { /* rollback best-effort */ }
      throw txError;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      contentHash,
      version: versionNumber,
      frozenAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error freezing document:', error);
    res.status(500).json({ error: 'Failed to freeze document' });
  }
});

// POST /api/authoring/docs/:docId/e-sign - Electronic signature, re-verified by the platform ceremony
router.post('/docs/:docId/e-sign', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { meaning, intent } = req.body;
    // Part 11 §11.100 attribution: the SIGNER identity on an electronic
    // signature must come from the verified JWT, never from client-supplied
    // headers. x-user-email here meant anyone could sign as anyone.
    const email = getActorEmail(req);
    const tenantId = getTenantId(req);

    if (!email) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // §11.10(g) authority, checked BEFORE the credentials. Order matters: an
    // unauthorized caller must not learn whether a password is correct, and
    // must not be able to use this endpoint as a password oracle.
    if (!(await assertSigningAuthority(req, res))) return;

    if (!meaning || !SIGNATURE_MEANINGS.includes(meaning)) {
      return res.status(400).json({ error: 'Invalid signature meaning' });
    }

    if (!intent) {
      return res.status(400).json({ error: 'Signature intent is required' });
    }

    // §11.70 — a signature must be linked to the record it signs. Without this
    // an unknown or cross-tenant docId produced a signature bound to sha256("").
    if (!(await documentExistsForTenant(docId, tenantId))) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // §11.50(a)(1) printed name, from the user record — never `req.user.name`,
    // which this router never populates, and never the email in its place.
    const name = await resolveSignerName(email);

    // §11.200(a)(1): the signer re-verified, last, so a refusal costs nothing
    // and a code is spent only on a signature that is otherwise ready.
    const signer = await reverifyAuthoringSigner(req, res);
    if (!signer) return;

    // Compute document hash
    const docHash = await computeDocHash(docId, tenantId);

    // Create electronic signature record
    const signatureId = crypto.randomUUID();
    // Writes authoring_signatures, NOT electronic_signatures. The latter is the
    // Part 11 table for the integer-keyed legacy document system: its
    // document_id is `INTEGER REFERENCES documents(id)` where this loop has UUID
    // doc ids, and it carries seven NOT NULL columns this insert never supplied.
    // The two are different concepts that collided on a name, so the authoring
    // loop now has its own store — the same one GET /docs/:docId/signatures has
    // always read. See ledger C-11 residual 1.
    // §11.70 signature/record link: bind this signature to the snapshot in force
    // at signing time, and cover that binding in a recomputable digest.
    const covered = await currentFrozenSnapshot(docId, tenantId);
    const signatureDigest = computeSignatureDigest({
      signerEmail: email,
      meaning,
      contentHash: docHash,
      coveredContentHash: covered?.contentHash ?? null,
    });

    // Signature insert + audit + (on APPROVER) status flip and auto-freeze are
    // ONE atomic unit. Run as separate pool commits, an approval signature could
    // be recorded while the status flip or the auto-freeze that must accompany
    // it failed — leaving a signed-but-not-approved, or approved-but-not-frozen,
    // document. A single BEGIN/COMMIT makes the whole signing act land together
    // or roll back together.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // `method` is what the ceremony verified ('password' or 'password+mfa'),
      // never a claim from the request. `pin_verified` stays false: no PIN is
      // involved, and rows signed with one keep 'PIN' and true.
      await client.query(
        `INSERT INTO authoring_signatures
         (id, doc_id, signer_email, signer_name, meaning, reason, method,
          content_hash, signature_digest, covered_freeze_version, covered_content_hash,
          pin_verified, ip_address, user_agent, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE, $12, $13, $14)`,
        [
          signatureId,
          docId,
          email,
          name,
          meaning,
          intent,
          signer.authenticationMethod,
          docHash,
          signatureDigest,
          covered?.version ?? null,
          covered?.contentHash ?? null,
          req.ip,
          req.headers['user-agent'],
          tenantId,
        ]
      );

      // Create audit trail
      await createAuditTrail(req, docId, null, 'E_SIGN', null, null, intent, {
        signatureId,
        meaning,
        documentHash: docHash,
        timestamp: new Date().toISOString(),
      }, client,
      // This handler writes its own richer chained row below.
      { chainedRowWrittenByCaller: true });

      // Update document status based on signature meaning
      if (meaning === 'APPROVER') {
        await client.query(
          'UPDATE authoring_documents SET status = $1 WHERE id = $2 AND tenant_id = $3',
          ['APPROVED', docId, tenantId]
        );

        // Auto-freeze on approval — capture the FULL approved snapshot (document
        // + sections) and hash the SNAPSHOT BYTES, exactly like the manual freeze
        // above. The prior code stored a 3-field stub {approvedBy, documentHash,
        // timestamp} and set content_hash = docHash (the hash of the live
        // SECTIONS, not of the stub). Two filing-integrity failures followed:
        // the approved content was captured nowhere immutable (it lived only in
        // the editable authoring_sections table), and GET /docs/:docId/frozen —
        // which recomputes sha256(frozen_content) and compares to content_hash —
        // raised a false "tampering detected" 500 on EVERY e-sign-approved
        // document, because sha256(stub) can never equal docHash. Approval must
        // produce a verifiable frozen legal record.
        const approvedDoc = await client.query(
          'SELECT * FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
          [docId, tenantId]
        );
        const approvedSections = await client.query(
          // 2026-09-23 (W5/D7, co-author final pass): the seal's section order is the editor's
          // (order_index, created_at; id makes it total), the order the filing copy assembles in.
          'SELECT id, doc_id, code, title, content, order_index, track_changes, created_at, updated_at, tenant_id FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index, created_at, id',
          [docId, tenantId]
        );
        const frozenContent = JSON.stringify({
          document: approvedDoc.rows[0] ?? null,
          sections: approvedSections.rows,
          approvedBy: email,
          documentHash: docHash,
          frozenAt: new Date().toISOString(),
        });
        const frozenContentHash = crypto.createHash('sha256').update(frozenContent).digest('hex');

        await client.query(
          `INSERT INTO frozen_documents
           (document_id, version, frozen_content, content_hash, frozen_by, frozen_reason, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (document_id, version, tenant_id) DO NOTHING`,
          [docId, 'approved', frozenContent, frozenContentHash, email, 'Approved and frozen', tenantId]
        );
      }

      /* §11.10(e) — the HASH-CHAINED ledger, on this transaction.
         `createAuditTrail` above writes authoring_audit_trail, which carries no
         chain and no HMAC, and its mirror into the chained `audit_logs` runs
         ONLY when the executor is the pool (see the guard at its foot). Every
         governed handler here passes its own transaction client — correctly, so
         the record commits with the mutation — which meant the mirror was
         skipped and these events never reached the chain at all. So
         verifyAuditChain had nothing to verify for the three actions that most
         need it, and the document's own audit view read an unchained table.
         writeChainedAuditRow is the primitive built for this case and is what
         /api/esignature/sign already uses: on the caller's client, so if the
         audit row cannot be written the whole transaction rolls back and the
         signature never exists either. */
      await writeChainedAuditRow(client, {
        tenantId,
        userId: getActorId(req) ?? undefined,
        action: 'authoring.document.e-sign',
        resourceType: 'authoring_document',
        resourceId: String(docId ?? ''),
        ipAddress: (req.ip ?? undefined) as string | undefined,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: { meaning, intent, documentHash: docHash, signer: email },
      });

      await client.query('COMMIT');
    } catch (txError) {
      try { await client.query('ROLLBACK'); } catch { /* rollback best-effort */ }
      throw txError;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      signatureId,
      documentHash: docHash,
      signedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating electronic signature:', error);
    res.status(500).json({ error: 'Failed to create electronic signature' });
  }
});
// GET /api/authoring/docs/:docId/frozen - Get frozen document snapshot
router.get('/docs/:docId/frozen', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { version } = req.query;
    const tenantId = getTenantId(req);

    let query = `SELECT id, document_id, version, frozen_content, content_hash, frozen_by, frozen_reason, frozen_at, tenant_id FROM frozen_documents WHERE document_id = $1 AND tenant_id = $2`;
    const params = [docId, tenantId];

    if (version) {
      query += ' AND version = $3';
      params.push(version as string);
    } else {
      query += ' ORDER BY frozen_at DESC LIMIT 1';
    }

    const result = await pool.query(query, params);

    if (((result.rowCount ?? 0) === 0)) {
      return res.status(404).json({ error: 'No frozen version found' });
    }

    const frozen = result.rows[0];

    // Verify content hash
    const computedHash = crypto.createHash('sha256').update(frozen.frozen_content).digest('hex');

    if (computedHash !== frozen.content_hash) {
      console.error('CRITICAL: Frozen document tampering detected!');
      return res.status(500).json({ error: 'Document integrity check failed' });
    }

    // Log access in audit trail
    await createAuditTrail(
      req,
      docId,
      null,
      'VIEW_FROZEN',
      null,
      null,
      'Accessed frozen document',
      { version: frozen.version, hash: frozen.content_hash }
    );

    res.json({
      success: true,
      version: frozen.version,
      contentHash: frozen.content_hash,
      frozenAt: frozen.frozen_at,
      frozenBy: frozen.frozen_by,
      content: JSON.parse(frozen.frozen_content),
    });
  } catch (error) {
    console.error('Error fetching frozen document:', error);
    res.status(500).json({ error: 'Failed to fetch frozen document' });
  }
});

// GET all citations by doc (grouped)
router.get('/docs/:docId/citations', async (req: Request, res: Response) => {
  try {
    // Tenant-scoped like every other read in this router. This query carried
    // tenant_id in its SELECT list and nowhere in its WHERE, so any
    // authenticated user could enumerate another organization's citations —
    // source names, citation text, checksums — by guessing document UUIDs.
    const tenantId = getTenantId(req);
    const { rows } = await pool.query(
      `
      SELECT c.id, c.section_id, c.source, c.anchor, c.citation_text, c.reference_id, c.created_by, c.created_at, c.tenant_id, c.payload_sha256, c.frozen_at, s.code, s.title
      FROM authoring_citations c
      JOIN authoring_sections s ON s.id=c.section_id
      WHERE s.doc_id=$1 AND c.tenant_id=$2 AND s.tenant_id=$2
      ORDER BY c.created_at ASC
    `,
      [req.params.docId, tenantId]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /docs/:docId/citations', e);
    res.status(500).json({ error: 'Failed to list citations' });
  }
});
router.post('/docs/:docId/send-to-packager', async (req: Request, res: Response) => {
  try {
    const { seqId, path: relPath, title, fmt } = req.body || {};
    if (!seqId || !relPath) {
      return res.status(400).json({ error: 'seqId and path are required' });
    }

    /* This bridge re-enters the platform's own HTTP routes, and as written it
       could never have worked:
         - it sent NO Authorization header, so the export route's own JWT
           middleware answered 401 on every call;
         - it passed `?fmt=` while the export handler reads `req.body.format`,
           so even authenticated it would always have exported DOCX;
         - it never checked the export response, so that 401 JSON body was
           base64-encoded and shipped to the packager as the "document".
       The caller's verified credentials are forwarded to both hops (the export
       and the packager enforce their own authorization with them), and every
       hop is checked before its output is used. */
    const authHeaders: Record<string, string> = {};
    if (req.headers.authorization) authHeaders.Authorization = String(req.headers.authorization);

    // 1) Export DOCX (or PDF if requested)
    const exp = await fetch(
      `${req.protocol}://${req.get('host')}/api/authoring/docs/${req.params.docId}/export`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ format: fmt || 'docx' }),
      }
    );
    if (!exp.ok) {
      return res
        .status(502)
        .json({ error: `Export failed (HTTP ${exp.status}) — nothing was sent to the packager` });
    }
    const buf = Buffer.from(await exp.arrayBuffer());
    const base64 = buf.toString('base64');

    // 2) Upload as leaf (calls your existing packager route)
    const up = await fetch(
      `${req.protocol}://${req.get('host')}/api/regulatory/ectd/${seqId}/leaf`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          module: 3,
          path: relPath,
          title: title || 'Module 3 Document',
          operation: 'new',
          base64,
        }),
      }
    );

    if (!up.ok) {
      return res.status(502).json({ error: 'Packager upload failed' });
    }

    const leaf = await up.json();
    res.json({ ok: true, leaf });
  } catch (e) {
    console.error('POST /docs/:id/send-to-packager', e);
    res.status(500).json({ error: 'Bridge to packager failed' });
  }
});

// ============= Step 8: Export logging, Diff since Export, Document-level refresh =============
// ============= Step 7: Token Node API Endpoints =============

// GET /api/authoring/sections/:sectionId/tokens - Get tokens (citations) for a section
router.get('/sections/:sectionId/tokens', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const tenantId = getTenantId(req);

    const result = await pool.query(
      `SELECT
        c.id as cite_id,
        c.source,
        c.citation_text,
        c.created_at,
        c.payload_sha256,
        c.anchor,
        c.reference_id
       FROM authoring_citations c
       WHERE c.section_id = $1 AND c.tenant_id = $2
       ORDER BY c.created_at DESC`,
      [sectionId, tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting section tokens:', error);
    return serverError(res, logger, 'loading tokens', error);
  }
});

// POST /api/authoring/sections/:sectionId/refresh-token - Refresh a specific token
router.post('/sections/:sectionId/refresh-token', async (req: Request, res: Response) => {
  try {
    /* :sectionId is addressing only. A citation is identified by cite_id within
       the caller's tenant, and refreshSourceCitation scopes on the tenant — the
       section in the path is not a second scope and was never read as one, so
       it is not bound here rather than bound and ignored. */
    const { cite_id } = req.body;
    const tenantId = getTenantId(req);

    if (!cite_id) {
      return res.status(400).json({
        success: false,
        error: 'cite_id is required',
      });
    }

    // A REAL re-resolution. What was here before bumped `created_at` to NOW() and
    // returned sha256(cite_id + Date.now()) as the refreshed content hash — a
    // manufactured content identity on a regulated surface, and a created_at that
    // then claimed the citation had just been made. Nothing was re-read.
    //
    // Now: the checksum comes from the cited source row, created_at is left alone,
    // and the response says plainly whether the source's content moved. A citation
    // kind with no source system behind it gets an honest 409 rather than a
    // fabricated hash.
    const { refreshSourceCitation } = await import(
      '../services/clinical-regulatory-evidence/source-usage.service.js'
    );
    const outcome = await refreshSourceCitation(tenantId, String(cite_id));

    if (!outcome.ok) {
      const status = outcome.reason === 'not_found' ? 404 : 409;
      const message =
        outcome.reason === 'not_found'
          ? 'Citation not found'
          : outcome.reason === 'frozen'
            ? 'This citation is frozen and cannot be re-resolved'
            : outcome.reason === 'not_a_source_citation'
              ? 'This citation does not reference a canonical source, so there is nothing to re-read. Nothing was changed.'
              : 'The cited source no longer resolves in this organization. Nothing was changed.';
      return res.status(status).json({ success: false, error: outcome.reason, message });
    }

    res.json({
      success: true,
      message: outcome.changed
        ? 'Source content has changed since this citation was made; the citation now records the current checksum.'
        : 'Re-read the source: its content is unchanged since this citation was made.',
      changed: outcome.changed,
      source_id: outcome.sourceId,
      previous_sha256: outcome.previousChecksum,
      sha256: outcome.currentChecksum,
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    return serverError(res, logger, 'saving refresh token', error);
  }
});

// ============= Step 8: Export Logging & Document-Level Features =============

// Helper function to ensure export history table exists with all required fields
// authoring_export_history is now provisioned by
// db/migrations/20260730_authoring_runtime_ddl.sql. Retained as a no-op so
// existing call sites need no change; the router no longer issues runtime DDL.
const ensureExportHistoryTableExists = async () => {};

// Helper: record export with comprehensive metadata — now
// services/authoring/authoring-export.ts logExport, shared with the vault filing.

// Helper: list tokens for a whole doc (with section metadata)
// Called only by GET /docs/:docId/diff-since-export. That endpoint could never
// reach this helper (it read a table nothing creates — ledger C-14), which is why
// two wrong column names survived here: authoring_sections has `code` and
// `doc_id`, never `section_number` or `document_id`. Now tenant-scoped too.
async function listDocTokens(docId: string | string[] | undefined, tenantId: number) {
  const result = await pool.query(
    `
    SELECT c.id, c.section_id, c.source, c.anchor, c.citation_text, c.reference_id, c.created_by, c.created_at, c.tenant_id, c.payload_sha256, c.frozen_at, s.code as section_code, s.title as section_title
    FROM authoring_citations c
    JOIN authoring_sections s ON s.id = c.section_id
    WHERE s.doc_id = $1 AND s.tenant_id = $2
    ORDER BY c.created_at ASC
  `,
    [docId, tenantId]
  );
  return result.rows;
}

// Note: computeDocHash function already exists above, reusing existing implementation

// List exports for a doc (latest first) - Enhanced with full history
router.get('/docs/:docId/exports', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    /* An unknown or cross-tenant docId used to return `exports: []` — the same
       answer as a real document nobody has exported yet. Those are opposite
       facts, and the second one is the whole point of the rail. Refuse instead.
       This also protects the hash below: computeDocHash walks the section rows
       and hashes the empty string when there are none, so an unguarded call
       would hand back sha256("") as if it described a document. */
    if (!(await documentExistsForTenant(req.params.docId, tenantId))) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Ensure table exists
    await ensureExportHistoryTableExists();

    // Get filter parameters from query
    const { start_date, end_date, export_type, limit = 100 } = req.query;

    let query = `
      SELECT
        id,
        document_id,
        export_type,
        exported_by,
        exported_at,
        file_name,
        file_size,
        doc_sha256,
        metadata,
        download_url,
        cached_until
      FROM authoring_export_history
      WHERE document_id = $1 AND tenant_id = $2
    `;

    const params: any[] = [req.params.docId, tenantId];
    let paramIndex = 3;

    // Add filters if provided
    if (start_date) {
      query += ` AND exported_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND exported_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    if (export_type) {
      query += ` AND export_type = $${paramIndex}`;
      params.push(export_type);
      paramIndex++;
    }

    query += ` ORDER BY exported_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit as string) || 100);

    const result = await pool.query(query, params);

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM authoring_export_history
       WHERE document_id = $1 AND tenant_id = $2`,
      [req.params.docId, tenantId]
    );

    /* Is the most recently exported file still the current document?
       `doc_sha256` on each row is computeDocHash at export time, so the same
       function now answers it for the live document and the two are directly
       comparable. Returned as the two hashes AND the derived verdict: the
       verdict is what a reader acts on, the hashes are what makes it checkable.

       `content_changed_since_last_export` is null — not false — when there is
       no export to compare against, or when the stored row carried no hash.
       "Nothing to compare" is not "nothing has changed", and a UI that renders
       the second for the first tells an author their stale file is current.

       Scope, stated because the verdict is narrower than it sounds: this
       compares section CODE and CONTENT in order. It says nothing about
       citations, attachments, or signatures — the citation drift that
       …/diff-since-export reports is a separate question with a separate
       answer. */
    const lastExport = result.rows[0] || null;
    const currentContentHash = await computeDocHash(req.params.docId, tenantId);
    const lastHash =
      typeof lastExport?.doc_sha256 === 'string' && lastExport.doc_sha256.length > 0
        ? lastExport.doc_sha256
        : null;

    res.json({
      success: true,
      exports: result.rows,
      total: parseInt(countResult.rows[0]?.total || '0'),
      last_export: lastExport,
      current_content_hash: currentContentHash,
      content_changed_since_last_export: lastHash === null ? null : lastHash !== currentContentHash,
    });
  } catch (error) {
    console.error('GET /docs/:id/exports', error);
    res.status(500).json({ success: false, error: 'Failed to list exports' });
  }
});

// DELETE /api/authoring/export-history/:id - Delete export history entry
router.delete('/export-history/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId(req);
    /* SECURITY (21 CFR Part 11): DELETING a filing's export-history record is a
       governed action and must be attributed to the VERIFIED principal. This
       read `x-user-email || 'system'` — a header the router's middleware clears,
       falling through to the anonymous 'system' that is nobody, and the value
       drove BOTH the permission check (`entry.exported_by !== userEmail`) and
       the EXPORT_HISTORY_DELETED audit event. Use getActorEmail, the JWT-derived
       accessor every other governed mutation here uses, and fail closed when the
       token carries no identity rather than record a record-deletion against
       'system'. */
    const userEmail = getActorEmail(req);
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has permission (only QA or the original exporter can delete)
    const roles = ((req.headers as any)['x-roles'] || '').toString().toUpperCase();
    const isQA = roles.includes('QA');

    // Get the export entry
    const exportEntry = await pool.query(
      `SELECT exported_by, document_id FROM authoring_export_history
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (((exportEntry.rowCount ?? 0) === 0)) {
      return res.status(404).json({ error: 'Export entry not found' });
    }

    const entry = exportEntry.rows[0];

    // Check permission
    if (!isQA && entry.exported_by !== userEmail) {
      return res.status(403).json({
        error: 'Permission denied. Only QA or the original exporter can delete this entry.',
      });
    }

    // Delete the entry
    await pool.query(`DELETE FROM authoring_export_history WHERE id = $1 AND tenant_id = $2`, [
      id,
      tenantId,
    ]);

    // Log the deletion
    await createAuditEvent(
      entry.document_id,
      'EXPORT_HISTORY_DELETED',
      userEmail,
      { export_id: id, deleted_by: userEmail },
      tenantId
    );

    res.json({ success: true, message: 'Export history entry deleted successfully' });
  } catch (error) {
    console.error('DELETE /export-history/:id', error);
    res.status(500).json({ error: 'Failed to delete export history entry' });
  }
});

// Diff since latest export = tokens created/updated after export timestamp
router.get('/docs/:docId/diff-since-export', async (req: Request, res: Response) => {
  try {
    // Reads authoring_export_history — the table recordExport() actually writes.
    // This previously read `doc_exports`, which no migration and no runtime DDL
    // in this repo creates, so the query threw "relation does not exist" and the
    // catch below turned every call into a 500. See ledger C-14.
    await ensureExportHistoryTableExists();
    const tenantId = getTenantId(req);
    /* Same guard as GET …/exports, for the same reason: an unknown or
       cross-tenant docId answered `{ baseline: null, changed: [] }`, which is
       the response a real document with no export yet gets. Those are opposite
       facts. Nothing surfaces the difference today — the Exports rail renders
       citation drift only when `baseline` is non-null — but a future caller
       reading "no exports" for a document it cannot see is a defect waiting on
       a caller, which is precisely how the rest of this router accumulated its
       silent 500s. */
    if (!(await documentExistsForTenant(req.params.docId, tenantId))) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    const lastExportResult = await pool.query(
      `
      SELECT COALESCE(exported_at, created_at) AS exported_at
      FROM authoring_export_history
      WHERE document_id = $1 AND tenant_id = $2
      ORDER BY COALESCE(exported_at, created_at) DESC LIMIT 1
    `,
      [req.params.docId, tenantId]
    );

    if (((lastExportResult.rowCount ?? 0) === 0)) {
      return res.json({ baseline: null, changed: [] });
    }

    const lastExport = lastExportResult.rows[0];
    const tokens = await listDocTokens(req.params.docId, tenantId);
    const t0 = new Date(lastExport.exported_at).getTime();
    const changed = tokens.filter(t => new Date(t.created_at).getTime() > t0);

    res.json({
      baseline: lastExport.exported_at,
      count: changed.length,
      changed,
    });
  } catch (error) {
    console.error('GET /docs/:id/diff-since-export', error);
    res.status(500).json({ error: 'Diff failed' });
  }
});

// Refresh ALL source citations in a document (skips frozen).
//
// This handler was broken three ways at once, which is part of why nothing ever
// noticed the refresh it drove was simulated:
//   1. `WHERE document_id = $1` — the column is `doc_id`, so every call raised
//      42703 and returned 500. The endpoint had never once succeeded.
//   2. Neither query filtered `tenant_id`, so had it worked it would have walked
//      another tenant's sections and citations.
//   3. It re-entered the API over HTTP against its own host with no Authorization
//      header, so each inner call would have failed the JWT gate anyway.
// Now: one tenant-scoped read, and a direct service call per citation.
router.post('/docs/:docId/refresh-all', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { refreshSourceCitation } = await import(
      '../services/clinical-regulatory-evidence/source-usage.service.js'
    );

    const cites = await pool.query<{ cite_id: string }>(
      `SELECT c.id AS cite_id
         FROM authoring_citations c
         JOIN authoring_sections s ON s.id = c.section_id AND s.tenant_id = c.tenant_id
        WHERE s.doc_id = $1 AND c.tenant_id = $2 AND c.frozen_at IS NULL
        ORDER BY c.created_at ASC`,
      [req.params.docId, tenantId]
    );

    let refreshed = 0;
    let changed = 0;
    const skipped: Array<{ cite_id: string; reason: string }> = [];
    for (const cite of cites.rows) {
      const outcome = await refreshSourceCitation(tenantId, cite.cite_id);
      if (outcome.ok) {
        refreshed++;
        if (outcome.changed) changed++;
      } else {
        // Reported, not silently counted as refreshed. A citation with no source
        // behind it is exactly what the caller needs to see.
        skipped.push({ cite_id: cite.cite_id, reason: outcome.reason });
      }
    }

    res.json({ ok: true, refreshed, changed, skipped });
  } catch (error) {
    console.error('POST /docs/:id/refresh-all', error);
    res.status(500).json({ error: 'Refresh-all failed' });
  }
});

// Step 8: export logging — DONE. POST /docs/:docId/export calls logExport() after
// generating the file, so the record carries the real file name and size.

// ============= Step 10: Templates API =============

// Helper function to get templates directory
function templatesDir() {
  return path.join(process.cwd(), 'server', 'templates', 'm3');
}

// Load templates from disk
function loadTemplates(locale: string | null) {
  const dir = templatesDir();
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const templates = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const template = JSON.parse(content);

      // Filter by locale if specified
      if (!locale || (Array.isArray(template.locale) && template.locale.includes(locale))) {
        templates.push(template);
      }
    } catch (e) {
      console.warn('Template parse failed:', file, e);
    }
  }

  return templates;
}
// POST /api/authoring/docs/:docId/apply-template - Apply template to document
router.post('/docs/:docId/apply-template', async (req: Request, res: Response) => {
  try {
    const { templateKey, mode = 'merge' } = req.body || {};
    const tenantId = getTenantId(req);

    if (!templateKey) {
      return res.status(400).json({ error: 'templateKey required' });
    }

    // Get document locale — tenant-scoped. The section writes below were
    // already scoped; this read was the one predicate-free query left in the
    // handler, and 404-vs-200 on it confirmed whether a guessed document UUID
    // exists in another organization (plus that document's locale).
    const docResult = await pool.query(
      'SELECT locale FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
      [req.params.docId, tenantId]
    );

    if (((docResult.rowCount ?? 0) === 0)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const locale = docResult.rows[0].locale || 'en';
    const template = loadTemplates(locale).find(x => x.templateKey === templateKey);

    if (!template) {
      return res.status(404).json({ error: 'Template not found for current locale' });
    }

    // COLUMN NAMES. authoring_sections is (id, doc_id, code, title, content,
    // order_index, track_changes, tenant_id, created_at, updated_at) — see
    // db/migrations/20260725_authoring_document_loop_tables.sql. There is no
    // ALTER TABLE for it anywhere, so that is the complete schema.
    //
    // This block used `document_id`, `order_idx`, `created_by` and `updated_by`:
    // four columns that do not exist. Every statement below was an
    // unconditional 42703, so applying a template has never once succeeded.
    // `order_idx` is the field name in the template JSON on disk, which is
    // where the confusion came from — it is not the column name.
    //
    // TENANCY. The SELECT and UPDATE also matched on document/section id alone.
    // Left unscoped, fixing only the column names would have converted a broken
    // statement into a working cross-tenant write — a template applied to
    // another tenant's document. tenantId is already resolved above; it is now
    // in every predicate.
    // `content` is selected as well as id/code because overwrite mode has to
    // snapshot what it is about to destroy — see the createRevision call below.
    const existingResult = await pool.query(
      'SELECT id, code, content FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2',
      [req.params.docId, tenantId]
    );

    const existingMap = new Map<string, { id: string; content: string | null }>(
      existingResult.rows.map(x => [x.code, { id: x.id, content: x.content ?? null }]),
    );

    let upserts = 0;

    /* Every content write below passes the lineage gate and lands a ledger
       revision, inside ONE transaction — the identical rule the interactive
       save, the AI accept and the revert follow. Template apply was the last
       content writer outside it: it wrote sections with no lineage and (for
       the insert branch) no revision at all, so a template-applied section
       had provenance for neither its words nor its arrival. */
    const applyActor = getActorId(req) ?? 'template';
    const txClient = await pool.connect();
    try {
    await txClient.query('BEGIN');
    /* 2026-09-23 (W5/D7, co-author final pass): the lock. Every other section
       writer consults document-lock.ts; this one did not, so any org member
       could overwrite (or add to) the sections of an APPROVED or FROZEN
       document — its seal then no longer matched and it could never be filed
       or re-sealed again. The document row is locked for the transaction, so
       a freeze or approval cannot land between this check and the writes. */
    await txClient.query(
      'SELECT id FROM authoring_documents WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [req.params.docId, tenantId]
    );
    const lock = await checkDocumentWritable(txClient, String(req.params.docId), tenantId);
    if (!lock.writable) {
      await txClient.query('ROLLBACK');
      return lock.code === 'DOCUMENT_FROZEN'
        ? res.status(403).json({ error: 'DOCUMENT_FROZEN', message: lock.reason })
        : res.status(404).json({ error: 'Document not found' });
    }
    // Apply template sections
    for (const section of template.sections || []) {
      const existing = existingMap.get(section.code);
      const existingId = existing?.id;

      if (existingId && mode !== 'overwrite') {
        // In merge mode, skip existing sections
        continue;
      }

      if (existingId) {
        // PART 11. Overwrite mode replaces authored content with template
        // boilerplate. Every other content-changing path in this router
        // snapshots first via createRevision (the section PATCH at ~:1600, the
        // revert at ~:1784); this one did not, so applying a template in
        // overwrite mode destroyed an author's work with no recoverable
        // history.
        //
        // It went unnoticed because the whole handler was dead: it referenced
        // document_id/order_idx/created_by, none of which are columns, so every
        // statement was an unconditional 42703. Repairing those column names
        // made this path reachable for the first time — which makes closing
        // this gap part of that same change, not a follow-up.
        //
        // Snapshot before the UPDATE, not after: the point is to preserve the
        // superseded text.
        if (existing?.content) {
          await createRevision(existingId, existing.content, applyActor, tenantId, txClient, 'pre-template-snapshot');
        }

        // Update existing section
        const templContent = JSON.stringify(section.content || {});
        await txClient.query(
          `UPDATE authoring_sections
              SET title = $2, order_index = $3, content = $4, updated_at = NOW()
            WHERE id = $1 AND tenant_id = $5`,
          [
            existingId,
            section.title || '',
            section.order_idx || 0,
            templContent,
            tenantId,
          ]
        );
        await enforceAuthorLineage(
          txClient,
          tenantId,
          { documentTable: 'authoring_sections', documentId: String(existingId) },
          templContent,
          applyActor,
        );
        await createRevision(existingId, templContent, applyActor, tenantId, txClient, 'template-apply');
        upserts++;
      } else {
        // Insert new section
        const newSectionId = crypto.randomUUID();
        const templContent = JSON.stringify(section.content || {});
        await txClient.query(
          `INSERT INTO authoring_sections (id, doc_id, code, title, order_index, content, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            newSectionId,
            req.params.docId,
            section.code,
            section.title || '',
            section.order_idx || 0,
            templContent,
            tenantId,
          ]
        );
        await enforceAuthorLineage(
          txClient,
          tenantId,
          { documentTable: 'authoring_sections', documentId: newSectionId },
          templContent,
          applyActor,
        );
        await createRevision(newSectionId, templContent, applyActor, tenantId, txClient, 'template-apply');
        upserts++;
      }
    }
    await txClient.query('COMMIT');
    } catch (txErr) {
      await txClient.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      txClient.release();
    }

    res.json({ ok: true, upserts });
  } catch (error) {
    console.error('POST /docs/:id/apply-template', error);
    res.status(500).json({ error: 'Failed to apply template' });
  }
});

/* REMOVED: GET /guidance/compose — unreachable by construction since the day
   it was written. Express matches in registration order and GET
   /guidance/:sectionId registers ~3,600 lines earlier, so this path bound
   sectionId='compose'; that handler then ran `WHERE s.id = 'compose'` against
   a UUID column, which is a Postgres 22P02 on every call — a permanent 500.
   Even if it had been reachable, its body was a hardcoded two-entry guidance
   map presented as a guidance service. The real per-section guidance read is
   GET /guidance/:sectionId (section_guidance + template_guidance tables). */

/* POST /api/authoring/docs/:docId/seed-stability has been DELETED.
 *
 * It spawned `node scripts/seed-stability.mjs` from a request handler, with no
 * caller anywhere and no environment guard of any kind — so a UAT fixture
 * seeder, defaulting to product_code 'UAT-PROD' and study_code 'SS-UAT-001',
 * was reachable over HTTP by any authenticated user in any deployment
 * including production. CLAUDE.md's working agreement is explicit: no fixture
 * data in governed paths. This was the mechanism for putting it there.
 *
 * It was also broken in a way that would have hidden its own failures. The
 * handler ended with
 *
 *     process.on('error', …)
 *
 * — the GLOBAL Node process, not the spawned child. A child that failed to
 * start emits 'error' on `childProcess`, which nothing listened to, so the
 * request hung rather than answering; and every call added another permanent
 * listener to the global process, each closing over a response object long
 * since finished.
 *
 * scripts/seed-stability.mjs is KEPT. Its own header documents it as a command
 * an operator runs (`node scripts/seed-stability.mjs`), which is the right
 * shape for a seeder: a deliberate act at a terminal, not an endpoint on the
 * governed authoring API.
 */


// DELETE /docs/:docId (UAT-only; admin-guarded) - Step 12: Fixture Cleanup
router.delete('/docs/:docId', async (req: Request, res: Response) => {
  try {
    const adminHeader = req.headers['x-admin-token'];
    if (!process.env.ADMIN_TOKEN || adminHeader !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'admin token required' });
    }

    const doc = (
      await getPool().query(
        `SELECT id as doc_id, product_code FROM authoring_documents WHERE id = $1`,
        [req.params.docId]
      )
    ).rows[0];

    if (!doc) return res.status(404).json({ error: 'document not found' });

    // UAT naming convention guard
    if (!doc.product_code || !/^UAT-/i.test(doc.product_code)) {
      return res.status(409).json({
        error: "document not UAT-scoped (product_code must start with 'UAT-')",
      });
    }

    // 21 CFR Part 11 §11.10(e): record the deletion before removing the
    // document. auditService persists to audit_logs + the tamper-proof
    // hash-chain log (best-effort by design — it never throws).
    await auditService.logAction({
      action: 'authoring_document.deleted',
      resourceType: 'authoring_document',
      resourceId: String(req.params.docId),
      details: { productCode: doc.product_code, via: 'admin-uat-cleanup' },
    });

    await getPool().query(`DELETE FROM authoring_documents WHERE id = $1`, [req.params.docId]);
    res.json({ ok: true, deleted: req.params.docId });
  } catch (error) {
    console.error('DELETE /docs/:id', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

/* POST and GET /docs/:docId/permissions have been DELETED from this router.
 *
 * They were UNREACHABLE. server/bootstrap/register-inline-routes.ts mounts
 * authoringPermissionsRouter on '/api' at line 312 — BEFORE this router is
 * mounted on '/api/authoring' at 319 — and that router registers
 * '/authoring/docs/:docId/permissions' with the prefix baked in, so it owns the
 * same full path and never calls next(). Express matched it first, every time.
 * These two handlers had never run.
 *
 * They were also a divergent second implementation of a governed capability.
 * What the canonical one in authoring-permissions.ts does that these did not:
 * an explicit permission-manager authorization gate, a reason-for-change, an
 * expiry (validUntil), structured error codes, and — the one that matters most
 * here — recordPermissionAudit on grant and revoke. The legacy POST below wrote
 * a bare INSERT INTO doc_permissions with NO audit row and no ON CONFLICT, and
 * there was no revoke at all.
 *
 * Worth naming what this cost, because it is the argument for deleting rather
 * than leaving dead code in place: the deleted POST carried a careful C2C-AUTHOR-002
 * tenant-scoping fix — a role allowlist, a document-in-tenant check, a
 * section-belongs-to-this-document check, each with its own 404 and an
 * explanatory comment. That work was written into a route Express never reaches,
 * and anyone reading it would reasonably believe those guards were in force. The
 * canonical router's requirePermissionManager does the same scoping properly
 * (resolveAuthoringDocumentScope against the verified tenant, 404 on a miss), so
 * nothing is lost by removing them — but a reader's confidence was.
 */

// ============= EXPORT Operations =============

// POST /api/authoring/docs/:docId/export - Export document in various formats
router.post('/docs/:docId/export', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { format = 'docx', options = {} } = req.body;
    const tenantId = getTenantId(req);
    /* SECURITY (21 CFR Part 11): the exporter recorded on the EXPORT audit row
       and in the export ledger must come from the verified JWT — never from
       `req.body.exported_by`, which the caller controls. */
    const exportedBy = getActorEmail(req);
    if (!exportedBy) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate format
    if (!EXPORT_FORMATS.includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Must be docx, pdf, or xml' });
    }

    // Get document and sections
    const docResult = await pool.query(
      'SELECT id, title, module, product_code, locale, status, created_at, updated_at, created_by, template_id, submitted_at, current_workflow_id, approved_at, frozen_at, locked_at, locked_by, tenant_id, version FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
      [docId, tenantId]
    );

    if (((docResult.rowCount ?? 0) === 0)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    /* SECURITY (21 CFR Part 11 §11.50): EXPORT IS A FILING ARTIFACT, NOT A
       PREVIEW — gate it on the record being sealed. A DRAFT / IN_REVIEW
       document has no immutable snapshot and no certified signature manifest,
       so exporting it byte-for-byte like an approved one would present
       whatever reviewer signatures exist as certifying a final record nobody
       approved. Fail closed: refuse unless the document is in a LOCKED/sealed
       state — the same canonical LOCKED_DOCUMENT_STATUSES set the write gate
       uses, plus an explicit locked_at. 409 says the document's state — not
       the caller's authority — forbids the action. Freeze or approve it first.
       (The project-vault filing of a working draft is a different act and says
       so on page one; see POST /docs/:docId/file-to-vault.) */
    const sealedForExport =
      LOCKED_DOCUMENT_STATUSES.has(String(doc.status ?? '').toUpperCase()) ||
      doc.locked_at != null;
    if (!sealedForExport) {
      return res.status(409).json({
        error: 'Document not approved for export',
        message:
          `Only an approved or frozen document can be exported as a 21 CFR Part 11 filing artifact. ` +
          `This document is still editable (status: ${doc.status ?? 'unknown'}) — it has no immutable ` +
          `snapshot and no certified electronic-signature manifest. Freeze or approve it first.`,
      });
    }

    const sectionsResult = await pool.query(
      'SELECT id, doc_id, code, title, content, order_index, track_changes, created_at, updated_at, tenant_id FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index',
      [docId, tenantId]
    );

    const exportId = crypto.randomUUID();
    /* The digest of the rows about to be rendered — one read, so the hash on
       the export record, the manifest's verdicts and the refusal below all
       describe the same content. Same function the signing routes store as
       content_hash (sectionsDigest via computeDocHash). */
    const fileHash = sectionsDigest(sectionsResult.rows);

    // The export record is written by logExport() AFTER the file is generated,
    // so file_name and file_size are the real ones (ledger C-14).

    /* §11.70 — a sealed record's signatures have to cover it.

       Narrow on purpose. A signature that does not match is usually NOT a
       fault: an AUTHOR signature does not lock the document, so the ordinary
       flow (author signs, editing continues, approver signs the final text)
       leaves the author's signature legitimately covering earlier content, and
       the manifest says so per signature. What cannot be right is a document
       this route has already required to be sealed (above) carrying signatures
       of which NOT ONE covers the content being filed: the content moved after
       it was sealed, and the manifest would attest to a record nobody signed.

       Checked BEFORE the EXPORT audit event, so a refusal leaves no record of
       an export that never happened. */
    const exportSignatures = await readSignaturesForExport(pool, String(docId), tenantId);
    if (exportSignatures.length > 0 && !anySignatureCovers(exportSignatures, fileHash)) {
      return res.status(409).json({
        error: 'Signatures do not cover this document',
        code: 'SIGNATURE_CONTENT_MISMATCH',
        message:
          'Every signature on this document was applied to different content than the ' +
          'sections it now contains, so none of them covers what would be exported. ' +
          'Exporting would produce a filing whose signature manifestation attests to a ' +
          'record it does not contain (21 CFR 11.70). Re-sign the document as it now ' +
          'stands, or restore the content that was signed.',
        exportedContentHash: fileHash,
        signatureCount: exportSignatures.length,
      });
    }

    // Create audit event
    await createAuditEvent(
      docId,
      'EXPORT',
      exportedBy as string,
      { format, exportId, options },
      tenantId
    );

    /* The rendering — the §11.50(b) manifest, figures, cross-references,
       citations and captions resolved once, and the XML / DOCX / PDF branches —
       is services/authoring/authoring-export.ts renderAuthoringExport, shared
       with the project-vault filing so the two cannot drift. */
    const rendered = await renderAuthoringExport({
      executor: pool,
      tenantId,
      doc,
      sections: sectionsResult.rows,
      format,
      signatures: exportSignatures,
    });

    /* §11.10(b): the record carries a hash of the SOURCE section rows
       (doc_sha256, for content_changed_since_last_export) AND of the DELIVERED
       ARTIFACT BYTES (artifactSha256), so it can attest that a re-download is
       the identical artifact. */
    await logExport(pool, {
      docId: String(docId),
      format,
      docSha256: fileHash,
      exportedBy: exportedBy as string,
      fileName: rendered.fileName,
      fileSize: rendered.fileContent.length,
      metadata: { options, exportId, artifactSha256: rendered.artifactSha256 },
      tenantId,
    });

    res.setHeader('Content-Type', rendered.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${rendered.fileName}"`);
    res.send(rendered.fileContent);
  } catch (error) {
    // The raw error goes to the LOG only. This body feeds the client's export
    // toast verbatim, and a library/DB message here was the one remaining path
    // for exception text to reach the UI (BP-W0-5).
    console.error('Export error:', error);
    res.status(500).json({
      error: 'Export failed',
      message: 'The export could not be rendered. No file was produced; the document is unchanged.',
    });
  }
});

// POST /api/authoring/docs/:docId/file-to-vault — render (the export renderer),
// ingest (the vault ingest service, in-process), file (the project-vault
// filing service) and record ONE governed action, or nothing (WM, 2026-09-21).
//
// body { format: 'pdf' | 'docx', folderId?, documentType? }
// → 201 { data: { vaultDocumentId, folder, sha256, format } }
// 409 DOCUMENT_HAS_NO_PROGRAM / DOCUMENT_MID_FREEZE; the ingest's own refusals
// (400/403/409/503) pass through with their codes. Never a partial write: a
// failure after the vault row was admitted reverts it (see the service).
router.post('/docs/:docId/file-to-vault', async (req: Request, res: Response) => {
  try {
    const tenantId = authedOrgId(req);
    if (tenantId == null) {
      return res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Tenant context required' } });
    }
    const actorId = getActorId(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const format = typeof body.format === 'string' ? body.format.trim().toLowerCase() : '';
    if (!(VAULT_FILE_FORMATS as readonly string[]).includes(format)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: `format must be one of: ${VAULT_FILE_FORMATS.join(', ')}` },
      });
    }
    if (body.folderId !== undefined && body.folderId !== null && !isPlausibleFolderId(body.folderId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FOLDER', message: 'folderId must be a vault folder id (a short slug).' },
      });
    }
    const outcome = await fileAuthoringDocumentToVault({
      ...createContext(req, tenantId, actorId),
      docId: String(req.params.docId),
      format: format as VaultFileFormat,
      folderId: typeof body.folderId === 'string' ? body.folderId : null,
      documentType: typeof body.documentType === 'string' ? body.documentType : null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    if (outcome.kind === 'refused') {
      return res.status(outcome.status).json({ success: false, error: { code: outcome.code, message: outcome.error } });
    }
    res.status(201).json({
      success: true,
      data: {
        vaultDocumentId: outcome.vaultDocumentId,
        folder: outcome.folder,
        sha256: outcome.sha256,
        format: outcome.format,
        fileName: outcome.fileName,
        programId: outcome.programId,
        sealed: outcome.sealed,
      },
    });
  } catch (error) {
    console.error('File-to-vault error:', error);
    return serverError(res, logger, 'filing to vault', error, { docId: req.params.docId });
  }
});

// This endpoint is replaced by the enhanced version above

// ============= SUBMIT Operations =============

// POST /api/authoring/docs/:docId/submit - Submit document for review
router.post('/docs/:docId/submit', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { workflow_steps = [{ role: 'QA' }, { role: 'RA_CMC' }] } = req.body;
    const tenantId = getTenantId(req);
    // SECURITY (21 CFR Part 11): the document submitter recorded in the audit
    // event must come from the verified JWT, never from x-user-email /
    // req.body.submitted_by.
    const submittedBy = getActorEmail(req);
    if (!submittedBy) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check document exists and is in DRAFT status
    const docResult = await pool.query(
      'SELECT id, title, module, product_code, locale, status, created_at, updated_at, created_by, template_id, submitted_at, current_workflow_id, approved_at, frozen_at, locked_at, locked_by, tenant_id, version FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
      [docId, tenantId]
    );

    if (((docResult.rowCount ?? 0) === 0)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];
    if (doc.status !== 'DRAFT' && doc.status !== 'draft') {
      return res.status(400).json({ error: 'Document must be in DRAFT status to submit' });
    }

    // Every step needs the approver it will be matched against on approval
    // (`approver_email = $3` in the approve route). Inventing
    // `qa@company.com` from the role produced a step nobody could approve —
    // or someone unintended could (ledger L152).
    const steps = workflow_steps as Array<{ role?: string; approver_email?: unknown }>;
    const stepWithoutApprover = steps.findIndex(
      (s) => typeof s?.approver_email !== 'string' || !s.approver_email.trim()
    );
    if (stepWithoutApprover >= 0) {
      return res.status(400).json({
        error: `Workflow step ${stepWithoutApprover + 1} has no approver_email; every step needs the approver it will be matched against`,
      });
    }

    // Create workflow
    const workflowId = crypto.randomUUID();

    // Create workflow steps
    for (let i = 0; i < workflow_steps.length; i++) {
      const step = workflow_steps[i];
      await pool.query(
        `INSERT INTO authoring_workflow_steps
         (workflow_id, doc_id, step_no, role, approver_email, status, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, NOW())`,
        [
          workflowId,
          docId,
          i + 1,
          step.role,
          step.approver_email,
          tenantId,
        ]
      );
    }

    // Update document status
    await pool.query(
      `UPDATE authoring_documents
       SET status = 'IN_REVIEW', submitted_at = NOW(), current_workflow_id = $1
       WHERE id = $2 AND tenant_id = $3`,
      [workflowId, docId, tenantId]
    );

    // Create audit event
    await createAuditEvent(
      docId,
      'SUBMIT',
      submittedBy as string,
      { workflowId, steps: workflow_steps },
      tenantId
    );

    // Connect this governed transition to the ONE canonical document spine:
    // commit the assembled document into concept2cure_artifacts (version + Part 11
    // audit + review-state + placement + readiness) so the authoring surface and
    // the canonical record move together. Fail-soft and conservative — it only
    // writes when a project id and a numeric actor are present (correct scoping +
    // attribution), and never breaks submit if it cannot. See
    // authoring-canonical-bridge.ts for why it skips rather than guesses.
    let canonical: { bridged: boolean; reason?: string } = { bridged: false, reason: 'not attempted' };
    try {
      const { bridgeAuthoringToCanonical, defaultAuthoringBridgeDeps } = await import(
        '../services/ana/authoring-canonical-bridge.js'
      );
      const projectId = typeof req.body?.project_id === 'number' ? req.body.project_id : null;
      const actorRaw = req.user?.id ?? req.user?.userId;
      const numericActor = Number.isInteger(Number(actorRaw)) ? Number(actorRaw) : null;
      const outcome = await bridgeAuthoringToCanonical(
        {
          docId: String(docId),
          organizationId: tenantId,
          projectId,
          userId: numericActor,
          reason: `Submitted for review by ${submittedBy}`,
          triggerReview: true,
        },
        defaultAuthoringBridgeDeps(),
      );
      canonical = { bridged: outcome.bridged, reason: outcome.reason };
      if (!outcome.bridged) {
        logger.info('authoring→canonical bridge skipped on submit', { docId, reason: outcome.reason });
      }
    } catch (bridgeErr) {
      canonical = {
        bridged: false,
        reason: bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr),
      };
      logger.warn('authoring→canonical bridge errored on submit (submit still succeeded)', {
        docId,
        err: canonical.reason,
      });
    }

    res.json({
      success: true,
      message: 'Document submitted for review',
      workflowId,
      steps: workflow_steps.length,
      canonical,
    });
  } catch (error) {
    console.error('Submit error:', error);
    return serverError(res, logger, 'submitting docs', error);
  }
});

// GET /api/authoring/docs/:docId/workflow - Get current workflow status
router.get('/docs/:docId/workflow', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const tenantId = getTenantId(req);

    // Get current workflow ID from document
    const docResult = await pool.query(
      'SELECT current_workflow_id FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
      [docId, tenantId]
    );

    if (((docResult.rowCount ?? 0) === 0) || !docResult.rows[0].current_workflow_id) {
      return res.json({ success: true, workflow: null });
    }

    const workflowId = docResult.rows[0].current_workflow_id;

    const stepsResult = await pool.query(
      `SELECT workflow_id, doc_id, step_no, role, approver_email, status, decision_note, decided_at, created_at, tenant_id FROM authoring_workflow_steps
       WHERE workflow_id = $1 AND tenant_id = $2
       ORDER BY step_no`,
      [workflowId, tenantId]
    );

    res.json({ success: true, workflowId, steps: stepsResult.rows });
  } catch (error) {
    console.error('Error getting workflow:', error);
    res.status(500).json({ error: 'Failed to get workflow status' });
  }
});

/**
 * The last workflow signature has cleared the chain: approve the document and
 * leave the immutable record that approval means.
 *
 * Lifted out of POST /docs/:docId/sign as one named act, because it is one:
 * the status flip and the freeze must land together or not at all, and at four
 * blocks deep inside the handler that pairing was something a reader had to
 * reconstruct. It runs on the CALLER'S transaction client for exactly that
 * reason — it is not a step that may independently succeed.
 */
async function approveAndFreezeDocument(args: {
  client: Queryable;
  docId: string;
  tenantId: number;
  signerEmail: string;
  contentHash: string;
}): Promise<void> {
  const { client, docId, tenantId, signerEmail, contentHash } = args;
  await client.query(
    `UPDATE authoring_documents
     SET status = 'APPROVED', approved_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [docId, tenantId]
  );

  // Auto-freeze on approval — the final workflow signature approving the
  // document must leave the same immutable legal record the e-sign
  // APPROVER path produces. Without this the /sign workflow ended a
  // document APPROVED with NO frozen_documents row: the approved content
  // survived only in the editable authoring_sections table, and this
  // approval signature's covered_freeze_version / covered_content_hash
  // (bound above to `covered`, the pre-existing snapshot) were null —
  // an approval that attests to "no snapshot". Mirror the proven e-sign
  // pattern exactly: capture the FULL {document, sections, approvedBy,
  // documentHash, frozenAt} snapshot, set content_hash to sha256 of the
  // SNAPSHOT BYTES (so GET /docs/:docId/frozen's recompute-and-compare
  // verifies), and INSERT ... ON CONFLICT DO NOTHING on THIS transaction
  // client so the freeze lands with the status flip or rolls back with it.
  const approvedDoc = await client.query(
    'SELECT * FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
    [docId, tenantId]
  );
  const approvedSections = await client.query(
    // 2026-09-23 (W5/D7, co-author final pass): the seal's section order is the editor's
    // (order_index, created_at; id makes it total), the order the filing copy assembles in.
    'SELECT id, doc_id, code, title, content, order_index, track_changes, created_at, updated_at, tenant_id FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index, created_at, id',
    [docId, tenantId]
  );
  const frozenContent = JSON.stringify({
    document: approvedDoc.rows[0] ?? null,
    sections: approvedSections.rows,
    approvedBy: signerEmail,
    documentHash: contentHash,
    frozenAt: new Date().toISOString(),
  });
  const frozenContentHash = crypto.createHash('sha256').update(frozenContent).digest('hex');

  await client.query(
    `INSERT INTO frozen_documents
     (document_id, version, frozen_content, content_hash, frozen_by, frozen_reason, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (document_id, version, tenant_id) DO NOTHING`,
    [docId, 'approved', frozenContent, frozenContentHash, signerEmail, 'Approved and frozen', tenantId]
  );
}

/**
 * Advance this document's approval workflow on the strength of one signature.
 *
 * Only a signer whose VERIFIED roles carry the signature's meaning (or QA /
 * RA_CMC) decides a step; when that clears the last pending step of a workflow
 * that actually exists, the document is approved and frozen. Everything runs on
 * the caller's transaction client, so a signature and the step it approves land
 * together or not at all.
 */
async function advanceWorkflowForSignature(args: {
  client: Queryable;
  req: Request;
  docId: string;
  tenantId: number;
  signerEmail: string;
  meaning: string;
  reason: string;
  contentHash: string;
}): Promise<void> {
  const { client, req, docId, tenantId, signerEmail, meaning, reason, contentHash } = args;
  // Update workflow step if applicable. Roles come from the VERIFIED token
  // (req.user.roles), not from the x-roles header — the header is derived from
  // claims by this router's JWT middleware, but reading the claim directly
  // means an approval decision can never depend on a mutable header at all
  // (ledger C-18).
  const userRoles = (((req.user as { roles?: unknown } | undefined)?.roles ?? []) as unknown[])
    .map((r) => String(r).toUpperCase());
  if (userRoles.includes(meaning) || userRoles.includes('QA') || userRoles.includes('RA_CMC')) {
    await client.query(
      `UPDATE authoring_workflow_steps
       SET status = 'APPROVED', decision_note = $1, decided_at = NOW()
       WHERE doc_id = $2 AND approver_email = $3 AND status = 'PENDING' AND tenant_id = $4`,
      [reason, docId, signerEmail, tenantId]
    );

    /* Are all approvals in — or were there never any?
       This counted only PENDING steps and treated '0' as "all approved".
       That count is also '0' when NO STEPS EXIST, and the only thing that
       creates them is POST /docs/:docId/submit, which has no caller
       anywhere in the client. So on the ordinary path — a document never
       submitted for approval — the first APPROVER signature found zero
       pending steps, concluded the chain was complete, flipped the document
       to APPROVED and inserted a frozen_documents row. An approval chain
       that was never required read exactly like one that finished, and the
       result is the strongest and least reversible transition in this
       lifecycle: APPROVED is sealed, and the content becomes immutable.

       A check that ran zero assertions must not report a pass. The total is
       counted alongside the pending, and the flip now requires that an
       approval workflow actually EXISTED and is complete. A document with
       no workflow is signed — the signature above is recorded either way —
       and simply not approved, which is the truth about it. */
    const stepCounts = await client.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
              COUNT(*) AS total
         FROM authoring_workflow_steps
        WHERE doc_id = $1 AND tenant_id = $2`,
      [docId, tenantId]
    );
    const totalSteps = Number(stepCounts.rows[0]?.total ?? 0);
    const pendingCount = Number(stepCounts.rows[0]?.pending ?? 0);

    if (totalSteps > 0 && pendingCount === 0) {
      await approveAndFreezeDocument({ client, docId, tenantId, signerEmail, contentHash });
    }
  }
}

/**
 * What this signature is bound to: the document's content hash, the frozen
 * snapshot it attests to, and the digest over both.
 *
 * The digest used to hash `new Date().toISOString()`, which made it impossible
 * for anyone to recompute — a hash nobody can reproduce proves nothing. It
 * covers only durable columns, including the frozen snapshot (§11.70
 * signature/record link, C-11 residual 2), which is why the three are computed
 * in one place rather than assembled at each signing path.
 */
async function computeSignatureBinding(
  docId: string,
  tenantId: number,
  signerEmail: string,
  meaning: string,
) {
  const contentHash = await computeDocHash(docId, tenantId);
  const covered = await currentFrozenSnapshot(docId, tenantId);
  const signatureDigest = computeSignatureDigest({
    signerEmail,
    meaning,
    contentHash,
    coveredContentHash: covered?.contentHash ?? null,
  });
  return { contentHash, covered, signatureDigest };
}

// ============= SIGN Operations =============

// POST /api/authoring/docs/:docId/sign - Sign document (21 CFR Part 11)
router.post('/docs/:docId/sign', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { meaning = 'REVIEWER', reason } = req.body;
    const tenantId = getTenantId(req);
    // Part 11 §11.100: the signer is the VERIFIED principal. This took its
    // identity from `x-user-email || req.body.signer_email || 'system'`, so a
    // caller could sign as anyone — or as "system", which is nobody. The defect
    // survived because this endpoint writes authoring_signatures, a table that
    // did not exist, so it failed before attribution ever mattered. See C-11
    // residual 1 and C-18.
    const signerEmail = getActorEmail(req);
    if (!signerEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // §11.50(a)(1) printed name — see resolveSignerName. NULL when the user
    // record yields none, so a manifestation can say so rather than render an
    // address as a printed name.
    const signerName = await resolveSignerName(signerEmail as string);

    // §11.10(g) authority, before the credentials — same reasoning as /e-sign.
    // This path also advances a workflow step, and it already consulted the
    // caller's roles to decide THAT (below); it never consulted them to decide
    // whether the signature itself could be applied.
    if (!(await assertSigningAuthority(req, res))) return;

    // Validate required fields
    if (!reason) {
      return res.status(400).json({ error: 'A reason is required for signing' });
    }

    // §11.50(a)(3) — the MEANING of the signature is a closed set, and this
    // path took it as a free string with a default. `/e-sign` has validated it
    // against this same list since it was written; this one did not, so an
    // arbitrary token could be stored as the meaning of a legally binding
    // attestation and would render verbatim in any manifestation of it.
    if (!SIGNATURE_MEANINGS.includes(meaning)) {
      return res.status(400).json({ error: 'Invalid signature meaning' });
    }

    // §11.70 — the signature must be linked to a real record in this tenant.
    if (!(await documentExistsForTenant(docId, tenantId))) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // §11.200(a)(1): the signer re-verified by the platform ceremony, last.
    const signer = await reverifyAuthoringSigner(req, res);
    if (!signer) return;

    const { contentHash, covered, signatureDigest } = await computeSignatureBinding(
      String(docId),
      tenantId,
      signerEmail,
      meaning,
    );

    // Store signature
    const signatureId = crypto.randomUUID();

    // Signature insert + workflow-step approval + (when the last step clears)
    // document approval + audit are ONE atomic unit. Run as separate pool
    // commits, a signature could be stored while the workflow step it approves,
    // or the document-status flip the final approval triggers, failed — a
    // signed step still marked PENDING, or every step approved with the document
    // left un-approved. A single BEGIN/COMMIT makes the whole signing act land
    // together or roll back together; the pending-step count is read on the same
    // client so it sees this transaction's own step update.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // `method`: the factors the ceremony verified, as /e-sign records them.
      await client.query(
        `INSERT INTO authoring_signatures
         (id, doc_id, signer_email, signer_name, meaning, reason, method, content_hash,
          signature_digest, covered_freeze_version, covered_content_hash, tenant_id, signed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
        [
          signatureId,
          docId,
          signerEmail,
          signerName,
          meaning,
          reason,
          signer.authenticationMethod,
          contentHash,
          signatureDigest,
          covered?.version ?? null,
          covered?.contentHash ?? null,
          tenantId,
        ]
      );

      await advanceWorkflowForSignature({
        client,
        req,
        docId: String(docId),
        tenantId,
        signerEmail,
        meaning,
        reason,
        contentHash,
      });

      // Create audit event
      await createAuditEvent(
        docId,
        'SIGN',
        signerEmail as string,
        { signatureId, meaning, reason, contentHash },
        tenantId,
        client,
        // This handler writes its own richer chained row below.
        { chainedRowWrittenByCaller: true }
      );

      /* §11.10(e) — the HASH-CHAINED ledger, on this transaction.
         `createAuditTrail` above writes authoring_audit_trail, which carries no
         chain and no HMAC, and its mirror into the chained `audit_logs` runs
         ONLY when the executor is the pool (see the guard at its foot). Every
         governed handler here passes its own transaction client — correctly, so
         the record commits with the mutation — which meant the mirror was
         skipped and these events never reached the chain at all. So
         verifyAuditChain had nothing to verify for the three actions that most
         need it, and the document's own audit view read an unchained table.
         writeChainedAuditRow is the primitive built for this case and is what
         /api/esignature/sign already uses: on the caller's client, so if the
         audit row cannot be written the whole transaction rolls back and the
         signature never exists either. */
      await writeChainedAuditRow(client, {
        tenantId,
        userId: getActorId(req) ?? undefined,
        action: 'authoring.document.sign',
        resourceType: 'authoring_document',
        resourceId: String(docId ?? ''),
        ipAddress: (req.ip ?? undefined) as string | undefined,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: { signatureId, meaning, reason, contentHash, signer: signerEmail },
      });

      await client.query('COMMIT');
    } catch (txError) {
      try { await client.query('ROLLBACK'); } catch { /* rollback best-effort */ }
      throw txError;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      message: 'Document signed successfully',
      signatureId,
      digest: signatureDigest,
    });
  } catch (error) {
    console.error('Sign error:', error);
    return serverError(res, logger, 'signing docs', error);
  }
});

// GET /api/authoring/docs/:docId/signatures - Get document signatures
router.get('/docs/:docId/signatures', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const tenantId = getTenantId(req);

    const result = await pool.query(
      /* covered_freeze_version / covered_content_hash are the §11.70
         signature-to-record link: WHICH frozen snapshot this signature covers.
         The freeze-binding migration added them and this SELECT never returned
         them, so a manifestation built from this endpoint could show that a
         document was signed but not what was signed. pin_verified likewise
         records that the signature was PIN-authenticated (§11.200(a)(1)) and
         was unreadable. */
      `SELECT id, doc_id, signer_email, signer_name, meaning, reason, method,
              content_hash, signature_digest, covered_freeze_version,
              covered_content_hash, pin_verified, signed_at, tenant_id
         FROM authoring_signatures
        WHERE doc_id = $1 AND tenant_id = $2
        ORDER BY signed_at DESC`,
      [docId, tenantId]
    );

    res.json({ success: true, signatures: result.rows });
  } catch (error) {
    console.error('Error getting signatures:', error);
    res.status(500).json({ error: 'Failed to get signatures' });
  }
});

// ============= FREEZE Operations =============

// The duplicate POST /docs/:docId/freeze that stood here has been removed.
//
// It was UNREACHABLE: an identical path is registered at the top of this file
// (search "Freeze document with immutable snapshot") and express matches the
// first registration, so this one never ran. It also took its attribution from
// `x-user-email || req.body.frozen_by || 'system'` — the header-trust defect
// fixed elsewhere in this router — which made it a live hazard the moment any
// reordering made it reachable. Deleted rather than fixed: there is one freeze
// endpoint, and it is the one above. See ledger C-18.

// ============= AUDIT Operations =============

// GET /api/authoring/docs/:docId/audit - Get audit trail
//
// Reads authoring_audit_trail — the ledger createAuditTrail() has always
// written. This endpoint used to SELECT from `authoring_audit_events`, a table
// with no CREATE statement anywhere in the repository and no writer: not a
// migration, not shared/schema.ts, not one of the router's own runtime DDL
// helpers. So the only Part 11 read-back surface in the authoring stack was an
// unconditional 42P01, while a complete audit record — actor, operation,
// before/after hashes, IP, session — accumulated in the table next to it.
//
// event_type/actor are kept as the response field names so the shape callers
// were coded against is unchanged; they are aliased from the real columns.
router.get('/docs/:docId/audit', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { limit = 100 } = req.query;
    const tenantId = getTenantId(req);

    const result = await pool.query(
      `SELECT id, doc_id, section_id,
              operation_type AS event_type,
              actor_email    AS actor,
              actor_role, change_reason,
              content_hash_before, content_hash_after,
              metadata, created_at, tenant_id
         FROM authoring_audit_trail
        WHERE doc_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC
        LIMIT $3`,
      [docId, tenantId, limit]
    );

    res.json({ success: true, events: result.rows, count: result.rowCount });
  } catch (error) {
    console.error('Error getting audit trail:', error);
    res.status(500).json({ error: 'Failed to get audit trail' });
  }
});

// ============= Signing credential =============

/* POST /api/authoring/users/pin has been DELETED (2026-09-23, VSR-001 §13.3
 * item 3). It set the "signing PIN" this router's two signature routes used to
 * verify. The first PIN needed only a session, so whoever held one could set
 * the credential that signed as its owner; and it made a second credential
 * store, with its own lockout, for the one act the rest of the product
 * re-verifies with the account password and enrolled second factor.
 *
 * Replacement, by path: the signature routes above re-verify through
 * reverifyAuthoringSigner -> server/services/part11/reverify-signer.ts, the
 * ceremony every other signing surface runs; the credentials are the account
 * password and the authenticator enrolled through POST /api/auth/mfa/setup and
 * /mfa/enable (server/routes/auth.ts). Reachability: authoring-sign-ceremony
 * .test.ts drives both signature routes with them and pins this route's 404.
 * The client panel that called it (SigningPinPanel in AuthoringSignatures.tsx)
 * is deleted with it; the e-sign dialog asks for the password and code.
 *
 * `user_pins` is left in place with its rows (Rule 1: no DROP of an object a
 * migration in the set creates). Nothing reads or writes it now. */

// ============= AI ANALYSIS & SUGGESTIONS =============

/* POST /api/authoring/ai/suggestions has been DELETED.
 *
 * It had no caller. The route was mounted — register-inline-routes.ts mounts
 * this router on '/api/authoring' — so the full path was
 * /api/authoring/ai/suggestions, and the only occurrence of that path anywhere
 * in the repository was the comment that used to sit on this line. The nearby
 * "suggestions" matches in the client are all the editor's own
 * `editor/suggestions` module, the tracked-change marks, which is a different
 * thing entirely and is why a fragment search reports this endpoint as live.
 *
 * There was no AI in it. It was six hardcoded regexes — three grammar, three
 * regulatory-terminology — each returning a `confidence` of 0.95 or 0.9.
 * Nothing scored anything, so those numbers had nothing behind them, and a
 * fabricated confidence on a governed document surface is the defect this
 * repository keeps deleting.
 *
 * Two of the three grammar rules emitted DESTRUCTIVE replacements, because the
 * suggestion was built as `match[0].replace(issue.pattern, ' ')` — replacing the
 * whole match with one space instead of repairing it:
 *
 *     "the the"  ->  " "     (deletes the word, at confidence 0.95)
 *     "Done..."  ->  " "     (an ellipsis becomes a space)
 *     "Stop!!"   ->  " "     (the punctuation is deleted)
 *
 * Only the multiple-spaces rule was right. Accepting a suggestion from this
 * endpoint would have removed the author's text from a regulated document.
 *
 * The terminology rules also overlapped: /adverse event/ and
 * /serious adverse event/ both match "A serious adverse event occurred.", at
 * offsets 10 and 2, so one phrase drew two contradictory edits over overlapping
 * ranges — and both fired unconditionally, so text already reading
 * "adverse event (AE)" was told to become "adverse event (AE)" again.
 *
 * The capability it claimed is served by the canonical paths: real drafting by
 * AuthoringAiDraft (surfaces/AuthoringAiDraft.tsx, mounted inside
 * DocumentAuthoring), and heuristic section checks by
 * POST /sections/:sectionId/ai/deficiency-scan. This was a third parallel path,
 * which the zero-duplication rule does not allow.
 *
 * Pinned by tests/routes/aiSuggestionsDeleted.test.ts.
 */

/* POST /api/authoring/ai/validate-compliance has been DELETED.
 *
 * It was a second implementation of the capability POST
 * /sections/:sectionId/ai/deficiency-scan already provides — heuristic keyword
 * presence over a section's text — with no caller anywhere in the repository,
 * and it ended in a verdict it could not support:
 *
 *     overall_compliance: missing_elements.length === 0 ? 'PASS' : 'NEEDS_IMPROVEMENT'
 *
 * `missing_elements` was only ever populated for five hardcoded 3.2.S.* codes.
 * For every other section in the CTD — all of M1, M2, M4, M5, and most of M3 —
 * the array was empty because nothing had been examined, and the response said
 * PASS. A check that ran zero assertions reporting a compliance pass is the
 * defect this repository keeps finding, and this one named the field
 * `overall_compliance`.
 *
 * Its ICH block had already been repaired once: it used to fabricate
 * `compliant: Math.random() > 0.3` and a random score against Q1A/Q3A/Q6A/E6/M4,
 * and was changed to report `not_assessed`. That left the endpoint returning an
 * honest "we did not assess ICH" beside a dishonest "PASS" in the same body.
 *
 * The one part worth keeping — the per-section CTD required-element lists — is
 * now a check inside the deficiency scan, which has a caller and frames its
 * output as signals rather than a determination. Migrated and deleted in the
 * same change, per the zero-duplication rule.
 */

// ── Tracked Change Decisions (persist accept/reject) ──────────────────────────

/**
 * Who PROPOSED a tracked change, for the audit event — never validated against
 * a roster, because there is no roster this could safely check. `authorId` on
 * a human mark is the editor's own email (client/src/concept2cure/v2/editor/
 * suggestions.ts), not a numeric user id, so it cannot be matched against
 * doc_permissions or organization_users; a legitimate proposer can also be a
 * live co-author whose mark predates any grant, a person whose grant was later
 * revoked, or (per suggestions.ts's own doc comment) simply the case where the
 * proposer and the decider are different people entirely — refusing an
 * unrecognised proposer would drop a verified, hash-audited DECISION to guard
 * an unverifiable PROPOSAL, which is the wrong thing to fail closed on here.
 *
 * What IS checkable is whether the claimed proposer is this server's own AI
 * system, because that identity is a closed, server-owned vocabulary
 * (MACHINE_AUTHOR_IDS — the same list machineContributors validates against
 * for the revision ledger). So the one thing this function does is stop a
 * caller from relabelling that identity: when `authorId` names a machine
 * author, the CANONICAL name is recorded and the caller's own `authorName` is
 * discarded, exactly as machineContributors discards it for the same reason
 * ("the id is the claim being checked, and echoing a caller-supplied display
 * name would put unvalidated text in the attribution position of a filed
 * record" — revision-ledger.ts). Everything else is recorded as what it is:
 * text the editing client asserted, not a verified identity — the audit rail
 * already renders it qualified as "(proposed by X, as recorded by the editing
 * client)" (DocumentAuthoring.tsx), and `proposedByVerified` carries that same
 * fact into the stored row for any reader that does not go through the rail.
 */
function describeProposer(authorName: unknown, authorId: unknown): {
  proposedBy?: string;
  proposedByVerified?: boolean;
} {
  if (typeof authorId === 'string' && MACHINE_AUTHOR_IDS[authorId]) {
    return { proposedBy: MACHINE_AUTHOR_IDS[authorId], proposedByVerified: true };
  }
  const claimed = typeof authorName === 'string' ? authorName : typeof authorId === 'string' ? authorId : null;
  if (!claimed) return {};
  return { proposedBy: claimed.slice(0, 200), proposedByVerified: false };
}

// authoring_tracked_change_decisions is now provisioned by
// db/migrations/20260730_authoring_runtime_ddl.sql. Retained as a no-op so
// existing call sites need no change; the router no longer issues runtime DDL.
const ensureTrackedChangeDecisionsTable = async () => {};

let trackedChangeTableReady = false;

// POST /api/authoring/documents/:id/tracked-change-decisions
// Persist a single accept/reject decision for a tracked change
router.post('/documents/:id/tracked-change-decisions', async (req: Request, res: Response) => {
  try {
    if (!trackedChangeTableReady) {
      await ensureTrackedChangeDecisionsTable();
      trackedChangeTableReady = true;
    }

    const { id: artifactId } = req.params;
    const { changeId, decision } = req.body;
    const tenantId = getTenantId(req);
    // SECURITY (21 CFR Part 11): the actor who accepted/rejected a tracked
    // change must come from the verified JWT, never from headers.
    const userId = getActorId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const userName = req.user?.email || userId;

    if (!changeId || !decision) {
      return res.status(400).json({
        success: false,
        error: 'changeId and decision (accept|reject) are required',
      });
    }

    if (decision !== 'accept' && decision !== 'reject') {
      return res.status(400).json({
        success: false,
        error: 'decision must be "accept" or "reject"',
      });
    }

    /* This route sits under /documents/:id, outside the /sections/:sectionId
       prefix guard that refuses a FROZEN/APPROVED document on every other
       authoring write. Nothing else here resolves the parent document at all,
       so an accept against a sealed filing reached the INSERT unconditionally
       and the hash-chained audit event below recorded a decision the record
       itself was no longer able to accept. */
    const lock = await checkDocumentWritable(pool, String(artifactId), tenantId);
    if (!lock.writable && lock.code === 'DOCUMENT_FROZEN') {
      return res.status(403).json({ error: 'DOCUMENT_FROZEN', message: lock.reason });
    }

    const result = await pool.query(
      `INSERT INTO authoring_tracked_change_decisions
         (artifact_id, change_id, decision, user_id, user_name, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (artifact_id, change_id, tenant_id)
       DO UPDATE SET decision = $3, user_id = $4, user_name = $5, decided_at = NOW()
       RETURNING *`,
      [artifactId, changeId, decision, userId, userName, tenantId]
    );

    /* Audit trail for regulatory compliance.
       `authoring_tracked_change_decisions` stores the id and the verdict and
       nothing about the change itself — and accepting a suggestion STRIPS its
       mark, so by the time anyone reads the row the id it names no longer
       exists in the document. The row is an index; this is where the change is
       actually recorded, so the decision can be read back as a sentence rather
       than as an opaque key. The text is bounded: an audit row is not a place
       to mirror a section. */
    await createAuditEvent(
      artifactId,
      'tracked_change_decision',
      userName,
      {
        changeId,
        decision,
        ...(typeof req.body?.changeType === 'string' ? { changeType: req.body.changeType } : {}),
        ...(typeof req.body?.text === 'string' && req.body.text.length > 0
          ? { text: req.body.text.slice(0, 500) }
          : {}),
        ...(typeof req.body?.sectionId === 'string' ? { sectionId: req.body.sectionId } : {}),
        /* Who PROPOSED the change, which is not who decided it — that is the
           audit row's own actor. A redline record that cannot tell the two
           apart says nothing about review at all. See describeProposer above
           for why this is canonicalised only for a machine author and
           otherwise recorded as caller-asserted text, never validated as a
           human identity. */
        ...describeProposer(req.body?.authorName, req.body?.authorId),
        ...(typeof req.body?.at === 'string' ? { proposedAt: req.body.at } : {}),
      },
      tenantId
    );

    res.json({ success: true, decision: result.rows[0] });
  } catch (error) {
    console.error('Error persisting tracked change decision:', error);
    return serverError(res, logger, 'saving tracked change decisions', error);
  }
});

// POST /api/authoring/documents/:id/tracked-change-decisions/bulk
// Persist accept/reject for all pending changes at once
router.post('/documents/:id/tracked-change-decisions/bulk', async (req: Request, res: Response) => {
  try {
    if (!trackedChangeTableReady) {
      await ensureTrackedChangeDecisionsTable();
      trackedChangeTableReady = true;
    }

    const { id: artifactId } = req.params;
    const { changeIds, decision } = req.body;
    const tenantId = getTenantId(req);
    // SECURITY (21 CFR Part 11): the actor who accepted/rejected tracked
    // changes must come from the verified JWT, never from headers.
    const userId = getActorId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const userName = req.user?.email || userId;

    if (!Array.isArray(changeIds) || changeIds.length === 0 || !decision) {
      return res.status(400).json({
        success: false,
        error: 'changeIds (array) and decision (accept|reject) are required',
      });
    }

    if (decision !== 'accept' && decision !== 'reject') {
      return res.status(400).json({
        success: false,
        error: 'decision must be "accept" or "reject"',
      });
    }

    // See the single-decision route above: this endpoint is equally outside
    // the /sections/:sectionId lock guard, and "Accept all" is the single
    // click by which an entire AI draft is adopted — the case with the most
    // to lose from writing past a sealed document.
    const lock = await checkDocumentWritable(pool, String(artifactId), tenantId);
    if (!lock.writable && lock.code === 'DOCUMENT_FROZEN') {
      return res.status(403).json({ error: 'DOCUMENT_FROZEN', message: lock.reason });
    }

    // Upsert each decision
    const results = [];
    for (const changeId of changeIds) {
      const result = await pool.query(
        `INSERT INTO authoring_tracked_change_decisions
           (artifact_id, change_id, decision, user_id, user_name, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (artifact_id, change_id, tenant_id)
         DO UPDATE SET decision = $3, user_id = $4, user_name = $5, decided_at = NOW()
         RETURNING *`,
        [artifactId, changeId, decision, userId, userName, tenantId]
      );
      results.push(result.rows[0]);
    }

    /* Single audit event for the bulk action.
       Ids alone would make this row unresolvable for exactly the case that
       needs it most: rejecting changes alters no text, so no revision records
       what was refused. A bounded per-change summary travels with it, and when
       it is bounded the row SAYS how many it left out — a truncated record
       that looks complete is worse than one that admits its limit. */
    const MAX_SUMMARISED = 20;
    const rawChanges = Array.isArray(req.body?.changes) ? req.body.changes : [];
    const summarised = rawChanges.slice(0, MAX_SUMMARISED).map((c: any) => {
      // See describeProposer above (single-decision route): canonical name for
      // a recognised machine author, otherwise caller-asserted text flagged as
      // such via proposedByVerified.
      const proposer = describeProposer(c?.authorName, c?.authorId);
      return {
      changeId: typeof c?.changeId === 'string' ? c.changeId : null,
      changeType: typeof c?.changeType === 'string' ? c.changeType : null,
      proposedBy: proposer.proposedBy ?? null,
      proposedByVerified: proposer.proposedByVerified ?? null,
      text: typeof c?.text === 'string' ? c.text.slice(0, 200) : null,
      // The single-decision route above records this; the client already sends
      // it (DocumentAuthoring.tsx's flushDecisions puts `at` on every change in
      // the batch), and "Accept all" is the case that adopts the most text at
      // once — the case that most needs to say when each change was proposed.
      proposedAt: typeof c?.at === 'string' ? c.at : null,
      };
    });
    await createAuditEvent(
      artifactId,
      'tracked_change_bulk_decision',
      userName,
      {
        changeIds,
        decision,
        count: changeIds.length,
        // Same client field the single route records at the top level of its
        // metadata (authoring.router.ts, POST /documents/:id/tracked-change-decisions).
        ...(typeof req.body?.sectionId === 'string' ? { sectionId: req.body.sectionId } : {}),
        ...(summarised.length > 0 ? { changes: summarised } : {}),
        ...(rawChanges.length > MAX_SUMMARISED
          ? { changesOmittedFromSummary: rawChanges.length - MAX_SUMMARISED }
          : {}),
      },
      tenantId
    );

    res.json({ success: true, decisions: results, count: results.length });
  } catch (error) {
    console.error('Error persisting bulk tracked change decisions:', error);
    return serverError(res, logger, 'saving bulk', error);
  }
});

// GET /api/authoring/documents/:id/tracked-change-decisions
// Fetch all persisted decisions for an artifact
router.get('/documents/:id/tracked-change-decisions', async (req: Request, res: Response) => {
  try {
    if (!trackedChangeTableReady) {
      await ensureTrackedChangeDecisionsTable();
      trackedChangeTableReady = true;
    }

    const { id: artifactId } = req.params;
    const tenantId = getTenantId(req);

    const result = await pool.query(
      `SELECT * FROM authoring_tracked_change_decisions
       WHERE artifact_id = $1 AND tenant_id = $2
       ORDER BY decided_at DESC`,
      [artifactId, tenantId]
    );

    res.json({ success: true, decisions: result.rows });
  } catch (error) {
    console.error('Error fetching tracked change decisions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tracked change decisions',
    });
  }
});

/* ════ Section order ═════════════════════════════════════════════════════════
 *
 * Every reader of a document — the tree, the export assembler, the PDF and
 * DOCX branches — orders sections by `order_index`, and nothing could ever
 * change it: POST /sections defaulted it and PATCH does not accept it, so a
 * document whose sections were created out of order ASSEMBLED out of order,
 * permanently. Order is part of the filed record, so the write is governed
 * like one: refused on FROZEN/APPROVED (the sealed assembly is what the
 * signatures attest to), the submitted list must be an exact permutation of
 * the document's sections (a partial or foreign list is refused, never
 * partially applied), the renumbering commits in one transaction, and the
 * audit trail records the new order under the actor.
 */
router.post('/docs/:docId/sections/reorder', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const tenantId = getTenantId(req);
    const actor = getActorEmail(req);
    if (!actor) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const ids: unknown = (req.body ?? {}).section_ids;
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      !ids.every((x): x is string => typeof x === 'string' && x.length > 0)
    ) {
      return res.status(400).json({
        success: false,
        error: 'section_ids must be a non-empty array of section ids in the desired order.',
      });
    }

    const parentDoc = await pool.query(
      `SELECT status FROM authoring_documents WHERE id = $1 AND tenant_id = $2`,
      [docId, tenantId]
    );
    if ((parentDoc.rowCount ?? 0) === 0) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    const parentStatus = String(
      (parentDoc.rows[0] as { status?: string | null }).status ?? ''
    ).toUpperCase();
    if (LOCKED_DOCUMENT_STATUSES.has(parentStatus)) {
      return res.status(403).json({
        success: false,
        error: 'Document is FROZEN/APPROVED; its section order is part of the sealed record.',
      });
    }

    const current = await pool.query(
      `SELECT id FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2`,
      [docId, tenantId]
    );
    const currentIds = new Set<string>(current.rows.map((r: { id: string }) => String(r.id)));
    const submitted = new Set(ids);
    const isPermutation =
      submitted.size === ids.length && // no duplicates
      submitted.size === currentIds.size &&
      ids.every((id) => currentIds.has(id));
    if (!isPermutation) {
      return res.status(409).json({
        success: false,
        error:
          'section_ids must list exactly this document’s sections, each once. ' +
          'The document’s sections changed since you loaded them — reload and retry. Nothing was reordered.',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < ids.length; i++) {
        await client.query(
          `UPDATE authoring_sections SET order_index = $1, updated_at = NOW()
             WHERE id = $2 AND doc_id = $3 AND tenant_id = $4`,
          [i, ids[i], docId, tenantId]
        );
      }
      await createAuditEvent(docId, 'REORDER_SECTIONS', actor, { order: ids }, tenantId, client);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    return res.json({ success: true, order: ids });
  } catch (error) {
    logger.error('section reorder failed', { error });
    return res.status(500).json({
      success: false,
      error: 'Failed to reorder sections. The previous order is unchanged.',
    });
  }
});

/* ════ Section images — the governed figure store ═══════════════════════════
 *
 * Section HTML stores a figure as a REFERENCE (`/api/authoring/images/<id>`),
 * never as base64: the append-only revision ledger and the Part 11 audit rows
 * copy section content on every save, so inlined bytes would multiply every
 * figure by every revision, and the editor's per-keystroke device cache would
 * blow the browser's storage quota on the first chromatogram.
 *
 * Storage REUSES the canonical upload store (`file_uploads` +
 * `uploads/org-{id}/{id}` on disk, via saveDerivedUpload/loadUploadedFile in
 * server/services/ana/uploaded-file-access.ts — the single sanctioned
 * upload-id→bytes resolver, which enforces tenancy on both the org column and
 * the path prefix). A second binary store for the same capability is exactly
 * the parallel path CLAUDE.md rules out.
 *
 * The accepted formats are the ones the DOCX exporter can embed (PNG, JPEG,
 * GIF). WebP is refused at upload rather than dropped at export; SVG is
 * refused because it is a script container, not a picture.
 */

const AUTHORING_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AUTHORING_IMAGE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg' || file.mimetype === 'image/gif') {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG and GIF images are accepted — they are the formats a Word export can embed.'));
    }
  },
});

/** Multer refusals (size, type) arrive as errors; they are client mistakes,
 *  not server faults, and must say so as a 400 with the reason. */
const imageUploadErrors = (err: unknown, _req: Request, res: Response, next: (e?: unknown) => void) => {
  if (!err) return next();
  const message =
    (err as { code?: string })?.code === 'LIMIT_FILE_SIZE'
      ? 'The image is larger than 8 MB. Nothing was uploaded.'
      : err instanceof Error
        ? err.message
        : 'Upload refused';
  return res.status(400).json({ success: false, error: message });
};

router.post(
  '/images',
  imageUpload.single('file'),
  imageUploadErrors as never,
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const actorId = getActorId(req);
      if (!actorId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const file = (req as { file?: { buffer?: Buffer; mimetype?: string; originalname?: string } }).file;
      if (!file?.buffer || file.buffer.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Send the image as multipart/form-data under the field name "file".',
        });
      }

      // Magic-number check: an executable or HTML payload uploaded under an
      // image mime is refused on its bytes, not its label.
      const { verifyFileSignature } = await import('../utils/fileSignature');
      const sig = verifyFileSignature(file.buffer, file.mimetype ?? '');
      if (!sig.ok) {
        return res.status(400).json({
          success: false,
          error: 'The file content does not match its declared image type. Nothing was uploaded.',
        });
      }
      const { scanBuffer } = await import('../utils/virusScan');
      const scan = await scanBuffer(file.buffer);
      if (!scan.clean) {
        logger.warn('authoring image rejected by content scan', { tenantId });
        return res.status(400).json({
          success: false,
          error: 'The file was rejected by the content scan. Nothing was uploaded.',
        });
      }

      /* Multer's busboy parse breaks the AsyncLocalStorage tenant scope the
         middleware opened (its stream listeners run in the socket's context),
         so under RLS enforcement every query from here on would fail closed.
         Re-enter the exact scope this request was granted — the same repair
         vault-ingest documents. */
      const { runWithTenantScope } = await import('../db/tenantStore');
      const rawUserId = Number((req.user as { id?: unknown; userId?: unknown })?.id ?? (req.user as { userId?: unknown })?.userId);
      const saved = await runWithTenantScope(
        {
          tenantId: String(tenantId),
          orgUuid: (req as { tenantContext?: { organizationUuid?: string | null } }).tenantContext?.organizationUuid ?? null,
          role: (req.user as { role?: string | null })?.role ?? null,
          source: 'request',
          caller: 'server/routes/authoring.router.ts:images',
        },
        async () => {
          const { saveDerivedUpload } = await import('../services/ana/uploaded-file-access.js');
          return saveDerivedUpload({
            buffer: file.buffer!,
            fileName: file.originalname || 'figure',
            mimeType: file.mimetype || 'application/octet-stream',
            organizationId: tenantId,
            userId: Number.isFinite(rawUserId) ? rawUserId : null,
          });
        }
      );

      return res.status(201).json({
        success: true,
        image: {
          id: saved.fileId,
          url: `/api/authoring/images/${saved.fileId}`,
          mimeType: file.mimetype,
          byteSize: file.buffer.length,
        },
      });
    } catch (error) {
      logger.error('authoring image upload failed', { error });
      return res.status(500).json({ success: false, error: 'Failed to store the image. Nothing was saved.' });
    }
  }
);

router.get('/images/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { loadUploadedFile } = await import('../services/ana/uploaded-file-access.js');
    const { AUTHORING_IMAGE_MIMES } = await import('../export/authoring-images.js');
    // Throws for an unknown id, a foreign tenant's id, or bytes gone from
    // disk — all collapse to the same 404 below, confirming nothing.
    const file = await loadUploadedFile(String(req.params.id), tenantId);
    if (!AUTHORING_IMAGE_MIMES.has(file.mimeType)) {
      // This endpoint serves figures, not arbitrary tenant uploads.
      return res.status(404).json({ success: false, error: 'Image not found' });
    }
    // The store is append-only from the editor's side (nothing rewrites an
    // upload's bytes), so the reference can be cached hard — per user, since
    // the fetch rides the caller's Authorization header.
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('ETag', `"${file.fileId}"`);
    return res.end(file.buffer);
  } catch {
    return res.status(404).json({ success: false, error: 'Image not found' });
  }
});

export default router;

/* ════ Word import ═══════════════════════════════════════════════════════════
 *
 * Four services in this repo already read .docx, and all four call mammoth's
 * `extractRawText` — a flat string, which is correct for the search and
 * retrieval they do and wrong for authoring. A regulatory author importing a
 * technical file needs the TABLES: a predicate comparison, a GSPR matrix, a
 * stability table IS the content, and raw text throws every one away while
 * leaving enough words on screen to look like a successful import
 * (MDX_WORK_ORDER W3-5).
 *
 * This route PARSES ONLY. It writes nothing: it returns the sections it found
 * so the author can see what arrived — how many sections, how many tables, and
 * every warning the conversion produced — and then create them deliberately
 * through POST /sections, which is the governed write with its lineage gate.
 * Importing straight into a document would put un-reviewed content into the
 * governed record on the strength of a drag-and-drop.
 */
const docxImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isDocx =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      /\.docx$/i.test(file.originalname ?? '');
    if (isDocx) return cb(null, true);
    cb(new Error('Only .docx files can be imported. A .doc (Word 97-2003) must be saved as .docx first.'));
  },
});

const docxImportErrors = (err: unknown, _req: Request, res: Response, next: (e?: unknown) => void) => {
  if (!err) return next();
  const message =
    (err as { code?: string })?.code === 'LIMIT_FILE_SIZE'
      ? 'The document is larger than 25 MB. Nothing was imported.'
      : err instanceof Error
        ? err.message
        : 'Upload refused';
  return res.status(400).json({ success: false, error: message });
};

router.post(
  '/import/docx',
  docxImport.single('file'),
  docxImportErrors,
  async (req: Request, res: Response) => {
    try {
      if (!getActorId(req)) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const file = (req as Request & { file?: { buffer?: Buffer } }).file;
      if (!file?.buffer?.length) {
        return res.status(400).json({ success: false, error: 'No document was uploaded.' });
      }

      const { importDocx } = await import('../import/docx-to-authoring.js');
      const result = await importDocx(file.buffer);

      return res.json({
        success: true,
        sections: result.sections,
        /* Surfaced, never swallowed: an author who is not told a style was
           dropped will file the document believing it arrived intact. */
        warnings: result.warnings,
        counts: result.counts,
      });
    } catch (error) {
      return serverError(res, logger, 'importing the Word document', error);
    }
  },
);
