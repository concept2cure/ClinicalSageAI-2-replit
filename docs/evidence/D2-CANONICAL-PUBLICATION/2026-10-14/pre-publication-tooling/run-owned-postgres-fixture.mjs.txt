/** New synthetic, loopback-only durable-receipt PostgreSQL. Runs the tests before finally removing
 * exactly its owned container. No application mounts or external DB endpoint. */
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (!process.version.startsWith('v22.')) throw new Error('Use supported Node 22.');
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const stateFile = path.join(folder, 'durable-fixture-state.json');
const name = `c2c-durable-receipts-${randomUUID().slice(0, 12)}`;
const dockerEnv = { ...process.env };
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
const docker = (...args) => execFileSync('docker', ['--host=unix:///var/run/docker.sock', ...args], {
  env: dockerEnv, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const state = { name, database: 'ana_durable_receipt_fixture', ownerRole: 'durable_fixture_applier',
  host: '127.0.0.1', phase: 'starting', startedAt: new Date().toISOString(),
  limitations: 'Synthetic local fixture; deployed database roles, workload and regulatory qualification are not established.' };
const record = () => fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
let started = false;
let child;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  stopping = true;
  child?.kill('SIGTERM');
});
try {
  if (!fs.existsSync(path.join(folder, 'durable-postgres.config.mts'))) throw new Error('Independent PostgreSQL test config is missing.');
  state.dockerServerVersion = docker('version', '--format', '{{.Server.Version}}');
  state.image = JSON.parse(docker('image', 'inspect', 'postgres:16', '--format', '{{json .RepoDigests}}'));
  state.containerId = docker('run', '--detach', '--rm', '--pull=never', '--name', name,
    '--cpus=1', '--memory=512m', '--pids-limit=128',
    '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=384m',
    '--publish', '127.0.0.1::5432',
    '--env', 'POSTGRES_USER=durable_fixture_admin', '--env', 'POSTGRES_DB=ana_durable_receipt_fixture',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust',
    'postgres:16', '-c', 'shared_buffers=64MB', '-c', 'max_connections=30');
  started = true;
  const published = docker('port', name, '5432/tcp');
  if (!/^127\.0\.0\.1:\d+$/.test(published)) throw new Error('Fixture must publish exclusively on loopback.');
  state.port = Number(published.split(':')[1]);
  record();
  const connection = { host: state.host, port: state.port, database: state.database, user: state.ownerRole,
    ssl: false, connectionTimeoutMillis: 1000, statement_timeout: 10000 };
  let ready = false;
  for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
    const bootstrap = new pg.Client({ ...connection, user: 'durable_fixture_admin' });
    const first = new pg.Client(connection);
    const second = new pg.Client(connection);
    try {
      await bootstrap.connect();
      const roles = await bootstrap.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='durable_fixture_applier'");
      if (roles.rows.length === 0) await bootstrap.query('CREATE ROLE durable_fixture_applier LOGIN NOSUPERUSER NOBYPASSRLS CREATEROLE');
      await bootstrap.query('ALTER DATABASE ana_durable_receipt_fixture OWNER TO durable_fixture_applier');
      await bootstrap.query('GRANT pg_monitor TO durable_fixture_applier');
      state.observerGrant = 'fixture-only pg_monitor for independently observed backend blocking; no superuser/BYPASSRLS';
      if ((await bootstrap.query("SELECT 1 FROM pg_roles WHERE rolname='app_service'")).rows.length === 0) {
        await bootstrap.query('CREATE ROLE app_service LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE');
      }
      state.runtimeRole = { name: 'app_service', attributes: 'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE' };
      state.applierRole = { name: 'durable_fixture_applier', attributes: 'LOGIN NOSUPERUSER NOBYPASSRLS CREATEROLE', use: 'fixture-only schema installation; runtime uses app_service' };
      state.bootstrapRole = { name: 'durable_fixture_admin', use: 'isolated fixture setup only; not test runtime' };
      await first.connect(); await second.connect();
      let identity = (await first.query(`SELECT version() AS version,current_database() AS database,
        current_user AS role,pg_backend_pid() AS pid,r.rolsuper,r.rolbypassrls
        FROM pg_roles r WHERE rolname=current_user`)).rows[0];
      const other = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0];
      if (identity.pid === other.pid || identity.database !== state.database || identity.role !== state.ownerRole) throw new Error('Independent fixture identity failed.');
      if (identity.rolsuper || identity.rolbypassrls) throw new Error('Fixture role must have neither superuser nor BYPASSRLS.');
      state.server = identity; state.independentBackendPids = [identity.pid, other.pid]; ready = true; break;
    } catch (error) { if (attempt === 29) throw error; }
    finally { await bootstrap.end().catch(() => undefined); await first.end().catch(() => undefined); await second.end().catch(() => undefined); }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready || stopping) throw new Error('Fixture readiness failed.');
  state.phase = 'ready'; record();
  console.log(JSON.stringify({ fixture: 'ready', name, port: state.port, version: state.server.version }));
  child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config',
    path.relative(root, path.join(folder, 'durable-postgres.config.mts'))], {
    cwd: root, stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
  });
  const timeout = setTimeout(() => { state.stopReason = '10-minute test deadline'; child.kill('SIGTERM'); }, 10 * 60 * 1000);
  state.testExitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  clearTimeout(timeout);
  process.exitCode = state.testExitCode;
  state.stopReason ??= stopping ? 'signal' : 'test completion';
} catch (error) {
  state.phase = 'failed'; state.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  if (started) {
    try { docker('rm', '--force', name); state.cleanup = 'exact owned container removed'; }
    catch (error) { state.cleanup = `failed: ${error instanceof Error ? error.message : String(error)}`; process.exitCode = 1; }
    try { docker('inspect', name); state.cleanupVerified = false; process.exitCode = 1; }
    catch { state.cleanupVerified = true; }
  }
  if (state.phase !== 'failed') state.phase = 'cleaned';
  state.finishedAt = new Date().toISOString(); record();
  console.log(JSON.stringify({ fixture: state.phase, name, testExitCode: state.testExitCode,
    cleanup: state.cleanup, cleanupVerified: state.cleanupVerified, failure: state.failure }));
}
