/**
 * An uploaded document's tagging records what actually tagged it.
 *
 * Until 2026-09-23 every upload wrote metadata.aiTagging.model = 'gpt-4o' — a
 * literal; the call is routed by task type and usually served by Claude — and
 * when the model failed, the keyword fallback's output was stored under that
 * same label with an invented confidence of 0.6 and, if no keyword matched, an
 * invented category 'bench_test'. The Part 11 audit entry carried the same
 * confidence and a hard-coded ipAddress of '127.0.0.1'.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const S = vi.hoisted(() => ({
  chat: vi.fn(),
  inserted: [] as Array<Record<string, any>>,
  audited: [] as Array<Record<string, any>>,
}));

vi.mock('../../db', () => ({
  db: {
    insert: () => ({
      values: (row: Record<string, any>) => {
        S.inserted.push(row);
        return { returning: async () => [{ id: 1, ...row }] };
      },
    }),
  },
}));
vi.mock('../auditService.js', () => ({
  default: { logAction: async (e: Record<string, any>) => void S.audited.push(e) },
}));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: S.chat } }));

import { documentDataCenterService } from '../DocumentDataCenterService';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddc-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function upload(text: string) {
  const file = path.join(dir, `f-${S.inserted.length}.txt`);
  fs.writeFileSync(file, text);
  return documentDataCenterService.uploadDocument(
    9,
    { path: file, originalname: 'notes.txt', mimetype: 'text/plain', size: text.length } as never,
    { userId: '1' }
  );
}

beforeEach(() => {
  S.chat.mockReset();
  S.inserted.length = 0;
  S.audited.length = 0;
});

describe('document data center tagging provenance', () => {
  it('a model tagging records the provider and model that served it', async () => {
    S.chat.mockResolvedValue({
      content: JSON.stringify({ categories: ['biocompatibility'], testStandards: [], components: [], suggestedTags: ['iso'], confidence: 0.9 }),
      provider: 'anthropic',
      model: 'claude-sonnet-5',
    });

    const r = await upload('Biocompatibility testing per ISO 10993-1.');

    expect(S.inserted[0].metadata.aiTagging).toMatchObject({
      method: 'model',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      confidence: 0.9,
    });
    expect(S.audited[0].metadata).toMatchObject({ taggingMethod: 'model', taggingModel: 'claude-sonnet-5' });
    expect(r.message).toMatch(/tagged by the model/);
  });

  it('the keyword fallback is recorded as keyword tagging: no model, no confidence, no invented category', async () => {
    S.chat.mockImplementation(async () => {
      throw new Error('provider unavailable');
    });

    const r = await upload('Meeting notes with nothing device-specific in them.');

    const row = S.inserted[0];
    expect(row.metadata.aiTagging).toMatchObject({ method: 'keyword', provider: null, model: null, confidence: null });
    expect(row.categories).toEqual([]);
    expect(row.category).toBe('uncategorized');
    expect(row.tags.some((t: string) => t.startsWith('confidence:'))).toBe(false);
    expect(S.audited[0].metadata).toMatchObject({ taggingMethod: 'keyword', taggingModel: null, aiConfidence: null });
    expect(r.message).toMatch(/keyword match/);
  });

  it('no literal model name or fabricated IP address is written on any path', async () => {
    S.chat.mockImplementation(async () => {
      throw new Error('provider unavailable');
    });
    await upload('notes');
    expect(JSON.stringify(S.inserted)).not.toMatch(/gpt-4o/);
    expect(S.audited[0].ipAddress).toBeUndefined();
  });
});
