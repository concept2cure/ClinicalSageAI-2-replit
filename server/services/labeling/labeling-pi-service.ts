/**
 * Labeling / prescribing-information service — the REAL write + read path over
 * `labeling_pi_sections` (migration 20260801_labeling_pi_store.sql).
 *
 * This is what makes the v2 LabelingPi surface real rather than demo-ware: a
 * live tenant records/authors USPI sections (upsertLabelingPiSection, via POST
 * /api/labeling-pi), they persist here org-scoped and soft-delete aware, and
 * GET /api/labeling-pi reads them back shaped to the surface's render contract
 * ({ n, label, st, flag, content, negotiation }) — no seed-only blob, no
 * fixture.
 *
 * One LIVE row per (organization_id, section_no) — the surface renders the
 * org's single label worklist, so the write is an UPSERT on that natural key
 * (backed by the partial unique index uq_labeling_pi_sections_org_section).
 * The list read derives USPI document order (HL, BW, then numeric) from the
 * section number itself — 21 CFR 201.56/201.57 fixes that order, so no stored
 * sequence column is needed.
 *
 * Raw-SQL + tenant-scoped, mirroring cmc/cmc-change-control-service.ts and
 * reg-change/reg-change-service.ts. The route layer writes the Part 11 audit
 * entry.
 *
 * @module server/services/labeling/labeling-pi-service
 */
import { pool } from '../../db';
import { enforceAuthorLineage } from '../clinical-regulatory-evidence/lineage-gate';

// Runtime validation sets for the display classifiers the surface keys off:
// `status` drives the section tree's state dot + stage styling (data-st) and
// `flag` drives the "FDA proposed an edit" marker + the "Open agency edits"
// KPI (flag === 'agency').
export const LABELING_SECTION_STATUSES = ['draft', 'review', 'negotiation', 'approved', 'na'] as const;
export const LABELING_SECTION_FLAGS = ['agency'] as const;

// Section numbers are the USPI catalog: 'HL' (highlights), 'BW' (boxed
// warning), or a numbered section ('1'..'17', dotted subsections allowed).
// Validated so the derived document order below stays total.
const SECTION_NO_RE = /^(HL|BW|[0-9][0-9.]*)$/;

export class LabelingPiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LabelingPiValidationError';
  }
}

/** The rendered label text for one section (rehydrates from JSONB). */
export interface LabelingPiContent {
  heading: string;
  body: string[];
  hl?: boolean;
  warn?: boolean;
}

/** The end-of-cycle agency negotiation on one section (rehydrates from JSONB). */
export interface LabelingPiNegotiation {
  round: string;
  cycle: string;
  sponsor: string;
  agency: string;
  rationale: string;
}

/** The stored row with identity/audit. `section_no`/`status` rehydrate as `n`/`st` at the route. */
export interface LabelingPiSectionRow {
  id: string;
  organization_id: number;
  section_no: string;
  label: string;
  status: string;
  flag: string | null;
  program: string | null;
  content: LabelingPiContent | null;
  negotiation: LabelingPiNegotiation | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertLabelingPiSectionInput {
  sectionNo: string;
  label: string;
  status?: string | null;
  flag?: string | null;
  program?: string | null;
  content?: unknown;
  negotiation?: unknown;
  createdBy?: number | null;
}

const SELECT_COLS = `id, organization_id, section_no, label, status, flag, program,
  content, negotiation, created_by, created_at, updated_at`;

// USPI document order, derived from the section number: HL first, BW second,
// then numeric ascending ('2' before '10'), dotted subsections after their
// parent ('8' before '8.4').
const DOC_ORDER = `
  CASE section_no WHEN 'HL' THEN 0 WHEN 'BW' THEN 1 ELSE 2 END,
  CASE WHEN section_no ~ '^[0-9]' THEN substring(section_no from '^[0-9]+')::int END NULLS LAST,
  section_no`;

/**
 * Normalize the rendered label text. Absent → null; anything that is not a
 * { heading, body[] } object of strings is rejected — the surface renders
 * content.heading and maps content.body unconditionally when present, so a
 * malformed payload must never persist.
 */
function normalizeContent(raw: unknown): LabelingPiContent | null {
  if (raw === undefined || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (typeof raw !== 'object' || Array.isArray(raw) || typeof c.heading !== 'string' || c.heading.trim() === '') {
    throw new LabelingPiValidationError('content must be an object with a non-empty string heading.');
  }
  if (!Array.isArray(c.body) || !c.body.every((p) => typeof p === 'string')) {
    throw new LabelingPiValidationError('content.body must be an array of strings.');
  }
  const out: LabelingPiContent = { heading: c.heading, body: c.body as string[] };
  if (c.hl === true) out.hl = true;
  if (c.warn === true) out.warn = true;
  return out;
}

/**
 * Normalize the agency negotiation. Absent → null; when present it must carry
 * all five string fields the surface's redline panel renders (round, cycle,
 * sponsor, agency, rationale).
 */
function normalizeNegotiation(raw: unknown): LabelingPiNegotiation | null {
  if (raw === undefined || raw === null) return null;
  const n = raw as Record<string, unknown>;
  const fields = ['round', 'cycle', 'sponsor', 'agency', 'rationale'] as const;
  if (typeof raw !== 'object' || Array.isArray(raw) || !fields.every((f) => typeof n[f] === 'string' && (n[f] as string).trim() !== '')) {
    throw new LabelingPiValidationError('negotiation must carry non-empty string round, cycle, sponsor, agency, and rationale fields.');
  }
  return { round: n.round as string, cycle: n.cycle as string, sponsor: n.sponsor as string, agency: n.agency as string, rationale: n.rationale as string };
}

/**
 * Record/author a label section (create or update — one live row per org +
 * section number). Validates the section number, label, and the status/flag
 * vocab the surface keys off. On update, `created_by`/`created_at` keep the
 * original recorder; `updated_at` bumps.
 */
export async function upsertLabelingPiSection(orgId: number, input: UpsertLabelingPiSectionInput): Promise<LabelingPiSectionRow> {
  if (!input.sectionNo || !SECTION_NO_RE.test(input.sectionNo)) {
    throw new LabelingPiValidationError("sectionNo must be 'HL', 'BW', or a numbered USPI section ('1'..'17', dotted subsections allowed).");
  }
  if (!input.label || input.label.trim() === '') {
    throw new LabelingPiValidationError('label is required.');
  }
  const status = input.status ?? 'draft';
  if (!(LABELING_SECTION_STATUSES as readonly string[]).includes(status)) {
    throw new LabelingPiValidationError(`status must be one of: ${LABELING_SECTION_STATUSES.join(', ')}.`);
  }
  if (input.flag != null && !(LABELING_SECTION_FLAGS as readonly string[]).includes(input.flag)) {
    throw new LabelingPiValidationError(`flag must be one of: ${LABELING_SECTION_FLAGS.join(', ')} (or null).`);
  }
  const content = normalizeContent(input.content);
  const negotiation = normalizeNegotiation(input.negotiation);
  // Canonical rendered text for lineage: heading + body paragraphs — exactly
  // what the USPI surface renders (hl/warn are display flags, not prose). The
  // JSONB is structured, so we derive the flat text the gate detects spans over.
  const canonicalText = content === null ? null : [content.heading, ...content.body].join('\n\n');
  const actor = String(input.createdBy ?? 'system');

  // The label section text and its author lineage commit together in one
  // transaction (same gate as authoring/protocol/biosketch/q-sub), or roll back
  // together — a label section is never persisted without provenance.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<LabelingPiSectionRow>(
      `INSERT INTO labeling_pi_sections (
         organization_id, section_no, label, status, flag, program, content, negotiation, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
       ON CONFLICT (organization_id, section_no) WHERE deleted_at IS NULL
       DO UPDATE SET
         label = EXCLUDED.label,
         status = EXCLUDED.status,
         flag = EXCLUDED.flag,
         program = EXCLUDED.program,
         content = EXCLUDED.content,
         negotiation = EXCLUDED.negotiation,
         updated_at = now()
       RETURNING ${SELECT_COLS}`,
      [
        orgId, input.sectionNo, input.label, status, input.flag ?? null, input.program ?? null,
        content === null ? null : JSON.stringify(content),
        negotiation === null ? null : JSON.stringify(negotiation),
        input.createdBy ?? null,
      ],
    );
    await enforceAuthorLineage(
      client,
      orgId,
      { documentTable: 'labeling_pi_sections', documentId: String(rows[0].id) },
      canonicalText,
      actor,
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Raised when an accept is asked for on a section that has nothing to accept. */
export class LabelingPiConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LabelingPiConflictError';
  }
}

export interface AcceptAgencyTextResult {
  row: LabelingPiSectionRow;
  /** The section content as it stood before the accept — kept for the audit entry. */
  previousContent: LabelingPiContent | null;
}

/**
 * Adopt the agency's proposed wording for a section — the governed end of the
 * end-of-cycle labeling negotiation.
 *
 * This is a Part 11 record change, not a UI state flip: the sponsor's text is
 * replaced by the text the agency proposed, the section moves to `approved`,
 * the "FDA proposed an edit" flag clears, and the WHOLE negotiation is kept on
 * the row so the redline that produced the change stays readable afterwards.
 * The prior content is returned so the route can write it into the audit entry
 * — the reviewer question after an accept is always "what did it say before".
 *
 * Fails closed. A section with no stored negotiation has no agency text to
 * adopt, so accepting is refused rather than silently approving the sponsor's
 * own draft under a label that claims the agency wrote it.
 *
 * `reason` is the 21 CFR 11.10(e) reason-for-change; the route requires it and
 * carries it into the audit trail.
 */
export async function acceptAgencyText(
  orgId: number,
  sectionNo: string,
  opts: { userId?: number | null },
): Promise<AcceptAgencyTextResult> {
  if (!sectionNo || !SECTION_NO_RE.test(sectionNo)) {
    throw new LabelingPiValidationError("sectionNo must be 'HL', 'BW', or a numbered USPI section ('1'..'17', dotted subsections allowed).");
  }
  const actor = String(opts.userId ?? 'system');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the row for the life of the accept so two reviewers cannot both
    // adopt against the same pre-image and have one of them silently win.
    const { rows: found } = await client.query<LabelingPiSectionRow>(
      `SELECT ${SELECT_COLS} FROM labeling_pi_sections
        WHERE organization_id = $1 AND section_no = $2 AND deleted_at IS NULL
        FOR UPDATE`,
      [orgId, sectionNo],
    );
    const current = found[0];
    if (!current) {
      await client.query('ROLLBACK');
      throw new LabelingPiConflictError(`No label section ${sectionNo} in this organization.`);
    }
    const negotiation = current.negotiation;
    if (!negotiation || typeof negotiation.agency !== 'string' || negotiation.agency.trim() === '') {
      await client.query('ROLLBACK');
      throw new LabelingPiConflictError(
        `Section ${sectionNo} has no agency-proposed text on record, so there is nothing to accept.`,
      );
    }

    const previousContent = current.content;
    // The accepted text becomes the section's content. The heading is the
    // section's own — the agency proposes wording, not a new section title —
    // and the hl/warn display flags carry over untouched.
    const nextContent: LabelingPiContent = {
      heading: previousContent?.heading ?? `${current.section_no}  ${current.label}`,
      body: [negotiation.agency],
    };
    if (previousContent?.hl) nextContent.hl = true;
    if (previousContent?.warn) nextContent.warn = true;

    const { rows } = await client.query<LabelingPiSectionRow>(
      `UPDATE labeling_pi_sections
          SET content = $3::jsonb, status = 'approved', flag = NULL, updated_at = now()
        WHERE organization_id = $1 AND section_no = $2 AND deleted_at IS NULL
        RETURNING ${SELECT_COLS}`,
      [orgId, sectionNo, JSON.stringify(nextContent)],
    );

    // Re-attribute the section's clauses to whoever performed the accept —
    // the adopted words are now theirs to answer for, not the prior author's.
    await enforceAuthorLineage(
      client,
      orgId,
      { documentTable: 'labeling_pi_sections', documentId: String(rows[0].id) },
      [nextContent.heading, ...nextContent.body].join('\n\n'),
      actor,
    );
    await client.query('COMMIT');
    return { row: rows[0], previousContent };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * List the org's label sections in USPI document order (HL, BW, then numeric;
 * soft-deleted excluded).
 */
export async function listLabelingPiSections(orgId: number): Promise<LabelingPiSectionRow[]> {
  const { rows } = await pool.query<LabelingPiSectionRow>(
    `SELECT ${SELECT_COLS} FROM labeling_pi_sections
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY ${DOC_ORDER}`,
    [orgId],
  );
  return rows;
}

/** Get one label section by its section number (tenant-scoped). */
export async function getLabelingPiSection(orgId: number, sectionNo: string): Promise<LabelingPiSectionRow | null> {
  const { rows } = await pool.query<LabelingPiSectionRow>(
    `SELECT ${SELECT_COLS} FROM labeling_pi_sections
      WHERE organization_id = $1 AND section_no = $2 AND deleted_at IS NULL`,
    [orgId, sectionNo],
  );
  return rows[0] ?? null;
}

/** Soft-delete a label section (keeps the row for the audit trail). */
export async function deleteLabelingPiSection(orgId: number, sectionNo: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE labeling_pi_sections SET deleted_at = now(), updated_at = now()
      WHERE organization_id = $1 AND section_no = $2 AND deleted_at IS NULL`,
    [orgId, sectionNo],
  );
  return (rowCount ?? 0) > 0;
}
