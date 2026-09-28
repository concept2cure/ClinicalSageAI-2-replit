/**
 * protocol-industry-service — END-TO-END against in-process PGlite.
 *
 * The eight industry-gap engines are pure and tested on their own; what this
 * file holds is the BOUNDARY that feeds them, because that is where the
 * repository's honesty failures have actually happened:
 *
 *  - Tenant scope. Every read is keyed by organization_id: another org's
 *    protocol is NOT_FOUND, and another org's deviations never enter a trend.
 *  - Fail closed. A protocol with no design bound, or bound to a design this
 *    org cannot read, throws INVALID_STATE with a sentence — it never returns
 *    an empty checklist or an empty schema that would read as a clean result.
 *  - A version label is looked up, not guessed: not recorded → NOT_FOUND,
 *    recorded twice → INVALID_STATE, unparseable snapshot → INVALID_STATE.
 *  - The working copy can be the later side of a redline, never the earlier.
 *  - Unknown is not zero: a deviation read carries no closure timestamp
 *    (the table has none), so closedAt is null, not a date read off updated_at.
 *
 * Every read goes through the connection the caller passes (a route's
 * request-scoped client, an AnA tool's tenant-context transaction); here that
 * is PGlite itself, and the bound design is a real cdisc_prm_studies row read
 * through the one mapper, rowsToStudyDesign.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { StudyDesign } from '../../study-design/study-design-types';

let pglite: PGlite;
/** The caller's connection, as the service sees it. */
const q = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as any[] };
  },
};
// study-design-repository imports the drizzle handle at module load; nothing
// here reaches it (rowsToStudyDesign is pure), so it is inert.
vi.mock('../../../db', () => ({ pool: {}, db: {}, getPool: () => ({}) }));

import { STUDY_DESIGN_META_KIND } from '../../study-design/study-design-repository';

/** Persist a design row the way persistStudyDesignTx shapes its metadata. */
async function seedDesign(tenant: number, studyId: string, d: StudyDesign): Promise<void> {
  await pglite.query(`INSERT INTO cdisc_prm_studies (study_id, tenant_id, metadata) VALUES ($1,$2,$3)`, [
    studyId, tenant, JSON.stringify({ kind: STUDY_DESIGN_META_KIND, design: { ...d, id: studyId } }),
  ]);
}

import {
  CURRENT_VERSION_LABEL,
  DESIGN_ENGINES,
  designEngineForProtocol,
  deviationTrendsForProtocol,
  readBoundDesign,
  redlineForProtocol,
  spiritForProtocol,
} from '../protocol-industry-service';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE protocol_documents (id serial PRIMARY KEY, organization_id int NOT NULL, title text, version text, status text, study_design_id text, deleted_at timestamptz);
CREATE TABLE protocol_sections (id serial PRIMARY KEY, organization_id int NOT NULL, protocol_document_id int, section_key text, title text, content text, status text, order_index int, deleted_at timestamptz);
CREATE TABLE protocol_versions (id serial PRIMARY KEY, organization_id int NOT NULL, protocol_document_id int, version text NOT NULL, change_summary text, snapshot text, created_by int, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE protocol_deviations (id serial PRIMARY KEY, organization_id int NOT NULL, protocol_document_id int NOT NULL, description text,
  category text CHECK (category IN ('enrollment','consent','procedure','safety','data','other')),
  severity text CHECK (severity IN ('minor','major','critical')), is_reportable boolean,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','capa_pending','closed')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
CREATE TABLE cdisc_prm_studies (study_id text NOT NULL, tenant_id int NOT NULL, metadata jsonb);
CREATE TABLE protocol_capa_actions (id serial PRIMARY KEY, organization_id int NOT NULL, deviation_id int NOT NULL, action text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','verified')), deleted_at timestamptz);
`;

function design(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [],
    endpoints: [{ name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'adults with type 2 diabetes', analysisPopulations: [], eligibility: [] },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral', regimen: 'once daily' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo', route: 'oral', regimen: 'once daily' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double', stratificationFactors: ['region'] },
    statisticalPlan: { plannedAnalyses: [] },
  } as StudyDesign;
}

async function insertDoc(org: number, studyDesignId: string | null, version = '0.2'): Promise<number> {
  const r = await pglite.query(
    `INSERT INTO protocol_documents (organization_id, title, version, status, study_design_id) VALUES ($1,'P',$2,'in_development',$3) RETURNING id`,
    [org, version, studyDesignId],
  );
  return (r.rows[0] as { id: number }).id;
}

const snapshot = (version: string, sections: Array<[string, string, string | null, number]>) =>
  JSON.stringify({
    version,
    sections: sections.map(([section_key, title, content, order_index]) => ({ section_key, title, content, status: 'draft', order_index })),
  });

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
}, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`DELETE FROM protocol_documents; DELETE FROM protocol_sections; DELETE FROM protocol_versions; DELETE FROM protocol_deviations; DELETE FROM protocol_capa_actions; DELETE FROM cdisc_prm_studies;`);
});

describe('readBoundDesign — fails closed, tenant-scoped', () => {
  it('another organisation\'s protocol is NOT_FOUND, not an empty result', async () => {
    const id = await insertDoc(OTHER, 'S-1');
    await seedDesign(OTHER, 'S-1', design());
    await expect(readBoundDesign(q, ORG, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a protocol with no design bound throws INVALID_STATE saying the engine did not run', async () => {
    const id = await insertDoc(ORG, null);
    await expect(readBoundDesign(q, ORG, id)).rejects.toMatchObject({ code: 'INVALID_STATE', message: expect.stringMatching(/did not run/) });
    const blank = await insertDoc(ORG, '   ');
    await expect(readBoundDesign(q, ORG, blank)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('a design row with no design object is INVALID_STATE, not an empty design', async () => {
    const id = await insertDoc(ORG, 'S-2');
    await pglite.query(`INSERT INTO cdisc_prm_studies (study_id, tenant_id, metadata) VALUES ('S-2',$1,'{"kind":"something-else"}')`, [ORG]);
    await expect(readBoundDesign(q, ORG, id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('a design id this org cannot read is INVALID_STATE, even when another org holds that id', async () => {
    const id = await insertDoc(ORG, 'S-1');
    await seedDesign(OTHER, 'S-1', design());
    await expect(readBoundDesign(q, ORG, id)).rejects.toMatchObject({ code: 'INVALID_STATE', message: expect.stringMatching(/could not be read/) });
  });

  it('returns the bound design when it resolves for this org', async () => {
    const id = await insertDoc(ORG, 'S-1');
    await seedDesign(ORG, 'S-1', design());
    const bound = await readBoundDesign(q, ORG, id);
    expect(bound).toMatchObject({ documentId: id, studyDesignId: 'S-1' });
    expect(bound.design.title).toMatch(/Drug X/);
  });
});

describe('design engines through the boundary', () => {
  it('every design engine runs over the bound design and carries the ids', async () => {
    const id = await insertDoc(ORG, 'S-1');
    await seedDesign(ORG, 'S-1', design());
    for (const engine of Object.keys(DESIGN_ENGINES) as Array<keyof typeof DESIGN_ENGINES>) {
      const out = await designEngineForProtocol(q, ORG, id, engine);
      expect(out, engine).toMatchObject({ documentId: id, studyDesignId: 'S-1' });
      expect(Object.keys(out).length, engine).toBe(3);
    }
  });

  it('SPIRIT is handed this protocol\'s own sections — and only this org\'s', async () => {
    const id = await insertDoc(ORG, 'S-1');
    await seedDesign(ORG, 'S-1', design());
    await pglite.query(`INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, content, status, order_index) VALUES ($1,$2,'ethics','Ethics','Approved by the IRB.','complete',0)`, [ORG, id]);
    await pglite.query(`INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, content, status, order_index) VALUES ($1,$2,'funding','Funding','Other org text','complete',1)`, [OTHER, id]);
    const out = await spiritForProtocol(q, ORG, id);
    expect(out.spirit.documentProvided).toBe(true);
    const evidence = out.spirit.items.flatMap((i) => i.evidence).join(' ');
    expect(evidence).not.toMatch(/Other org text|funding/i);
  });
});

describe('deviationTrendsForProtocol — the rows the trend reads', () => {
  it('excludes other organisations\' and deleted deviations, and counts CAPA actions per deviation', async () => {
    const id = await insertDoc(ORG, null);
    const d1 = await pglite.query(`INSERT INTO protocol_deviations (organization_id, protocol_document_id, description, category, severity, is_reportable, status, created_at) VALUES ($1,$2,'Missed visit','procedure','major',true,'open','2026-08-10T00:00:00Z') RETURNING id`, [ORG, id]);
    await pglite.query(`INSERT INTO protocol_deviations (organization_id, protocol_document_id, description, category, severity, status, created_at) VALUES ($1,$2,'Other org','consent','critical','open','2026-08-11T00:00:00Z')`, [OTHER, id]);
    await pglite.query(`INSERT INTO protocol_deviations (organization_id, protocol_document_id, description, category, severity, status, created_at, deleted_at) VALUES ($1,$2,'Deleted','data','minor','open','2026-08-12T00:00:00Z', now())`, [ORG, id]);
    const devId = (d1.rows[0] as { id: number }).id;
    // This org's own actions are all finished; the only OPEN action on this
    // deviation id belongs to another org. If the join admitted it, the
    // deviation would count as having an open CAPA.
    await pglite.query(`INSERT INTO protocol_capa_actions (organization_id, deviation_id, action, status) VALUES ($1,$2,'Retrain','completed'),($1,$2,'Verify','verified')`, [ORG, devId]);
    await pglite.query(`INSERT INTO protocol_capa_actions (organization_id, deviation_id, action, status) VALUES ($1,$2,'Foreign','open')`, [OTHER, devId]);

    const out = await deviationTrendsForProtocol(q, ORG, id, { today: '2026-09-28' });
    const total = out.trends.byMonth.reduce((n, m) => n + m.total, 0);
    expect(total).toBe(1);
    expect(out.trends.capa.withOpenActions).toBe(0);
    expect(out.trends.siteBreakdown.available).toBe(false);
  });

  it('an unassessed deviation (null category and severity) is still counted, never dropped', async () => {
    const id = await insertDoc(ORG, null);
    await pglite.query(`INSERT INTO protocol_deviations (organization_id, protocol_document_id, description, status, created_at) VALUES ($1,$2,'Recorded, not yet assessed','open','2026-09-02T00:00:00Z')`, [ORG, id]);
    const out = await deviationTrendsForProtocol(q, ORG, id, { today: '2026-09-28' });
    expect(out.trends.byMonth.reduce((n, m) => n + m.total, 0)).toBe(1);
  });

  it('a protocol with no deviations reports null shares, never 0', async () => {
    const id = await insertDoc(ORG, null);
    const out = await deviationTrendsForProtocol(q, ORG, id, { today: '2026-09-28' });
    expect(out.trends.rates.reportableShare).toBeNull();
    expect(out.trends.rates.majorOrCriticalShare).toBeNull();
  });

  it('another organisation\'s protocol is NOT_FOUND rather than an empty trend', async () => {
    const id = await insertDoc(OTHER, null);
    await expect(deviationTrendsForProtocol(q, ORG, id, { today: '2026-09-28' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('redlineForProtocol — versions are looked up, never guessed', () => {
  it('compares two recorded versions of this org\'s protocol', async () => {
    const id = await insertDoc(ORG, null);
    await pglite.query(`INSERT INTO protocol_versions (organization_id, protocol_document_id, version, snapshot, created_by) VALUES ($1,$2,'0.1',$3,1),($1,$2,'0.2',$4,1)`, [
      ORG, id,
      snapshot('0.1', [['synopsis', 'Synopsis', 'Adults 18-65.', 0]]),
      snapshot('0.2', [['synopsis', 'Synopsis', 'Adults 18 and over.', 0], ['stats', 'Statistics', 'MMRM.', 1]]),
    ]);
    const out = await redlineForProtocol(q, ORG, id, '0.1', '0.2');
    expect(out.redline.summary).toMatchObject({ modified: 1, added: 1 });
  });

  it('a label not recorded for this org is NOT_FOUND — including one another org recorded', async () => {
    const id = await insertDoc(ORG, null);
    await pglite.query(`INSERT INTO protocol_versions (organization_id, protocol_document_id, version, snapshot, created_by) VALUES ($1,$2,'0.1',$3,1)`, [ORG, id, snapshot('0.1', [])]);
    await pglite.query(`INSERT INTO protocol_versions (organization_id, protocol_document_id, version, snapshot, created_by) VALUES ($1,$2,'0.9',$3,1)`, [OTHER, id, snapshot('0.9', [])]);
    await expect(redlineForProtocol(q, ORG, id, '0.1', '0.9')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a label recorded twice is INVALID_STATE: the redline will not pick one', async () => {
    const id = await insertDoc(ORG, null);
    await pglite.query(`INSERT INTO protocol_versions (organization_id, protocol_document_id, version, snapshot, created_by) VALUES ($1,$2,'0.1',$3,1),($1,$2,'0.1',$3,1),($1,$2,'0.2',$3,1)`, [ORG, id, snapshot('0.1', [])]);
    await expect(redlineForProtocol(q, ORG, id, '0.1', '0.2')).rejects.toMatchObject({ code: 'INVALID_STATE', message: expect.stringMatching(/recorded 2 times/) });
  });

  it('an unparseable snapshot is INVALID_STATE, not an empty document', async () => {
    const id = await insertDoc(ORG, null);
    await pglite.query(`INSERT INTO protocol_versions (organization_id, protocol_document_id, version, snapshot, created_by) VALUES ($1,$2,'0.1','{not json',1),($1,$2,'0.2',$3,1)`, [ORG, id, snapshot('0.2', [])]);
    await expect(redlineForProtocol(q, ORG, id, '0.1', '0.2')).rejects.toMatchObject({ code: 'INVALID_STATE', message: expect.stringMatching(/could not be read/) });
    await pglite.query(`UPDATE protocol_versions SET snapshot = '{"version":"0.1"}' WHERE version = '0.1'`);
    await expect(redlineForProtocol(q, ORG, id, '0.1', '0.2')).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('the working copy can be the later side, read from this org\'s live sections', async () => {
    const id = await insertDoc(ORG, null, '0.1');
    await pglite.query(`INSERT INTO protocol_versions (organization_id, protocol_document_id, version, snapshot, created_by) VALUES ($1,$2,'0.1',$3,1)`, [ORG, id, snapshot('0.1', [['synopsis', 'Synopsis', 'Old.', 0]])]);
    await pglite.query(`INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, content, status, order_index) VALUES ($1,$2,'synopsis','Synopsis','New.','draft',0)`, [ORG, id]);
    await pglite.query(`INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, content, status, order_index) VALUES ($1,$2,'foreign','Foreign','X','draft',1)`, [OTHER, id]);
    const out = await redlineForProtocol(q, ORG, id, '0.1', CURRENT_VERSION_LABEL);
    expect(out.redline.summary).toMatchObject({ modified: 1, added: 0 });
    expect(out.redline.to).toMatch(/^current/);
  });

  it('refuses the working copy as the EARLIER side, and empty labels', async () => {
    const id = await insertDoc(ORG, null);
    await expect(redlineForProtocol(q, ORG, id, CURRENT_VERSION_LABEL, '0.1')).rejects.toMatchObject({ code: 'BAD_INPUT' });
    await expect(redlineForProtocol(q, ORG, id, ' ', '0.1')).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });
});
