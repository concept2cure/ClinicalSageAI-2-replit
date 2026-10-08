/**
 * Sentinel's finding-status UPDATE records who closed a finding once, on the
 * transition, and never leaves a closer beside a state they did not set
 * (ledger L195).
 *
 * The old SQL wrote `resolved_by_id = $2` on every 'resolved', so a repeat
 * overwrote the original closer. It kept the old closer through a reopen, an
 * acknowledgement or a dismissal, so the row named Alice as the person who
 * closed a finding Bob dismissed. A dismissal, which also clears a finding,
 * recorded nobody. A mocked pool returns whatever a test hands it, so this runs
 * the service's real statement on PGlite.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { AISentinel } from '../sentinel';

const ORG = 99;
const ALICE = 11;
const BOB = 22;

let pg: PGlite;
let sentinel: AISentinel;

const row = async () =>
  (await pg.query<{ status: string; resolved_by_id: number | null; resolved_at: Date | null }>(
    `SELECT status, resolved_by_id, resolved_at FROM sentinel_findings WHERE finding_id = 'f-1'`,
  )).rows[0];

beforeAll(async () => {
  pg = new PGlite();
  // As drizzle-kit lays it down (migrations/0000_sweet_joseph.sql).
  await pg.exec(`
    CREATE TABLE sentinel_findings (
      id serial PRIMARY KEY,
      finding_id text NOT NULL UNIQUE,
      organization_id integer NOT NULL,
      analyzer_type text NOT NULL,
      title text NOT NULL,
      summary text NOT NULL,
      status text DEFAULT 'open' NOT NULL,
      resolved_at timestamp,
      resolved_by_id integer,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);
  sentinel = new AISentinel(pg as unknown as Pool);
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.exec(`
    DELETE FROM sentinel_findings;
    INSERT INTO sentinel_findings (finding_id, organization_id, analyzer_type, title, summary)
    VALUES ('f-1', ${ORG}, 'deadline_risk', 'Milestone at risk', 'Two tasks overdue');
  `);
});

describe('a Sentinel finding records its closer once (L195)', () => {
  it('resolving records the closer and the time', async () => {
    await sentinel.updateFindingStatus('f-1', ORG, 'resolved', ALICE);
    expect(await row()).toMatchObject({ status: 'resolved', resolved_by_id: ALICE });
    expect((await row()).resolved_at).not.toBeNull();
  });

  it('a repeat resolution keeps the original closer and time', async () => {
    await sentinel.updateFindingStatus('f-1', ORG, 'resolved', ALICE);
    const first = await row();
    await sentinel.updateFindingStatus('f-1', ORG, 'resolved', BOB);
    expect(await row()).toEqual(first);
  });

  it('dismissing records its closer, and does not keep an earlier resolver', async () => {
    await sentinel.updateFindingStatus('f-1', ORG, 'resolved', ALICE);
    await sentinel.updateFindingStatus('f-1', ORG, 'dismissed', BOB);
    expect(await row()).toMatchObject({ status: 'dismissed', resolved_by_id: BOB });
  });

  it.each(['open', 'acknowledged'])('moving to %s clears the last closer', async (status) => {
    await sentinel.updateFindingStatus('f-1', ORG, 'resolved', ALICE);
    await sentinel.updateFindingStatus('f-1', ORG, status, BOB);
    expect(await row()).toMatchObject({ status, resolved_by_id: null, resolved_at: null });
  });

  it("another organisation's finding is not touched", async () => {
    const updated = await sentinel.updateFindingStatus('f-1', 7, 'resolved', ALICE);
    expect(updated).toBeUndefined();
    expect(await row()).toMatchObject({ status: 'open', resolved_by_id: null });
  });
});
