import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

// vi.mock resolves the path relative to this test file. The persistence
// service imports `'../../db.ts'` (server/db.ts) from server/services/conversation-os/
// — from this test file (server/services/__tests__/) the same target is
// `'../../db.ts'`. Previously specified `'../../../db.ts'` resolved to
// repo-root /db.ts (nonexistent), so the mock never applied and getPool()
// fell through to the live pool.
vi.mock('../../db.ts', () => ({
  getPool: () => ({ query: queryMock }),
  pool: { query: queryMock },
  getDb: () => ({}),
  db: {},
}));

import { conversationPersistence } from '../conversation-os/persistence';

describe('conversation proposal persistence consequence projection', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('hydrates proposal list with latest accepted governed consequence state', async () => {
    // listProposals now hydrates the governed consequence projection in a
    // single query via LATERAL JOIN against conversation_os_artifact_versions
    // (see persistence.ts:247). The mock returns the joined row directly
    // rather than two sequential responses.
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'prop_1',
          conversation_id: 'conv_1',
          artifact_id: 'artifact_governed_1',
          content: 'draft',
          status: 'accepted',
          created_at: new Date('2026-03-27T00:00:00.000Z'),
          artifact_version: 3,
          artifact_status: 'review',
          placement_state: 'm5',
          provenance_event_id: 'prov_1',
          audit_id: 'audit_1',
          governance_state: 'ACCEPTED_GOVERNED',
        },
      ],
    });

    const proposals = await conversationPersistence.listProposals({
      projectId: '55',
      conversationId: 'conv_1',
      userId: '77',
    });

    expect(proposals[0]).toMatchObject({
      id: 'prop_1',
      artifactId: 'artifact_governed_1',
      governanceState: 'ACCEPTED_GOVERNED',
      artifactVersion: 3,
      artifactStatus: 'review',
      placementState: 'm5',
      provenanceRef: 'prov_1',
      auditRef: 'audit_1',
    });
  });
});
