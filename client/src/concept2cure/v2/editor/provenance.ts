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

/**
 * Was the document's module assumed rather than chosen? The server stores M2
 * and records `moduleDefaulted: true` when a document is created without a
 * module (`authoring-from-draft.ts`): AnA's draft tool called without one, or
 * a draft opened as a document. "M2" alone would then read as a decision
 * nobody made, so a statistical analysis plan would show as Module 2.
 */
export function moduleWasAssumed(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && (raw as Record<string, unknown>).moduleDefaulted === true;
}

/** What the save found of a drafted document's figures in the sources it cites (S5a). */
export interface FigureCheckSummary {
  checked: number;
  found: number;
  unverified: number;
  /** The figures no cited source states, each with its section, as recorded. */
  unverifiedItems: Array<{ section: string; text: string }>;
  /** The record kept fewer findings than it counted. */
  truncated: boolean;
}

/**
 * The drafted-figure check the save recorded in `projectSourceReferences`
 * (authoring/draft-figure-check.ts): each figure of a section that cites
 * sources, found in them or unverified. Null when nothing was checked (no
 * section cited a source, or the document predates the check), so the editor
 * says nothing rather than "0 unverified", which would read as all clear.
 */
/** One section's recorded check, added into the summary. */
function addSection(summary: FigureCheckSummary, sectionCode: unknown, f: Record<string, unknown>): void {
  summary.checked += Number(f.checked) || 0;
  summary.found += Number(f.found) || 0;
  summary.unverified += Number(f.unverified) || 0;
  summary.truncated ||= f.truncated === true;
  const items = Array.isArray(f.figures) ? (f.figures as Array<Record<string, unknown>>) : [];
  for (const item of items.filter((i) => i?.status === 'unverified')) {
    summary.unverifiedItems.push({ section: String(sectionCode ?? ''), text: String(item.text ?? '') });
  }
}

export function describeFigureCheck(raw: unknown): FigureCheckSummary | null {
  const refs = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).projectSourceReferences : null;
  if (!Array.isArray(refs)) return null;
  const summary: FigureCheckSummary = { checked: 0, found: 0, unverified: 0, unverifiedItems: [], truncated: false };
  const checked = (refs as Array<Record<string, unknown>>).filter((r) => r?.figures && typeof r.figures === 'object');
  for (const ref of checked) addSection(summary, ref.sectionCode, ref.figures as Record<string, unknown>);
  return checked.length > 0 ? summary : null;
}
