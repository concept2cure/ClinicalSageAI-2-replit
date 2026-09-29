// The default report (no flag) must be byte-identical to HEAD's, stdout and exit code.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const REPO = '/home/user/ClinicalSageAI-2-replit';
const REGISTER = `${REPO}/tests/ops/helpers/pglite-as-pg-register.mjs`;
const src = readFileSync(`${REPO}/tests/ops/verify-rag-corpus.test.mjs`, 'utf8');
const ORG_A = '11111111-1111-4111-8111-111111111111', ORG_B = '22222222-2222-4222-8222-222222222222';
// eslint-disable-next-line no-new-func
const SEED = new Function('ORG_A', 'ORG_B', `return \`${src.split('const SEED = `')[1].split('`;')[0]}\`;`)(ORG_A, ORG_B);
const EVAL = src.split('const EVAL_CONTENT = `')[1].split('`;')[0];
const run = (script, seed) => {
  const env = { ...process.env, DATABASE_URL: 'pglite://memory', PGLITE_SEED: seed };
  delete env.NEON_DATABASE_URL; delete env.DATABASE_NEON_NEW_SECRET;
  return spawnSync(process.execPath, ['--import', REGISTER, script], { env, encoding: 'utf8' });
};
for (const [scen, seed] of [['csr_* + other tenant, empty eval org', SEED], ['plus eval content', SEED + EVAL]]) {
  const h = run(process.argv[2], seed), n = run(`${REPO}/scripts/verify-rag-corpus.mjs`, seed);
  console.log(`[${scen}] HEAD exit=${h.status} bytes=${Buffer.byteLength(h.stdout)} | NOW exit=${n.status} bytes=${Buffer.byteLength(n.stdout)} | identical stdout: ${h.stdout === n.stdout} stderr: ${h.stderr === n.stderr}`);
}
