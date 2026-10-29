/**
 * Where the narrative job's work is kept and how a build reaches it (CSR slice
 * 7, 2026-10-29).
 *
 *   sqlNarrativeStore  csr_narrative_outputs (migrations/20260628_csr_job_state.sql,
 *                      amended in place 2026-10-29), its only writer, and the
 *                      §14.3.3 / §12.3.2 rows of csr_section_outputs.
 *   buildCsrNarratives a build bound to a retained run: the run's verified
 *                      source receipt names the approved ADaM bundle, whose
 *                      datasets are re-read under the package-run approval
 *                      checks as the requesting user, then the job runs.
 *   readCsrNarrativeQc the per-subject QC list the build board shows.
 */
import type { RequestConnectable, RequestSqlClient } from '../../db/requestDb.js';
import { runNarrativeJob, NARRATIVE_COMPOSER, type NarrativeJobResult, type NarrativeQc, type NarrativeStore, type SavedNarrative } from './csr-narrative-job.js';
import type { NarrativeProseWriter } from './narrative-compose.js';

export interface NarrativeQueryable { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }

export class CsrNarrativeBuildError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); this.name = 'CsrNarrativeBuildError'; }
}

const savedOf = (row: Record<string, unknown>): SavedNarrative => ({
  subjectId: String(row.subject_id), sequence: Number(row.sequence), status: row.status === 'composed' ? 'composed' : 'refused',
  content: typeof row.content === 'string' ? row.content : null, contentHash: typeof row.content_hash === 'string' ? row.content_hash : null,
  factsDigest: String(row.facts_digest), qc: (row.qc ?? {}) as NarrativeQc,
});

export function sqlNarrativeStore(q: NarrativeQueryable, job: { organizationId: number; jobId: number; projectId: number | null }): NarrativeStore {
  return {
    async saved() {
      const { rows } = await q.query(`SELECT subject_id, sequence, status, content, content_hash, facts_digest, qc
        FROM csr_narrative_outputs WHERE organization_id = $1 AND job_id = $2 ORDER BY sequence, subject_id`, [job.organizationId, job.jobId]);
      return rows.map(savedOf);
    },
    async save(row) {
      // Saved only while the build is not cancelled: a stopped build keeps what it had.
      const { rows } = await q.query(`INSERT INTO csr_narrative_outputs
          (organization_id, job_id, subject_id, sequence, status, content, content_hash, facts_digest, qc)
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
         WHERE EXISTS (SELECT 1 FROM csr_build_jobs WHERE id = $2 AND organization_id = $1 AND status <> 'cancelled')
        ON CONFLICT (job_id, subject_id) DO UPDATE SET sequence = EXCLUDED.sequence, status = EXCLUDED.status,
          content = EXCLUDED.content, content_hash = EXCLUDED.content_hash, facts_digest = EXCLUDED.facts_digest,
          qc = EXCLUDED.qc, updated_at = now()
        WHERE csr_narrative_outputs.organization_id = EXCLUDED.organization_id
        RETURNING id`,
      [job.organizationId, job.jobId, row.subjectId, row.sequence, row.status, row.content, row.contentHash, row.factsDigest, JSON.stringify(row.qc)]);
      return rows.length === 1;
    },
    async writeSections(sections) {
      const written: string[] = [];
      for (const s of sections) {
        const prose = Array.isArray(s.lineage.prose) ? s.lineage.prose as string[] : [];
        // §12.3.2 is replaced only when absent or when this job wrote it; a drafted §12.3.2 is kept.
        const { rows } = await q.query(`INSERT INTO csr_section_outputs
            (organization_id, project_id, job_id, section_number, content, content_hash, ai_generated, model, token_cost, lineage)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9::jsonb)
          ON CONFLICT (job_id, section_number) DO UPDATE SET content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
            ai_generated = EXCLUDED.ai_generated, model = EXCLUDED.model, token_cost = 0, lineage = EXCLUDED.lineage, generated_at = now()
          WHERE csr_section_outputs.organization_id = EXCLUDED.organization_id
            AND (EXCLUDED.section_number = '14.3.3' OR csr_section_outputs.lineage ->> 'composer' = $10)
          RETURNING section_number`,
        [job.organizationId, job.projectId, job.jobId, s.sectionNumber, s.content, s.contentHash, prose.includes('model'),
          typeof s.lineage.model === 'string' ? s.lineage.model : null, JSON.stringify(s.lineage), NARRATIVE_COMPOSER]);
        if (rows.length === 1) written.push(s.sectionNumber);
      }
      return { written, kept: sections.map(s => s.sectionNumber).filter(n => !written.includes(n)) };
    },
  };
}

type EvidenceSource = { programId: string; runId: string; studyId: string };
function boundRun(snapshot: unknown): EvidenceSource | null {
  const source = snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>).evidenceSource : null;
  if (!source || typeof source !== 'object') return null;
  const { programId, runId, studyId } = source as Record<string, unknown>;
  return typeof programId === 'string' && typeof runId === 'string' && typeof studyId === 'string' ? { programId, runId, studyId } : null;
}

async function readJob(q: NarrativeQueryable, organizationId: number, jobId: number) {
  const { rows } = await q.query(`SELECT id, project_id, study_id, status, study_info_snapshot FROM csr_build_jobs
    WHERE id = $1 AND organization_id = $2`, [jobId, organizationId]);
  const job = rows[0];
  if (!job) throw new CsrNarrativeBuildError('CSR_JOB_NOT_FOUND', 404, 'Job not found.');
  if (job.status === 'cancelled') throw new CsrNarrativeBuildError('CSR_NARRATIVE_BUILD_NOT_RUNNABLE', 409, 'This CSR build was cancelled. No narratives were composed.');
  const run = boundRun(job.study_info_snapshot);
  if (!run) throw new CsrNarrativeBuildError('CSR_NARRATIVE_RUN_REQUIRED', 409, 'Narratives are composed from the ADaM data of the retained run a build is bound to. This build has no bound run. No narratives were composed.');
  return { projectId: job.project_id == null ? null : Number(job.project_id), studyId: String(job.study_id), run };
}

export interface CsrNarrativeBuildDeps { q: NarrativeQueryable; sql: RequestSqlClient; connectable: RequestConnectable }

/** Compose the narratives of one CSR build from its bound run's approved ADaM bundle, as the signed-in user. */
export async function buildCsrNarratives(deps: CsrNarrativeBuildDeps,
  input: { organizationId: number; jobId: number; userId: number; writer?: NarrativeProseWriter }): Promise<NarrativeJobResult> {
  const job = await readJob(deps.q, input.organizationId, input.jobId);
  const scope = { organizationId: input.organizationId, userId: input.userId, programId: job.run.programId };
  const [{ readSavedClinicalTables }, { readCsrAdamDatasets }] = await Promise.all([
    import('./saved-clinical-tables.js'), import('./vault-source-input.js'),
  ]);
  const retained = await readSavedClinicalTables(deps.sql, scope, job.run.runId);
  const study = retained.studies.find(s => s.source.studyId === job.run.studyId && s.source.protocolNumber === job.studyId);
  if (!study) throw new CsrNarrativeBuildError('CSR_EVIDENCE_STUDY_MISMATCH', 409, 'The bound run holds no source for this build’s protocol. No narratives were composed.');
  const { documentId, sha256 } = study.source;
  const { bundle, datasets } = await readCsrAdamDatasets(deps.connectable, scope, { documentId, expectedSha256: sha256 });
  if (bundle.studyInfo.protocolNumber !== job.studyId) throw new CsrNarrativeBuildError('CSR_EVIDENCE_STUDY_MISMATCH', 409, 'The ADaM bundle names another protocol. No narratives were composed.');
  return runNarrativeJob({ bundle, datasets, protocolNumber: job.studyId, writer: input.writer,
    store: sqlNarrativeStore(deps.q, { organizationId: input.organizationId, jobId: input.jobId, projectId: job.projectId }),
    provenance: { runId: job.run.runId, manifestDocumentId: documentId, manifestSha256: sha256 } });
}

/** The per-subject QC list: what each narrative is missing, how it was written, and why any was refused. */
export async function readCsrNarrativeQc(q: NarrativeQueryable, organizationId: number, jobId: number) {
  const { rows } = await q.query(`SELECT subject_id, sequence, status, content, content_hash, facts_digest, qc
    FROM csr_narrative_outputs WHERE organization_id = $1 AND job_id = $2 ORDER BY sequence, subject_id`, [organizationId, jobId]);
  return rows.map(savedOf).map(({ content: _content, factsDigest: _digest, ...row }) => row);
}
