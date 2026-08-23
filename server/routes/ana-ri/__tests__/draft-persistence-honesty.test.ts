/**
 * A draft that did not reach the version history must not look like one that did.
 *
 * WHAT WENT WRONG
 * AnA announces the deliverable — the rail renders "Drafted <title>" the moment
 * the draft is produced — and `persistCollectedDrafts` writes it to the governed
 * artifact version history afterwards. When that write threw, the entire
 * response was:
 *
 *     console.warn('[AnA RI Stream] Draft version persistence failed:', …)
 *
 * A server-side log line. The client was told nothing, so the turn closed with
 * the deliverable on screen and no version row behind it. Someone could leave
 * the session believing a draft was durably recorded when it was not — the
 * product overstating what it did, in a Part 11 context.
 *
 * THE CONTRACT, AND WHY IT IS ASYMMETRIC
 * Three different situations produce no `artifact_version_saved` event: missing
 * project context, an unchanged content hash (`saved.created === false`,
 * nothing new to record), and a database failure. The unchanged hash is the
 * only silent one — nothing was overstated. A database failure AND a missing
 * project both warn: in each case the rail already says "Drafted <title>", so
 * silence would leave the user believing a version row exists when none does.
 *
 * PROJECT-ID PARSING (ADR-0011)
 * The old guard was `Number.parseInt(streamProjectId, 10)`. For a
 * `regulatory_programs` UUID beginning with digits that returns those digits —
 * `parseInt('7abb1c22-…') === 7` — so a draft from a UUID-keyed program
 * conversation was filed under integer project 7: a valid, WRONG row. The
 * parse is now the fail-closed `parseIntegerProjectId`, and a genuine program
 * UUID resolves through the `projects.regulatory_program_id` anchor instead.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// mockImplementation(async () => { throw }) rather than mockRejectedValue:
// the latter builds the rejected promise at setup time, so it is reported as
// an unhandled rejection even though the code under test catches it — which
// reads as a failing test rather than a passing one.
const store = vi.hoisted(() => ({ upsertDocumentArtifactVersion: vi.fn() }));
vi.mock('../../../services/ana/artifactVersionStore.js', () => store);

// The program→project anchor lookup (`projects.regulatory_program_id`) runs
// only when the stream carries a program UUID.
const db = vi.hoisted(() => ({ pool: { query: vi.fn() } }));
vi.mock('../../../db.js', () => db);

import { persistCollectedDrafts } from '../post-processing';

/** A minimal SSE sink that records what was written. */
function fakeRes() {
  const written: string[] = [];
  return {
    written,
    writableEnded: false,
    write(chunk: string) { written.push(chunk); return true; },
    events() {
      return written
        .filter(w => w.startsWith('data: '))
        .map(w => JSON.parse(w.slice(6).trim()));
    },
  };
}

const ctx = (res: any) => ({
  res: res as any,
  orgId: 7,
  streamProjectId: 42,
  userId: 3,
  threadId: 'thread_1',
  collectedDrafts: [{ title: 'Clinical Overview 2.5', content: '# Draft' }],
});

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  store.upsertDocumentArtifactVersion.mockReset();
  /* The function under test logs the real cause before composing the customer
     sentence, and that log is part of the contract — an operator needs the
     database error the caveat deliberately withholds. It is captured here
     rather than left to print, and asserted below.

     It also has to be captured for these tests to run at all: with a
     `beforeEach` present, this runner reports the error thrown inside the mock
     as a test failure even though the code under test catches it (verified by
     bisection — no `beforeEach` passes, `mockReset` and `mockClear` both fail,
     and installing this spy makes it pass either way). The mechanism is not
     established; what is established is that the production path is correct,
     which a standalone probe confirmed directly: the catch runs, the caveat is
     written, and nothing escapes. */
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('persistCollectedDrafts — it never overstates what was recorded', () => {
  it('says so when the draft could not be saved', async () => {
    store.upsertDocumentArtifactVersion.mockImplementation(async () => { throw new Error('deadlock detected'); });
    const res = fakeRes();

    await persistCollectedDrafts(ctx(res));

    const warning = res.events().find(e => e.type === 'warning');
    expect(warning).toBeTruthy();
    expect(warning.message).toContain('Clinical Overview 2.5');
    expect(warning.message).toContain('could not be saved');
  });

  it('keeps the database error out of the customer sentence', async () => {
    store.upsertDocumentArtifactVersion.mockImplementation(async () => { throw new Error('deadlock detected on relation document_artifact_versions'); });
    const res = fakeRes();

    await persistCollectedDrafts(ctx(res));

    const text = res.written.join('');
    expect(text).not.toContain('deadlock');
    expect(text).not.toContain('document_artifact_versions');
  });

  it('gives the operator the cause it withholds from the customer', async () => {
    // The split is the point: the log carries the database error so a failure
    // can be diagnosed, and the sentence on screen does not.
    store.upsertDocumentArtifactVersion.mockImplementation(async () => {
      throw new Error('deadlock detected on relation document_artifact_versions');
    });
    const res = fakeRes();

    await persistCollectedDrafts(ctx(res));

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('deadlock detected');
    expect(res.written.join('')).not.toContain('deadlock');
  });

  it('a failed save never stops the turn from closing', async () => {
    store.upsertDocumentArtifactVersion.mockImplementation(async () => { throw new Error('boom'); });
    const res = fakeRes();

    // A caveat that prevented post_done would be worse than the defect it reports.
    await expect(persistCollectedDrafts(ctx(res))).resolves.toBeUndefined();
  });

  it('survives a client that has already disconnected', async () => {
    store.upsertDocumentArtifactVersion.mockImplementation(async () => { throw new Error('boom'); });
    const res = fakeRes();
    res.writableEnded = true;

    await expect(persistCollectedDrafts(ctx(res))).resolves.toBeUndefined();
    expect(res.events().find(e => e.type === 'warning')).toBeUndefined();
  });

  it('announces the version when the save really happened', async () => {
    store.upsertDocumentArtifactVersion.mockResolvedValue({
      created: true, artifactId: 'art_1', version: 3, contentHash: 'h',
    });
    const res = fakeRes();

    await persistCollectedDrafts(ctx(res));

    const saved = res.events().find(e => e.type === 'artifact_version_saved');
    expect(saved.artifactId).toBe('art_1');
    expect(saved.version).toBe(3);
    expect(res.events().find(e => e.type === 'warning')).toBeUndefined();
  });

  it('an unchanged draft is not a failure, and is not reported as one', async () => {
    // Same content hash — nothing new to record. Silence is correct here.
    store.upsertDocumentArtifactVersion.mockResolvedValue({ created: false, artifactId: 'art_1', version: 3 });
    const res = fakeRes();

    await persistCollectedDrafts(ctx(res));

    expect(res.events().find(e => e.type === 'warning')).toBeUndefined();
    expect(res.events().find(e => e.type === 'artifact_version_saved')).toBeUndefined();
  });

  it('a missing project no longer skips silently — the client is told the save did not happen', async () => {
    const res = fakeRes();

    await persistCollectedDrafts({ ...ctx(res), streamProjectId: null });

    expect(store.upsertDocumentArtifactVersion).not.toHaveBeenCalled();
    const warning = res.events().find(e => e.type === 'warning');
    expect(warning).toBeTruthy();
    expect(warning.message).toContain('Clinical Overview 2.5');
    expect(warning.message).toMatch(/no project/i);
  });

  it('a program UUID resolves through the projects anchor and the draft IS saved', async () => {
    db.pool.query.mockResolvedValueOnce({ rows: [{ id: 88 }] });
    store.upsertDocumentArtifactVersion.mockResolvedValue({
      created: true, artifactId: 'art_9', version: 1, contentHash: 'h',
    });
    const res = fakeRes();

    await persistCollectedDrafts({
      ...ctx(res),
      streamProjectId: 'aabb1c22-1234-4abc-8def-0123456789ab',
    });

    expect(store.upsertDocumentArtifactVersion).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 88 }),
    );
    expect(res.events().find(e => e.type === 'artifact_version_saved')).toBeTruthy();
  });

  it('a UUID with leading digits NEVER files to the integer project those digits spell', async () => {
    // parseInt('7abb1c22-…') === 7 — the ADR-0011 Class-A coercion. With no
    // anchor row, the only honest outcomes are: no save, and a warning.
    db.pool.query.mockResolvedValueOnce({ rows: [] });
    const res = fakeRes();

    await persistCollectedDrafts({
      ...ctx(res),
      streamProjectId: '7abb1c22-1234-4abc-8def-0123456789ab',
    });

    expect(store.upsertDocumentArtifactVersion).not.toHaveBeenCalled();
    const warning = res.events().find(e => e.type === 'warning');
    expect(warning).toBeTruthy();
    expect(warning.message).toMatch(/no project/i);
  });
});
