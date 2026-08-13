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
 */

import { Router, Request, Response } from 'express';

import { authenticateToken } from '../middleware/auth';
import { pool } from '../db';
import auditService from '../services/auditService';
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

    void auditService.logAction({
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
      .send(JSON.stringify(manifest, null, 2));
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

    await recordExportReceipt(pool, {
      organizationId: orgId,
      digest,
      tableCount: payload.coverage.tablesExported,
      rowCount: payload.coverage.totalRows,
      createdBy: Number((req as any).user?.userId ?? (req as any).user?.id) || null,
    });

    void auditService.logAction({
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
      .send(JSON.stringify({ digest, ...payload }, null, 2));
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

    void auditService.logAction({
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
