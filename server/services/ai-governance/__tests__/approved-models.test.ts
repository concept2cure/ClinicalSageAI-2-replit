import { describe, it, expect } from 'vitest';
import {
  APPROVED_MODELS,
  detectModelDrift,
  isRegistryApproved,
  type RegistryModelFact,
} from '../approved-models';
import { DEFAULT_MODELS } from '../../ai-gateway/gateway';

/** The live gateway registry as id/version facts. */
const liveRegistry: RegistryModelFact[] = DEFAULT_MODELS.map(m => ({ id: m.id, model: m.model }));

describe('approved-models drift gate', () => {
  it('the live gateway registry matches the approved-models lockfile (no unreviewed model swaps)', () => {
    const drift = detectModelDrift(liveRegistry);
    // If this fails, a model was added/removed/version-bumped in the gateway
    // without updating APPROVED_MODELS. Re-validate and update the lockfile.
    expect(drift).toEqual([]);
    expect(isRegistryApproved(liveRegistry)).toBe(true);
  });

  it('flags a version bump as drift', () => {
    const bumped = liveRegistry.map(m =>
      m.id === 'claude-opus-4' ? { ...m, model: 'claude-opus-4-8' } : m
    );
    const drift = detectModelDrift(bumped);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ id: 'claude-opus-4', kind: 'version_changed' });
  });

  it('flags a removed approved model', () => {
    const removed = liveRegistry.filter(m => m.id !== 'gpt-4o');
    const drift = detectModelDrift(removed);
    expect(drift.some(d => d.id === 'gpt-4o' && d.kind === 'missing')).toBe(true);
  });

  it('flags an unapproved model addition', () => {
    const added = [...liveRegistry, { id: 'gpt-5', model: 'gpt-5' }];
    const drift = detectModelDrift(added);
    expect(drift.some(d => d.id === 'gpt-5' && d.kind === 'unapproved_addition')).toBe(true);
  });

  it('every approved entry pins a concrete version and an eval reference', () => {
    for (const m of APPROVED_MODELS) {
      expect(m.pinnedVersion.length).toBeGreaterThan(0);
      expect(m.evalReference.length).toBeGreaterThan(0);
      expect(m.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
