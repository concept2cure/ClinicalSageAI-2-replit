/**
 * A seeded regulatory template can be corrected.
 *
 * THE DEFECT THIS PREVENTS. `seedTemplatesIfMissing` guarded on a ROW COUNT:
 *
 *     SELECT count(*)::int AS n FROM intelligence.document_templates
 *      WHERE template_code = ANY($1) AND version = '1.0'
 *     if (n >= codes.length) return { ran: false, present: n };
 *
 * It counted template rows and never inspected a section code, a title or an
 * ordering. So once the twenty template rows existed, the seeder short-circuited
 * on every subsequent boot, forever, and a corrected `section_code` in source
 * was never applied — not updated, not duplicated, never read. The only way to
 * apply one was an authenticated user hitting
 * `POST /api/regulatory-intelligence/templates/seed`, which is not a deploy
 * path.
 *
 * WHY THAT MATTERED MORE THAN A STALE TITLE. The seeded 510(k) template's
 * section codes collide with the shipped eSTAR outline's keys under different
 * labels (`docs/evidence/ANA-REASONING/2026-10-05/r16/template-outline-code-collision/`),
 * so authored text files under another section's regulatory heading. Correcting
 * the source alone would have fixed new databases and left every existing
 * estate silently wrong — and `filingAgreesWithEditing` (P-29.2) can never
 * report it, because after a mis-keyed write the two stores AGREE. A
 * self-correcting seed is the prerequisite for the fix, not a nicety.
 *
 * WHAT IS COMPARED, AND WHY ONLY THIS. `(section_code, section_title, ordering)`
 * per template — the identity-bearing subset. The code is what binds to the
 * filing outline, the title is what the author reads, and the ordering is the
 * document's shape. Guidance prose, word counts and phrase lists are not
 * compared, so editing them does not force a DELETE+INSERT across twenty
 * templates on every boot.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

/* The wiring cases drive the REAL seedTemplatesIfMissing — its guard is the
   defect, so stubbing the decision would leave the fix untested. Only the
   database handle and the tenant scope are stood in for. */
const h = vi.hoisted(() => ({ pg: null as unknown }));
vi.mock('../../../db/runtime.js', () => ({
  get pool() { return h.pg; },
}));
vi.mock('../../../db/tenantStore', () => ({
  runWithSystemTenantScope: async (_label: string, fn: () => unknown) => fn(),
}));

import { seedSetDrift, seedTemplatesIfMissing, SEED_TEMPLATES } from '../template-seeds';

let pg: PGlite;

function executor() {
  const query = async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return { ...r, rowCount: r.affectedRows || r.rows.length };
  };
  // `connect` because seedTemplates() takes one transaction per template; the
  // drift probe needs only `query`.
  return { query, connect: async () => ({ query, release: () => undefined }) } as unknown as Parameters<typeof seedSetDrift>[0];
}

/** Store a template and the section rows given, as the seeder stores them. */
async function store(templateCode: string, sections: Array<{ code: string; title: string; ordering: number }>) {
  const { rows } = await pg.query<{ id: string }>(
    `INSERT INTO intelligence.document_templates (template_code, template_name, version, status)
     VALUES ($1, $1, '1.0', 'active') RETURNING id`,
    [templateCode],
  );
  for (const s of sections) {
    await pg.query(
      `INSERT INTO intelligence.template_sections (template_id, section_code, section_title, ordering)
       VALUES ($1, $2, $3, $4)`,
      [rows[0].id, s.code, s.title, s.ordering],
    );
  }
}

/** The source's own rows for one template, which must read as no drift. */
function sourceSections(templateCode: string) {
  const t = SEED_TEMPLATES.find((x) => x.templateCode === templateCode);
  if (!t) throw new Error(`no seed template ${templateCode}`);
  return t.sections.map((s) => ({ code: s.sectionCode, title: s.sectionTitle, ordering: s.ordering }));
}

/**
 * The seeder's own column set, declared ONCE.
 *
 * It is a constant because the absent-store case below drops and re-creates
 * `template_sections`, and when it re-created it from a second, shorter copy of
 * this DDL the wiring cases that ran afterwards failed on a missing column —
 * a harness bug that read exactly like a product one ("column \"required\" of
 * relation \"template_sections\" does not exist").
 *
 * The drift probe reads only (section_code, section_title, ordering); the rest
 * are here so seedTemplates() can really run rather than be stubbed.
 */
const INTELLIGENCE_DDL = `
    CREATE SCHEMA IF NOT EXISTS intelligence;
    CREATE TABLE intelligence.document_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), template_code TEXT NOT NULL,
      template_name TEXT NOT NULL, version TEXT NOT NULL DEFAULT '1.0',
      status TEXT NOT NULL DEFAULT 'active',
      agency TEXT, document_type TEXT, submission_type TEXT, module_path TEXT,
      description TEXT, source_reference TEXT, agency_specific_notes TEXT,
      formatting_rules JSONB, updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE intelligence.template_sections (
      template_id UUID NOT NULL, section_code TEXT NOT NULL, section_title TEXT NOT NULL,
      ordering INTEGER NOT NULL,
      required BOOLEAN, criticality TEXT, content_guidance TEXT,
      required_elements JSONB, citation_rules JSONB, agency_quirks TEXT,
      min_words INTEGER, max_words INTEGER,
      forbidden_phrases JSONB, required_phrases JSONB
    );
  `;

beforeAll(async () => {
  pg = new PGlite();
  h.pg = executor();
  await pg.exec(INTELLIGENCE_DDL);
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  await pg.exec('DELETE FROM intelligence.template_sections; DELETE FROM intelligence.document_templates;');
});

describe('the seed set knows when the store no longer matches it', () => {
  it('reports drift when a stored section CODE differs from source — the 510(k) case', async () => {
    const sections = sourceSections('fda_510k_se');
    // One code changed: exactly what correcting the source would look like from
    // the store's side.
    await store('fda_510k_se', sections.map((s, i) => (i === 0 ? { ...s, code: 'WRONG1' } : s)));
    const drift = await seedSetDrift(executor(), ['fda_510k_se']);
    expect(drift.rows, 'a changed section code must read as drift').toBeGreaterThan(0);
  });

  it('reports drift when a stored section TITLE differs from source', async () => {
    const sections = sourceSections('fda_510k_se');
    await store('fda_510k_se', sections.map((s, i) => (i === 0 ? { ...s, title: 'Stale heading' } : s)));
    expect((await seedSetDrift(executor(), ['fda_510k_se'])).rows).toBeGreaterThan(0);
  });

  it('reports drift when a stored section ORDERING differs from source', async () => {
    const sections = sourceSections('fda_510k_se');
    await store('fda_510k_se', sections.map((s, i) => (i === 0 ? { ...s, ordering: s.ordering + 1 } : s)));
    expect((await seedSetDrift(executor(), ['fda_510k_se'])).rows).toBeGreaterThan(0);
  });

  it('reports drift when a section is missing from the store', async () => {
    await store('fda_510k_se', sourceSections('fda_510k_se').slice(1));
    expect((await seedSetDrift(executor(), ['fda_510k_se'])).rows).toBeGreaterThan(0);
  });

  it('reports drift when the store holds a section source does not have', async () => {
    await store('fda_510k_se', [...sourceSections('fda_510k_se'), { code: 'EXTRA', title: 'Left behind', ordering: 9999 }]);
    expect((await seedSetDrift(executor(), ['fda_510k_se'])).rows).toBeGreaterThan(0);
  });

  it('reports drift when the template row is absent entirely', async () => {
    // Nothing stored: every source row is missing. This is the case the old
    // row-count guard DID catch, and it must keep catching it.
    expect((await seedSetDrift(executor(), ['fda_510k_se'])).rows).toBeGreaterThan(0);
  });
});

describe('a store that matches source is left alone', () => {
  it('reports no drift for a template stored exactly as source has it', async () => {
    await store('fda_510k_se', sourceSections('fda_510k_se'));
    expect((await seedSetDrift(executor(), ['fda_510k_se'])).rows).toBe(0);
  });

  it('reports no drift across every seeded template at once', async () => {
    // The control that matters: the common case is a healthy estate, and a
    // drift probe that fires on it would DELETE+INSERT twenty templates on
    // every boot forever.
    for (const t of SEED_TEMPLATES) await store(t.templateCode, sourceSections(t.templateCode));
    const codes = SEED_TEMPLATES.map((t) => t.templateCode);
    expect((await seedSetDrift(executor(), codes)).rows).toBe(0);
  });

  it('ignores a template row at another version', async () => {
    // The probe reads version '1.0', as the seeder writes and reads it. A row
    // at another version is another decision's business, not drift.
    await store('fda_510k_se', sourceSections('fda_510k_se'));
    await pg.query(`UPDATE intelligence.document_templates SET version = '2.0' WHERE template_code = $1`, ['fda_510k_se']);
    const drift = await seedSetDrift(executor(), ['fda_510k_se']);
    // Every source row is now unmatched, which IS drift — the '1.0' row is gone.
    expect(drift.rows).toBeGreaterThan(0);
  });
});

describe('the probe cannot fail the boot it runs in', () => {
  it('answers "cannot tell" rather than throwing when the store is absent', async () => {
    await pg.exec('DROP TABLE intelligence.template_sections;');
    const drift = await seedSetDrift(executor(), ['fda_510k_se']);
    expect(drift.rows).toBe(0);
    // The sentence has to say what happened AND what follows from it, because
    // its only reader is a boot log: "could not be compared" alone would leave
    // someone wondering whether the seed ran anyway.
    expect(drift.reason, 'an absent store must be said, not thrown').toMatch(/could not be compared/i);
    expect(drift.reason).toMatch(/nothing was re-seeded/i);
    // Restored from the ONE DDL, not a second copy of it — see INTELLIGENCE_DDL.
    await pg.exec(INTELLIGENCE_DDL.replace(/CREATE SCHEMA[^;]*;/, '').replace(/CREATE TABLE intelligence\.document_templates[\s\S]*?\);/, ''));
  });
});

describe('a corrected source now reaches a store that already holds the old codes', () => {
  /* The whole point. Before this change the guard was a row count, so once the
     twenty template rows existed the seeder returned `ran: false` forever and a
     corrected section_code was never applied. These two cases are that
     sentence, executed. */

  async function storeEveryTemplate(mutate?: (code: string, sections: ReturnType<typeof sourceSections>) => ReturnType<typeof sourceSections>) {
    for (const t of SEED_TEMPLATES) {
      const secs = sourceSections(t.templateCode);
      await store(t.templateCode, mutate ? mutate(t.templateCode, secs) : secs);
    }
  }

  it('re-seeds when a stored section code no longer matches source, and corrects it', async () => {
    await storeEveryTemplate((code, secs) =>
      code === 'fda_510k_se' ? secs.map((x, i) => (i === 0 ? { ...x, code: 'WRONG1' } : x)) : secs);

    const out = await seedTemplatesIfMissing();
    expect(out.ran, 'a full store with a wrong code must still re-seed').toBe(true);

    const after = await pg.query<{ section_code: string }>(
      `SELECT ts.section_code FROM intelligence.template_sections ts
         JOIN intelligence.document_templates t ON t.id = ts.template_id
        WHERE t.template_code = 'fda_510k_se' AND ts.section_code = 'WRONG1'`,
    );
    expect(after.rows, 'the wrong code must be gone after the re-seed').toEqual([]);
    expect((await seedSetDrift(executor(), ['fda_510k_se'])).rows, 'and the store now matches source').toBe(0);
  });

  it('leaves a matching store alone — no re-seed, no churn', async () => {
    await storeEveryTemplate();
    const out = await seedTemplatesIfMissing();
    expect(out.ran, 'a store that matches source must not be rewritten on boot').toBe(false);
  });
});
