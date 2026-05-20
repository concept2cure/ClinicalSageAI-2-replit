/**
 * Labeling routes — IFU, package insert, patient label, operator manual,
 * translations, ISO 15223-1 symbol glossary.
 *
 *   GET    /api/mdx/labeling                                   list docs
 *   POST   /api/mdx/labeling                                   create doc
 *   GET    /api/mdx/labeling/:id                               single + nested
 *   PATCH  /api/mdx/labeling/:id                               partial update
 *
 *   GET    /api/mdx/labeling/:id/translations                  list
 *   POST   /api/mdx/labeling/:id/translations                  add translation
 *   PATCH  /api/mdx/labeling/translations/:transId             update translation
 *
 *   GET    /api/mdx/labeling/:id/symbols                       list symbols
 *   POST   /api/mdx/labeling/:id/symbols                       add symbol
 *   DELETE /api/mdx/labeling/symbols/:symId                    remove symbol
 *
 *   GET    /api/mdx/labeling/:id/coverage                      translation coverage
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError, noContent,
} from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-labeling');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function getUserId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOC_KIND = ['ifu', 'package_insert', 'patient_label', 'operator_manual', 'service_manual', 'quick_ref', 'box_label'] as const;
const DOC_STATUS = ['draft', 'review', 'approved', 'effective', 'superseded'] as const;
const TRANS_METHOD = ['human', 'mt_postedited', 'machine'] as const;
const TRANS_STATUS = ['pending', 'in_progress', 'review', 'approved', 'rejected'] as const;

async function requireDocInOrg(orgId: number, docId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM labeling_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [docId, orgId],
  );
  return rows.length > 0;
}

/* ─── Documents ─────────────────────────────────────────────── */

const listQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  doc_kind:   z.enum(DOC_KIND).optional(),
  status:     z.enum(DOC_STATUS).optional(),
  language:   z.string().max(20).optional(),
});
const docCreate = z.object({
  programId:        z.string().regex(UUID_RE).optional().nullable(),
  deviceName:       z.string().min(1).max(500),
  docKind:          z.enum(DOC_KIND),
  version:          z.string().max(20).optional(),
  status:           z.enum(DOC_STATUS).optional(),
  language:         z.string().max(20).optional(),
  region:           z.enum(['us', 'eu', 'jp', 'global']).optional().nullable(),
  udiDi:            z.string().max(60).optional().nullable(),
  effectiveDate:    z.string().date().optional().nullable(),
  expiresAt:        z.string().date().optional().nullable(),
  artifactId:       z.number().int().positive().optional().nullable(),
});
const docPatch = docCreate.partial();

router.get('/labeling', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: pid, doc_kind, status, language } = parsed.data;
  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (pid)      { args.push(pid);      filters.push(`program_id = $${args.length}`); }
  if (doc_kind) { args.push(doc_kind); filters.push(`doc_kind = $${args.length}`); }
  if (status)   { args.push(status);   filters.push(`status = $${args.length}`); }
  if (language) { args.push(language); filters.push(`language = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM labeling_documents WHERE ${filters.join(' AND ')}
        ORDER BY device_name, doc_kind, language`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'list', err); }
});

router.post('/labeling', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = docCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO labeling_documents (
         organization_id, program_id, device_name, doc_kind, version, status,
         language, region, udi_di, effective_date, expires_at, artifact_id
       ) VALUES (
         $1,$2,$3,$4,COALESCE($5,'1.0'),COALESCE($6,'draft'),
         COALESCE($7,'en'),$8,$9,$10,$11,$12
       )
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.deviceName, p.docKind,
        p.version ?? null, p.status ?? null, p.language ?? null,
        p.region ?? null, p.udiDi ?? null, p.effectiveDate ?? null,
        p.expiresAt ?? null, p.artifactId ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'create', err); }
});

router.get('/labeling/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM labeling_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Labeling document');
    const [translations, symbols] = await Promise.all([
      pool.query(`SELECT * FROM labeling_translations WHERE labeling_document_id = $1 ORDER BY language`, [id]),
      pool.query(`SELECT * FROM labeling_symbols WHERE labeling_document_id = $1 ORDER BY symbol_code`, [id]),
    ]);
    return ok(res, { ...rows[0], translations: translations.rows, symbols: symbols.rows });
  } catch (err) { return serverError(res, log, 'get', err); }
});

router.patch('/labeling/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = docPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    programId: 'program_id', deviceName: 'device_name', docKind: 'doc_kind',
    version: 'version', status: 'status', language: 'language', region: 'region',
    udiDi: 'udi_di', effectiveDate: 'effective_date', expiresAt: 'expires_at',
    artifactId: 'artifact_id',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE labeling_documents SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Labeling document');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'patch', err); }
});

/* ─── Translations ──────────────────────────────────────────── */

const transCreate = z.object({
  language:                z.string().min(2).max(20),
  translator:              z.string().max(200).optional().nullable(),
  translationMethod:       z.enum(TRANS_METHOD).optional().nullable(),
  backTranslationVerified: z.boolean().optional(),
  status:                  z.enum(TRANS_STATUS).optional(),
  artifactId:              z.number().int().positive().optional().nullable(),
});
const transPatch = transCreate.partial();

router.get('/labeling/:id/translations', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireDocInOrg(orgId, id))) return notFoundInTenant(res, 'Labeling document');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM labeling_translations WHERE labeling_document_id = $1 ORDER BY language`,
      [id],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'trans-list', err); }
});

router.post('/labeling/:id/translations', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireDocInOrg(orgId, id))) return notFoundInTenant(res, 'Labeling document');
  const parsed = transCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO labeling_translations (
         labeling_document_id, organization_id, language, translator,
         translation_method, back_translation_verified, status, artifact_id
       ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,false),COALESCE($7,'pending'),$8)
       RETURNING *`,
      [
        id, orgId, p.language, p.translator ?? null,
        p.translationMethod ?? null, p.backTranslationVerified ?? null,
        p.status ?? null, p.artifactId ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') return clientError(res, 409, 'A translation for that language already exists on this document');
    return serverError(res, log, 'trans-create', err);
  }
});

router.patch('/labeling/translations/:transId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const transId = Number(req.params.transId);
  if (!Number.isFinite(transId)) return clientError(res, 422, 'transId must be numeric');
  const parsed = transPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    language: 'language', translator: 'translator', translationMethod: 'translation_method',
    backTranslationVerified: 'back_translation_verified', status: 'status',
    artifactId: 'artifact_id',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  /* Auto-stamp approved_at + approved_by when status flips to approved. */
  if (parsed.data.status === 'approved') {
    args.push(getUserId(req));
    setFrags.push(`approved_by = $${args.length}`);
    setFrags.push(`approved_at = NOW()`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(transId, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE labeling_translations SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Translation');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'trans-patch', err); }
});

/* ─── Symbols ───────────────────────────────────────────────── */

const symbolCreate = z.object({
  symbolCode:  z.string().min(1).max(40),
  symbolName:  z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  requiredBy:  z.array(z.string()).optional().nullable(),
});

router.get('/labeling/:id/symbols', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireDocInOrg(orgId, id))) return notFoundInTenant(res, 'Labeling document');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM labeling_symbols WHERE labeling_document_id = $1 ORDER BY symbol_code`,
      [id],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'sym-list', err); }
});

router.post('/labeling/:id/symbols', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireDocInOrg(orgId, id))) return notFoundInTenant(res, 'Labeling document');
  const parsed = symbolCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO labeling_symbols (
         labeling_document_id, organization_id, symbol_code, symbol_name,
         description, required_by
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        id, orgId, p.symbolCode, p.symbolName,
        p.description ?? null, p.requiredBy ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'sym-create', err); }
});

router.delete('/labeling/symbols/:symId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const symId = Number(req.params.symId);
  if (!Number.isFinite(symId)) return clientError(res, 422, 'symId must be numeric');
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM labeling_symbols WHERE id = $1 AND organization_id = $2`,
      [symId, orgId],
    );
    if ((rowCount ?? 0) === 0) return notFoundInTenant(res, 'Symbol');
    return noContent(res);
  } catch (err) { return serverError(res, log, 'sym-delete', err); }
});

/* ─── GET /labeling/:id/coverage ────────────────────────────── */

router.get('/labeling/:id/coverage', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireDocInOrg(orgId, id))) return notFoundInTenant(res, 'Labeling document');
  try {
    const { rows } = await pool.query<{
      language: string; status: string; back_translation_verified: boolean | null;
    }>(
      `SELECT language, status, back_translation_verified
         FROM labeling_translations
        WHERE labeling_document_id = $1`,
      [id],
    );
    const total    = rows.length;
    const approved = rows.filter((r) => r.status === 'approved').length;
    const backTransVerified = rows.filter((r) => r.back_translation_verified === true).length;
    return ok(res, {
      totalTranslations:    total,
      approved,
      backTranslationVerified: backTransVerified,
      languages: rows.map((r) => ({
        language: r.language, status: r.status, btv: r.back_translation_verified === true,
      })),
    });
  } catch (err) { return serverError(res, log, 'coverage', err); }
});

export default router;
