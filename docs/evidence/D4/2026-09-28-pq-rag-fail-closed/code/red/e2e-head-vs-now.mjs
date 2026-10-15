// The CLI end to end, HEAD's script vs the current one, on the same PGlite seed:
// CT.gov rows (csr_*) + another tenant's embedded chunks; eval org A has nothing,
// then one embedded chunk.
import { spawnSync } from 'node:child_process';
const REPO = '/home/user/ClinicalSageAI-2-replit';
const REGISTER = `${REPO}/tests/ops/helpers/pglite-as-pg-register.mjs`;
const ORG_A = '11111111-1111-4111-8111-111111111111';
const SEED = `
  CREATE TABLE organizations (id serial PRIMARY KEY, uuid uuid NOT NULL UNIQUE);
  INSERT INTO organizations (id, uuid) VALUES (1, '${ORG_A}'), (2, '22222222-2222-4222-8222-222222222222');
  CREATE SCHEMA vault;
  CREATE TABLE vault.documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer, processing_status text);
  CREATE TABLE vault.document_chunks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES vault.documents(id), chunk_text text NOT NULL, embedding real[]);
  CREATE TABLE csr_reports (id serial PRIMARY KEY, organization_id integer NOT NULL);
  CREATE TABLE csr_details (id serial PRIMARY KEY, report_id integer NOT NULL);
  INSERT INTO csr_reports (organization_id) SELECT 2 FROM generate_series(1, 500);
  INSERT INTO csr_details (report_id) SELECT g FROM generate_series(1, 480) g;
  INSERT INTO vault.documents (id, organization_id, processing_status) VALUES ('b0000000-0000-4000-8000-000000000001', 2, 'completed');
  INSERT INTO vault.document_chunks (document_id, chunk_text, embedding) VALUES ('b0000000-0000-4000-8000-000000000001', 'x', '{0.1}');`;
const EVAL = `
  INSERT INTO vault.documents (id, organization_id, processing_status) VALUES ('a0000000-0000-4000-8000-000000000001', 1, 'completed');
  INSERT INTO vault.document_chunks (document_id, chunk_text, embedding) VALUES ('a0000000-0000-4000-8000-000000000001', 'estimand', '{0.3}');`;
const run = (script, seed, args) => {
  const env = { ...process.env, DATABASE_URL: 'pglite://memory', PGLITE_SEED: seed };
  delete env.NEON_DATABASE_URL; delete env.DATABASE_NEON_NEW_SECRET;
  return spawnSync(process.execPath, ['--import', REGISTER, script, ...args], { env, encoding: 'utf8' });
};
for (const [label, script] of [['HEAD', process.argv[2]], ['NOW ', `${REPO}/scripts/verify-rag-corpus.mjs`]]) {
  for (const [scen, seed] of [['empty eval org', SEED], ['eval org with 1 embedded chunk', SEED + EVAL]]) {
    const r = run(script, seed, ['--org-uuid', ORG_A]);
    console.info(`\n===== ${label}  --org-uuid ${ORG_A}  [${scen}]  exit=${r.status}`);
    console.info(r.stdout.trim().split('\n').filter((l) => l.trim()).join('\n'));
    if (r.stderr.trim()) console.info('stderr:', r.stderr.trim());
  }
}
