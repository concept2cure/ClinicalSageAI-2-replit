/** Owned, synthetic, tmpfs PostgreSQL 16 on loopback; exact-container cleanup.
 * No host mounts, application endpoint or inherited DATABASE_URL is used. */
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (!process.version.startsWith('v22.')) throw new Error('Use supported Node 22.');
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const counterfactual = process.env.LIFECYCLE_OMIT_STORE_LOCK === '1';
const stateFile = path.join(folder, `${counterfactual ? 'lifecycle-counterfactual' : 'lifecycle'}-fixture-state.json`);
const name = `c2c-draft-lifecycle-${randomUUID().slice(0, 12)}`;
const dockerEnv = { ...process.env };
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
const docker = (...args) => execFileSync('docker', ['--host=unix:///var/run/docker.sock', ...args], {
  env: dockerEnv, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const state = { name, database: 'draft_source_lifecycle_fixture', ownerRole: 'lifecycle_fixture_applier',
  counterfactualOmittedStoreLock: counterfactual,
  host: '127.0.0.1', phase: 'starting', startedAt: new Date().toISOString(),
  limits: 'Synthetic local PostgreSQL fixture; ordinary runtime role and independently observed locks only. No deployed role, RLS, workload, provider or regulatory qualification claim.' };
const record = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
let started = false;
let child;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stopping = true; child?.kill('SIGTERM'); });
try {
  if (!fs.existsSync(path.join(folder, 'lifecycle-postgres.config.mts'))) throw new Error('Lifecycle PostgreSQL test config is missing.');
  state.dockerServerVersion = docker('version', '--format', '{{.Server.Version}}');
  state.image = JSON.parse(docker('image', 'inspect', 'postgres:16', '--format', '{{json .RepoDigests}}'));
  state.containerId = docker('run', '--detach', '--rm', '--pull=never', '--name', name,
    '--cpus=1', '--memory=512m', '--pids-limit=128', '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=384m',
    '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_USER=lifecycle_fixture_admin',
    '--env', 'POSTGRES_DB=draft_source_lifecycle_fixture', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust',
    'postgres:16', '-c', 'shared_buffers=64MB', '-c', 'max_connections=20');
  started = true;
  const published = docker('port', name, '5432/tcp');
  if (!/^127\.0\.0\.1:\d+$/.test(published)) throw new Error('Fixture must publish exclusively on loopback.');
  state.port = Number(published.split(':')[1]); record();
  const connection = { host: state.host, port: state.port, database: state.database, ssl: false,
    connectionTimeoutMillis: 1000, statement_timeout: 10_000 };
  let ready = false;
  for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
    const bootstrap = new pg.Client({ ...connection, user: 'lifecycle_fixture_admin' });
    const first = new pg.Client({ ...connection, user: state.ownerRole });
    const second = new pg.Client({ ...connection, user: 'app_service' });
    try {
      await bootstrap.connect();
      if (!(await bootstrap.query("SELECT 1 FROM pg_roles WHERE rolname='lifecycle_fixture_applier'")).rows.length) {
        await bootstrap.query('CREATE ROLE lifecycle_fixture_applier LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE');
      }
      if (!(await bootstrap.query("SELECT 1 FROM pg_roles WHERE rolname='app_service'")).rows.length) {
        await bootstrap.query('CREATE ROLE app_service LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE');
      }
      await bootstrap.query('ALTER DATABASE draft_source_lifecycle_fixture OWNER TO lifecycle_fixture_applier');
      await bootstrap.query('GRANT pg_monitor TO lifecycle_fixture_applier');
      await first.connect(); await second.connect();
      const identity = (await first.query(`SELECT version() AS version,current_database() AS database,current_user AS role,
        pg_backend_pid() AS pid,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`)).rows[0];
      const runtime = (await second.query(`SELECT current_user AS role,pg_backend_pid() AS pid,rolsuper,rolbypassrls,rolcreaterole
        FROM pg_roles WHERE rolname=current_user`)).rows[0];
      if (identity.database !== state.database || identity.role !== state.ownerRole || identity.pid === runtime.pid
          || identity.rolsuper || identity.rolbypassrls || runtime.role !== 'app_service'
          || runtime.rolsuper || runtime.rolbypassrls || runtime.rolcreaterole) throw new Error('Owned runtime identity check failed.');
      state.server = identity; state.runtime = runtime;
      state.observerGrant = 'Fixture-only pg_monitor; ordinary app_service executes the tests.';
      ready = true; break;
    } catch (error) { if (attempt === 29) throw error; }
    finally { await bootstrap.end().catch(() => undefined); await first.end().catch(() => undefined); await second.end().catch(() => undefined); }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready || stopping) throw new Error('Owned fixture readiness failed.');
  state.phase = 'ready'; record();
  console.info(JSON.stringify({ fixture: 'ready', name, port: state.port, version: state.server.version }));
  child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config',
    path.relative(root, path.join(folder, 'lifecycle-postgres.config.mts'))], {
    cwd: root, stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
  });
  const deadline = setTimeout(() => { state.stopReason = '3-minute fixture test deadline'; child.kill('SIGTERM'); }, 180_000);
  state.testExitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  clearTimeout(deadline); process.exitCode = state.testExitCode;
  state.stopReason ??= stopping ? 'signal' : 'test completion';
} catch (error) {
  state.phase = 'failed'; state.failure = error instanceof Error ? error.message : String(error); process.exitCode = 1;
} finally {
  if (started) {
    try { docker('rm', '--force', name); state.cleanup = 'exact owned container removed'; }
    catch (error) { state.cleanup = `failed: ${error instanceof Error ? error.message : String(error)}`; process.exitCode = 1; }
    try { docker('inspect', name); state.cleanupVerified = false; process.exitCode = 1; }
    catch { state.cleanupVerified = true; }
  }
  if (state.phase !== 'failed') state.phase = 'cleaned';
  state.finishedAt = new Date().toISOString(); record();
  console.info(JSON.stringify({ fixture: state.phase, name, testExitCode: state.testExitCode,
    cleanup: state.cleanup, cleanupVerified: state.cleanupVerified, failure: state.failure }));
}
