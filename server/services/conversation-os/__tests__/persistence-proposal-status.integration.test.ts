/**
 * updateProposalStatus — END-TO-END against in-process PGlite.
 *
 * QA-storm wave 5 (DB-integration): verifies the fix that makes
 * updateProposalStatus report whether a proposal was actually transitioned
 * (rowCount-based) instead of always returning true. No Neon/docker.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// Shared holder so the hoisted vi.mock factory and beforeAll can both reach it.
const h = vi.hoisted(() => ({ pool: null as null | { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number }> } }));

// Mock the db module that persistence.ts imports (server/db) to return a
// PGlite-backed pool that maps PGlite's affectedRows -> node-postgres rowCount.
vi.mock('../../../db', () => ({ getPool: () => h.pool }));

import { ConversationOsPersistence } from '../persistence';

const DDL = `
CREATE TABLE IF NOT EXISTS conversation_os_artifact_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;

let pglite: PGlite;
const ctx = { projectId: 'p1', conversationId: 'c1', userId: 'u1' };
const persistence = new ConversationOsPersistence();

async function seedProposal(id: string) {
  await pglite.query(
    `INSERT INTO conversation_os_artifact_proposals (id, project_id, conversation_id, user_id, artifact_id, content, status)
     VALUES ($1,$2,$3,$4,'art-1','body','pending')`,
    [id, ctx.projectId, ctx.conversationId, ctx.userId]
  );
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
  h.pool = {
    query: async (sql: string, params?: unknown[]) => {
      const r = await pglite.query(sql, params as any[]);
      return { rows: r.rows as any[], rowCount: (r as any).affectedRows ?? (r.rows as any[]).length };
    },
  };
});
afterAll(async () => {
  await pglite.close();
});
beforeEach(async () => {
  await pglite.exec('DELETE FROM conversation_os_artifact_proposals;');
});

describe('ConversationOsPersistence.updateProposalStatus (PGlite)', () => {
  it('returns true and transitions status when the proposal exists', async () => {
    await seedProposal('prop-1');
    const ok = await persistence.updateProposalStatus(ctx, 'prop-1', 'accepted');
    expect(ok).toBe(true);
    const after = await pglite.query(`SELECT status FROM conversation_os_artifact_proposals WHERE id = $1`, ['prop-1']);
    expect((after.rows[0] as any).status).toBe('accepted');
  });

  it('returns false when the proposal does not exist (no row updated)', async () => {
    const ok = await persistence.updateProposalStatus(ctx, 'does-not-exist', 'accepted');
    expect(ok).toBe(false);
  });

  it('returns false when the proposal belongs to a different conversation (scoped update)', async () => {
    await seedProposal('prop-2');
    const ok = await persistence.updateProposalStatus(
      { ...ctx, conversationId: 'other-conversation' },
      'prop-2',
      'rejected'
    );
    expect(ok).toBe(false);
    // original row untouched
    const after = await pglite.query(`SELECT status FROM conversation_os_artifact_proposals WHERE id = $1`, ['prop-2']);
    expect((after.rows[0] as any).status).toBe('pending');
  });
});
