/**
 * The gate that decides which of AnA's tool calls need a person first.
 *
 * ── The case this file exists for ─────────────────────────────────────────────
 * `an unreadable call is refused, not cleared`.
 *
 * Until the streamed-tool-input fix, every tool call on AnA's main path arrived
 * with `input: {}`: the `input_json_delta` branch of the gateway's stream
 * handler was an empty comment and nothing accumulated. So a classifier written
 * the obvious way —
 *
 *     const command = input.command;
 *     if (!isProposeOnlyCommand(command)) return UNGOVERNED;
 *
 * — would have returned UNGOVERNED for EVERY governed call on the streaming
 * surface, because `command` was always undefined. The gate would have reported
 * itself clean while passing everything, and it would have been most confident
 * exactly where it was blindest.
 *
 * That is why UNDECIDABLE is a third state and not a tidier spelling of
 * UNGOVERNED, and why these cases assert the distinction rather than just
 * asserting that governed commands are caught.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────────────
 * Any restatement of which commands are governed. `PROPOSE_ONLY_COMMANDS` is
 * DERIVED from COMMAND_AUTHORIZATION so that a new governed handler joins the
 * partition when it is registered; a fixture listing members here would be the
 * hand-maintained copy that derivation exists to prevent. These cases read the
 * live partition and assert the gate AGREES with it.
 */
import { describe, it, expect } from 'vitest';

import { classifyDirectToolCall, classifyToolCall, PLATFORM_COMMAND_TOOL } from '../governed-tool-gate.js';
import { PROPOSE_ONLY_COMMANDS, isProposeOnlyCommand } from '../../ana-ri/command-rbac.js';
import { PART11_ESIGN_COMMANDS, PART11_GOVERNED_COMMANDS } from '../../ana-ri/part11-governance.js';
import { PROPOSE_ONLY_TOOLS, REFUSE_IN_CHAT_TOOLS, toolTierOf } from '../propose-only-tools.js';

const cmd = (command: unknown, params?: unknown) => ({
  name: PLATFORM_COMMAND_TOOL,
  input: params === undefined ? { command } : { command, params },
});

/** A live member of the partition, so no fixture can drift from it. */
const AN_ESIGN_COMMAND = [...PART11_ESIGN_COMMANDS].find(c => isProposeOnlyCommand(c))!;
// The reason tier is the governed set minus the e-sign set; the partition
// also holds the confirm tier now (every other write), so it is not the
// place to draw a reason-only sample from.
const A_REASON_ONLY_COMMAND = [...PART11_GOVERNED_COMMANDS].find(
  c => !PART11_ESIGN_COMMANDS.has(c) && isProposeOnlyCommand(c),
)!;

describe('an unreadable call is refused, not cleared', () => {
  it('UNDECIDABLE when the input carries no command — the streamed-empty-input case', () => {
    // This was the state of every tool call on the main path before the stream
    // handler accumulated input_json_delta. Answering UNGOVERNED here is the
    // whole defect: it opens the gate for everything while reporting it shut.
    expect(classifyToolCall({ name: PLATFORM_COMMAND_TOOL, input: {} })).toEqual({
      kind: 'UNDECIDABLE',
      why: 'no command name in the call',
    });
  });

  it('UNDECIDABLE is NOT UNGOVERNED — the distinction is the point', () => {
    const blind = classifyToolCall({ name: PLATFORM_COMMAND_TOOL, input: {} });
    const clear = classifyToolCall({ name: 'search_documents', input: { query: 'x' } });
    expect(blind.kind).not.toBe(clear.kind);
    expect(clear.kind).toBe('UNGOVERNED');
  });

  it('UNDECIDABLE when the arguments failed to parse mid-stream', () => {
    // ToolCall.inputParseError is a real state, not a theoretical one, and a
    // tool nobody could read must not reach a dispatcher either.
    const v = classifyToolCall({
      name: PLATFORM_COMMAND_TOOL,
      input: {},
      inputParseError: 'Unexpected end of JSON input',
    });
    expect(v.kind).toBe('UNDECIDABLE');
    expect(v.kind === 'UNDECIDABLE' && v.why).toMatch(/did not parse/);
  });

  it('UNDECIDABLE for a non-object input, however it arrived', () => {
    for (const input of [null, undefined, 'freeze_document', 42, ['freeze_document']]) {
      expect(classifyToolCall({ name: PLATFORM_COMMAND_TOOL, input }).kind).toBe('UNDECIDABLE');
    }
  });

  it('UNDECIDABLE for a blank or whitespace command', () => {
    for (const c of ['', '   ']) {
      expect(classifyToolCall(cmd(c)).kind).toBe('UNDECIDABLE');
    }
  });
});

describe('the gate agrees with the partition rather than restating it', () => {
  it('asks for approval on every propose-only command', () => {
    // Reads the LIVE set. A command added to COMMAND_AUTHORIZATION with a
    // governed shape joins the partition automatically, and this case makes the
    // gate follow it without anyone editing a list here.
    expect(PROPOSE_ONLY_COMMANDS.size).toBeGreaterThan(10);
    for (const command of PROPOSE_ONLY_COMMANDS) {
      expect(classifyToolCall(cmd(command)).kind).toBe('NEEDS_APPROVAL');
    }
  });

  it('leaves reads alone and asks for a confirmation on ordinary writes', () => {
    // Since 2026-09-26 (audit DP-08, P0-12) every write is a proposal: an
    // ordinary authoring mutation is the confirm tier — one click, no reason,
    // no credentials — so AnA still drafts, and a person takes the action.
    expect(classifyToolCall(cmd('list_projects')).kind).toBe('UNGOVERNED');
    const v = classifyToolCall(cmd('create_artifact'));
    expect(v.kind).toBe('NEEDS_APPROVAL');
    expect(v.kind === 'NEEDS_APPROVAL' && v.tier).toBe('confirm');
  });

  it('carries the command and params forward for the person to read', () => {
    // What the person authorises has to be what AnA proposed, so the verdict
    // carries it rather than leaving the caller to re-extract it.
    const v = classifyToolCall(cmd(AN_ESIGN_COMMAND, { documentId: 7, note: 'x' }));
    expect(v).toEqual({
      kind: 'NEEDS_APPROVAL',
      command: AN_ESIGN_COMMAND,
      params: { documentId: 7, note: 'x' },
      tier: 'esignature',
    });
  });

  it('defaults params to an empty object rather than undefined', () => {
    const v = classifyToolCall(cmd(AN_ESIGN_COMMAND));
    expect(v.kind === 'NEEDS_APPROVAL' && v.params).toEqual({});
  });
});

describe('the tier follows part11-governance, not a second opinion', () => {
  it('demands a signature for the e-sign tier', () => {
    const v = classifyToolCall(cmd(AN_ESIGN_COMMAND));
    expect(v.kind === 'NEEDS_APPROVAL' && v.tier).toBe('esignature');
  });

  it('demands a signature for the GDPR erasure (audit 2026-09-24 DP-08/DP-09, P0-12)', () => {
    const v = classifyToolCall(cmd('erase_personal_data', { dataSubjectId: 42 }));
    expect(v.kind).toBe('NEEDS_APPROVAL');
    expect(v.kind === 'NEEDS_APPROVAL' && v.tier).toBe('esignature');
  });

  it('demands only a reason for the reason tier, and only a confirmation below it', () => {
    const v = classifyToolCall(cmd(A_REASON_ONLY_COMMAND));
    expect(v.kind === 'NEEDS_APPROVAL' && v.tier).toBe('reason');
    const c = classifyToolCall(cmd('create_task'));
    expect(c.kind === 'NEEDS_APPROVAL' && c.tier).toBe('confirm');
  });

  it('every e-sign command in the partition is classified as the signature tier', () => {
    for (const command of PART11_ESIGN_COMMANDS) {
      if (!isProposeOnlyCommand(command)) continue;
      const v = classifyToolCall(cmd(command));
      expect(v.kind === 'NEEDS_APPROVAL' && v.tier).toBe('esignature');
    }
  });
});

describe('the command tool, and the tools that write on their own handlers', () => {
  it('a tool that writes on its own handler is a confirm-tier proposal (P0-12)', () => {
    // Until 2026-09-26 this read "a tool with its own handler is not classified
    // here": the vault save and TMF seed ran unasked because they are not
    // commands. They are CONFIRM_TIER_TOOLS now; the full list and the
    // registry-side gate are pinned in direct-mutator-confirm-gate.test.ts.
    expect(classifyToolCall({ name: 'save_document_to_vault', input: { title: 'x' } })).toMatchObject({
      kind: 'NEEDS_APPROVAL',
      tier: 'confirm',
    });
  });

  it('a direct write tool outside CONFIRM_TIER_TOOLS is UNGOVERNED to classifyToolCall — the registry classifies it', () => {
    // The five on CONFIRM_TIER_TOOLS are the first slice of the direct-tool
    // registry (propose-only-tools.ts, P1-34) wired at every door. The rest of
    // the registry — revise_qms_document is a reason-tier proposal there — is
    // classified by classifyDirectToolCall below and not yet by this function;
    // folding the registry into CONFIRM_TIER_TOOLS is the recorded next step.
    expect(classifyToolCall({ name: 'revise_qms_document', input: { document_id: 3, reason: 'x'.repeat(12) } }).kind).toBe('UNGOVERNED');
  });

  it('a tool named like a governed command is still just a tool', () => {
    expect(classifyToolCall({ name: 'freeze_document', input: {} }).kind).toBe('UNGOVERNED');
  });
});

describe('classifyDirectToolCall: the tool registry, with the same discipline', () => {
  const call = (name: string, input: unknown) => ({ name, input });

  it('UNDECIDABLE when the arguments failed to parse, whatever the tool', () => {
    for (const name of ['save_document_to_vault', 'retire_qms_document', 'list_vault_documents']) {
      const v = classifyDirectToolCall({ name, input: {}, inputParseError: 'Unexpected end of JSON input' });
      expect(v.kind, name).toBe('UNDECIDABLE');
      expect(v.kind === 'UNDECIDABLE' && v.why).toMatch(/did not parse/);
    }
  });

  it('UNDECIDABLE for a governed tool whose input is not an object — refused, not cleared', () => {
    for (const input of [null, undefined, 'x', 42, ['x']]) {
      expect(classifyDirectToolCall(call('save_document_to_vault', input)).kind, JSON.stringify(input)).toBe('UNDECIDABLE');
      expect(classifyDirectToolCall(call('approve_import', input)).kind, JSON.stringify(input)).toBe('UNDECIDABLE');
    }
  });

  it('NEEDS_APPROVAL, with the registry’s tier and a {tool, input} payload, for every propose-only tool', () => {
    expect(Object.keys(PROPOSE_ONLY_TOOLS).length).toBeGreaterThan(100);
    for (const [tool, entry] of Object.entries(PROPOSE_ONLY_TOOLS)) {
      const v = classifyDirectToolCall(call(tool, { a: 1 }));
      expect(v, tool).toEqual({ kind: 'NEEDS_APPROVAL', tool, input: { a: 1 }, tier: entry.tier });
    }
  });

  it('REFUSE_IN_CHAT, naming the act and where a person takes it, for every unconditional refusal', () => {
    for (const [tool, entry] of Object.entries(REFUSE_IN_CHAT_TOOLS)) {
      if (entry.when) continue;
      const v = classifyDirectToolCall(call(tool, { id: 1 }));
      expect(v, tool).toEqual({ kind: 'REFUSE_IN_CHAT', tool, act: entry.act, where: entry.where, why: entry.why });
    }
  });

  it('qms_change_transition: a refusal for approved, a reason-tier proposal for under_assessment, UNDECIDABLE with no target', () => {
    expect(classifyDirectToolCall(call('qms_change_transition', { change_id: 1, to: 'approved', reason: 'r' })).kind).toBe('REFUSE_IN_CHAT');
    expect(classifyDirectToolCall(call('qms_change_transition', { change_id: 1, to: 'closed' })).kind).toBe('REFUSE_IN_CHAT');
    const proposal = classifyDirectToolCall(call('qms_change_transition', { change_id: 1, to: 'under_assessment', reason: 'r' }));
    expect(proposal).toEqual({
      kind: 'NEEDS_APPROVAL',
      tool: 'qms_change_transition',
      input: { change_id: 1, to: 'under_assessment', reason: 'r' },
      tier: 'reason',
    });
    expect(toolTierOf('qms_change_transition')).toBe('reason');
    for (const input of [{ change_id: 1 }, { change_id: 1, to: '' }, { change_id: 1, to: 7 }]) {
      const v = classifyDirectToolCall(call('qms_change_transition', input));
      expect(v.kind, JSON.stringify(input)).toBe('UNDECIDABLE');
      expect(v.kind === 'UNDECIDABLE' && v.why).toMatch(/no transition target/);
    }
  });

  it('UNGOVERNED for a read, and for the command tool, which classifyToolCall owns', () => {
    expect(classifyDirectToolCall(call('list_vault_documents', { limit: 5 }))).toEqual({ kind: 'UNGOVERNED' });
    expect(classifyDirectToolCall(call('search_documents', 'not even an object'))).toEqual({ kind: 'UNGOVERNED' });
    expect(classifyDirectToolCall(call(PLATFORM_COMMAND_TOOL, { command: 'create_task' }))).toEqual({ kind: 'UNGOVERNED' });
    expect(classifyToolCall(call(PLATFORM_COMMAND_TOOL, { command: 'create_task' })).kind).toBe('NEEDS_APPROVAL');
  });

  it("the finding's exemplars (DP-36)", () => {
    expect(classifyDirectToolCall(call('save_document_to_vault', { title: 'x', content: 'y', reason: 'z' })).kind).toBe('NEEDS_APPROVAL');
    expect(classifyDirectToolCall(call('update_vault_document', { id: 1 })).kind).toBe('NEEDS_APPROVAL');
    expect(classifyDirectToolCall(call('draft_authoring_document', { title: 'x' })).kind).toBe('NEEDS_APPROVAL');
    expect(classifyDirectToolCall(call('create_qms_document', { title: 'x' })).kind).toBe('NEEDS_APPROVAL');
    expect(classifyDirectToolCall(call('retire_qms_document', { document_id: 1, reason: 'obsolete now' })).kind).toBe('REFUSE_IN_CHAT');
    expect(classifyDirectToolCall(call('approve_import', { import_job_id: 1, project_id: 2 })).kind).toBe('REFUSE_IN_CHAT');
  });
});
