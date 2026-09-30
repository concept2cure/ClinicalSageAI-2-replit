/**
 * @fileoverview When a model's stream has been silent for too long.
 * @module server/services/ai-gateway/stream-stall
 *
 * Silence means different things at different points of a stream. Text is
 * streamed as it is written, so half a minute without a chunk while text is
 * streaming is a dead stream. Everywhere else, silence is the model working:
 *
 *   - An adaptive model thinks before it writes. Opus 5.5 always does, Opus 5
 *     and Sonnet 5 do unless told not to, and with the default display
 *     ("omitted") none of the thinking is streamed.
 *   - A tool's arguments are buffered until complete unless the tool sets
 *     eager input streaming, which none here do.
 *   - The model can think again between blocks, before its next call.
 *   - An OpenAI-compatible or local server reads the whole prompt, and a
 *     reasoning model reasons, before its first token.
 *
 * The Anthropic API sends `ping` events through all of this, but its SDK
 * drops them before they reach the gateway (@anthropic-ai/sdk
 * core/streaming.js), so this work looked exactly like a hang. One 30-second
 * limit over the whole stream cut off every turn whose model thought for
 * longer. The SDK ends an aborted stream without an error, so the turn closed
 * with no answer and no move, and was reported as finished.
 */

/** Silence while text is streaming: the stream is dead. */
export const WRITING_STALL_MS = 30_000;
/** Silence anywhere else: the model is working, up to this long. */
export const WORKING_STALL_MS = 5 * 60_000;
const CHECK_EVERY_MS = 5_000;

export interface StreamStallWatch {
  /** A chunk arrived. */
  chunk(): void;
  /** Text started (true) or stopped (false) streaming. */
  writing(on: boolean): void;
  /** Whether the watch fired. */
  readonly stalled: boolean;
  stop(): void;
}

/**
 * Watch a stream for silence: `onStall` runs once, with how long it was
 * silent and whether text was streaming, when the silence passes the limit
 * for the phase the stream is in.
 */
export function watchStreamForStall(
  onStall: (silentMs: number, writing: boolean) => void,
  now: () => number = Date.now,
): StreamStallWatch {
  let lastChunkAt = now();
  let isWriting = false;
  let fired = false;
  const timer = setInterval(() => {
    const silentMs = now() - lastChunkAt;
    if (silentMs <= (isWriting ? WRITING_STALL_MS : WORKING_STALL_MS)) return;
    fired = true;
    clearInterval(timer);
    onStall(silentMs, isWriting);
  }, CHECK_EVERY_MS);
  return {
    chunk() {
      lastChunkAt = now();
    },
    writing(on) {
      isWriting = on;
    },
    get stalled() {
      return fired;
    },
    stop() {
      clearInterval(timer);
    },
  };
}

/**
 * A stream that went silent before the model produced anything: no text, no
 * tool call. Thrown rather than returned as an empty answer, so the fallback
 * chain tries the next model and a turn that nothing could answer ends as an
 * error the person can see, not as a blank reply.
 */
export class GatewayStreamStalledError extends Error {
  constructor(
    readonly provider: string,
    readonly model: string,
    readonly silentMs: number,
  ) {
    super(
      `${provider}/${model} went silent for ${Math.round(silentMs / 1000)}s before it produced ` +
        'any text or tool call, so the stream was stopped.',
    );
    this.name = 'GatewayStreamStalledError';
  }
}
