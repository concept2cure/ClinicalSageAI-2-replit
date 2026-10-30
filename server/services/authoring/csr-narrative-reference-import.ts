/**
 * §14.3.3 in an import of a saved CSR (2026-10-30, docs/evidence/D2-CSR/2026-10-30-cdisc-pilot-e2e,
 * "§14.3.3 by reference"). The patient narratives are engine output (E3
 * drafting mode "manual" for §14), held in the build's narrative store. They
 * are not copied into the Authoring document: the section holds the landed
 * opening (the selection basis), and its origin holds a reference to the store
 * (shared/csr-narrative-reference.ts) that the import fingerprint covers. The
 * reference is made only after every stored narrative was matched, in order,
 * to the landed text (csr/csr-narrative-landed.ts); otherwise the import is
 * refused and the finding names the subject. Read-only.
 */
import { createHash } from 'node:crypto';
import type { WorkflowSectionOrigin } from '../../../shared/authoring/source-import';
import { LandedNarrativesError, readCsrNarrativeReference } from '../csr/csr-narrative-landed';
import type { NarrativeQueryable } from '../csr/csr-narrative-store';

/** The importer's own refusal (workflow-source-import.ts fail), so a refusal here is its error, with its codes. */
type Fail = (status: 409, code: string, message: string) => never;

export const NARRATIVES_SECTION = '14.3.3';

export interface NarrativeReferenceSection {
  section: { code: string; title: string; content: string };
  origin: WorkflowSectionOrigin & { narrativeReference: NonNullable<WorkflowSectionOrigin['narrativeReference']> };
}

const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/** The landed §14.3.3 of one build, as its opening and a verified reference to the store. */
export async function csrNarrativeReferenceSection(q: NarrativeQueryable, input: {
  organizationId: number; jobId: number; row: Record<string, unknown>; title: string;
  authorship: Pick<WorkflowSectionOrigin, 'originalAuthorship' | 'model'>; fail: Fail;
}): Promise<NarrativeReferenceSection> {
  const { organizationId, jobId, row, authorship, fail } = input;
  let read: Awaited<ReturnType<typeof readCsrNarrativeReference>>;
  try {
    read = await readCsrNarrativeReference(q, { organizationId, jobId });
  } catch (error) {
    if (error instanceof LandedNarrativesError) {
      return fail(409, error.code === 'CSR_NARRATIVES_HASH_MISMATCH' ? 'WORKFLOW_CSR_HASH_MISMATCH' : 'WORKFLOW_CSR_OUTPUT_INVALID', error.message);
    }
    throw error;
  }
  if (read.state === 'not-landed') return fail(409, 'WORKFLOW_SOURCE_CHANGED', 'Saved CSR section 14.3.3 changed while it was being read. Nothing was imported.');
  if (read.state === 'mismatch') {
    const shown = read.findings.slice(0, 3).join(' ') + (read.findings.length > 3 ? ` (${read.findings.length - 3} more.)` : '');
    return fail(409, 'WORKFLOW_CSR_NARRATIVE_MISMATCH', `${shown} Run the narratives again. Nothing was imported.`);
  }
  if (!read.opening.trim() || typeof row.id !== 'number') return fail(409, 'WORKFLOW_CSR_OUTPUT_INVALID', 'The selected CSR contains an invalid or empty saved section.');
  const content = read.opening;
  return {
    section: { code: NARRATIVES_SECTION, title: input.title, content },
    origin: { code: NARRATIVES_SECTION, sourceRowId: `csr_section_outputs:${row.id}`, contentSha256: sha(content), originalAuthorship: authorship.originalAuthorship,
      model: authorship.model, modelEvidence: authorship.model ? 'recorded-name-only' : 'unrecorded', narrativeReference: read.reference },
  };
}
