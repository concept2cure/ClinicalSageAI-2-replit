// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TrackChanges, changeIdOf, collectSuggestions, decisionOf, proposeReplacement, type SuggestionRange } from '../suggestions';

const TURN = 'eeeeeeee-0000-4000-8000-000000000001';
const APP_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const APP_B = 'aaaaaaaa-0000-4000-8000-000000000002';
const ANA = { id: 'ana', name: 'AnA (proposed fix)', sourceRecord: TURN };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const editors: Editor[] = [];
type ApplicationRange = SuggestionRange & { applicationId?: string | null };

function makeEditor(content: string): Editor {
  const editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, TrackChanges], content });
  editors.push(editor);
  return editor;
}
function propose(editor: Editor, quote = '18 months', replacement = '24 months') {
  return proposeReplacement(editor, { quote, replacement, author: ANA });
}
function ranges(editor: Editor): ApplicationRange[] { return collectSuggestions(editor.state.doc); }

afterEach(() => { while (editors.length) editors.pop()?.destroy(); vi.useRealTimers(); });

describe('explicit proposal applications keep their own identity', () => {
  it('returns the UUID carried by every real mark without changing the source turn', () => {
    const editor = makeEditor('<p>Stable for 18 months.</p>');
    const result = propose(editor) as { ok: boolean; applicationId?: string };
    expect(result.ok).toBe(true);
    const marks = Array.from(editor.view.dom.querySelectorAll('ins,del'));
    expect(marks).toHaveLength(2);
    const identity = marks[0].getAttribute('data-application-id');
    expect(typeof identity, 'the applied redline has no durable application identity').toBe('string');
    expect(identity).toMatch(UUID);
    expect(result.applicationId).toBe(identity);
    expect(marks.map(mark => mark.getAttribute('data-application-id'))).toEqual([identity, identity]);
    expect(marks.map(mark => mark.getAttribute('data-source-record'))).toEqual([TURN, TURN]);
    expect(ranges(editor).map(range => range.applicationId)).toEqual([identity, identity]);
  });

  it('preserves distinct adjacent same-turn applications when serialized and reopened', () => {
    const editor = makeEditor(`<p><del data-author-id="ana" data-source-record="${TURN}" data-application-id="${APP_A}">alpha</del><del data-author-id="ana" data-source-record="${TURN}" data-application-id="${APP_B}">Beta</del></p>`);
    expect(ranges(editor).map(range => [range.text, range.applicationId])).toEqual([['alpha', APP_A], ['Beta', APP_B]]);
    const reopened = makeEditor(editor.getHTML());
    expect(ranges(reopened).map(range => [range.text, range.applicationId, range.sourceRecord])).toEqual([
      ['alpha', APP_A, TURN], ['Beta', APP_B, TURN],
    ]);
  });

  it('keeps actual adjacent deletion proposals separate within one turn and minute', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T11:00:03Z'));
    const editor = makeEditor('<p>alphaBeta</p>');
    expect(propose(editor, 'alpha', '').ok).toBe(true);
    expect(propose(editor, 'Beta', '').ok).toBe(true);
    const proposals = ranges(editor);
    expect(proposals.map(range => range.text), 'two independent applications merged into one review decision').toEqual(['alpha', 'Beta']);
    expect(new Set(proposals.map(range => range.applicationId)).size).toBe(2);
  });

  it('retains one application identity across a block replacement after reopening', () => {
    const editor = makeEditor('<p>Intro.</p><p>Old claim.</p><p>Closing.</p>');
    const result = propose(editor, 'Old claim.', '- First evidence check\n- Second evidence check') as { ok: boolean; applicationId?: string };
    expect(result.ok).toBe(true);
    const reopened = makeEditor(editor.getHTML());
    expect(reopened.view.dom.querySelectorAll('li')).toHaveLength(2);
    const identities = ranges(reopened).map(range => range.applicationId);
    expect(identities).toHaveLength(3);
    expect(identities.every(identity => typeof identity === 'string' && UUID.test(identity))).toBe(true);
    expect(new Set(identities)).toEqual(new Set([result.applicationId]));
    reopened.commands.resolveAllSuggestions('reject');
    expect(reopened.getHTML()).toBe('<p>Intro.</p><p>Old claim.</p><p>Closing.</p>');
  });

  it('gives reject/reapply/accept distinct decision IDs even in the same minute', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T11:00:03Z'));
    const editor = makeEditor('<p>Stable for 18 months.</p>');
    expect(propose(editor).ok).toBe(true);
    const rejected = ranges(editor).map(range => decisionOf(range, 'reject'));
    editor.commands.resolveAllSuggestions('reject');
    expect(editor.getHTML()).toBe('<p>Stable for 18 months.</p>');
    expect(propose(editor).ok).toBe(true);
    const accepted = ranges(editor).map(range => decisionOf(range, 'accept'));
    expect(accepted.map(decision => decision.changeId), 'retry would overwrite the rejected decision projection').not.toEqual(rejected.map(decision => decision.changeId));
    expect(rejected.every(decision => 'applicationId' in decision)).toBe(true);
    expect(accepted.every(decision => 'applicationId' in decision)).toBe(true);
    expect(accepted.map(decision => decision.sourceRecord)).toEqual([TURN, TURN]);
  });

  it('includes application identity in decision IDs while preserving legacy typing grouping', () => {
    const editor = makeEditor(`<p><ins data-author-id="writer" data-at="2026-10-14T11:00:00Z">old </ins><ins data-author-id="writer" data-at="2026-10-14T11:01:00Z">run</ins></p>`);
    const legacy = ranges(editor);
    expect(legacy).toHaveLength(1);
    expect(legacy[0].text).toBe('old run');
    const sameTextA: ApplicationRange = { ...legacy[0], applicationId: APP_A };
    const sameTextB: ApplicationRange = { ...legacy[0], applicationId: APP_B };
    expect(changeIdOf(sameTextA), 'independent applications share the same decision identity').not.toBe(changeIdOf(sameTextB));
    expect(changeIdOf({ ...legacy[0], applicationId: null } as ApplicationRange)).toBe(changeIdOf(legacy[0]));
  });
});
