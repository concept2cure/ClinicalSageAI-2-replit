/**
 * The notes a model writes between tool calls, on the models that return them
 * as thinking blocks.
 *
 * On Opus 5 a note like "Here is the Vault, where every source is tracked…"
 * comes back as a `text` block, and that is how AnA narrates a demonstration:
 * a talking point, then the move. On Opus 5.5 (and Fable 5.1, Mythos 5.1,
 * Fable 5) a note longer than a sentence or two comes back as a
 * progress-update `thinking` block instead, and under the default display,
 * "omitted", its text is empty. No request fails. AnA just stops talking: the
 * screens move, and what she was asked to say at a stop never arrives (claude-api
 * skill, shared/model-migration.md, "Text between tool calls comes back in
 * thinking blocks").
 *
 * The documented fix is display "updates" (beta
 * thinking-display-updates-2026-08-18): reasoning stays hidden, and each note
 * comes back as a short summary in its thinking block — "any `thinking` block
 * with non-empty text is a progress update". Those are her words, so the
 * gateway returns them as text, where the note stood on Opus 5.
 *
 * Only when the request has not asked for visible reasoning. With thinking
 * enabled the display stays "summarized", which is what fills AnA's reasoning
 * panel; the notes arrive there too, mixed into the summary, so they are
 * shown, though not as her words. Under "updates" that summary would be gone.
 */
import type { GatewayRequest, ModelConfig } from './types.js';

export const PROGRESS_UPDATES_BETA = 'thinking-display-updates-2026-08-18';

/**
 * The text a progress block carries in place of work a response stopped
 * before finishing. It is the API's placeholder, not a note, so it is never
 * shown as AnA's words.
 */
export const INTERRUPTED_WORK_TEXT = 'This part of the response was interrupted before it finished.';

/** Whether this request asks for the notes between tool calls as progress updates. */
export function wantsProgressUpdates(
  modelConfig: Pick<ModelConfig, 'thinkingMode' | 'progressUpdatesInThinking'>,
  request: Pick<GatewayRequest, 'thinking' | 'tools'>
): boolean {
  return (
    modelConfig.thinkingMode === 'adaptive' &&
    modelConfig.progressUpdatesInThinking === true &&
    !request.thinking?.enabled &&
    (request.tools?.length ?? 0) > 0
  );
}

/**
 * `piece` as the next paragraph after `sofar`. Text that would run straight on
 * from the last sentence ("…on screen.Stop 2: …") gets a paragraph break;
 * text already separated by whitespace is left as it is.
 */
export function asParagraph(sofar: string, piece: string): string {
  return sofar && piece && !/\s$/.test(sofar) && !/^\s/.test(piece) ? `\n\n${piece}` : piece;
}

/** Adds a beta to a request's `anthropic-beta` header, keeping any already there. */
export function addBetaHeader(options: Record<string, unknown>, beta: string): void {
  const headers = (options.headers as Record<string, string> | undefined) ?? {};
  const betas = (headers['anthropic-beta'] ?? '')
    .split(',')
    .map(b => b.trim())
    .filter(Boolean);
  if (!betas.includes(beta)) betas.push(beta);
  options.headers = { ...headers, 'anthropic-beta': betas.join(',') };
}

/**
 * Reads one response's progress blocks as narration. Inactive, it takes
 * nothing, and every thinking block stays reasoning.
 *
 * A streamed block's text is held until the block closes, so the placeholder
 * for interrupted work is recognised whole and never shown in part.
 */
export class ProgressNotes {
  private readonly held = new Map<number, string>();
  private afterNote = false;

  constructor(readonly active: boolean) {}

  /** A streamed content block opened. */
  opened(index: number, type: string | undefined): void {
    if (this.active && type === 'thinking') this.held.set(index, '');
  }

  /** A streamed thinking fragment. True when it belongs to a note, so the caller does not treat it as reasoning. */
  took(index: number, fragment: string): boolean {
    const sofar = this.held.get(index);
    if (sofar === undefined) return false;
    this.held.set(index, sofar + fragment);
    return true;
  }

  /** A streamed block closed: the note to append to `content`, or ''. */
  closed(index: number, content: string): string {
    const text = this.held.get(index);
    if (text === undefined) return '';
    this.held.delete(index);
    return this.note(text, content);
  }

  /** A whole thinking block, read as a note: what to append to `content`, or ''. */
  note(text: string, content: string): string {
    const note = text.trim();
    if (!this.active || !note || note === INTERRUPTED_WORK_TEXT) return '';
    this.afterNote = true;
    return asParagraph(content, note);
  }

  /** Answer text, starting its own paragraph when it follows a note. */
  text(chunk: string, content: string): string {
    if (!this.afterNote || !chunk) return chunk;
    this.afterNote = false;
    return asParagraph(content, chunk);
  }
}
