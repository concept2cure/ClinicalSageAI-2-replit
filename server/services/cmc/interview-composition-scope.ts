/**
 * The composition boundary for AnA's CMC specification interview (decision
 * P-28: small-molecule Module 3 for a US IND).
 *
 * The interview asks for the molecule type and then judges every later answer
 * by small-molecule rules (ICH Q3A(R2), ICH M7, ICH Q1A(R2)). It reached no
 * boundary, so a monoclonal antibody received "critical" Q3A and M7 findings
 * and a "ready to proceed with document generation" summary (2026-10-15
 * launch-boundary re-proof). Asked before each answer is judged:
 *
 *   • the molecule type stated, this answer's or an earlier one
 *     (composition-scope.ts interviewMoleculeTypeRefusal);
 *   • the program the session is bound to, as compose judges it, except that
 *     a program with no substance recorded yet is not refused: this interview
 *     is how the substance gets recorded, and its own molecule-type answer
 *     decides.
 */
import {
  anaToolCompositionRefusal,
  applicationNotReadable,
  interviewMoleculeTypeRefusal,
  type CompositionRefusal,
} from './composition-scope';
import { assessProgramCompositionScope } from './module3-compile';

/** The one interview that applies Module 3's small-molecule reasoning. */
const CMC_INTERVIEW = 'cmc_specification';
const MOLECULE_NODE = 'substance_classification';

export interface InterviewBoundaryQuestion {
  organizationId: number | null | undefined;
  /** The program the session is bound to. */
  projectId: string | null | undefined;
  flowState: { flowCategory?: unknown; answers?: Record<string, Record<string, unknown> | undefined> } | null | undefined;
  /** The node being answered, and its answers; empty when nothing is being answered (start, resume). */
  nodeId: string;
  answers: Record<string, unknown>;
}

export async function interviewCompositionRefusal(params: InterviewBoundaryQuestion): Promise<CompositionRefusal | null> {
  const { organizationId, projectId, flowState, nodeId, answers } = params;
  if (flowState?.flowCategory !== CMC_INTERVIEW) return null;
  const stated =
    nodeId === MOLECULE_NODE && answers.molecule_type !== undefined
      ? answers.molecule_type
      : flowState.answers?.[MOLECULE_NODE]?.molecule_type;
  const byAnswer = interviewMoleculeTypeRefusal(stated);
  if (byAnswer) return byAnswer;
  if (!organizationId || !projectId) return null;
  const byProgram = await assessProgramCompositionScope(Number(organizationId), projectId);
  return byProgram && byProgram.code !== 'CMC_MODALITY_NOT_ESTABLISHED' ? byProgram : null;
}

/**
 * The same decision as an AnA tool result, or null when it admits. A boundary
 * that could not be asked refuses as a failed read, so no answer is judged
 * unasked; the error stays in the server log.
 */
export async function interviewCompositionRefusalResult(
  params: InterviewBoundaryQuestion,
  extra: Record<string, unknown> = {},
): Promise<string | null> {
  let refusal: CompositionRefusal | null;
  try {
    refusal = await interviewCompositionRefusal(params);
  } catch (err) {
    console.warn('[interview-composition-scope] the boundary could not be asked; refused:', err instanceof Error ? err.message : String(err));
    refusal = applicationNotReadable();
  }
  if (!refusal) return null;
  return anaToolCompositionRefusal(
    refusal,
    "Only the person can state the molecule type: do not answer it on the person's behalf, and do not restart " +
      'the interview to get past this.',
    extra,
  );
}
