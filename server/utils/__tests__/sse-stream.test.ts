/**
 * openSseStream keeps a stream alive past the edge's 60 s, and stops when the stream does (MR-03 Stage 6, OPS-17).
 *
 * Fake timers on a stand-in response for the schedule; a real socket for the
 * one thing a stand-in cannot show: on a POST, the request's own `close`
 * fires once its body is read, so a heartbeat tied to it would stop before
 * the first frame.
 */
import { EventEmitter } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SSE_HEARTBEAT_FRAME, SSE_HEARTBEAT_MS, openSseStream } from '../sse-stream';

class FakeResponse extends EventEmitter {
  status = 0;
  headers: Record<string, string> = {};
  frames: string[] = [];
  writableEnded = false;
  flushed = false;
  writeHead(status: number, headers: Record<string, string>) {
    this.status = status;
    this.headers = headers;
    return this;
  }
  flushHeaders() {
    this.flushed = true;
  }
  write(frame: string) {
    if (this.writableEnded) throw new Error('write after end');
    this.frames.push(frame);
    return true;
  }
  end() {
    this.writableEnded = true;
    this.emit('finish');
    this.emit('close');
  }
}

const open = (opts = {}) => {
  const res = new FakeResponse();
  const stream = openSseStream({} as Request, res as unknown as Response, opts);
  return { res, stream };
};
const heartbeats = (res: FakeResponse) => res.frames.filter((f) => f === SSE_HEARTBEAT_FRAME).length;

afterEach(() => {
  vi.useRealTimers();
});

describe('openSseStream', () => {
  it('sends the stream headers once, flushed, with no transform and no proxy buffering', () => {
    const { res } = open({ headers: { 'Access-Control-Allow-Origin': 'https://app.example.com' } });
    expect(res.status).toBe(200);
    expect(res.flushed).toBe(true);
    expect(res.headers).toEqual({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': 'https://app.example.com',
    });
  });

  it('writes a comment heartbeat every 15 s, so a silent minute never reaches the 60 s edge', () => {
    vi.useFakeTimers();
    const { res } = open();
    expect(SSE_HEARTBEAT_MS).toBe(15_000);
    vi.advanceTimersByTime(14_999);
    expect(heartbeats(res)).toBe(0);
    vi.advanceTimersByTime(1);
    expect(heartbeats(res)).toBe(1);
    vi.advanceTimersByTime(45_000);
    expect(heartbeats(res)).toBe(4);
    expect(SSE_HEARTBEAT_FRAME).toBe(': heartbeat\n\n');
  });

  it('stops when the producer ends the stream, and writes nothing after', () => {
    vi.useFakeTimers();
    const { res, stream } = open();
    stream.send({ type: 'done' }, 'done');
    stream.end();
    stream.end();
    vi.advanceTimersByTime(60_000);
    expect(res.frames).toEqual(['event: done\ndata: {"type":"done"}\n\n']);
    expect(stream.closed).toBe(true);
    expect(stream.send({ late: true })).toBe(false);
    expect(stream.write('data: x\n\n')).toBe(false);
  });

  it('stops when the client goes away, and reports the stream closed', () => {
    vi.useFakeTimers();
    const { res, stream } = open();
    vi.advanceTimersByTime(15_000);
    res.emit('close');
    vi.advanceTimersByTime(60_000);
    expect(heartbeats(res)).toBe(1);
    expect(stream.closed).toBe(true);
    expect(stream.send({ type: 'text' })).toBe(false);
  });

  it("stops when the producer ends the response itself (res.end())", () => {
    vi.useFakeTimers();
    const { res } = open();
    res.end();
    vi.advanceTimersByTime(60_000);
    expect(heartbeats(res)).toBe(0);
  });

  it("sends the heartbeat through the producer's own writer, when it has one", () => {
    vi.useFakeTimers();
    const through: string[] = [];
    const onHeartbeat = vi.fn();
    const { res, stream } = open({ write: (f: string) => through.push(f), onHeartbeat });
    stream.write('data: {"type":"text"}\n\n');
    vi.advanceTimersByTime(15_000);
    expect(through).toEqual(['data: {"type":"text"}\n\n', SSE_HEARTBEAT_FRAME]);
    expect(res.frames).toEqual([]);
    expect(onHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('stopHeartbeat stops the heartbeat and leaves the stream open', () => {
    vi.useFakeTimers();
    const { res, stream } = open();
    vi.advanceTimersByTime(15_000);
    stream.stopHeartbeat();
    vi.advanceTimersByTime(60_000);
    expect(heartbeats(res)).toBe(1);
    expect(stream.closed).toBe(false);
    expect(stream.send({ type: 'text' })).toBe(true);
    expect(res.writableEnded).toBe(false);
  });

  it('a send is one JSON frame: a payload cannot end the frame early', () => {
    const { res, stream } = open();
    stream.send({ content: 'line one\n\ndata: forged' });
    expect(res.frames).toEqual(['data: {"content":"line one\\n\\ndata: forged"}\n\n']);
  });

  it('a write that throws ends the heartbeat instead of escaping', () => {
    vi.useFakeTimers();
    const { res, stream } = open({ write: () => { throw new Error('EPIPE'); } });
    expect(stream.write('data: x\n\n')).toBe(false);
    expect(stream.closed).toBe(true);
    vi.advanceTimersByTime(30_000);
    expect(res.frames).toEqual([]);
  });
});

describe('on a real socket', () => {
  it('a POST stream keeps its heartbeat after the request body is read', async () => {
    const app = express();
    app.use(express.json());
    app.post('/stream', (req, res) => {
      const stream = openSseStream(req, res, { heartbeatMs: 40 });
      stream.send({ type: 'started', body: req.body });
      setTimeout(() => {
        stream.send({ type: 'done' });
        stream.end();
      }, 200);
    });
    const server = http.createServer(app).listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const body = await new Promise<string>((resolve, reject) => {
        const req = http.request({ port, method: 'POST', path: '/stream', headers: { 'Content-Type': 'application/json' } }, (res) => {
          expect(res.headers['content-type']).toBe('text/event-stream');
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { text += c; });
          res.on('end', () => resolve(text));
        });
        req.on('error', reject);
        req.end(JSON.stringify({ q: 1 }));
      });
      expect(body.startsWith('data: {"type":"started","body":{"q":1}}\n\n')).toBe(true);
      expect(body.split(SSE_HEARTBEAT_FRAME).length - 1).toBeGreaterThanOrEqual(3);
      expect(body.endsWith('data: {"type":"done"}\n\n')).toBe(true);
    } finally {
      server.close();
    }
  });
});
