// @vitest-environment jsdom
/**
 * What the turn reported has to actually reach the rail.
 *
 * WHAT WENT WRONG, twice
 * `useAnaChat` captures far more than the rail ever showed. The tools AnA ran,
 * the agentic-loop rounds, the intent lens, her reasoning and the deliverable
 * were all captured and dropped in `adaptChatMessage`, so a three-engine
 * two-round investigation rendered as the word "Thinking…". The answer's
 * `warnings` were dropped in the same place, so a turn cut short by a timeout
 * rendered its partial text with nothing marking it partial.
 *
 * WHY THIS FILE EXISTS SEPARATELY
 * Every component suite for the rail passes its props in directly, so they all
 * stay green when this function stops handing something over. That was measured,
 * not assumed: deleting `warnings: m.warnings` from the adapter left 1748 tests
 * passing. Carriage was nobody's test — the same gap the ledger already records
 * for surface context (L45), where publisher and consumer were each tested and
 * the wiring between them was not.
 *
 * So this asserts the seam itself, field by field.
 */
import { describe, expect, it } from 'vitest';

import { adaptChatMessage } from '../V2App';

const turn = {
  id: 'm1',
  role: 'assistant' as const,
  text: 'The margin should be 0.5.',
  streaming: false,
  statusPhase: 'Reading the results…',
  detectedLens: 'risk',
  detectedDocumentType: 'Clinical Overview',
  thinking: 'Weighing the non-inferiority margin.',
  toolCalls: [{ name: 'compute_sample_size', label: 'Sample size', status: 'success' as const, round: 1 }],
  generatedDraft: { title: 'Clinical Overview 2.5' },
  warnings: ['Response timed out'],
  executedActions: [{ id: 'a1' }],
  pendingSignoffs: [{ id: 's1' }],
} as any;

describe('adaptChatMessage — the turn reaches the rail intact', () => {
  it('carries the caveats that qualify the answer', () => {
    // The one that regressed most recently: without this, a truncated answer
    // renders as a finished one.
    expect(adaptChatMessage(turn).warnings).toEqual(['Response timed out']);
  });

  it('carries every part of the work record', () => {
    const a = adaptChatMessage(turn).activity!;

    expect(a.lens).toBe('risk');
    expect(a.documentType).toBe('Clinical Overview');
    expect(a.thinking).toBe('Weighing the non-inferiority margin.');
    expect(a.draftTitle).toBe('Clinical Overview 2.5');
    expect(a.toolCalls).toHaveLength(1);
    expect(a.toolCalls?.[0].label).toBe('Sample size');
    expect(a.phase).toBe('Reading the results…');
  });

  it('carries the steers AnA accepted', () => {
    // Run control is reachable from the rail now; a steer the adapter drops is
    // one the user cannot tell was taken, and the server has already written it
    // into the decision lineage.
    expect(adaptChatMessage({ ...turn, interjections: ['focus on EU MDR'] } as any).interjections)
      .toEqual(['focus on EU MDR']);
  });

  it('carries the evidence verdict', () => {
    // The grounding rows can only render what the adapter hands over, and this
    // field was captured for the whole life of the pipeline without one.
    const ev = { validated: true, sourceCount: 6, groundedClaims: 11, weakClaims: 2, missingSupport: 0 };
    expect(adaptChatMessage({ ...turn, evidence: ev } as any).evidence).toEqual(ev);
  });

  it('carries the governed action state', () => {
    const out = adaptChatMessage(turn);

    expect(out.executedActions).toHaveLength(1);
    expect(out.pendingSignoffs).toHaveLength(1);
  });

  it('a user turn stays a user turn and grows no work record', () => {
    const out = adaptChatMessage({ id: 'u1', role: 'user', text: 'how many patients?' } as any);

    expect(out.role).toBe('user');
    expect(out.body).toBe('how many patients?');
    expect(out.activity).toBeUndefined();
  });

  it('the body falls back to the phase only while nothing else can speak', () => {
    const bare = { id: 'm2', role: 'assistant', text: '', streaming: true, statusPhase: 'Planning response…' } as any;
    expect(adaptChatMessage(bare).body).toBe('Planning response…');

    // Once there IS reportable work, the record shows it and the body stops
    // duplicating the phase.
    const working = { ...bare, toolCalls: [{ name: 't', label: 'T', status: 'running' }] } as any;
    expect(adaptChatMessage(working).body).toBe('');
  });

  it('never invents a caveat for a clean turn', () => {
    const clean = { id: 'm3', role: 'assistant', text: 'Done.' } as any;
    expect(adaptChatMessage(clean).warnings).toBeUndefined();
  });
});
