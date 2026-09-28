/**
 * P0-12's last gap: AnA's tools that change records without being commands.
 *
 * Every platform command that writes has been a proposal since P0-12 part 2 —
 * AnA asks, a person confirms. Five tools write through their own handlers
 * instead, so that partition never reached them and AnA ran them unasked:
 *
 *   save_document_to_vault     a new governed artifact and its first version
 *   update_vault_document      a new version of an existing artifact
 *   file_chat_upload_to_vault  a document filed into the project Vault
 *   seed_tmf                   the trial master file's reference model
 *   save_report_definition     a saved report the organisation will use
 *
 * They get the same confirm tier, enforced in two places that between them
 * cover every path: the tool gate, which lets the live chat stream hold the turn
 * and ask; and the registry wrapper every handler is registered through, which
 * refuses to run one without a person's confirmation on any path that cannot
 * ask — the agentic loop, deep investigation, a tool calling another tool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createDefinition = vi.fn(async () => ({ ok: true, definition: { id: 'rd-1' } }));
vi.mock('../../report-os/canvas/definition-service.js', () => ({
  createDefinition,
  listDefinitions: vi.fn(async () => []),
}));

import { classifyToolCall } from '../governed-tool-gate.js';
import { toolAuthorizationOf } from '../tool-authorization.js';
import { getToolHandler } from '../AnaToolExecutor.js';

const FIVE = [
  'save_document_to_vault',
  'update_vault_document',
  'file_chat_upload_to_vault',
  'seed_tmf',
  'save_report_definition',
] as const;

describe('the tool gate puts each one to a person', () => {
  it('each is a confirm-tier write in the tool register (P1-34 folded the list of five into it)', () => {
    for (const tool of FIVE) expect(toolAuthorizationOf(tool, {}).class, tool).toBe('confirm');
  });

  it.each(FIVE)('%s is proposed at the confirm tier, carrying what it would do', tool => {
    const input = { title: 'Stability summary', reason: 'Filing the 24-month data' };
    expect(classifyToolCall({ name: tool, input })).toEqual({
      kind: 'NEEDS_APPROVAL',
      command: tool,
      params: input,
      tier: 'confirm',
    });
  });

  it('an unreadable call is refused, not proposed', () => {
    expect(classifyToolCall({ name: 'seed_tmf', input: {}, inputParseError: 'truncated' }).kind).toBe(
      'UNDECIDABLE',
    );
    expect(classifyToolCall({ name: 'seed_tmf', input: null }).kind).toBe('UNDECIDABLE');
  });

  it('a read-only neighbour is not', () => {
    expect(classifyToolCall({ name: 'list_vault_documents', input: {} }).kind).toBe('UNGOVERNED');
  });
});

describe('the registry refuses to run one no person confirmed', () => {
  const input = { title: 'Q3 readiness', panels: [{ report_type_id: 'readiness', scope_type: 'program' }] };

  beforeEach(() => createDefinition.mockClear());

  it('on a path that cannot ask, the handler answers with a proposal and writes nothing', async () => {
    const out = JSON.parse(await getToolHandler('save_report_definition')!(input, { organizationId: 1, userId: 2 }));
    expect(out).toMatchObject({
      error: 'HUMAN_CONFIRMATION_REQUIRED',
      data: { tier: 'confirm', retry: { command: 'save_report_definition', params: input } },
    });
    expect(createDefinition).not.toHaveBeenCalled();
  });

  it('once a person has confirmed, it runs', async () => {
    await getToolHandler('save_report_definition')!(input, { organizationId: 1, userId: 2, humanConfirmed: true });
    expect(createDefinition).toHaveBeenCalledTimes(1);
  });

  it('the confirmation is read from the context, never from what the model wrote', async () => {
    await getToolHandler('save_report_definition')!(
      { ...input, humanConfirmed: true, confirm: true },
      { organizationId: 1, userId: 2 },
    );
    expect(createDefinition).not.toHaveBeenCalled();
  });
});
