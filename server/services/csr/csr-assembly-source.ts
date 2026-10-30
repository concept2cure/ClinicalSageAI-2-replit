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
 * - §14.3.3 is checked against, and drawn from, the build's stored narratives
 *   (csr-narrative-store.ts sqlNarrativeStore, read a page at a time); when it
 *   has not landed, the narrative job's saved state is named in the gap (D18).
 *   The import holds §14.3.3 by reference, not as text (2026-10-30): the landed
 *   text is read here a slice at a time (csr-narrative-landed.ts
 *   sqlLandedNarratives), and must be the text the reference was made from.
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
import { sqlNarrativeStore } from './csr-narrative-store.js';
import { CSR_NARRATIVES_SECTION } from './csr-assembly-plan.js';
import type { CsrNarrativesSource } from './csr-assembly-narratives.js';
import { sqlLandedNarratives, type LandedNarratives } from './csr-narrative-landed.js';
import type { CsrNarrativeReference } from '../../../shared/csr-narrative-reference.js';

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

/** The build's stored narratives; when §14.3.3 has not landed, what the narrative job has saved, for the gap's reason. */
async function narrativesOf(q: Queryable, input: AssembleCsrJobInput, landed: boolean): Promise<CsrNarrativesSource> {
  const store = sqlNarrativeStore(q, { organizationId: input.organizationId, jobId: input.jobId, projectId: input.projectId });
  if (landed) return { page: store.page };
  const { rows } = await q.query(`SELECT status, count(*)::int AS n FROM csr_narrative_outputs WHERE organization_id = $1 AND job_id = $2 GROUP BY status`,
    [input.organizationId, input.jobId]);
  const count = (status: string) => Number((rows as Array<Record<string, unknown>>).find(r => r.status === status)?.n ?? 0);
  const composed = count('composed'), refused = count('refused');
  const notLandedReason = composed + refused === 0 ? 'No narrative of this build has been saved.'
    : `The narrative job has saved ${composed} composed and ${refused} refused narrative(s); Section 14.3.3 is landed only when every selected subject has a verified narrative (see the build's narrative QC list).`;
  return { page: store.page, notLandedReason, savedNarratives: composed + refused };
}

/** The landed §14.3.3 the import's reference was made from, or a refusal: it changed between the two reads. */
async function landedOf(q: Queryable, input: AssembleCsrJobInput, reference: CsrNarrativeReference | null): Promise<LandedNarratives | undefined> {
  if (!reference) return undefined;
  const landed = await sqlLandedNarratives(q, { organizationId: input.organizationId, jobId: input.jobId });
  if (!landed || landed.sha256 !== reference.landedSha256 || landed.length !== reference.landedLength) {
    throw new CsrAssemblyError('CSR_ASSEMBLY_SOURCE_CHANGED', 'Section 14.3.3 changed while this assembly read it. Assemble again.');
  }
  return landed;
}

export async function assembleCsrJob(q: Queryable & RequestSqlClient, input: AssembleCsrJobInput): Promise<AssembledCsrJob> {
  const source = await materializeCsrAssemblySource({ organizationId: input.organizationId, userId: input.userId,
    target: { programId: input.programId, projectId: input.projectId }, source: { kind: 'csr', jobId: input.jobId } }, q);
  if (!source.sourceRunId) throw new CsrAssemblyError('CSR_ASSEMBLY_RUN_REQUIRED', 'This CSR job was not built from a retained run, so its tables and listings have no source. Build it from the run that holds the engine tables.');
  const retained = await readRetainedStudyForAssembly(q, { organizationId: input.organizationId, userId: input.userId, programId: input.programId }, source.sourceRunId, source.studyId);
  const cut = new Date(`${retained.source.dataCutDate}T00:00:00Z`);
  const stamp = source.lastGeneratedAt && source.lastGeneratedAt > cut ? source.lastGeneratedAt : cut;
  const result = await assembleCsr({
    studyId: source.studyId, title: source.title, nctNumber: source.nctNumber, ctdSection: input.ctdSection, sections: source.sections, gaps: source.gaps.filter(g => !ASSEMBLED_HERE.test(g)),
    tables: retained.tables, narratives: await narrativesOf(q, input, !!source.narratives || source.sections.some(s => s.code === CSR_NARRATIVES_SECTION)), landedNarratives: await landedOf(q, input, source.narratives), outDir: input.outDir, contentModifiedAt: stamp, supplied: input.supplied, notApplicable: input.notApplicable, onStage: input.onStage, shipAs: input.shipAs,
    listingSource: { study: subjectLevel(retained.study), participants: input.participants, protocolDeviations: input.protocolDeviations, laboratory: input.laboratory },
  });
  const placeholderSections = source.sections.filter(s => hasUnresolvedPlaceholders(s.content)).map(s => s.code);
  return { ...result, jobId: input.jobId, jobFingerprint: source.fingerprint, runId: retained.runId, sourceSha256: retained.source.sha256, placeholderSections };
}
