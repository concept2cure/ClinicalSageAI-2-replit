/**
 * POST /api/regulatory-graph/programs/:programId/reviewer-simulation takes the
 * program's facts from its records, not from the body.
 *
 * What the route used to do: it refused a body without `intel` (422 "program
 * and intel facts are required") and passed the body's packet, intel and reports
 * to the simulator, which used them as given. A defensePacketId the program has
 * no packet for was stored on the run as the packet that "fed the inputs".
 *
 * Now `program` is the only fact group the body must carry; packet and intel
 * come from the records (reviewer-simulator.service.ts), a body's copies are set
 * aside and the response says so in `inputsSource`, and a defensePacketId with
 * no packet on record is refused 422 by name. Runs the real router and the real
 * simulator over a stubbed database.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({
  packetRows: [] as unknown[],
  inserted: [] as Record<string, unknown>[],
  query: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 3, organizationId: 7 };
    req.dbClient = { query: holder.query };
    next();
  },
}));
vi.mock('../../db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => holder.packetRows }) }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        holder.inserted.push(v);
        return { returning: async () => [{ id: 'sim-run-route-1' }] };
      },
    }),
  },
  pool: {},
}));
vi.mock('../../services/authoring/authoring-program-access', async original => ({
  ...(await original<typeof import('../../services/authoring/authoring-program-access')>()), authorizeAuthoringProgram: vi.fn(async () => undefined),
}));
vi.mock('../../services/c2c/program-access', () => ({ programInOrganization: async () => true }));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async () => ({ persisted: true, chained: true }),
}));

import router from '../regulatory-graph';

const PROGRAM = '00000000-0000-0000-0000-0000000000c3';
const PACKET = '00000000-0000-0000-0000-0000000000d4';
const program = { programType: '510K', productType: 'device', deviceClass: 'II', primaryAgency: 'FDA' };

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/regulatory-graph', router);
  return a;
}
const post = (body: unknown) =>
  request(app()).post(`/api/regulatory-graph/programs/${PROGRAM}/reviewer-simulation`).send(body as object);

beforeEach(() => {
  holder.packetRows = [];
  holder.inserted = [];
  holder.query.mockReset().mockImplementation(async () => ({ rows: holder.packetRows }));
});

describe('reviewer-simulation route: facts from the records', () => {
  it('runs on the program facts alone, and says the packet and claim-health checks did not run', async () => {
    const res = await post({ program, dryRun: true });
    expect(res.status, 'a body without caller-asserted intel was refused').toBe(200);
    expect(res.body.inputsSource).toMatchObject({ packet: 'not_available', claimHealth: 'not_available', setAside: [] });
    const triggers = res.body.questions.map((q: { trigger: string }) => q.trigger);
    expect(triggers).toEqual(expect.arrayContaining(['packet_facts_not_available', 'claim_health_not_assessed']));
  });

  it("sets aside a body's packet and intel, and prints none of their figures", async () => {
    const res = await post({
      program,
      packet: { defenseReadinessScore: 40, topRisks: ['IU_MISMATCH'], riskCodesUsed: [], predicateKNumber: 'K1' },
      intel: { contradictionCount: 0, orphanClaimCount: 0, unsupportedClaimCount: 9, defensibilityScore: null, missingSections: [] },
      dryRun: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.inputsSource.setAside).toEqual(['packet', 'intel']);
    const text = res.body.questions.map((q: { question: string }) => q.question).join('\n');
    expect(text).not.toContain('40/100');
    expect(text).not.toMatch(/^9 claims/m);
  });

  it('refuses 422, by name, a defensePacketId the program has no packet for', async () => {
    const res = await post({ program, defensePacketId: PACKET });
    expect(res.status, 'a packet that is not on record was accepted, or failed as a server error').toBe(422);
    expect(res.body.code).toBe('DEFENSE_PACKET_NOT_FOUND');
    expect(holder.inserted).toEqual([]);
  });
});
