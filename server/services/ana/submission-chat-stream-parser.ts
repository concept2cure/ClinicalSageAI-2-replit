/**
 * Tagged-output streaming parser for submission-chat.
 *
 * The streaming submission-chat path asks the model to emit a fixed sequence
 * of tagged sections so we can route incoming token deltas to the right SSE
 * channel as they arrive:
 *
 *   %%ANSWER%%
 *   <prose answer with [SRC-n] markers>
 *   %%REWRITE%%       (only present for rewrite intent)
 *   <new section content>
 *   %%STRUCTURE%%
 *   <one-shot JSON envelope: { intent, citations, rewriteMetadata }>
 *   %%END%%
 *
 * Why tagged sections instead of streaming JSON? JSON has no useful "partial"
 * representation — you can't render half-parsed JSON to the user as it
 * arrives. Plain text inside known sentinels lets us emit `delta` events to
 * the answer / rewrite channels in real time and parse the structured
 * metadata in a single pass after %%STRUCTURE%% closes.
 *
 * Markers are chosen to (a) not collide with the [SRC-n] citation syntax,
 * (b) be unambiguous when split across chunk boundaries, and (c) be
 * easy to write into a system prompt without escaping.
 *
 * The parser is pure: feed chunks via push(), get back batched deltas;
 * call finish() to flush the tail and read the accumulated section bodies.
 *
 * @module server/services/ana/submission-chat-stream-parser
 */

export type StreamChannel = 'answer' | 'rewrite';

export interface StreamDelta {
  channel: StreamChannel;
  content: string;
}

type ParseState = 'idle' | 'answer' | 'rewrite' | 'structure' | 'end';

const MARKERS = {
  answer: '%%ANSWER%%',
  rewrite: '%%REWRITE%%',
  structure: '%%STRUCTURE%%',
  end: '%%END%%',
} as const;

// What can transition each state, in priority order. Once a transition fires
// the parser advances and re-checks against the new state's allowed targets.
const TRANSITIONS: Record<ParseState, Array<keyof typeof MARKERS>> = {
  idle: ['answer'],
  answer: ['rewrite', 'structure'],
  rewrite: ['structure'],
  structure: ['end'],
  end: [],
};

const LONGEST_MARKER_LEN = Math.max(...Object.values(MARKERS).map(m => m.length));

export class TaggedStreamParser {
  private buffer = '';
  private state: ParseState = 'idle';
  private accumulated: Record<'answer' | 'rewrite' | 'structure', string> = {
    answer: '',
    rewrite: '',
    structure: '',
  };

  /**
   * Feed a streamed chunk. Returns the deltas that should be emitted to the
   * client right now. Buffers the trailing bytes that could be the start of
   * a marker so we never emit a fragment of a sentinel as user-visible text.
   */
  push(chunk: string): StreamDelta[] {
    if (!chunk) return [];
    this.buffer += chunk;
    const deltas: StreamDelta[] = [];
    while (this.advance(deltas)) {
      /* keep advancing until no more progress */
    }
    return deltas;
  }

  /**
   * Flush any remaining buffered bytes and return the accumulated section
   * bodies. Call once after the upstream stream closes.
   */
  finish(): {
    answer: string;
    rewrite: string;
    structure: string;
    tailDeltas: StreamDelta[];
  } {
    const tailDeltas: StreamDelta[] = [];
    if (this.buffer.length > 0) {
      this.flushAccordingToState(this.buffer, tailDeltas);
      this.buffer = '';
    }
    return {
      answer: this.accumulated.answer,
      rewrite: this.accumulated.rewrite,
      structure: this.accumulated.structure,
      tailDeltas,
    };
  }

  /** Current parse state — exposed for diagnostics / tests. */
  getState(): ParseState {
    return this.state;
  }

  private advance(deltas: StreamDelta[]): boolean {
    const allowed = TRANSITIONS[this.state];

    // Look for the first transition marker present in the buffer.
    let earliest: { idx: number; key: keyof typeof MARKERS } | null = null;
    for (const key of allowed) {
      const marker = MARKERS[key];
      const idx = this.buffer.indexOf(marker);
      if (idx !== -1 && (!earliest || idx < earliest.idx)) {
        earliest = { idx, key };
      }
    }

    if (earliest) {
      // Flush everything before the marker into the current section, then
      // advance past the marker and switch state.
      const before = this.buffer.slice(0, earliest.idx);
      this.flushAccordingToState(before, deltas);
      this.buffer = this.buffer.slice(earliest.idx + MARKERS[earliest.key].length);
      this.state = earliest.key;
      return true;
    }

    // No marker visible yet. Drain anything that can't possibly be the start
    // of one (i.e., everything except the last LONGEST_MARKER_LEN-1 chars).
    const safeDrainLen = Math.max(0, this.buffer.length - (LONGEST_MARKER_LEN - 1));
    if (safeDrainLen > 0) {
      const drainable = this.buffer.slice(0, safeDrainLen);
      this.buffer = this.buffer.slice(safeDrainLen);
      this.flushAccordingToState(drainable, deltas);
      return true;
    }
    return false;
  }

  private flushAccordingToState(text: string, deltas: StreamDelta[]): void {
    if (!text) return;
    switch (this.state) {
      case 'answer':
        this.accumulated.answer += text;
        deltas.push({ channel: 'answer', content: text });
        break;
      case 'rewrite':
        this.accumulated.rewrite += text;
        deltas.push({ channel: 'rewrite', content: text });
        break;
      case 'structure':
        this.accumulated.structure += text;
        break;
      case 'idle':
      case 'end':
        // Discard pre-section preamble and post-end trailer — the model
        // should never emit anything outside the section markers, but if
        // it does we don't surface it.
        break;
    }
  }
}
