/**
 * AnA skills on a real stream turn: the method a question calls for reaches the
 * model in the per-turn suffix, the turn reports it in context_used, the tools
 * it names that this turn cannot call are stated, and an unreadable skill state
 * loads nothing and says so.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => (await harnessModule()).mocks.toolExecutor());
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/lumen-context-builder.js', async () => (await harnessModule()).mocks.lumen());
vi.mock('../../../services/memory-context-assembler.js', async () => (await harnessModule()).mocks.memory());
vi.mock('../../../services/ana-ri/context-enrichment.js', async () => (await harnessModule()).mocks.enrichment());
vi.mock('../../../services/ana-session-bootstrap.js', async () => (await harnessModule()).mocks.sessionBootstrap());
vi.mock('../../../services/kernel-adaptive-policy.js', async () => (await harnessModule()).mocks.kernelPolicy());
vi.mock('../../../services/ana/ana-input-guard.js', async () => (await harnessModule()).mocks.inputGuard());
vi.mock('../../../services/auditService.js', async () => (await harnessModule()).mocks.audit());
vi.mock('../../../services/toolRegistry.js', async () => (await harnessModule()).mocks.toolRegistry());
vi.mock('../../../services/ana-ri/relational-profile-service.js', async () => (await harnessModule()).mocks.relationalProfile());
vi.mock('../../../services/ana/tool-telemetry.js', async () => (await harnessModule()).mocks.toolTelemetry());
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());
vi.mock('../shared.js', async importOriginal =>
  (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../../../services/ana/run-control.js', async importOriginal =>
  (await harnessModule()).mocks.runControl(await importOriginal<typeof import('../../../services/ana/run-control.js')>()),
);
vi.mock('../../../services/ana-ri/orchestrator.js', async () => (await harnessModule()).mocks.orchestrator());
vi.mock('../../../services/ana-ri/chat-context-builder.js', async importOriginal =>
  (await harnessModule()).mocks.chatContextBuilder(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../../../services/chat-thread-helpers.js', async () => (await harnessModule()).mocks.chatThreads());

import { mountStreamRoute } from '../stream.js';
import { harness as h, mocks, resetHarness, streamApp, turn } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);
const pool = mocks.db().pool as { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
const realQuery = pool.query;
const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => { process.env.ENTITLEMENTS_ENFORCE = 'off'; });
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
  pool.query = realQuery;
});
beforeEach(() => {
  resetHarness();
  pool.query = realQuery;
});

const systemText = () =>
  (h.state.requests[0]?.messages ?? [])
    .filter(m => m.role === 'system')
    .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n');

describe('skills on a conversation turn', () => {
  it('loads the method the question calls for and reports it with its version and hash', async () => {
    const events = await turn(app, { message: 'How do we justify a 24-month shelf life from our long-term stability data?' });
    const system = systemText();
    expect(system).toContain('## Skills for this turn');
    expect(system).toContain('Library skill cmc.stability, version 1');
    const used = events.find(e => e.type === 'context_used')!;
    expect(used.skillsStatus).toBe('loaded');
    expect(used.skills.map((s: { key: string }) => s.key)).toContain('cmc.stability');
    expect(used.skills[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(used.skills[0].reasons.join(' ')).toContain('asked about');
  });

  it('says which engines the method names are not callable in this turn', async () => {
    await turn(app, { message: 'How do we justify a 24-month shelf life from our long-term stability data?' });
    expect(systemText()).toMatch(/Not available in this turn: .*`estimate_shelf_life`/);
  });

  it('loads no skill for a question no skill is about, and adds no block', async () => {
    const events = await turn(app, { message: 'Thanks, that is all for today.' });
    expect(systemText()).not.toContain('## Skills for this turn');
    const used = events.find(e => e.type === 'context_used')!;
    expect(used).toMatchObject({ skills: [], skillsStatus: 'none' });
  });

  it('loads a skill the person picked in the composer, with no phrase calling for it, and reports it as chosen', async () => {
    const events = await turn(app, { message: 'Thanks, that is all for today.', skills: ['labeling'] });
    expect(systemText()).toContain('## Skills for this turn');
    expect(systemText()).toContain('Library skill labeling, version 1');
    const used = events.find(e => e.type === 'context_used')!;
    expect(used.skills.map((s: { key: string }) => s.key)).toEqual(['labeling']);
    expect(used.skills[0]).toMatchObject({ chosen: 'picked', reasons: ['chosen in this conversation'] });
  });

  it('ignores a picked value that is not a skill key', async () => {
    const events = await turn(app, { message: 'Thanks, that is all for today.', skills: ["labeling'; DROP TABLE x;--", 42] });
    expect(systemText()).not.toContain('## Skills for this turn');
    expect(events.find(e => e.type === 'context_used')).toMatchObject({ skills: [], skillsStatus: 'none' });
  });

  it('loads nothing when the organization\u2019s skill state cannot be read, and warns', async () => {
    pool.query = async (sql: string, params?: unknown[]) => {
      if (/organization_skill_settings|account_skill_bundles/.test(sql)) throw new Error('relation does not exist');
      return realQuery(sql, params);
    };
    const events = await turn(app, { message: 'How do we justify a 24-month shelf life from our long-term stability data?' });
    expect(systemText()).not.toContain('## Skills for this turn');
    expect(events.filter(e => e.type === 'warning').map(e => e.message)).toContain(
      'AnA skills could not be read for this turn, so none was loaded.',
    );
    const used = events.find(e => e.type === 'context_used')!;
    expect(used).toMatchObject({ skills: [], skillsStatus: 'unavailable' });
    expect(h.state.gatewayCalls).toBe(1);
  });
});
