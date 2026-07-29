import { describe, expect, it, vi } from 'vitest';

// Prevent the real db / gateway from loading when the module is imported.
vi.mock('../../db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../services/ai-gateway/gateway', () => ({
  getGateway: () => ({ getEnabledProviders: () => [], route: vi.fn() }),
}));

import {
  chunkText,
  buildContextMessages,
  contextualizeDocument,
} from '../../services/projects/contextual-ingest';

describe('chunkText', () => {
  it('returns [] for empty/blank text or non-positive size', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
    expect(chunkText('abc', { size: 0 })).toEqual([]);
  });

  it('returns a single chunk when the text fits the size', () => {
    const chunks = chunkText('hello world', { size: 100, overlap: 10 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ ordinal: 0, text: 'hello world', start: 0, end: 11 });
  });

  it('splits into overlapping chunks with sequential ordinals', () => {
    const chunks = chunkText('abcdefghij', { size: 4, overlap: 1 }); // step = 3 → starts 0,3,6
    expect(chunks.map(c => c.ordinal)).toEqual([0, 1, 2]);
    expect(chunks[0].text).toBe('abcd');
    expect(chunks[1].text).toBe('defg'); // overlaps 'd'
    expect(chunks[chunks.length - 1].end).toBe(10);
  });

  it('respects maxChunks', () => {
    const chunks = chunkText('x'.repeat(1000), { size: 10, overlap: 0, maxChunks: 5 });
    expect(chunks).toHaveLength(5);
  });
});

describe('buildContextMessages', () => {
  it('produces system + user messages including the title, excerpt, and chunk', () => {
    const msgs = buildContextMessages('Device Description', 'EXCERPT', 'CHUNK');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].content).toContain('Device Description');
    expect(msgs[1].content).toContain('EXCERPT');
    expect(msgs[1].content).toContain('CHUNK');
  });
});

describe('contextualizeDocument', () => {
  it('prepends the generated context to each chunk', async () => {
    const gen = vi.fn(async () => 'CTX');
    const out = await contextualizeDocument('Title', 'abcdefgh', { size: 4, overlap: 0 }, gen);
    expect(out.length).toBe(2);
    expect(out.every(c => c.contextualizedText.startsWith('CTX\n\n'))).toBe(true);
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it('leaves the chunk text unchanged when context generation returns empty', async () => {
    const gen = vi.fn(async () => '');
    const out = await contextualizeDocument('Title', 'abcdefgh', { size: 4, overlap: 0 }, gen);
    expect(out[0].contextualizedText).toBe('abcd');
  });

  it('is graceful when the context generator throws', async () => {
    const gen = vi.fn(async () => {
      throw new Error('gateway down');
    });
    const out = await contextualizeDocument('Title', 'abcd', { size: 4, overlap: 0 }, gen);
    expect(out[0].contextualizedText).toBe('abcd');
  });

  it('returns [] for empty text without invoking the generator', async () => {
    const gen = vi.fn(async () => 'CTX');
    expect(await contextualizeDocument('Title', '', {}, gen)).toEqual([]);
    expect(gen).not.toHaveBeenCalled();
  });
});
