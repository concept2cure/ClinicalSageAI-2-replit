/**
 * A draft that is already an authoring document is NOT written into
 * concept2cure_artifacts (WM, 2026-09-21, docs/design/ANA_DOCUMENT_CANVAS.md
 * decision 1: the authoring store is the one document store; the artifact
 * store keeps only non-document canvases).
 *
 * `draft_authoring_document` persists the document itself, in the same
 * transaction as its sections and provenance, and the stream's artifact_draft
 * event carries `authoringDocId`. Post-processing must then leave the
 * artifact version store alone — and must not warn that the draft "could not
 * be saved", because it was. A draft WITHOUT authoringDocId (generate_document,
 * a report canvas) keeps going through upsertDocumentArtifactVersion exactly
 * as before.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const store = vi.hoisted(() => ({ upsertDocumentArtifactVersion: vi.fn() }));
vi.mock('../../../services/ana/artifactVersionStore.js', () => store);

const db = vi.hoisted(() => ({ pool: { query: vi.fn() } }));
vi.mock('../../../db.js', () => db);

import { persistCollectedDrafts } from '../post-processing';

function fakeRes() {
  const written: string[] = [];
  return {
    written,
    writableEnded: false,
    write(chunk: string) { written.push(chunk); return true; },
    events() {
      return written.filter((w) => w.startsWith('data: ')).map((w) => JSON.parse(w.slice(6).trim()));
    },
  };
}

beforeEach(() => {
  store.upsertDocumentArtifactVersion.mockReset();
  store.upsertDocumentArtifactVersion.mockResolvedValue({ created: true, artifactId: 9, version: 1, contentHash: 'abc' });
});

describe('persistCollectedDrafts — authoring documents are not duplicated into concept2cure_artifacts', () => {
  it('writes NO artifact row for a draft that carries authoringDocId, and emits no caveat', async () => {
    const res = fakeRes();
    await persistCollectedDrafts({
      res: res as never,
      orgId: 7,
      streamProjectId: 42,
      userId: 3,
      threadId: 'thread_1',
      collectedDrafts: [
        { title: 'Module 2.5 Clinical Overview', content: '# Draft', authoringDocId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', programId: '11111111-1111-4111-8111-111111111111' },
      ],
    });
    expect(store.upsertDocumentArtifactVersion).not.toHaveBeenCalled();
    expect(res.events()).toEqual([]);
  });

  it('still versions a draft WITHOUT authoringDocId (report canvases, generate_document) as before', async () => {
    const res = fakeRes();
    await persistCollectedDrafts({
      res: res as never,
      orgId: 7,
      streamProjectId: 42,
      userId: 3,
      threadId: 'thread_1',
      collectedDrafts: [{ title: 'Portfolio readiness report', content: '# Report' }],
    });
    expect(store.upsertDocumentArtifactVersion).toHaveBeenCalledTimes(1);
    expect(res.events().map((e) => e.type)).toEqual(['artifact_version_saved']);
  });

  it('a mixed turn: the authoring document is skipped and the other draft is versioned', async () => {
    const res = fakeRes();
    await persistCollectedDrafts({
      res: res as never,
      orgId: 7,
      streamProjectId: 42,
      userId: 3,
      threadId: 'thread_1',
      collectedDrafts: [
        { title: 'Authoring doc', content: 'x', authoringDocId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
        { title: 'Report', content: 'y' },
      ],
    });
    expect(store.upsertDocumentArtifactVersion).toHaveBeenCalledTimes(1);
    expect(store.upsertDocumentArtifactVersion.mock.calls[0][0]).toMatchObject({ title: 'Report' });
  });

  it('does not warn "could not be saved" for an authoring document when no project is linked — it WAS saved', async () => {
    const res = fakeRes();
    await persistCollectedDrafts({
      res: res as never,
      orgId: 7,
      streamProjectId: null,
      userId: 3,
      threadId: 'thread_1',
      collectedDrafts: [{ title: 'Authoring doc', content: 'x', authoringDocId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }],
    });
    expect(res.events().filter((e) => e.type === 'warning')).toEqual([]);
  });
});
