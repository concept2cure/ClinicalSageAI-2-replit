/**
 * Tenant export + attestation routes — mounted at /api/tenant-export.
 *
 *   GET /api/tenant-export                  full data dump for the caller's org
 *   GET /api/tenant-export/attestation      hash-chain attestation report
 *   GET  /api/tenant-export/custody?digest  what a custody signature on that export attests (P-58)
 *   POST /api/tenant-export/custody         sign it: the customer takes custody before the purge
 *
 * Both endpoints are admin-only (role check) and tenant-scoped via the
 * caller's JWT organizationId. The signed audit-log export remains the
 * companion endpoint at /api/audit/exports.
 *
 * BETA scope: synchronous JSON. For GA, swap to a streaming + S3 upload
 * pattern.
 *
 * ── WO-16C #133: where each route reports its audit row ──────────────────────
 * All three handlers write a 21 CFR Part 11 §11.10(e) row for the export or
 * attestation they just produced, through `recordAuditRow`, and each carries the
 * outcome to the caller. These are file downloads rather than `{data, meta}`
 * envelopes, so the carrier differs by route and for one concrete reason:
 *
 *   - `GET /` and `GET /full` add a top-level `auditTrail` key to the JSON body
 *     they send. Nothing signs or re-hashes those two documents — `/full`'s
 *     digest is computed over the export payload before this key is added, and is
 *     what the receipt stores — so the key rides along with the saved artifact.
 *   - `GET /attestation` uses `X-Audit-Trail-*` response headers instead, because
 *     its body is HMAC-signed and `verifyAttestationSignature` recomputes the MAC
 *     over every key except `signature`. A report saved off-line by a customer is
 *     run back through that function (docs/operations/attestation-key-rotation.md,
 *     step 4), so one extra body key would make a genuine report verify as false.
 *     `X-Audit-*` headers on a signed audit download are the shape
 *     server/routes/audit-trail-routes.ts already uses.
 */

import { Router, Request, Response } from 'express';

import { AUDIT_ATTEST_ROLES } from '../../shared/constants/permissions.js';

import { authenticateToken } from '../middleware/auth';
import { pool } from '../db';
import { recordAuditRow, type AuditRowOutcome } from '../services/audit/audit-write-outcome';
import {
  exportTenantData,
  TenantNotFoundError,
} from '../services/tenant-export/tenant-export.service';
import {
  generateAttestation,
  AttestationKeyMissingError,
} from '../services/tenant-export/attestation-report.service';
import {
  digestOf,
  exportTenantFull,
  recordExportReceipt,
  TenantNotFoundError as FullExportTenantNotFoundError,
} from '../services/tenant-export/tenant-full-export.service';
import { withIntegrity } from '../services/tenant-export/held-record-integrity';
import { custodyAct, custodyAttestation, CustodyRefusal, EXPORT_DIGEST } from '../services/tenant/offboarding-custody';
import { signedActAttempts, signGovernedAct } from './governed-signed-act';
import { serverError } from '../lib/api-response';
import { isUnauditedExportRefusal, sendAuditedDownload } from '../services/export/governedExportConsequence';
import { createScopedLogger } from '../utils/logger';
import { companyExportSnapshot, ExportScopeUnavailableError, inOrganizationScope } from '../services/tenant-export/company-export-snapshot';

const router = Router();
const log = createScopedLogger('tenant-export');
router.use(authenticateToken);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

/** Audit attestation retains its shared permission policy. Complete tenant
 * data return separately verifies current owner/admin authority below. */
function isAdmin(req: Request): boolean {
  const u = (req as any).user;
  if (!u) return false;
  if (AUDIT_ATTEST_ROLES.includes(String(u.role ?? ''))) return true;
  if (Array.isArray(u.roles) && u.roles.some((r: unknown) => AUDIT_ATTEST_ROLES.includes(String(r)))) {
    return true;
  }
  return false;
}

/** Complete data return is tenant-wide authority, distinct from audit attestation. */
async function mayExportTenantData(req: Request, organizationId: number): Promise<boolean> {
  const raw = (req as any).user?.id ?? (req as any).user?.userId;
  const userId = Number(raw);
  if (!Number.isSafeInteger(userId) || userId <= 0) return false;
  // Data return remains available during the governed offboarding window.
  // General project admission requires an active organization and cannot stand
  // in for this deliberately narrower active-or-pending-deletion operation.
  const { rows } = await pool.query(`SELECT ou.role FROM organization_users ou
    JOIN users u ON u.id=ou.user_id JOIN organizations o ON o.id=ou.organization_id
    WHERE ou.organization_id=$1 AND ou.user_id=$2 AND u.status='active'
      AND o.status IN ('active','pending_deletion')`, [organizationId, userId]);
  if (rows.length !== 1) return false;
  const role = String(rows[0].role ?? '').trim().toLowerCase();
  return role === 'owner' || role === 'admin';
}

/**
 * Report an audit-row outcome in response headers, for the one route whose body
 * cannot carry it (see the WO-16C #133 note at the top of this file).
 *
 * `persisted-tamper-proof-only` is not a synonym for `persisted`: it means the
 * retrievable `audit_logs` row a customer can read back or export is missing,
 * which is what `chained` distinguishes. The store's own error text is not here
 * and is not in any header — `recordAuditRow` logged it against the action and
 * the resource id.
 */
function setAuditTrailHeaders(res: Response, auditTrail: AuditRowOutcome): void {
  if (auditTrail.persisted) {
    res.set(
      'X-Audit-Trail-Status',
      auditTrail.chained ? 'persisted' : 'persisted-tamper-proof-only',
    );
    return;
  }
  res.set('X-Audit-Trail-Status', 'not-persisted');
  res.set('X-Audit-Trail-Code', auditTrail.code);
  res.set('X-Audit-Trail-Detail', auditTrail.message);
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  try {
    if (!await mayExportTenantData(req, orgId)) return res.status(403).json({ error: 'Current organization owner or administrator authority is required for tenant data return.' });
    // In the organization's own scope (P-58's data return, 2026-10-29): the platform scope this mount
    // runs in returned none of its Vault documents or knowledge graph (company-export-snapshot.ts).
    const manifest = await inOrganizationScope(pool, orgId, 'GET /api/tenant-export',
      () => companyExportSnapshot(pool, orgId, client => exportTenantData(client, orgId)));
    if (!await mayExportTenantData(req, orgId)) return res.status(403).json({ error: 'Tenant export authority changed. No tenant data was returned.' });

    /* WO-16C #133. Was `void auditService.logAction({…})`, which discarded the
       one value that says whether the §11.10(e) record of this data egress
       exists: an export handed to an admin with no audit row answered
       byte-identically to one with a row. The export is a read and the response
       body below is its whole result, so this row is a log beside the action
       rather than the action itself: the export is still delivered, and the
       downloaded document now states what became of the row. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId,
      userId: (req as any).user?.id ?? null,
      action: 'tenant.export',
      resourceType: 'tenant_data_export',
      resourceId: String(orgId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: { counts: manifest.counts },
    });

    res
      .status(200)
      .set('Content-Type', 'application/json')
      .set(
        'Content-Disposition',
        `attachment; filename="tenant-export-${manifest.organization.slug}-${Date.now()}.json"`,
      )
      .send(JSON.stringify({ ...manifest, auditTrail }, null, 2));
  } catch (err: unknown) {
    if (err instanceof TenantNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof ExportScopeUnavailableError) {
      return res.status(409).json({ error: err.message, code: 'EXPORT_SCOPE_UNAVAILABLE' });
    }
    return serverError(res, log, 'exporting the tenant data', err, { organizationId: orgId });
  }
});

/**
 * GET /api/tenant-export/full — the complete, catalog-driven data return.
 *
 * The curated manifest at `GET /` covers eleven hand-picked tables. That is a
 * good structured view and a poor data return: measured against the purge set it
 * covers one of the eight tables a purge destroys. This endpoint discovers every
 * tenant-keyed table from the catalog instead, so coverage tracks the schema
 * without anyone maintaining a list.
 *
 * It also writes an export RECEIPT and returns the digest, which is what
 * `POST /api/tenants/:id/purge` verifies. Before this existed the purge asked for
 * a digest that nothing produced — so the only way past the gate was to invent
 * one, which made the gate theatre.
 */
router.get('/full', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  try {
    if (!await mayExportTenantData(req, orgId)) return res.status(403).json({ error: 'Current organization owner or administrator authority is required for tenant data return.' });
    // With the integrity verdict of each hash chain and each signature's
    // manifest (P-58), inside the digest: the copy a customer keeps carries
    // the proof that it is whole.
    // In the organization's own scope, its tenant id and its uuid (P-58's data return, 2026-10-29): under
    // the platform scope this mount runs in, eight tables returned none of its rows, the Vault's among
    // them (company-export-snapshot.ts). The export states the scope it ran in, inside the digest, and
    // only an export made in it records a receipt a purge accepts (recordExportReceipt).
    const payload = await inOrganizationScope(pool, orgId, 'GET /api/tenant-export/full',
      () => companyExportSnapshot(pool, orgId, async client => withIntegrity(client, orgId, await exportTenantFull(client, orgId))));
    const digest = digestOf(payload);
    if (!await mayExportTenantData(req, orgId)) return res.status(403).json({ error: 'Tenant export authority changed. No tenant data was returned or export receipt recorded.' });

    const receipt = await recordExportReceipt(pool, {
      organizationId: orgId,
      digest,
      tableCount: payload.coverage.tablesExported,
      rowCount: payload.coverage.totalRows,
      createdBy: Number((req as any).user?.userId ?? (req as any).user?.id) || null,
      coverage: payload.coverage,
    });

    /* WO-16C #133. Was `void auditService.logAction({…})`.
       The payload is already assembled and the digest already computed, so this
       audit row is a log beside a completed export, not the export itself: the
       download proceeds and the body reports the row's fate.

       TWO durable writes happen in this request and each is reported under its
       own key. `auditTrail` is the §11.10(e) row. `exportReceipt` is the
       tenant_export_receipts row, which is load-bearing in a way a log is not:
       `assertPurgePermitted` looks the digest up before it will allow an
       offboarding purge, so a digest with no receipt is refused later, by which
       point the operator has long since downloaded the file.

       An earlier version of this comment said "the receipt above is already
       committed". It was not: `recordExportReceipt` swallowed its own INSERT
       failure and returned `Promise<void>`, and its own warning line says "a
       later purge will refuse this digest". The reviewer who caught it named the
       right reason — a false claim about a write's success, in prose, inside the
       fix for exactly that defect class. It reports its outcome now. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId,
      userId: (req as any).user?.id ?? null,
      action: 'tenant.export.full',
      resourceType: 'tenant_data_export',
      resourceId: String(orgId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: { digest, coverage: payload.coverage },
    });

    res
      .status(200)
      .set('Content-Type', 'application/json')
      // Surfaced as a header too so an operator can capture the digest from a
      // curl -I without downloading and re-hashing a multi-megabyte body.
      .set('X-Export-Digest', digest)
      .set(
        'Content-Disposition',
        `attachment; filename="tenant-full-export-${payload.organization.slug}-${Date.now()}.json"`
      )
      /* `exportReceipt` sits beside `digest` deliberately. A compliance reader
         seeing a digest and nothing else concludes the export is recorded and
         the digest is usable as a purge precondition; when the receipt did not
         record, neither is true, and this is the only place that says so at the
         moment the file is produced. */
      .send(JSON.stringify({ digest, exportReceipt: receipt, ...payload, auditTrail }, null, 2));
  } catch (err: unknown) {
    if (err instanceof FullExportTenantNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof ExportScopeUnavailableError) {
      return res.status(409).json({ error: err.message, code: 'EXPORT_SCOPE_UNAVAILABLE' });
    }
    return serverError(res, log, 'exporting the full tenant data', err, { organizationId: orgId });
  }
});

router.get('/attestation', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin role required for attestation' });
  }

  try {
    const report = await generateAttestation(pool, orgId);

    /* WO-16C #133. Was `void auditService.logAction({…})`: whether the
       §11.10(e) record of who pulled this attestation, and what verdict it
       carried, exists at all was unobservable to the caller. This row records
       the run and its verdict; its outcome goes in the `X-Audit-Trail-*`
       headers rather than the body, because the body is HMAC-signed over every
       key but `signature` — see the note at the top of this file. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId,
      userId: (req as any).user?.id ?? null,
      action: 'tenant.attestation.generate',
      resourceType: 'audit_attestation_report',
      resourceId: String(orgId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        attestation: report.attestation,
        totalEntries: report.totalEntries,
        brokenLinks: report.brokenLinks,
      },
    });

    setAuditTrailHeaders(res, auditTrail);

    /* The report itself is a document handed to an auditor outside the
       platform, so its delivery is recorded as every generated download is
       (D5): an EXPORT_GENERATED row with the SHA-256 of these exact bytes,
       and nothing sent when that row does not persist. The run's row above
       carried the verdict but no hash, and the report was returned whether or
       not it persisted (2026-10-15 launch-boundary re-proof). The bytes are
       the ones the screen saves (ComplianceAttestation.tsx writes the same
       JSON.stringify(report, null, 2)). */
    await sendAuditedDownload(res, {
      organizationId: orgId,
      userId: Number((req as any).user?.id),
      sourceType: 'export_json',
      backendRoute: '/api/tenant-export/attestation',
      resourceType: 'audit_attestation_report',
      resourceId: String(orgId),
      programUuid: null,
      filename: `attestation-${report.organization.slug}-${Date.now()}.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(report, null, 2), 'utf8'),
      metadata: {
        attestation: report.attestation,
        totalEntries: report.totalEntries,
        brokenLinks: report.brokenLinks,
      },
    });
  } catch (err: unknown) {
    if (isUnauditedExportRefusal(err)) {
      return res.status(503).json({
        error: 'Attestation not delivered',
        detail: 'Its record could not be written, so the report was not sent. Try again.',
      });
    }
    if (err instanceof AttestationKeyMissingError) {
      return res.status(503).json({
        error: 'Attestation not configured',
        detail: 'AUDIT_ATTESTATION_KEY env var is required',
      });
    }
    return serverError(res, log, 'generating the attestation report', err, { organizationId: orgId });
  }
});

/**
 * Custody of the export, a signed act (P-58, D6, 2026-10-29;
 * services/tenant/offboarding-custody.ts). Before the purge erases a held
 * record (a signature, an audit trail, a sealed report, a ledger), one of the
 * organization's administrators signs that they received this export and took
 * custody of it, and accepts the obligation to keep the records still inside
 * the organization's retention period, which the attestation lists.
 *
 * GET returns the attestation and its SHA-256: what the administrator reads
 * before signing. POST signs it through the platform's one ceremony
 * (signGovernedAct: password, second factor where enrolled, the meaning
 * `responsibility`, a reason, signing authority from the membership role, the
 * ledger pair and the electronic_signatures row on one transaction), naming
 * the SHA-256 it read: an attestation that changed since is refused. Reached
 * while the organization is pending deletion (the lifecycle guard's data
 * portability carve-out covers this prefix).
 */
router.get('/custody', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const digest = typeof req.query.digest === 'string' ? req.query.digest.trim() : '';
  if (!EXPORT_DIGEST.test(digest)) {
    return res.status(400).json({ error: { code: 'CUSTODY_DIGEST_INVALID', message: 'Name the export by the digest it returned (sha256:<64 hex>).' } });
  }
  try {
    if (!await mayExportTenantData(req, orgId)) return res.status(403).json({ error: 'Current organization owner or administrator authority is required for tenant data return.' });
    return res.json(await custodyAttestation(pool, orgId, digest));
  } catch (err: unknown) {
    if (err instanceof CustodyRefusal) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return serverError(res, log, 'reading the custody attestation', err, { organizationId: orgId });
  }
});

router.post('/custody', signedActAttempts, async (req: Request, res: Response) => {
  const digest = typeof req.body?.digest === 'string' ? req.body.digest.trim() : '';
  const attestationSha256 = typeof req.body?.attestationSha256 === 'string' ? req.body.attestationSha256.trim() : '';
  if (!EXPORT_DIGEST.test(digest) || !/^[0-9a-f]{64}$/.test(attestationSha256)) {
    return res.status(400).json({ error: { code: 'CUSTODY_REQUEST_INVALID', message: 'Name the export by its digest, and the attestation you read by its SHA-256. Nothing was signed.' } });
  }
  return signGovernedAct(req, res, custodyAct(digest, attestationSha256));
});

export default router;
