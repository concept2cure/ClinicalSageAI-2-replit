import { isTruncated } from '../ai-gateway/finish-reason';

/** A known cutoff cannot become an editor candidate or accepted section. */
export class DraftTruncatedError extends Error {
  readonly code = 'DRAFT_TRUNCATED';
  constructor() {
    super('This AI draft was cut off before it finished. Shorten or split this section, then regenerate the draft before accepting. No section content was saved.');
    this.name = 'DraftTruncatedError';
  }
}

/** Unknown status remains unconfirmed; false cannot override a known reason. */
export function assertEditorDraftNotTruncated(
  termination: { finishReason?: string | null; truncated?: boolean } | null | undefined,
): void {
  if (termination?.truncated === true || isTruncated(termination?.finishReason)) throw new DraftTruncatedError();
}
