/**
 * Scaffold a project's first regulatory document from its rule pack.
 *
 * ── The defect this closes ────────────────────────────────────────────────────
 * NOTHING IN THE PRODUCT CREATES A DOCUMENT. `INSERT INTO c2c_documents` appears
 * exactly four times in the repository, all four inside
 * migrations/20260529_phase9_backfill.sql — a one-time conversion of legacy
 * 510(k)/CER/PMA records. There is no Drizzle `insert(c2cDocuments)` anywhere in
 * server/, and no `POST /api/c2c/documents` route: the c2c documents router
 * exposes GET and PATCH only.
 *
 * So `POST /api/c2c/projects` wrote one `regulatory_programs` row and stopped.
 * Every project a customer created had an empty Vault, empty workstreams and
 * empty drafts, and the UI rendered those as legitimate "nothing here yet"
 * states.
 *
 * Meanwhile the material was already sitting in the database. Migration
 * 20260528_phase9_document_schema.sql seeds `c2c_rule_packs` with 13 packs and
 * 115 ordered sections (ind/fda alone carries 24), and 20260529 adds five more
 * — 18 packs in total. Every one of them unread by any code path.
 *
 * ── Design constraints that are NOT negotiable ────────────────────────────────
 *
 * 1. SCAFFOLD BY INSERT, NEVER BY UPDATE. `c2c_document_sections` carries a
 *    BEFORE UPDATE trigger, `c2c_snapshot_section_version()`, which RAISES
 *    unless `app.actor_id` is set — Part 11 attribution. It fires only on
 *    UPDATE, and only when content changes. An insert-only scaffold never trips
 *    it, which is why this module issues no UPDATE at all.
 *
 * 2. THE CALLER OWNS THE TRANSACTION. This function takes a PoolClient and
 *    never opens or commits one. The whole point is that the program row and
 *    its document land together or not at all — a separate transaction would
 *    reproduce the original bug (a project with no document) on any failure
 *    between them.
 *
 * 3. FAIL CLOSED ON AN UNMAPPED PROGRAM TYPE. `VALID_PROGRAM_TYPES` accepts
 *    ivd, device, ide, biologic and anda, none of which has a `doc_type` CHECK
 *    value or a rule pack. Guessing a near-miss doc_type would either violate
 *    the CHECK or file the wrong document class. Skipping loudly is correct;
 *    the reason is returned so the route can surface it.
 *
 * 4. THE COMPOSITE FK IS THE SAFETY NET. `c2c_documents` has
 *    FOREIGN KEY (doc_type, agency, rule_pack_version)
 *      REFERENCES c2c_rule_packs (doc_type, agency, version).
 *    So a document cannot exist without a pack that defines it. The version is
 *    always read from a resolved pack row and never invented.
 *
 * ── What it deliberately does NOT do ──────────────────────────────────────────
 * Every section lands `status = 'todo'` with `content = '{}'`. Nothing is
 * drafted, nothing is claimed complete, and `has_content` reads false
 * everywhere. `/drafts` filters `status <> 'todo'` and will therefore still show
 * nothing — correctly. A scaffolded outline is not a draft, and presenting it as
 * one would be the same fabrication this codebase has been removing.
 */

import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { recordGovernedAction } from '../../routes/c2c/actions.js';
// The regulatory-class mapping lives in one module so this path and
// POST /api/authoring/docs cannot disagree about what a project files.
import { AGENCY_FALLBACKS, resolveDocumentClass, describeUnmappedClass } from './document-class.js';

export interface ScaffoldInput {
  /** Caller-owned transaction. This module never opens or commits one. */
  client: PoolClient;
  orgId: number;
  userId: number | null;
  /** regulatory_programs.id (uuid) */
  projectId: string;
  /** Already lowercased/underscored by the route (projects.ts). */
  programType: string;
  /** As the wizard sends it — 'FDA', 'EMA', 'Health_Canada', … */
  primaryAgency: string;
  productName: string;
}

export type ScaffoldSkip = 'UNMAPPED_PROGRAM_TYPE' | 'NO_RULE_PACK' | 'ALREADY_SCAFFOLDED';

export interface ScaffoldResult {
  documentId: string | null;
  sectionCount: number;
  skipped?: ScaffoldSkip;
  /** Human-readable reason, surfaced in the 201 body so a skip is never silent. */
  detail?: string;
}

interface RulePackRow {
  version: string;
  label: string;
  required_sections: unknown;
}

export async function scaffoldProjectDocuments(input: ScaffoldInput): Promise<ScaffoldResult> {
  const { client, orgId, userId, projectId, programType, primaryAgency, productName } = input;

  const klass = resolveDocumentClass(programType, primaryAgency);
  if (!klass) {
    return {
      documentId: null, sectionCount: 0, skipped: 'UNMAPPED_PROGRAM_TYPE',
      detail: `${describeUnmappedClass(programType, primaryAgency)} ` +
              `The project was created; no document was scaffolded.`,
    };
  }
  const { docType, agency } = klass;

  // Idempotency. A project that already has a document is never re-scaffolded —
  // a second outline would compete with whatever the first one has become.
  //
  // `rows.length`, never `rowCount`: `rowCount` is a node-postgres field. PGlite
  // — which the contract test uses to run this service against a real Postgres
  // with the real constraints — reports `affectedRows` and leaves `rowCount`
  // undefined. A guard written as `if (existing.rowCount)` is therefore silently
  // dead on any driver but one, and `undefined` is falsy, so it fails OPEN: it
  // would scaffold a second competing outline rather than skip. `rows` is
  // populated identically by both.
  const existing = await client.query(
    `SELECT 1 FROM c2c_documents WHERE project_id = $1 AND org_id = $2 LIMIT 1`,
    [projectId, orgId],
  );
  if (existing.rows.length > 0) {
    return { documentId: null, sectionCount: 0, skipped: 'ALREADY_SCAFFOLDED' };
  }

  // Resolve the pack. Its `version` is what satisfies the composite FK, so it is
  // always read from a real row — never constructed.
  let pack: RulePackRow | undefined;
  let resolvedAgency = agency;
  for (const candidate of [agency, ...AGENCY_FALLBACKS]) {
    const { rows } = await client.query<RulePackRow>(
      `SELECT version, label, required_sections
         FROM c2c_rule_packs
        WHERE doc_type = $1 AND agency = $2 AND superseded_by IS NULL
        ORDER BY effective_from DESC
        LIMIT 1`,
      [docType, candidate],
    );
    if (rows[0]) { pack = rows[0]; resolvedAgency = candidate; break; }
  }
  if (!pack) {
    return {
      documentId: null, sectionCount: 0, skipped: 'NO_RULE_PACK',
      detail: `No rule pack defines '${docType}' for '${agency}' (or any fallback). ` +
              `The project was created; no document was scaffolded.`,
    };
  }

  // `doc_` rather than the backfill's `doc_rp_` prefix, so the two id namespaces
  // stay disjoint and a backfill re-run cannot collide with a scaffolded row.
  const documentId = `doc_${randomUUID().replace(/-/g, '')}`;
  const title = productName ? `${productName} — ${pack.label}` : pack.label;

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO c2c_documents
       (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness, owner_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', 0, $8)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [documentId, orgId, projectId, docType, resolvedAgency, pack.version, title, userId],
  );
  if (!inserted.rows[0]) {
    return { documentId: null, sectionCount: 0, skipped: 'ALREADY_SCAFFOLDED' };
  }

  // One statement for the whole outline — 115 sections would otherwise be 115
  // round trips. jsonb_to_recordset does the shaping server-side.
  //
  // draft_source = 'template' is the value the schema comment reserves for
  // exactly this, and which the PATCH route explicitly refuses to accept from a
  // client (it allows only 'human' | 'ana'). So a scaffolded section is
  // distinguishable from an authored one for the life of the record.
  //
  // RETURNING, so the count comes from `rows.length` rather than `rowCount` —
  // same reason as the idempotency guard above. Here the failure mode is a lie
  // rather than a duplicate: `rowCount ?? 0` reports "0 sections scaffolded" for
  // an outline that landed 24 rows, and that number is written into the audit
  // payload and the 201 body. RETURNING counts only rows actually inserted, so
  // ON CONFLICT skips are excluded exactly as rowCount would have excluded them.
  const sections = await client.query<{ section_key: string }>(
    `INSERT INTO c2c_document_sections
       (document_id, section_key, parent_key, label, path_order, mandatory,
        status, content, draft_source, version)
     SELECT $1, s.key, s.parent_key, s.label,
            COALESCE(s.path_order, 0), COALESCE(s.mandatory, false),
            'todo', '{}'::jsonb, 'template', 1
       FROM jsonb_to_recordset($2::jsonb)
            AS s(key text, parent_key text, label text,
                 mandatory boolean, path_order integer)
      WHERE s.key IS NOT NULL AND s.label IS NOT NULL
     ON CONFLICT (document_id, section_key) DO NOTHING
     RETURNING section_key`,
    [documentId, JSON.stringify(pack.required_sections ?? [])],
  );
  const sectionCount = sections.rows.length;

  await recordGovernedAction(client, {
    orgId,
    userId: userId ?? 0,
    command: 'transition',
    target: `document:${documentId}`,
    reason: 'Project created — document scaffolded from rule pack',
    payload: {
      projectId, docType, agency: resolvedAgency,
      rulePackVersion: pack.version, sectionCount,
    },
    domain: 'documents',
    surface: 'api',
  });

  return { documentId, sectionCount };
}
