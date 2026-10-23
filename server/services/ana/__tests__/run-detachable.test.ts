/**
 * Which turns go on when their page closes (AnA detach DT3, design §2.1, and
 * the reviews' G-2/G-4): a durable run (a row), with a person, whose
 * conversation is resolved — verified by beginRun, or minted and stamped on
 * the run. A run with no conversation could not be found again by thread, and
 * its notice could name nothing: it does not run on unseen.
 *
 * A turn that asked to drive the screen detaches like any other since the
 * founder's decision of 2026-10-22 (D-7): Live Drive is on by default, so the
 * old rule kept every default turn from detaching. Its screen actions after
 * the close are refused (stream.ts), not its other work.
 */
import { describe, expect, it } from 'vitest';
import { detachable } from '../run-status.js';

const durable = { runId: 'run_1', runUserId: 3, threadResolved: true };

describe('detachable', () => {
  it('a durable run with a person and a resolved conversation: detaches', () => {
    expect(detachable(durable)).toBe(true);
  });

  it('a turn that asked to drive the screen detaches too (D-7, decided 2026-10-22)', () => {
    expect(detachable({ ...durable, liveDriveRequested: true } as never)).toBe(true);
  });

  it.each([
    ['local-only (no run row)', { runId: '' }],
    ['no person', { runUserId: null }],
    ['no resolved conversation', { threadResolved: false }],
  ])('%s: stops on disconnect', (_name, over) => {
    expect(detachable({ ...durable, ...over })).toBe(false);
  });
});
