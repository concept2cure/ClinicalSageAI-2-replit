/**
 * POST /api/ana-ri/governed-action — the confirm tier end to end, and the
 * decline (P0-12).
 *
 * The confirm tier (94036a27) runs an ordinary write on a person's explicit
 * yes — `confirm: true`, no reason, no re-authentication — still stamping
 * humanConfirmed in one place and refusing to run anything whose audit row did
 * not persist. This file pins that from the route, as the client now calls it.
 *
 * And a person can say no. Cancelling a live prompt used to dismiss the dialog
 * and tell the server nothing, so AnA sat holding the turn until the ten-minute
 * ceiling. A decline is now recorded against the waiting run, and nothing runs.
 */
import express from 'express';
import request from 'supertest';
import { Router } from 'express';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const ORG = 1;
const USER = 42;

const executed: Array<{ commands: unknown[]; ctx: Record<string, unknown> }> = [];
const audits: Array<{ action: string; details: Record<string, unknown> }> = [];
const decisions: Array<{ runId: string; orgId: number; decided: string; error?: string }> = [];
let pending: unknown = null;
let auditPersists = true;
/** Whether the post-execution row lands; the sign-off row follows auditPersists. */
let executedRowPersists = true;
/** How the mocked command comes back: ran, refused by its own gate, or threw. */
let commandOutcome: 'ok' | 'refused' | 'throw' = 'ok';
/** What each release handed the waiting run. */
const released: Array<{ result?: unknown; error?: string }> = [];
const reverify = vi.fn(async () => ({ ok: true, secondFactorVerified: false }));

vi.mock('../../../db/requestDb', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestPgClient: vi.fn(() => ({ query: vi.fn() })),
}));
vi.mock('../../../services/ana/run-control.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readPendingApproval: vi.fn(async () => pending),
  recordApprovalDecision: vi.fn(
    async (_c: unknown, runId: string, orgId: number, d: { decided: string; error?: string; result?: unknown }) => {
      decisions.push({ runId, orgId, decided: d.decided, ...(d.error ? { error: d.error } : {}) });
      released.push({ result: d.result, error: d.error });
      return true;
    },
  ),
}));
vi.mock('../../../services/part11/reverify-signer.js', () => ({ reverifySigner: reverify }));
vi.mock('../../../services/auditService.js', () => ({
  default: {
    logAction: vi.fn(async (entry: { action: string; details: Record<string, unknown> }) => {
      audits.push({ action: entry.action, details: entry.details });
      const lands = auditPersists && (entry.action !== 'ana.governed_action.executed' || executedRowPersists);
      return lands ? { persisted: true, chained: true } : { persisted: false, chained: false, error: 'store down' };
    }),
  },
}));
vi.mock('../../../services/ana-ri/command-executor.js', () => ({
  executeCommands: vi.fn(async (commands: unknown[], ctx: Record<string, unknown>) => {
    executed.push({ commands, ctx });
    if (commandOutcome === 'throw') throw new Error('the command store refused the write');
    if (commandOutcome === 'refused') return [{ success: false, message: 'Refused: the project is locked.' }];
    return [{ success: true, message: 'Task created.' }];
  }),
}));

const toolCalls: Array<{ name: string; input: Record<string, unknown>; ctx: Record<string, unknown> }> = [];
vi.mock('../../../services/ana/AnaToolExecutor.js', () => ({
  getToolHandler: vi.fn((name: string) => async (input: Record<string, unknown>, ctx: Record<string, unknown>) => {
    toolCalls.push({ name, input, ctx });
    return JSON.stringify({ success: true, seeded: 42 });
  }),
}));

let app: express.Express;

beforeAll(async () => {
  const { mountUtilityRoutes } = await import('../utility');
  const router = Router();
  mountUtilityRoutes(router);
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenantId = ORG;
    (req as any).userId = USER;
    next();
  });
  app.use('/api/ana-ri', router);
});

beforeEach(() => {
  executed.length = 0;
  audits.length = 0;
  decisions.length = 0;
  pending = null;
  auditPersists = true;
  executedRowPersists = true;
  commandOutcome = 'ok';
  released.length = 0;
  reverify.mockClear();
  toolCalls.length = 0;
});

const post = (body: Record<string, unknown>) => request(app).post('/api/ana-ri/governed-action').send(body);

describe('the confirm tier runs on a yes', () => {
  it('an ordinary write runs with no reason and no password, confirmed by a person', async () => {
    const res = await post({ command: 'create_task', params: { title: 'Chase the CoA' }, confirm: true });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(reverify).not.toHaveBeenCalled();
    expect(executed).toHaveLength(1);
    expect(executed[0].ctx.humanConfirmed).toBe(true);
    expect(audits.map(a => a.action)).toEqual(['ana.governed_action.confirm', 'ana.governed_action.executed']);
  });

  it('does not run without an explicit yes', async () => {
    const res = await post({ command: 'create_task', params: { title: 'Chase the CoA' } });
    expect(res.status).toBe(400);
    expect(executed).toHaveLength(0);
  });

  it('does not run when the confirmation could not be recorded', async () => {
    auditPersists = false;
    const res = await post({ command: 'create_task', params: { title: 'Chase the CoA' }, confirm: true });
    expect(res.status).toBe(500);
    expect(executed).toHaveLength(0);
  });

  it('the Part 11 tiers still demand what they demanded', async () => {
    const res = await post({ command: 'k510_workflow.transmit', params: {} });
    expect(res.status).toBe(400);
    expect(res.body.code ?? res.body.error?.code ?? JSON.stringify(res.body)).toMatch(/REASON_REQUIRED/);
    expect(executed).toHaveLength(0);
  });

  it('a read is still not something this route runs', async () => {
    const res = await post({ command: 'list_projects', params: {} });
    expect(res.status).toBe(400);
    expect(executed).toHaveLength(0);
  });
});

describe('a live prompt', () => {
  it('a yes on a held run runs the command from the ROW and releases the run', async () => {
    pending = { toolUseId: 'tu-1', command: 'update_artifact', params: { artifactId: 7, title: 'SAP v2' } };
    const res = await post({
      runId: 'run-1',
      toolUseId: 'tu-1',
      confirm: true,
      // A tampered body: the row wins.
      command: 'delete_everything',
      params: { artifactId: 999 },
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(executed[0].commands).toEqual([{ command: 'update_artifact', params: { artifactId: 7, title: 'SAP v2' } }]);
    expect(decisions).toEqual([{ runId: 'run-1', orgId: ORG, decided: 'approved' }]);
  });

  it('a yes on a held command runs it with the model call that proposed it, from the ROW (D6)', async () => {
    // Every agent write command is propose-only and runs only here, so this is
    // where its Part 11 row gets the gateway request id (agentAuditDetails).
    // Until 2026-09-26 the context carried no serving model, and the row named
    // no model call.
    const proposedBy = { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req-held-1' };
    pending = { toolUseId: 'tu-1', command: 'update_artifact', params: { artifactId: 7, title: 'SAP v2' }, proposedBy };
    const res = await post({
      runId: 'run-1',
      toolUseId: 'tu-1',
      confirm: true,
      servingModel: { provider: 'openai', model: 'forged', requestId: 'req-forged' },
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(executed[0].ctx.servingModel).toEqual(proposedBy);
  });

  it('a command posted without its run names no model call: null, never the body\'s claim (D6)', async () => {
    const res = await post({
      command: 'create_task',
      params: { title: 'Chase the CoA' },
      confirm: true,
      servingModel: { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req-forged' },
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(executed[0].ctx.servingModel).toBeNull();
  });

  it('a decline records the decision, runs nothing, and releases the run at once', async () => {
    pending = { toolUseId: 'tu-1', command: 'update_artifact', params: { artifactId: 7 } };
    const res = await post({ runId: 'run-1', toolUseId: 'tu-1', decision: 'decline' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(executed).toHaveLength(0);
    expect(decisions).toEqual([{ runId: 'run-1', orgId: ORG, decided: 'denied' }]);
    expect(audits.map(a => a.action)).toEqual(['ana.governed_action.declined']);
  });

  it('a decline whose audit row was lost still releases the run, and says so', async () => {
    pending = { toolUseId: 'tu-1', command: 'update_artifact', params: { artifactId: 7 } };
    auditPersists = false;
    const res = await post({ runId: 'run-1', toolUseId: 'tu-1', decision: 'decline' });

    expect(res.status).toBe(200);
    expect(executed).toHaveLength(0);
    expect(decisions).toEqual([{ runId: 'run-1', orgId: ORG, decided: 'denied' }]);
    expect(JSON.stringify(res.body)).toMatch(/could not be written to the audit trail/);
  });

  it('a decline needs a run to apply to', async () => {
    const res = await post({ command: 'create_task', decision: 'decline' });
    expect(res.status).toBe(400);
    expect(decisions).toHaveLength(0);
  });

  it('an approval proposed by AnA asks for a reason, not a click', async () => {
    // section.approve is the approve class: manager-tier, confirmed through
    // params.confirm — a string the model writes. It sits in neither Part 11
    // set, so without a tier of its own it fell to 'confirm' and ran on one
    // click with nothing recorded about why.
    pending = { toolUseId: 'tu-1', command: 'section.approve', params: { sectionId: 'S1' } };
    const clicked = await post({ runId: 'run-1', toolUseId: 'tu-1', confirm: true });
    expect(clicked.status).toBe(400);
    expect(executed).toHaveLength(0);

    const reasoned = await post({ runId: 'run-1', toolUseId: 'tu-1', reasonForChange: 'Section reviewed against M4Q' });
    expect(reasoned.status, JSON.stringify(reasoned.body)).toBe(200);
    expect(executed).toHaveLength(1);
    expect(audits.slice(-2).map(a => a.action)).toEqual(['ana.governed_action.reason', 'ana.governed_action.executed']);
  });
});

/*
 * A tool that writes on its own handler (CONFIRM_TIER_TOOLS) is confirmed the
 * same way — but it can only be run from a held run, because the context the
 * handler needs (the project, and the model that wrote the content, which the
 * approved-model gate checks) is what the waiting turn recorded, not anything
 * the browser could be trusted to supply.
 */
describe('a confirmed tool', () => {
  // A write that records no reason for change: confirmed with a yes. (seed_tmf,
  // which records one, is put at the reason tier — see the describe below.)
  const heldTool = () => ({
    toolUseId: 'tu-9',
    command: 'save_report_definition',
    params: { title: 'Weekly enrolment report' },
    tier: 'confirm',
    toolContext: {
      projectId: 5,
      projectRef: '5',
      servingModel: { provider: 'anthropic', model: 'claude-opus-5-5' },
    },
  });

  it('runs on a yes, with the run\'s own context and the confirmation stamped', async () => {
    pending = heldTool();
    const res = await post({ runId: 'run-1', toolUseId: 'tu-9', confirm: true });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(executed).toHaveLength(0); // not a command
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({
      name: 'save_report_definition',
      input: { title: 'Weekly enrolment report' },
      ctx: {
        humanConfirmed: true,
        organizationId: ORG,
        userId: USER,
        projectId: 5,
        servingModel: { provider: 'anthropic', model: 'claude-opus-5-5' },
      },
    });
    expect(decisions).toEqual([{ runId: 'run-1', orgId: ORG, decided: 'approved' }]);
    expect(audits.map(a => a.action)).toEqual(['ana.governed_action.confirm', 'ana.governed_action.executed']);
  });

  it('is not run without an explicit yes', async () => {
    pending = heldTool();
    const res = await post({ runId: 'run-1', toolUseId: 'tu-9' });
    expect(res.status).toBe(400);
    expect(toolCalls).toHaveLength(0);
  });

  it('is not run from a body alone — there is no held run to take its context from', async () => {
    const res = await post({ command: 'save_report_definition', params: { title: 'x'.repeat(20) }, confirm: true });
    expect(res.status).toBe(400);
    expect(toolCalls).toHaveLength(0);
  });

  it('can be declined like any proposal', async () => {
    pending = heldTool();
    const res = await post({ runId: 'run-1', toolUseId: 'tu-9', decision: 'decline' });
    expect(res.status).toBe(200);
    expect(toolCalls).toHaveLength(0);
    expect(decisions).toEqual([{ runId: 'run-1', orgId: ORG, decided: 'denied' }]);
  });

  // P1-34: which tools this route will run is the tool register's answer, asked
  // again on the params the run recorded — not a list of five kept beside it.
  it('any write the register classes confirm runs on a yes — not only the original five', async () => {
    pending = { ...heldTool(), command: 'raise_monitoring_signal', params: { title: 'Site 12 AE lag' } };
    const res = await post({ runId: 'run-1', toolUseId: 'tu-9', confirm: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(toolCalls[0]).toMatchObject({ name: 'raise_monitoring_signal', ctx: { humanConfirmed: true } });
  });

  it("never runs a person's own act, whatever the held row says and whatever was clicked", async () => {
    pending = { ...heldTool(), command: 'qms_change_transition', params: { change_id: 3, to: 'closed' } };
    const res = await post({ runId: 'run-1', toolUseId: 'tu-9', confirm: true });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/NOT_AN_ANA_ACTION/);
    expect(toolCalls).toHaveLength(0);
  });

  it('a tool the register does not know is still a tool, confirmed like any write (it failed closed)', async () => {
    pending = { ...heldTool(), command: 'a_tool_added_tomorrow', params: { x: 1 } };
    const res = await post({ runId: 'run-1', toolUseId: 'tu-9', confirm: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(toolCalls[0]?.name).toBe('a_tool_added_tomorrow');
  });
});

/*
 * A tool that records the person's reason for change runs with the reason the
 * PERSON confirmed (D5, 2026-09-29). The model writes a reason into the call;
 * the person sees it on the card, types their own or adopts that wording, and
 * what they submit is what the tool records — the sign-off row keeps both.
 */
describe('a tool that records a reason for change', () => {
  const MODEL_REASON = 'Seeding the TMF for the Phase 1 study';
  const heldReasonTool = () => ({
    toolUseId: 'tu-7',
    command: 'seed_tmf',
    params: { study_id: 12, reason: MODEL_REASON },
    tier: 'reason',
    toolContext: { projectId: 5, projectRef: '5', servingModel: { provider: 'anthropic', model: 'claude-opus-5-5' } },
  });

  it('is not run on a bare yes: the person states the reason', async () => {
    pending = heldReasonTool();
    const res = await post({ runId: 'run-1', toolUseId: 'tu-7', confirm: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect(toolCalls).toHaveLength(0);
  });

  it('runs with the person\'s reason in place of the model\'s, and records both', async () => {
    pending = heldReasonTool();
    const mine = 'Phase 1 TMF set up per the sponsor SOP-114 index.';
    const res = await post({ runId: 'run-1', toolUseId: 'tu-7', reasonForChange: mine });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].input).toEqual({ study_id: 12, reason: mine });
    const signoff = audits.find(a => a.action === 'ana.governed_action.reason')!;
    expect(signoff.details).toMatchObject({ reasonForChange: mine, proposedReason: MODEL_REASON, reasonAsProposed: false });
  });

  it('a person who adopts AnA\'s wording is recorded as having done so', async () => {
    pending = heldReasonTool();
    const res = await post({ runId: 'run-1', toolUseId: 'tu-7', reasonForChange: MODEL_REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(toolCalls[0].input).toMatchObject({ reason: MODEL_REASON });
    const signoff = audits.find(a => a.action === 'ana.governed_action.reason')!;
    expect(signoff.details).toMatchObject({ proposedReason: MODEL_REASON, reasonAsProposed: true });
  });

  it('a tool whose reason input is reason_for_change gets the person\'s reason there', async () => {
    pending = { ...heldReasonTool(), command: 'commit_document_revision', params: { title: 'CSR 2.7.3', content: 'x', reason_for_change: 'model text here' } };
    const mine = 'Corrected the efficacy table per the SAP amendment.';
    const res = await post({ runId: 'run-1', toolUseId: 'tu-7', reasonForChange: mine });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(toolCalls[0].input).toMatchObject({ reason_for_change: mine });
    expect(toolCalls[0].input).not.toHaveProperty('reason');
  });
});

/*
 * The e-signature tier carries the meaning the signer declared (§11.50(a)(3);
 * coverage-gap sweep 2026-09-28, GP-P-2).
 *
 * GovernedActionSignoff makes the signer choose Authorship, Review or Approval
 * and posts it as params.signatureMeaning. The route re-verified the signer and
 * then stamped `signaturePurpose: 'approval'` whatever was chosen, and left the
 * meaning off the pre-execution audit row — so a person who signed as author
 * was recorded, on the one handler that persists a meaning (the FDA ESG
 * transmit), as having approved.
 */
describe('the e-signature tier records the declared §11.50 meaning', () => {
  const esign = (params: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    post({
      command: 'place_in_dossier',
      params,
      reasonForChange: 'Placing the reviewed CSR into Module 5.3.5.1',
      password: 'correct horse battery staple',
      ...extra,
    });

  it('a signer who declares Authorship is recorded as Authorship, not Approval — on the sign-off and the audit row', async () => {
    const res = await esign({ projectId: 3, artifactId: 9, ctdSection: '5.3.5.1', signatureMeaning: 'AUTHOR' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(reverify).toHaveBeenCalledTimes(1);
    expect(executed).toHaveLength(1);
    const signoff = executed[0].ctx.signoff as Record<string, unknown>;
    expect(signoff.signatureVerified).toBe(true);
    expect(signoff.signaturePurpose).toBe('authorship');
    expect(signoff.signaturePurpose).not.toBe('approval');

    expect(audits.map(a => a.action)).toEqual(['ana.governed_action.esign', 'ana.governed_action.executed']);
    expect(audits[0].details.signatureMeaning).toBe('authorship');
  });

  it.each([
    ['REVIEWER', 'review'],
    ['APPROVER', 'approval'],
  ])('%s is recorded as %s', async (declared, canonical) => {
    const res = await esign({ projectId: 3, artifactId: 9, ctdSection: '5.3.5.1', signatureMeaning: declared });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((executed[0].ctx.signoff as Record<string, unknown>).signaturePurpose).toBe(canonical);
    expect(audits[0].details.signatureMeaning).toBe(canonical);
  });

  it('refuses an e-signature with no declared meaning, and runs and records nothing', async () => {
    const res = await esign({ projectId: 3, artifactId: 9, ctdSection: '5.3.5.1' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/SIGNATURE_MEANING_REQUIRED/);
    expect(executed).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(reverify).not.toHaveBeenCalled();
  });

  it.each([['approval'], ['OWNER'], ['author'], [''], [7]])(
    'refuses an unknown meaning (%j), and runs and records nothing',
    async meaning => {
      const res = await esign({ projectId: 3, artifactId: 9, ctdSection: '5.3.5.1', signatureMeaning: meaning });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/SIGNATURE_MEANING_(UNKNOWN|REQUIRED)/);
      expect(executed).toHaveLength(0);
      expect(audits).toHaveLength(0);
    },
  );

  it('the FDA ESG transmit is handed the declared meaning — the value its signature row records', async () => {
    const res = await post({
      command: 'k510_workflow.transmit',
      params: { packageId: 42, environment: 'staging', signatureMeaning: 'AUTHOR' },
      reasonForChange: 'RA + QA sign-off complete; transmitting the cleared package',
      password: 'correct horse battery staple',
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const signoff = executed[0].ctx.signoff as Record<string, unknown>;
    expect(signoff.signaturePurpose).toBe('authorship');
    expect(signoff.verifiedAt).toBeInstanceOf(Date);
    expect(audits[0].details.signatureMeaning).toBe('authorship');
  });

  it('on a held run the meaning is the signer\'s, from the posted body — never one the model wrote into the row', async () => {
    pending = {
      toolUseId: 'tu-1',
      command: 'place_in_dossier',
      // The model cannot pre-declare what a person's signature means.
      params: { projectId: 3, artifactId: 9, ctdSection: '5.3.5.1', signatureMeaning: 'APPROVER' },
    };
    const declared = await post({
      runId: 'run-1',
      toolUseId: 'tu-1',
      params: { projectId: 3, artifactId: 9, ctdSection: '5.3.5.1', signatureMeaning: 'REVIEWER' },
      reasonForChange: 'Placing the reviewed CSR into Module 5.3.5.1',
      password: 'correct horse battery staple',
    });
    expect(declared.status, JSON.stringify(declared.body)).toBe(200);
    expect((executed[0].ctx.signoff as Record<string, unknown>).signaturePurpose).toBe('review');

    executed.length = 0;
    audits.length = 0;
    const undeclared = await post({
      runId: 'run-1',
      toolUseId: 'tu-1',
      reasonForChange: 'Placing the reviewed CSR into Module 5.3.5.1',
      password: 'correct horse battery staple',
    });
    expect(undeclared.status).toBe(400);
    expect(JSON.stringify(undeclared.body)).toMatch(/SIGNATURE_MEANING_REQUIRED/);
    expect(executed).toHaveLength(0);
  });

  it('the reason-only tier is unchanged: no meaning is asked for', async () => {
    const res = await post({
      command: 'section.approve',
      params: { sectionId: 'S1' },
      reasonForChange: 'Section reviewed against M4Q',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(reverify).not.toHaveBeenCalled();
    expect(audits[0].details).not.toHaveProperty('signatureMeaning');
  });
});

/* 2026-09-28: the FDA ESG transmit handler recorded secondFactorVerified:false
   for every signer; the route now hands it what reverifySigner verified. */
describe('the e-signature sign-off carries the verified factors', () => {
  it('the sign-off carries the factors re-verification actually checked (MFA as MFA)', async () => {
    reverify.mockResolvedValueOnce({ ok: true, authenticationMethod: 'password+mfa', secondFactorVerified: true } as any);
    const res = await post({
      command: 'k510_workflow.transmit',
      params: { packageId: 42, environment: 'staging', signatureMeaning: 'APPROVER' },
      reasonForChange: 'RA + QA sign-off complete; transmitting the cleared package',
      password: 'correct horse battery staple',
      mfaToken: '123456',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const signoff = executed[0].ctx.signoff as Record<string, unknown>;
    expect(signoff.secondFactorVerified).toBe(true);
    expect(signoff.authenticationMethod).toBe('password+mfa');
  });
});

/*
 * A governed action's audit rows name what a person authorised and what came of
 * it (D5/D6, 2026-09-29). Until then the sign-off row carried the command, the
 * tier and the reason only: not the run or the tool call it answered, not the
 * model call that proposed it, not the params it authorised; and nothing was
 * written after the action ran, so a Part 11 reader could not tell an action
 * that ran from one that failed. MCP, by contrast, records each call's outcome
 * (server/mcp/tools/runtime.ts).
 */
describe("a governed action's audit rows", () => {
  const proposedBy = { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req-held-7' };
  const held = () => ({
    toolUseId: 'tu-7',
    command: 'update_artifact',
    params: { title: 'SAP v2', artifactId: 7 },
    proposedBy,
  });
  const run = () => post({ runId: 'run-7', toolUseId: 'tu-7', confirm: true });
  const executedRow = () => audits.find(a => a.action === 'ana.governed_action.executed');

  it('the sign-off names the run, the tool call, the model call and a hash of the params authorised', async () => {
    const { canonicalJson, sha256Hex } = await import('../../../services/ana/turn-record.js');
    pending = held();
    const res = await run();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(audits[0]).toMatchObject({
      action: 'ana.governed_action.confirm',
      details: {
        runId: 'run-7',
        toolUseId: 'tu-7',
        gatewayRequestId: 'req-held-7',
        servingModel: { provider: 'anthropic', model: 'claude-opus-5-5' },
        // The turn record's canonical hash, so the row joins the turn's step.
        paramsSha256: sha256Hex(canonicalJson({ artifactId: 7, title: 'SAP v2' })),
      },
    });
  });

  it('an executed row follows, with the outcome, the duration and the same trace', async () => {
    pending = held();
    await run();

    expect(audits.map(a => a.action)).toEqual(['ana.governed_action.confirm', 'ana.governed_action.executed']);
    expect(executedRow()?.details).toMatchObject({
      outcome: 'ok',
      durationMs: expect.any(Number),
      resultSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      runId: 'run-7',
      toolUseId: 'tu-7',
      gatewayRequestId: 'req-held-7',
    });
  });

  it('a command its own gate refused is recorded refused, not ok', async () => {
    pending = held();
    commandOutcome = 'refused';
    await run();

    expect(executedRow()?.details.outcome).toBe('refused');
  });

  it('a failed execution is recorded failed, with what failed', async () => {
    pending = held();
    commandOutcome = 'throw';
    const res = await run();

    expect(res.status).toBe(500);
    expect(executedRow()?.details).toMatchObject({ outcome: 'failed', error: 'the command store refused the write' });
  });

  it('a failed execution whose row did not persist says that too', async () => {
    pending = held();
    commandOutcome = 'throw';
    executedRowPersists = false;
    const res = await run();

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).toMatch(/AUDIT_ROW_NOT_PERSISTED/);
  });

  it('an executed row that did not persist is said, to the person and to the waiting run', async () => {
    pending = held();
    executedRowPersists = false;
    const res = await run();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/AUDIT_ROW_NOT_PERSISTED/);
    expect(JSON.stringify(released[0]?.result)).toMatch(/AUDIT_ROW_NOT_PERSISTED/);
  });

  it('a command posted without its run still gets both rows, with no run and no model call', async () => {
    await post({ command: 'create_task', params: { title: 'Chase the CoA' }, confirm: true });

    expect(audits.map(a => a.action)).toEqual(['ana.governed_action.confirm', 'ana.governed_action.executed']);
    expect(audits[0].details).toMatchObject({ runId: null, toolUseId: null, gatewayRequestId: null, servingModel: null });
  });
});
