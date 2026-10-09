/**
 * Document provenance, said honestly.
 *
 * `authoring_documents.provenance` (WM's additive column, returned by
 * GET /api/authoring/docs/:id) records where a document's content came from:
 * `{ source: 'ana' | 'seed' | 'import', conversationId?, turnId?, model?,
 * note?, authorName? }`. This module turns that record into the one line the
 * canvas and the workbench header show — and it claims exactly what the
 * record holds. A document AnA drafted names the model the gateway reported
 * or says the model was not recorded; a seeded demo document says so; a
 * document with no record gets NO origin line rather than a guessed one.
 */

export type ProvenanceSource = 'ana' | 'seed' | 'import' | 'human';

export interface DocumentProvenance {
  source: ProvenanceSource;
  /** The sentence the header renders. */
  line: string;
  model: string | null;
  conversationId: string | null;
  turnId: string | null;
  authorName: string | null;
  note: string | null;
}

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

/**
 * @param raw  The stored provenance JSON, or anything else (null → null).
 * @param opts.inThisConversation  The host knows the document was drafted in
 *   the conversation on screen (the draft event arrived in this thread), so
 *   the line may say "in this conversation" rather than "in a conversation".
 */
export function describeProvenance(
  raw: unknown,
  opts: { inThisConversation?: boolean } = {},
): DocumentProvenance | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const source = str(r.source)?.toLowerCase() ?? null;
  const model = str(r.model);
  const conversationId = str(r.conversationId ?? r.conversation_id);
  const turnId = str(r.turnId ?? r.turn_id);
  const authorName = str(r.authorName ?? r.author_name ?? r.author);
  const note = str(r.note);

  if (source === 'ana') {
    const where = opts.inThisConversation
      ? 'in this conversation'
      : conversationId
        ? 'in a conversation'
        : '';
    const who = model ? `model ${model}` : 'model not recorded';
    return {
      source: 'ana',
      line: `Drafted by AnA${where ? ` ${where}` : ''} · ${who}`,
      model,
      conversationId,
      turnId,
      authorName,
      note,
    };
  }
  if (source === 'seed') {
    return {
      source: 'seed',
      line: 'Seeded demo content' + (note ? ` · ${note}` : ''),
      model: null,
      conversationId: null,
      turnId: null,
      authorName,
      note,
    };
  }
  if (source === 'import') {
    return {
      source: 'import',
      line: 'Imported' + (note ? ` · ${note}` : ''),
      model: null,
      conversationId: null,
      turnId: null,
      authorName,
      note,
    };
  }
  if ((source === 'human' || source === 'author' || source === null) && authorName) {
    return {
      source: 'human',
      line: `Authored by ${authorName}`,
      model: null,
      conversationId: null,
      turnId: null,
      authorName,
      note,
    };
  }
  return null;
}
