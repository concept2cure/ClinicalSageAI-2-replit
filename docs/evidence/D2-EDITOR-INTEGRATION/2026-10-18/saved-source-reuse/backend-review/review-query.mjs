/** Independent candidate-ordering SQL review. Run from the repository root. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const sourcePath = 'server/services/authoring/authoring-saved-assembly-sources.ts';
const source = readFileSync(sourcePath, 'utf8');
const match = source.match(/q\.query\(`(WITH trails AS \([\s\S]*?)`,\s*\[input\.docId, input\.organizationId\]\)/);
if (!match) throw new Error('Exact latest() static SQL not found');
const sql = match[1];
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceBefore = sha(source);
const output = name => fileURLToPath(new URL(name, import.meta.url));
writeFileSync(output('candidate-query.sql'), sql + '\n');

const pg = new PGlite();
try {
  await pg.exec(`CREATE TABLE authoring_audit_trail(
    id uuid,doc_id uuid,tenant_id integer,section_id uuid,operation_type text,metadata jsonb);
    CREATE TABLE audit_logs(id uuid,tenant_id integer,action text,table_name text,
      record_id text,new_values json,chain_seq bigint);`);
  const ids = Array.from({ length: 20 }, (_, i) => `12345678-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
  const [doc, older, newer, olderAudit, newerAudit, section] = ids;
  const trail = async (id, operation = 'ASSEMBLY_SOURCES', parent = doc, sectionId = null,
    metadata = { assembly: { sources: { selection: 'retained' } } }) =>
    pg.query('INSERT INTO authoring_audit_trail VALUES($1,$2,1,$3,$4,$5::jsonb)',
      [id, parent, sectionId, operation, JSON.stringify(metadata)]);
  const chain = async (id, trailId, sequence = 1, options = {}) => {
    const { action = 'authoring.section.ASSEMBLY_SOURCES', operationType = 'ASSEMBLY_SOURCES',
      record = doc, detailDoc = doc, tenant = 1 } = options;
    return pg.query('INSERT INTO audit_logs VALUES($1,$2,$3,$4,$5,$6::json,$7)',
      [id, tenant, action, 'authoring_document', record,
        JSON.stringify({ trailId, docId: detailDoc, operationType }), sequence]);
  };
  const pair = async () => { await trail(older); await chain(olderAudit, older); };
  const cases = [
    ['empty', async () => {}, true, null],
    ['one exact pair', pair, true, older],
    ['beyond 500 unrelated events', async () => {
      await pair();
      await pg.query(`INSERT INTO authoring_audit_trail
        SELECT gen_random_uuid(),$1,1,null,'UPDATE','{}'::jsonb FROM generate_series(1,501)`, [doc]);
    }, true, older],
    ['newest numeric sequence', async () => { await pair(); await trail(newer); await chain(newerAudit, newer, 2); }, true, newer],
    ['newest null sequence', async () => { await pair(); await trail(newer); await chain(newerAudit, newer, null); }, false],
    ['newest zero sequence', async () => { await pair(); await trail(newer); await chain(newerAudit, newer, 0); }, false],
    ['newest trail without chain', async () => { await pair(); await trail(newer); }, false],
    ['newest chain without trail', async () => { await pair(); await chain(newerAudit, newer, 2); }, false],
    ['duplicate links', async () => { await pair(); await chain(newerAudit, older, 2); }, false],
    ['duplicate positions', async () => { await pair(); await trail(newer); await chain(newerAudit, newer, 1); }, false],
    ['damaged operation unchained metadata retained', async () => { await pair(); await trail(newer, 'UPDATE'); }, false],
    ['damaged trail and action labels payload marker retained', async () => {
      await pair(); await trail(newer, 'UPDATE'); await chain(newerAudit, newer, 2, { action: 'authoring.section.UPDATE' });
    }, false],
    ['damaged all operation labels metadata retained', async () => {
      await pair(); await trail(newer, 'UPDATE');
      await chain(newerAudit, newer, 2, { action: 'authoring.section.UPDATE', operationType: 'UPDATE' });
    }, false],
    ['malformed section source event', async () => {
      await pair(); await trail(newer, 'ASSEMBLY_SOURCES', doc, section); await chain(newerAudit, newer, 2);
    }, false],
    ['wrong chain record parent', async () => {
      await pair(); await trail(newer); await chain(newerAudit, newer, 2, { record: ids[8] });
    }, false],
    ['foreign tenant chain cannot repair own trail', async () => {
      await pair(); await trail(newer); await chain(newerAudit, newer, 2, { tenant: 2 });
    }, false],
  ];
  const results = [];
  for (const [name, setup, expectedValid, expectedEvent] of cases) {
    await pg.exec('TRUNCATE authoring_audit_trail,audit_logs');
    await setup();
    const row = (await pg.query(sql, [doc, 1])).rows[0];
    const passed = row.ordering_valid === expectedValid &&
      (expectedEvent === undefined || row.event_id === expectedEvent);
    if (!passed) throw new Error(JSON.stringify({ name, row, expectedValid, expectedEvent }));
    results.push({ name, passed, orderingValid: row.ordering_valid });
  }
  const sourceAfter = sha(readFileSync(sourcePath, 'utf8'));
  if (sourceBefore !== sourceAfter) throw new Error('Source changed during candidate-query review');
  process.stdout.write(JSON.stringify({
    scope: 'Exact candidate-ordering SQL only; not HTTP, link integrity, source ACL or concurrent-scheduling qualification.',
    sourcePath, sourceBefore, sourceAfter, sourceUnchanged: true, querySha256: sha(sql),
    savedQuerySha256: sha(sql + '\n'), node: process.version, passed: results.length, results,
  }, null, 2) + '\n');
} finally {
  await pg.close();
}
