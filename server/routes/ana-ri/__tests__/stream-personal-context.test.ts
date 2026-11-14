/**
 * P-133 (the founder, 2026-11-13): a person's private rules and saved profile reach a turn only when the protected
 * path can serve it — owner-private capture (the organization's own key) and a model that may receive owner-private
 * context (a self-hosted one; the gateway's Tier-3 wall). Otherwise the turn answers without them and says so once.
 *
 * Walked on 2026-11-12 (docs/evidence/SPINE/S4/2026-11-12-personal-rule-stops-turns/): one saved rule made every new
 * conversation fail. Here the route, its preparation and the real capsule store run; the issuers return a real
 * capsule whose activate and expand are spies, so "nothing private reached a model" is shown by expand never running
 * and "the turn was not made owner-private" by activate never running.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

const io = vi.hoisted(() => ({
  rules: true, profile: false, key: 'missing' as 'missing' | 'present' | 'broken',
  activate: [] as string[], expand: [] as string[],
}));
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async importOriginal =>
  (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => (await harnessModule()).mocks.toolExecutor());
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async importOriginal => ({
  ...(await harnessModule()).mocks.runControl(await importOriginal<typeof import('../../../services/ana/run-control.js')>()),
  readCoordinationKey: async () => {
    if (io.key === 'present') return { keyArn: 'arn:aws:kms:us-east-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab', version: 1 };
    if (io.key === 'broken') throw new Error('connection terminated');
    throw new Error('COORDINATION_TENANT_KEY_REQUIRED');
  },
}));
vi.mock('../../../services/ana-ri/orchestrator.js', async () => (await harnessModule()).mocks.orchestrator());
vi.mock('../../../services/ana-ri/chat-context-builder.js', async importOriginal =>
  (await harnessModule()).mocks.chatContextBuilder(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../../../services/lumen-context-builder.js', async () => (await harnessModule()).mocks.lumen());
vi.mock('../../../services/memory-context-assembler.js', async () => (await harnessModule()).mocks.memory());
vi.mock('../../../services/ana-ri/context-enrichment.js', async () => (await harnessModule()).mocks.enrichment());
vi.mock('../../../services/chat-thread-helpers.js', async () => (await harnessModule()).mocks.chatThreads());
vi.mock('../../../services/ana-session-bootstrap.js', async () => (await harnessModule()).mocks.sessionBootstrap());
vi.mock('../../../services/kernel-adaptive-policy.js', async () => (await harnessModule()).mocks.kernelPolicy());
vi.mock('../../../services/ana/ana-input-guard.js', async () => (await harnessModule()).mocks.inputGuard());
vi.mock('../../../services/auditService.js', async () => (await harnessModule()).mocks.audit());
vi.mock('../../../services/toolRegistry.js', async () => (await harnessModule()).mocks.toolRegistry());
vi.mock('../../../services/ana-ri/relational-profile-service.js', async () => (await harnessModule()).mocks.relationalProfile());
vi.mock('../../../services/ana/tool-telemetry.js', async () => (await harnessModule()).mocks.toolTelemetry());
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());
vi.mock('../../../services/ana/catalog-scope.js', () => ({
  catalogScope: async () => ({ programId: null }),
  documentScopeRefusal: async () => null,
}));
// The issuers, as the real ones return for a member who has a rule (or a saved profile): a real capsule.
vi.mock('../../../services/ana-context-router.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../services/ana-context-router.js')>();
  const { issueOwnerPrivateModelContext } = await import('../../../services/ai-gateway/model-call-scope.js');
  const capsule = (kind: string, scope: Parameters<typeof issueOwnerPrivateModelContext>[0]['scope']) =>
    issueOwnerPrivateModelContext({ scope, sourceRef: 'a'.repeat(64),
      activate: async () => { io.activate.push(kind); },
      expand: async () => { io.expand.push(kind); return `## ${kind}`; },
      recheck: async () => {} });
  return {
    ...actual,
    issuePrivateRuleModelContext: async (_client: unknown, scope: Parameters<typeof capsule>[1]) => io.rules ? capsule('rules', scope) : null,
    issueLegacyPrivateModelContext: async (_client: unknown, scope: Parameters<typeof capsule>[1]) => io.profile ? capsule('profile', scope) : null,
  };
});

import { mountStreamRoute, personalContextNote } from '../stream.js';
import { harness as h, resetHarness, streamApp, turn as streamTurn, type SseEvent } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);
const turn = (): Promise<SseEvent[]> => streamTurn(app, { message: 'summarize where this project stands' });
const warnings = (events: SseEvent[]) => events.filter(e => e.type === 'warning' && (e as { code?: string }).code === 'PERSONAL_CONTEXT_NOT_APPLIED');
const errors = (events: SseEvent[]) => events.filter(e => e.type === 'error');
const FRONTIER = [{ provider: 'anthropic', model: 'claude-sonnet-5', enabled: true }];
const LOCAL = [{ provider: 'local', model: 'local-default', enabled: true }];

const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => { process.env.ENTITLEMENTS_ENFORCE = 'off'; });
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});
beforeEach(() => {
  resetHarness();
  Object.assign(io, { rules: true, profile: false, key: 'missing', activate: [], expand: [] });
  (h.gateway as { getModels: () => unknown[] }).getModels = () => FRONTIER;
});

describe('a personal rule the turn cannot protect is left out, and the turn says so (P-133)', () => {
  it('on an outside model: AnA answers, nothing private is prepared or sent, and one note says why', async () => {
    const events = await turn();
    expect(errors(events)).toEqual([]);
    expect(io.activate).toEqual([]);
    expect(io.expand).toEqual([]);
    expect(warnings(events).map(e => (e as { message?: string }).message)).toEqual([personalContextNote('model', { rules: true, profile: false })]);
    expect(h.state.gatewayCalls).toBeGreaterThan(0);
    expect(h.state.post.turnRecorder.seal('answered').body.warnings).toContain(personalContextNote('model', { rules: true, profile: false }));
  });

  it('with a self-hosted model but no organization key: left out, and the note names the key', async () => {
    (h.gateway as { getModels: () => unknown[] }).getModels = () => LOCAL;
    const events = await turn();
    expect(errors(events)).toEqual([]);
    expect(io.activate).toEqual([]);
    expect(warnings(events)).toHaveLength(1);
    expect((warnings(events)[0] as { message: string }).message).toContain('encryption key');
  });

  it('a self-hosted model beside an outside one still leaves it out: the answer could come from either', async () => {
    (h.gateway as { getModels: () => unknown[] }).getModels = () => [...LOCAL, ...FRONTIER];
    io.key = 'present';
    await turn();
    expect(io.activate).toEqual([]);
  });

  it('a saved profile alone is left out the same way, and its note names it', async () => {
    Object.assign(io, { rules: false, profile: true });
    const events = await turn();
    expect(io.activate).toEqual([]);
    expect((warnings(events)[0] as { message: string }).message).toBe(personalContextNote('model', { rules: false, profile: true }));
  });

  it('when the protected path can serve the turn, the rules go through it as before, and nothing is said', async () => {
    (h.gateway as { getModels: () => unknown[] }).getModels = () => LOCAL;
    io.key = 'present';
    const events = await turn();
    expect(io.activate).toEqual(['rules']);
    expect(warnings(events)).toEqual([]);
  });

  it('an error reading the key is not "cannot protect": the turn fails closed, as before', async () => {
    (h.gateway as { getModels: () => unknown[] }).getModels = () => LOCAL;
    io.key = 'broken';
    const events = await turn();
    expect(io.activate).toEqual([]);
    // The private turn's own fail-closed path answers, as for any failure once a turn may be private.
    expect(errors(events)).toHaveLength(1);
    expect(h.state.gatewayCalls).toBe(0);
    expect(warnings(events)).toEqual([]);
  });

  it('a member with no personal context gets no note', async () => {
    Object.assign(io, { rules: false, profile: false });
    const events = await turn();
    expect(errors(events)).toEqual([]);
    expect(warnings(events)).toEqual([]);
  });
});

describe('the note, in plain words', () => {
  it.each([
    ['model', { rules: true, profile: false }, /^Your personal rules were not applied to this answer: they are sent only to an AI model that runs inside this deployment/],
    ['capture', { rules: true, profile: false }, /encryption key, and none is set up yet\. Rules that require your approval still apply\.$/],
    ['model', { rules: false, profile: true }, /^Your saved profile and AnA's notes about you were not used for this answer: .*it\.$/],
    ['capture', { rules: true, profile: true }, /^Your personal rules, saved profile and AnA's notes about you were not used/],
  ] as const)('%s, %o', (gap, present, expected) => {
    expect(personalContextNote(gap, present)).toMatch(expected);
  });
});
