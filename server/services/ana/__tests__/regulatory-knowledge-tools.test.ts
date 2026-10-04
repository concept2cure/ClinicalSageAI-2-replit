/**
 * The regulatory knowledge tools answer from the canonical record, say so when
 * they cannot, and never report a step they cannot see as missing or done.
 */
import { describe, it, expect } from 'vitest';
import {
  RESULT_BUDGET,
  VAULT_FACTS_MAX,
  documentSectionRequirements,
  fdaTechnicalRules,
  registerRegulatoryKnowledgeHandlers,
  type KnowledgeQueryable,
  REGULATORY_KNOWLEDGE_TOOLS,
} from '../regulatory-knowledge-tools';
import { CTD_AUTHORING_GUIDANCE, ICH_E3_GUIDANCE, listLifecycleIds, SUBMISSION_CHAIN } from '../../ind/ctd/index';

type Handler = (input: Record<string, unknown>, ctx?: Record<string, unknown>) => Promise<string>;

function handlers(pool?: KnowledgeQueryable): Record<string, Handler> {
  const out: Record<string, Handler> = {};
  registerRegulatoryKnowledgeHandlers((name, fn) => { out[name] = fn as Handler; }, pool ? { pool: () => pool } : {});
  return out;
}

const PROGRAM = '11111111-2222-4333-8444-555555555555';
const CTX = { organizationId: 7, projectRef: PROGRAM };

/** A pool that owns PROGRAM for org 7 and answers the Vault read with `rows`. */
function fakePool(rows: Array<{ ctd_section: string; placement_status: string; document_title: string }>, opts: { fail?: boolean } = {}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const pool: KnowledgeQueryable = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/FROM regulatory_programs WHERE id = \$1/.test(sql)) return { rows: params?.[0] === PROGRAM && params?.[1] === 7 ? [{ id: PROGRAM }] : [] };
      if (/FROM vault\.documents/.test(sql)) {
        if (opts.fail) throw new Error('relation "vault.documents" does not exist');
        return { rows };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  return { pool, calls };
}

const doc = (ctd_section: string, document_title: string, placement_status = 'confirmed') => ({ ctd_section, document_title, placement_status });

describe('get_document_section_requirements', () => {
  it('answers a CSR heading, a CTD section and a document type from the canonical record', () => {
    const e3 = JSON.parse(documentSectionRequirements({ document: 'csr', section: '12.2.4' }));
    expect(e3.requirements).toContain('both the preferred term and the original term');
    const m273 = JSON.parse(documentSectionRequirements({ document: '2.7.3' }));
    expect(m273.kind).toBe('CTD section');
    expect(m273.requirements).toContain('Summary of Clinical Efficacy');
    expect(m273.requirements).toContain('5.3.5.3');
    const iss = JSON.parse(documentSectionRequirements({ document: 'ISS' }));
    expect(iss.kind).toBe('document type');
    expect(iss.requirements).toContain('Integrated Summary of Safety');
  });

  it('says what it does not index, and lists what it does', () => {
    const r = JSON.parse(documentSectionRequirements({ document: 'clinical-trial-agreement' }));
    expect(r.not_indexed).toBe(true);
    expect(r.message).toMatch(/do not supply requirements from memory/);
    expect(r.document_types).toEqual(expect.arrayContaining(['nda', 'iss', 'csr']));
    expect(JSON.parse(documentSectionRequirements({ document: 'csr', section: '17' })).not_indexed).toBe(true);
    expect(JSON.parse(documentSectionRequirements({})).error).toBeTruthy();
  });

  it('fits the result budget for every section, document type and E3 heading it knows', () => {
    const inputs = [
      ...Object.keys(CTD_AUTHORING_GUIDANCE).map((document) => ({ document })),
      ...listLifecycleIds().map((document) => ({ document })),
      { document: 'csr' },
      ...ICH_E3_GUIDANCE.map((s) => ({ document: 'csr', section: s.number })),
    ];
    for (const input of inputs) {
      const out = documentSectionRequirements(input);
      expect(out.length, JSON.stringify(input)).toBeLessThanOrEqual(RESULT_BUDGET);
      expect(JSON.parse(out).status, 'no top-level status').toBeUndefined();
    }
  });
});

describe('plan_submission_from_database_lock', () => {
  it('without a project, gives the plan and says there is no standing', async () => {
    const out = JSON.parse(await handlers().plan_submission_from_database_lock({}, undefined));
    expect(out.plan.length).toBe(SUBMISSION_CHAIN.length);
    expect(out.standing).toBeNull();
  });

  it('with an organization but no open project, says so rather than reading another project', async () => {
    const { pool, calls } = fakePool([]);
    const out = JSON.parse(await handlers(pool).plan_submission_from_database_lock({}, { organizationId: 7 }));
    expect(out.standing).toBeNull();
    expect(out.standing_note).toMatch(/No project is open/);
    expect(calls.some((c) => /vault\.documents/.test(c.sql))).toBe(false);
  });

  it('reads the open project’s Vault, scoped by organization and program, and decides the standing', async () => {
    const { pool, calls } = fakePool([
      doc('5.3.5.1', 'CSR — Study 301'),
      doc('5.3.5.3', 'Integrated Summary of Effectiveness'),
      doc('2.7.3', 'Summary of Clinical Efficacy'),
      doc('2.5', 'Clinical Overview'),
      doc('2.7.6', 'Synopses', 'suggested'),
    ]);
    const out = JSON.parse(await handlers(pool).plan_submission_from_database_lock({}, CTX));
    const vaultCall = calls.find((c) => /vault\.documents/.test(c.sql))!;
    expect(vaultCall.params?.slice(0, 2)).toEqual([7, PROGRAM]);
    const s = out.standing;
    expect(s.states.csr).toBe('filed (1)');
    expect(s.states.ise).toBe('filed (1)');
    expect(s.states.iss).toBe('not_found');
    expect(s.states.m2_7_6).toBe('suggested (1)');
    expect(s.states.sdtm).toBe('not_visible');
    expect(s.blocked).toContain('m2_7_4 waits on iss');
    expect(s.next).toContain('iss (assumes integrated_data done; not visible here)');
    expect(s.filed_ahead_of_sources).toContain('m2_5 is filed but m2_7_clinpharm, m2_7_4 is not');
  });

  it('a step the Vault cannot hold is never reported missing, and never as what a step waits on', async () => {
    const { pool } = fakePool([]);
    const s = JSON.parse(await handlers(pool).plan_submission_from_database_lock({}, CTX)).standing;
    for (const id of ['database_lock', 'sdtm', 'adam', 'tlf', 'integrated_data']) expect(s.states[id]).toBe('not_visible');
    expect(s.blocked.join(' ')).not.toMatch(/waits on .*(sdtm|adam|tlf|database_lock)/);
    expect(s.next).toContain('csr (assumes tlf done; not visible here)');
  });

  it('a failed Vault read is a failure, not a project with nothing filed', async () => {
    const { pool } = fakePool([], { fail: true });
    const raw = await handlers(pool).plan_submission_from_database_lock({}, CTX);
    const out = JSON.parse(raw);
    expect(out.standing).toBeNull();
    expect(out.standing_error).toMatch(/could not be read/);
    expect(raw).not.toContain('not_found');
    expect(raw).not.toContain('vault.documents');
  });

  it('a read cut short says so, and claims nothing is missing', async () => {
    const rows = Array.from({ length: VAULT_FACTS_MAX + 1 }, (_, i) => doc('2.2', `Introduction ${i}`));
    const { pool } = fakePool(rows);
    const s = JSON.parse(await handlers(pool).plan_submission_from_database_lock({}, CTX)).standing;
    expect(s.incomplete).toBeTruthy();
    expect(Object.values(s.states)).not.toContain('not_found');
  });

  it('gives one step in full, with its checked sources', async () => {
    const ise = JSON.parse(await handlers().plan_submission_from_database_lock({ step: 'ise' }));
    expect(ise.step.filed_under).toEqual(['5.3.5.3']);
    expect(ise.step.basis.join(' ')).toContain('https://www.fda.gov/');
    expect(JSON.parse(await handlers().plan_submission_from_database_lock({ step: 'nope' })).steps).toContain('csr');
  });

  it('fits the result budget, with and without a standing', async () => {
    const { pool } = fakePool([doc('5.3.5.1', 'CSR')]);
    expect((await handlers(pool).plan_submission_from_database_lock({}, CTX)).length).toBeLessThanOrEqual(RESULT_BUDGET);
    for (const n of SUBMISSION_CHAIN) {
      expect((await handlers().plan_submission_from_database_lock({ step: n.id })).length, n.id).toBeLessThanOrEqual(RESULT_BUDGET);
    }
  });
});

describe('list_fda_technical_rules', () => {
  it('lists every rule in brief with what the platform checks, and what FDA has said about Elsa', () => {
    const raw = fdaTechnicalRules({});
    expect(raw.length).toBeLessThanOrEqual(RESULT_BUDGET);
    const out = JSON.parse(raw);
    expect(out.rules.length).toBeGreaterThanOrEqual(15);
    for (const r of out.rules) expect(['enforced', 'partial', 'not-checked']).toContain(r.platform);
    expect(out.elsa.guidance).toMatch(/no acceptance criteria for Elsa/);
  });

  it.each(['pdf', 'ectd', 'study-data', 'content'])('gives the %s rules in full, each with its source', (area) => {
    const raw = fdaTechnicalRules({ area });
    expect(raw.length).toBeLessThanOrEqual(RESULT_BUDGET);
    for (const r of JSON.parse(raw).rules) {
      expect(r.url, r.id).toMatch(/^https:\/\/www\.(fda|ecfr)\.gov\//);
      expect(r.if_missed, r.id).toBeTruthy();
    }
  });

  // The PLR format rules are their own area. A schema enum without it means
  // the model can never ask for them, however the description reads.
  it('offers the labeling area and answers it with the PLR format rules', () => {
    const tool = REGULATORY_KNOWLEDGE_TOOLS.find((t) => t.name === 'list_fda_technical_rules')!;
    const schema = tool.input_schema as unknown as { properties: { area: { enum: string[] } } };
    expect(schema.properties.area.enum).toContain('labeling');
    const out = JSON.parse(fdaTechnicalRules({ area: 'labeling' }));
    expect(out.rules.length).toBeGreaterThan(0);
    for (const r of out.rules) expect(r.url, r.id).toMatch(/^https:\/\/www\.(fda|ecfr)\.gov\//);
    expect(JSON.parse(fdaTechnicalRules({ area: 'nope' })).error).toContain('labeling');
  });

  it('refuses an area it does not have', () => {
    expect(JSON.parse(fdaTechnicalRules({ area: 'labels' })).error).toBeTruthy();
  });
});
