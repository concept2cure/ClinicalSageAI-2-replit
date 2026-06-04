/**
 * Regulatory commitments service.
 *
 * A commitment is a Claim with a deadline + owner + provenance — the binding
 * obligations between the company and a health authority, inbound (PMR/PMC,
 * Annex II / specific obligations / PASS / PAES, REMS, PMA conditions, 522
 * studies) and outbound (self-made promises in the company's own submissions).
 *
 * This service extracts commitments source-anchored from unstructured documents
 * (via the governed AI gateway), structures them, and persists them for
 * tracking. It reuses the platform spine: gateway extraction, the audit/
 * provenance chain, and (via the routes) tasking + governed status changes.
 *
 * @module server/services/commitments/commitments-service
 */

import { randomUUID } from 'crypto';
import { pool } from '../../db.js';
import { getGateway } from '../ai-gateway/gateway.js';
import { citationCoverage } from '../ai-governance/groundedness.js';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('commitments-service');

export type CommitmentDirection = 'inbound' | 'outbound';

export type CommitmentType =
  | 'PMR' | 'PMC' // FDA post-marketing requirement / commitment
  | 'REMS'
  | 'annex_ii' | 'specific_obligation' | 'PASS' | 'PAES' // EU PAMs
  | 'pma_condition' | '522_study' // devices
  | 'self_commitment' // outbound
  | 'other';

export type CommitmentStatus =
  | 'proposed' | 'open' | 'in_progress' | 'met' | 'overdue' | 'at_risk' | 'waived' | 'withdrawn';

export interface ExtractedCommitment {
  direction: CommitmentDirection;
  commitmentType: CommitmentType;
  authority?: string | null;
  title: string;
  description?: string | null;
  sourceQuote?: string | null;
  sourceLocator?: string | null;
  owner?: string | null;
  dueDateText?: string | null;
  /** 0..1 — how well the commitment is anchored to a verbatim source span. */
  groundedness: number;
}

const VALID_TYPES = new Set<CommitmentType>([
  'PMR', 'PMC', 'REMS', 'annex_ii', 'specific_obligation', 'PASS', 'PAES',
  'pma_condition', '522_study', 'self_commitment', 'other',
]);

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────

export function normalizeDirection(v: unknown): CommitmentDirection {
  return v === 'outbound' ? 'outbound' : 'inbound';
}

export function normalizeType(v: unknown): CommitmentType {
  const s = String(v ?? '').trim();
  return VALID_TYPES.has(s as CommitmentType) ? (s as CommitmentType) : 'other';
}

/**
 * Groundedness of a single commitment: a commitment with a verbatim source span
 * is well-grounded; one with no anchoring quote is not. A missed/wrong
 * commitment is pure liability, so extraction without a source span is suspect.
 */
export function commitmentGroundedness(sourceQuote: unknown): number {
  const q = typeof sourceQuote === 'string' ? sourceQuote.trim() : '';
  if (q.length < 12) return 0.2;
  // A commitment span should read like a claim sentence; reuse citation logic
  // lightly — long verbatim spans score high, terse ones moderate.
  const cov = citationCoverage(q).coverage;
  if (cov !== null && cov > 0) return Math.min(1, 0.7 + cov * 0.3);
  return q.length >= 40 ? 0.8 : 0.6;
}

/** Parse the model's JSON output into structured commitments. Never throws. */
export function parseCommitmentsJson(raw: string): ExtractedCommitment[] {
  if (!raw) return [];
  // Strip code fences and any prose around the JSON.
  let text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => {
      const sourceQuote = typeof r.sourceQuote === 'string' ? r.sourceQuote : null;
      const title = String(r.title ?? '').trim();
      return {
        direction: normalizeDirection(r.direction),
        commitmentType: normalizeType(r.commitmentType ?? r.type),
        authority: typeof r.authority === 'string' ? r.authority : null,
        title,
        description: typeof r.description === 'string' ? r.description : null,
        sourceQuote,
        sourceLocator: typeof r.sourceLocator === 'string' ? r.sourceLocator : null,
        owner: typeof r.owner === 'string' ? r.owner : null,
        dueDateText: typeof r.dueDateText === 'string' ? r.dueDateText : null,
        groundedness: commitmentGroundedness(sourceQuote),
      };
    })
    .filter((c) => c.title.length > 0);
}

export interface CommitmentClock {
  dueDate: string | null;
  daysRemaining: number | null;
  overdue: boolean;
  dueSoon: boolean;
  status: 'none' | 'on_track' | 'due_soon' | 'overdue';
}

/** Pure due-date clock for a commitment. */
export function commitmentClock(
  dueDate: Date | string | null | undefined,
  now: Date = new Date(),
  dueSoonDays = 30,
): CommitmentClock {
  if (!dueDate) return { dueDate: null, daysRemaining: null, overdue: false, dueSoon: false, status: 'none' };
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return { dueDate: null, daysRemaining: null, overdue: false, dueSoon: false, status: 'none' };
  }
  const daysRemaining = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  const overdue = daysRemaining < 0;
  const dueSoon = !overdue && daysRemaining <= dueSoonDays;
  return {
    dueDate: due.toISOString(),
    daysRemaining,
    overdue,
    dueSoon,
    status: overdue ? 'overdue' : dueSoon ? 'due_soon' : 'on_track',
  };
}

// ── Extraction (governed AI gateway) ──────────────────────────────────────────

const EXTRACTION_SYSTEM = `You extract regulatory commitments from documents for a pharmacovigilance/regulatory team.
A commitment is a binding obligation between a company and a health authority, in two directions:
- inbound (authority -> company): PMR, PMC, REMS elements, EU Annex II conditions / specific obligations / PASS / PAES, PMA conditions of approval, 522 postmarket studies.
- outbound (company -> authority): self-made promises in the company's own submissions/responses ("the applicant commits to…", "data will be provided…", "we will conduct…").
Extract EVERY commitment. For each, return a JSON object with:
  direction ("inbound"|"outbound"), commitmentType (PMR|PMC|REMS|annex_ii|specific_obligation|PASS|PAES|pma_condition|522_study|self_commitment|other),
  authority (FDA|EMA|PMDA|other or null), title (short), description, sourceQuote (the EXACT verbatim sentence(s) asserting it), sourceLocator (page/section if visible), owner (if named), dueDateText (the raw deadline phrase, or null).
Return ONLY a JSON array. Do not invent commitments; every item MUST have a verbatim sourceQuote copied from the text.`;

export async function extractCommitments(
  documentText: string,
  opts: { documentId?: string; callerModule?: string } = {},
): Promise<ExtractedCommitment[]> {
  if (!documentText || documentText.trim().length < 20) return [];
  try {
    const gateway = getGateway();
    const response = await gateway.route({
      taskType: 'structured_output',
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM },
        { role: 'user', content: `Document:\n\n${documentText.slice(0, 120_000)}` },
      ],
      jsonMode: true,
      temperature: 0,
      maxTokens: 4000,
      callerModule: opts.callerModule ?? 'commitments-extract',
      metadata: { promptVersion: 'commitments-extract-v1', documentId: opts.documentId },
    });
    return parseCommitmentsJson(response.content);
  } catch (error: any) {
    logger.warn(`Commitment extraction unavailable: ${error?.message}`);
    return [];
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

export interface CommitmentRow extends ExtractedCommitment {
  id: string;
  organizationId: number;
  projectId: number | null;
  sourceDocumentId: string | null;
  status: CommitmentStatus;
  linkedTaskId: string | null;
  extractedBy: 'ana' | 'human';
  needsReview: boolean;
  clock: CommitmentClock;
}

export async function createCommitment(input: {
  organizationId: number;
  projectId?: number | null;
  createdBy?: number | null;
  extractedBy?: 'ana' | 'human';
  commitment: ExtractedCommitment & { sourceDocumentId?: string | null; dueDate?: string | null };
}): Promise<{ id: string }> {
  if (!pool) throw new Error('COMMITMENTS_DB_UNAVAILABLE');
  const id = `cmt_${randomUUID().replace(/-/g, '')}`;
  const c = input.commitment;
  const extractedBy = input.extractedBy ?? 'human';
  try {
    await pool.query(
      `INSERT INTO c2c_commitments
         (id, organization_id, project_id, direction, commitment_type, authority,
          title, description, source_document_id, source_quote, source_locator,
          owner, due_date, due_date_text, status, extracted_by, groundedness,
          needs_review, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        id, input.organizationId, input.projectId ?? null, c.direction, c.commitmentType,
        c.authority ?? null, c.title, c.description ?? null, c.sourceDocumentId ?? null,
        c.sourceQuote ?? null, c.sourceLocator ?? null, c.owner ?? null, c.dueDate ?? null,
        c.dueDateText ?? null, 'proposed', extractedBy, c.groundedness,
        extractedBy === 'ana', input.createdBy ?? null,
      ],
    );
    return { id };
  } catch (error: any) {
    if (error?.code === '42P01') throw new Error('COMMITMENTS_TABLE_MISSING');
    throw error;
  }
}

export async function listCommitments(
  organizationId: number,
  filters: { projectId?: number; direction?: CommitmentDirection; status?: CommitmentStatus } = {},
): Promise<CommitmentRow[]> {
  if (!pool) return [];
  const conditions = ['organization_id = $1'];
  const params: any[] = [organizationId];
  let i = 2;
  if (filters.projectId !== undefined) { conditions.push(`project_id = $${i++}`); params.push(filters.projectId); }
  if (filters.direction) { conditions.push(`direction = $${i++}`); params.push(filters.direction); }
  if (filters.status) { conditions.push(`status = $${i++}`); params.push(filters.status); }
  try {
    const res = await pool.query(
      `SELECT * FROM c2c_commitments WHERE ${conditions.join(' AND ')} ORDER BY due_date ASC NULLS LAST, created_at DESC`,
      params,
    );
    return res.rows.map(mapRow);
  } catch (error: any) {
    if (error?.code === '42P01') return [];
    throw error;
  }
}

export async function updateCommitmentStatus(
  organizationId: number,
  id: string,
  status: CommitmentStatus,
  opts: { clearReview?: boolean; linkedTaskId?: string } = {},
): Promise<CommitmentRow | null> {
  if (!pool) throw new Error('COMMITMENTS_DB_UNAVAILABLE');
  try {
    const res = await pool.query(
      `UPDATE c2c_commitments
          SET status = $1, updated_at = now(),
              needs_review = CASE WHEN $2::boolean THEN FALSE ELSE needs_review END,
              linked_task_id = COALESCE($3, linked_task_id)
        WHERE id = $4 AND organization_id = $5
        RETURNING *`,
      [status, opts.clearReview ?? false, opts.linkedTaskId ?? null, id, organizationId],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  } catch (error: any) {
    if (error?.code === '42P01') throw new Error('COMMITMENTS_TABLE_MISSING');
    throw error;
  }
}

function mapRow(row: any): CommitmentRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id ?? null,
    direction: row.direction,
    commitmentType: row.commitment_type,
    authority: row.authority ?? null,
    title: row.title,
    description: row.description ?? null,
    sourceDocumentId: row.source_document_id ?? null,
    sourceQuote: row.source_quote ?? null,
    sourceLocator: row.source_locator ?? null,
    owner: row.owner ?? null,
    dueDateText: row.due_date_text ?? null,
    groundedness: row.groundedness ?? 0,
    status: row.status,
    linkedTaskId: row.linked_task_id ?? null,
    extractedBy: row.extracted_by,
    needsReview: row.needs_review,
    clock: commitmentClock(row.due_date),
  };
}
