import { describe, it, expect } from 'vitest';
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

describe('AssemblyLine', () => {
  it('creates, edits, and polishes a document', async () => {
    const db = createMockDb();
    const a = new AssemblyLine(db as any);

    const startRes = await a.start('hello world');
    expect(startRes).toHaveProperty('docId');

    const docId = startRes.docId;
    const editRes = await a.humanEdit(docId, 'human edit');
    expect(editRes.status).toBe('saved');

    const polishRes = await a.polish(docId, 'make it concise');
    expect(polishRes.status).toBe('polished');
    expect(polishRes.content).toContain('AI added: make it concise');
  });

  it('throws on missing db', () => {
    // @ts-ignore - intentional
    expect(() => new AssemblyLine(null)).toThrow();
  });
});
