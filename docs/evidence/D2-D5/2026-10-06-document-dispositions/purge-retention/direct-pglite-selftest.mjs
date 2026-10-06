/**
 * Run the real purge-coverage selftest cases through direct embedded SQL when
 * this host refuses Unix socket listeners. This does not qualify native pg
 * connectivity: its unavailable-server case is explicitly excluded.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(process.argv[2] ?? process.cwd());
const original = path.join(repoRoot, 'scripts/ci/check-purge-coverage.selftest.mjs');
const require = createRequire(path.join(repoRoot, 'package.json'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-direct-'));
const adapter = path.join(temp, 'pg-direct.mjs');
const runner = path.join(temp, 'selftest.mjs');
const pgliteUrl = pathToFileURL(require.resolve('@electric-sql/pglite')).href;

try {
  fs.writeFileSync(adapter, `import fs from 'node:fs';
import pglite from ${JSON.stringify(pgliteUrl)};
const { PGlite } = pglite;
class Client {
  async connect() {
    this.db = new PGlite();
    await this.db.waitReady;
    const ddl = fs.readFileSync(process.env.C2C_PURGE_SELFTEST_DDL, 'utf8');
    if (ddl) await this.db.exec(ddl);
  }
  async query(sql, params) { return this.db.query(sql, params); }
  async end() { await this.db.close(); }
}
export default { Client };
`);
  let source = fs.readFileSync(original, 'utf8');
  source = source.replace('const SELF = fileURLToPath(import.meta.url);', `const SELF = ${JSON.stringify(original)};`);
  source = source.replace("import { PGlite } from '@electric-sql/pglite';", '');
  const pgReplacement = "return `import pg from ${JSON.stringify(import.meta.resolve('pg'))};`;";
  assert.ok(source.includes(pgReplacement), 'native selftest import seam changed');
  source = source.replace(pgReplacement, `return ${JSON.stringify(`import pg from ${JSON.stringify(pathToFileURL(adapter).href)};`)};`);
  const start = source.indexOf('const db = new PGlite();');
  const end = source.indexOf('// ── Fixtures', start);
  assert.ok(start >= 0 && end > start, 'native selftest transport seam changed');
  source = source.slice(0, start) + `
const sockDir = path.join(base, 'unused-socket');
const noServerDir = path.join(base, 'unreachable');
const dbUrl = dir => 'postgresql://postgres@localhost/postgres?host=' + encodeURIComponent(dir) + '&sslmode=disable';
const DB_URL = dbUrl(sockDir);
const chain = Promise.resolve();
const server = { close: callback => callback() };
const db = { close: async () => undefined };
process.env.C2C_PURGE_SELFTEST_DDL = path.join(base, 'fixture.sql');
async function resetDatabase(ddl) {
  fs.writeFileSync(process.env.C2C_PURGE_SELFTEST_DDL, ddl);
}

` + source.slice(end);
  source = source.replace('const cases = [', 'let cases = [');
  const runMarker = '// ── Run ─';
  assert.ok(source.includes(runMarker), 'native selftest execution seam changed');
  source = source.replace(runMarker, `
cases = cases.filter(c => !c.name.includes('when the database cannot be reached'));
console.info('DIRECT PGLITE: original gate SQL/parser/baseline and fixture cases; native connection-failure case excluded.');
${runMarker}`);
  fs.writeFileSync(runner, source);
  execFileSync(process.execPath, [runner], { cwd: repoRoot, env: process.env, stdio: 'inherit' });
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
