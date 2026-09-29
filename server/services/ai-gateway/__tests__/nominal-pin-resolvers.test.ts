/**
 * ADR-0014 §4: `local-default` pins a placeholder, so production does not
 * select it — and the resolvers that hand the gateway a model agree (track GW
 * review [4]).
 *
 * The gateway refuses it in production. Its resolvers did not know that: the
 * cost tier (`ANA_TIER_ECONOMY_MODEL=local-default`, the remap .env.example
 * advertises), a caller's pin and the picker all used `governedMatch` /
 * `governingEntry`, which saw an approved entry and pinned it. The stream then
 * sent it explicitly, and every Economy-tier turn in production failed with a
 * terminal MODEL_NOT_GOVERNED. Now the one resolver rule passes it over in
 * production, exactly as it passes over a row that is not its own entry, and
 * the tier falls back to strategy selection as it always has.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { governedMatch } from '../../ai-governance/approved-models';
import { projectModelsForPicker, resolveModelOverride } from '../effort';
import { resolveTierModel } from '../reasoning';
import { DEFAULT_MODELS } from '../gateway';
import type { ModelConfig } from '../types';

const saved = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = saved;
});

const enabled: ModelConfig[] = DEFAULT_MODELS.map((m) => ({ ...m, enabled: true }));
const ECONOMY_LOCAL = { ANA_TIER_ECONOMY_MODEL: 'local-default' };

describe('in production', () => {
  it('governedMatch withholds local-default instead of serving it', () => {
    process.env.NODE_ENV = 'production';
    const { served, withheld } = governedMatch('local-default', enabled);
    expect(served).toBeUndefined();
    expect(withheld.map((m) => m.id)).toEqual(['local-default']);
  });

  it('ANA_TIER_ECONOMY_MODEL=local-default pins no model; the gateway selects by strategy', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveTierModel('economy', enabled, ECONOMY_LOCAL)).toBeNull();
  });

  it('a caller cannot pin it', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveModelOverride('local-default', enabled, { highRisk: false })).toBeNull();
  });

  it('the picker does not offer it', () => {
    process.env.NODE_ENV = 'production';
    expect(projectModelsForPicker(enabled).map((m) => m.id)).not.toContain('local-default');
  });
});

describe('controls', () => {
  it('outside production every resolver still reaches it, as before', () => {
    process.env.NODE_ENV = 'test';
    expect(governedMatch('local-default', enabled).served?.row.id).toBe('local-default');
    expect(resolveTierModel('economy', enabled, ECONOMY_LOCAL)).toMatchObject({ provider: 'local', model: 'local-default' });
    expect(projectModelsForPicker(enabled).map((m) => m.id)).toContain('local-default');
  });

  it('in production, every other row resolves exactly as outside it', () => {
    process.env.NODE_ENV = 'production';
    const prod = projectModelsForPicker(enabled).map((m) => m.id);
    process.env.NODE_ENV = 'test';
    const dev = projectModelsForPicker(enabled).map((m) => m.id);
    expect(prod).toEqual(dev.filter((id) => id !== 'local-default'));
  });
});
