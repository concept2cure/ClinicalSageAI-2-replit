/**
 * The MCP door refuses a propose-only or refused-in-chat AnA tool.
 *
 * ── Why here, today ──────────────────────────────────────────────────────────
 * callAnaHandler (server/mcp/tools/runtime.ts) resolves an AnA handler by name
 * and calls it. Nothing between the connector and the handler classified the
 * call (audit 2026-09-24 DP-36, plan P1-34), and a connector has no person in
 * the loop at all, so on this surface a proposal is a refusal in practice.
 * The registration wrapper in AnaToolExecutor.ts will carry the same gate for
 * every door once its window opens; until then this door holds its own.
 *
 * The handler is a mock: the point is that it is NOT called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const handlerState = vi.hoisted(() => ({
  handler: vi.fn(async () => JSON.stringify({ ok: true, saved: true })),
  known: new Set(['save_document_to_vault', 'retire_qms_document', 'qms_change_transition', 'lookup_ich_guideline', 'approve_import']),
}));
vi.mock('../../services/ana/AnaToolExecutor', () => ({
  getToolHandler: (name: string) => (handlerState.known.has(name) ? handlerState.handler : undefined),
}));

const auditState = vi.hoisted(() => ({ logAction: vi.fn(async () => ({ persisted: true })) }));
vi.mock('../../services/auditService', () => ({ default: { logAction: auditState.logAction } }));

import { callAnaHandler, type ToolRunContext } from '../tools/runtime';

const ctx = (): ToolRunContext =>
  ({
    principal: { organizationId: 7, userId: 3, organizationUuid: null, clientId: 'c', tokenUse: 'access', scopes: ['c2c:read', 'c2c:draft', 'c2c:file'], role: 'member' },
    config: {},
    ana: { organizationId: 7, userId: 3, organizationUuid: null },
  }) as unknown as ToolRunContext;

describe('callAnaHandler holds the propose-only partition on the MCP door', () => {
  beforeEach(() => {
    handlerState.handler.mockClear();
    auditState.logAction.mockClear();
  });

  it('a propose-only tool is refused HUMAN_CONFIRMATION_REQUIRED and the handler is not called', async () => {
    const outcome = await callAnaHandler('save_document_to_vault', { title: 't', content: 'c', reason: 'model wrote this' }, ctx());
    expect(outcome.kind).toBe('refused');
    expect(outcome.kind === 'refused' && outcome.reason).toBe('HUMAN_CONFIRMATION_REQUIRED');
    expect(outcome.kind === 'refused' && outcome.data?.data).toMatchObject({
      tier: 'reason',
      proposedByAgent: true,
      retry: { tool: 'save_document_to_vault', input: { title: 't', content: 'c', reason: 'model wrote this' } },
    });
    expect(handlerState.handler).not.toHaveBeenCalled();
  });

  it('a refused-in-chat tool is refused REFUSED_IN_CHAT and the handler is not called', async () => {
    const outcome = await callAnaHandler('retire_qms_document', { document_id: 1, reason: 'obsolete now' }, ctx());
    expect(outcome.kind).toBe('refused');
    expect(outcome.kind === 'refused' && outcome.reason).toBe('REFUSED_IN_CHAT');
    expect(outcome.kind === 'refused' && outcome.data?.message).toMatch(/Nothing was recorded or changed/);
    expect(handlerState.handler).not.toHaveBeenCalled();
  });

  it('qms_change_transition: approved is refused; under_assessment is a proposal; both leave the handler uncalled', async () => {
    const approve = await callAnaHandler('qms_change_transition', { change_id: 1, to: 'approved', reason: 'r' }, ctx());
    expect(approve.kind === 'refused' && approve.reason).toBe('REFUSED_IN_CHAT');
    const assess = await callAnaHandler('qms_change_transition', { change_id: 1, to: 'under_assessment', reason: 'r' }, ctx());
    expect(assess.kind === 'refused' && assess.reason).toBe('HUMAN_CONFIRMATION_REQUIRED');
    expect(handlerState.handler).not.toHaveBeenCalled();
  });

  it('a refusal is audited as a denial the way a scope denial is', async () => {
    await callAnaHandler('approve_import', { import_job_id: 1, project_id: 2 }, ctx());
    await callAnaHandler('save_document_to_vault', { title: 't' }, ctx());
    expect(auditState.logAction).toHaveBeenCalledTimes(2);
    for (const [entry] of auditState.logAction.mock.calls as unknown as Array<[Record<string, unknown>]>) {
      expect(entry.action).toBe('mcp_governed_tool_call');
      expect((entry.details as Record<string, unknown>).outcome).toBe('denied');
      expect(String((entry.details as Record<string, unknown>).detail)).toMatch(/REFUSED_IN_CHAT|HUMAN_CONFIRMATION_REQUIRED/);
    }
  });

  it('a read reaches its handler with the caller’s tenant', async () => {
    const outcome = await callAnaHandler('lookup_ich_guideline', { guideline: 'E6' }, ctx());
    expect(outcome.kind).toBe('ok');
    expect(handlerState.handler).toHaveBeenCalledWith({ guideline: 'E6' }, { organizationId: 7, userId: 3, organizationUuid: null });
    expect(auditState.logAction).not.toHaveBeenCalled();
  });

  it('a confirmed context reaches a propose-only handler — the flag nobody sets on this surface', async () => {
    // The MCP surface never stamps this (the single writer is routes/ana-ri/utility.ts),
    // so the case documents the contract the wrapper gate will share, not a path.
    const c = ctx();
    c.ana = { ...c.ana, humanConfirmed: true };
    const outcome = await callAnaHandler('save_document_to_vault', { title: 't' }, c);
    expect(outcome.kind).toBe('ok');
    expect(handlerState.handler).toHaveBeenCalledTimes(1);
  });

  it('a refused act stays refused even with a confirmed context — a ceremony is not a chat confirmation', async () => {
    const c = ctx();
    c.ana = { ...c.ana, humanConfirmed: true };
    const outcome = await callAnaHandler('retire_qms_document', { document_id: 1, reason: 'obsolete now' }, c);
    expect(outcome.kind === 'refused' && outcome.reason).toBe('REFUSED_IN_CHAT');
    expect(handlerState.handler).not.toHaveBeenCalled();
  });
});

describe('runtime.ts reaches handlers only through getToolHandler (source pin)', () => {
  const src = readFileSync(path.resolve(__dirname, '../tools/runtime.ts'), 'utf8');

  it('one import of the executor, and only its lookup', () => {
    expect(src.match(/services\/ana\/AnaToolExecutor'/g)).toHaveLength(1);
    expect(src).toMatch(/const \{ getToolHandler \} = await import\('\.\.\/\.\.\/services\/ana\/AnaToolExecutor'\)/);
    expect(src).toMatch(/getToolHandler\(name\)/);
    expect(src).not.toMatch(/registerToolHandler|toolHandlers\b|getRegisteredToolNames/);
  });

  it('classifies before it dispatches, through the registry helpers and no second list', () => {
    expect(src).toMatch(/refusedInChatTool\(name, input\)/);
    expect(src).toMatch(/isProposeOnlyTool\(name\)/);
    expect(src).toMatch(/humanConfirmed !== true/);
    // The confirmation is read from the context, never from the tool's input.
    expect(src).not.toMatch(/input[^\n]*humanConfirmed/);
  });
});
