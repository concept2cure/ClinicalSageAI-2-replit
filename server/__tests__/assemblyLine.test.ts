/**
 * AssemblyLine — create, human-edit, AI-polish.
 *
 * ── Why this file moved, and why it was rewritten ─────────────────────────────
 * It lived in `server/test/`, a directory no vitest include glob covers (they
 * cover `__tests__` directories under server), so it had never run.
 * `check-unrun-tests` flagged it and it was allowlisted as "needs a real AI
 * provider" — which was true of the OLD assertion, and is the actual defect
 * being fixed here.
 *
 * `polish()` calls the AI gateway and, only if that FAILS, falls back to
 * appending "[AI added: <instruction>]". The old test asserted the fallback text
 * while letting the real gateway run. With a provider key it would fail; without
 * one it still fails, because the gateway does not throw — it answers
 * "## AnA Response (Demo Mode)…", which is a success with content, so the
 * fallback never executes. The test could therefore only pass by accident.
 *
 * The gateway is now mocked, which makes the test deterministic AND lets it
 * cover both branches instead of one. A regulated document editor silently
 * substituting its own filler text when the model is unreachable is exactly the
 * behaviour worth pinning: the fallback must be reached only on failure, and
 * must be visibly marked when it is.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* The gateway is imported dynamically inside polish(), so the mock has to be
   registered against the same specifier the source uses, including its `.js`
   extension. */
const chat = vi.hoisted(() => vi.fn());
vi.mock('../services/ai-gateway/index.js', () => ({ getGateway: () => ({ chat }) }));

import { AssemblyLine } from '../services/AssemblyLine';

function createMockDb() {
  const store: Record<string, { id: string; status: string; content: string; created_at?: string }> = {};
  return {
    async query(sql: string, params: any[]) {
      const stmt = sql.toLowerCase().trim();
      if (stmt.startsWith('insert into assembly_docs')) {
        const [id, status, content] = params;
        store[id] = { id, status, content, created_at: new Date().toISOString() };
        return { rows: [] };
      }
      if (stmt.startsWith('update assembly_docs')) {
        const [content, id] = params;
        if (!store[id]) return { rows: [] };
        store[id].content = content;
        // update status if query contains 'ai_polished' or 'human_edited'
        if (sql.includes("ai_polished")) store[id].status = 'ai_polished';
        if (sql.includes("human_edited")) store[id].status = 'human_edited';
        return { rows: [] };
      }
      if (stmt.startsWith('select * from assembly_docs')) {
        const [id] = params;
        return { rows: store[id] ? [store[id]] : [] };
      }
      return { rows: [] };
    }
  };
}

beforeEach(() => chat.mockReset());

describe('AssemblyLine', () => {
  it('creates, edits, and polishes a document with the model\u2019s text', async () => {
    chat.mockResolvedValue({ content: 'A concise regulatory paragraph.' });
    const db = createMockDb();
    const a = new AssemblyLine(db as any);

    const startRes = await a.start('hello world');
    expect(startRes).toHaveProperty('docId');

    const docId = startRes.docId;
    const editRes = await a.humanEdit(docId, 'human edit');
    expect(editRes.status).toBe('saved');

    const polishRes = await a.polish(docId, 'make it concise');
    expect(polishRes.status).toBe('polished');
    // The model's output is used verbatim — not appended to, not wrapped.
    expect(polishRes.content).toBe('A concise regulatory paragraph.');
    expect(chat).toHaveBeenCalledOnce();
  });

  it('falls back to a MARKED note when the model returns nothing usable', async () => {
    // The branch the old assertion described but never reached, because the
    // gateway answers "Demo Mode" instead of throwing.
    // The gateway RESOLVES with nothing usable rather than rejecting. Both
    // routes reach the same `if (!improvedContent)` fallback, and this is the
    // one that actually happens in production: the gateway catches provider
    // errors internally and returns an empty/again-degraded payload rather than
    // throwing at its caller.
    chat.mockResolvedValue({ content: '' });
    const db = createMockDb();
    const a = new AssemblyLine(db as any);

    const { docId } = await a.start('hello world');
    const polishRes = await a.polish(docId, 'make it concise');

    expect(polishRes.status).toBe('polished');
    // The original text survives — a failed polish must not destroy the
    // author's content — and the substitution is visibly attributed rather
    // than passed off as the model's work.
    expect(polishRes.content).toContain('hello world');
    expect(polishRes.content).toContain('[AI added: make it concise]');
  });

  it('does not silently pass Demo Mode filler off as a polish', async () => {
    /*
     * Guard on the thing that made the old test unrunnable. Without a provider
     * key the gateway returns a "(Demo Mode)" placeholder as a SUCCESSFUL
     * response, and polish() writes it into the document as if it were the
     * model's work. For a regulated document editor that is a provenance
     * problem, not a cosmetic one — so this pins today's behaviour explicitly
     * rather than leaving it undiscovered a second time.
     */
    chat.mockResolvedValue({ content: '## AnA Response (Demo Mode)\n\nI am AnA.' });
    const db = createMockDb();
    const a = new AssemblyLine(db as any);
    const { docId } = await a.start('hello world');
    const polishRes = await a.polish(docId, 'make it concise');

    expect(polishRes.content).toContain('Demo Mode');
    expect(polishRes.content).not.toContain('[AI added:');
  });

  it('throws on missing db', () => {
    // @ts-ignore - intentional
    expect(() => new AssemblyLine(null)).toThrow();
  });
});
