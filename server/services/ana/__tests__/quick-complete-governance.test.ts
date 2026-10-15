/**
 * Track GW review [10]: POST /api/claude/quick was a label bypass.
 *
 * With a `framework`, quickComplete puts the regulatory drafting persona in the
 * system turn (resolveSystemPrompt: "Every document you produce reflects deep
 * regulatory expertise") and asks for the body's prompt — regulatory drafting.
 * It sent that as `general` pinned to claude-sonnet-4, so neither the
 * high-risk approval rule nor the production PQ rule applied, and Sonnet 4
 * (not approved for high risk, PQ pending) drafted it in production.
 *
 * Now a framework request is `document_drafting` with no pin: an approved
 * model drafts it outside production, and production refuses it in plain
 * words until a model passes PQ. A plain prompt with no framework stays a
 * quick `general` completion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gw = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../ai-gateway/gateway', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../ai-gateway/gateway')>()),
  getGateway: () => gw.current,
}));

import { AnaDocumentDraftingService } from '../AnaDocumentDraftingService';
import { governedGateway, stubDispatch } from '../../ai-gateway/__tests__/support/governed-gateway';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../../ai-gateway/providers/org-placement';

const PLAIN =
  'No performance-qualified model is available for high-risk regulatory drafting in this environment.';
const saved = process.env.NODE_ENV;

beforeEach(() => {
  setOrgPlacementResolver({ resolve: async () => null });
});
afterEach(() => {
  process.env.NODE_ENV = saved;
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

function withGateway() {
  const g = governedGateway();
  const invoked = stubDispatch(g);
  const route = vi.spyOn(g, 'route');
  gw.current = g;
  return { invoked, route };
}

describe('quickComplete with a framework is regulatory drafting', () => {
  it('in production it is refused in plain words; nothing is dispatched', async () => {
    process.env.NODE_ENV = 'production';
    const { invoked } = withGateway();
    const err = await new AnaDocumentDraftingService()
      .quickComplete('Write the clinical overview.', { framework: 'IND', organizationId: 7 })
      .catch((e) => e);
    expect(err.message).toBe(PLAIN);
    expect(invoked).toEqual([]);
  });

  it('outside production it is document_drafting with no pin, served by an approved model', async () => {
    process.env.NODE_ENV = 'test';
    const { invoked, route } = withGateway();
    await new AnaDocumentDraftingService().quickComplete('Write the clinical overview.', { framework: 'IND', organizationId: 7 });
    expect(route.mock.calls[0][0]).toMatchObject({ taskType: 'document_drafting' });
    expect(route.mock.calls[0][0].model).toBeUndefined();
    expect(invoked).toEqual(['claude-opus-4']);
  });

  it('control: with no framework it is a quick general completion on Sonnet, as before', async () => {
    process.env.NODE_ENV = 'test';
    const { invoked, route } = withGateway();
    await new AnaDocumentDraftingService().quickComplete('What does ICH E3 cover?', { organizationId: 7 });
    expect(route.mock.calls[0][0]).toMatchObject({ taskType: 'general', provider: 'anthropic', model: 'claude-sonnet-4' });
    expect(invoked).toEqual(['claude-sonnet-4']);
  });
});
