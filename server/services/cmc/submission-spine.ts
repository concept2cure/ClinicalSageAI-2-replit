/**
 * The program ↔ submission identity convention — ONE owner.
 *
 * Moved verbatim from routes/ectd-compile.ts (which now imports it) so the
 * Module 3 OS compose path can dispatch REGIONAL composition (3.2.R) on the
 * same spine the eCTD compile runs against. Two copies of an identity-matching
 * convention is how a compose and a compile end up talking about different
 * submissions — the drift this module exists to prevent.
 *
 * @module server/services/cmc/submission-spine
 */
import { pool } from '../../db';

/**
 * Application types whose programs carry a canonical submission spine — the
 * value space of submissions.application_type for drug programs. Mirrors
 * DRUG_APPLICATION_TYPES in routes/c2c/projects.ts.
 */
export const DRUG_APPLICATION_TYPES = new Set(['ind', 'cta', 'nda', 'bla', 'maa', 'jnda', 'anda']);

/** What resolveSubmissionSpine needs to know about the program. Structurally
 *  satisfied by the eCTD compile's anchor and by a regulatory_programs row. */
export interface SpineAnchor {
  programId: string | null;
  /** Program type (ind/cta/nda/…) — maps to submissions.application_type. */
  programType: string | null;
  productName: string | null;
  title: string | null;
  programCode: string | null;
}

export interface SubmissionSpine {
  submissionId: number;
  applicationType: string;
  /** The submission's recorded market (fda/eu/jp/… — submissions.primary_region). */
  primaryRegion: string | null;
  /** Latest sequence, with its placed-leaf count; null when none exists yet. */
  sequence: { id: number; sequenceNumber: string; region: string; leafCount: number } | null;
}

/**
 * Resolve the program anchor's canonical submission spine, org-scoped, by the
 * SAME identity convention the ind-checklist-view-assembler and the C2C intake
 * use to link program ↔ submission: matching application type, and the
 * program's product_name / name / code matching the submission's product_name
 * or title (case-insensitive). Numeric legacy anchors have no program identity
 * and therefore no spine. Fail-closed: any lookup failure is "no spine", never
 * a guessed one.
 */
export async function resolveSubmissionSpine(
  anchor: SpineAnchor,
  orgId: number,
): Promise<SubmissionSpine | null> {
  if (anchor.programId === null) return null;
  const appType = (anchor.programType ?? '').trim().toLowerCase();
  if (!DRUG_APPLICATION_TYPES.has(appType)) return null;
  const identityKeys = [
    ...new Set(
      [anchor.productName, anchor.title, anchor.programCode]
        .map((v) => (v ?? '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (identityKeys.length === 0) return null;
  try {
    const subRes = await pool.query(
      `SELECT id, application_type, primary_region FROM submissions
        WHERE organization_id = $1 AND deleted_at IS NULL
          AND lower(application_type) = $2
          AND (lower(coalesce(product_name, '')) = ANY($3) OR lower(title) = ANY($3))
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1`,
      [orgId, appType, identityKeys],
    );
    const sub = subRes.rows[0];
    if (!sub) return null;
    const submissionId = Number(sub.id);
    const primaryRegion = sub.primary_region == null ? null : String(sub.primary_region);

    const seqRes = await pool.query(
      `SELECT id, sequence_number, region FROM ectd_sequences
        WHERE submission_id = $1 AND organization_id = $2 AND deleted_at IS NULL
        ORDER BY sequence_number DESC, id DESC
        LIMIT 1`,
      [submissionId, orgId],
    );
    const seq = seqRes.rows[0];
    if (!seq) {
      return { submissionId, applicationType: String(sub.application_type), primaryRegion, sequence: null };
    }

    const leafRes = await pool.query(
      `SELECT count(*)::int AS n FROM submission_leaves
        WHERE sequence_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [Number(seq.id), orgId],
    );
    return {
      submissionId,
      applicationType: String(sub.application_type),
      primaryRegion,
      sequence: {
        id: Number(seq.id),
        sequenceNumber: String(seq.sequence_number),
        region: String(seq.region),
        leafCount: Number(leafRes.rows[0]?.n ?? 0),
      },
    };
  } catch {
    // Fail-closed: a lookup failure is "no spine", never a guessed one.
    return null;
  }
}

/**
 * The submission's recorded market, in the regional composer's vocabulary
 * (module3-extensions RegionCode) — or null for a market the composer has no
 * 3.2.R generator for. Null means COMPOSE NOTHING regional: an honest gap in
 * the dossier beats a guessed region's regional form in a filing.
 */
export function regionCodeForPrimaryRegion(
  primaryRegion: string | null | undefined,
): 'US' | 'EU' | 'JP' | 'CA' | null {
  switch ((primaryRegion ?? '').trim().toLowerCase()) {
    case 'fda':
    case 'us':
      return 'US';
    case 'eu':
    case 'ema':
      return 'EU';
    case 'jp':
    case 'pmda':
      return 'JP';
    case 'ca':
      return 'CA';
    default:
      return null;
  }
}
