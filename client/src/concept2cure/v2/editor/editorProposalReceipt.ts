import type { ProposeResult } from './suggestions';
import type { ProposalReceipt } from './RichSectionEditor';

/** A receipt is useful only in the saved document/section that admitted it. */
export interface EditorProposalReceipt extends ProposalReceipt {
  docId: string;
  sectionId: string;
}

export function scopedProposalResult(result: ProposeResult & { editorInstanceId?: string }, docId: string, sectionId: string) {
  if (!result.ok || !result.applicationId || !result.editorInstanceId) return result;
  return { ...result, receipt: { applicationId: result.applicationId, editorInstanceId: result.editorInstanceId, docId, sectionId } };
}
