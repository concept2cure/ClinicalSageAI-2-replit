/**
 * Tracked-change decisions — recording who refused a redline.
 *
 * Three routes have persisted accept/reject decisions to
 * `authoring_tracked_change_decisions` since it was migrated in, with an audit
 * event alongside. None had a caller. The gap that closes is specific: an
 * ACCEPTED change reaches the record indirectly, because its text lands in the
 * next revision. A REJECTED change alters nothing, so "the reviewer considered
 * and refused this deletion" existed nowhere at all.
 *
 * The identifier is the whole design problem, and these tests pin why it is
 * derived from content rather than stored on the mark:
 *
 *   - Storing a fresh id per mark breaks redline merging. ProseMirror merges
 *     adjacent marks only when their attrs are equal, and one continuous
 *     typing run is deliberately ONE suggestion, so a per-keystroke id would
 *     shatter a sentence into per-character suggestions.
 *   - Deriving it from the merge key alone (kind + author + minute) preserves
 *     merging but collides across two separate runs in the same minute — and
 *     the table's UNIQUE (artifact_id, change_id, tenant_id) means the second
 *     decision would silently overwrite the first. Losing a reviewer's verdict
 *     is worse than recording nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  changeIdOf,
  decisionOf,
  notifyResolved,
  type SuggestionRange,
} from '../editor/suggestions';

const range = (over: Partial<SuggestionRange> = {}): SuggestionRange => ({
  from: 1,
  to: 10,
  kind: 'insertion',
  authorId: 'u1',
  authorName: 'R. Author',
  at: '2026-08-24T16:30:00Z',
  text: 'the proposed sentence',
  ...over,
});

describe('changeIdOf', () => {
  it('is stable for the same change — the id must survive a round trip', () => {
    expect(changeIdOf(range())).toBe(changeIdOf(range()));
    // Position is not identity: the same change shifts as text above it edits.
    expect(changeIdOf(range({ from: 400, to: 409 }))).toBe(changeIdOf(range()));
  });

  it('separates two runs by the same author in the same minute', () => {
    // The collision that would overwrite one reviewer decision with another.
    const a = changeIdOf(range({ text: 'first proposed run' }));
    const b = changeIdOf(range({ text: 'second proposed run' }));
    expect(a).not.toBe(b);
  });

  it('separates an insertion from a deletion of identical text', () => {
    // Accepting a proposed insertion and accepting a proposed deletion of the
    // same words are opposite acts. They must not share a record.
    expect(changeIdOf(range({ kind: 'insertion' }))).not.toBe(
      changeIdOf(range({ kind: 'deletion' })),
    );
  });

  it('separates the same text proposed by different authors', () => {
    expect(changeIdOf(range({ authorId: 'u1' }))).not.toBe(changeIdOf(range({ authorId: 'u2' })));
  });

  it('separates the same text proposed in different minutes', () => {
    expect(changeIdOf(range({ at: '2026-08-24T16:30:00Z' }))).not.toBe(
      changeIdOf(range({ at: '2026-08-24T16:31:00Z' })),
    );
  });

  it('carries its kind in the clear, so a row is legible without a join', () => {
    expect(changeIdOf(range({ kind: 'deletion' })).startsWith('deletion:')).toBe(true);
  });

  it('tolerates a suggestion with no recorded author or timestamp', () => {
    // Legacy redlines parsed from stored HTML can carry neither.
    const id = changeIdOf(range({ authorId: null, at: null }));
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan('insertion:'.length);
  });
});

describe('decisionOf', () => {
  it('carries the text, because accepting a change destroys it', () => {
    const d = decisionOf(range(), 'accept');
    // resolveSuggestion strips the mark, so by the time anyone reads the row
    // the document no longer holds the words the id names.
    expect(d.text).toBe('the proposed sentence');
    expect(d.changeType).toBe('insertion');
    expect(d.decision).toBe('accept');
    expect(d.changeId).toBe(changeIdOf(range()));
  });

  it('records a rejection, which changes no text and is otherwise unrecorded', () => {
    const d = decisionOf(range({ kind: 'deletion', text: 'the safety paragraph' }), 'reject');
    expect(d.decision).toBe('reject');
    expect(d.changeType).toBe('deletion');
    expect(d.text).toBe('the safety paragraph');
  });

  it('keeps the proposer distinct from the decider', () => {
    // The decider is the audit row's actor. A redline record that cannot tell
    // the two apart says nothing about review.
    const d = decisionOf(range({ authorId: 'ana', authorName: 'AnA (AI draft)' }), 'accept');
    expect(d.authorId).toBe('ana');
    expect(d.authorName).toBe('AnA (AI draft)');
  });
});

describe('notifyResolved', () => {
  it('never lets a failing recorder undo the edit the reviewer just made', () => {
    // This callback posts to a network. A throw here propagates out of a
    // ProseMirror command and aborts the transaction, so the reviewer's click
    // would appear to do nothing — the recording of a decision undoing the
    // decision. Swallowed on purpose; the host reports the failure itself.
    expect(() =>
      notifyResolved(
        () => {
          throw new Error('network down');
        },
        range(),
        'reject',
      ),
    ).not.toThrow();
  });

  it('hands the host a complete decision', () => {
    const seen: unknown[] = [];
    notifyResolved(d => seen.push(d), range({ text: 'words' }), 'accept');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ decision: 'accept', text: 'words', changeType: 'insertion' });
  });

  it('is a no-op when no host is listening', () => {
    expect(() => notifyResolved(undefined, range(), 'accept')).not.toThrow();
  });
});

/* ── The other half: a record nobody can read is not a record ───────────── */
import { describeAuditMetadata } from '../surfaces/DocumentAuthoring';

describe('describeAuditMetadata', () => {
  it('reads a rejection back as a sentence naming what was refused', () => {
    const text = describeAuditMetadata('tracked_change_decision', {
      changeId: 'deletion:abc',
      decision: 'reject',
      changeType: 'deletion',
      text: 'Patients with hepatic impairment were excluded.',
      proposedBy: 'R. Author',
    });
    expect(text).toMatch(/rejected a proposed deletion/i);
    expect(text).toMatch(/proposed by R\. Author/);
    // The quoted words are what make the id resolvable at all.
    expect(text).toMatch(/Patients with hepatic impairment were excluded\./);
  });

  it('surfaces the model behind an accepted AI draft, and that it was edited', () => {
    const text = describeAuditMetadata('UPDATE', {
      source: 'ai-draft-accept',
      generator: { model: 'claude-x', provider: 'anthropic' },
      draft_modified_on_accept: true,
    });
    expect(text).toMatch(/generated by claude-x · anthropic/);
    expect(text).toMatch(/not the model’s wording/i);
  });

  it('says so when an accepted draft names no generating model', () => {
    const text = describeAuditMetadata('UPDATE', {
      source: 'ai-draft-accept',
      generator: null,
      draft_modified_on_accept: false,
    });
    expect(text).toMatch(/generating model was not recorded/i);
    expect(text).not.toMatch(/edited before accepting/i);
  });

  it('leaves unrecognised metadata alone rather than dumping a payload', () => {
    expect(describeAuditMetadata('EDIT', { some: 'internal', shape: 42 })).toBeNull();
    expect(describeAuditMetadata('EDIT', null)).toBeNull();
    // A decision row with no verdict is not a decision.
    expect(describeAuditMetadata('tracked_change_decision', { changeId: 'x' })).toBeNull();
  });
});

describe('describeAuditMetadata — bulk decisions', () => {
  it('reads a bulk rejection back with its count and a sample', () => {
    const text = describeAuditMetadata('tracked_change_bulk_decision', {
      decision: 'reject',
      count: 12,
      changes: [
        { changeId: 'a', changeType: 'deletion', text: 'the safety paragraph' },
        { changeId: 'b', changeType: 'insertion', text: 'a new claim' },
      ],
    });
    expect(text).toMatch(/rejected 12 tracked changes in one action/i);
    expect(text).toMatch(/the safety paragraph/);
  });

  it('admits when the stored summary was capped', () => {
    // A truncated record that reads as complete is the failure mode here.
    const text = describeAuditMetadata('tracked_change_bulk_decision', {
      decision: 'accept',
      count: 50,
      changes: [{ changeId: 'a', changeType: 'insertion', text: 'first' }],
      changesOmittedFromSummary: 30,
    });
    expect(text).toMatch(/30 more not summarised on this row/);
  });

  it('is null when the row carries no verdict or no count', () => {
    expect(describeAuditMetadata('tracked_change_bulk_decision', { count: 3 })).toBeNull();
    expect(describeAuditMetadata('tracked_change_bulk_decision', { decision: 'accept' })).toBeNull();
  });
});
