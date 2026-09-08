/**
 * NIH Biosketch service (Capability C2C-24B)
 *
 * Tenant-scoped transaction functions for authoring an NIH biosketch: create a
 * biosketch (auto-seeded with the required biosketch sections as not-addressed
 * rows), edit a section's content + addressed flag, read the biosketch with its
 * sections, score completeness, and finalize behind a deterministic completeness
 * gate. Mutations run inside the caller's transaction with the governed-action
 * ledger.
 *
 * @module server/services/biosketch/biosketch-service
 */

import { pool } from '../../db';
import {
  biosketchSectionTemplates,
  evaluateBiosketchCompleteness,
  type BiosketchCompletenessResult,
} from './biosketch-logic';
import {
  enforceAuthorLineage,
  enforceSourceAndAuthorLineage,
  type SourceAndAuthorLineageResult,
} from '../clinical-regulatory-evidence/lineage-gate';
import type { RetrievedSource } from '../clinical-regulatory-evidence/source-attribution';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class BiosketchError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'BiosketchError';
  }
}

const BIOSKETCH_TYPES = ['nih', 'nsf', 'other'];

// ─── Biosketches ───────────────────────────────────────────────────────────────

export interface BiosketchInput {
  personName: string;
  personnelId?: number | null;
  grantProposalId?: number | null;
  biosketchType?: string;
}

/** Create a biosketch and seed it with the required biosketch sections. */
export async function createBiosketchTx(client: Queryable, orgId: number, userId: number, input: BiosketchInput): Promise<{ id: number; sectionsSeeded: number }> {
  if (!input.personName || !input.personName.trim()) throw new BiosketchError('BAD_INPUT', 'A person name is required.');
  if (input.biosketchType && !BIOSKETCH_TYPES.includes(input.biosketchType)) throw new BiosketchError('BAD_INPUT', `Invalid biosketch type "${input.biosketchType}".`);
  const { rows } = await client.query(
    `INSERT INTO biosketches (organization_id, personnel_id, grant_proposal_id, person_name, biosketch_type, status, created_by)
     VALUES ($1,$2,$3,$4,$5,'draft',$6) RETURNING id`,
    [orgId, input.personnelId ?? null, input.grantProposalId ?? null, input.personName.trim(), input.biosketchType ?? 'nih', userId],
  );
  const id = Number(rows[0].id);
  const templates = biosketchSectionTemplates();
  let order = 0;
  for (const s of templates) {
    await client.query(
      `INSERT INTO biosketch_sections (organization_id, biosketch_id, section_key, title, content, addressed, order_index, created_by)
       VALUES ($1,$2,$3,$4,NULL,false,$5,$6)`,
      [orgId, id, s.sectionKey, s.title, order++, userId],
    );
  }
  return { id, sectionsSeeded: templates.length };
}

async function loadBiosketch(client: Queryable, orgId: number, biosketchId: number): Promise<{ status: string }> {
  const b = await client.query(`SELECT status FROM biosketches WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [biosketchId, orgId]);
  if (b.rows.length === 0) throw new BiosketchError('NOT_FOUND', 'Biosketch not found for this organization.');
  return { status: b.rows[0].status };
}

function assertEditable(status: string): void {
  if (status === 'final') throw new BiosketchError('INVALID_STATE', 'Biosketch is final; create a new biosketch to edit.');
}

// ─── Sections ────────────────────────────────────────────────────────────────

export async function updateSectionTx(client: Queryable, orgId: number, sectionId: number, input: { content?: string | null; addressed?: boolean; sources?: RetrievedSource[] }, actorUserId: number): Promise<SourceAndAuthorLineageResult | null> {
  const s = await client.query(
    `SELECT s.id, b.status AS bio_status, b.id AS bio_id FROM biosketch_sections s JOIN biosketches b ON b.id = s.biosketch_id
      WHERE s.id = $1 AND s.organization_id = $2 LIMIT 1`,
    [sectionId, orgId],
  );
  if (s.rows.length === 0) throw new BiosketchError('NOT_FOUND', 'Biosketch section not found for this organization.');
  assertEditable(s.rows[0].bio_status);
  await client.query(
    `UPDATE biosketch_sections SET content = COALESCE($3, content), addressed = COALESCE($4, addressed), updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [sectionId, orgId, input.content ?? null, input.addressed ?? null],
  );
  // Prose gate: when this edit sets section content, record its author lineage
  // and assert coverage in the caller's transaction. An addressed-only edit
  // (content undefined/null) no-ops the gate, matching the COALESCE.
  // With `sources` (an AnA draft naming the Data Room passages it quoted —
  // ledger L154), the clauses that quote them verbatim are recorded against
  // those sources and the rest against the author; without, every clause is
  // the author's assertion. Same gate, same transaction, either way.
  let lineage: SourceAndAuthorLineageResult | null = null;
  if (input.sources && input.sources.length > 0 && typeof input.content === 'string') {
    lineage = await enforceSourceAndAuthorLineage(client, orgId, { documentTable: 'biosketch_sections', documentId: String(sectionId) }, input.content, String(actorUserId), input.sources);
  } else {
    await enforceAuthorLineage(client, orgId, { documentTable: 'biosketch_sections', documentId: String(sectionId) }, input.content ?? null, String(actorUserId));
  }
  await client.query(`UPDATE biosketches SET status = CASE WHEN status = 'draft' THEN 'in_development' ELSE status END, updated_at = now() WHERE id = $1 AND organization_id = $2`, [s.rows[0].bio_id, orgId]);
  return lineage;
}

// ─── Completeness + finalize ─────────────────────────────────────────────────

async function completenessInputFor(orgId: number, biosketchId: number) {
  const { rows } = await pool.query(
    `SELECT section_key, content, addressed FROM biosketch_sections WHERE biosketch_id = $1 AND organization_id = $2`,
    [biosketchId, orgId],
  );
  return rows.map((r) => ({ sectionKey: r.section_key, required: true, addressed: r.addressed, content: r.content }));
}

/** Read-only completeness assessment (uses the pure evaluateBiosketchCompleteness). */
export async function getCompleteness(orgId: number, biosketchId: number): Promise<BiosketchCompletenessResult> {
  await loadBiosketch(pool, orgId, biosketchId);
  return evaluateBiosketchCompleteness(await completenessInputFor(orgId, biosketchId));
}

/** Finalize — gated on the deterministic completeness check. */
export async function finalizeBiosketchTx(client: Queryable, orgId: number, userId: number, biosketchId: number): Promise<{ finalized: true; completeness: BiosketchCompletenessResult }> {
  const bio = await loadBiosketch(client, orgId, biosketchId);
  if (bio.status === 'final') throw new BiosketchError('INVALID_STATE', 'Biosketch is already final.');
  const sections = await client.query(`SELECT section_key, content, addressed FROM biosketch_sections WHERE biosketch_id = $1 AND organization_id = $2`, [biosketchId, orgId]);
  const completeness = evaluateBiosketchCompleteness(sections.rows.map((r) => ({ sectionKey: r.section_key, required: true, addressed: r.addressed, content: r.content })));
  if (!completeness.readyToFinalize) {
    throw new BiosketchError('INVALID_STATE', `Cannot finalize — ${completeness.findings.filter((f) => f.severity === 'critical').map((f) => f.message).join(' ')}`);
  }
  await client.query(`UPDATE biosketches SET status = 'final', finalized_by = $3, finalized_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2`, [biosketchId, orgId, userId]);
  return { finalized: true, completeness };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listBiosketches(orgId: number, opts?: { personnelId?: number; grantProposalId?: number }): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, personnel_id, grant_proposal_id, person_name, biosketch_type, status, finalized_at, created_at, updated_at
               FROM biosketches WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (opts?.personnelId != null) { params.push(opts.personnelId); sql += ` AND personnel_id = $${params.length}`; }
  if (opts?.grantProposalId != null) { params.push(opts.grantProposalId); sql += ` AND grant_proposal_id = $${params.length}`; }
  sql += ` ORDER BY updated_at DESC, id DESC`;
  return (await pool.query(sql, params)).rows;
}

export async function getBiosketch(orgId: number, biosketchId: number): Promise<any | null> {
  const b = await pool.query(`SELECT * FROM biosketches WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [biosketchId, orgId]);
  if (b.rows.length === 0) return null;
  const sections = await pool.query(
    `SELECT id, section_key, title, content, addressed, order_index FROM biosketch_sections WHERE biosketch_id = $1 AND organization_id = $2 ORDER BY order_index, id`,
    [biosketchId, orgId],
  );
  return { ...b.rows[0], sections: sections.rows };
}
