/**
 * Labeling routes — IFU, package insert, patient label, operator manual,
 * translations, ISO 15223-1 symbol glossary.
 *
 *   GET    /api/mdx/labeling                                   list docs
 *   POST   /api/mdx/labeling                                   create doc
 *   GET    /api/mdx/labeling/:id                               single + nested; each signature's
 *                                                              content state (signedContent); whether
 *                                                              the reader may sign each translation's
 *                                                              approval (approvalSigner)
 *   PATCH  /api/mdx/labeling/:id                               partial update;
 *                                                              to `approved` or `effective`, an e-signature
 *
 *   GET    /api/mdx/labeling/:id/translations                  list
 *   POST   /api/mdx/labeling/:id/translations                  add translation
 *   PATCH  /api/mdx/labeling/translations/:transId             update translation;
 *                                                              to `approved`, an e-signature
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
import { admitProject as admitProjectShared } from '../lib/admit-project';
/*
 * The six writes below were guarded by the caller's organization only, which
 * is tenant scoping, not authorization: a `viewer` could create and amend
 * labeling documents, add and approve translations, and add and remove
 * symbols. Each now takes an editing role, as the UDI writes in mdx-udi.ts do.
 * Per route, not `router.use`: this router is mounted at `/api/mdx` beside 31
 * others, so a router-level gate would also run for theirs. The reads
 * stay open to every member (D3, 2026-10-29).
 */
import { requireEditorAccess } from '../middleware/orgMembership';
import { resolveUserId } from '../types/auth-request';
/* The approval controls (D5, 2026-10-29), on the QMS controlled document's
   lifecycle: a document's approval, its move to effective and its
   supersession, and a translation's approval, are electronic signatures, each
   from the step before it; the record's creator may not approve it; and a
   record that carries an approval is not edited until it is moved back, with
   a reason, which withdraws the approval. */
import {
  DOC_SIGNED_STATUS, signingLimit, editsBesides,
  signDocumentStatus, moveDocumentStatus, refuseControlledDocumentEdit, documentEditWhere,
  approveTranslationSigned, moveTranslationStatus, refuseApprovedTranslationEdit,
} from './mdx-labeling-approvals';
/* Whether each approval still binds the label it signed (21 CFR 11.70): the
   read side of the labeling content binders (D5, 2026-10-29). */
import { readSignedContentStates } from '../services/part11/signed-content-state';
/* Whether the reader may sign a translation's approval, asked of the sign
   step's own check, so the screen can say so before a password is typed
   (D5, 2026-10-29; docs/evidence/D5-SIGNED-CONTENT-ON-SCREEN/2026-10-29/). */
import { signerIndependenceOf, type SignerIndependence } from '../services/governance/separation-of-duties';
/* Signed content is not edited in place (P-63, 2026-10-29): what a label's or a
   translation's signature binds is read from its recipe, and its symbols are
   written only while the label carries no signature
   (docs/evidence/D5-SIGNED-CONTENT-LOCKED/2026-10-29/). */
import { deleteLabelingSymbol, insertLabelingSymbol, lockedFieldsIn, type ChildWrite } from '../services/part11/signed-content-lock';

const router = Router();
const log = createScopedLogger('mdx-labeling');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

/** The shared project-ownership refusal (server/lib/admit-project.ts). */
const admitProject = (res: Response, programId: string | null | undefined, orgId: number) =>
  admitProjectShared(res, log, programId, orgId);

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

/** A symbol write that wrote nothing, answered: 404, the signed-content refusal, or a record that moved. */
function answerChildWrite(res: Response, w: Exclude<ChildWrite, { outcome: 'written' }>, noun: string) {
  if (w.outcome === 'not-found') return notFoundInTenant(res, noun);
  if (w.outcome === 'refused') return clientError(res, w.refusal.status, w.refusal.message, w.refusal.details);
  return clientError(res, 409, 'This labeling document changed while the symbol was being saved. Reload it and try again. Nothing was saved.', { code: 'LABELING_STATUS_CHANGED' });
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
    /* The project's labeling screen reads by `program_id`. Rows were always
       filtered by organization, but another organization's project, or a
       missing one, answered 200 with no rows: "this project has no label".
       Ownership is asked first, through the one ownership answer, as
       mdx-engineering.ts does (D2, 2026-10-29). */
    if (!(await admitProject(res, pid, orgId))) return;
    const { rows } = await pool.query(
      `SELECT * FROM labeling_documents WHERE ${filters.join(' AND ')}
        ORDER BY device_name, doc_kind, language`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list', err);
  }
});

/**
 * Whether this reader may sign each translation's approval: the separation-of-
 * duties check the approval runs (signerIndependenceOf), asked in advance, as
 * the Submission Center's dispatch-readiness read asks it. Informational: the
 * signed PATCH still decides. 'unresolved' (no creator recorded) is not a
 * refusal here, because the approval then signs with twoPersonRule
 * 'not_applicable_no_author_recorded' (mdx-labeling-approvals.ts). A reader
 * with no user id, or a check that cannot run, is 'unverified', never
 * 'independent', and never fails the read.
 */
async function approvalSignersOf(req: Request, orgId: number, ids: unknown[]): Promise<SignerIndependence[]> {
  const userId = resolveUserId(req);
  return Promise.all(ids.map(async (id): Promise<SignerIndependence> => {
    if (userId === null) return 'unverified';
    try { return await signerIndependenceOf(`labeling-translation:${String(id)}`, orgId, userId); } catch { return 'unverified'; }
  }));
}

/** The create's values, in its INSERT's order ($1..$13). */
function docInsertParams(p: z.infer<typeof docCreate>, orgId: number, userId: number): unknown[] {
  return [
    orgId, p.programId ?? null, p.deviceName, p.docKind,
    p.version ?? null, p.status ?? null, p.language ?? null,
    p.region ?? null, p.udiDi ?? null, p.effectiveDate ?? null,
    p.expiresAt ?? null, p.artifactId ?? null, userId,
  ];
}

router.post('/labeling', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  // The creator is recorded: separation of duties refuses their approval.
  const userId = resolveUserId(req);
  if (userId === null) return clientError(res, 401, 'User context required');
  const parsed = docCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  /* A document is created unapproved. Approving it, making it effective and
     superseding it are the signed acts on the PATCH below; a create with any
     of those statuses was one with no signature and no approver (D5,
     2026-10-29). */
  if (DOC_SIGNED_STATUS.has(String(p.status))) {
    return clientError(
      res,
      428,
      'Approving a labeling document, making it effective or superseding it is an electronic signature: create it, then sign that step with your password, what the signature means and a reason. Nothing was saved.',
      { code: 'LABELING_DOCUMENT_APPROVAL_REQUIRES_SIGNATURE' },
    );
  }
  try {
    /* The create and the PATCH below stored the client's `programId` without
       asking. The same-organization key (20261013b) refused another
       organization's project and a missing one, but the caller got a 500, and
       no key refuses a deleted project. Both now ask first and answer as the
       read above does: 404 and no row when the organization does not own the
       live project, 503 when the check cannot run. No `programId`, or `null`,
       is unchanged (D3, 2026-10-29). */
    if (!(await admitProject(res, p.programId, orgId))) return;
    const { rows } = await pool.query(
      `INSERT INTO labeling_documents (
         organization_id, program_id, device_name, doc_kind, version, status,
         language, region, udi_di, effective_date, expires_at, artifact_id, created_by
       ) VALUES (
         $1,$2,$3,$4,COALESCE($5,'1.0'),COALESCE($6,'draft'),
         COALESCE($7,'en'),$8,$9,$10,$11,$12,$13
       )
       RETURNING *`,
      docInsertParams(p, orgId, userId),
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
    /* The document's and each translation's newest signature in force,
       re-derived against the record now: matches, changed, unverified,
       withdrawn, unsigned or unavailable (services/part11/signed-content-state.ts). */
    const transTarget = (t: { id: unknown }) => `labeling-translation:${String(t.id)}`;
    const [signed, signers] = await Promise.all([
      readSignedContentStates(
        { query: (sql, params) => pool.query(sql, params) },
        orgId,
        [`labeling-document:${id}`, ...translations.rows.map(transTarget)],
      ),
      approvalSignersOf(req, orgId, translations.rows.map((t) => t.id)),
    ]);
    return ok(res, {
      ...rows[0],
      signedContent: signed.get(`labeling-document:${id}`),
      translations: translations.rows.map((t, i) => ({
        ...t, signedContent: signed.get(transTarget(t)), approvalSigner: { state: signers[i] },
      })),
      symbols: symbols.rows,
    });
  } catch (err) { return serverError(res, log, 'get', err); }
});

router.patch('/labeling/:id', requireEditorAccess, signingLimit(DOC_SIGNED_STATUS), async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = docPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  if (DOC_SIGNED_STATUS.has(String(parsed.data.status))) return signDocumentStatus(req, res, id, parsed.data);
  const { status, ...fields } = parsed.data;
  if (status !== undefined && editsBesides(fields, []).length === 0) return moveDocumentStatus(req, res, id, orgId, status);
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
  // What the document's signature binds is not edited while it carries one (P-63; documentEditWhere).
  const { where, locked } = documentEditWhere(args.length, parsed.data);
  try {
    if (!(await admitProject(res, parsed.data.programId, orgId))) return;
    const { rows } = await pool.query(
      `UPDATE labeling_documents SET ${setFrags.join(', ')} WHERE ${where.join(' AND ')} RETURNING *`,
      args,
    );
    if (rows.length > 0) return ok(res, rows[0]);
    return refuseControlledDocumentEdit(res, id, orgId, locked);
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
    // SELECT * keeps every column v1 consumers read; the extra aliases
    // (method, btv, name) add the v2 translation-board display keys without
    // removing anything — additive, so no consumer breaks.
    const { rows } = await pool.query(
      `SELECT *,
              translation_method        AS method,
              back_translation_verified AS btv,
              CASE language
                WHEN 'en' THEN 'English'  WHEN 'de' THEN 'German'
                WHEN 'fr' THEN 'French'   WHEN 'es' THEN 'Spanish'
                WHEN 'it' THEN 'Italian'  WHEN 'nl' THEN 'Dutch'
                WHEN 'pl' THEN 'Polish'   WHEN 'ja' THEN 'Japanese'
                WHEN 'zh' THEN 'Chinese'  WHEN 'pt' THEN 'Portuguese'
                ELSE upper(language)
              END                       AS name
         FROM labeling_translations WHERE labeling_document_id = $1 ORDER BY language`,
      [id],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'trans-list', err); }
});

router.post('/labeling/:id/translations', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  // The creator is recorded: separation of duties refuses their approval.
  const userId = resolveUserId(req);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireDocInOrg(orgId, id))) return notFoundInTenant(res, 'Labeling document');
  const parsed = transCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  /* A translation is added unapproved. Approving it is the signed act on the
     PATCH below; a create with status `approved` was an approval with no
     signature and no approver (D5, 2026-10-29). */
  if (p.status === 'approved') {
    return clientError(
      res,
      428,
      'Approving a translation is an electronic signature: add it, then approve it with your password, what the signature means and a reason. Nothing was saved.',
      { code: 'TRANSLATION_APPROVAL_REQUIRES_SIGNATURE' },
    );
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO labeling_translations (
         labeling_document_id, organization_id, language, translator,
         translation_method, back_translation_verified, status, artifact_id, created_by
       ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,false),COALESCE($7,'pending'),$8,$9)
       RETURNING *`,
      [
        id, orgId, p.language, p.translator ?? null,
        p.translationMethod ?? null, p.backTranslationVerified ?? null,
        p.status ?? null, p.artifactId ?? null, userId,
      ],
    );
    return created(res, rows[0]);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') return clientError(res, 409, 'A translation for that language already exists on this document');
    return serverError(res, log, 'trans-create', err);
  }
});

router.patch('/labeling/translations/:transId', requireEditorAccess, signingLimit(new Set(['approved'])), async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const transId = Number(req.params.transId);
  if (!Number.isFinite(transId)) return clientError(res, 422, 'transId must be numeric');
  const parsed = transPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  if (parsed.data.status === 'approved') return approveTranslationSigned(req, res, transId, parsed.data);
  const { status, ...fields } = parsed.data;
  if (status !== undefined && editsBesides(fields, []).length === 0) return moveTranslationStatus(req, res, transId, orgId, status);
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
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(transId, orgId);
  try {
    // An approved translation is not edited (mdx-labeling-approvals.ts says why).
    const { rows } = await pool.query(
      `UPDATE labeling_translations SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND status <> 'approved'
        RETURNING *`,
      args,
    );
    if (rows.length > 0) return ok(res, rows[0]);
    return refuseApprovedTranslationEdit(res, transId, orgId, lockedFieldsIn('labeling-translation', parsed.data));
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

router.post('/labeling/:id/symbols', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireDocInOrg(orgId, id))) return notFoundInTenant(res, 'Labeling document');
  const parsed = symbolCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    // A symbol is part of the label: none is added to one that carries a signature (P-63).
    const written = await insertLabelingSymbol(pool, orgId, id, parsed.data);
    return written.outcome === 'written' ? created(res, written.row) : answerChildWrite(res, written, 'Labeling document');
  } catch (err) { return serverError(res, log, 'sym-create', err); }
});

router.delete('/labeling/symbols/:symId', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const symId = Number(req.params.symId);
  if (!Number.isFinite(symId)) return clientError(res, 422, 'symId must be numeric');
  try {
    // Nor is one removed from it (P-63).
    const written = await deleteLabelingSymbol(pool, orgId, symId);
    return written.outcome === 'written' ? noContent(res) : answerChildWrite(res, written, 'Symbol');
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
