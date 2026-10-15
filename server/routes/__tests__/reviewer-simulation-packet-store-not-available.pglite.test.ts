/**
 * Naming a defense packet on a database with no packet store is refused by
 * name (422), not a 500.
 *
 * What the code used to do: the simulator read the named packet through the
 * Drizzle model `defense_packets` (public, with organization_id). No migration
 * creates that table — the only one, 20260211_phase6_6d_defense_packets.sql,
 * creates predicate.defense_packets without organization_id (see
 * scripts/ci/orm-table-reachability-baseline.json) — and nothing writes
 * packets. So on a deployed database every run naming a defensePacketId failed
 * with `relation "defense_packets" does not exist` and the route answered 500.
 *
 * Real DDL on PGlite: the migration file as deployed. The router, the simulator
 * and the Drizzle model are real; program ownership and the audit write are stubbed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ pg: null as unknown as import('@electric-sql/pglite').PGlite, db: null as unknown }));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 3, organizationId: 7 };
    next();
  },
}));
vi.mock('../../db', () => ({
  get db() {
    return holder.db;
  },
  pool: {},
}));
vi.mock('../../services/c2c/program-access', () => ({ programInOrganization: async () => true }));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async () => ({ persisted: true, chained: true }),
}));

import router from '../regulatory-graph';
import {
  runReviewerSimulation,
  ReviewerSimulationInputError,
} from '../../services/intelligence-engine/reviewer-simulator.service';

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

beforeAll(async () => {
  holder.pg = new PGlite();
  holder.db = drizzle(holder.pg);
  await holder.pg.exec('CREATE SCHEMA IF NOT EXISTS predicate;');
  const repo = join(__dirname, '../../..');
  await holder.pg.exec(readFileSync(join(repo, 'db/migrations/20260211_phase6_6d_defense_packets.sql'), 'utf8'));
}, 60_000);
afterAll(async () => {
  await holder.pg?.close();
});

describe('reviewer simulation: no packet store on the database', () => {
  it('refuses a named defensePacketId 422, saying no packet store exists', async () => {
    const res = await post({ program, defensePacketId: PACKET, dryRun: true });
    expect(res.status, 'a named packet on a database with no packet store failed as a server error').toBe(422);
    expect(res.body.code).toBe('DEFENSE_PACKET_STORE_NOT_AVAILABLE');
    expect(res.body.error).toMatch(/no defense packet store/i);
    expect(res.body.error).not.toMatch(/relation|select/i);
  });

  it('the simulator refuses it as an input error, not a failed query', async () => {
    const attempt = runReviewerSimulation({ organizationId: 7, programId: PROGRAM, program, defensePacketId: PACKET, dryRun: true });
    await expect(attempt).rejects.toBeInstanceOf(ReviewerSimulationInputError);
    await expect(attempt).rejects.toMatchObject({ code: 'DEFENSE_PACKET_STORE_NOT_AVAILABLE' });
  });

  it('control: a run that names no packet proceeds and says the packet checks did not run', async () => {
    const res = await post({ program, dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.inputsSource.packet).toBe('not_available');
  });
});
