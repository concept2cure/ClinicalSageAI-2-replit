/**
 * ADR-0014 §4: every model the gateway serves is an approved-models entry, at
 * every selection point and every risk level.
 *
 * Until this change the gateway checked approval only on high-risk work, and
 * there by registry id alone (`isApprovedForHighRisk(model.id)`). On every
 * other request the explicit path, strategy selection (`eligible` and
 * `relaxed`) and the fallback ladder served any enabled row. Nothing at the
 * point of selection held a row to its entry; a CI drift test kept today's
 * registry aligned, and that was all (H1 evidence, governance items a–c).
 *
 * Each case below drives the real `selectModel` / `getFallbackModels` with the
 * real registry, plus one synthetic row where the case needs a model with no
 * entry. Only the network call is replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTerminalGatewayError } from '../gateway-outcome';
import { classifyGatewayError } from '../gateway-error-map';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../providers/org-placement';
import { APPROVED_MODELS } from '../../ai-governance/approved-models';
import {
  judgeAgainst,
  ledgerRows,
  registryOf,
  request,
  stubDispatch,
  governedGateway,
  ungovernedCopyOf,
} from './support/governed-gateway';

const ORG = 42;
const saved = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
  delete process.env.AI_PII_ENFORCEMENT;
});
afterEach(() => {
  process.env = { ...saved };
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

/** The first-party Opus row, copied under an id and wire model no entry carries. */
function withRogue(quality: number, place: 'front' | 'back' = 'back') {
  const gw = governedGateway();
  const rogue = ungovernedCopyOf(gw, 'claude-opus-4', { id: 'rogue-opus', model: 'rogue-opus-1', qualityScore: quality });
  expect(APPROVED_MODELS.some((e) => e.id === rogue.id || e.pinnedVersion === rogue.model)).toBe(false);
  if (place === 'front') registryOf(gw).unshift(rogue);
  else registryOf(gw).push(rogue);
  return gw;
}

describe('§4a — a row that is not its own approved entry is never served', () => {
  it('strategy (eligible): quality_optimized chat does not land on it, though it ranks first', async () => {
    const gw = withRogue(100);
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'chat', strategy: 'quality_optimized' }));
    expect(invoked).toEqual(['claude-opus-4']);
  });

  it('strategy (relaxed): with every provider unhealthy, the list-order first row is passed over', async () => {
    const gw = withRogue(50, 'front');
    for (const health of (gw as any).providerHealth.values()) health.healthy = false;
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'chat' }));
    expect(invoked).toHaveLength(1);
    expect(invoked[0]).not.toBe('rogue-opus');
  });

  it('fallback: the ladder passes over it when the primary fails', async () => {
    const gw = withRogue(99.5);
    const invoked = stubDispatch(gw, ['claude-opus-4']);
    await gw.route(request({ taskType: 'chat' }));
    expect(invoked).toEqual(['claude-opus-4', 'claude-opus-5']);
  });

  it('explicit: naming it is refused with a terminal error — not served, not substituted', async () => {
    const gw = withRogue(50);
    const invoked = stubDispatch(gw);
    const err = await gw.route(request({ taskType: 'chat', model: 'rogue-opus' })).catch((e) => e);
    expect(err).toMatchObject({ name: 'GatewayPolicyError', code: 'MODEL_NOT_GOVERNED', reason: 'no-entry' });
    expect(err.message).toContain('rogue-opus');
    expect(isTerminalGatewayError(err)).toBe(true);
    expect(invoked).toEqual([]);
  });

  it('high risk: a row drifted off its pinned version under an approved id is not served', async () => {
    const gw = governedGateway();
    const flagship = registryOf(gw).find((m) => m.id === 'claude-opus-4')!;
    flagship.model = 'claude-opus-5-5-drifted';
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'document_drafting' }));
    expect(invoked).toEqual(['claude-opus-5']);
  });

  it('the refusal leaves one ledger row naming what was withheld, and the author reads why', async () => {
    const gw = withRogue(50);
    stubDispatch(gw);
    const err = await gw.route(request({ taskType: 'chat', model: 'rogue-opus', organizationId: ORG })).catch((e) => e);
    const rows = ledgerRows(gw);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'none',
      success: false,
      error: 'MODEL_NOT_GOVERNED',
      organizationId: ORG,
      metadata: { modelGovernance: { code: 'MODEL_NOT_GOVERNED', reason: 'no-entry', withheldModelIds: ['rogue-opus'] } },
    });
    expect(classifyGatewayError(err).message).toMatch(/not an approved model/);
  });
});

describe('§4b — an explicit model that names no registry row is refused, not substituted', () => {
  it('is refused with a terminal error naming the value; nothing is dispatched, retried or fallen back to', async () => {
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw.route(request({ taskType: 'chat', model: 'gpt-5-imaginary' })).catch((e) => e);
    expect(err).toMatchObject({ name: 'GatewayPolicyError', code: 'MODEL_NOT_GOVERNED', reason: 'unknown-model' });
    expect(err.message).toContain('"gpt-5-imaginary"');
    expect(isTerminalGatewayError(err)).toBe(true);
    expect(invoked).toEqual([]);
    expect(ledgerRows(gw)).toEqual([
      expect.objectContaining({
        error: 'MODEL_NOT_GOVERNED',
        metadata: expect.objectContaining({
          modelGovernance: expect.objectContaining({ reason: 'unknown-model', requestedModel: 'gpt-5-imaginary' }),
        }),
      }),
    ]);
  });

  it('a model named under a provider that has no such row names no row', async () => {
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw.route(request({ taskType: 'chat', provider: 'openai', model: 'claude-opus-4' })).catch((e) => e);
    expect(err).toMatchObject({ code: 'MODEL_NOT_GOVERNED', reason: 'unknown-model' });
    expect(err.message).toContain('"openai/claude-opus-4"');
    expect(invoked).toEqual([]);
  });

  it('control: a known row whose provider is not configured still falls through to strategy, as before', async () => {
    const gw = governedGateway({ providers: ['anthropic'] });
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'chat', model: 'gpt-4o' }));
    expect(invoked).toEqual(['claude-opus-4']);
  });
});

describe('§4c — local-default pins a placeholder, so production does not select it', () => {
  function inProduction(policy: Record<string, unknown> | null = null) {
    process.env.NODE_ENV = 'production';
    setOrgPlacementResolver({ resolve: async () => policy as never });
  }

  it('explicit: refused in production, naming it', async () => {
    inProduction();
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw
      .route(request({ taskType: 'chat', model: 'local-default', organizationId: ORG }))
      .catch((e) => e);
    expect(err).toMatchObject({ code: 'MODEL_NOT_GOVERNED', reason: 'nominal-pin', withheldModelIds: ['local-default'] });
    expect(invoked).toEqual([]);
  });

  it('strategy: cost_optimized chat (local-default costs nothing) is not served by it in production', async () => {
    inProduction();
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'chat', strategy: 'cost_optimized', organizationId: ORG }));
    expect(invoked).toHaveLength(1);
    expect(invoked[0]).not.toBe('local-default');
  });

  it('strategy: a tenant allowed only its own models is refused in production, not served a placeholder', async () => {
    inProduction({ allowedSubstrates: ['self_hosted'] });
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw.route(request({ taskType: 'chat', organizationId: ORG })).catch((e) => e);
    expect(err).toMatchObject({ code: 'MODEL_NOT_GOVERNED', reason: 'nominal-pin', withheldModelIds: ['local-default'] });
    expect(invoked).toEqual([]);
  });

  it('fallback: it is not on the production ladder', async () => {
    inProduction();
    const gw = governedGateway({ providers: ['openai', 'local'] });
    const invoked = stubDispatch(gw, ['gpt-4o', 'gpt-4o-mini']);
    await expect(gw.route(request({ taskType: 'chat', organizationId: ORG }))).rejects.toThrow();
    expect(invoked).not.toContain('local-default');
  });

  it('control: outside production it is served as before', async () => {
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'chat', model: 'local-default' }));
    expect(invoked).toEqual(['local-default']);
  });

  it('control: a local entry that pins a weights digest is selectable in production', async () => {
    inProduction();
    const digest = `sha256:${'a'.repeat(64)}`;
    const gw = governedGateway();
    judgeAgainst(gw, APPROVED_MODELS.map((e) => (e.id === 'local-default' ? { ...e, pinnedVersion: digest } : e)));
    registryOf(gw).find((m) => m.id === 'local-default')!.model = digest;
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'chat', model: 'local-default', organizationId: ORG }));
    expect(invoked).toEqual(['local-default']);
  });
});
