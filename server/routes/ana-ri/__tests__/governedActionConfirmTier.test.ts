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
const reverify = vi.fn(async () => ({ ok: true, secondFactorVerified: false }));

vi.mock('../../../db/requestDb', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestPgClient: vi.fn(() => ({ query: vi.fn() })),
}));
vi.mock('../../../services/ana/run-control.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readPendingApproval: vi.fn(async () => pending),
  recordApprovalDecision: vi.fn(
    async (_c: unknown, runId: string, orgId: number, d: { decided: string; error?: string }) => {
      decisions.push({ runId, orgId, decided: d.decided, ...(d.error ? { error: d.error } : {}) });
      return true;
    },
  ),
}));
vi.mock('../../../services/part11/reverify-signer.js', () => ({ reverifySigner: reverify }));
vi.mock('../../../services/auditService.js', () => ({
  default: {
    logAction: vi.fn(async (entry: { action: string; details: Record<string, unknown> }) => {
      audits.push({ action: entry.action, details: entry.details });
      return auditPersists ? { persisted: true } : { persisted: false, error: 'store down' };
    }),
  },
}));
vi.mock('../../../services/ana-ri/command-executor.js', () => ({
  executeCommands: vi.fn(async (commands: unknown[], ctx: Record<string, unknown>) => {
    executed.push({ commands, ctx });
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
    expect(audits.map(a => a.action)).toEqual(['ana.governed_action.confirm']);
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
    expect(audits.at(-1)?.action).toBe('ana.governed_action.reason');
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
  const heldTool = () => ({
    toolUseId: 'tu-9',
    command: 'seed_tmf',
    params: { reason: 'Seeding the TMF for the Phase 1 study' },
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
      name: 'seed_tmf',
      input: { reason: 'Seeding the TMF for the Phase 1 study' },
      ctx: {
        humanConfirmed: true,
        organizationId: ORG,
        userId: USER,
        projectId: 5,
        servingModel: { provider: 'anthropic', model: 'claude-opus-5-5' },
      },
    });
    expect(decisions).toEqual([{ runId: 'run-1', orgId: ORG, decided: 'approved' }]);
    expect(audits.map(a => a.action)).toEqual(['ana.governed_action.confirm']);
  });

  it('is not run without an explicit yes', async () => {
    pending = heldTool();
    const res = await post({ runId: 'run-1', toolUseId: 'tu-9' });
    expect(res.status).toBe(400);
    expect(toolCalls).toHaveLength(0);
  });

  it('is not run from a body alone — there is no held run to take its context from', async () => {
    const res = await post({ command: 'seed_tmf', params: { reason: 'x'.repeat(20) }, confirm: true });
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

    expect(audits.map(a => a.action)).toEqual(['ana.governed_action.esign']);
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
