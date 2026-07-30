import { describe, it, expect, vi } from 'vitest';
import {
  bridgeAuthoringToCanonical,
  authoringThreadKey,
  type AuthoringBridgeDeps,
} from '../authoring-canonical-bridge.js';

function deps(overrides: Partial<AuthoringBridgeDeps> = {}): AuthoringBridgeDeps {
  return {
    async loadDocumentSnapshot() {
      return { title: 'Clinical Overview', content: '## 2.5 — Overview\n\nBody text', module: '2.5' };
    },
    async commit(req) {
      return {
        artifactId: 'artifact_9',
        artifactPk: 9,
        version: 2,
        created: true,
        contentHash: 'h',
        status: 'review',
        ctdSection: req.ctdSection ?? null,
        actionId: 'act',
        auditId: 'aud',
        provenanceLinks: 0,
        readiness: 60,
        steps: ['version', 'ai_action', 'audit', 'review', 'placement', 'readiness', 'ui_refresh'],
      };
    },
    ...overrides,
  };
}

const base = {
  docId: 'doc-1',
  organizationId: 1,
  projectId: 10,
  userId: 5,
  reason: 'Submitted for review by user@x',
  triggerReview: true,
};

describe('authoring-canonical-bridge', () => {
  it('builds a stable per-document thread key', () => {
    expect(authoringThreadKey('doc-1')).toBe('authoring:doc-1');
  });

  it('bridges into the spine when project + numeric actor + content are present', async () => {
    const commit = vi.fn(deps().commit);
    const outcome = await bridgeAuthoringToCanonical(base, deps({ commit }));
    expect(outcome.bridged).toBe(true);
    expect(outcome.result?.status).toBe('review');
    const req = commit.mock.calls[0][0];
    expect(req.anaThreadId).toBe('authoring:doc-1');
    expect(req.projectId).toBe(10);
    expect(req.userId).toBe(5);
    expect(req.content).toContain('Overview');
    expect(req.triggerReview).toBe(true);
  });

  it('falls back to the document module for placement when no ctd_section given', async () => {
    const commit = vi.fn(deps().commit);
    await bridgeAuthoringToCanonical(base, deps({ commit }));
    expect(commit.mock.calls[0][0].ctdSection).toBe('2.5');
  });

  it('skips (no write) when there is no project context', async () => {
    const commit = vi.fn(deps().commit);
    const outcome = await bridgeAuthoringToCanonical({ ...base, projectId: null }, deps({ commit }));
    expect(outcome.bridged).toBe(false);
    expect(outcome.reason).toMatch(/project/i);
    expect(commit).not.toHaveBeenCalled();
  });

  it('skips when the actor is not a numeric users.id (protects Part 11 attribution)', async () => {
    const commit = vi.fn(deps().commit);
    const outcome = await bridgeAuthoringToCanonical(
      { ...base, userId: NaN as unknown as number },
      deps({ commit }),
    );
    expect(outcome.bridged).toBe(false);
    expect(outcome.reason).toMatch(/attribut/i);
    expect(commit).not.toHaveBeenCalled();
  });

  it('skips when the document has no assembled content', async () => {
    const outcome = await bridgeAuthoringToCanonical(
      base,
      deps({ async loadDocumentSnapshot() { return { title: 'Empty', content: '   ' }; } }),
    );
    expect(outcome.bridged).toBe(false);
    expect(outcome.reason).toMatch(/content/i);
  });

  it('never throws — a spine failure is reported as a skip', async () => {
    const outcome = await bridgeAuthoringToCanonical(
      base,
      deps({ async commit() { throw new Error('db down'); } }),
    );
    expect(outcome.bridged).toBe(false);
    expect(outcome.reason).toMatch(/db down/);
  });
});
