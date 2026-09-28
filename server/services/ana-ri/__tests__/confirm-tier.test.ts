/**
 * Every state-changing AnA command is a proposal a person confirms, in one of
 * three tiers (security audit 2026-09-24, DP-08; plan P0-12, the body of the
 * item after `8ebe3040` moved the GDPR erasure into the e-signature tier).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * PROPOSE_ONLY_COMMANDS held 16 of the 53 `effect: 'write'` commands: a model
 * response or tool call carrying update_artifact, update_project, create_task,
 * export_document or any of the other 37 ran it, with no person in the loop.
 * The two confirmation tiers that existed (reason for change; reason plus
 * e-signature) were the only ones the governed-action route accepted, so an
 * ordinary write could not simply be widened into the partition: it would
 * have become impossible rather than confirmed.
 *
 * Pinned here: the partition is every write; a third tier, `confirm`, names
 * the ordinary writes (an explicit human yes, no reason, no credentials); the
 * result an agent gets and the verdict the tool gate returns both say which
 * tier; the two Part 11 tiers are unchanged.
 */
import { describe, expect, it } from 'vitest';
import { COMMAND_AUTHORIZATION, PROPOSE_ONLY_COMMANDS, isProposeOnlyCommand } from '../command-rbac';
import {
  buildHumanConfirmationRequiredResult,
  governedTierOf,
  PART11_ESIGN_COMMANDS,
  PART11_GOVERNED_COMMANDS,
} from '../part11-governance';
import { classifyToolCall, PLATFORM_COMMAND_TOOL } from '../../ana/governed-tool-gate';

const WRITES = Object.entries(COMMAND_AUTHORIZATION)
  .filter(([, a]) => a.effect === 'write')
  .map(([name]) => name);

describe('the propose-only partition', () => {
  it('is every state-changing command (no write runs from model output unaided)', () => {
    const unaided = WRITES.filter((c) => !isProposeOnlyCommand(c));
    expect(unaided, 'writes a model response still runs by itself').toEqual([]);
    expect(WRITES.length).toBeGreaterThan(40);
  });

  it('holds only writes', () => {
    const reads = [...PROPOSE_ONLY_COMMANDS].filter((c) => COMMAND_AUTHORIZATION[c]?.effect !== 'write');
    expect(reads).toEqual([]);
  });
});

describe('the three tiers', () => {
  it('an ordinary write is the confirm tier', () => {
    expect(governedTierOf('create_task')).toBe('confirm');
    expect(governedTierOf('update_artifact')).toBe('confirm');
  });

  it('the Part 11 sets keep their tiers', () => {
    for (const c of PART11_GOVERNED_COMMANDS) {
      expect(governedTierOf(c), c).toBe(PART11_ESIGN_COMMANDS.has(c) ? 'esignature' : 'reason');
    }
    expect(governedTierOf('erase_personal_data')).toBe('esignature');
  });

  it('every write has a tier and a confirm-tier command is in neither Part 11 set', () => {
    for (const c of WRITES) {
      const tier = governedTierOf(c);
      expect(['confirm', 'reason', 'esignature']).toContain(tier);
      if (tier === 'confirm') expect(PART11_GOVERNED_COMMANDS.has(c), c).toBe(false);
    }
  });
});

describe('the approve class keeps a reason', () => {
  it('section and post-market approvals are the reason tier, not a click', () => {
    // Manager-tier writes whose only other gate is params.confirm — a string
    // the model writes. They sit in neither Part 11 set; without this they fell
    // to 'confirm' and ran on one click with no record of why.
    for (const c of ['section.approve', 'post_market.document.approve', 'post_market.document.supersede']) {
      expect(governedTierOf(c), c).toBe('reason');
    }
  });
});

describe('what the agent is told', () => {
  it('a confirm-tier proposal asks for a confirmation, not a reason or a signature', () => {
    const r = buildHumanConfirmationRequiredResult('create_task', { title: 'x' });
    expect(r.error).toBe('HUMAN_CONFIRMATION_REQUIRED');
    expect(r.data.tier).toBe('confirm');
    expect(r.data.reasonRequired).toBe(false);
    expect(r.data.signatureRequired).toBe(false);
    expect(r.data.retry).toEqual({ command: 'create_task', params: { title: 'x' } });
    expect(r.message).not.toMatch(/reason for the change/i);
  });

  it('a reason-tier proposal still asks for the reason, an e-sign one for the signature too', () => {
    const reason = [...PART11_GOVERNED_COMMANDS].find((c) => !PART11_ESIGN_COMMANDS.has(c))!;
    expect(buildHumanConfirmationRequiredResult(reason).data).toMatchObject({ tier: 'reason', reasonRequired: true, signatureRequired: false });
    expect(buildHumanConfirmationRequiredResult('erase_personal_data').data).toMatchObject({ tier: 'esignature', reasonRequired: true, signatureRequired: true });
  });
});

describe('the tool gate', () => {
  const call = (command: string) => ({ name: PLATFORM_COMMAND_TOOL, input: { command, params: { a: 1 } } });

  it('asks for approval on an ordinary write, at the confirm tier', () => {
    const v = classifyToolCall(call('create_artifact'));
    expect(v.kind).toBe('NEEDS_APPROVAL');
    if (v.kind === 'NEEDS_APPROVAL') expect(v.tier).toBe('confirm');
  });

  it('still leaves reads alone', () => {
    expect(classifyToolCall(call('list_projects')).kind).toBe('UNGOVERNED');
  });
});
