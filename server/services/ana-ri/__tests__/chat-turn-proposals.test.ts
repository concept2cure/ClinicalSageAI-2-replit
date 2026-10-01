/**
 * What a non-streaming chat turn tells the person about AnA's proposals
 * (P0-12 residual, 2026-10-01; plan row "prompts on the non-SSE chat paths").
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * 1. On POST /api/chat the agentic loop runs `execute_platform_command`; a
 *    write comes back from executeCommands as a HUMAN_CONFIRMATION_REQUIRED
 *    proposal inside the tool result. Nothing was written — but the proposal
 *    reached only the model. The response carried no `executedCommands`, so a
 *    client had nothing to render a sign-off prompt from, and the person could
 *    not confirm what AnA proposed. The live stream holds the turn and asks;
 *    this path had no way to ask at all.
 * 2. A reply that was nothing but blocks was stored as "Action executed
 *    successfully." whenever any result existed — including when every result
 *    was a refusal (RBAC_DENIED, GOVERNANCE_UNAVAILABLE) and nothing ran.
 *
 * ── What is pinned here ─────────────────────────────────────────────────────
 * A platform-command proposal in a tool result is lifted, as the executor
 * built it, into the turn's `executedCommands` — the envelope
 * extractPendingSignoffs reads — and confirming it goes to the one route that
 * stamps humanConfirmed. A proposal from a tool that writes on its own handler
 * is NOT lifted: the route runs one only from a held run (TOOL_NEEDS_HELD_RUN),
 * so a prompt for it could never be completed, and the model relays it instead.
 * Nothing here classifies anything: it reads the answer the partition gave.
 *
 * ── Fix round (2026-10-01) ──────────────────────────────────────────────────
 * The verifier found the answer still claimed a run that never happened:
 * blocksOnlyAnswer([]) said "Action executed successfully.", and POST /api/chat
 * stored it for a reply of nothing but blocks that proposed nothing — a
 * provisional draft, or a strong one in a conversation scoped to a program
 * UUID rather than a project. The draft itself was dropped. Now the answer
 * keeps the draft and says it was not saved, and why.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { blocksOnlyAnswer, pendingSignoffFromToolResult, settleActionBlocks } from '../../ana-guidance-executor';

const proposal = (command: string, tier = 'confirm') => ({
  success: false,
  action: command,
  error: 'HUMAN_CONFIRMATION_REQUIRED',
  message: `${command} needs a person's confirmation.`,
  data: { tier, proposedByAgent: true, retry: { command, params: { taskId: 4, status: 'done' } } },
});

/** What the execute_platform_command handler returns (AnaToolExecutor.ts). */
const platformResult = (result: unknown) =>
  JSON.stringify({ status: 'failed', command: 'update_task', result, instruction: '…' });

describe('a platform-command proposal from the tool loop reaches the sign-off prompt', () => {
  it('is lifted as the executor built it', () => {
    const p = proposal('update_task');
    expect(pendingSignoffFromToolResult('execute_platform_command', platformResult(p))).toEqual(p);
  });

  it('a Part 11 signature demand is lifted too', () => {
    const p = { ...proposal('place_in_dossier', 'esignature'), error: 'PART11_SIGNATURE_REQUIRED' };
    expect(pendingSignoffFromToolResult('execute_platform_command', platformResult(p))).toEqual(p);
  });

  it('a command that ran, or was refused, is not a prompt', () => {
    const ran = { success: true, action: 'list_tasks', message: '3 tasks' };
    const denied = { success: false, action: 'update_task', error: 'RBAC_DENIED', message: 'no' };
    expect(pendingSignoffFromToolResult('execute_platform_command', platformResult(ran))).toBeNull();
    expect(pendingSignoffFromToolResult('execute_platform_command', platformResult(denied))).toBeNull();
  });

  it('a proposal without the command to retry is not a prompt (nothing to confirm)', () => {
    const p = { ...proposal('update_task'), data: { tier: 'confirm' } };
    expect(pendingSignoffFromToolResult('execute_platform_command', platformResult(p))).toBeNull();
  });

  it('a tool that writes on its own handler is not lifted: it is confirmable only from a held run', () => {
    // registerToolHandler's wrapper answers with the same proposal shape.
    const p = proposal('save_document_to_vault');
    expect(pendingSignoffFromToolResult('save_document_to_vault', JSON.stringify(p))).toBeNull();
  });

  it('an unreadable result is not a prompt', () => {
    expect(pendingSignoffFromToolResult('execute_platform_command', 'not json')).toBeNull();
    expect(pendingSignoffFromToolResult('execute_platform_command', JSON.stringify({ status: 'failed' }))).toBeNull();
  });
});

describe('POST /api/chat returns the loop’s proposals beside the action-block proposals', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../../routes/chat/send-message.ts'), 'utf8');

  it('collects them from the loop’s tool results', () => {
    expect(/pendingSignoffFromToolResult\(\s*toolName\s*,\s*result\s*\)/.test(src), 'onToolExecution reads each result').toBe(true);
  });

  it('puts them in executedCommands', () => {
    expect(/executedCommands:\s*\w+\.length > 0/.test(src), 'the response carries executedCommands').toBe(true);
    expect(/loopProposals/.test(src), 'the loop proposals join the envelope').toBe(true);
  });
});

describe('a reply that was only blocks says what happened', () => {
  it('a proposal: nothing has changed yet', () => {
    expect(blocksOnlyAnswer([proposal('create_artifact')])).toMatch(/Nothing has changed yet/);
  });

  it('only refusals: it does not say anything was executed', () => {
    const denied = { success: false, action: 'create_artifact', error: 'RBAC_DENIED', message: 'You do not have permission to perform \'create_artifact\'.' };
    const answer = blocksOnlyAnswer([denied]);
    expect(answer).not.toMatch(/executed successfully/i);
    expect(answer).toContain('Nothing was changed');
    expect(answer).toContain(denied.message);
  });

  it('everything ran: it says so', () => {
    expect(blocksOnlyAnswer([{ success: true, action: 'list_projects', message: '2 projects' }])).toBe('Action executed successfully.');
  });
});

describe('nothing ran and nothing was proposed: the answer says so (fix round)', () => {
  it('an empty list: nothing was changed', () => {
    expect(blocksOnlyAnswer([])).toBe('Nothing was changed.');
  });
});

describe('POST /api/chat: what the person reads after AnA’s ana-action blocks (settleActionBlocks)', () => {
  const CONTENT = [
    '## Summary',
    'The drug substance stability package lacks the six-month accelerated data that ICH Q1A(R2) expects for the proposed retest period.',
    '## Recommendation',
    'Complete the accelerated study on the three primary batches before the pre-IND package is assembled.',
  ].join('\n');
  const block = (over: Record<string, unknown> = {}) =>
    '```ana-action\n' +
    JSON.stringify({ type: 'memo', confidence: 'strong', title: 'Risk Memo: Accelerated Stability', content: CONTENT, ...over }) +
    '\n```';
  const turn = { projectId: 5, organizationId: 61, userId: 7, threadId: 'th_9' };
  const PROGRAM_UUID = '7abb1c22-1111-4222-8333-944445555666';

  it('a reply of nothing but a provisional block: the draft stays on screen, marked not saved', async () => {
    const { answer, proposals } = await settleActionBlocks(block({ confidence: 'provisional' }), turn);
    expect(proposals).toEqual([]);
    expect(answer).not.toMatch(/executed successfully/i);
    expect(answer, 'the draft AnA wrote is dropped').toContain(CONTENT);
    expect(answer).toMatch(/Not saved\. AnA marked it provisional/);
    expect(answer).not.toContain('ana-action');
  });

  it('a strong block in a conversation scoped to a program UUID: not proposed, and the answer says why', async () => {
    const { answer, proposals } = await settleActionBlocks(block(), { ...turn, projectId: PROGRAM_UUID });
    expect(proposals).toEqual([]);
    expect(answer).not.toMatch(/executed successfully/i);
    expect(answer).toContain(CONTENT);
    expect(answer).toMatch(/Not saved\. This conversation is not scoped to a project/);
  });

  it('prose and a provisional block: the prose is kept and the block’s fate is stated, without repeating the draft', async () => {
    const prose = 'The stability gap is real; here is how I would frame it.';
    const { answer } = await settleActionBlocks(`${prose}\n\n${block({ confidence: 'uncertain' })}`, turn);
    expect(answer.startsWith(prose)).toBe(true);
    expect(answer).toMatch(/Risk Memo: Accelerated Stability.*Not saved\. AnA marked it uncertain/);
    expect(answer).not.toContain(CONTENT);
  });

  it('a reply without blocks is returned exactly as written', async () => {
    const reply = 'Plain answer, nothing to file.';
    expect(await settleActionBlocks(reply, turn)).toEqual({ answer: reply, proposals: [] });
  });

  it('send-message stores and returns what settleActionBlocks answers', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../routes/chat/send-message.ts'), 'utf8');
    expect(/settleActionBlocks\(\s*assistantMessage/.test(src), 'send-message settles the reply').toBe(true);
    expect(/assistantMessage = settled\.answer/.test(src), 'send-message stores the settled answer').toBe(true);
    expect(/blocksOnlyAnswer|processResponseActions/.test(src), 'send-message decides the answer itself').toBe(false);
  });
});
