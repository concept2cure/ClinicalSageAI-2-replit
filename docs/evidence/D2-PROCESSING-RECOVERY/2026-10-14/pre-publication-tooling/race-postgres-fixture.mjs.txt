/** Authorized, synthetic local PostgreSQL fixture; owns exactly one container.
 * No application/config/client-data mounts, .env writes, installs, or deploy.
 * The stop file, SIGINT/SIGTERM, or 20-minute deadline all reach finally cleanup.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const evidenceDir = fileURLToPath(new URL('.', import.meta.url));
const stateFile = `${evidenceDir}race-fixture-state.json`;
const stopFile = `${evidenceDir}race-fixture-stop`;
const name = `c2c-d2-race-${randomUUID().slice(0, 12)}`;
const dockerEnv = { ...process.env };
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
const docker = (...args) => execFileSync('docker', ['--host=unix:///var/run/docker.sock', ...args], {
  env: dockerEnv, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const state = { name, database: 'd2_processing_fixture', ownerRole: 'd2_fixture_owner',
  host: '127.0.0.1', phase: 'starting', startedAt: new Date().toISOString(),
  limitations: 'Synthetic local owner fixture; no deployment, workload, OCR/provider, or deployed-role qualification.' };
const record = () => fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
let started = false;
let stopping = false;
const deadline = Date.now() + 20 * 60 * 1000;
process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });
fs.rmSync(stopFile, { force: true });

try {
  state.dockerServerVersion = docker('version', '--format', '{{.Server.Version}}');
  state.image = JSON.parse(docker('image', 'inspect', 'postgres:16', '--format', '{{json .RepoDigests}}'));
  state.containerId = docker('run', '--detach', '--rm', '--pull=never', '--name', name,
    '--cpus=1', '--memory=512m', '--pids-limit=128',
    '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=384m',
    '--publish', '127.0.0.1::5432',
    '--env', 'POSTGRES_USER=d2_fixture_owner', '--env', 'POSTGRES_DB=d2_processing_fixture',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust',
    'postgres:16', '-c', 'shared_buffers=64MB', '-c', 'max_connections=30');
  started = true;
  const published = docker('port', name, '5432/tcp');
  if (!/^127\.0\.0\.1:\d+$/.test(published)) throw new Error('Fixture did not publish exclusively on loopback.');
  state.port = Number(published.split(':')[1]);
  record();
  const connection = { host: state.host, port: state.port, database: state.database, user: state.ownerRole,
    ssl: false, connectionTimeoutMillis: 1000, statement_timeout: 10000 };
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const a = new pg.Client(connection);
    const b = new pg.Client(connection);
    try {
      await a.connect(); await b.connect();
      const first = (await a.query(`SELECT version() AS version, current_database() AS database,
        current_user AS role, pg_backend_pid() AS pid, r.rolsuper, r.rolbypassrls
        FROM pg_roles r WHERE rolname=current_user`)).rows[0];
      const second = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0];
      if (first.pid === second.pid || first.database !== state.database || first.role !== state.ownerRole) {
        throw new Error('Fixture session identity was not independently established.');
      }
      state.server = first;
      state.independentBackendPids = [first.pid, second.pid];
      ready = true;
      break;
    } catch (error) {
      if (attempt === 29) throw error;
    } finally {
      await a.end().catch(() => undefined); await b.end().catch(() => undefined);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Fixture readiness deadline exceeded.');
  state.phase = 'ready'; record();
  console.log(JSON.stringify({ fixture: 'ready', ...state }));
  while (!stopping && !fs.existsSync(stopFile) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  state.stopReason = stopping ? 'signal' : fs.existsSync(stopFile) ? 'owned stop file' : '20-minute deadline';
} catch (error) {
  state.phase = 'failed'; state.failure = error instanceof Error ? error.message : String(error);
  record(); console.error(JSON.stringify({ fixture: 'failed', reason: state.failure }));
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
  console.log(JSON.stringify({ fixture: state.phase, name, cleanup: state.cleanup, cleanupVerified: state.cleanupVerified }));
}
