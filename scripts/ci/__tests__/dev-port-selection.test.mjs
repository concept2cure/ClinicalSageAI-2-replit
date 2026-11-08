/** Keep the real Codespaces launch port while preserving ordinary local fallback. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../../..');
const startup = resolve(root, 'scripts/startup.sh');
const marker = 'C2C_PORT_SELECTION=';
const selection = `
# Source in Codespaces mode so an operator's .env files are never read.
source "$C2C_PORT_TEST_STARTUP"
case "$C2C_PORT_TEST_MODE" in
  c2c) export C2C_CODESPACE=1; unset CODESPACES ;;
  github) unset C2C_CODESPACE; export CODESPACES=true ;;
  local) unset C2C_CODESPACE CODESPACES ;;
  *) exit 91 ;;
esac
# The existing selector runs; main, the doctor and the database do not.
if select_app_port; then
  C2C_PORT_TEST_STATUS=0
else
  C2C_PORT_TEST_STATUS=$?
fi
printf '\\n${marker}%s:%s\\n' "$C2C_PORT_TEST_STATUS" "\${PORT:-unset}"
`;

async function closeListener(server) {
  if (!server.listening) return;
  await new Promise((done, fail) => server.close(error => error ? fail(error) : done()));
}

async function listen() {
  // A wide enough numeric range lets the existing local selector scan without
  // assuming that the immediately adjacent port is free.
  for (let attempt = 0; attempt < 8; attempt++) {
    const server = createServer(socket => socket.destroy());
    const ready = once(server, 'listening');
    server.listen(0, '127.0.0.1');
    await ready;
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    if (address.port <= 65_515) return { server, port: address.port };
    await closeListener(server);
  }
  throw new Error('Could not reserve an ephemeral listener below the local scan ceiling');
}

function select(port, mode) {
  const run = spawnSync('bash', ['-c', selection], {
    cwd: root,
    env: { ...process.env, C2C_CODESPACE: '1', CODESPACES: '', PORT: String(port),
      C2C_PORT_TEST_STARTUP: startup, C2C_PORT_TEST_MODE: mode },
    encoding: 'utf8', timeout: 8_000,
  });
  assert.ifError(run.error);
  assert.equal(run.signal, null, run.stdout + run.stderr);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.doesNotMatch(run.stdout, /Concept2Cure\.RI Database Startup Script/,
    'sourcing the selector must not launch main or its database preflight');
  const records = run.stdout.split('\n').filter(line => line.startsWith(marker));
  assert.equal(records.length, 1, run.stdout + run.stderr);
  const match = /^(\d+):(\d+)$/.exec(records[0].slice(marker.length));
  assert.ok(match, run.stdout + run.stderr);
  return { status: Number(match[1]), port: Number(match[2]), output: run.stdout + run.stderr };
}

for (const mode of ['c2c', 'github']) {
  const name = mode === 'c2c' ? 'C2C_CODESPACE=1' : 'CODESPACES=true';
  test(`${name} refuses a real occupied port and preserves the requested PORT`, { timeout: 15_000 }, async () => {
    const { server, port } = await listen();
    try {
      const result = select(port, mode);
      assert.notEqual(result.status, 0, result.output);
      assert.equal(result.port, port, result.output);
    } finally {
      await closeListener(server);
    }
  });

  test(`${name} keeps a free requested port`, { timeout: 15_000 }, async () => {
    const { server, port } = await listen();
    await closeListener(server);
    const result = select(port, mode);
    assert.equal(result.status, 0, result.output);
    assert.equal(result.port, port, result.output);
  });
}

test('ordinary local startup retains fallback from a real occupied port', { timeout: 15_000 }, async () => {
  const { server, port } = await listen();
  try {
    const result = select(port, 'local');
    assert.equal(result.status, 0, result.output);
    assert.ok(result.port > port && result.port < port + 20, result.output);
    assert.ok(result.port <= 65_535, result.output);
  } finally {
    await closeListener(server);
  }
});
