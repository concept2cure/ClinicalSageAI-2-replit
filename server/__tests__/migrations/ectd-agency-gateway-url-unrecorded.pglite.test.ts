/**
 * The eCTD agency configurations name no gateway endpoint nobody verified.
 *
 * db/migrations/082_ectd_submission_agent.sql (deploy set) seeded four agency
 * rows with gateway URLs ('https://esg.fda.gov/as2',
 * 'https://esubmission.ema.europa.eu/gateway', 'https://gateway.pmda.go.jp/ectd',
 * 'https://cesg.hc-sc.gc.ca/gateway') that cite no source; nothing transmits
 * to them (server/services/ectd-submission-agent.ts has no gateway client), and
 * the rows are read only as the agency FK of ectd_submissions. The seed now
 * records no URL, and because it is ON CONFLICT DO NOTHING the file also
 * withdraws the URLs it wrote on earlier deploys, and nothing else. Run here,
 * against PGlite.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(path.join(process.cwd(), 'db/migrations/082_ectd_submission_agent.sql'), 'utf8');

const urls = async (pg: PGlite) =>
  (await pg.query<{ agency_code: string; gateway_url: string | null }>(
    `SELECT agency_code, gateway_url FROM ectd_agency_configs ORDER BY agency_code`)).rows;

describe('082_ectd_submission_agent.sql, applied on every deploy', () => {
  it('seeds the four agencies with no gateway URL', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(SQL);
      await pg.exec(SQL);
      expect(await urls(pg)).toEqual([
        { agency_code: 'EMA', gateway_url: null },
        { agency_code: 'FDA', gateway_url: null },
        { agency_code: 'HC', gateway_url: null },
        { agency_code: 'PMDA', gateway_url: null },
      ]);
    } finally {
      await pg.close();
    }
  }, 120_000);

  it('withdraws the URLs an earlier deploy seeded, and keeps one someone recorded', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(SQL);
      // What the seed wrote before 2026-10-15, then a URL someone recorded for HC.
      await pg.exec(`
        UPDATE ectd_agency_configs c SET gateway_url = s.url
          FROM (VALUES ('FDA', 'https://esg.fda.gov/as2'), ('EMA', 'https://esubmission.ema.europa.eu/gateway'),
                       ('PMDA', 'https://gateway.pmda.go.jp/ectd'), ('HC', 'https://cesg.hc-sc.gc.ca/gateway')) AS s(code, url)
         WHERE c.agency_code = s.code;
        UPDATE ectd_agency_configs SET gateway_url = 'https://verified.example/cesg' WHERE agency_code = 'HC';
      `);
      await pg.exec(SQL);
      await pg.exec(SQL);
      expect(await urls(pg)).toEqual([
        { agency_code: 'EMA', gateway_url: null },
        { agency_code: 'FDA', gateway_url: null },
        { agency_code: 'HC', gateway_url: 'https://verified.example/cesg' },
        { agency_code: 'PMDA', gateway_url: null },
      ]);
    } finally {
      await pg.close();
    }
  }, 120_000);
});
