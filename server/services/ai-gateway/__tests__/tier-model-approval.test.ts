/**
 * The cost-tier default is served only when it is an approved-models entry.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * CLAUDE.md Rule 2: "a model is selectable only as an approved-models entry with
 * a pinned version, rationale and eval reference". `resolveModelOverride` has
 * held a caller's pin to that since 2026-09-28 (S2). The tier resolver did not:
 * `resolveTierModel` served any ENABLED registry row. That covered a row named
 * by an `ANA_TIER_*_MODEL` remap, and a default alias whose row had drifted off
 * its pinned version. On high-risk work the gateway refuses a model not approved
 * for high risk. On any other turn, the model with no entry served AnA's default.
 *
 * The fallback is the one `resolveTierModel` already had for a tier model that
 * is not enabled: the row is passed over, and when no row is left the result is
 * null and the caller routes by strategy. A row withheld is logged by the
 * ai-gateway logger, once per process for each configuration. A caller's pin
 * and a tier remap select by one rule (`governedMatch`). Registry side:
 * synthetic rows and the real `DEFAULT_MODELS`. Governance side: the real
 * `APPROVED_MODELS`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  resolveTierModel,
  TIER_MODEL_ENV,
  TIER_MODEL_ID,
  type ModelTier,
} from '../reasoning';
import { resolveModelOverride } from '../effort';
import { DEFAULT_MODELS } from '../gateway';
import { APPROVED_MODELS } from '../../ai-governance/approved-models';
import type { ModelConfig } from '../types';
import { approvedRow, entry, hasNoEntry, registryRow } from './support/approved-rows';

const TIERS: readonly ModelTier[] = ['economy', 'standard', 'flagship'];

/** An enabled model with no governance entry at all. Id and wire differ, so both matches are tested. */
const UNAPPROVED = registryRow({ id: 'house-model', provider: 'anthropic', model: 'house-model-2026-09' });

const DEFAULT_ROWS = TIERS.map((t) => approvedRow(TIER_MODEL_ID[t]));

/** A row whose wire model is the flagship alias id: it matches 'claude-opus-4' but pins no version. */
const ALIAS_ON_WIRE = registryRow({ id: 'claude-opus-house', provider: 'anthropic', model: 'claude-opus-4' });

const fact = (m: ModelConfig) => ({ id: m.id, provider: m.provider, model: m.model });

/** Every tier's default row, the self-hosted row, and a row with no entry. */
const REGISTRY = [...DEFAULT_ROWS, approvedRow('local-default'), UNAPPROVED];

/**
 * resolveTierModel, and a spy on the logger it writes to, from a fresh module
 * graph. A withheld row is logged once per process for each configuration, so a
 * case that asserts on the log must not share that record with the cases
 * before it.
 */
async function fresh() {
  vi.resetModules();
  const { logger } = await import('../../../utils/logger');
  const { resolveTierModel: resolve } = await import('../reasoning');
  return { resolve, warn: vi.spyOn(logger, 'warn') };
}

afterEach(() => vi.restoreAllMocks());

describe('resolveTierModel — only an approved-models entry serves a tier', () => {
  it('the governed data is what these cases assume', () => {
    for (const t of TIERS) expect(entry(TIER_MODEL_ID[t]).id).toBe(TIER_MODEL_ID[t]);
    expect(hasNoEntry(UNAPPROVED)).toBe(true);
    expect(hasNoEntry(ALIAS_ON_WIRE)).toBe(true);
  });

  it('does not serve an ANA_TIER_* remap to an enabled model with no approved entry — by id or by wire model', () => {
    for (const t of TIERS) {
      for (const named of [UNAPPROVED.id, UNAPPROVED.model]) {
        expect(resolveTierModel(t, REGISTRY, { [TIER_MODEL_ENV[t]]: named }), `${t} → ${named}`).toBeNull();
      }
    }
  });

  it('does not serve a remap to an approved alias whose row is not on its pinned version', () => {
    // claude-sonnet-4 carried on the legacy entry's wire version: that version
    // is pinned by claude-sonnet-4-legacy, and that entry is not this row.
    const drifted = registryRow({ id: 'claude-sonnet-4', provider: 'anthropic', model: entry('claude-sonnet-4-legacy').pinnedVersion });
    const env = { ANA_TIER_FLAGSHIP_MODEL: 'claude-sonnet-4' };
    expect(resolveTierModel('flagship', [approvedRow('claude-opus-4'), drifted], env)).toBeNull();
  });

  it('does not serve a default tier model whose own registry row is not its approved entry', () => {
    for (const t of TIERS) {
      const alias = TIER_MODEL_ID[t];
      const others = DEFAULT_ROWS.filter((m) => m.id !== alias);
      // Drifted off the pinned version, and a wire model that is the alias id
      // itself (pins no version at all).
      for (const wire of [`${entry(alias).pinnedVersion}-20990101`, alias]) {
        const bad = registryRow({ id: alias, provider: entry(alias).provider, model: wire });
        expect(resolveTierModel(t, [bad, ...others], {}), `${t} on ${wire}`).toBeNull();
      }
    }
  });

  it("does not serve an entry's id and pinned version under another provider", () => {
    // The provider is part of the entry: the same wire model through another
    // provider is another placement, and needs its own entry.
    const opus = entry('claude-opus-4');
    const elsewhere = registryRow({ id: opus.id, provider: 'bedrock', model: opus.pinnedVersion });
    expect(APPROVED_MODELS.some((e) => e.provider === 'bedrock' && e.pinnedVersion === opus.pinnedVersion)).toBe(false);
    expect(resolveTierModel('flagship', [elsewhere], {})).toBeNull();
  });

  it('passes over a matching row that is not its entry exactly as it passes over a disabled one, and logs the row it passed over', async () => {
    // ALIAS_ON_WIRE matches 'claude-opus-4' ahead of the entry's own row.
    // Enabled-only served it: a wire model no entry pins.
    const { resolve, warn } = await fresh();
    const opus = approvedRow('claude-opus-4');
    const want = { provider: opus.provider, model: opus.model, tier: 'flagship' };

    expect(resolve('flagship', [{ ...ALIAS_ON_WIRE, enabled: false }, opus], {})).toEqual(want);
    expect(warn).not.toHaveBeenCalled(); // a disabled row is not governance overruling anything

    // The configured value names a row the tier did not serve, so the log says
    // which, and what served instead (review objection 2).
    expect(resolve('flagship', [ALIAS_ON_WIRE, opus], {})).toEqual(want);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[ai-gateway:tier\] .*approved-models/);
    expect(warn.mock.calls[0][1]).toEqual({
      tier: 'flagship',
      configured: 'claude-opus-4',
      source: 'default',
      withheld: [fact(ALIAS_ON_WIRE)],
      served: fact(opus),
    });
  });
});

describe('resolveTierModel — what a withheld row logs', () => {
  it('logs a tier that pins nothing, naming the tier, what was configured, where from, and what was withheld', async () => {
    const { resolve, warn } = await fresh();
    expect(resolve('flagship', REGISTRY, { ANA_TIER_FLAGSHIP_MODEL: UNAPPROVED.id })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[ai-gateway:tier\] .*approved-models/),
      {
        tier: 'flagship',
        configured: UNAPPROVED.id,
        source: 'ANA_TIER_FLAGSHIP_MODEL',
        withheld: [fact(UNAPPROVED)],
        served: null,
      },
    );

    warn.mockClear();
    const drifted = registryRow({ id: 'claude-haiku-4', provider: 'anthropic', model: 'claude-haiku-4-5-20251001' });
    expect(resolve('economy', [drifted], {})).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toMatchObject({ tier: 'economy', configured: 'claude-haiku-4', source: 'default', served: null });
  });

  it('does not claim the withheld row goes unserved: strategy selection on normal-risk work can still choose it', async () => {
    // The withheld row stays enabled in the gateway registry, and the gateway's
    // strategy path filters on approval only for high-risk work (review
    // objection 7). The log says what the tier did, not what the gateway will.
    const { resolve, warn } = await fresh();
    resolve('standard', REGISTRY, { ANA_TIER_STANDARD_MODEL: UNAPPROVED.id });
    expect(warn).toHaveBeenCalledTimes(1);
    const [message] = warn.mock.calls[0] as [string, unknown];
    expect(message).not.toMatch(/not served/);
    expect(message).toMatch(/strategy/);
    expect(message).toMatch(/not approval-gated/);
  });

  it('logs each configuration once per process, and refuses it on every call', async () => {
    // One static fault in configuration would otherwise warn on every AnA turn,
    // chat turn and deep investigation (review objection 10).
    const { resolve, warn } = await fresh();
    const env = { ANA_TIER_FLAGSHIP_MODEL: UNAPPROVED.id };
    for (let i = 0; i < 3; i++) expect(resolve('flagship', REGISTRY, env)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);

    // Another tier, another value, or another set of rows withheld is another
    // fault, and is said once too.
    expect(resolve('economy', REGISTRY, { ANA_TIER_ECONOMY_MODEL: UNAPPROVED.id })).toBeNull();
    expect(resolve('flagship', REGISTRY, { ANA_TIER_FLAGSHIP_MODEL: UNAPPROVED.model })).toBeNull();
    const other = registryRow({ id: 'house-model', provider: 'openai', model: 'house-model-openai' });
    expect(resolve('flagship', [...REGISTRY, other], env)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(4);
    expect(resolve('flagship', [...REGISTRY, other], env)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it("logs the source the value was actually taken from: a blank env var is the default's, not the env var's", async () => {
    // One rule decides both the value and where it came from (review objection 9).
    const { resolve, warn } = await fresh();
    const drifted = registryRow({ id: 'claude-haiku-4', provider: 'anthropic', model: 'claude-haiku-4-5-20251001' });
    resolve('economy', [drifted, UNAPPROVED], { ANA_TIER_ECONOMY_MODEL: '   ' });
    resolve('economy', [drifted, UNAPPROVED], { ANA_TIER_ECONOMY_MODEL: `  ${UNAPPROVED.id}  ` });
    expect(warn.mock.calls.map((c) => c[1])).toMatchObject([
      { configured: 'claude-haiku-4', source: 'default' },
      { configured: UNAPPROVED.id, source: 'ANA_TIER_ECONOMY_MODEL' },
    ]);
  });

  it('still serves an approved remap — the no-Opus dial and the self-hosted tier — and logs nothing', async () => {
    const { resolve, warn } = await fresh();
    expect(resolve('flagship', REGISTRY, { ANA_TIER_FLAGSHIP_MODEL: 'claude-sonnet-4' })).toEqual({
      provider: 'anthropic',
      model: entry('claude-sonnet-4').pinnedVersion,
      tier: 'flagship',
    });
    expect(resolve('economy', REGISTRY, { ANA_TIER_ECONOMY_MODEL: 'local-default' })).toEqual({
      provider: 'local',
      model: 'local-default',
      tier: 'economy',
    });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("one selection rule: a caller's pin and a tier remap of the same value select the same row", () => {
  it('agrees for every value over registries with rows passed over, rows withheld, and none', () => {
    // resolveModelOverride judged only the first match and resolveTierModel
    // passed over to a later approved one, so one value against one registry was
    // refused as a pin and served as a tier (review objections 3 and 8).
    const opus = approvedRow('claude-opus-4');
    const registries: ModelConfig[][] = [
      [ALIAS_ON_WIRE, opus],
      [opus, ALIAS_ON_WIRE],
      [UNAPPROVED, opus],
      [...DEFAULT_ROWS, UNAPPROVED],
      DEFAULT_MODELS.filter((m) => m.enabled),
    ];
    const values = [...new Set(registries.flat().flatMap((m) => [m.id, m.model]))];
    for (const reg of registries) {
      for (const value of values) {
        const pin = resolveModelOverride(value, reg, { highRisk: false });
        const tier = resolveTierModel('standard', reg, { ANA_TIER_STANDARD_MODEL: value });
        expect(tier && { provider: tier.provider, model: tier.model }, `${value} over [${reg.map((m) => m.id)}]`).toEqual(
          pin && { provider: pin.provider, model: pin.model },
        );
      }
    }
  });
});

describe("resolveTierModel — today's registry resolves exactly as before", () => {
  const enabled = DEFAULT_MODELS.filter((m) => m.enabled);

  it('every tier default, as resolved at HEAD before the approval gate', () => {
    // Recorded from HEAD c82c056be. A model bump changes these on purpose.
    expect(resolveTierModel('economy', enabled, {})).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5', tier: 'economy' });
    expect(resolveTierModel('standard', enabled, {})).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5', tier: 'standard' });
    expect(resolveTierModel('flagship', enabled, {})).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5', tier: 'flagship' });
  });

  it('every remap to an enabled registry row, by id and by wire model, for every tier, and nothing logged', async () => {
    // The pre-gate rule, restated as the oracle: the first enabled row whose id
    // or wire model is the value. Every such row is its own entry (the drift
    // gate holds the registry to it), so the gate must refuse none of them.
    const { resolve, warn } = await fresh();
    expect(enabled.length).toBeGreaterThan(0);
    for (const t of TIERS) {
      for (const value of enabled.flatMap((m) => [m.id, m.model])) {
        const was = enabled.find((m) => m.id === value || m.model === value)!;
        expect(resolve(t, enabled, { [TIER_MODEL_ENV[t]]: value }), `${t} → ${value}`).toEqual({
          provider: was.provider,
          model: was.model,
          tier: t,
        });
      }
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('the {provider, model} a tier hands the gateway names only the row the tier judged', () => {
    // The tier judges a row, but the gateway receives {provider, model} and
    // looks the row up again: the first enabled row with that provider whose
    // wire model OR id is that model (gateway.ts selectModel; placement and
    // health aside), and on normal-risk work it serves that row approved or
    // not. So "served only by its approved entry" holds while the pair names
    // one row. detectModelDrift does not require that; this pins it for the
    // real registry (review objection 1).
    const lookup = (rows: ModelConfig[], m: ModelConfig) =>
      rows.find((r) => r.enabled && r.provider === m.provider && (r.model === m.model || r.id === m.model));
    const misrouted = (rows: ModelConfig[]) => rows.filter((m) => m.enabled && lookup(rows, m) !== m).map((m) => m.id);

    expect(misrouted(enabled)).toEqual([]);

    // The check can fail: another row listed first with the same provider and
    // wire model, or with an id equal to that wire model, is the row served.
    const opus = approvedRow('claude-opus-4');
    expect(misrouted([registryRow({ id: 'claude-opus-house', provider: opus.provider, model: opus.model }), opus])).toEqual(['claude-opus-4']);
    expect(misrouted([registryRow({ id: opus.model, provider: opus.provider, model: 'house-wire' }), opus])).toEqual(['claude-opus-4']);
  });
});
