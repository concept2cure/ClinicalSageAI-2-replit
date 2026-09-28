/**
 * A program's submission spine — ONE owner.
 *
 * Moved from routes/ectd-compile.ts (which now imports it) so the Module 3 OS
 * compose path dispatches REGIONAL composition (3.2.R) on the same spine the
 * eCTD compile runs against: two copies of this rule is how a compose and a
 * compile end up talking about different submissions.
 *
 * The rule (LX-22 part 2b, PF-06). A submission anchored to the program
 * (submissions.program_id) is the program's; one anchored to ANOTHER program
 * never is. It used to be matched by product name / title, newest first — so
 * two projects for one product resolved to the same filing, and whichever
 * submission was touched last won. A submission with no recorded project
 * (created before submissions recorded one) is still matched by name, but only
 * when that is unambiguous in both directions, and the result says so
 * (`match: 'legacy-name'`); this branch goes when no such row remains.
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
  /** How the submission was found: anchored to this program by column, or —
   *  for a submission with no recorded project — by an unambiguous name match. */
  match: 'program' | 'legacy-name';
  applicationType: string;
  /** The submission's recorded market (fda/eu/jp/… — submissions.primary_region). */
  primaryRegion: string | null;
  /** Latest sequence, with its placed-leaf count; null when none exists yet. */
  sequence: { id: number; sequenceNumber: string; region: string; leafCount: number } | null;
}

const normKey = (v: unknown): string => String(v ?? '').trim().toLowerCase();

interface SpineRow {
  id: number | string;
  application_type: string;
  primary_region: string | null;
  product_name?: string | null;
  title?: string | null;
  anchored?: boolean;
}

/**
 * Another live program of the organization, of the same type, that an
 * unanchored submission's product name or title names equally well. Its own
 * statement, not folded into the submissions query: the eCTD compile harness
 * routes statements by table (tests/routes/ectd-compile-spine.harness.ts).
 */
async function anotherProgramClaims(row: SpineRow, anchor: SpineAnchor, appType: string, orgId: number): Promise<boolean> {
  const subKeys = [row.product_name, row.title].map(normKey).filter(Boolean);
  if (subKeys.length === 0) return true;
  const { rows } = await pool.query(
    `SELECT id FROM regulatory_programs
      WHERE organization_id = $1 AND deleted_at IS NULL AND lower(program_type) = $2
        AND (lower(coalesce(product_name, '')) = ANY($3) OR lower(coalesce(name, '')) = ANY($3)
             OR lower(coalesce(code, '')) = ANY($3))`,
    [orgId, appType, subKeys],
  );
  return rows.some((r: { id: unknown }) => String(r.id) !== anchor.programId);
}

/**
 * The program's submission row: anchored to it by column; else, for a
 * submission with no recorded project, the one that its name makes
 * unambiguously this program's; else none.
 */
async function findProgramSubmission(
  anchor: SpineAnchor & { programId: string },
  appType: string,
  orgId: number,
): Promise<{ row: SpineRow; match: SubmissionSpine['match'] } | null> {
  const identityKeys = [...new Set([anchor.productName, anchor.title, anchor.programCode].map(normKey).filter(Boolean))];
  const { rows } = await pool.query(
    `SELECT id, application_type, primary_region, product_name, title, (program_id IS NOT NULL) AS anchored
       FROM submissions
      WHERE organization_id = $1 AND deleted_at IS NULL AND lower(application_type) = $2
        AND (program_id = $3::uuid
             OR (program_id IS NULL
                 AND (lower(coalesce(product_name, '')) = ANY($4) OR lower(title) = ANY($4))))
      ORDER BY (program_id IS NOT NULL) DESC, updated_at DESC NULLS LAST, id DESC
      LIMIT 2`,
    [orgId, appType, anchor.programId, identityKeys],
  );
  const first = rows[0] as SpineRow | undefined;
  if (!first) return null;
  if (first.anchored === true) return { row: first, match: 'program' };
  // Legacy: exactly one unanchored candidate, and no other program claims it.
  if (rows.length !== 1) return null;
  if (await anotherProgramClaims(first, anchor, appType, orgId)) return null;
  return { row: first, match: 'legacy-name' };
}

/**
 * Resolve the program anchor's canonical submission spine, org-scoped (see the
 * module header for the rule). Numeric legacy anchors have no program identity
 * and therefore no spine. Fail-closed: any lookup failure, and any ambiguity, is
 * "no spine", never a guessed one.
 */
export async function resolveSubmissionSpine(
  anchor: SpineAnchor,
  orgId: number,
): Promise<SubmissionSpine | null> {
  if (anchor.programId === null) return null;
  const appType = (anchor.programType ?? '').trim().toLowerCase();
  if (!DRUG_APPLICATION_TYPES.has(appType)) return null;
  try {
    const found = await findProgramSubmission({ ...anchor, programId: anchor.programId }, appType, orgId);
    if (!found) return null;
    const { row: sub, match } = found;
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
      return { submissionId, match, applicationType: String(sub.application_type), primaryRegion, sequence: null };
    }

    const leafRes = await pool.query(
      `SELECT count(*)::int AS n FROM submission_leaves
        WHERE sequence_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [Number(seq.id), orgId],
    );
    return {
      submissionId,
      match,
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
