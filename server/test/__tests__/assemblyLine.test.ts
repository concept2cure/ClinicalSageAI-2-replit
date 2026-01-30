import { describe, it, expect } from 'vitest';
import { AssemblyLine } from '../../services/AssemblyLine';

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
        const [contentOrAddition, id] = params;
        if (!store[id]) return { rows: [] };
        if (sql.toLowerCase().includes('returning')) {
          store[id].content = (store[id].content || '') + contentOrAddition;
          if (sql.includes("ai_polished")) store[id].status = 'ai_polished';
          return { rows: [{ content: store[id].content }] };
        }

        store[id].content = contentOrAddition;
        if (sql.includes("ai_polished")) store[id].status = 'ai_polished';
        if (sql.includes("human_edited")) store[id].status = 'human_edited';
        return { rows: [] };
      }
      if (stmt.startsWith('select * from assembly_docs')) {
        const [id] = params;
        return { rows: store[id] ? [store[id]] : [] };
      }

      if (stmt.startsWith('insert into assembly_audit_logs')) {
        const [id, doc_id, provider, model, request_text, response_text] = params;
        store[doc_id].audit = store[doc_id].audit || [];
        store[doc_id].audit.push({ id, provider, model, request_text, response_text });
        return { rows: [] };
      }

      return { rows: [] };
    }
  };
}

describe('AssemblyLine', () => {
  it('creates, edits, and polishes a document', async () => {
    const db = createMockDb();
    const a = new AssemblyLine(db as any);

    const startRes = await a.start('hello world');
    expect(startRes).toHaveProperty('docId');

    const docId = startRes.docId;
    const editRes = await a.humanEdit(docId, 'human edit');
    expect(editRes.status).toBe('saved');

    // Mock AI provider
    const oldKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test';
    vi.mock('../../services/openai-service', () => ({ analyzeText: vi.fn().mockResolvedValue('AI-polished content') }));

    const polishResAI = await a.polish(docId, 'make it concise');
    expect(polishResAI.status).toBe('polished');
    expect(polishResAI.content).toBe('AI-polished content');

    // Verify audit log was written
    expect(Object.values(store).some(s => s.audit && s.audit.length > 0)).toBe(true);

    // restore
    process.env.OPENAI_API_KEY = oldKey;
  });

  it('throws on missing db', () => {
    // @ts-ignore - intentional
    expect(() => new AssemblyLine(null)).toThrow();
  });
});
