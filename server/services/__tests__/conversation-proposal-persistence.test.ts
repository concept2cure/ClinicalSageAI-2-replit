import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('../../../db', () => ({
  getPool: () => ({ query: queryMock }),
}));

// The persistence module imports '../../db' (resolves to server/db).
// vitest mocks are keyed by the import-specifier string, not the resolved
// path, so we need a second entry that matches the consumer's literal
// import path.
vi.mock('../../db', () => ({
  getPool: () => ({ query: queryMock }),
}));

import { conversationPersistence } from '../conversation-os/persistence';

describe('conversation proposal persistence consequence projection', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('hydrates proposal list with latest accepted governed consequence state', async () => {
    // listProposals now uses a single JOIN-style query — the governance
    // columns come back on the same row as the proposal.
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
