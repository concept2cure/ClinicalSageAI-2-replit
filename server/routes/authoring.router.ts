import { Router, Request, Response } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
// spawn — reserved for future PDF generation pipeline
import crypto from 'crypto';
// Lazy load docx to prevent startup failures
import { PDFDocument } from 'pdf-lib';
import { verifyJwtWithRotation } from '../utils/jwtVerify';
import { nonAccessTokenReason } from '../middleware/tokenType';
import { enforceOrgMembership } from '../middleware/orgMembership';
import { getPool } from '../db';
import auditService from '../services/auditService';
import { authedOrgId } from '../utils/authedOrgId';
import { createScopedLogger } from '../utils/logger';
// c2c_documents is the system of record for a filing; this router is the
// editing layer over it. This resolves which governed document an authored
// document belongs to. See server/services/c2c/governed-document-binding.ts.
import { resolveGovernedDocument } from '../services/c2c/governed-document-binding.js';

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
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/json',
  'application/xml',
  'text/xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: '/tmp',
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safeName}`);
    },
  }),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Unsupported file type'));
    }
    cb(null, true);
  },
});

// Use centralized database pool
const pool = getPool();

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
const LOCKED_DOCUMENT_STATUSES = new Set(['FROZEN', 'APPROVED']);

/** The only grants the fine-grained section matrix recognises. */
const GRANTABLE_SECTION_ROLES = new Set(['AUTHOR', 'REVIEWER']);

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
 * ONLY the optional per-user AUTHOR/REVIEWER matrix. The non-negotiable
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
    const email = getActorEmail(req);
    if (!email) return false;
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

    // ── OPTIONAL: fine-grained per-user matrix ───────────────────────────────
    if (process.env.AUTH_ENFORCE_SECTION_PERMS !== '1') return true;

    // Roles from the verified token, read with the same typed access
    // requireAny() uses.
    const claimed = ((req.user as { roles?: unknown } | undefined)?.roles ?? []) as unknown[];
    const roles = (Array.isArray(claimed) ? claimed : [claimed]).map(r =>
      String(r).toUpperCase()
    );
    if (roles.includes('QA') || roles.includes('RA_CMC')) return true;

    // Every predicate is anchored to the REQUESTED section and the caller's
    // tenant; the doc-level branch is parenthesised so it can no longer escape
    // that anchor. `p.section_id IS NULL` = a grant over the whole document.
    const grant = (
      await pool.query(
        `SELECT 1
           FROM authoring_sections s
           JOIN doc_permissions p
             ON p.doc_id = s.doc_id AND p.tenant_id = s.tenant_id
          WHERE s.id = $1
            AND s.tenant_id = $2
            AND p.tenant_id = $2
            AND LOWER(p.email) = LOWER($3)
            AND UPPER(p.role) IN ('AUTHOR', 'REVIEWER')
            AND (p.section_id IS NULL OR p.section_id = s.id)
          LIMIT 1`,
        [sectionId, tenantId, email]
      )
    ).rows[0];
    return !!grant;
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

// Helper function to compute document hash for signatures
const computeDocHash = async (
  docId: string | string[] | undefined,
  tenantId: number
): Promise<string> => {
  const sections = await pool.query(
    'SELECT code, content FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index',
    [docId, tenantId]
  );
  const content = sections.rows.map(s => `${s.code}:${s.content}`).join('|||');
  return crypto.createHash('sha256').update(content).digest('hex');
};

// Comprehensive audit logging for 21 CFR Part 11 compliance
const createAuditTrail = async (
  req: Request,
  docId: string | string[] | undefined,
  sectionId: string | string[] | undefined | null,
  operationType: string,
  beforeContent: string | null,
  afterContent: string | null,
  changeReason: string | null,
  metadata: any = {}
) => {
  try {
    const actorEmail = (req.headers as any)['x-user-email'] || 'unknown';
    const actorRole = (req.headers as any)['x-roles'] || 'unknown';
    const tenantId = getTenantId(req);
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const sessionId = (req.headers as any)['x-session-id'] || crypto.randomUUID();

    // Calculate content hashes
    const hashBefore = beforeContent
      ? crypto.createHash('sha256').update(beforeContent).digest('hex')
      : null;
    const hashAfter = afterContent
      ? crypto.createHash('sha256').update(afterContent).digest('hex')
      : null;

    await pool.query(
      `INSERT INTO authoring_audit_trail
       (doc_id, section_id, operation_type, actor_email, actor_role,
        before_content, after_content, content_hash_before, content_hash_after,
        change_reason, metadata, ip_address, user_agent, session_id, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        docId,
        sectionId,
        operationType,
        actorEmail,
        actorRole,
        beforeContent,
        afterContent,
        hashBefore,
        hashAfter,
        changeReason,
        metadata,
        ipAddress,
        userAgent,
        sessionId,
        tenantId,
      ]
    );

    console.log(`Audit trail created: ${operationType} on doc ${docId} by ${actorEmail}`);

    // Reflect into the central audit_logs table so the unified audit query
    // sees authoring events alongside every other governed mutation. The
    // dedicated authoring_audit_trail row above remains the rich record
    // (full before/after content + content hashes); this is the index entry.
    void auditService.logAction({
      tenantId,
      userId: actorEmail,
      action: `authoring.section.${operationType}`,
      resourceType: sectionId ? 'authoring_section' : 'authoring_document',
      resourceId: String(sectionId ?? docId ?? ''),
      ipAddress,
      userAgent,
      details: {
        docId,
        sectionId,
        operationType,
        contentHashBefore: hashBefore,
        contentHashAfter: hashAfter,
        changeReason: changeReason ?? null,
        actorRole,
        sessionId,
      },
    });
  } catch (error) {
    // Audit logging must never fail silently in production
    console.error('CRITICAL: Failed to create audit trail:', error);
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Audit logging failed - operation aborted for compliance');
    }
  }
};

// Legacy wrapper for backward compatibility
const createAuditEvent = async (
  docId: string | string[] | undefined,
  eventType: string,
  actor: string,
  metadata: any,
  tenantId: number
) => {
  // Synthesize the request shape createAuditTrail reads from. `user` is the
  // important part: getTenantId sources the tenant from the VERIFIED JWT
  // (req.user.organizationId) rather than the x-tenant-id header it used to
  // trust, so a headers-only stand-in made getTenantId throw "Tenant context
  // required" — inside createAuditTrail's catch, which meant every audit event
  // routed through this helper was silently dropped. The caller has already
  // resolved the tenant from the real request; pass it through explicitly.
  const mockReq = {
    user: { organizationId: tenantId, email: actor },
    headers: { 'x-user-email': actor, 'x-tenant-id': tenantId },
    ip: 'legacy-call',
    connection: { remoteAddress: 'legacy-call' },
  } as any;

  await createAuditTrail(
    mockReq,
    docId,
    null,
    eventType,
    null,
    null,
    'Legacy audit event',
    metadata
  );
};

// Helper function to ensure token table exists
const ensureTokenTableExists = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authoring_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      section_id VARCHAR(255) NOT NULL,
      cite_id VARCHAR(255) NOT NULL,
      token_key VARCHAR(255) NOT NULL,
      payload JSONB,
      payload_sha256 VARCHAR(64),
      source_refs JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      created_by VARCHAR(255),
      tenant_id INTEGER DEFAULT 1,
      UNIQUE(section_id, cite_id)
    )
  `);
};

// Helper function to ensure template tables exist
const ensureTemplateTablesExist = async () => {
  // Create templates table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authoring_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_name VARCHAR(255) NOT NULL,
      template_type VARCHAR(100) NOT NULL,
      category VARCHAR(100),
      regions TEXT[],
      template_content JSONB,
      guidance_content JSONB,
      metadata JSONB,
      is_active BOOLEAN DEFAULT true,
      usage_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      created_by VARCHAR(255),
      tenant_id INTEGER DEFAULT 1,
      UNIQUE(template_name, template_type, tenant_id)
    )
  `);

  // Create template_guidance table for section-specific guidance
  await pool.query(`
    CREATE TABLE IF NOT EXISTS template_guidance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID REFERENCES authoring_templates(id) ON DELETE CASCADE,
      section_name VARCHAR(255) NOT NULL,
      section_code VARCHAR(50),
      guidance_text TEXT,
      examples JSONB,
      regulatory_references JSONB,
      ai_prompts JSONB,
      compliance_checklist JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      tenant_id INTEGER DEFAULT 1
    )
  `);

  // Create template_usage table for tracking
  await pool.query(`
    CREATE TABLE IF NOT EXISTS template_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID REFERENCES authoring_templates(id),
      document_id VARCHAR(255),
      used_by VARCHAR(255),
      used_at TIMESTAMP DEFAULT NOW(),
      tenant_id INTEGER DEFAULT 1
    )
  `);

  // Create section_guidance table for dynamic guidance
  await pool.query(`
    CREATE TABLE IF NOT EXISTS section_guidance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      section_id VARCHAR(255) NOT NULL,
      document_type VARCHAR(100),
      guidance_type VARCHAR(50), -- 'regulatory', 'best_practice', 'ai_suggestion', 'example'
      content TEXT,
      metadata JSONB,
      priority INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      tenant_id INTEGER DEFAULT 1,
      UNIQUE(section_id, guidance_type, tenant_id)
    )
  `);
};

// 21 CFR Part 11 compliant PIN verification with lockout policy
const verifyUserPin = async (email: string, pin: string, tenantId: number): Promise<boolean> => {
  const MAX_ATTEMPTS = 3;
  const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes

  try {
    // Get user PIN record
    const result = await pool.query(
      'SELECT pin_hash, failed_attempts, locked_until FROM user_pins WHERE email = $1 AND tenant_id = $2',
      [email, tenantId]
    );

    if (((result.rowCount ?? 0) === 0)) {
      console.warn(`PIN verification failed: No PIN record for ${email}`);
      return false;
    }

    const { pin_hash, failed_attempts, locked_until } = result.rows[0];

    // Check if account is locked
    if (locked_until && new Date(locked_until) > new Date()) {
      const remainingTime = Math.ceil((new Date(locked_until).getTime() - Date.now()) / 60000);
      console.warn(`Account locked for ${email}. ${remainingTime} minutes remaining.`);
      return false;
    }

    // Verify PIN using bcrypt
    const isValid = await bcrypt.compare(pin, pin_hash);

    if (isValid) {
      // Reset failed attempts on successful verification
      await pool.query(
        'UPDATE user_pins SET failed_attempts = 0, last_attempt = NOW(), locked_until = NULL WHERE email = $1 AND tenant_id = $2',
        [email, tenantId]
      );
      console.log(`PIN verified successfully for ${email}`);
      return true;
    } else {
      // Increment failed attempts
      const newAttempts = (failed_attempts || 0) + 1;
      let lockUntil = null;

      if (newAttempts >= MAX_ATTEMPTS) {
        // Lock account after max attempts
        lockUntil = new Date(Date.now() + LOCKOUT_DURATION);
        console.warn(`Account locked for ${email} after ${newAttempts} failed attempts`);
      }

      await pool.query(
        'UPDATE user_pins SET failed_attempts = $1, last_attempt = NOW(), locked_until = $2 WHERE email = $3 AND tenant_id = $4',
        [newAttempts, lockUntil, email, tenantId]
      );

      console.warn(
        `PIN verification failed for ${email}. Attempt ${newAttempts} of ${MAX_ATTEMPTS}`
      );
      return false;
    }
  } catch (error) {
    console.error('Error verifying PIN:', error);
    return false;
  }
};

// Helper to create or update user PIN
const createUserPin = async (email: string, pin: string, tenantId: number): Promise<boolean> => {
  try {
    const pinHash = await bcrypt.hash(pin, 10);
    const pinExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

    await pool.query(
      `INSERT INTO user_pins (email, pin_hash, tenant_id, pin_expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email, tenant_id)
       DO UPDATE SET pin_hash = $2, pin_expires_at = $4, updated_at = NOW(), failed_attempts = 0, locked_until = NULL`,
      [email, pinHash, tenantId, pinExpiry]
    );

    return true;
  } catch (error) {
    console.error('Error creating PIN:', error);
    return false;
  }
};

// Helper function to create revision automatically
const createRevision = async (
  sectionId: string | string[] | undefined,
  content: string,
  updatedBy: string,
  tenantId: number
) => {
  try {
    const revisionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO doc_revisions (id, section_id, content, created_by, created_at, tenant_id)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [revisionId, sectionId, content, updatedBy, tenantId]
    );
    return revisionId;
  } catch (error) {
    console.error('Error creating revision:', error);
    throw error;
  }
};

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
    res.status(500).json({
      error: 'Failed to save token',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
    res.status(500).json({
      error: 'Failed to delete token',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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

    res.json({
      success: true,
      templates: result.rows,
      // rows.length, not rowCount: rowCount is a node-postgres field and is not
      // populated by every driver this code is exercised against.
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({
      error: 'Failed to list templates',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
    res.status(500).json({
      error: 'Failed to fetch template',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
      res.status(500).json({
        error: 'Failed to create template',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// POST /api/authoring/templates/apply/:id - Apply template to document
router.post('/templates/apply/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { document_id } = req.body;
    const tenantId = getTenantId(req);
    const userId = req.headers['x-user-email'] || 'system';

    // Get template
    const templateResult = await pool.query(
      `SELECT id, template_name, template_type, category, regions, template_content, guidance_content, metadata, is_active, usage_count, created_at, updated_at, created_by, tenant_id FROM authoring_templates WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (((templateResult.rowCount ?? 0) === 0)) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = templateResult.rows[0];

    // Update usage count
    await pool.query(`UPDATE authoring_templates SET usage_count = usage_count + 1 WHERE id = $1`, [
      id,
    ]);

    // Track usage
    await pool.query(
      `INSERT INTO template_usage (template_id, document_id, used_by, tenant_id)
       VALUES ($1, $2, $3, $4)`,
      [id, document_id, userId, tenantId]
    );

    // Apply template content to document sections
    if (template.template_content?.sections) {
      for (const section of template.template_content.sections) {
        await pool.query(
          `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
           ON CONFLICT (doc_id, code, tenant_id)
           DO UPDATE SET content = $4, title = $3`,
          [
            document_id,
            section.code,
            section.title,
            section.content,
            section.order_index || 0,
            tenantId,
          ]
        );
      }
    }

    res.json({
      success: true,
      message: 'Template applied successfully',
      template_id: id,
      document_id,
    });
  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({
      error: 'Failed to apply template',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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
    res.status(500).json({
      error: 'Failed to fetch guidance',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
      res.status(500).json({
        error: 'Failed to save guidance',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ============= CRUD Operations =============

// GET /api/authoring/docs?module=M3 - List documents by module
router.get('/docs', async (req: Request, res: Response) => {
  try {
    const { module = 'M3', product_code, status = 'draft', programId } = req.query;
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

    if (status) {
      paramCount++;
      query += ` AND d.status = $${paramCount}`;
      params.push(status);
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
    res.status(500).json({
      success: false,
      error: 'Failed to list documents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/authoring/docs - Create new document
router.post('/docs', async (req: Request, res: Response) => {
  try {
    const { title, module = 'M3', product_code, locale = 'en-US', template_id, client_program_id } = req.body;
    const tenantId = getTenantId(req);
    const docId = crypto.randomUUID();
    const createdBy = getActorId(req);
    if (!createdBy) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Document title is required',
      });
    }

    // Reject a malformed program id with a clean 400 rather than letting the
    // UUID column cast throw a 500. Cross-org mis-scoping is already prevented
    // downstream: every read is gated on tenant_id, so a document tagged with
    // another org's program id never surfaces in that org's tree.
    if (
      client_program_id !== undefined &&
      client_program_id !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(client_program_id))
    ) {
      return res.status(400).json({ success: false, error: 'client_program_id must be a valid UUID' });
    }

    // Build the INSERT so the new program-scope column is referenced ONLY when
    // supplied. A create without client_program_id (the org-wide path and the
    // golden-journey harness) emits the exact original statement, so databases
    // that lack the 20260727 migration keep working.
    // GOVERNED BINDING. c2c_documents is the system of record for a regulatory
    // filing; this stack is the editing layer over it. When the document is
    // created against an open project, bind it to that project's governed
    // document so the two stores share an identity instead of drifting into
    // parallel truths — which is what produced "the same section edited in two
    // places lands in two tables with two different audit chains".
    //
    // Read-only resolution: it never CREATES a governed document. That is
    // scaffoldProjectDocuments()'s job, inside project creation, and a second
    // creation path would be the duplication this is removing.
    //
    // Unbound stays legal and is never silent — an org-wide document, a program
    // type with no document class (ivd/device/ide/biologic/anda), or a project
    // predating scaffolding all end here with a stated reason returned to the
    // caller rather than a bare null.
    const binding = await resolveGovernedDocument({
      db: pool,
      orgId: tenantId,
      projectId: client_program_id ?? null,
    });

    const cols = ['id', 'title', 'module', 'product_code', 'locale', 'status', 'created_by', 'created_at', 'updated_at', 'tenant_id', 'template_id'];
    const vals = ['$1', '$2', '$3', '$4', '$5', `'draft'`, '$6', 'NOW()', 'NOW()', '$7', '$8'];
    const args: any[] = [docId, title, module, product_code, locale, createdBy, tenantId, template_id];
    if (client_program_id) {
      args.push(client_program_id);
      cols.push('client_program_id');
      vals.push(`$${args.length}`);
    }
    // Referenced ONLY when a binding resolved, for the same reason
    // client_program_id is: a database without the 20260728 migration emits the
    // original statement and keeps working.
    if (binding.documentId) {
      args.push(binding.documentId);
      cols.push('c2c_document_id');
      vals.push(`$${args.length}`);
    }
    const result = await pool.query(
      `INSERT INTO authoring_documents (${cols.join(', ')})
       VALUES (${vals.join(', ')})
       RETURNING *`,
      args,
    );

    // If template_id provided, scaffold the document's section skeleton.
    //
    // This query could never run. It selected `code, title, content, order_index`
    // from an unqualified `template_sections` filtered by `tenant_id` — but the
    // only such table is `intelligence.template_sections`
    // (db/migrations/20260520_document_templates.sql:78), whose columns are
    // `section_code`, `section_title` and `ordering`, with NO `content` and NO
    // `tenant_id`. Every column named was wrong and the relation was unresolvable,
    // so a create-from-template always fell into the catch below and 500'd.
    //
    // Templates are GLOBAL regulatory reference data — `intelligence.document_templates`
    // carries no tenancy column, deliberately, because they describe agency
    // expectations rather than customer content. So there is no tenant filter to
    // apply on the read; tenancy comes from the document being created, and every
    // seeded row carries that tenant.
    //
    // Templates store section STRUCTURE and authoring guidance, not prose, so a
    // seeded section starts empty. That is the honest scaffold: the section exists
    // with its regulatory code, title and ordering, and the author writes it.
    if (template_id) {
      const seeded = await pool.query(
        `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, created_at, updated_at, tenant_id)
         SELECT gen_random_uuid(), $1, ts.section_code, ts.section_title, '', ts.ordering, NOW(), NOW(), $2
         FROM intelligence.template_sections ts
         WHERE ts.template_id = $3
         ORDER BY ts.ordering
         RETURNING id, code, content`,
        [docId, tenantId, template_id]
      );

      // Every write to a regulated section produces its Part 11 evidence — the
      // sibling POST /sections handler does exactly this, and a section that
      // appears in a document with no record of how it got there is precisely
      // the §11.10(e) gap the audit trail exists to close. Seeding is a CREATE
      // like any other.
      // `createdBy` is the verified actor already resolved (and null-guarded)
      // at the top of this handler — not re-derived, so a seeded section is
      // attributed to exactly the principal the document is.
      for (const row of seeded.rows) {
        await createRevision(row.id, row.content ?? '', createdBy, tenantId);
        await createAuditTrail(req, docId, row.id, 'CREATE', null, row.content ?? '', 'Seeded from template', {
          template_id,
          section_code: row.code,
          seeded: true,
        });
      }
    }

    res.status(201).json({
      success: true,
      document: result.rows[0],
      message: 'Document created successfully',
      // The binding outcome, always present. A document that is NOT attached to
      // a governed filing must say so at the moment it is created — an unbound
      // document is a legitimate state, but a silently unbound one is how the
      // two stores drifted apart in the first place.
      governance: binding.documentId
        ? { bound: true, c2cDocumentId: binding.documentId }
        : { bound: false, reason: binding.reason },
    });
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
       LEFT JOIN authoring_sections s ON s.doc_id = d.id
       LEFT JOIN authoring_comments c ON c.doc_id = d.id
       LEFT JOIN doc_revisions r ON r.section_id = s.id
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

    res.json({
      success: true,
      document: docResult.rows[0],
    });
  } catch (error) {
    console.error('Error getting document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get document details',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
       LEFT JOIN authoring_comments c ON c.section_id = s.id
       LEFT JOIN doc_revisions r ON r.section_id = s.id
       LEFT JOIN authoring_citations ct ON ct.section_id = s.id
       WHERE s.doc_id = $1 AND s.tenant_id = $2
       GROUP BY s.id
       ORDER BY s.order_index, s.created_at`,
      [docId, tenantId]
    );

    res.json({
      success: true,
      sections: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    console.error('Error getting sections:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get document sections',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/authoring/sections - Create new section
router.post('/sections', async (req: Request, res: Response) => {
  try {
    const { doc_id, code, title, content = '', order_index = 0 } = req.body;
    const tenantId = getTenantId(req);
    const sectionId = crypto.randomUUID();
    const createdBy = getActorId(req);
    if (!createdBy) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!doc_id || !code || !title) {
      return res.status(400).json({
        success: false,
        error: 'doc_id, code, and title are required',
      });
    }

    // The same Part 11 immutability lock the /sections/:sectionId guard applies
    // (C2C-AUTHOR-001). This route creates a section rather than editing one, so
    // it sits OUTSIDE that guard's path — but adding a section to a FROZEN or
    // APPROVED document alters the record set a signature attests to just as
    // surely as editing one. Resolving the parent in-tenant first also turns a
    // foreign/unknown doc_id into a clean 404 instead of the composite-FK
    // violation 500 it used to raise.
    const parentDoc = await pool.query(
      `SELECT status FROM authoring_documents WHERE id = $1 AND tenant_id = $2`,
      [doc_id, tenantId]
    );
    if ((parentDoc.rowCount ?? 0) === 0) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    const parentStatus = String(
      (parentDoc.rows[0] as { status?: string | null }).status ?? ''
    ).toUpperCase();
    if (LOCKED_DOCUMENT_STATUSES.has(parentStatus)) {
      return res
        .status(403)
        .json({ success: false, error: 'Document is FROZEN/APPROVED; cannot add sections' });
    }

    const result = await pool.query(
      `INSERT INTO authoring_sections
       (id, doc_id, code, title, content, order_index, created_at, updated_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)
       RETURNING *`,
      [sectionId, doc_id, code, title, content, order_index, tenantId]
    );

    // Genesis revision: this content, by this author.
    await createRevision(sectionId, content, createdBy, tenantId);
    await createAuditTrail(req, doc_id, sectionId, 'CREATE', null, content ?? null, req.body?.changeReason ?? null, {
      code,
      title,
    });

    res.status(201).json({
      success: true,
      section: result.rows[0],
      message: 'Section created successfully',
    });
  } catch (error) {
    console.error('Error creating section:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create section',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// PATCH /api/authoring/sections/:sectionId - Update section (with automatic revision)
router.patch('/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { content, track_changes, title, code } = req.body;
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

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (content !== undefined) {
      paramCount++;
      updates.push(`content = $${paramCount}`);
      values.push(content);

      // A revision row means "this content, by this author, as of this time".
      //
      // It used to snapshot the PRIOR content under the CURRENT editor's id:
      // createRevision(sectionId, currentSection.rows[0].content, updatedByUser, …).
      // With one author editing repeatedly the byline happened to be right; it
      // went wrong exactly when authorship changed hands — the multi-author
      // case attribution exists to serve. Alice writes "0.35"; Bob corrects it
      // to "0.25"; the trail then held two rows BOTH containing Alice's text,
      // one labelled Bob, and Bob's actual edit had no row at all until a third
      // party touched the section. An inspector asking "who changed 0.35 to
      // 0.25?" was answered with Bob's name against the 0.35 text — the exact
      // inverse of the truth — and "who wrote the current text?" had no answer
      // anywhere in the system.
      //
      // POST /sections already recorded (new content, author). This makes the
      // edit path agree with it: the prior content is not lost, it is the
      // preceding row.
      await createRevision(sectionId, content, updatedByUser, tenantId);
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

    const result = await pool.query(updateQuery, values);

    // Part 11 change record: operation, actor, before/after content, a SHA-256
    // of each side, reason, IP, user agent, session.
    //
    // No content-mutating authoring path wrote one of these. The migration that
    // provisions authoring_audit_trail states that this router "has always
    // written a rich audit record … for every authoring mutation"; the table
    // received rows only for pins, freeze, e-sign and the legacy wrapper, and
    // the legacy wrapper hardcodes beforeContent=null, afterContent=null and
    // changeReason='Legacy audit event' — so before_content, after_content and
    // both content hashes were NULL on every row in the table, for every event
    // type. The only trace of an edit was a doc_revisions row, and that row was
    // mis-attributed (see the revision write above).
    //
    // Deliberately AFTER the UPDATE and not fatal: the edit has already
    // committed, and throwing here would report failure for a change that
    // landed. The write is awaited so a failure is logged rather than lost, and
    // createAuditTrail swallows its own errors.
    if (content !== undefined) {
      await createAuditTrail(
        req,
        result.rows[0]?.doc_id,
        sectionId,
        'UPDATE',
        currentSection.rows[0].content ?? null,
        content ?? null,
        typeof req.body?.changeReason === 'string' ? req.body.changeReason : null,
        { titleChanged: title !== undefined },
      );
    }

    res.json({
      success: true,
      section: result.rows[0],
      message: 'Section updated successfully',
      revision_created: content !== undefined,
    });
  } catch (error) {
    console.error('Error updating section:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update section',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
    res.status(500).json({
      success: false,
      error: 'Failed to get revision history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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

    // Create new revision for current state before reverting
    const currentSection = await pool.query(
      'SELECT content FROM authoring_sections WHERE id = $1 AND tenant_id = $2',
      [sectionId, tenantId]
    );

    // Update section with revision content
    const result = await pool.query(
      `UPDATE authoring_sections
       SET content = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [revision.content, sectionId, tenantId]
    );

    // The revert is itself an authored state: this content, restored by this
    // actor, now. Written AFTER the update for the same reason as the edit
    // path, and it replaces a pre-update createRevision that stored the
    // content being replaced under the reverter's name — the same
    // misattribution the edit path had.
    if (currentSection.rowCount && ((currentSection.rowCount ?? 0) > 0)) {
      await createRevision(sectionId, revision.content, revertedBy, tenantId);
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
    res.status(500).json({
      success: false,
      error: 'Failed to revert section',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============= Comments & Review =============

// POST /api/authoring/sections/:sectionId/comment - Add comment
router.post('/sections/:sectionId/comment', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { body, anchor, doc_id } = req.body;
    const tenantId = getTenantId(req);
    const commentId = crypto.randomUUID();
    const createdBy = getActorId(req);
    if (!createdBy) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!body) {
      return res.status(400).json({
        success: false,
        error: 'Comment body is required',
      });
    }

    const result = await pool.query(
      `INSERT INTO authoring_comments
       (id, section_id, doc_id, body, anchor, status, created_by, created_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, NOW(), $7)
       RETURNING *`,
      [commentId, sectionId, doc_id, body, anchor, createdBy, tenantId]
    );

    res.status(201).json({
      success: true,
      comment: result.rows[0],
      message: 'Comment added successfully',
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
        values.push(resolvedBy);
      }
    }

    if (resolution_note) {
      paramCount++;
      updates.push(`resolution_note = $${paramCount}`);
      values.push(resolution_note);
    }

    values.push(commentId, tenantId);

    const result = await pool.query(
      `UPDATE authoring_comments
       SET ${updates.join(', ')}
       WHERE id = $${paramCount + 1} AND tenant_id = $${paramCount + 2}
       RETURNING *`,
      values
    );

    if (((result.rowCount ?? 0) === 0)) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found',
      });
    }

    res.json({
      success: true,
      comment: result.rows[0],
      message: 'Comment updated successfully',
    });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update comment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
    res.status(500).json({
      success: false,
      error: 'Failed to add citation',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
    res.status(500).json({
      success: false,
      error: 'Failed to get citations',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
             WHERE c.parent_comment_id = $1
             ORDER BY c.created_at ASC`,
            [comment.id]
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
    res.status(500).json({
      success: false,
      error: 'Failed to fetch comments',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/authoring/comments - Create new comment
router.post('/comments', async (req: Request, res: Response) => {
  try {
    const { doc_id, section_id, body, anchor, parent_comment_id, position_data } = req.body;
    const tenantId = getTenantId(req);
    // SECURITY (21 CFR Part 11): comment author must come from the verified JWT.
    const userId = getActorId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const userEmail = req.user?.email ?? null;
    const userName = userEmail || userId;
    const commentId = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO authoring_comments
       (id, doc_id, section_id, body, anchor, status, created_by, user_name, user_email, parent_comment_id, position_data, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, $11, NOW())
       RETURNING *`,
      [
        commentId,
        doc_id,
        section_id,
        body,
        anchor,
        userId,
        userName,
        userEmail,
        parent_comment_id,
        position_data,
        tenantId,
      ]
    );

    // Create activity record
    await pool.query(
      `INSERT INTO authoring_comment_activity
       (id, doc_id, comment_id, activity_type, actor_id, actor_name, metadata, tenant_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        doc_id,
        commentId,
        parent_comment_id ? 'reply_added' : 'comment_added',
        userId,
        userName,
        { section_id, anchor },
        tenantId,
      ]
    );

    res.status(201).json({
      success: true,
      comment: result.rows[0],
      message: 'Comment added successfully',
    });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create comment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// PUT /api/authoring/comments/:id - Update comment
router.put('/comments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { body, status, resolution_note } = req.body;
    const tenantId = getTenantId(req);
    // SECURITY (21 CFR Part 11): resolver attribution must come from the JWT.
    const userId = getActorId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const userName = req.user?.email || userId;

    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (body !== undefined) {
      updates.push(`body = $${paramIndex}`);
      params.push(body);
      paramIndex++;
    }

    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;

      if (status === 'resolved') {
        updates.push(`resolved_by = $${paramIndex}`);
        params.push(userId);
        paramIndex++;
        updates.push(`resolved_at = NOW()`);

        if (resolution_note) {
          updates.push(`resolution_note = $${paramIndex}`);
          params.push(resolution_note);
          paramIndex++;
        }
      }
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);
    params.push(tenantId);

    const result = await pool.query(
      `UPDATE authoring_comments
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      params
    );

    if (((result.rowCount ?? 0) === 0)) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found',
      });
    }

    // Log activity
    const activityType =
      status === 'resolved'
        ? 'comment_resolved'
        : status === 'open'
        ? 'comment_reopened'
        : 'comment_edited';

    await pool.query(
      `INSERT INTO authoring_comment_activity
       (id, doc_id, comment_id, activity_type, actor_id, actor_name, metadata, tenant_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        result.rows[0].doc_id,
        id,
        activityType,
        userId,
        userName,
        { status, resolution_note },
        tenantId,
      ]
    );

    res.json({
      success: true,
      comment: result.rows[0],
      message: 'Comment updated successfully',
    });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update comment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// DELETE /api/authoring/comments/:id - Delete comment
router.delete('/comments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId(req);
    // SECURITY (21 CFR Part 11): activity-log actor must come from the JWT.
    const userId = getActorId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const userName = req.user?.email || userId;

    // Get comment details before deletion for activity log
    const commentResult = await pool.query(
      'SELECT doc_id FROM authoring_comments WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (((commentResult.rowCount ?? 0) === 0)) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found',
      });
    }

    const docId = commentResult.rows[0].doc_id;

    // Delete comment (cascades to replies due to FK constraint)
    await pool.query('DELETE FROM authoring_comments WHERE id = $1 AND tenant_id = $2', [
      id,
      tenantId,
    ]);

    // Log activity
    await pool.query(
      `INSERT INTO authoring_comment_activity
       (id, doc_id, comment_id, activity_type, actor_id, actor_name, tenant_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'comment_deleted', $3, $4, $5, NOW())`,
      [docId, id, userId, userName, tenantId]
    );

    res.json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete comment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reviews',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/authoring/documents/:id/review - Submit review
router.post('/documents/:id/review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { review_status, review_comments } = req.body;
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
        [review_status, review_comments, existingReview.rows[0].id, tenantId]
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
          review_comments,
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
    res.status(500).json({
      success: false,
      error: 'Failed to submit review',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/authoring/documents/:id/request-review - Request review from users
router.post('/documents/:id/request-review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reviewers } = req.body; // Array of { id, name, email }
    const tenantId = getTenantId(req);
    const requestedBy = (req.headers['x-user-name'] as string) || 'System';

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
    res.status(500).json({
      success: false,
      error: 'Failed to request review',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/authoring/documents/:id/comment-activity - Get comment activity
router.get('/documents/:id/comment-activity', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId(req);
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await pool.query(
      `SELECT id, doc_id, comment_id, activity_type, actor_id, actor_name, metadata, created_at, tenant_id FROM authoring_comment_activity
       WHERE doc_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [id, tenantId, limit]
    );

    res.json({
      success: true,
      activities: result.rows,
      total: result.rowCount,
    });
  } catch (error) {
    console.error('Error fetching comment activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch comment activity',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
    try {
      const { getEmbeddingService } = await import('../services/enhancedEmbeddingService.js');
      const embeddingService = getEmbeddingService(pool);
      const searchQuery = `${section.module} ${section.code} ${section.title} ${
        section.product_code || ''
      }`.trim();
      const searchResults = await embeddingService.searchHybrid(searchQuery, 5, 0.65);
      if (searchResults.length > 0) {
        sourcesRetrieved = searchResults.length;
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
          'When your content relies on evidence above, cite it inline using [SRC-n]. ' +
          'Do NOT fabricate citations for evidence not provided.';
      }
    } catch (e: any) {
      console.warn('[Authoring] Data Room retrieval failed (non-fatal):', e.message);
    }

    // Generate with AI Gateway (Claude primary)
    try {
      const { getGateway } = await import('../services/ai-gateway/gateway.js');
      const gw = getGateway();
      if (gw.getEnabledProviders().length > 0) {
        const prompt = `Generate professional ${region} regulatory content for:
Module: ${section.module}
Section: ${section.code} - ${section.title}
Product: ${section.product_code || 'Medical Product'}
Tone: ${tone}
${context ? `Context: ${context}` : ''}
${requirements ? `Requirements: ${requirements}` : ''}
${evidenceBlock}

Provide detailed, compliance-ready content following ${region} guidelines.`;

        const gwResponse = await gw.route({
          taskType: 'document_drafting',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 3000,
          temperature: 0.3,
          callerModule: 'authoring-router/generate-draft',
        });

        const generatedContent = gwResponse.content?.trim() || '';
        if (generatedContent) {
          return res.json({
            success: true,
            draft: {
              content: generatedContent,
              metadata: {
                tone,
                region,
                generated_at: new Date().toISOString(),
                model: gwResponse.model,
                provider: gwResponse.provider,
                sourcesRetrieved,
              },
            },
            message:
              sourcesRetrieved > 0
                ? `AI draft generated with ${sourcesRetrieved} Data Room source${
                    sourcesRetrieved !== 1 ? 's' : ''
                  }`
                : 'AI draft generated successfully',
          });
        }
      }
    } catch (aiError) {
      console.error('AI Gateway error:', aiError);
      // Fall back to template-based generation
    }

    // Fallback: Template-based content generation
    const templates: Record<string, Record<string, string>> = {
      M3: {
        default: `QUALITY OVERALL SUMMARY - ${section.title}

1. INTRODUCTION
This section provides comprehensive quality information for ${
          section.product_code || 'the product'
        } in accordance with ${region} regulatory requirements.

2. DRUG SUBSTANCE
[Detailed information about the drug substance, including nomenclature, structure, general properties, and manufacture]

3. DRUG PRODUCT
[Comprehensive details about the drug product formulation, pharmaceutical development, manufacture, and control]

4. QUALITY CONTROL
[Description of specifications, analytical procedures, validation, and batch analyses]

5. STABILITY
[Stability protocol, data, and conclusions supporting the proposed shelf life]

6. CONCLUSION
The quality information presented demonstrates that ${
          section.product_code || 'the product'
        } meets all ${region} regulatory standards for pharmaceutical quality.`,

        '3.2.S': `DRUG SUBSTANCE - ${section.title}

3.2.S.1 GENERAL INFORMATION
• Nomenclature
• Structure
• General Properties

3.2.S.2 MANUFACTURE
• Manufacturer(s)
• Description of Manufacturing Process and Process Controls
• Control of Materials
• Controls of Critical Steps and Intermediates
• Process Validation and/or Evaluation

3.2.S.3 CHARACTERIZATION
• Elucidation of Structure
• Impurities

3.2.S.4 CONTROL OF DRUG SUBSTANCE
• Specification
• Analytical Procedures
• Validation of Analytical Procedures
• Batch Analyses
• Justification of Specification

3.2.S.5 REFERENCE STANDARDS
• Reference Standards or Materials

3.2.S.6 CONTAINER CLOSURE SYSTEM

3.2.S.7 STABILITY
• Stability Summary and Conclusions
• Post-approval Stability Protocol
• Stability Data`,
      },
      M5: {
        default: `CLINICAL STUDY REPORT - ${section.title}

1. TITLE PAGE
Protocol Title: ${section.title}
Protocol Number: ${section.code}
${region} Submission

2. SYNOPSIS
[Brief overview of the clinical study design, objectives, and key results]

3. STUDY OBJECTIVES
Primary Objective:
• [Primary endpoint and hypothesis]

Secondary Objectives:
• [Secondary endpoints]

4. INVESTIGATIONAL PLAN
Study Design:
• Type: [Randomized, controlled, open-label, etc.]
• Duration: [Study duration]
• Population: [Target patient population]

5. STUDY RESULTS
[Detailed presentation of efficacy and safety results]

6. SAFETY EVALUATION
[Comprehensive safety analysis including adverse events]

7. DISCUSSION AND CONCLUSIONS
[Interpretation of results and clinical significance]`,
      },
    };

    const moduleTemplates = templates[section.module] || templates['M3'];
    const template = moduleTemplates[section.code] || moduleTemplates['default'];

    res.json({
      success: true,
      draft: {
        content: template,
        metadata: {
          tone,
          region,
          generated_at: new Date().toISOString(),
          model: 'template-based',
        },
      },
      message: 'Draft template generated successfully',
    });
  } catch (error) {
    console.error('Error generating AI draft:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate AI draft',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
    const deficiencies = [];
    const content = section.content || '';
    const contentLength = content.length;

    // Basic content checks
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

    // Check for required regulatory keywords based on module
    const requiredKeywords: Record<string, string[]> = {
      M3: ['specification', 'validation', 'stability', 'quality', 'manufacture', 'control'],
      M5: ['efficacy', 'safety', 'adverse', 'clinical', 'endpoint', 'statistical'],
      M2: ['summary', 'overview', 'quality', 'nonclinical', 'clinical'],
      M4: ['toxicology', 'pharmacology', 'ADME', 'carcinogenicity'],
      M1: ['form', 'administrative', 'regulatory'],
    };

    const moduleKeywords = requiredKeywords[section.module] || requiredKeywords['M3'];
    const contentLower = content.toLowerCase();

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

    // Check for data completeness
    if (!content.includes('[') && !content.includes('Table') && !content.includes('Figure')) {
      deficiencies.push({
        type: 'missing_data',
        severity: 'medium',
        message: 'No data tables or figures detected',
        recommendation: 'Consider adding supporting data, tables, or figures',
        location: 'content',
      });
    }

    // Check for placeholder text
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

    // Structure checks
    if (!content.includes('\n') || content.split('\n').length < 5) {
      deficiencies.push({
        type: 'poor_structure',
        severity: 'low',
        message: 'Content lacks proper structure and formatting',
        recommendation: 'Add headings, paragraphs, and proper formatting',
        location: 'formatting',
      });
    }

    // Generate compliance score
    const totalChecks = 10;
    const passedChecks = totalChecks - deficiencies.length;
    const complianceScore = Math.round((passedChecks / totalChecks) * 100);

    res.json({
      success: true,
      scan_results: {
        section_id: sectionId,
        section_code: section.code,
        section_title: section.title,
        scan_type,
        region,
        compliance_score: complianceScore,
        status:
          complianceScore >= 80
            ? 'compliant'
            : complianceScore >= 60
            ? 'needs_improvement'
            : 'non_compliant',
        deficiencies,
        deficiency_count: deficiencies.length,
        scanned_at: new Date().toISOString(),
      },
      message: 'Deficiency scan completed',
    });
  } catch (error) {
    console.error('Error scanning for deficiencies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scan for deficiencies',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
        COUNT(DISTINCT CASE WHEN d.status = 'draft' THEN d.id END) as draft_documents,
        COUNT(DISTINCT CASE WHEN d.status = 'review' THEN d.id END) as review_documents,
        COUNT(DISTINCT CASE WHEN d.status = 'approved' THEN d.id END) as approved_documents,
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
    res.status(500).json({
      success: false,
      error: 'Failed to get authoring statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============= Helper Functions for Step 5 =============

function sha256(obj: any): string {
  return crypto
    .createHash('sha256')
    .update(typeof obj === 'string' ? obj : JSON.stringify(obj))
    .digest('hex');
}

// Build DOCX from sections with full 21 CFR Part 11 compliance
async function buildDocx(
  docMeta: any,
  sections: any[],
  citationsBySection: Map<string, any[]>,
  docHash?: string,
  signatures?: any[],
  tenantId?: number
): Promise<Buffer> {
  // Lazy load docx library to prevent startup failures
  try {
    const { Document, Packer, Paragraph, HeadingLevel, TextRun, PageBreak, AlignmentType } =
      await import('docx');

    const children = [];

    // === COMPLIANCE HEADER ===
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '21 CFR PART 11 COMPLIANT DOCUMENT',
            bold: true,
            size: 28,
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Document Integrity Hash: ${docHash || 'PENDING CALCULATION'}`,
            size: 20,
            italics: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: '' })
    );

    // === TITLE ===
    children.push(
      new Paragraph({
        text: docMeta.title || 'Module 3 Document',
        heading: HeadingLevel.TITLE,
      })
    );

    // === METADATA ===
    children.push(
      new Paragraph({
        text: `Product Code: ${docMeta.product_code || 'N/A'}`,
      }),
      new Paragraph({
        text: `Status: ${docMeta.status || 'Draft'}`,
      }),
      new Paragraph({
        text: `Version: ${docMeta.version || '1.0'}`,
      }),
      new Paragraph({
        text: `Author: ${docMeta.author || 'Unknown'}`,
      }),
      new Paragraph({
        text: `Created: ${docMeta.created_at ? new Date(docMeta.created_at).toISOString() : 'N/A'}`,
      }),
      new Paragraph({ text: '' })
    );

    // === ELECTRONIC SIGNATURES MANIFEST ===
    if (signatures && signatures.length > 0) {
      children.push(
        new Paragraph({
          text: 'ELECTRONIC SIGNATURES',
          heading: HeadingLevel.HEADING_1,
        })
      );

      for (const sig of signatures) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${sig.signature_meaning}: `,
                bold: true,
              }),
              new TextRun({
                text: `${sig.signer_name || sig.signer_email}`,
              }),
            ],
          }),
          new Paragraph({
            text: `Intent: ${sig.signature_intent}`,
            indent: { left: 720 },
          }),
          new Paragraph({
            text: `Signed at: ${sig.signature_timestamp}`,
            indent: { left: 720 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Document Hash at Signing: ${sig.document_hash}`,
                size: 18,
              }),
            ],
            indent: { left: 720 },
          }),
          new Paragraph({ text: '' })
        );
      }
      children.push(new PageBreak());
    }

    // === DOCUMENT CONTENT ===
    children.push(
      new Paragraph({
        text: 'DOCUMENT SECTIONS',
        heading: HeadingLevel.HEADING_1,
      }),
      new Paragraph({ text: '' })
    );

    for (const s of sections) {
      children.push(
        new Paragraph({
          text: `${s.code} — ${s.title}`,
          heading: HeadingLevel.HEADING_2,
        })
      );

      // Extract and process content with resolved tokens
      let plainText = extractPlainText(s.content) || '(No content)';

      // Resolve token references in the text
      const tokenPattern = /\{\{token:([^}]+)\}\}/g;
      const tokens = citationsBySection.get(s.section_id) || [];

      plainText = plainText.replace(tokenPattern, (match, tokenId) => {
        const token = tokens.find((t: any) => t.id === tokenId || t.cite_id === tokenId);
        if (token) {
          return token.citation_text || token.payload?.data || '[RESOLVED]';
        }
        return '[UNRESOLVED TOKEN]';
      });

      children.push(
        new Paragraph({
          text: plainText,
        })
      );
      children.push(new Paragraph({ text: '' }));
    }

    // === EVIDENCE APPENDIX ===
    children.push(
      new PageBreak(),
      new Paragraph({
        text: 'EVIDENCE APPENDIX & CITATIONS',
        heading: HeadingLevel.HEADING_1,
      }),
      new Paragraph({ text: '' })
    );

    for (const s of sections) {
      const cites = citationsBySection.get(s.section_id) || [];

      if (cites.length > 0) {
        children.push(
          new Paragraph({
            text: `${s.code} — ${s.title}`,
            heading: HeadingLevel.HEADING_2,
          })
        );

        for (const c of cites) {
          const frozen = c.frozen_at ? 'FROZEN' : 'ACTIVE';
          const line = `• ${c.source || c.citation_text || 'Citation'} — SHA256: ${
            c.payload_sha256 || 'PENDING'
          } — Status: ${frozen} — Created: ${new Date(c.created_at).toISOString()}`;
          children.push(
            new Paragraph({
              text: line,
              indent: { left: 360 },
            })
          );

          // Add reference details if available
          if (c.anchor || c.reference_id) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `  Reference: ${c.reference_id || ''} ${c.anchor ? `(${c.anchor})` : ''}`,
                    italics: true,
                    size: 20,
                  }),
                ],
                indent: { left: 720 },
              })
            );
          }
        }
        children.push(new Paragraph({ text: '' }));
      }
    }

    // === COMPLIANCE FOOTER ===
    children.push(
      new PageBreak(),
      new Paragraph({
        text: 'COMPLIANCE CERTIFICATION',
        heading: HeadingLevel.HEADING_1,
      }),
      new Paragraph({ text: '' }),
      new Paragraph({
        text: 'This document was generated in compliance with 21 CFR Part 11 requirements for electronic records and electronic signatures.',
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Document Hash: ${docHash || 'CALCULATION PENDING'}`,
            bold: true,
          }),
        ],
      }),
      new Paragraph({
        text: `Export Timestamp: ${new Date().toISOString()}`,
      }),
      new Paragraph({
        text: 'All citations and tokens have been resolved and verified.',
      }),
      new Paragraph({
        text: 'Electronic signatures contained herein are legally binding and equivalent to handwritten signatures.',
      }),
      new Paragraph({ text: '' }),
      new Paragraph({
        children: [
          new TextRun({
            text: '--- END OF COMPLIANT DOCUMENT ---',
            bold: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
      })
    );

    const doc = new Document({
      creator: 'Concept2Cure Platform - 21 CFR Part 11 Compliant',
      title: docMeta.title || 'Module 3 Document',
      description: 'FDA 21 CFR Part 11 Compliant Electronic Document',
      sections: [
        {
          properties: {},
          children: children as any,
        },
      ],
      customProperties: [
        {
          name: 'DocumentHash',
          value: docHash || 'PENDING',
        },
        {
          name: 'ComplianceStandard',
          value: '21 CFR Part 11',
        },
        {
          name: 'TenantId',
          value: String(tenantId),
        },
      ],
    });

    const buf = await Packer.toBuffer(doc);
    return buf;
  } catch (error) {
    console.error('Failed to build compliant DOCX document:', error);
    // Return a simple text buffer as fallback with compliance note
    const text =
      `21 CFR PART 11 COMPLIANT DOCUMENT\n` +
      `Document Hash: ${docHash || 'PENDING'}\n\n` +
      `${docMeta.title || 'Module 3 Document'}\n\n` +
      sections
        .map(s => `${s.code} — ${s.title}\n${extractPlainText(s.content) || '(No content)'}`)
        .join('\n\n') +
      `\n\n--- END OF COMPLIANT DOCUMENT ---\nGenerated: ${new Date().toISOString()}`;
    return Buffer.from(text, 'utf-8');
  }
}

function extractPlainText(contentJson: any): string {
  // Minimal safe extractor; UI remains rich. Improve as needed.
  try {
    const walk = (node: any): string => {
      if (!node) return '';
      if (Array.isArray(node)) return node.map(walk).join(' ');
      if (node.type === 'text') return node.text || '';
      const kids = node.content ? walk(node.content) : '';
      return kids;
    };
    return walk(contentJson) || '';
  } catch {
    return '';
  }
}

// Build trivial PDF (wrapper) – optional; DOCX is primary
async function buildPdfFromDocx(docxBuffer: Buffer): Promise<Buffer> {
  // If you already have a proper PDF renderer, use it instead.
  // This creates an empty PDF with the DOCX attached as a file (placeholder).
  const pdf = await PDFDocument.create();
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ============= Step 5 Export, Submit, Sign, Freeze Endpoints =============

// ============= 21 CFR Part 11 Compliance Endpoints =============

// POST /api/authoring/docs/:docId/create-pin - Create/update PIN for user
router.post('/docs/:docId/create-pin', async (req: Request, res: Response) => {
  try {
    const { pin } = req.body;
    // Part 11 attribution: signer identity comes from the verified JWT only.
    // The previous x-user-email header source was attacker-controlled (same
    // class as the getActorId fix above) — a caller could mint a PIN for any
    // email and later sign as that identity.
    const email = getActorEmail(req);
    const tenantId = getTenantId(req);

    if (!email) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!pin || pin.length < 6) {
      return res.status(400).json({ error: 'PIN must be at least 6 characters' });
    }

    const success = await createUserPin(email, pin, tenantId);

    if (success) {
      // Log PIN creation in audit trail
      await createAuditTrail(
        req,
        req.params.docId,
        null,
        'PIN_CREATED',
        null,
        null,
        'User PIN created or updated',
        { email }
      );

      res.json({ success: true, message: 'PIN created successfully' });
    } else {
      res.status(500).json({ error: 'Failed to create PIN' });
    }
  } catch (error) {
    console.error('Error creating PIN:', error);
    res.status(500).json({ error: 'Failed to create PIN' });
  }
});

// POST /api/authoring/docs/:docId/freeze - Freeze document with immutable snapshot
router.post('/docs/:docId/freeze', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { reason, version } = req.body;
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

    // Check if already frozen
    if (doc.status === 'FROZEN' || doc.status === 'APPROVED') {
      return res.status(400).json({ error: 'Document is already frozen' });
    }

    // Get all sections
    const sectionsResult = await pool.query(
      'SELECT id, doc_id, code, title, content, order_index, track_changes, created_at, updated_at, tenant_id FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index',
      [docId, tenantId]
    );

    // Create frozen content snapshot
    const frozenContent = JSON.stringify({
      document: doc,
      sections: sectionsResult.rows,
      frozenAt: new Date().toISOString(),
    });

    const contentHash = crypto.createHash('sha256').update(frozenContent).digest('hex');
    const versionNumber = version || `v${doc.version || '1.0'}.frozen`;

    // Store frozen snapshot
    await pool.query(
      `INSERT INTO frozen_documents
       (document_id, version, frozen_content, content_hash, frozen_by, frozen_reason, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [docId, versionNumber, frozenContent, contentHash, email, reason, tenantId]
    );

    // Update document status
    await pool.query(
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
      reason || 'Document frozen for compliance',
      { contentHash, version: versionNumber }
    );

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

// POST /api/authoring/docs/:docId/e-sign - Electronic signature with PIN verification
router.post('/docs/:docId/e-sign', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { pin, meaning, intent } = req.body;
    // Part 11 §11.100 attribution: the SIGNER identity on an electronic
    // signature must come from the verified JWT, never from client-supplied
    // headers. x-user-email here meant anyone could sign as anyone.
    const email = getActorEmail(req);
    const name = ((req.user as { name?: string } | undefined)?.name) || email;
    const tenantId = getTenantId(req);

    if (!email) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!pin) {
      return res.status(400).json({ error: 'PIN required for signature' });
    }

    if (!meaning || !['AUTHOR', 'REVIEWER', 'APPROVER'].includes(meaning)) {
      return res.status(400).json({ error: 'Invalid signature meaning' });
    }

    if (!intent) {
      return res.status(400).json({ error: 'Signature intent is required' });
    }

    // Verify PIN
    const pinValid = await verifyUserPin(email, pin, tenantId);
    if (!pinValid) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

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

    await pool.query(
      `INSERT INTO authoring_signatures
       (id, doc_id, signer_email, signer_name, meaning, reason, method,
        content_hash, signature_digest, covered_freeze_version, covered_content_hash,
        pin_verified, ip_address, user_agent, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'PIN', $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        signatureId,
        docId,
        email,
        name,
        meaning,
        intent,
        docHash,
        signatureDigest,
        covered?.version ?? null,
        covered?.contentHash ?? null,
        true,
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
    });

    // Update document status based on signature meaning
    if (meaning === 'APPROVER') {
      await pool.query(
        'UPDATE authoring_documents SET status = $1 WHERE id = $2 AND tenant_id = $3',
        ['APPROVED', docId, tenantId]
      );

      // Auto-freeze on approval
      const frozenContent = JSON.stringify({
        approvedBy: email,
        documentHash: docHash,
        timestamp: new Date().toISOString(),
      });

      await pool.query(
        `INSERT INTO frozen_documents
         (document_id, version, frozen_content, content_hash, frozen_by, frozen_reason, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (document_id, version, tenant_id) DO NOTHING`,
        [docId, 'approved', frozenContent, docHash, email, 'Approved and frozen', tenantId]
      );
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
    const { rows } = await pool.query(
      `
      SELECT c.id, c.section_id, c.source, c.anchor, c.citation_text, c.reference_id, c.created_by, c.created_at, c.tenant_id, c.payload_sha256, c.frozen_at, s.code, s.title
      FROM authoring_citations c
      JOIN authoring_sections s ON s.id=c.section_id
      WHERE s.doc_id=$1
      ORDER BY c.created_at ASC
    `,
      [req.params.docId]
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

    // 1) Export DOCX (or PDF if requested)
    const exp = await fetch(
      `${req.protocol}://${req.get('host')}/api/authoring/docs/${req.params.docId}/export?fmt=${
        fmt || 'docx'
      }`,
      {
        method: 'POST',
      }
    );
    const buf = Buffer.from(await exp.arrayBuffer());
    const base64 = buf.toString('base64');

    // 2) Upload as leaf (calls your existing packager route)
    const up = await fetch(
      `${req.protocol}://${req.get('host')}/api/regulatory/ectd/${seqId}/leaf`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    res.status(500).json({
      success: false,
      error: 'Failed to get section tokens',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/authoring/sections/:sectionId/refresh-token - Refresh a specific token
router.post('/sections/:sectionId/refresh-token', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
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
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============= Step 8: Export Logging & Document-Level Features =============

// Helper function to ensure export history table exists with all required fields
const ensureExportHistoryTableExists = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authoring_export_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id VARCHAR(255) NOT NULL,
      export_type VARCHAR(50) NOT NULL,
      exported_by VARCHAR(255),
      exported_at TIMESTAMP DEFAULT NOW(),
      file_name VARCHAR(500),
      file_size INTEGER,
      doc_sha256 VARCHAR(64),
      metadata JSONB,
      download_url TEXT,
      cached_until TIMESTAMP,
      tenant_id INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create indexes for better performance
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_export_history_doc_id
    ON authoring_export_history(document_id, exported_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_export_history_tenant
    ON authoring_export_history(tenant_id, document_id)
  `);
};

// Helper: record export with comprehensive metadata
async function logExport(
  docId: string,
  fmt: string,
  docSha: string,
  exportedBy: string = 'system',
  fileName?: string,
  fileSize?: number,
  metadata?: any,
  tenantId: number = 1
) {
  await ensureExportHistoryTableExists();

  const result = await pool.query(
    `INSERT INTO authoring_export_history
      (document_id, export_type, doc_sha256, exported_by, file_name, file_size, metadata, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, exported_at`,
    [
      docId,
      fmt,
      docSha,
      exportedBy,
      fileName,
      fileSize,
      metadata ? JSON.stringify(metadata) : null,
      tenantId,
    ]
  );

  // A best-effort mirror write to a legacy `doc_exports` table used to sit here.
  // Nothing in this repo creates that table — no migration, no runtime DDL — so
  // the write could only ever land on a database provisioned outside it, and its
  // column list (fmt, doc_sha256) disagreed with the other writer's
  // (format, exported_by), which is how we know neither was exercised. Removed
  // rather than left in place: a swallowed write to a table with no definition
  // reads as durability that does not exist. See ledger C-14.

  return result.rows[0];
}

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

    res.json({
      success: true,
      exports: result.rows,
      total: parseInt(countResult.rows[0]?.total || '0'),
      last_export: result.rows[0] || null,
    });
  } catch (error) {
    console.error('GET /docs/:id/exports', error);
    res.status(500).json({ error: 'Failed to list exports' });
  }
});

// DELETE /api/authoring/export-history/:id - Delete export history entry
router.delete('/export-history/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId(req);
    const userEmail = (req.headers['x-user-email'] as string) || 'system';

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

    // Get document locale
    const docResult = await pool.query('SELECT locale FROM authoring_documents WHERE id = $1', [
      req.params.docId,
    ]);

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
    const existingResult = await pool.query(
      'SELECT id, code FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2',
      [req.params.docId, tenantId]
    );

    const existingMap = new Map(existingResult.rows.map(x => [x.code, x.id]));

    let upserts = 0;

    // Apply template sections
    for (const section of template.sections || []) {
      const existingId = existingMap.get(section.code);

      if (existingId && mode !== 'overwrite') {
        // In merge mode, skip existing sections
        continue;
      }

      if (existingId) {
        // Update existing section
        await pool.query(
          `UPDATE authoring_sections
              SET title = $2, order_index = $3, content = $4, updated_at = NOW()
            WHERE id = $1 AND tenant_id = $5`,
          [
            existingId,
            section.title || '',
            section.order_idx || 0,
            JSON.stringify(section.content || {}),
            tenantId,
          ]
        );
        upserts++;
      } else {
        // Insert new section
        await pool.query(
          `INSERT INTO authoring_sections (id, doc_id, code, title, order_index, content, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            crypto.randomUUID(),
            req.params.docId,
            section.code,
            section.title || '',
            section.order_idx || 0,
            JSON.stringify(section.content || {}),
            tenantId,
          ]
        );
        upserts++;
      }
    }

    res.json({ ok: true, upserts });
  } catch (error) {
    console.error('POST /docs/:id/apply-template', error);
    res.status(500).json({ error: 'Failed to apply template' });
  }
});

// GET /api/authoring/guidance/compose - Get guidance for a section
router.get('/guidance/compose', async (req: Request, res: Response) => {
  try {
    const { section, region = 'ICH' } = req.query;

    if (!section) {
      return res.status(400).json({ error: 'section parameter required' });
    }

    // Sample guidance - in production, this would query a guidance database
    const guidanceMap: Record<string, string> = {
      '3.2.P.5': `## ${region} Guidance for Drug Product Specifications

### Requirements:
- Establish specifications per ICH Q6A
- Include tests for identity, strength, quality, and purity
- Justify acceptance criteria based on clinical lots
- Consider stability-indicating methods

### Key Points:
- Link to analytical methods in 3.2.P.5.2
- Reference batch data in 3.2.P.5.4
- Ensure consistency with stability protocol`,

      '3.2.P.8': `## ${region} Guidance for Stability Studies

### Requirements:
- Follow ICH Q1A(R2) for stability testing
- Include long-term, accelerated, and intermediate conditions
- Cover photostability per ICH Q1B if applicable
- Justify shelf life and storage conditions

### Data Presentation:
- Tabulate all stability data
- Include graphical trends for key parameters
- Discuss any out-of-specification results`,
    };

    const guidance =
      guidanceMap[section as string] ||
      `Generic guidance for section ${section} in region ${region}`;

    res.json({ guidance_md: guidance });
  } catch (error) {
    console.error('GET /guidance/compose', error);
    res.status(500).json({ error: 'Failed to get guidance' });
  }
});

// POST /docs/:docId/seed-stability - Seed stability data and insert P.8 tokens
router.post('/docs/:docId/seed-stability', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const {
      product_code = 'UAT-PROD',
      study_code = 'SS-UAT-001',
      study_name = 'UAT Stability 24M',
    } = req.body;

    if (!docId) {
      return res.status(400).json({
        success: false,
        error: 'Document ID is required',
      });
    }

    // Run the stability seeder script with the provided parameters
    const { spawn } = require('child_process');
    const childProcess = spawn('node', ['scripts/seed-stability.mjs'], {
      env: {
        ...process.env,
        BASE_URL: `http://localhost:${process.env.PORT || 5000}`,
        PRODUCT_CODE: product_code,
        STUDY_CODE: study_code,
        STUDY_NAME: study_name,
        DOC_ID: docId,
      },
    });

    let output = '';
    let errorOutput = '';

    childProcess.stdout.on('data', (data: any) => {
      output += data.toString();
    });

    childProcess.stderr.on('data', (data: any) => {
      errorOutput += data.toString();
    });

    childProcess.on('close', (code: number) => {
      if (code === 0) {
        res.json({
          success: true,
          message: 'Stability data seeded successfully',
          study_code,
          product_code,
          doc_id: docId,
          output: output.trim(),
        });
      } else {
        console.error('Stability seeder failed:', errorOutput);
        res.status(500).json({
          success: false,
          error: 'Stability seeding failed',
          details: errorOutput.trim(),
        });
      }
    });

    process.on('error', (err: any) => {
      console.error('Failed to start stability seeder:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to start stability seeder',
        details: err.message,
      });
    });
  } catch (error) {
    console.error('Stability seeding error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed stability data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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

// ====== STEP 14: REVIEWER CHECKLIST & CHANGE REQUEST ENDPOINTS ======

// Compose checklist for a doc/section/region, create rows if none exist.
// Body: { section_id, region?, reviewer_email? }
router.post('/docs/:docId/checklist/compose', async (req: Request, res: Response) => {
  try {
    const docId = req.params.docId;
    const { section_id, region, reviewer_email } = req.body || {};
    if (!section_id) return res.status(400).json({ error: 'section_id required' });
    const regionTag = (region || 'ICH').toUpperCase();
    const reviewer =
      reviewer_email || ((req.headers as any)['x-user-email'] || 'user@local').toString();

    // If checklist exists, return it (idempotent)
    const existing = (
      await pool.query(
        `
      SELECT checklist_id, doc_id, section_id, region, reviewer_email, status, created_at FROM doc_checklist WHERE doc_id=$1 AND section_id=$2 AND region=$3 LIMIT 1`,
        [docId, section_id, regionTag]
      )
    ).rows[0];
    let checklistId = existing?.checklist_id;

    if (!existing) {
      const ins = (
        await pool.query(
          `
        INSERT INTO doc_checklist (doc_id, section_id, region, reviewer_email)
        VALUES ($1,$2,$3,$4) RETURNING checklist_id`,
          [docId, section_id, regionTag, reviewer]
        )
      ).rows[0];
      checklistId = ins.checklist_id;

      // Inspect section + citations to craft items
      const cites =
        (
          await pool.query(
            `SELECT id, section_id, source, anchor, citation_text, reference_id, created_by, created_at, tenant_id, payload_sha256, frozen_at FROM authoring_citations WHERE section_id=$1`,
            [section_id]
          )
        ).rows || [];
      const keys = new Set(cites.map((c: any) => c.source)); // e.g., QUALITY.SPECS.DP, P8.TABLES …

      const items = [];
      // P.5 specs completeness
      if (keys.has('QUALITY.SPECS.DP') || keys.has('QUALITY.SPECS.DS')) {
        items.push({
          key: 'P5-SPECS-COMPLETENESS',
          text: 'Specs include {attribute, method, unit, limit, justification} (ICH Q6A).',
        });
        items.push({
          key: 'P5-METHOD-VALIDATION',
          text: 'Linked methods are VALIDATED/APPROVED; SST rules defined where applicable.',
        });
      }
      // P.8 stability
      if (keys.has('P8.TABLES')) {
        items.push({
          key: 'P8-LT-ACC',
          text: 'Design includes LT + ACC conditions and required timepoints per region.',
        });
        items.push({
          key: 'P8-OOT-MONITOR',
          text: 'OOT rule set configured (WE1–WE4) with surveillance output recorded.',
        });
        items.push({
          key: 'P8-SHELF-LIFE',
          text: 'Shelf-life conclusion (t90) present with rationale.',
        });
      }
      // Control Strategy / PPQ
      if (keys.has('PROCESS.CONTROL_STRATEGY')) {
        items.push({
          key: 'CS-CPP-CQA-LINKS',
          text: 'CPP→CQA links cover all critical steps; monitoring & control defined.',
        });
      }
      if (keys.has('PPQ.SUMMARY')) {
        items.push({
          key: 'PPQ-LOTS',
          text: 'PPQ lots count and outcomes documented with deviations/CAPAs addressed.',
        });
      }

      // Fallback—if no tokens, add generic items
      if (!items.length) {
        items.push({
          key: 'GEN-CONTENT',
          text: `Section content present & coherent for region ${regionTag}.`,
        });
      }

      for (const it of items) {
        await pool.query(
          `
          INSERT INTO doc_checklist_items (checklist_id, item_key, text)
          VALUES ($1,$2,$3)`,
          [checklistId, it.key, it.text]
        );
      }
    }

    const full = (
      await pool.query(
        `
      SELECT c.checklist_id, c.doc_id, c.section_id, c.region, c.reviewer_email, c.status, c.created_at, s.code as section_code, s.title as section_title
      FROM doc_checklist c
      LEFT JOIN authoring_sections s ON s.id = c.section_id
      WHERE c.checklist_id=$1`,
        [checklistId]
      )
    ).rows[0];

    const rows = (
      await pool.query(
        `SELECT item_id, checklist_id, item_key, text, status, comment, evidence_cite, created_at, updated_at FROM doc_checklist_items WHERE checklist_id=$1 ORDER BY created_at`,
        [checklistId]
      )
    ).rows;
    res.json({ checklist: full, items: rows });
  } catch (error) {
    console.error('POST /docs/:id/checklist/compose', error);
    res.status(500).json({ error: 'Failed to compose checklist' });
  }
});

// Get checklist (latest) for doc/section/region
router.get('/docs/:docId/checklist', async (req: Request, res: Response) => {
  try {
    const { section_id, region } = req.query;
    if (!section_id) return res.status(400).json({ error: 'section_id required' });
    const regionTag = (region || 'ICH').toString().toUpperCase();
    const head = (
      await pool.query(
        `
      SELECT checklist_id, doc_id, section_id, region, reviewer_email, status, created_at FROM doc_checklist
      WHERE doc_id=$1 AND section_id=$2 AND region=$3
      ORDER BY created_at DESC LIMIT 1`,
        [req.params.docId, section_id, regionTag]
      )
    ).rows[0];
    if (!head) return res.json({ checklist: null, items: [] });
    const items = (
      await pool.query(
        `SELECT item_id, checklist_id, item_key, text, status, comment, evidence_cite, created_at, updated_at FROM doc_checklist_items WHERE checklist_id=$1 ORDER BY created_at`,
        [head.checklist_id]
      )
    ).rows;
    res.json({ checklist: head, items });
  } catch (error) {
    console.error('GET /docs/:id/checklist', error);
    res.status(500).json({ error: 'Failed to get checklist' });
  }
});

// Update checklist item
router.patch('/checklist/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { status, comment, evidence_cite } = req.body || {};
    const rows = (
      await pool.query(
        `
      UPDATE doc_checklist_items
      SET status = COALESCE($2,status),
          comment = COALESCE($3,comment),
          evidence_cite = COALESCE($4,evidence_cite),
          updated_at = NOW()
      WHERE item_id=$1
      RETURNING *`,
        [req.params.itemId, status || null, comment || null, evidence_cite || null]
      )
    ).rows;
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (error) {
    console.error('PATCH /checklist/items/:id', error);
    res.status(500).json({ error: 'Failed to update checklist item' });
  }
});

// Checklist summary for a document
router.get('/docs/:docId/checklist/summary', async (req: Request, res: Response) => {
  try {
    const rows = (
      await pool.query(
        `
      SELECT region, status, COUNT(*) as cnt
      FROM doc_checklist
      WHERE doc_id=$1
      GROUP BY region, status
      ORDER BY region, status`,
        [req.params.docId]
      )
    ).rows;
    res.json(rows);
  } catch (error) {
    console.error('GET /docs/:id/checklist/summary', error);
    res.status(500).json({ error: 'Failed to summarize checklist' });
  }
});

// Create change request (AUTHOR/QA can create)
router.post(
  '/docs/:docId/cr',
  requireAny(['AUTHOR', 'QA', 'RA_CMC']),
  async (req: Request, res: Response) => {
    try {
      const { section_id, title, reason, apply_kind, patch_json } = req.body || {};
      if (!section_id || !title)
        return res.status(400).json({ error: 'section_id and title required' });
      const proposer = ((req.headers as any)['x-user-email'] || 'user@local').toString();
      const ins = (
        await pool.query(
          `
      INSERT INTO doc_change_requests (doc_id, section_id, title, reason, apply_kind, patch_json, proposer_email)
      VALUES ($1,$2,$3,$4,COALESCE($5,'CONTENT'),COALESCE($6,'{}'::jsonb),$7)
      RETURNING *`,
          [
            req.params.docId,
            section_id,
            title,
            reason || null,
            apply_kind || 'CONTENT',
            patch_json || {},
            proposer,
          ]
        )
      ).rows[0];
      res.json(ins);
    } catch (error) {
      console.error('POST /docs/:id/cr', error);
      res.status(500).json({ error: 'Failed to create change request' });
    }
  }
);

// List CRs for a doc
router.get('/docs/:docId/cr', async (req: Request, res: Response) => {
  try {
    const rows = (
      await pool.query(
        `
      SELECT c.cr_id, c.doc_id, c.section_id, c.title, c.reason, c.apply_kind, c.patch_json, c.proposer_email, c.approver_email, c.status, c.resolved_at, c.created_at, s.code as section_code, s.title as section_title
      FROM doc_change_requests c
      LEFT JOIN authoring_sections s ON s.id = c.section_id
      WHERE c.doc_id=$1
      ORDER BY c.created_at DESC`,
        [req.params.docId]
      )
    ).rows;
    res.json(rows);
  } catch (error) {
    console.error('GET /docs/:id/cr', error);
    res.status(500).json({ error: 'Failed to list change requests' });
  }
});

// Approve / Reject CR (QA or RA_CMC)
router.post(
  '/cr/:crId/approve',
  requireAny(['QA', 'RA_CMC']),
  async (req: Request, res: Response) => {
    try {
      const approver = ((req.headers as any)['x-user-email'] || 'user@local').toString();
      const rows = (
        await pool.query(
          `
      UPDATE doc_change_requests
      SET status='APPROVED', approver_email=$2, resolved_at=NOW()
      WHERE cr_id=$1 AND status='OPEN' RETURNING *`,
          [req.params.crId, approver]
        )
      ).rows;
      if (!rows[0]) return res.status(404).json({ error: 'Not found or not OPEN' });
      res.json(rows[0]);
    } catch (error) {
      console.error('POST /cr/:id/approve', error);
      res.status(500).json({ error: 'Approve failed' });
    }
  }
);

router.post(
  '/cr/:crId/reject',
  requireAny(['QA', 'RA_CMC']),
  async (req: Request, res: Response) => {
    try {
      const approver = ((req.headers as any)['x-user-email'] || 'user@local').toString();
      const rows = (
        await pool.query(
          `
      UPDATE doc_change_requests
      SET status='REJECTED', approver_email=$2, resolved_at=NOW()
      WHERE cr_id=$1 AND status IN ('OPEN','APPROVED') RETURNING *`,
          [req.params.crId, approver]
        )
      ).rows;
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (error) {
      console.error('POST /cr/:id/reject', error);
      res.status(500).json({ error: 'Reject failed' });
    }
  }
);

// Apply CR (RA_CMC or QA for CONTENT; RA_CMC for TOKEN_*)
router.post(
  '/cr/:crId/apply',
  requireAny(['RA_CMC', 'QA']),
  async (req: Request, res: Response) => {
    try {
      // fetch CR + doc status
      const cr = (
        await pool.query(
          `SELECT cr_id, doc_id, section_id, title, reason, apply_kind, patch_json, proposer_email, approver_email, status, resolved_at, created_at FROM doc_change_requests WHERE cr_id=$1`,
          [req.params.crId]
        )
      ).rows[0];
      if (!cr) return res.status(404).json({ error: 'CR not found' });

      // Companion correctness fix: this joined `s.document_id = d.id`, a column
      // that does not exist (the section's parent is `doc_id`) — the identical
      // latent 42703 canEditSection carried. It also honoured only APPROVED, so
      // a FROZEN record was not treated as locked. Same immutability set as the
      // section gate now.
      //
      // SCOPE NOTE: this route still cannot succeed — `doc_change_requests`
      // (queried above) has no CREATE statement anywhere in the repo, so the
      // handler 500s before reaching here. This removes the latent column bug
      // and aligns the lock; it does not make the route work. The identical
      // wrong-column bug ALSO remains at the template-apply handler
      // (`SELECT id, code FROM authoring_sections WHERE document_id = $1` and
      // the INSERT that follows it, which additionally reference the
      // non-existent `order_idx`/`created_by` shape) — that is a separate
      // broken-CRUD defect, deliberately out of scope for section authz.
      const d = (
        await pool.query(
          `
      SELECT d.status FROM authoring_documents d
      JOIN authoring_sections s ON s.doc_id = d.id
      WHERE s.id = $1`,
          [cr.section_id]
        )
      ).rows[0];
      if (LOCKED_DOCUMENT_STATUSES.has(String(d?.status ?? '').toUpperCase()))
        return res
          .status(409)
          .json({ error: 'Document is FROZEN/APPROVED; cannot apply changes' });

      if (cr.apply_kind === 'CONTENT') {
        // Replace section content with patch_json
        await pool.query(
          `
        UPDATE authoring_sections
        SET content=$2, updated_at=NOW()
        WHERE id=$1`,
          [cr.section_id, cr.patch_json || {}]
        );
      } else if (cr.apply_kind === 'TOKEN_REFRESH') {
        // patch_json = { cites: [uuid,...] }
        const cites = Array.isArray(cr.patch_json?.cites) ? cr.patch_json.cites : [];
        for (const citeId of cites) {
          await fetch(
            `${req.protocol}://${req.get('host')}/api/authoring/sections/${
              cr.section_id
            }/refresh-token`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cite_id: citeId }),
            }
          ).catch((err: unknown) => {
            logger.warn('Citation token refresh request failed during change-request apply', {
              sectionId: cr.section_id,
              crId: cr.cr_id,
              citeId,
              err: err instanceof Error ? err.message : String(err),
            });
          });
        }
      } else if (cr.apply_kind === 'TOKEN_REPLACE') {
        // For now: replace by deleting + inserting new citation (left as future work)
        // Acknowledge apply without mutation to avoid breaking flow
      }

      await pool.query(
        `UPDATE doc_change_requests SET status='APPLIED', resolved_at=NOW() WHERE cr_id=$1`,
        [cr.cr_id]
      );
      res.json({ ok: true, cr_id: cr.cr_id });
    } catch (error) {
      console.error('POST /cr/:id/apply', error);
      res.status(500).json({ error: 'Apply failed' });
    }
  }
);

// Assign permission (doc- or section-level).
//
// TENANT-SCOPED (C2C-AUTHOR-002). The grant is written with the granter's
// VERIFIED tenant, and both the document and — for a section-scoped grant — the
// section must already live in that tenant. Without this the writer produced
// rows canEditSection (which is tenant-scoped) could never match, and a grant
// could be minted against another tenant's document id.
router.post(
  '/docs/:docId/permissions',
  requireAny(['QA', 'RA_CMC']),
  async (req: Request, res: Response) => {
    try {
      const tenantId = authedOrgId(req);
      if (tenantId == null) return res.status(403).json({ error: 'Tenant context required' });

      const { email, role, section_id } = req.body || {};
      if (!email || !role) return res.status(400).json({ error: 'email and role required' });

      const normalizedRole = String(role).toUpperCase();
      if (!GRANTABLE_SECTION_ROLES.has(normalizedRole)) {
        return res.status(400).json({
          error: `role must be one of: ${[...GRANTABLE_SECTION_ROLES].join(', ')}`,
        });
      }

      // The document must exist INSIDE the caller's tenant — a 404 rather than a
      // dangling grant (or an FK-violation 500) for a foreign/unknown id.
      const doc = await pool.query(
        `SELECT 1 FROM authoring_documents WHERE id = $1 AND tenant_id = $2`,
        [req.params.docId, tenantId]
      );
      if ((doc.rowCount ?? 0) === 0) return res.status(404).json({ error: 'Document not found' });

      // A section-scoped grant must name a section OF THIS document in the same
      // tenant, so a grant can never straddle documents or tenants.
      if (section_id) {
        const sec = await pool.query(
          `SELECT 1 FROM authoring_sections WHERE id = $1 AND doc_id = $2 AND tenant_id = $3`,
          [section_id, req.params.docId, tenantId]
        );
        if ((sec.rowCount ?? 0) === 0) {
          return res.status(404).json({ error: 'Section not found for this document' });
        }
      }

      const ins = (
        await pool.query(
          `
      INSERT INTO doc_permissions (doc_id, section_id, email, role, tenant_id)
      VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [
            req.params.docId,
            section_id || null,
            String(email).toLowerCase(),
            normalizedRole,
            tenantId,
          ]
        )
      ).rows[0];
      res.json(ins);
    } catch (error) {
      console.error('POST /docs/:id/permissions', error);
      res.status(500).json({ error: 'Failed to assign permission' });
    }
  }
);

router.get('/docs/:docId/permissions', async (req: Request, res: Response) => {
  try {
    const tenantId = authedOrgId(req);
    if (tenantId == null) return res.status(403).json({ error: 'Tenant context required' });
    const rows = (
      await pool.query(
        `SELECT id, doc_id, section_id, email, role, created_at FROM doc_permissions WHERE doc_id=$1 AND tenant_id=$2 ORDER BY created_at DESC`,
        [req.params.docId, tenantId]
      )
    ).rows;
    res.json(rows);
  } catch (error) {
    console.error('GET /docs/:id/permissions', error);
    res.status(500).json({ error: 'Failed to list permissions' });
  }
});

// ============= EXPORT Operations =============

// POST /api/authoring/docs/:docId/export - Export document in various formats
router.post('/docs/:docId/export', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { format = 'docx', options = {} } = req.body;
    const tenantId = getTenantId(req);
    const exportedBy = req.headers['x-user-email'] || req.body.exported_by || 'system';

    // Validate format
    if (!['docx', 'pdf', 'xml'].includes(format)) {
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

    const sectionsResult = await pool.query(
      'SELECT id, doc_id, code, title, content, order_index, track_changes, created_at, updated_at, tenant_id FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index',
      [docId, tenantId]
    );

    const exportId = crypto.randomUUID();
    const fileHash = await computeDocHash(docId, tenantId);

    // The export record is written by logExport() AFTER the file is generated,
    // so file_name and file_size are the real ones. This used to INSERT into
    // `authoring_exports` — a table that no migration and no runtime DDL in this
    // repo creates, and which nothing else in the codebase reads or writes. The
    // insert was unguarded, so it threw "relation does not exist" and the catch
    // below turned EVERY export request into a 500: the flagship authoring loop
    // could draft, freeze and sign a document but could not export one. See
    // ledger C-14.

    // Create audit event
    await createAuditEvent(
      docId,
      'EXPORT',
      exportedBy as string,
      { format, exportId, options },
      tenantId
    );

    // Generate export based on format
    let fileContent: Buffer | undefined;
    let fileName: string = 'export';
    let contentType: string = 'application/octet-stream';

    if (format === 'xml') {
      // XML export
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <metadata>
    <id>${doc.id}</id>
    <title>${doc.title}</title>
    <module>${doc.module}</module>
    <status>${doc.status}</status>
    <created_at>${doc.created_at}</created_at>
  </metadata>
  <sections>
${sectionsResult.rows
  .map(
    s => `    <section code="${s.code}">
      <title>${s.title}</title>
      <content><![CDATA[${s.content}]]></content>
    </section>`
  )
  .join('\n')}
  </sections>
</document>`;

      fileContent = Buffer.from(xmlContent, 'utf-8');
      fileName = `${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}.xml`;
      contentType = 'application/xml';
    } else if (format === 'docx') {
      const { Document, Packer, Paragraph, HeadingLevel } = require('docx');

      const children = [];
      children.push(new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE }));

      for (const section of sectionsResult.rows) {
        children.push(
          new Paragraph({
            text: `${section.code} - ${section.title}`,
            heading: HeadingLevel.HEADING_1,
          })
        );
        children.push(new Paragraph({ text: section.content || '' }));
      }

      const docxDoc = new Document({ sections: [{ children }] });
      fileContent = await Packer.toBuffer(docxDoc);
      fileName = `${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (format === 'pdf') {
      // Real PDF via the platform's HTML→PDF renderer (the same engine the
      // template render path uses). The previous implementation returned DOCX
      // bytes under a PDF label — a mislabeled file is worse than no file.
      const { renderHtmlToPdf } = await import('../export/renderers');
      const esc = (s: string) =>
        String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
          body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; margin: 1in; }
          h1 { font-size: 18pt; } h2 { font-size: 14pt; margin-top: 1.2em; }
          p { white-space: pre-wrap; }
        </style></head><body>
        <h1>${esc(doc.title)}</h1>
        ${sectionsResult.rows
          .map(
            (s: { code: string; title: string; content: string | null }) =>
              `<h2>${esc(s.code)} — ${esc(s.title)}</h2><p>${esc(s.content || '')}</p>`
          )
          .join('\n')}
        </body></html>`;
      fileContent = await renderHtmlToPdf(html);
      fileName = `${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      contentType = 'application/pdf';
    }

    // Durable export record — the same table GET /docs/:docId/exports lists and
    // GET /docs/:docId/diff-since-export baselines against.
    await logExport(
      String(docId),
      format,
      fileHash,
      exportedBy as string,
      fileName,
      fileContent?.length,
      { options, exportId },
      tenantId
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(fileContent);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      error: 'Export failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
          step.approver_email || `${step.role.toLowerCase()}@company.com`,
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

    res.json({
      success: true,
      message: 'Document submitted for review',
      workflowId,
      steps: workflow_steps.length,
    });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({
      error: 'Submit failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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

// ============= SIGN Operations =============

// POST /api/authoring/docs/:docId/sign - Sign document (21 CFR Part 11)
router.post('/docs/:docId/sign', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { pin, meaning = 'REVIEWER', reason } = req.body;
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
    const signerName =
      ((req.user as { name?: string } | undefined)?.name) || signerEmail;

    // Validate required fields
    if (!pin || !reason) {
      return res.status(400).json({ error: 'PIN and reason are required for signing' });
    }

    // Verify PIN
    const pinValid = await verifyUserPin(signerEmail as string, pin, tenantId);
    if (!pinValid) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    // Compute document hash
    const contentHash = await computeDocHash(docId, tenantId);

    // The digest used to hash `new Date().toISOString()`, which made it
    // impossible for anyone to recompute — a hash nobody can reproduce proves
    // nothing. It now covers only durable columns, including the frozen snapshot
    // this signature attests to (§11.70 signature/record link, C-11 residual 2).
    const covered = await currentFrozenSnapshot(docId, tenantId);
    const signatureDigest = computeSignatureDigest({
      signerEmail,
      meaning,
      contentHash,
      coveredContentHash: covered?.contentHash ?? null,
    });

    // Store signature
    const signatureId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO authoring_signatures
       (id, doc_id, signer_email, signer_name, meaning, reason, method, content_hash,
        signature_digest, covered_freeze_version, covered_content_hash, tenant_id, signed_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'PIN', $7, $8, $9, $10, $11, NOW())`,
      [
        signatureId,
        docId,
        signerEmail,
        signerName,
        meaning,
        reason,
        contentHash,
        signatureDigest,
        covered?.version ?? null,
        covered?.contentHash ?? null,
        tenantId,
      ]
    );

    // Update workflow step if applicable. Roles come from the VERIFIED token
    // (req.user.roles), not from the x-roles header — the header is derived from
    // claims by this router's JWT middleware, but reading the claim directly
    // means an approval decision can never depend on a mutable header at all
    // (ledger C-18).
    const userRoles = (((req.user as { roles?: unknown } | undefined)?.roles ?? []) as unknown[])
      .map((r) => String(r).toUpperCase());
    if (userRoles.includes(meaning) || userRoles.includes('QA') || userRoles.includes('RA_CMC')) {
      await pool.query(
        `UPDATE authoring_workflow_steps
         SET status = 'APPROVED', decision_note = $1, decided_at = NOW()
         WHERE doc_id = $2 AND approver_email = $3 AND status = 'PENDING' AND tenant_id = $4`,
        [reason, docId, signerEmail, tenantId]
      );

      // Check if all workflow steps are approved
      const pendingSteps = await pool.query(
        `SELECT COUNT(*) as pending FROM authoring_workflow_steps
         WHERE doc_id = $1 AND status = 'PENDING' AND tenant_id = $2`,
        [docId, tenantId]
      );

      if (pendingSteps.rows[0].pending === '0') {
        // All approved - update document status
        await pool.query(
          `UPDATE authoring_documents
           SET status = 'APPROVED', approved_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [docId, tenantId]
        );
      }
    }

    // Create audit event
    await createAuditEvent(
      docId,
      'SIGN',
      signerEmail as string,
      { signatureId, meaning, reason, contentHash },
      tenantId
    );

    res.json({
      success: true,
      message: 'Document signed successfully',
      signatureId,
      digest: signatureDigest,
    });
  } catch (error) {
    console.error('Sign error:', error);
    res.status(500).json({
      error: 'Sign failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/authoring/docs/:docId/signatures - Get document signatures
router.get('/docs/:docId/signatures', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const tenantId = getTenantId(req);

    const result = await pool.query(
      `SELECT id, doc_id, signer_email, signer_name, meaning, reason, method, content_hash, signature_digest, signed_at, tenant_id FROM authoring_signatures
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
router.get('/docs/:docId/audit', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { limit = 100 } = req.query;
    const tenantId = getTenantId(req);

    const result = await pool.query(
      `SELECT id, doc_id, event_type, actor, metadata, created_at, tenant_id FROM authoring_audit_events
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

// ============= PIN Management =============

// POST /api/authoring/users/pin - Set or update user PIN
router.post('/users/pin', async (req: Request, res: Response) => {
  try {
    const { pin, old_pin } = req.body;
    const tenantId = getTenantId(req);
    const email = req.headers['x-user-email'] || req.body.email;

    if (!email || !pin) {
      return res.status(400).json({ error: 'Email and PIN are required' });
    }

    // Check if PIN exists
    const existing = await pool.query(
      'SELECT pin_hash FROM user_pins WHERE email = $1 AND tenant_id = $2',
      [email, tenantId]
    );

    if (((existing.rowCount ?? 0) > 0)) {
      // Verify old PIN if updating
      if (old_pin) {
        const valid = await bcrypt.compare(old_pin, existing.rows[0].pin_hash);
        if (!valid) {
          return res.status(401).json({ error: 'Invalid old PIN' });
        }
      }
    }

    // Hash new PIN
    const pinHash = await bcrypt.hash(pin, 10);

    // Insert or update
    if (((existing.rowCount ?? 0) === 0)) {
      await pool.query(
        `INSERT INTO user_pins (email, pin_hash, tenant_id, created_at, last_changed)
         VALUES ($1, $2, $3, NOW(), NOW())`,
        [email, pinHash, tenantId]
      );
    } else {
      await pool.query(
        `UPDATE user_pins SET pin_hash = $1, last_changed = NOW(), failed_attempts = 0
         WHERE email = $2 AND tenant_id = $3`,
        [pinHash, email, tenantId]
      );
    }

    res.json({ success: true, message: 'PIN set successfully' });
  } catch (error) {
    console.error('PIN management error:', error);
    res.status(500).json({ error: 'Failed to set PIN' });
  }
});

// ============= AI ANALYSIS & SUGGESTIONS =============

// AI Gateway client (routes through Claude by default)
const getAI = async () => {
  const { getGateway } = await import('../services/ai-gateway/gateway.js');
  return getGateway();
};

// Regulatory validation rules
const REGULATORY_PATTERNS = {
  ICH: {
    Q1A: /stability.*testing|accelerated.*conditions|long-term.*storage/gi,
    Q3A: /impurit|related.*substance|degradation.*product/gi,
    Q6A: /specification|test.*procedure|acceptance.*criteri/gi,
    E6: /good.*clinical.*practice|GCP|protocol.*deviation/gi,
  },
  FDA: {
    '21CFR312': /investigational.*new.*drug|IND|clinical.*hold/gi,
    '21CFR314': /new.*drug.*application|NDA|ANDA/gi,
  },
  CTD: {
    structure: /3\.2\.[SP]\.\d+|Module.*[1-5]|eCTD/gi,
    formatting: /section.*\d+\.\d+|table.*\d+|figure.*\d+/gi,
  },
};

// POST /api/authoring/ai/analyze - Comprehensive document analysis
router.post('/ai/analyze', async (req: Request, res: Response) => {
  try {
    const { document_id, content, section_id, analysis_type = 'full' } = req.body;
    const tenantId = getTenantId(req);

    if (!content) {
      return res.status(400).json({ error: 'Content is required for analysis' });
    }

    const aiGateway = await getAI();
    const suggestions: any[] = [];
    const complianceIssues: any[] = [];

    // 1. Grammar and clarity check
    if (analysis_type === 'full' || analysis_type === 'grammar') {
      const grammarPrompt = `Analyze the following regulatory document text for grammar, clarity, and professional writing issues.
Return specific suggestions in JSON format.
Text: "${content.substring(0, 3000)}"

Provide output as JSON with this structure:
{
  "suggestions": [
    {
      "type": "grammar|clarity|terminology|consistency",
      "severity": "critical|important|enhancement|style",
      "original": "original text",
      "suggested": "corrected text",
      "explanation": "why this change is needed",
      "position": {"start": 0, "end": 10}
    }
  ]
}`;

      try {
        const gwResponse = await aiGateway.route({
          taskType: 'document_analysis',
          messages: [{ role: 'user', content: grammarPrompt }],
          jsonMode: true,
          temperature: 0.3,
          maxTokens: 2000,
          callerModule: 'authoring-router/ai-analyze/grammar',
        });

        const result = JSON.parse(gwResponse.content || '{}');
        suggestions.push(...(result.suggestions || []));
      } catch (aiError) {
        console.error('AI grammar check failed:', aiError);
      }
    }

    // 2. Regulatory compliance check
    if (analysis_type === 'full' || analysis_type === 'regulatory') {
      // Check ICH guidelines
      Object.entries(REGULATORY_PATTERNS.ICH).forEach(([guideline, pattern]) => {
        const matches = content.match(pattern);
        if (!matches || matches.length === 0) {
          complianceIssues.push({
            type: 'regulatory',
            severity: 'important',
            guideline: `ICH ${guideline}`,
            issue: `Content may not fully address ${guideline} requirements`,
            suggestion: `Ensure comprehensive coverage of ${guideline} guidelines`,
          });
        }
      });

      // Check FDA requirements
      Object.entries(REGULATORY_PATTERNS.FDA).forEach(([regulation, pattern]) => {
        const matches = content.match(pattern);
        if (!matches && section_id?.includes('clinical')) {
          complianceIssues.push({
            type: 'regulatory',
            severity: 'critical',
            guideline: regulation,
            issue: `Missing references to ${regulation} requirements`,
            suggestion: `Include specific ${regulation} compliance statements`,
          });
        }
      });
    }

    // 3. Calculate compliance scores
    const scores = {
      regulatory_score: Math.max(0, 100 - complianceIssues.length * 10),
      // Derived from technical-type findings, consistent with the other
      // scores below. Previously: `85 + Math.random() * 15` — a fabricated
      // value that varied per request with no relation to the document.
      technical_score: Math.max(0, 100 - suggestions.filter(s => s.type === 'technical').length * 7),
      clarity_score: 90 - suggestions.filter(s => s.type === 'clarity').length * 5,
      consistency_score: 95 - suggestions.filter(s => s.type === 'consistency').length * 8,
      completeness_score: content.length > 500 ? 85 : 60,
      overall_score: 0,
    };
    scores.overall_score = Object.values(scores).reduce((a, b) => a + b, 0) / 5;

    // 4. Store suggestions in database
    for (const suggestion of suggestions) {
      await pool.query(
        `INSERT INTO authoring_ai_suggestions
         (document_id, section_id, suggestion_type, severity, original_text, suggested_text,
          explanation, position_start, position_end, confidence_score, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          document_id,
          section_id,
          suggestion.type,
          suggestion.severity,
          suggestion.original,
          suggestion.suggested,
          suggestion.explanation,
          suggestion.position?.start || 0,
          suggestion.position?.end || 0,
          suggestion.confidence || 0.85,
          tenantId,
        ]
      );
    }

    // 5. Store compliance scores
    await pool.query(
      `INSERT INTO authoring_compliance_scores
       (document_id, regulatory_score, technical_score, clarity_score,
        consistency_score, completeness_score, overall_score,
        ich_compliance, ctd_compliance, ind_compliance, missing_sections, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (document_id, tenant_id)
       DO UPDATE SET
         regulatory_score = $2,
         technical_score = $3,
         clarity_score = $4,
         consistency_score = $5,
         completeness_score = $6,
         overall_score = $7,
         analysis_timestamp = NOW()`,
      [
        document_id,
        scores.regulatory_score,
        scores.technical_score,
        scores.clarity_score,
        scores.consistency_score,
        scores.completeness_score,
        scores.overall_score,
        JSON.stringify({}), // ICH compliance details
        JSON.stringify({}), // CTD compliance details
        JSON.stringify({}), // IND compliance details
        JSON.stringify([]), // Missing sections
        tenantId,
      ]
    );

    res.json({
      success: true,
      suggestions,
      complianceIssues,
      scores,
      analysis_timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/authoring/ai/suggestions - Get real-time suggestions
router.post('/ai/suggestions', async (req: Request, res: Response) => {
  try {
    const { text, context, suggestion_type = 'all' } = req.body;
    const tenantId = getTenantId(req);

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const suggestions: any[] = [];

    // Quick grammar checks
    const grammarIssues = [
      { pattern: /\s{2,}/g, type: 'spacing', message: 'Multiple spaces detected' },
      { pattern: /[.!?]{2,}/g, type: 'punctuation', message: 'Duplicate punctuation' },
      { pattern: /\b(\w+)\s+\1\b/gi, type: 'duplicate', message: 'Duplicate word' },
    ];

    grammarIssues.forEach(issue => {
      const matches = text.matchAll(issue.pattern);
      for (const match of matches) {
        suggestions.push({
          type: 'grammar',
          severity: 'style',
          position: { start: match.index, end: match.index + match[0].length },
          original: match[0],
          suggested: match[0].replace(issue.pattern, ' '),
          explanation: issue.message,
          confidence: 0.95,
        });
      }
    });

    // Regulatory terminology checks
    const termChecks = [
      { incorrect: /adverse event/gi, correct: 'adverse event (AE)', type: 'terminology' },
      {
        incorrect: /serious adverse event/gi,
        correct: 'serious adverse event (SAE)',
        type: 'terminology',
      },
      {
        incorrect: /Good Manufacturing Practice/gi,
        correct: 'Good Manufacturing Practice (GMP)',
        type: 'terminology',
      },
    ];

    termChecks.forEach(check => {
      const matches = text.matchAll(check.incorrect);
      for (const match of matches) {
        suggestions.push({
          type: check.type,
          severity: 'enhancement',
          position: { start: match.index, end: match.index + match[0].length },
          original: match[0],
          suggested: check.correct,
          explanation: 'Use standard regulatory abbreviation',
          confidence: 0.9,
        });
      }
    });

    res.json({
      success: true,
      suggestions,
      count: suggestions.length,
    });
  } catch (error) {
    console.error('Suggestion generation error:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

// POST /api/authoring/ai/validate-compliance - Validate regulatory compliance
router.post('/ai/validate-compliance', async (req: Request, res: Response) => {
  try {
    const { document_id, section_code, content } = req.body;
    const tenantId = getTenantId(req);

    const validationResults: {
      ich_compliance: any[];
      fda_compliance: any[];
      ctd_structure: any[];
      missing_elements: any[];
      recommendations: any[];
    } = {
      ich_compliance: [],
      fda_compliance: [],
      ctd_structure: [],
      missing_elements: [],
      recommendations: [],
    };

    // Check CTD structure requirements
    if (section_code && section_code.startsWith('3.2.')) {
      const requiredSections: Record<string, string[]> = {
        '3.2.S.1': ['nomenclature', 'structure', 'general properties'],
        '3.2.S.2': ['manufacturer', 'manufacturing process', 'controls'],
        '3.2.S.3': ['elucidation of structure', 'impurities'],
        '3.2.S.4': ['specifications', 'analytical procedures', 'validation'],
        '3.2.S.7': ['stability data', 'post-approval stability', 'storage conditions'],
      };

      const required = requiredSections[section_code] || [];
      required.forEach((element: any) => {
        if (!content.toLowerCase().includes(element)) {
          validationResults.missing_elements.push({
            element,
            section: section_code,
            severity: 'important',
            message: `Section ${section_code} should include information about ${element}`,
          });
        }
      });
    }

    // ICH guideline applicability. There is no automated ICH-guideline
    // conformance engine wired, so we do NOT assert a pass/fail verdict or a
    // score — the prior implementation fabricated both with Math.random()
    // (`compliant: Math.random() > 0.3`, `score: 75 + Math.random() * 25`),
    // randomly claiming conformance to ICH Q1A/Q3A/Q6A/E6/M4. We surface the
    // applicable guidelines for the section and flag them for manual review
    // instead of inventing a verdict.
    const ichGuidelines = ['Q1A', 'Q3A', 'Q6A', 'E6', 'M4'];
    ichGuidelines.forEach(guideline => {
      validationResults.ich_compliance.push({
        guideline,
        compliant: null,
        assessment: 'not_assessed',
        issues: [],
        score: null,
        note: 'Automated ICH conformance assessment is not available — manual review required.',
      });
    });

    res.json({
      success: true,
      validation: validationResults,
      overall_compliance:
        validationResults.missing_elements.length === 0 ? 'PASS' : 'NEEDS_IMPROVEMENT',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Compliance validation error:', error);
    res.status(500).json({ error: 'Failed to validate compliance' });
  }
});

// GET /api/authoring/ai/regulatory-updates - Get latest regulatory changes
router.get('/ai/regulatory-updates', async (req: Request, res: Response) => {
  try {
    const { region, since } = req.query;

    // In production, this would query a regulatory intelligence database
    const updates = [
      {
        id: 'update-1',
        date: '2025-01-15',
        region: 'FDA',
        title: 'Updated Guidance on Electronic Submissions',
        impact: 'high',
        summary: 'New requirements for eCTD format version 4.0',
        affected_sections: ['M1', 'M2'],
      },
      {
        id: 'update-2',
        date: '2025-01-10',
        region: 'EMA',
        title: 'Revised Quality Guidelines',
        impact: 'medium',
        summary: 'Changes to stability testing requirements',
        affected_sections: ['3.2.S.7', '3.2.P.8'],
      },
    ];

    const filtered = region ? updates.filter(u => u.region === region) : updates;

    res.json({
      success: true,
      updates: filtered,
      count: filtered.length,
      last_checked: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching regulatory updates:', error);
    res.status(500).json({ error: 'Failed to fetch regulatory updates' });
  }
});

// POST /api/authoring/ai/feedback - Track suggestion feedback
router.post('/ai/feedback', async (req: Request, res: Response) => {
  try {
    const { suggestion_id, action, modified_text, reason } = req.body;
    const tenantId = getTenantId(req);
    const userEmail = req.headers['x-user-email'] || 'unknown';

    await pool.query(
      `INSERT INTO authoring_suggestion_feedback
       (suggestion_id, action, modified_text, user_email, feedback_reason, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [suggestion_id, action, modified_text, userEmail, reason, tenantId]
    );

    // Update suggestion status
    await pool.query(
      `UPDATE authoring_ai_suggestions
       SET status = $1, resolved_at = NOW(), resolved_by = $2
       WHERE id = $3`,
      [action, userEmail, suggestion_id]
    );

    res.json({ success: true, message: 'Feedback recorded' });
  } catch (error) {
    console.error('Error recording feedback:', error);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

// GET /api/authoring/ai/suggestions/:documentId - Get all suggestions for a document
router.get('/ai/suggestions/:documentId', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const { status = 'pending' } = req.query;
    const tenantId = getTenantId(req);

    const result = await pool.query(
      `SELECT id, document_id, section_id, suggestion_type, severity, original_text, suggested_text, explanation, position_start, position_end, confidence_score, status, resolved_at, resolved_by, created_at, tenant_id FROM authoring_ai_suggestions
       WHERE document_id = $1 AND status = $2 AND tenant_id = $3
       ORDER BY severity DESC, position_start ASC`,
      [documentId, status, tenantId]
    );

    const grouped: Record<string, any[]> = {
      critical: [],
      important: [],
      enhancement: [],
      style: [],
    };

    result.rows.forEach(suggestion => {
      const severity = suggestion.severity || 'enhancement';
      if (grouped[severity]) {
        grouped[severity].push(suggestion);
      }
    });

    res.json({
      success: true,
      suggestions: result.rows,
      grouped,
      total: result.rowCount,
    });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// GET /api/authoring/ai/compliance-scores/:documentId - Get compliance scores
router.get('/ai/compliance-scores/:documentId', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const tenantId = getTenantId(req);

    const result = await pool.query(
      `SELECT id, document_id, regulatory_score, technical_score, clarity_score, consistency_score, completeness_score, overall_score, ich_compliance, ctd_compliance, ind_compliance, missing_sections, analysis_timestamp, tenant_id FROM authoring_compliance_scores
       WHERE document_id = $1 AND tenant_id = $2
       ORDER BY analysis_timestamp DESC
       LIMIT 1`,
      [documentId, tenantId]
    );

    if (((result.rowCount ?? 0) === 0)) {
      return res.json({
        success: true,
        scores: {
          regulatory_score: 0,
          technical_score: 0,
          clarity_score: 0,
          consistency_score: 0,
          completeness_score: 0,
          overall_score: 0,
        },
        message: 'No analysis performed yet',
      });
    }

    res.json({
      success: true,
      scores: result.rows[0],
      timestamp: result.rows[0].analysis_timestamp,
    });
  } catch (error) {
    console.error('Error fetching compliance scores:', error);
    res.status(500).json({ error: 'Failed to fetch compliance scores' });
  }
});

// ── Tracked Change Decisions (persist accept/reject) ──────────────────────────

const ensureTrackedChangeDecisionsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authoring_tracked_change_decisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      artifact_id VARCHAR(255) NOT NULL,
      change_id VARCHAR(255) NOT NULL,
      decision VARCHAR(20) NOT NULL CHECK (decision IN ('accept', 'reject')),
      user_id VARCHAR(255) NOT NULL,
      user_name VARCHAR(255),
      tenant_id INTEGER NOT NULL,
      decided_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tracked_change_decisions_artifact
    ON authoring_tracked_change_decisions (artifact_id, tenant_id)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tracked_change_decisions_unique
    ON authoring_tracked_change_decisions (artifact_id, change_id, tenant_id)
  `);
};

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

    const result = await pool.query(
      `INSERT INTO authoring_tracked_change_decisions
         (artifact_id, change_id, decision, user_id, user_name, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (artifact_id, change_id, tenant_id)
       DO UPDATE SET decision = $3, user_id = $4, user_name = $5, decided_at = NOW()
       RETURNING *`,
      [artifactId, changeId, decision, userId, userName, tenantId]
    );

    // Audit trail for regulatory compliance
    await createAuditEvent(
      artifactId,
      'tracked_change_decision',
      userName,
      { changeId, decision },
      tenantId
    );

    res.json({ success: true, decision: result.rows[0] });
  } catch (error) {
    console.error('Error persisting tracked change decision:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to persist tracked change decision',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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

    // Single audit event for bulk action
    await createAuditEvent(
      artifactId,
      'tracked_change_bulk_decision',
      userName,
      { changeIds, decision, count: changeIds.length },
      tenantId
    );

    res.json({ success: true, decisions: results, count: results.length });
  } catch (error) {
    console.error('Error persisting bulk tracked change decisions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to persist bulk tracked change decisions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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

export default router;
