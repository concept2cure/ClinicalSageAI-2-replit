/**
 * CSR slice 8 (2026-10-29): assemble a saved CSR job from what the platform
 * already verified, and nothing else.
 *
 * - The sections come from workflow-source-import.ts materializeCsrAssemblySource,
 *   the only assembly path: the same access, scope and hash checks as an import
 *   into Authoring.
 * - The engine tables and the subject rows come from the retained run the job
 *   was drafted from (csr_build_jobs.source_run_id), through
 *   saved-clinical-tables.ts readRetainedStudyForAssembly: current project
 *   access, the sealed run digest, the approved source receipt.
 * - Population flags, protocol deviations, ADLB and the sponsor's documents are
 *   not in a retained run; the caller supplies them, or the assembly lists the
 *   listings and appendices they would produce as missing.
 */
import type { Queryable } from '../authoring/authoring-evidence.js';
import { materializeCsrAssemblySource } from '../authoring/workflow-source-import.js';
import type { RequestSqlClient } from '../../db/requestDb.js';
import { readRetainedStudyForAssembly } from './saved-clinical-tables.js';
import { assembleCsr, CsrAssemblyError, type CsrAssemblyInput, type CsrAssemblyResult } from './csr-assembly.js';
import type { CsrListingSource } from './csr-listings.js';
import { hasUnresolvedPlaceholders } from './csr-placeholders.js';

export interface AssembleCsrJobInput extends Pick<CsrAssemblyInput, 'supplied' | 'notApplicable' | 'ctdSection' | 'outDir' | 'onStage' | 'shipAs'> {
  organizationId: number; userId: number; programId: string; projectId: number; jobId: number;
  participants?: CsrListingSource['participants'];
  protocolDeviations?: CsrListingSource['protocolDeviations'];
  laboratory?: CsrListingSource['laboratory'];
}
export interface AssembledCsrJob extends CsrAssemblyResult {
  jobId: number; jobFingerprint: string; runId: string; sourceSha256: string;
  /** Sections whose drafted text still holds a data placeholder (csr-placeholders.ts): drawn into the body as written, so the body is not fit to file. */
  placeholderSections: string[];
}

/** The retained study, held to subject level: a record without its subject cannot be listed. */
function subjectLevel(study: Awaited<ReturnType<typeof readRetainedStudyForAssembly>>['study']): CsrListingSource['study'] {
  const missing = [...study.disposition, ...study.demographics].some(r => typeof r.subjectId !== 'string' || !r.subjectId.trim());
  if (missing) throw new CsrAssemblyError('CSR_ASSEMBLY_SOURCE_NOT_SUBJECT_LEVEL', 'The retained source does not identify the subject of every disposition and demographic record; listings cannot be generated from it.');
  return study as CsrListingSource['study'];
}

/** The import's own gap lines for §3, §14 and §16, which this assembly composes (contents, tables, appendices). §15 stays a gap. */
const ASSEMBLED_HERE = /^CSR section (3|14|16) is prepared from source outputs and records/;

export async function assembleCsrJob(q: Queryable & RequestSqlClient, input: AssembleCsrJobInput): Promise<AssembledCsrJob> {
  const source = await materializeCsrAssemblySource({ organizationId: input.organizationId, userId: input.userId,
    target: { programId: input.programId, projectId: input.projectId }, source: { kind: 'csr', jobId: input.jobId } }, q);
  if (!source.sourceRunId) throw new CsrAssemblyError('CSR_ASSEMBLY_RUN_REQUIRED', 'This CSR job was not built from a retained run, so its tables and listings have no source. Build it from the run that holds the engine tables.');
  const retained = await readRetainedStudyForAssembly(q, { organizationId: input.organizationId, userId: input.userId, programId: input.programId }, source.sourceRunId, source.studyId);
  const cut = new Date(`${retained.source.dataCutDate}T00:00:00Z`);
  const stamp = source.lastGeneratedAt && source.lastGeneratedAt > cut ? source.lastGeneratedAt : cut;
  const result = await assembleCsr({
    studyId: source.studyId, title: source.title, ctdSection: input.ctdSection, sections: source.sections, gaps: source.gaps.filter(g => !ASSEMBLED_HERE.test(g)),
    tables: retained.tables, outDir: input.outDir, contentModifiedAt: stamp, supplied: input.supplied, notApplicable: input.notApplicable, onStage: input.onStage, shipAs: input.shipAs,
    listingSource: { study: subjectLevel(retained.study), participants: input.participants, protocolDeviations: input.protocolDeviations, laboratory: input.laboratory },
  });
  const placeholderSections = source.sections.filter(s => hasUnresolvedPlaceholders(s.content)).map(s => s.code);
  return { ...result, jobId: input.jobId, jobFingerprint: source.fingerprint, runId: retained.runId, sourceSha256: retained.source.sha256, placeholderSections };
}
