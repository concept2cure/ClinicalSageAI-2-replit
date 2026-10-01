/**
 * The PDF/A rule reads the organisation's own setting from PostgreSQL (D7,
 * decided 2026-10-01; evidence docs/evidence/D7/2026-10-01-pdfa-rule/).
 *
 * `organizations.settings` as stored by the settings PATCH: only the boolean
 * true in `submission.requirePdfA` requires PDF/A; the deployment's
 * ECTD_REQUIRE_PDFA wins without reading it; another organisation's setting
 * never applies.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { resolvePdfARequirement } from '../../server/services/ectd/pdfa-requirement';

let owner: Pool;
let mine: number;
let theirs: number;
const env = {} as NodeJS.ProcessEnv;

async function org(slug: string): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $1) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [slug],
  );
  return Number(rows[0].id);
}
const set = (id: number, settings: unknown) =>
  owner.query('UPDATE organizations SET settings = $2 WHERE id = $1', [id, JSON.stringify(settings)]);

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  mine = await org('dbtest-pdfa-mine');
  theirs = await org('dbtest-pdfa-theirs');
});

afterAll(async () => {
  await owner?.query(`DELETE FROM organizations WHERE slug LIKE 'dbtest-pdfa-%'`).catch(() => undefined);
  await owner?.end();
});

describe('the PDF/A requirement, read from organizations.settings', () => {
  it('no submission section: not required', async () => {
    await set(mine, { translation: {} });
    expect(await resolvePdfARequirement(owner, mine, env)).toEqual({ required: false, source: null });
  });

  it('requirePdfA true: required by the organisation', async () => {
    await set(mine, { submission: { requirePdfA: true } });
    expect(await resolvePdfARequirement(owner, mine, env)).toEqual({ required: true, source: 'organization' });
  });

  it('the string "true" or false: not required', async () => {
    await set(mine, { submission: { requirePdfA: 'true' } });
    expect(await resolvePdfARequirement(owner, mine, env)).toEqual({ required: false, source: null });
    await set(mine, { submission: { requirePdfA: false } });
    expect(await resolvePdfARequirement(owner, mine, env)).toEqual({ required: false, source: null });
  });

  it("another organisation's setting never applies", async () => {
    await set(mine, { submission: { requirePdfA: true } });
    await set(theirs, {});
    expect(await resolvePdfARequirement(owner, theirs, env)).toEqual({ required: false, source: null });
  });

  it('the deployment requirement wins', async () => {
    await set(mine, { submission: { requirePdfA: false } });
    expect(await resolvePdfARequirement(owner, mine, { ECTD_REQUIRE_PDFA: 'true' } as NodeJS.ProcessEnv)).toEqual({ required: true, source: 'deployment' });
  });
});
