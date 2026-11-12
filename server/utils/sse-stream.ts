/**
 * Open a server-sent event stream: the one way this server does it (MR-03 Stage 6 step 7, OPS-17).
 *
 * Behind CloudFront and the ALB a connection that carries nothing for 60 s is
 * closed (terraform/modules/cloudfront origin_read_timeout, modules/alb
 * idle_timeout). A stream that is waiting on a model's first token, a long
 * context assembly or a background job's next progress event goes silent for
 * longer than that, and the client sees the stream cut, mid-answer. Ten
 * routes opened a stream, each with its own headers; two sent a heartbeat.
 *
 * This writes the headers once, flushes them, and writes an SSE comment
 * (`: heartbeat`) every 15 s, which every client's frame parser ignores and
 * every intermediary counts as traffic. The heartbeat stops when the response
 * finishes or its connection closes. It listens on the RESPONSE: a request's
 * own `close` fires once its body has been read, so for a POST stream it
 * would stop the heartbeat before the first frame.
 *
 * scripts/ci/check-sse-heartbeat.mjs refuses a server file other than this one
 * that sets `text/event-stream`.
 */
import type { Request, Response } from 'express';

export const SSE_HEARTBEAT_MS = 15_000;
export const SSE_HEARTBEAT_FRAME = ': heartbeat\n\n';

export interface SseStreamOptions {
  /** Headers added to the stream's own (CORS headers, for example). */
  headers?: Record<string, string>;
  /**
   * The producer's own frame writer, when frames pass through something on
   * their way out (the AnA stream's private-output buffer). The heartbeat
   * travels the same way. Default: the response.
   */
  write?: (frame: string) => unknown;
  /** Called after each heartbeat is written (a caller tracking activity). */
  onHeartbeat?: () => void;
  /** Test seam; production uses SSE_HEARTBEAT_MS. */
  heartbeatMs?: number;
}

export interface SseStream {
  /** True once the response finished, or its connection closed. */
  readonly closed: boolean;
  /**
   * One JSON event: `data: <json>`, with `event: <name>` when a name is given.
   * The payload is JSON-encoded, so it cannot end the frame early. Returns
   * false, writing nothing, once the stream is closed.
   */
  send(data: unknown, event?: string): boolean;
  /** A frame the producer has already framed. False, writing nothing, once closed. */
  write(frame: string): boolean;
  /**
   * Stop the heartbeat and leave the response as it is: a producer that keeps
   * the stream open but no longer wants it kept alive (a run that detaches
   * from its page). Frames can still be written.
   */
  stopHeartbeat(): void;
  /** Stop the heartbeat and end the response, once. */
  end(): void;
}

export function openSseStream(_req: Request, res: Response, options: SseStreamOptions = {}): SseStream {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx and other buffering proxies pass each frame on as it is written.
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
    ...options.headers,
  });
  res.flushHeaders?.();

  let closed = false;
  const out = options.write ?? ((frame: string) => res.write(frame));
  const stopHeartbeat = () => clearInterval(heartbeat);
  const heartbeat = setInterval(() => {
    if (closed || res.writableEnded) return stop();
    try {
      out(SSE_HEARTBEAT_FRAME);
      options.onHeartbeat?.();
    } catch {
      stop();
    }
  }, options.heartbeatMs ?? SSE_HEARTBEAT_MS);
  heartbeat.unref?.();

  function stop(): void {
    closed = true;
    stopHeartbeat();
  }
  res.on('close', stop);
  res.on('finish', stop);

  const write = (frame: string): boolean => {
    if (closed || res.writableEnded) return false;
    try {
      out(frame);
      return true;
    } catch {
      stop();
      return false;
    }
  };

  return {
    get closed() {
      return closed || res.writableEnded;
    },
    send(data, event) {
      return write(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`);
    },
    write,
    stopHeartbeat,
    end() {
      stop();
      if (!res.writableEnded) res.end();
    },
  };
}
