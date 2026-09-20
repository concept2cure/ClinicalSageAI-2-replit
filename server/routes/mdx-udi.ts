/**
 * UDI records — backs Surface 3 (rail item `udi`) of the paying-client beta.
 *
 *   GET    /api/mdx/udi                          list every UDI record in org
 *   GET    /api/mdx/udi?program_id=<UUID>        scoped to one program
 *   POST   /api/mdx/udi                          create a new UDI record
 *   GET    /api/mdx/udi/:id                      single record
 *   PATCH  /api/mdx/udi/:id                      partial update
 *   POST   /api/mdx/udi/:id/submit-gudid         flip gudid_status='submitted'
 *
 * Tenant-scoped on every endpoint via udi_records.organization_id =
 * caller's org. Soft-delete supported (deleted_at). The submit-gudid
 * action is a state transition, not a full update — it stamps
 * gudid_submitted_at = NOW() and records the payload that was submitted.
 *
 * Create and submit-gudid each record a 21 CFR Part 11 §11.10(e) row and
 * report in `meta.auditTrail` whether it persisted; the PATCH endpoint records
 * none (see the note on the `recordAuditRow` import). This file's own earlier
 * header said "Audit-logged via the global mutation middleware" — there is no
 * such middleware on these routes: `server/middleware/auditLogger.js` exists,
 * but nothing in the repository imports or mounts it, so the only §11.10(e)
 * rows these endpoints produce are the ones written below. AnA can read +
 * mutate via the dedicated AnA tools in the registry.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';
/*
 * WO-16C #133. The two writes in this router that record a §11.10(e) row each
 * did so with `void auditService.logAction({…})`, which throws away the
 * `AuditWriteResult` that call resolves. `logAction` never rejects when
 * persistence fails — deliberately, an audit-trail outage must not break the
 * user action it records — so the discarded value was the ONLY place a lost row
 * was visible: the returned record and the HTTP envelope came back
 * byte-identical whether the §11.10(e) record existed or not.
 *
 * Both now go through the shared `recordAuditRow`, and each route carries its
 * outcome out in the response envelope's `meta.auditTrail`. Both are a log
 * BESIDE an already-committed write — the INSERT or UPDATE has returned its row
 * before the audit row is attempted — so neither reverts its mutation over a
 * lost log row: the action stands and the caller is told. Each handler writes
 * exactly one audit row, so one unqualified `auditTrail` key per envelope names
 * it unambiguously.
 *
 * Two is the number of AUDITED writes in this file, not of governed ones. The
 * `PATCH /udi/:id` handler below updates a UDI record — `udi_di` and
 * `issuing_agency`, the device identifier itself, included — and records no
 * §11.10(e) row at all. That is a separate gap from #133, and not one this
 * conversion could fix: nothing is discarded there because nothing is written.
 *
 * `recordAuditRow` returns `{persisted, chained}` or `{persisted: false, code,
 * message}` and never the store's own text; that text goes to its log line,
 * keyed on the action and the resource id. `auditService` is reached through
 * that module, so it is no longer imported here directly.
 */
import { recordAuditRow } from '../services/audit/audit-write-outcome';

/*
 * Every governed write below was guarded by nothing but the caller's org
 * context, which is tenant scoping, not authorization: a read-only `viewer`
 * could create and amend UDI records, IVDR classifications and performance
 * evaluations, CDx pairings and concordance. These are the device and IVD
 * records a submission is assembled from.
 */
import { requireEditorAccess } from '../middleware/orgMembership';

const router = Router();
const log = createScopedLogger('mdx-udi');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ISSUING_AGENCY = ['GS1', 'HIBCC', 'ICCBBA'] as const;
const MRI_SAFETY = ['mri_safe', 'mri_conditional', 'mri_unsafe', 'not_evaluated'] as const;
const LOT_SERIAL = ['lot', 'serial', 'none'] as const;
const GUDID_STATUS = ['draft', 'submitted', 'published', 'rejected'] as const;

const listQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  agency:     z.enum(ISSUING_AGENCY).optional(),
  status:     z.enum(GUDID_STATUS).optional(),
  limit:      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});

const createBody = z.object({
  programId:      z.string().regex(UUID_RE).optional().nullable(),
  deviceName:     z.string().min(1).max(500),
  udiDi:          z.string().min(3).max(60),
  issuingAgency:  z.enum(ISSUING_AGENCY),
  udiPiFormat:    z.string().max(100).optional().nullable(),
  gmdnCode:       z.string().max(50).optional().nullable(),
  deviceClass:    z.string().max(10).optional().nullable(),
  productCode:    z.string().max(10).optional().nullable(),
  brandName:      z.string().max(200).optional().nullable(),
  catalogNumber:  z.string().max(120).optional().nullable(),
  versionOrModel: z.string().max(120).optional().nullable(),
  packageQty:     z.number().int().nonnegative().optional().nullable(),
  packageType:    z.string().max(120).optional().nullable(),
  mriSafety:      z.enum(MRI_SAFETY).optional().nullable(),
  lotSerial:      z.enum(LOT_SERIAL).optional().nullable(),
  prescriptionUse: z.boolean().optional(),
  hctp:           z.boolean().optional(),
  kit:            z.boolean().optional(),
  singleUse:      z.boolean().optional(),
  rxOnly:         z.boolean().optional(),
});

const patchBody = createBody.partial();

/* ─── GET /api/mdx/udi/summary ────────────────────────────────────────
   Aggregate read model for the UDI surface.

   The surface needs five panels — devices, labels, symbols, issues and
   MRI. The list endpoint above returns a flat `udi_records[]`, which is
   the right shape for the record editor but not for the surface; the
   client hook was reading `data.devices` / `data.labels` / … off that
   flat array, getting `undefined` for all five, and silently rendering
   design-kit fixtures. This endpoint returns the shape the surface
   actually consumes, assembled from the real tables.

   Program-scoped when `program_id` is supplied — udi_records and
   labeling_documents both carry a program column, so unlike the
   engineering surface this one narrows honestly and completely. ───── */

router.get('/udi/summary', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = typeof req.query.program_id === 'string' ? req.query.program_id : undefined;
  if (programId !== undefined && !UUID_RE.test(programId)) {
    return clientError(res, 422, 'program_id must be a UUID');
  }

  /** Empty rather than fatal when an optional table is not migrated. */
  const panel = async <T extends Record<string, unknown>>(
    name: string, sql: string, args: unknown[],
  ): Promise<T[]> => {
    try {
      const { rows } = await pool.query(sql, args);
      return rows as T[];
    } catch (err) {
      if ((err as { code?: string })?.code !== '42P01') {
        log.warn(`udi panel ${name} failed`, {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return [];
    }
  };

  const scoped = (col: string) => (programId ? ` AND ${col} = $2` : '');
  const args: unknown[] = programId ? [orgId, programId] : [orgId];

  try {
    const udiRows = await panel<Record<string, any>>(
      'devices',
      `SELECT * FROM udi_records
        WHERE organization_id = $1 AND deleted_at IS NULL${scoped('program_id')}
        ORDER BY updated_at DESC LIMIT 500`,
      args,
    );

    const labelRows = await panel<Record<string, any>>(
      'labels',
      `SELECT id, device_name, doc_kind, version, status, language, region, udi_di, updated_at
         FROM labeling_documents
        WHERE organization_id = $1 AND deleted_at IS NULL${scoped('program_id')}
        ORDER BY updated_at DESC LIMIT 500`,
      args,
    );

    /* Symbols join through the label document so the panel stays inside
       the same program scope as everything else on the surface. */
    const symbolRows = await panel<Record<string, any>>(
      'symbols',
      `SELECT s.symbol_code, s.symbol_name, s.required_by, COUNT(*)::int AS uses
         FROM labeling_symbols s
         JOIN labeling_documents d ON d.id = s.labeling_document_id
        WHERE s.organization_id = $1 AND d.deleted_at IS NULL${scoped('d.program_id')}
        GROUP BY s.symbol_code, s.symbol_name, s.required_by
        ORDER BY s.symbol_code`,
      args,
    );

    /* Translations that are not yet verified are the surface's issue
       feed — an unverified back-translation is a real EU MDR labelling
       exposure, not a cosmetic warning. */
    const translationRows = await panel<Record<string, any>>(
      'issues',
      `SELECT t.id, t.language, t.status, t.back_translation_verified,
              d.device_name, d.doc_kind, d.version, t.updated_at
         FROM labeling_translations t
         JOIN labeling_documents d ON d.id = t.labeling_document_id
        WHERE t.organization_id = $1 AND d.deleted_at IS NULL${scoped('d.program_id')}
          AND (t.back_translation_verified IS NOT TRUE OR t.status <> 'approved')
        ORDER BY t.updated_at DESC LIMIT 200`,
      args,
    );

    const gudidState = (s: string | null): string => {
      const v = (s ?? 'draft').toLowerCase();
      return v === 'submitted' ? 'in-review' : v === 'published' ? 'published' : v;
    };
    const iso = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '—');
    const mriMode = (m: string | null): string =>
      (m ?? 'not_evaluated').replace(/^mri_/, '').replace('not_evaluated', 'na');

    const labelsByDevice = new Map<string, number>();
    for (const l of labelRows) {
      const k = String(l.device_name ?? '');
      labelsByDevice.set(k, (labelsByDevice.get(k) ?? 0) + 1);
    }

    const devices = udiRows.map((r) => ({
      id: String(r.id),
      code: r.catalog_number ?? r.version_or_model ?? r.udi_di,
      name: r.device_name,
      class: r.device_class ? `Class ${r.device_class}` : '—',
      fda: {
        di: r.udi_di,
        gmdn: r.gmdn_code ?? '—',
        agency: String(r.issuing_agency ?? '').toLowerCase(),
        status: gudidState(r.gudid_status),
        submitted: iso(r.gudid_submitted_at),
        /* Acknowledgement is only real once GUDID has published the
           record. Never infer it from our own submit action. */
        acked: r.gudid_status === 'published' ? iso(r.updated_at) : '—',
      },
      /* EUDAMED is a separate registration with its own lifecycle and no
         column here yet. Reporting 'not-tracked' is honest; reporting
         'not-started' would assert something we have not checked. */
      eu: { di: r.udi_di, risk: '—', agency: String(r.issuing_agency ?? '').toLowerCase(),
            status: 'not-tracked', submitted: '—', acked: '—' },
      mri: mriMode(r.mri_safety),
      rx: r.rx_only ? 'rx-only' : 'otc',
      sterile: Boolean(r.metadata?.sterile ?? false),
      singleUse: Boolean(r.single_use),
      labels: labelsByDevice.get(String(r.device_name ?? '')) ?? 0,
      translations: 0,
      open: 0,
    }));

    const labels = labelRows.map((l) => ({
      id: String(l.id),
      device: l.device_name ?? '—',
      kind: l.doc_kind ?? '—',
      region: l.region ?? '—',
      lang: l.language ?? '—',
      ver: l.version ?? '—',
      size: '—',
      status: l.status ?? 'draft',
      updated: l.updated_at ? new Date(l.updated_at).toISOString().slice(0, 10) : '—',
    }));

    const symbols = symbolRows.map((s) => ({
      iso: s.symbol_code,
      name: s.symbol_name,
      glyph: String(s.symbol_code ?? '').replace(/\./g, '-'),
      required: s.required_by ?? 'always',
      present: true,
    }));

    const issues = translationRows.map((t) => ({
      id: `TR-${t.id}`,
      label: `${t.device_name ?? '—'} ${t.doc_kind ?? ''} ${t.version ?? ''}`.trim(),
      kind: 'translation',
      severity: t.back_translation_verified === true ? 'warn' : 'err',
      msg:
        t.back_translation_verified === true
          ? `${t.language} translation is back-translation verified but not approved (status ${t.status}).`
          : `${t.language} translation has no verified back-translation.`,
      since: t.updated_at ? new Date(t.updated_at).toISOString().slice(0, 10) : '—',
    }));

    const mri = udiRows
      .filter((r) => r.mri_safety && r.mri_safety !== 'not_evaluated')
      .map((r) => ({
        device: r.catalog_number ?? r.device_name,
        mode: mriMode(r.mri_safety),
        field: r.metadata?.mriField ?? '—',
        sar: r.metadata?.mriSar ?? '—',
        gradient: r.metadata?.mriGradient ?? '—',
        tested: r.mri_safety !== 'not_evaluated',
        notes: r.metadata?.mriNotes ?? '—',
      }));

    return ok(
      res,
      { devices, labels, symbols, issues, mri },
      { scope: programId ? 'program' : 'organization' },
    );
  } catch (err) {
    return serverError(res, log, 'udi-summary', err);
  }
});

/* ─── GET /api/mdx/udi ────────────────────────────────────────────── */

router.get('/udi', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: programId, agency, status, limit = 200 } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (programId) { args.push(programId); filters.push(`program_id = $${args.length}`); }
  if (agency)    { args.push(agency);    filters.push(`issuing_agency = $${args.length}`); }
  if (status)    { args.push(status);    filters.push(`gudid_status = $${args.length}`); }
  args.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM udi_records
        WHERE ${filters.join(' AND ')}
        ORDER BY updated_at DESC
        LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list', err);
  }
});

/* ─── POST /api/mdx/udi ───────────────────────────────────────────── */

router.post('/udi', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;

  try {
    const { rows } = await pool.query(
      `INSERT INTO udi_records (
         organization_id, program_id, device_name, udi_di, issuing_agency,
         udi_pi_format, gmdn_code, device_class, product_code, brand_name,
         catalog_number, version_or_model, package_qty, package_type,
         mri_safety, lot_serial, prescription_use, hctp, kit, single_use, rx_only
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
       )
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.deviceName, p.udiDi, p.issuingAgency,
        p.udiPiFormat ?? null, p.gmdnCode ?? null, p.deviceClass ?? null,
        p.productCode ?? null, p.brandName ?? null, p.catalogNumber ?? null,
        p.versionOrModel ?? null, p.packageQty ?? null, p.packageType ?? null,
        p.mriSafety ?? null, p.lotSerial ?? null,
        p.prescriptionUse ?? true, p.hctp ?? false, p.kit ?? false,
        p.singleUse ?? false, p.rxOnly ?? true,
      ],
    );
    /* WO-16C #133. Was `void auditService.logAction({…})`. The INSERT above has
       already committed the UDI record and returned it, so this is a log beside
       a completed issuance rather than the issuance itself: it is never
       reverted here. What the caller can now see is whether the §11.10(e)
       record of this device identifier being issued exists —
       `meta.auditTrail`. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, action: 'mdx.udi.issue',
      resourceType: 'udi_record', resourceId: rows[0]?.id,
      details: { udiDi: p.udiDi, deviceName: p.deviceName, issuingAgency: p.issuingAgency },
    });
    return created(res, rows[0], { auditTrail });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      return clientError(res, 409, 'A UDI record with that UDI-DI already exists in this org');
    }
    return serverError(res, log, 'create', err);
  }
});

/* ─── GET /api/mdx/udi/:id ────────────────────────────────────────── */

router.get('/udi/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  try {
    const { rows } = await pool.query(
      `SELECT * FROM udi_records WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'UDI record');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'get', err);
  }
});

/* ─── PATCH /api/mdx/udi/:id ──────────────────────────────────────── */

router.patch('/udi/:id', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = patchBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  /* Build SET clause dynamically from the parsed keys; the column names
     map snake_case ↔ camelCase via a small dictionary. Done in code
     rather than via Drizzle to keep this route file dependency-free
     against any schema-import churn. */
  const COL: Record<string, string> = {
    programId: 'program_id', deviceName: 'device_name', udiDi: 'udi_di',
    issuingAgency: 'issuing_agency', udiPiFormat: 'udi_pi_format',
    gmdnCode: 'gmdn_code', deviceClass: 'device_class', productCode: 'product_code',
    brandName: 'brand_name', catalogNumber: 'catalog_number',
    versionOrModel: 'version_or_model', packageQty: 'package_qty',
    packageType: 'package_type', mriSafety: 'mri_safety', lotSerial: 'lot_serial',
    prescriptionUse: 'prescription_use', hctp: 'hctp', kit: 'kit',
    singleUse: 'single_use', rxOnly: 'rx_only',
  };
  const setFrags: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k];
    if (!col) continue;
    args.push(v);
    setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);

  try {
    const { rows } = await pool.query(
      `UPDATE udi_records
          SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'UDI record');
    /* Editing a UDI record recorded NO 21 CFR Part 11 §11.10(e) row at all, while
       issuing one (`mdx.udi.issue`) and submitting it to GUDID
       (`mdx.udi.gudid.submit`) each record one. Found by the census the reviewer
       of this file's #133 conversion ran — there was nothing to convert here,
       because nothing was written.

       A UDI-DI is the device identifier FDA's GUDID holds, so changing the
       identifier, the device class, the product code or the brand name after
       issue is the change an inspector traces; `changedFields` names which
       columns moved. The UPDATE above has committed, so this is a log beside it:
       the 200 stands and `meta.auditTrail` says whether the log exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId,
      // `(req as any).user?.id` — the same object getOrgId reads. Worth noting
      // that neither sibling row in this router passes an actor at all, so
      // `mdx.udi.issue` and `mdx.udi.gudid.submit` currently record a §11.10(e)
      // entry with no `user_id`. That is an attribution gap rather than a
      // discarded-outcome one, so it is reported here and not silently copied.
      userId: (req as any).user?.id ?? undefined,
      action: 'mdx.udi.update',
      resourceType: 'udi_record',
      resourceId: String(id),
      details: { changedFields: Object.keys(parsed.data).filter(k => parsed.data[k as keyof typeof parsed.data] !== undefined) },
    });
    return ok(res, rows[0], { auditTrail });
  } catch (err) {
    return serverError(res, log, 'patch', err);
  }
});

/* ─── POST /api/mdx/udi/:id/submit-gudid ──────────────────────────── */

router.post('/udi/:id/submit-gudid', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  try {
    const { rows } = await pool.query(
      `UPDATE udi_records
          SET gudid_status = 'submitted',
              gudid_submitted_at = NOW(),
              gudid_payload = COALESCE($3::jsonb, gudid_payload),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          AND gudid_status IN ('draft','rejected')
        RETURNING *`,
      [id, orgId, req.body?.payload ? JSON.stringify(req.body.payload) : null],
    );
    if (rows.length === 0) {
      return clientError(
        res,
        409,
        'UDI record not found, already submitted, or not in draft/rejected state',
      );
    }
    /* WO-16C #133. Was `void auditService.logAction({…})`. The UPDATE above has
       already flipped `gudid_status` to 'submitted' and stamped
       `gudid_submitted_at`, so this is a log beside a completed transition
       rather than the transition itself: it is never reverted here. What the
       caller can now see is whether the §11.10(e) record of that submission
       exists — `meta.auditTrail`. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, action: 'mdx.udi.submit_gudid',
      resourceType: 'udi_record', resourceId: id,
    });
    return ok(res, rows[0], { auditTrail });
  } catch (err) {
    return serverError(res, log, 'submit-gudid', err);
  }
});

export default router;
