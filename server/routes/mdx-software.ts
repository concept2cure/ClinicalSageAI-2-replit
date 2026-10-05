/**
 * Software lifecycle (IEC 62304) — backs Surface 6 of the paying-client beta.
 *
 *   GET    /api/mdx/software?program_id=<UUID>     list lifecycle items
 *   POST   /api/mdx/software                        create a new item
 *   GET    /api/mdx/software/:id                    single item
 *   PATCH  /api/mdx/software/:id                    partial update
 *   GET    /api/mdx/software-summary/:programId     completeness summary
 *
 * Items are typed by item_kind covering the IEC 62304 / FDA 2023 software
 * guidance / FDA 2023 cybersecurity guidance deliverable set:
 *   srs / sds / arch / unit_test / integration_test / system_test /
 *   release_note / anomaly_log / ots_list / sbom / pentest / threat_model /
 *   risk_control / use_error / cybersecurity_label
 *
 * Doc level is 'basic' or 'enhanced' per the FDA 2023 software guidance.
 * The summary reads the level from the items and reports 'undetermined' (no
 * percentage) when there are none or they disagree; the required set is
 * FDA_SOFTWARE_DOCUMENTATION_SET, with cybersecurity documentation added only
 * for a cyber device (FD&C Act §524B). Safety class follows IEC 62304 (A | B | C)
 * and does not set the documentation level.
 *
 * 2026-10-05 (g-software-summary-fails-closed): the summary used to take the
 * most recently updated item's level, default to 'basic' with no items, and
 * keep its own REQUIRED_BASIC / REQUIRED_ENHANCED lists (unit/integration test
 * records at Basic; SBOM, OTS, threat model, pentest keyed on level). Those
 * lists are deleted; software-lifecycle.ts is the one set.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';
import type { RegulatoryBasis } from '../../shared/regulatory/regulatory-basis';
import { deviceFlagsFromMetadata } from '../services/pathway-engines/estar/program-device-flags';
import {
  fdaCybersecurityDocumentation,
  fdaDocumentationLevel,
  fdaSoftwareDocumentationSet,
  type FdaDocumentationLevel,
  type FdaSubmissionDocumentationItem,
} from '../services/market-specs/software-lifecycle';

const router = Router();
const log = createScopedLogger('mdx-software');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ITEM_KIND = [
  'srs', 'sds', 'arch', 'unit_test', 'integration_test', 'system_test',
  'release_note', 'anomaly_log', 'ots_list', 'sbom', 'pentest', 'threat_model',
  'risk_control', 'use_error', 'cybersecurity_label',
] as const;
const DOC_LEVEL = ['basic', 'enhanced'] as const;
const SAFETY_CLASS = ['A', 'B', 'C'] as const;
const ITEM_STATUS = ['draft', 'in_review', 'approved', 'superseded'] as const;

const listQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  kind:       z.enum(ITEM_KIND).optional(),
  status:     z.enum(ITEM_STATUS).optional(),
  limit:      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});

const createBody = z.object({
  programId:          z.string().regex(UUID_RE).optional().nullable(),
  docLevel:           z.enum(DOC_LEVEL),
  safetyClass:        z.enum(SAFETY_CLASS).optional().nullable(),
  itemKind:           z.enum(ITEM_KIND),
  title:              z.string().min(1).max(500),
  identifier:         z.string().max(120).optional().nullable(),
  status:             z.enum(ITEM_STATUS).optional(),
  evidenceArtifactId: z.number().int().positive().optional().nullable(),
  notes:              z.string().max(8000).optional().nullable(),
});

const patchBody = createBody.partial();

/* ─── GET /api/mdx/software ───────────────────────────────────────── */

router.get('/software', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: programId, kind, status, limit = 300 } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (programId) { args.push(programId); filters.push(`program_id = $${args.length}`); }
  if (kind)      { args.push(kind);      filters.push(`item_kind = $${args.length}`); }
  if (status)    { args.push(status);    filters.push(`status = $${args.length}`); }
  args.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM software_lifecycle_items
        WHERE ${filters.join(' AND ')}
        ORDER BY item_kind, identifier NULLS LAST, updated_at DESC
        LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list', err);
  }
});

/* ─── POST /api/mdx/software ──────────────────────────────────────── */

router.post('/software', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;

  try {
    const { rows } = await pool.query(
      `INSERT INTO software_lifecycle_items (
         organization_id, program_id, doc_level, safety_class, item_kind,
         title, identifier, status, evidence_artifact_id, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.docLevel, p.safetyClass ?? null,
        p.itemKind, p.title, p.identifier ?? null,
        p.status ?? 'draft', p.evidenceArtifactId ?? null, p.notes ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create', err);
  }
});

/* ─── GET /api/mdx/software/:id ───────────────────────────────────── */

router.get('/software/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  try {
    const { rows } = await pool.query(
      `SELECT * FROM software_lifecycle_items
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Software lifecycle item');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'get', err);
  }
});

/* ─── PATCH /api/mdx/software/:id ─────────────────────────────────── */

router.patch('/software/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = patchBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    programId: 'program_id', docLevel: 'doc_level', safetyClass: 'safety_class',
    itemKind: 'item_kind', title: 'title', identifier: 'identifier',
    status: 'status', evidenceArtifactId: 'evidence_artifact_id', notes: 'notes',
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
      `UPDATE software_lifecycle_items SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Software lifecycle item');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch', err);
  }
});

/* ─── GET /api/mdx/software-summary/:programId ────────────────────── */

type ItemKind = (typeof ITEM_KIND)[number];

/* Which lifecycle item kinds evidence each piece of FDA documentation. The
   documentation itself — which items FDA recommends at which level — is
   FDA_SOFTWARE_DOCUMENTATION_SET and fdaCybersecurityDocumentation
   (server/services/market-specs/software-lifecycle.ts); this table only says
   which records in this register stand for an item. An item with no entry is
   reported as `untracked`, never counted as present or dropped. This mapping
   is this register's convention, not FDA text. */
const LIFECYCLE_KINDS_FOR: Readonly<Record<string, readonly ItemKind[]>> = Object.freeze({
  srs: ['srs'],
  architecture_design_chart: ['arch'],
  system_test_protocol_report: ['system_test'],
  version_history: ['release_note'],
  unresolved_anomalies: ['anomaly_log'],
  sds: ['sds'],
  unit_integration_test_protocols_reports: ['unit_test', 'integration_test'],
  sbom: ['sbom'],
  threat_model: ['threat_model'],
  cybersecurity_testing: ['pentest'],
});

function dedupeBasis(list: RegulatoryBasis[]): RegulatoryBasis[] {
  const seen = new Set<string>();
  return list.filter((b) => (seen.has(b.ref) ? false : (seen.add(b.ref), true)));
}

/* The level is read from the items, never assumed: no items, or items filed at
   more than one level, leave it undetermined and no percentage is computed —
   a percentage against an undetermined set is a number nobody can defend.
   Superseded items are history and do not vote. */
router.get('/software-summary/:programId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 422, 'programId must be a UUID');

  const levelBasis = fdaDocumentationLevel({}).basis;

  try {
    const levelRows = await pool.query<{ doc_level: string }>(
      `SELECT DISTINCT doc_level FROM software_lifecycle_items
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
          AND status <> 'superseded'
        ORDER BY doc_level`,
      [orgId, programId],
    );
    const recordedLevels = levelRows.rows.map((r) => r.doc_level);

    if (recordedLevels.length !== 1 || !(DOC_LEVEL as readonly string[]).includes(recordedLevels[0])) {
      const reason = recordedLevels.length === 0
        ? 'No software lifecycle items are recorded for this program, so the FDA Documentation Level (Basic or Enhanced) has not been determined and no completeness is computed.'
        : recordedLevels.length > 1
          ? `Lifecycle items are recorded at more than one FDA Documentation Level (${recordedLevels.join(', ')}). The program has one level; correct the items before completeness is computed.`
          : `Lifecycle items are recorded at a documentation level FDA does not define (${recordedLevels[0]}); the level is Basic or Enhanced. Correct the items before completeness is computed.`;
      return ok(res, {
        docLevel: 'undetermined' as const,
        recordedLevels,
        reason,
        completion: null,
        completionScope: null,
        required: null,
        approved: null,
        matrix: [],
        untracked: [],
        cybersecurity: null,
        basis: levelBasis,
      });
    }
    const docLevel = recordedLevels[0] as FdaDocumentationLevel;

    const present = await pool.query<{ item_kind: string; n: number; approved: number }>(
      `SELECT item_kind, COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
         FROM software_lifecycle_items
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
        GROUP BY item_kind`,
      [orgId, programId],
    );
    const byKind = new Map(present.rows.map((r) => [r.item_kind, r]));

    /* Cyber-device status (FD&C Act §524B) comes from the program's intake
       answers, read by the one parser of them (deviceFlagsFromMetadata). */
    const programRow = await pool.query<{ metadata: unknown }>(
      `SELECT metadata FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [programId, orgId],
    );
    const flags = programRow.rows.length ? deviceFlagsFromMetadata(programRow.rows[0].metadata) : undefined;
    const cyber = fdaCybersecurityDocumentation({ cyberDevice: flags?.cyberDevice });

    const requiredItems: FdaSubmissionDocumentationItem[] = [...fdaSoftwareDocumentationSet(docLevel), ...cyber.items];
    const matrix = requiredItems.flatMap((doc) =>
      (LIFECYCLE_KINDS_FOR[doc.id] ?? []).map((kind) => ({
        kind,
        documentation: doc.id,
        title: doc.title,
        required: true,
        present:  (byKind.get(kind)?.n ?? 0) > 0,
        approved: (byKind.get(kind)?.approved ?? 0) > 0,
      })),
    );
    const untracked = requiredItems
      .filter((doc) => !LIFECYCLE_KINDS_FOR[doc.id])
      .map((doc) => ({ id: doc.id, title: doc.title }));
    const approvedCount = matrix.filter((m) => m.approved).length;

    const reason = cyber.status === 'undetermined'
      ? 'Whether the device is a cyber device (FD&C Act §524B) is not recorded on the program, so the cybersecurity documentation is not known to be required or not, and no completeness is computed.'
      : null;
    const completion = reason !== null || matrix.length === 0
      ? null
      : Math.round((approvedCount / matrix.length) * 100);

    return ok(res, {
      docLevel,
      recordedLevels,
      reason,
      completion,
      completionScope: untracked.length
        ? `Approved lifecycle records over the ${matrix.length} required records this register tracks. ` +
          `${untracked.length} recommended documents have no lifecycle item kind and are not counted: ` +
          `${untracked.map((u) => u.title).join('; ')}.`
        : `Approved lifecycle records over the ${matrix.length} required records.`,
      required:    matrix.length,
      approved:    approvedCount,
      matrix,
      untracked,
      cybersecurity: { status: cyber.status, rationale: cyber.rationale, basis: cyber.basis },
      basis: dedupeBasis([...levelBasis, ...requiredItems.flatMap((i) => i.basis)]),
    });
  } catch (err) {
    return serverError(res, log, 'summary', err);
  }
});

export default router;
