/**
 * Where a program stands, as the CMC engines need it: what it files (a
 * clinical-trial application or a marketing one) and the clinical phase its
 * study designs record.
 *
 * The CMC engines were phase-agnostic (discovery map 2026-10-04,
 * cmc-engines-phase-agnostic-stale-ich): the analytical-validation check held a
 * first-in-human IND to the marketing standard. CMC expectations differ by
 * stage, and the authorities say so (services/cmc/knowledge: FDA's phase 1
 * flexibilities, the EU IMP quality guideline's phase 1 vs phase 2-3
 * expectations, ICH Q2(R2) for marketing). So the stage is read, never
 * assumed:
 *
 *   - the application from `regulatory_programs.program_type`;
 *   - the phase from the program's study designs (`cdisc_prm_studies`,
 *     tenant-scoped), the HIGHEST phase recorded, because an IND is held to
 *     the most advanced study it supports. "Phase 1/2" counts as 2.
 *
 * A program with no recorded phase reads `phase: null`, and the engines say so
 * in their findings. A read that cannot complete throws; the caller marks the
 * stage unavailable rather than judging at a guessed stage.
 *
 * @module server/services/cmc/program-stage
 */

export interface ProgramStage {
  /** What the program files: a clinical-trial application (IND, CTA, IMPD) or a marketing one (NDA, BLA, MAA). */
  application: 'clinical_trial' | 'marketing';
  /** The highest clinical phase the program's study designs record; null when none records one. */
  phase: 1 | 2 | 3 | null;
  /** Where the two were read, in words, for a finding's evidence. */
  basis: string;
}

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLINICAL_TRIAL = new Set(['ind', 'cta', 'impd', 'ctn', 'clinical_trial', 'clinical trial']);
const MARKETING = new Set(['nda', 'bla', 'anda', 'maa', 'snda', 'sbla', '505b2', '505(b)(2)', 'marketing', 'nds', 'j-nda']);

/** "Phase 1", "I", "1/2", "Phase IIb", "phase_3" → its number; null when it names none of 1–3. */
export function phaseNumber(text: unknown): 1 | 2 | 3 | null {
  const t = String(text ?? '').toLowerCase().replace(/phase|_|-/g, ' ');
  const found: number[] = [];
  for (const m of t.matchAll(/\b(iii|ii|i|[123])(?:[ab])?\b/g)) {
    const v = m[1];
    found.push(v === 'iii' || v === '3' ? 3 : v === 'ii' || v === '2' ? 2 : 1);
  }
  if (found.length === 0) return null;
  return Math.max(...found) as 1 | 2 | 3;
}

/** The program's stage; null when it is not a program of this organisation or names no known application. */
export async function readProgramStage(q: Queryable, orgId: number, projectId: string): Promise<ProgramStage | null> {
  if (!UUID_RE.test(projectId)) return null;
  const prog = await q.query(
    `SELECT program_type FROM regulatory_programs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [projectId, orgId],
  );
  const type = String(prog.rows[0]?.program_type ?? '').trim().toLowerCase();
  const application = CLINICAL_TRIAL.has(type) ? 'clinical_trial' : MARKETING.has(type) ? 'marketing' : null;
  if (!application) return null;
  const studies = await q.query(
    `SELECT study_phase FROM cdisc_prm_studies WHERE program_id = $1 AND tenant_id = $2`,
    [projectId, orgId],
  );
  const phases = studies.rows.map((r) => phaseNumber(r.study_phase)).filter((p): p is 1 | 2 | 3 => p !== null);
  const phase = phases.length ? (Math.max(...phases) as 1 | 2 | 3) : null;
  const designs = `${studies.rows.length} study design(s)`;
  return {
    application,
    phase,
    basis:
      `program type "${type}"; ` +
      (phase ? `clinical phase ${phase}, the highest of ${designs}` : `no clinical phase recorded in ${designs}`),
  };
}
