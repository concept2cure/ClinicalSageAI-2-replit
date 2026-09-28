/**
 * The sign-off prompt AnA raises WHILE she is still waiting on it.
 *
 * ── What changed ──────────────────────────────────────────────────────────────
 * A governed command used to end the turn. The server refused it with
 * HUMAN_CONFIRMATION_REQUIRED, the refusal arrived in `post_done.executedCommands`,
 * the person signed, and the action ran on its own — after AnA had stopped. She
 * asked, but she could not wait for the answer, so nothing she planned to do
 * with the result ever happened.
 *
 * Now she holds the run at `awaiting_approval` and the prompt arrives live, as
 * an `approval_required` frame. The decision routes back to the waiting turn
 * through `runId` + `toolUseId`, and she carries on from what a person decided.
 *
 * ── Why this produces the SAME shape ──────────────────────────────────────────
 * `pendingSignoffFromApproval` returns a PendingSignoff, identical to what the
 * end-of-turn path produces, so GovernedActionSignoff renders it unchanged.
 * That is the whole point: part11-governance's own docstring warns that
 * "inventing a second propose-then-confirm channel would leave two flows to
 * keep in step, and the one that drifted would be the one nobody was watching".
 * One dialog, one route, one audit row — the only difference is when it appears.
 *
 * ── The guard these cases exist for ───────────────────────────────────────────
 * A frame missing its run/tool pair must produce NO prompt. Rendering one would
 * put a confirm button on screen whose answer has nowhere to go: the person
 * signs, the server cannot bind the decision to a waiting run, and AnA sits at
 * the gate until the window expires — having shown them a dialog that did
 * nothing.
 */
import { describe, it, expect } from 'vitest';

import { pendingSignoffFromApproval } from '../useGovernedAction';

const frame = (over: Record<string, unknown> = {}) => ({
  type: 'approval_required',
  runId: 'run_abc',
  toolUseId: 'tu_1',
  action: 'freeze_document',
  message: 'AnA is waiting on this before she goes on.',
  data: {
    reasonRequired: true,
    signatureRequired: true,
    proposedByAgent: true,
    retry: { command: 'freeze_document', params: { documentId: 7 } },
  },
  ...over,
});

describe('a live approval becomes the sign-off the rail already renders', () => {
  it('carries the command, the params and the tier', () => {
    expect(pendingSignoffFromApproval(frame())).toEqual({
      command: 'freeze_document',
      params: { documentId: 7 },
      signatureRequired: true,
      tier: 'esignature',
      message: 'AnA is waiting on this before she goes on.',
      runId: 'run_abc',
      toolUseId: 'tu_1',
    });
  });

  it('carries the routing pair — without it the decision cannot reach her', () => {
    const p = pendingSignoffFromApproval(frame())!;
    expect(p.runId).toBe('run_abc');
    expect(p.toolUseId).toBe('tu_1');
  });

  it('carries the confirm tier the server names, and derives the tier when an older server names none', () => {
    const c = pendingSignoffFromApproval(
      frame({ data: { tier: 'confirm', reasonRequired: false, signatureRequired: false, retry: { command: 'create_task', params: { title: 'x' } } } }),
    )!;
    expect(c.tier).toBe('confirm');
    expect(c.signatureRequired).toBe(false);
    const legacy = pendingSignoffFromApproval(
      frame({ data: { signatureRequired: true, retry: { command: 'freeze_document', params: {} } } }),
    )!;
    expect(legacy.tier).toBe('esignature');
  });

  it('is the reason-only tier when no signature is demanded', () => {
    const p = pendingSignoffFromApproval(
      frame({ data: { signatureRequired: false, retry: { command: 'update_milestone', params: {} } } }),
    )!;
    expect(p.signatureRequired).toBe(false);
    expect(p.command).toBe('update_milestone');
  });

  it('defaults params rather than leaving them undefined', () => {
    const p = pendingSignoffFromApproval(
      frame({ data: { signatureRequired: true, retry: { command: 'freeze_document' } } }),
    )!;
    expect(p.params).toEqual({});
  });

  it('falls back to honest copy when the server sent none', () => {
    const p = pendingSignoffFromApproval(frame({ message: undefined }))!;
    expect(p.message).toMatch(/reason for change/i);
  });
});

describe('a frame that could not be answered raises no prompt', () => {
  it('no runId — the answer would have nowhere to go', () => {
    expect(pendingSignoffFromApproval(frame({ runId: undefined }))).toBeNull();
  });

  it('no toolUseId — the decision could not be bound to a proposal', () => {
    // Binding is what stops a signature given for one action authorising
    // another, so a frame without it must not be signable at all.
    expect(pendingSignoffFromApproval(frame({ toolUseId: undefined }))).toBeNull();
  });

  it('no command — nothing to describe to the person', () => {
    expect(pendingSignoffFromApproval(frame({ data: { retry: {} } }))).toBeNull();
  });

  it('no data at all', () => {
    expect(pendingSignoffFromApproval({ type: 'approval_required' })).toBeNull();
  });

  it('non-string routing values are refused, not coerced', () => {
    expect(pendingSignoffFromApproval(frame({ runId: 42 }))).toBeNull();
    expect(pendingSignoffFromApproval(frame({ toolUseId: { id: 'tu_1' } }))).toBeNull();
  });
});
