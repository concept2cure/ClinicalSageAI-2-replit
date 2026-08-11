/**
 * Draft-accept store for automated span-level source attribution.
 *
 * The verified-quote attribution primitive (source-attribution.ts) needs the
 * SOURCE'S TEXT to check a quote, and that text is assembled only at RETRIEVAL
 * time — cre_evidence_sources has no full-text column. So when an AI draft is
 * generated (POST /sections/:id/ai/draft), the chunks that backed it (content +
 * the resolved cre_evidence_sources.id for each) are parked here, keyed by a
 * draft id, until the author accepts. The accept endpoint
 * (POST /sections/:id/ai/draft/accept) re-verifies each quote against these exact
 * chunks inside the section-content transaction.
 *
 * ── WHY SERVER-SIDE, NOT ROUND-TRIPPED THROUGH THE CLIENT ────────────────────
 * If the chunks travelled to the browser and back, a client could forge source
 * content to manufacture a quote match — turning "this text appears in this
 * source" from a checkable fact into a client claim, the exact dishonesty the
 * attribution subsystem exists to prevent. The chunks stay on the server; the
 * only client-supplied input at accept time is the (possibly edited) section
 * text, which is precisely what should be attributed.
 *
 * ── SINGLE-USE + TENANT-SCOPED ───────────────────────────────────────────────
 * consumeDraftCandidate claims a candidate with DELETE … RETURNING, scoped to
 * (org, section, id) and unexpired, so it can be accepted exactly once and never
 * across tenants. Run on the caller's transaction client, the claim commits with
 * the content write and rolls back with it (a refused accept leaves the candidate
 * for a retry). The table also carries RLS (see the migration) as defence in
 * depth behind these explicit predicates.
 *
 * @module server/services/clinical-regulatory-evidence/draft-candidate-store
 */

import { pool } from '../../db';
import type { Queryable } from './span-lineage.service';

/** Default executor — the pool (its own transaction per statement). */
const defaultExec: Queryable = pool as unknown as Queryable;

/** One retrieved chunk that resolved to a canonical Data Room source. */
export interface DraftCandidateSource {
  /** cre_evidence_sources.id the chunk came from. */
  evidenceSourceId: number;
  /** The chunk's content — the haystack a generated quote is checked against. */
  content: string;
  title: string | null;
}

export interface DraftCandidate {
  id: string;
  sectionId: string;
  content: string;
  sources: DraftCandidateSource[];
  createdBy: string | null;
}

/**
 * Park an AI draft and the sources that back it.
 *
 * Opportunistically deletes this org's expired candidates first, so the table
 * self-cleans without a separate job. That cleanup is best-effort: a failure must
 * never block drafting. `expires_at` is computed in SQL (NOW() + TTL) to avoid
 * app/DB clock skew.
 */
export async function createDraftCandidate(
  orgId: number,
  sectionId: string,
  content: string,
  sources: DraftCandidateSource[],
  createdBy: string | null,
  exec: Queryable = defaultExec,
): Promise<{ id: string; expiresAt: string }> {
  try {
    await exec.query(
      `DELETE FROM authoring_ai_draft_candidates
        WHERE organization_id = $1 AND expires_at < NOW()`,
      [orgId],
    );
  } catch {
    /* non-fatal: stale rows are harmless and filtered on read anyway */
  }

  const { rows } = await exec.query<{ id: string; expires_at: string }>(
    `INSERT INTO authoring_ai_draft_candidates
       (section_id, organization_id, content, sources, created_by, expires_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, NOW() + INTERVAL '2 hours')
     RETURNING id, expires_at`,
    [sectionId, orgId, content, JSON.stringify(sources ?? []), createdBy],
  );
  return { id: rows[0].id, expiresAt: String(rows[0].expires_at) };
}

/**
 * Claim a parked candidate for acceptance — single-use, tenant- and section-
 * scoped, unexpired. Returns null when no such live candidate exists (wrong
 * tenant/section, already accepted, or past its TTL). MUST be passed the accept
 * transaction's client so the claim commits with the content write.
 */
export async function consumeDraftCandidate(
  orgId: number,
  sectionId: string,
  draftId: string,
  exec: Queryable = defaultExec,
): Promise<DraftCandidate | null> {
  const { rows } = await exec.query<{
    id: string;
    section_id: string;
    content: string;
    sources: unknown;
    created_by: string | null;
  }>(
    `DELETE FROM authoring_ai_draft_candidates
      WHERE id = $1 AND organization_id = $2 AND section_id = $3 AND expires_at >= NOW()
      RETURNING id, section_id, content, sources, created_by`,
    [draftId, orgId, sectionId],
  );
  if (rows.length === 0) return null;

  const r = rows[0];
  // jsonb comes back parsed from node-postgres and (usually) from PGlite; tolerate
  // a string just in case, and drop any entry without a usable integer source id.
  const raw = Array.isArray(r.sources)
    ? r.sources
    : typeof r.sources === 'string'
      ? safeParseArray(r.sources)
      : [];
  const sources: DraftCandidateSource[] = raw
    .filter((s: any) => s && Number.isInteger(Number(s.evidenceSourceId)) && Number(s.evidenceSourceId) > 0)
    .map((s: any) => ({
      evidenceSourceId: Number(s.evidenceSourceId),
      content: typeof s.content === 'string' ? s.content : '',
      title: s.title ?? null,
    }));

  return {
    id: r.id,
    sectionId: r.section_id,
    content: r.content,
    sources,
    createdBy: r.created_by,
  };
}

function safeParseArray(s: string): any[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
