import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const q = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../../db', () => ({ pool: { query: q.query } }));
import { computeRegionalRun } from '../filing-readiness';

let database: PGlite;
beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE projects(id int PRIMARY KEY, organization_id int, metadata json);
    CREATE TABLE sections(id int PRIMARY KEY, organization_id int, project_id int, section_id text, metadata json, content text, content_hash text, status text);
    CREATE TABLE concept2cure_artifacts(id int PRIMARY KEY, artifact_id text, organization_id int, project_id int, ctd_section text, content text, content_hash text, version int, status text);
    INSERT INTO projects VALUES(11,3,'{"registryId":"US_NDA"}');
    INSERT INTO sections VALUES(1,3,11,'1.1','{}','',NULL,'active'),(2,3,11,'1.2','{}','Old content','h2','archived'),(3,3,11,'1.3','{}','Deleted content','h3','deleted'),(4,4,11,'1.4','{}','Foreign tenant content','h4','active');
    INSERT INTO concept2cure_artifacts VALUES(1,'old',3,11,'1.5','Old content','h5',1,'archived'),(2,'removed',3,11,'1.6','Deleted content','h6',1,'deleted'),(3,'empty',3,11,'1.7','',NULL,1,'draft');
    INSERT INTO sections VALUES(5,3,11,'1.8','{}',E'\\n\\t ',NULL,'active');
    INSERT INTO concept2cure_artifacts VALUES(4,'blank',3,11,'1.9',E'\\r\\n\\t ',NULL,1,'draft');
  `);
  q.query.mockImplementation((sql: string, params: unknown[]) => database.query(sql, params));
});
afterAll(async () => { await database?.close(); });
const run = () => computeRegionalRun('usa_fda.nda_bla_filing_readiness', 3, 'project', '11', { region: 'USA_FDA', dataDependencies: [] });

describe('Module 1 recorded-content coverage in PostgreSQL', () => {
  it('does not use empty outline codes or archived/deleted records as document evidence', async () => {
    const result = await run();
    expect(result.summary.module1).toMatchObject({ assessed: false, recordedCodeCount: 0, coveredHeadings: null, missingHeadings: null });
  });
  it('counts only current non-empty content within the organization and retains the matched codes', async () => {
    await database.exec("UPDATE sections SET content='Actual recorded application document', content_hash='actual-hash' WHERE id=1");
    const result = await run();
    expect(result.summary.module1).toMatchObject({ assessed: true, recordedCodeCount: 1, recordedCodes: ['1.1'] });
    expect((result.summary.module1 as { missingHeadings: Array<{ code: string }> }).missingHeadings.map(row => row.code)).not.toContain('1.1');
  });
});
