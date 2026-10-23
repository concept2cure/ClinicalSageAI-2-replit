/** Actual PostgreSQL predicates on PGlite; vector bindings use a named test adapter. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  pg: null as PGlite | null, calls: [] as Array<{ sql: string; params: unknown[] }>,
  vectorRows: [] as Array<Record<string, unknown>>, gateway: vi.fn(),
}));
vi.mock('../../db.js', () => ({ pool: { query: async (sql: string, params: unknown[] = []) => {
  h.calls.push({ sql, params });
  // PGlite is not loaded with pgvector here. Only this branch is a binding unit control.
  if (sql.includes('<=>')) return { rows: h.vectorRows };
  return h.pg!.query(sql, params);
} } }));
vi.mock('../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: async () => ({ embedding: [1, 0, 0] }) }) }));
vi.mock('../ai-gateway/gateway.js', () => ({ getGateway: () => ({ route: h.gateway }) }));
vi.mock('../chat-thread-helpers.js', () => ({ getThreadMessages: async () => [] }));
import { getLatestWorkingMemory, getLatestWorkingMemoryByThread, needsWorkingMemoryRefreshByThread,
  searchWorkingMemorySemantic, summarizeAndStoreWorkingMemoryForThread } from '../working-memory';
const THREAD = 'synthetic-shared-thread';
beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`CREATE TABLE conversation_working_memory (
    id serial PRIMARY KEY,conversation_id int,thread_id text,organization_id int,project_id int,
    summary text,structured_data jsonb,message_count_at_generation int,generated_at timestamptz DEFAULT now()
  )`);
});
afterAll(async () => { await h.pg?.close(); });
beforeEach(async () => {
  vi.stubEnv('ENABLE_SEMANTIC_WORKING_MEMORY', 'false');
  h.calls = []; h.vectorRows = []; h.gateway.mockReset().mockResolvedValue({ content: '{}' });
  await h.pg!.exec('TRUNCATE conversation_working_memory RESTART IDENTITY');
  for (const [project, org, summary, day] of [[41,7,'PROJECT_A_PRIVATE_FACT',1],[42,7,'PROJECT_B_FACT',2],
    [null,7,'UNATTRIBUTED_PORTFOLIO_FACT',3],[41,8,'FOREIGN_ORG_FACT',4]] as const) {
    await h.pg!.query(`INSERT INTO conversation_working_memory(conversation_id,thread_id,organization_id,project_id,summary,
      structured_data,message_count_at_generation,generated_at) VALUES(1,$1,$2,$3,$4,'{}',100,$5)`,
    [THREAD, org, project, summary, `2026-10-0${day}T00:00:00Z`]);
  }
});

describe('exact stored project recall before ordering and limiting', () => {
  it('reads older A and B independently, never the newer unattributed or foreign row', async () => {
    expect(await getLatestWorkingMemoryByThread(THREAD,7,{ projectId:41 })).toBe('PROJECT_A_PRIVATE_FACT');
    expect(await getLatestWorkingMemoryByThread(THREAD,7,{ projectId:42 })).toBe('PROJECT_B_FACT');
    expect(await getLatestWorkingMemoryByThread(THREAD,7,{ projectId:43 })).toBeNull();
  });
  it('a fresh switch to B with only A and NULL summaries has no prior summary', async () => {
    await h.pg!.query('DELETE FROM conversation_working_memory WHERE project_id=42');
    expect(await getLatestWorkingMemoryByThread(THREAD,7,{ projectId:42 })).toBeNull();
    expect(await needsWorkingMemoryRefreshByThread(THREAD,7,20,{ projectId:42 })).toBe(true);
  });
  it('preserves the old organization/thread caller when no project selector is supplied', async () => {
    expect(await getLatestWorkingMemoryByThread(THREAD,7)).toBe('UNATTRIBUTED_PORTFOLIO_FACT');
    expect(await getLatestWorkingMemoryByThread(THREAD,8)).toBe('FOREIGN_ORG_FACT');
    expect(await getLatestWorkingMemoryByThread('different-thread',7,{ projectId:41 })).toBeNull();
  });
  it('rejects an invalid explicit selector without issuing an unscoped recall', async () => {
    for (const projectId of [0,-1,NaN,1.5,Number.MAX_SAFE_INTEGER+1]) {
      expect(await getLatestWorkingMemoryByThread(THREAD,7,{ projectId })).toBeNull();
    }
    expect(h.calls).toHaveLength(0);
  });
  it('retains the actual project id in a structured row read', async () => {
    const row = await getLatestWorkingMemory(1,8);
    expect(row).toMatchObject({ projectId:41, summary:'FOREIGN_ORG_FACT' });
  });
  it('a selected policy-column failure cannot retry the unscoped query', async () => {
    await h.pg!.exec('ALTER TABLE conversation_working_memory RENAME COLUMN project_id TO retained_project_id');
    try {
      expect(await getLatestWorkingMemoryByThread(THREAD,7,{ projectId:41 })).toBeNull();
      expect(h.calls).toHaveLength(1); expect(h.calls[0].sql).toContain('project_id');
      expect(await getLatestWorkingMemoryByThread(THREAD,7)).toBe('UNATTRIBUTED_PORTFOLIO_FACT');
      expect(await needsWorkingMemoryRefreshByThread(THREAD,7,120)).toBe(true);
    } finally { await h.pg!.exec('ALTER TABLE conversation_working_memory RENAME COLUMN retained_project_id TO project_id'); }
  });
});

describe('project binding at semantic and writeback seams', () => {
  it('binds the exact project alongside vector/thread/organization and returns its stored identity', async () => {
    vi.stubEnv('ENABLE_SEMANTIC_WORKING_MEMORY', 'true');
    h.vectorRows = [{ id:2,summary:'PROJECT_B_FACT',project_id:42,similarity:0.9,generated_at:'2026-10-02' }];
    const hits = await searchWorkingMemorySemantic(THREAD,7,'current status',{ limit:1,projectId:42 });
    expect(hits).toEqual([expect.objectContaining({ projectId:42,summary:'PROJECT_B_FACT' })]);
    const query = h.calls.find(call => call.sql.includes('<=>'))!;
    expect(query.sql).toMatch(/project_id\s*=\s*\$6/); expect(query.params[5]).toBe(42);
    h.calls = [];
    await searchWorkingMemorySemantic(THREAD,7,'current status',{ limit:1 });
    const unselected = h.calls.find(call => call.sql.includes('<=>'))!;
    expect(unselected.sql).not.toMatch(/AND project_id/);
    expect(unselected.params).toHaveLength(5);
  });
  it('a B writeback neither inherits A nor unattributed prior summaries and retains B on its new row', async () => {
    await h.pg!.query('DELETE FROM conversation_working_memory WHERE project_id=42');
    await summarizeAndStoreWorkingMemoryForThread({ threadId:THREAD,organizationId:7,projectId:42,
      messages:Array.from({ length:20 },() => ({ role:'user',content:'Discuss only the currently selected synthetic B project.' })) });
    expect(h.gateway).toHaveBeenCalledTimes(1);
    const prompt = JSON.stringify(h.gateway.mock.calls[0]);
    expect(prompt).not.toMatch(/PROJECT_A_PRIVATE_FACT|UNATTRIBUTED_PORTFOLIO_FACT|FOREIGN_ORG_FACT/);
    const inserted = await h.pg!.query<{ project_id: number }>('SELECT project_id FROM conversation_working_memory ORDER BY id DESC LIMIT 1');
    expect(inserted.rows[0].project_id).toBe(42);
  });
});
