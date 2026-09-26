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

import { classifyToolCall, PLATFORM_COMMAND_TOOL } from '../governed-tool-gate.js';
import { PROPOSE_ONLY_COMMANDS, isProposeOnlyCommand } from '../../ana-ri/command-rbac.js';
import { PART11_ESIGN_COMMANDS, PART11_GOVERNED_COMMANDS } from '../../ana-ri/part11-governance.js';

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

describe('only the command tool can be governed', () => {
  it('a tool with its own handler is not classified here', () => {
    // Not an omission — see the module docstring. Escalating an authoring tool
    // is a product decision about what AnA may do unaided, taken with the tier
    // changed in the same commit, not something this translation layer invents.
    expect(classifyToolCall({ name: 'save_document_to_vault', input: { title: 'x' } }).kind).toBe(
      'UNGOVERNED',
    );
  });

  it('a tool named like a governed command is still just a tool', () => {
    expect(classifyToolCall({ name: 'freeze_document', input: {} }).kind).toBe('UNGOVERNED');
  });
});
