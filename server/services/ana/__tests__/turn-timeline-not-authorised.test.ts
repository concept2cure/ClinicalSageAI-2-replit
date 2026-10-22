/**
 * The count a detached turn's "finished" notice says — "{n} step(s) were not
 * authorised and did not run." (AnA detach §2.7, §5.5) — is the steps a person
 * did not authorise: declined, unanswered, or only a person's to take. A step
 * refused because the person asked for a read-only answer (2aa766a76) is held
 * back too, but nobody declined it, so it is not counted (DT3 review: the
 * wrong cause).
 */
import { describe, expect, it } from 'vitest';
import { TurnTimeline } from '../turn-timeline-emitter.js';

const shown = { label: 'Saving the plan', source: 'vault' as const, preview: null };
const call = (id: string) => ({ id, name: 'save_document_to_vault', input: {} });

describe('TurnTimeline.heldBackCount', () => {
  it('counts the steps a person did not authorise, and not a read-only refusal', () => {
    const events: Array<Record<string, unknown>> = [];
    const t = new TurnTimeline({
      write: frame => events.push(JSON.parse(frame.replace(/^data: /, '').trim()).event ?? JSON.parse(frame.replace(/^data: /, '').trim())),
      recorder: () => null,
    });
    t.finished(1, call('a'), { ...shown, status: 'error', heldBack: true, ms: 0, startedAt: 0 });
    t.finished(1, call('b'), { ...shown, status: 'error', heldBack: true, readOnly: true, ms: 0, startedAt: 0 });
    t.finished(1, call('c'), { ...shown, status: 'success', heldBack: false, ms: 0, startedAt: 0 });
    expect(t.heldBackCount()).toBe(1);
    const readOnly = events.filter(e => e.phase === 'finished' && e.readOnly === true);
    expect(readOnly, 'the read-only refusal is not marked on the timeline').toHaveLength(1);
  });
});
