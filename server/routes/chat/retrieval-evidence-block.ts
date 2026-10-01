/**
 * The retrieved-evidence block of the chat system prompt (STEP 5 of
 * send-message.ts).
 *
 * A search that could not run is said to be unavailable (P1-54; the P1-45
 * review's R2, 2026-10-01). It used to add nothing, exactly as a search that
 * found nothing, so the model answered as if the organisation's documents had
 * been searched: an error rendered as an empty result. With the production
 * provider election (P1-45) an unelected tenant's embedding is refused until
 * the self-hosted lane is deployed, which made that the common case.
 */
export interface RetrievedSource {
  title: string;
  content: string;
}

/** Whether the knowledge base was searched, or the search could not run. */
export type RetrievalStatus = 'searched' | 'unavailable';

export function evidencePromptBlock(sources: readonly RetrievedSource[], status: RetrievalStatus = 'searched'): string {
  if (status === 'unavailable') {
    return (
      '\n\n--- KNOWLEDGE-BASE SEARCH UNAVAILABLE ---\n' +
      "The organisation's knowledge base could not be searched for this answer. Say so plainly at the start of " +
      "your answer. Do not tell the person the search found nothing, and do not present the answer as " +
      "grounded in the organisation's documents.\n"
    );
  }
  if (sources.length === 0) return '';
  return (
    '\n\n--- RETRIEVED EVIDENCE (cite as [SRC-n]) ---\n' +
    sources.map((s, i) => `[SRC-${i + 1}] "${s.title}"\n${s.content}`).join('\n\n') +
    '\n--- END EVIDENCE ---\n\n' +
    'When your answer relies on information from the evidence above, cite it inline using [SRC-n]. ' +
    'If the evidence does not contain relevant information, answer from your training knowledge and state that no knowledge-base sources were found.'
  );
}
