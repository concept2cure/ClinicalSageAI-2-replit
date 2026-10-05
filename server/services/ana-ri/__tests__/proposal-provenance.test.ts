/**
 * An artifact AnA drafted records the model that wrote it, and only a model
 * qualified for regulatory drafting may write one (D5, MC-RL-4; 2026-10-05;
 * evidence docs/evidence/D5/2026-10-05-proposal-provenance/).
 *
 * A chat turn's ana-action block became a create_artifact proposal with the
 * model's text as content. The person's yes posted it to
 * POST /api/ana-ri/governed-action with no run id, so the route read command
 * and params from the body and stamped servingModel null, and no
 * approved-models check ran anywhere on that path
 * (isServedModelApprovedForHighRisk had one caller, the tool executor).
 *
 * Two levels: the executor's proposal gate and seal, and the route over HTTP
 * with the executor and audit writer stubbed so the context it builds is seen.
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const S = vi.hoisted(() => ({ executed: [] as Array<{ ctx: any; params: any }> }));

vi.mock('../command-rbac', async importOriginal => ({
  ...(await importOriginal<typeof import('../command-rbac')>()),
  authorizeCommand: async () => ({ ok: true }),
}));

import { executeCommands } from '../command-executor';
import { openProposalSeal, PROPOSAL_SEAL_KEY } from '../proposal-seal';

const APPROVED = { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req-approved' };
const UNAPPROVED = { provider: 'anthropic', model: 'claude-haiku-4-5', requestId: 'req-unapproved' };
const ARTIFACT = { title: 'Clinical overview', type: 'document', content: 'Drafted by AnA: the benefit-risk is favourable.' };
const ctxFor = (servingModel: unknown) => ({ userId: 3, organizationId: 7, part11Enforce: false, servingModel }) as any;

describe('a create_artifact proposal: the approved-models check and the seal', () => {
  it('a model not approved for regulatory drafting cannot propose a governed artifact', async () => {
    const [r] = await executeCommands([{ command: 'create_artifact', params: ARTIFACT } as any], ctxFor(UNAPPROVED));
    expect(r).toMatchObject({ success: false, error: 'MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE' });
    expect((r as any).data?.retry).toBeUndefined();
  });

  it("an approved model's proposal carries a seal that names it and its gateway request", async () => {
    const [r] = await executeCommands([{ command: 'create_artifact', params: ARTIFACT } as any], ctxFor(APPROVED));
    const retry = (r as any).data.retry;
    expect(retry.command).toBe('create_artifact');
    expect(typeof retry.params[PROPOSAL_SEAL_KEY]).toBe('string');
    const opened = openProposalSeal('create_artifact', retry.params, { organizationId: 7, userId: 3 });
    expect(opened.proposer).toEqual(APPROVED);
    expect(opened.params).toEqual(ARTIFACT);
  });

  it('the seal restores nothing for changed content, another person, or another command', async () => {
    const [r] = await executeCommands([{ command: 'create_artifact', params: ARTIFACT } as any], ctxFor(APPROVED));
    const sealed = (r as any).data.retry.params;
    const edited = { ...sealed, content: 'Something else entirely.' };
    expect(openProposalSeal('create_artifact', edited, { organizationId: 7, userId: 3 }).proposer).toBeNull();
    expect(openProposalSeal('create_artifact', sealed, { organizationId: 7, userId: 4 }).proposer).toBeNull();
    expect(openProposalSeal('create_artifact', sealed, { organizationId: 8, userId: 3 }).proposer).toBeNull();
    expect(openProposalSeal('create_task', sealed, { organizationId: 7, userId: 3 }).proposer).toBeNull();
  });

  it("a person's own command (no serving model) is proposed as before, unsealed", async () => {
    const [r] = await executeCommands([{ command: 'create_artifact', params: ARTIFACT } as any], ctxFor(null));
    expect((r as any).data.retry.params).toEqual(ARTIFACT);
  });
});

describe('POST /api/ana-ri/governed-action: the confirmed artifact records its proposer', () => {
  async function appWithStubs() {
    vi.resetModules();
    S.executed = [];
    vi.doMock('../../../services/ana-ri/command-executor.js', async importOriginal => ({
      ...(await importOriginal<typeof import('../command-executor')>()),
      executeCommands: async (commands: any[], ctx: any) => {
        S.executed.push({ ctx, params: commands[0].params });
        return [{ success: true, action: commands[0].command, message: 'ok' }];
      },
    }));
    vi.doMock('../../../services/auditService.js', () => ({
      default: { logAction: async () => ({ persisted: true, chained: true, tamperProof: true }) },
    }));
    vi.doMock('../../../routes/ana-ri/governed-execution-audit.js', async importOriginal => ({
      ...(await importOriginal<any>()),
      recordGovernedExecution: async () => ({ persisted: true, chained: true }),
    }));
    const { mountUtilityRoutes } = await import('../../../routes/ana-ri/utility');
    const router = express.Router();
    mountUtilityRoutes(router);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).tenantId = 7;
      (req as any).userId = 3;
      next();
    });
    app.use('/api/ana-ri', router);
    return app;
  }

  it('a sealed proposal, confirmed unchanged: the command runs with the proposing model, the seal removed', async () => {
    const [proposal] = await executeCommands([{ command: 'create_artifact', params: ARTIFACT } as any], ctxFor(APPROVED));
    const app = await appWithStubs();
    const res = await request(app)
      .post('/api/ana-ri/governed-action')
      .send({ command: 'create_artifact', params: (proposal as any).data.retry.params, confirm: true });
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
    expect(S.executed).toHaveLength(1);
    expect(S.executed[0].ctx.servingModel).toEqual(APPROVED);
    expect(S.executed[0].params).toEqual(ARTIFACT);
  });

  it('a seal minted for an unapproved model is refused at the write, not run', async () => {
    const { sealProposalParams } = await import('../proposal-seal');
    const sealed = sealProposalParams('create_artifact', ARTIFACT, ctxFor(UNAPPROVED));
    const app = await appWithStubs();
    const res = await request(app).post('/api/ana-ri/governed-action').send({ command: 'create_artifact', params: sealed, confirm: true });
    expect(res.status).toBe(403);
    expect(res.body.error?.code ?? res.body.code).toBe('MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE');
    expect(S.executed).toHaveLength(0);
  });
});
