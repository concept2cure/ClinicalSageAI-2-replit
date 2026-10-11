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
import type { PoolClient } from 'pg';
import { pool } from '../../db';

/**
 * Anything that can run a query: the shared pool, or a client already inside a
 * transaction. Declared here rather than imported from module3-compile, which
 * imports this module.
 */
type Queryable = Pick<PoolClient, 'query'>;

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
async function anotherProgramClaims(row: SpineRow, anchor: SpineAnchor, appType: string, orgId: number, executor: Queryable): Promise<boolean> {
  const subKeys = [row.product_name, row.title].map(normKey).filter(Boolean);
  if (subKeys.length === 0) return true;
  const { rows } = await executor.query(
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
  /** The caller's connection — see the note on resolveSubmissionSpine. */
  executor: Queryable,
): Promise<{ row: SpineRow; match: SubmissionSpine['match'] } | null> {
  const identityKeys = [...new Set([anchor.productName, anchor.title, anchor.programCode].map(normKey).filter(Boolean))];
  const { rows } = await executor.query(
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
  if (await anotherProgramClaims(first, anchor, appType, orgId, executor)) return null;
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
  /**
   * Where to run these three reads.
   *
   * Callers inside an open transaction MUST pass their own client. This
   * function used to reach for the shared pool unconditionally, so a caller
   * holding a transaction on one connection took a SECOND connection here —
   * and when the pool had no slot free, the read waited while the caller's
   * transaction sat idle holding its locks. Measured: the Module 3 compile
   * route (module3OperatingSystemRoutes POST /compile/:projectId) opens a
   * transaction, calls composeProjectModule3 -> resolveProjectRegional ->
   * here, and with the 20-connection dev pool saturated the transaction stalled
   * on Client/ClientRead while a concurrent compile's INSERT INTO
   * cmc_module3_sections waited on its uncommitted rows until the 30s
   * statement_timeout cancelled it. Raising the pool ceiling hid it; passing
   * the client removes the second connection altogether, and the reads then
   * also see the caller's own snapshot.
   */
  executor: Queryable = pool,
): Promise<SubmissionSpine | null> {
  if (anchor.programId === null) return null;
  const appType = (anchor.programType ?? '').trim().toLowerCase();
  if (!DRUG_APPLICATION_TYPES.has(appType)) return null;
  try {
    const found = await findProgramSubmission({ ...anchor, programId: anchor.programId }, appType, orgId, executor);
    if (!found) return null;
    const { row: sub, match } = found;
    const submissionId = Number(sub.id);
    const primaryRegion = sub.primary_region == null ? null : String(sub.primary_region);

    const seqRes = await executor.query(
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

    const leafRes = await executor.query(
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
 * The spine of a NAMED sequence, when this program owns it (FILING_SPINE.md
 * F14): the sequence, joined to its submission, which must be anchored to the
 * program (submissions.program_id). resolveSubmissionSpine finds one
 * submission per program, by its application type, so an NDA project's MAA
 * sequence, opened in the Submission Center, could not be compiled. Null when
 * the sequence is not this program's (another project's, deleted, or no such
 * id): the caller answers 404. A failed lookup throws; it is not "not
 * found".
 */
export async function resolveSequenceSpine(
  anchor: SpineAnchor,
  orgId: number,
  sequenceId: number,
  executor: Queryable = pool,
): Promise<SubmissionSpine | null> {
  if (anchor.programId === null) return null;
  const { rows } = await executor.query(
    `SELECT q.id, q.sequence_number, q.region, q.submission_id, s.application_type, s.primary_region
       FROM ectd_sequences q
       JOIN submissions s ON s.id = q.submission_id AND s.organization_id = q.organization_id
      WHERE q.id = $1 AND q.organization_id = $2 AND q.deleted_at IS NULL
        AND s.deleted_at IS NULL AND s.program_id = $3::uuid`,
    [sequenceId, orgId, anchor.programId],
  );
  const row = rows[0] as
    | { id: number | string; sequence_number: string; region: string; submission_id: number | string; application_type: string; primary_region: string | null }
    | undefined;
  if (!row) return null;
  const leafRes = await executor.query(
    `SELECT count(*)::int AS n FROM submission_leaves
      WHERE sequence_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [Number(row.id), orgId],
  );
  return {
    submissionId: Number(row.submission_id),
    match: 'program',
    applicationType: String(row.application_type),
    primaryRegion: row.primary_region == null ? null : String(row.primary_region),
    sequence: {
      id: Number(row.id),
      sequenceNumber: String(row.sequence_number),
      region: String(row.region),
      leafCount: Number(leafRes.rows[0]?.n ?? 0),
    },
  };
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
