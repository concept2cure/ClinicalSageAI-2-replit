/**
 * Tenant export + attestation routes — mounted at /api/tenant-export.
 *
 *   GET /api/tenant-export                  full data dump for the caller's org
 *   GET /api/tenant-export/attestation      hash-chain attestation report
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

const router = Router();
router.use(authenticateToken);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

function isAdmin(req: Request): boolean {
  const u = (req as any).user;
  if (!u) return false;
  if (u.role === 'admin' || u.role === 'owner') return true;
  if (Array.isArray(u.roles) && (u.roles.includes('admin') || u.roles.includes('owner'))) {
    return true;
  }
  return false;
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
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin role required for tenant export' });
  }

  try {
    const manifest = await exportTenantData(pool, orgId);

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
    const detail = err instanceof Error ? err.message : 'unknown';
    res.status(500).json({ error: 'Tenant export failed', detail });
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
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin role required for tenant export' });
  }

  try {
    const payload = await exportTenantFull(pool, orgId);
    const digest = digestOf(payload);

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
    const detail = err instanceof Error ? err.message : 'unknown';
    res.status(500).json({ error: 'Tenant full export failed', detail });
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
       carried, exists at all was unobservable to the caller. Generating the
       report is a read, so the row is a log beside it and the report is
       returned either way. The outcome goes in the `X-Audit-Trail-*` headers
       rather than the body, because the body is HMAC-signed over every key but
       `signature` — see the note at the top of this file. */
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

    res
      .status(200)
      .set('Content-Type', 'application/json')
      .set(
        'Content-Disposition',
        `attachment; filename="attestation-${report.organization.slug}-${Date.now()}.json"`,
      )
      .send(JSON.stringify(report, null, 2));
  } catch (err: unknown) {
    if (err instanceof AttestationKeyMissingError) {
      return res.status(503).json({
        error: 'Attestation not configured',
        detail: 'AUDIT_ATTESTATION_KEY env var is required',
      });
    }
    const detail = err instanceof Error ? err.message : 'unknown';
    res.status(500).json({ error: 'Attestation failed', detail });
  }
});

export default router;
