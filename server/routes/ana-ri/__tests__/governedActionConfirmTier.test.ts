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
