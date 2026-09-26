/**
 * A tool that stores model-authored text in a governed record runs only for a
 * model approved for high-risk work.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The gateway's approval rule reads a request's task type and risk. It cannot
 * see a turn labelled `chat` — or a medium-risk turn on the regulatory surface —
 * served by Haiku or Sonnet, whose model writes a document into a tool call's
 * arguments and the tool stores it. The bypass sweep confirmed exactly that on
 * POST /api/chat: "draft the clinical overview as an authoring document",
 * served by claude-haiku-4-5, created authoring_documents rows with Part 11
 * audit entries. So the rule is enforced where content becomes a record.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const gatewayState = vi.hoisted(() => ({ responses: [] as any[], requests: [] as any[] }));
vi.mock('../../ai-gateway/gateway', () => ({
  getGateway: () => ({
    route: async (req: unknown) => {
      gatewayState.requests.push(req);
      return gatewayState.responses.shift() ?? { content: 'done', toolUses: [], usage: {}, provider: 'anthropic', model: 'claude-opus-5' };
    },
  }),
}));

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { executeAgenticLoop, getToolHandler, registerToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions';
import {
  FREE_TEXT_NON_GOVERNED_TOOLS,
  GOVERNED_CONTENT_WRITE_TOOLS,
  freeTextFields,
  requestsGovernedDraft,
} from '../governed-write-tools';
import { planKernelExecution } from '../../kernel-router';
import { resolveModelTier } from '../../ai-gateway/reasoning';

const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5' };
const HAIKU = { provider: 'anthropic', model: 'claude-haiku-4-5' };
const OPUS = { provider: 'anthropic', model: 'claude-opus-5' };
const GPT4O = { provider: 'openai', model: 'gpt-4o' };

describe('the classification cannot go stale', () => {
  const tools = ALL_ANA_TOOLS as Array<{ name: string; input_schema: unknown }>;
  const withFreeText = tools.filter((t) => freeTextFields(t.input_schema).length > 0).map((t) => t.name);
  const known = new Set(tools.map((t) => t.name));

  it('every tool with a free-text input is classified — a new one cannot ship unclassified', () => {
    const unclassified = withFreeText.filter(
      (n) => !(n in GOVERNED_CONTENT_WRITE_TOOLS) && !(n in FREE_TEXT_NON_GOVERNED_TOOLS),
    );
    expect(unclassified).toEqual([]);
  });

  it('no tool is in both maps', () => {
    expect(Object.keys(GOVERNED_CONTENT_WRITE_TOOLS).filter((n) => n in FREE_TEXT_NON_GOVERNED_TOOLS)).toEqual([]);
  });

  it('every classified name is a real tool — no stale entries', () => {
    const stale = [...Object.keys(GOVERNED_CONTENT_WRITE_TOOLS), ...Object.keys(FREE_TEXT_NON_GOVERNED_TOOLS)].filter(
      (n) => !known.has(n),
    );
    expect(stale).toEqual([]);
  });

  it('every entry says why', () => {
    for (const [n, why] of Object.entries({ ...GOVERNED_CONTENT_WRITE_TOOLS, ...FREE_TEXT_NON_GOVERNED_TOOLS })) {
      expect(why.length, n).toBeGreaterThan(30);
    }
  });

  it('the scan still finds the tools the defect was found through', () => {
    for (const n of ['draft_authoring_document', 'save_document_to_vault', 'update_vault_document']) {
      expect(withFreeText, n).toContain(n);
      expect(GOVERNED_CONTENT_WRITE_TOOLS, n).toHaveProperty(n);
    }
  });
});

describe('the gate, on the real registered handlers', () => {
  const run = async (tool: string, servingModel: unknown) => {
    const handler = getToolHandler(tool);
    expect(handler, tool).toBeDefined();
    try {
      return JSON.parse(await handler!({ title: 't', content: 'c', reason: 'reason for change' }, { servingModel, organizationId: 1 } as any));
    } catch (e) {
      return { threw: (e as Error).message };
    }
  };

  for (const tool of Object.keys(GOVERNED_CONTENT_WRITE_TOOLS)) {
    it(`${tool}: refused when Sonnet produced the call`, async () => {
      const r = await run(tool, SONNET);
      expect(r.error).toBe('MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE');
      expect(r.message).toMatch(/Nothing was saved/);
    });
  }

  it('refused when the serving model is unknown — absent means refused', async () => {
    expect((await run('save_document_to_vault', undefined)).error).toBe('MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE');
  });

  it('refused for GPT-4o, which the registry caps below high-risk', async () => {
    expect((await run('update_vault_document', GPT4O)).error).toBe('MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE');
  });

  it('an approved model is not refused by the gate', async () => {
    const r = await run('save_document_to_vault', OPUS);
    expect(r.error).not.toBe('MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE');
  });

  it('a tool that only analyses free text is not gated', async () => {
    const h = getToolHandler('assess_readability')!;
    const r = JSON.parse(await h({ text: 'The patient was dosed.' }, { servingModel: HAIKU } as any));
    expect(r.error).not.toBe('MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE');
  });

  it('a tool calling another tool’s handler directly is gated too (assemble_crl_premortem_artifact → author_docx_native)', async () => {
    // The nested call reaches author_docx_native through getToolHandler with the
    // caller's context, exactly as AnaToolExecutor.ts does — and the gate is on
    // the registered handler, so there is no door around it.
    const nested = getToolHandler('author_docx_native')!;
    const r = JSON.parse(await nested({ title: 't', content: '# x', output_format: 'docx' }, { servingModel: SONNET } as any));
    expect(r.error).toBe('MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE');
  });
});

describe('the /api/chat door: the agentic loop tells the gate which model produced each call', () => {
  // A governed write outside CONFIRM_TIER_TOOLS, so this pins the model hand-off
  // alone. (save_document_to_vault was the example until P0-12 put it behind a
  // person's confirmation; on this door it is now proposed — pinned below.)
  const inner = vi.fn(async () => JSON.stringify({ status: 'saved' }));
  beforeEach(() => {
    inner.mockClear();
    gatewayState.responses = [];
    registerToolHandler('update_protocol_section', inner);
  });
  const request = { taskType: 'chat' as const, messages: [{ role: 'user' as const, content: 'save it' }], maxTokens: 512, tools: [{ name: 'update_protocol_section' }] as any };
  const toolRound = (served: { provider: string; model: string }) => ({
    content: '',
    provider: served.provider,
    model: served.model,
    usage: {},
    toolUses: [{ id: 'tu1', name: 'update_protocol_section', input: { title: 't', content: 'model-written', reason: 'reason text' } }],
  });

  it('a call produced by Sonnet is refused and nothing is stored', async () => {
    gatewayState.responses.push(toolRound(SONNET));
    await executeAgenticLoop(request as any, { toolContext: { organizationId: 1 } } as any);
    expect(inner).not.toHaveBeenCalled();
  });

  it('a call produced by Opus clears the model gate — and, being a write, is put to a person, not run (P1-34)', async () => {
    gatewayState.requests = [];
    gatewayState.responses.push(toolRound(OPUS));
    await executeAgenticLoop(request as any, { toolContext: { organizationId: 1 } } as any);
    expect(inner).not.toHaveBeenCalled();
    const fedBack = JSON.stringify(gatewayState.requests.at(-1));
    expect(fedBack).toContain('HUMAN_CONFIRMATION_REQUIRED');
    expect(fedBack).not.toContain('MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE');
  });

  it('and on a person\'s yes, the Opus-written content reaches the handler', async () => {
    await getToolHandler('update_protocol_section')!({ section_id: 1, content: 'x' }, {
      organizationId: 1,
      servingModel: OPUS,
      humanConfirmed: true,
    } as any);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('the caller cannot vouch for the model: a servingModel in the toolContext is overwritten by the one in the response', async () => {
    gatewayState.responses.push(toolRound(SONNET));
    await executeAgenticLoop(request as any, { toolContext: { organizationId: 1, servingModel: OPUS } } as any);
    expect(inner).not.toHaveBeenCalled();
  });

  it('a confirm-tier tool is proposed on this door, even from an approved model — nothing is stored', async () => {
    const vaultSave = vi.fn(async () => JSON.stringify({ status: 'saved' }));
    registerToolHandler('save_document_to_vault', vaultSave);
    gatewayState.responses.push({
      ...toolRound(OPUS),
      toolUses: [{ id: 'tu2', name: 'save_document_to_vault', input: { title: 't', content: 'x', reason: 'reason text' } }],
    });
    await executeAgenticLoop(
      { ...request, tools: [{ name: 'save_document_to_vault' }] } as any,
      { toolContext: { organizationId: 1 } } as any,
    );
    expect(vaultSave).not.toHaveBeenCalled();
  });
});

describe('the stream door (source pin)', () => {
  const src = readFileSync(path.resolve(__dirname, '../../../routes/ana-ri/stream.ts'), 'utf8');
  it('hands every tool call the model that produced it', () => {
    expect(src).toMatch(/handler\(toolUse\.input, \{\s*servingModel: lastServedModel,/);
  });
  it('sets the served model from the first response and updates it after every round', () => {
    expect(src).toMatch(/let lastServedModel = servedModelOf\(gwResponse\);/);
    expect(src).toMatch(/lastServedModel = servedModelOf\(roundResponse\);/);
  });
});

describe('drafting turns get an approved model up front', () => {
  it.each([
    'Draft the clinical overview for this project as an authoring document',
    'please write section 2.5.4 for me',
    'Prepare a response to the FDA information request',
    'compose the cover letter for the submission',
  ])('detects a governed draft request: %s', (m) => expect(requestsGovernedDraft(m)).toBe(true));

  it.each(['take me to CMC', 'what does section 2.5 require?', 'summarise this thread', 'is the submission ready?'])(
    'does not flag an ordinary turn: %s',
    (m) => expect(requestsGovernedDraft(m)).toBe(false),
  );

  it('a drafting request on Balanced is scored high-risk and routed to the flagship tier', () => {
    const plan = planKernelExecution({ route: '/api/chat', messageLength: 70, requestsGovernedDraft: true });
    expect(plan.riskTier).toBe('high');
    expect(resolveModelTier({ effort: 'balanced', riskTier: plan.riskTier, taskType: plan.taskType })).toBe('flagship');
  });

  it('both routes compute the hint from the message (source pin)', () => {
    for (const f of ['../../../routes/ana-ri/stream.ts', '../../../routes/chat/send-message.ts']) {
      const s = readFileSync(path.resolve(__dirname, f), 'utf8');
      expect(s, f).toMatch(/requestsGovernedDraft: requestsGovernedDraft\(message\)/);
    }
  });
});
