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

export async function getCommitmentById(organizationId: number, id: string): Promise<CommitmentRow | null> {
  if (!pool) return null;
  try {
    const res = await pool.query(
      `SELECT * FROM c2c_commitments WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [id, organizationId],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  } catch (error: any) {
    if (error?.code === '42P01') return null;
    throw error;
  }
}

export async function linkCommitmentTask(organizationId: number, id: string, taskId: string): Promise<boolean> {
  if (!pool) return false;
  try {
    const res = await pool.query(
      `UPDATE c2c_commitments SET linked_task_id = $1, updated_at = now() WHERE id = $2 AND organization_id = $3`,
      [taskId, id, organizationId],
    );
    return (res.rowCount ?? 0) > 0;
  } catch (error: any) {
    if (error?.code === '42P01') return false;
    throw error;
  }
}

// ── Task spec (promote a commitment to an owned, dated task) ──────────────────

export interface CommitmentTaskSpec {
  sourceCommitmentId: string;
  title: string;
  description: string;
  owner: string | null;
  dueDate: string | null;
  priority: 'high' | 'medium' | 'low';
  sourceQuote: string | null;
}

/**
 * Build a normalized task spec from a commitment ("submit confirmatory data by
 * Q4" → an owned, dated task). Pure. The tasking module creates the task row
 * from this spec; the commitment's linked_task_id is then set via linkCommitmentTask.
 */
export function buildTaskFromCommitment(c: {
  id: string;
  title: string;
  description?: string | null;
  owner?: string | null;
  dueDateText?: string | null;
  sourceQuote?: string | null;
  clock?: CommitmentClock;
}): CommitmentTaskSpec {
  const overdueOrSoon = c.clock && (c.clock.overdue || c.clock.dueSoon);
  return {
    sourceCommitmentId: c.id,
    title: `Commitment: ${c.title}`,
    description: [c.description, c.dueDateText ? `Deadline: ${c.dueDateText}` : null]
      .filter(Boolean)
      .join('\n') || c.title,
    owner: c.owner ?? null,
    dueDate: c.clock?.dueDate ?? null,
    priority: overdueOrSoon ? 'high' : 'medium',
    sourceQuote: c.sourceQuote ?? null,
  };
}

// ── Outbound contradiction detection ──────────────────────────────────────────

export interface ContradictionFinding {
  commitmentIds: string[];
  kind: 'conflicting_deadline' | 'duplicate_divergent' | 'unfulfilled_vs_stated' | 'inconsistent_scope' | 'other';
  explanation: string;
  severity: 'high' | 'medium' | 'low';
}

const VALID_KINDS = new Set<ContradictionFinding['kind']>([
  'conflicting_deadline', 'duplicate_divergent', 'unfulfilled_vs_stated', 'inconsistent_scope', 'other',
]);

/** Parse the model's contradiction findings. Never throws. */
export function parseContradictionsJson(raw: string, validIds?: Set<string>): ContradictionFinding[] {
  if (!raw) return [];
  let text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  let arr: unknown;
  try { arr = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => {
      const ids = Array.isArray(r.commitmentIds) ? r.commitmentIds.map((x) => String(x)) : [];
      const kind = String(r.kind ?? 'other') as ContradictionFinding['kind'];
      const severity = ['high', 'medium', 'low'].includes(String(r.severity)) ? (String(r.severity) as ContradictionFinding['severity']) : 'medium';
      return {
        commitmentIds: validIds ? ids.filter((id) => validIds.has(id)) : ids,
        kind: VALID_KINDS.has(kind) ? kind : 'other',
        explanation: String(r.explanation ?? '').trim(),
        severity,
      };
    })
    // A finding must reference >= 2 real commitments and explain itself — no hallucinated conflicts.
    .filter((f) => f.commitmentIds.length >= 2 && f.explanation.length > 0);
}

const CONTRADICTION_SYSTEM = `You are a regulatory reviewer checking a company's OWN outbound commitments for internal contradictions.
A contradiction is when the company promised the same/related obligation in conflicting ways across its documents — e.g. two different deadlines for the same study, a commitment in meeting minutes that a later submission narrowed or dropped, or inconsistent scope for the same obligation.
Given the list of commitments (each with id, title, description, sourceQuote), find genuine contradictions ONLY.
Return ONLY a JSON array; each item: { commitmentIds: [ids of the >=2 conflicting commitments], kind ("conflicting_deadline"|"duplicate_divergent"|"unfulfilled_vs_stated"|"inconsistent_scope"|"other"), explanation (cite the conflict concretely), severity ("high"|"medium"|"low") }.
Do not invent conflicts. If there are none, return [].`;

/**
 * Detect contradictions among a set of (outbound) commitments via the governed
 * gateway. The non-obvious, high-value check: catch "the minutes committed to X
 * but the submission did Y" before the agency does. Degrades to [] if the
 * gateway is unavailable. AI output — findings are advisory and require review.
 */
export async function checkOutboundContradictions(
  commitments: Array<{ id: string; title: string; description?: string | null; sourceQuote?: string | null }>,
): Promise<ContradictionFinding[]> {
  if (commitments.length < 2) return [];
  const validIds = new Set(commitments.map((c) => c.id));
  const payload = commitments.map((c) => ({
    id: c.id, title: c.title, description: c.description ?? '', sourceQuote: c.sourceQuote ?? '',
  }));
  try {
    const gateway = getGateway();
    const response = await gateway.route({
      taskType: 'regulatory_review',
      messages: [
        { role: 'system', content: CONTRADICTION_SYSTEM },
        { role: 'user', content: `Commitments:\n${JSON.stringify(payload, null, 2)}` },
      ],
      jsonMode: true,
      temperature: 0,
      maxTokens: 2000,
      callerModule: 'commitments-contradictions',
      metadata: { promptVersion: 'commitments-contradictions-v1' },
    });
    return parseContradictionsJson(response.content, validIds);
  } catch (error: any) {
    logger.warn(`Contradiction check unavailable: ${error?.message}`);
    return [];
  }
}
