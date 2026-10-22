/**
 * seed-ga-demo records no title or department nobody stated. 2026-10-15.
 *
 * The admin account it creates was stamped title "Chief Science Officer",
 * department "Executive Leadership" — invented, as seed-admin's were until the
 * same day (tests/seed/seed-admin-joins-the-named-organisation-with-no-invented-title.test.ts).
 * The script needs six steps of schema to run, so this reads the admin upsert
 * from its source: the statement that creates the account.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(path.resolve(__dirname, '../../scripts/seed-ga-demo.mjs'), 'utf8');

describe('seed-ga-demo admin account', () => {
  it('writes no title or department and carries no invented one', () => {
    const start = SRC.indexOf('INSERT INTO users');
    expect(start).toBeGreaterThan(-1);
    const upsert = SRC.slice(start, SRC.indexOf('RETURNING', start));
    expect(upsert).not.toMatch(/\btitle\b|\bdepartment\b/);
    expect(SRC).not.toMatch(/Chief Science Officer|Executive Leadership/);
  });
});
