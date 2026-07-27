/**
 * Lifecycle phases and task-link vocabulary.
 *
 * Two behaviours carry weight here and are pinned deliberately: an unclassified
 * task must sort LAST rather than first (otherwise the board's leading group is
 * "everything nobody has looked at"), and client visibility must default closed
 * (otherwise internal regulatory strategy reaches a client review room because
 * nobody set a flag).
 */

import { describe, it, expect } from 'vitest';
import {
  LIFECYCLE_PHASES, LIFECYCLE_PHASE_LABEL, lifecyclePhaseRank, isLifecyclePhase,
  CLIENT_VISIBILITY, isClientVisible, describeBlocking,
  type TaskRegulatoryLinkView,
} from '../mdx-lifecycle';

describe('lifecycle phases', () => {
  it('labels every phase', () => {
    for (const p of LIFECYCLE_PHASES) {
      expect(LIFECYCLE_PHASE_LABEL[p], p).toBeTruthy();
    }
  });

  it('orders phases along the normal progression', () => {
    expect(lifecyclePhaseRank('strategy')).toBeLessThan(lifecyclePhaseRank('design'));
    expect(lifecyclePhaseRank('submission_preparation'))
      .toBeLessThan(lifecyclePhaseRank('authority_review'));
    expect(lifecyclePhaseRank('authority_review'))
      .toBeLessThan(lifecyclePhaseRank('postmarket'));
  });

  it('sorts an unclassified task LAST, not first', () => {
    // Every task predating the column is unclassified. Ranking null first would
    // make the board's leading group "everything nobody has looked at", which
    // buries the work that is actually in flight.
    const last = LIFECYCLE_PHASES.length;
    expect(lifecyclePhaseRank(null)).toBe(last);
    expect(lifecyclePhaseRank(undefined)).toBe(last);
    expect(lifecyclePhaseRank('postmarket')).toBeLessThan(lifecyclePhaseRank(null));
  });

  it('treats an unrecognized phase as unclassified rather than throwing', () => {
    expect(lifecyclePhaseRank('made_up')).toBe(LIFECYCLE_PHASES.length);
    expect(isLifecyclePhase('made_up')).toBe(false);
    expect(isLifecyclePhase('verification')).toBe(true);
  });
});

describe('client visibility', () => {
  it('defaults closed — internal is not visible', () => {
    // Releasing work to a client is an act. A default of visible would publish
    // internal regulatory strategy by omission.
    expect(isClientVisible('internal')).toBe(false);
    expect(isClientVisible(null)).toBe(false);
    expect(isClientVisible(undefined)).toBe(false);
    expect(isClientVisible('')).toBe(false);
  });

  it('treats an unrecognized value as NOT visible', () => {
    // Fail closed: a typo or a value from a newer writer must not leak content.
    expect(isClientVisible('visible')).toBe(false);
    expect(isClientVisible('public')).toBe(false);
  });

  it('recognizes the three released states', () => {
    expect(isClientVisible('client_visible')).toBe(true);
    expect(isClientVisible('client_action_required')).toBe(true);
    expect(isClientVisible('authority_ready')).toBe(true);
  });

  it('internal is the first listed value, so it is the natural default', () => {
    expect(CLIENT_VISIBILITY[0]).toBe('internal');
  });
});

describe('describeBlocking', () => {
  const link = (over: Partial<TaskRegulatoryLinkView>): TaskRegulatoryLinkView => ({
    entityType: 'filing', entityId: 'f1', entityLabel: null, relationship: 'blocks',
    market: null, pathway: null, filingType: null, filingSection: null, ...over,
  });

  it('returns null when the task blocks nothing', () => {
    // An empty string would render as a blank row that reads as missing data
    // rather than as an absent relationship.
    expect(describeBlocking([])).toBeNull();
    expect(describeBlocking([link({ relationship: 'supports' })])).toBeNull();
  });

  it('names a single blocked filing with its section', () => {
    const s = describeBlocking([
      link({ entityLabel: 'FDA Dual 510(k)', filingSection: 'Analytical Performance' }),
    ]);
    expect(s).toBe('Blocks FDA Dual 510(k) Analytical Performance');
  });

  it('joins several so a card reads as a sentence', () => {
    const s = describeBlocking([
      link({ entityId: 'a', entityLabel: 'FDA Analytical Performance' }),
      link({ entityId: 'b', entityLabel: 'IVDR PER' }),
    ]);
    expect(s).toBe('Blocks FDA Analytical Performance and IVDR PER');
  });

  it('falls back to the id when no label was captured', () => {
    expect(describeBlocking([link({ entityId: 'filing-42', entityLabel: null })]))
      .toBe('Blocks filing-42');
  });

  it('ignores non-blocking links when describing what is blocked', () => {
    const s = describeBlocking([
      link({ entityId: 'a', entityLabel: 'IVDR PER' }),
      link({ entityId: 'b', entityLabel: 'Reproducibility study', relationship: 'supports' }),
    ]);
    expect(s).toBe('Blocks IVDR PER');
  });
});
