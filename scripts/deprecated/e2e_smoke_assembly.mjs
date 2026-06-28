#!/usr/bin/env node
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import { Pool } from 'pg';

const logger = console;
const HEALTH_URL = 'http://localhost:5000/healthz';
const EXIT_CODES = {
  MISSING_DB_URL: 2,
  SERVER_NOT_READY: 3,
  FLOW_START_FAILED: 4,
  FLOW_POLISH_FAILED: 5,
  DB_VERIFY_FAILED: 6,
  AUTH_FAILED: 7,
  UNEXPECTED: 8,
};

const DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  logger.error(
    [
      'E2E smoke preflight failed: missing database URL.',
      'Required: set TEST_DATABASE_URL (preferred) or DATABASE_URL.',
      'Example: export TEST_DATABASE_URL="postgresql://user:pass@host:5432/dbname"',
      'Optional preflight: export DATABASE_URL="postgresql://..." && npm run db:check-assembly',
    ].join('\n')
  );
  process.exit(EXIT_CODES.MISSING_DB_URL);
}

let server = null;

async function waitForReady(timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const r = await fetch(HEALTH_URL);
      if (r.ok) return true;
    } catch (e) {
      // ignore
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function loginAndGetToken() {
  const email = process.env.SMOKE_EMAIL || 'jm.smith@concept2cure.pro';
  const password = process.env.SMOKE_PASSWORD || 'Concept2Cure2026!';

  const response = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const payload = await readJsonSafe(response);
  const token = payload?.accessToken || payload?.token;

  if (!response.ok || !token) {
    throw new Error(
      `Failed login for smoke test user: status=${response.status}; ` +
      `email=${email}; payloadType=${payload ? typeof payload : 'null'}`
    );
  }

  return token;
}

(async () => {
  function cleanup() {
    if (server) server.kill('SIGTERM');
  }

  function fail(message, exitCode, details) {
    if (details !== undefined) {
      logger.error(message, details);
    } else {
      logger.error(message);
    }
    cleanup();
    process.exit(exitCode);
  }

  let ready = await waitForReady(4000);
  let startedServer = false;

  if (!ready) {
    const using = process.env.TEST_DATABASE_URL ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
    logger.info(`No ready server detected. Starting local dev server with ${using}.`);
    server = spawn('npm', ['run', 'dev'], {
      env: { ...process.env, DATABASE_URL: DB_URL },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    startedServer = true;

    server.stdout.on('data', d => process.stdout.write(`[server] ${d}`));
    server.stderr.on('data', d => process.stderr.write(`[server] ${d}`));

    ready = await waitForReady();
  }

  if (!ready) {
    fail(
      [
        `Server did not become ready in time at ${HEALTH_URL}.`,
        'Hints:',
        '- Confirm localhost:5000 is reachable and not occupied by another process.',
        '- Check [server] logs above for startup, DB, or migration errors.',
        '- Run npm run dev manually to inspect boot-time failures.',
      ].join('\n'),
      EXIT_CODES.SERVER_NOT_READY
    );
  }

  try {
    logger.info('Server ready — running smoke flow');

    const token = await loginAndGetToken();
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // Step 1: start
    const startRes = await fetch('http://localhost:5000/api/test-assembly/start', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ request: 'smoke test document' }),
    });
    const startJson = await readJsonSafe(startRes);
    if (!startRes.ok || !startJson?.data?.docId) {
      fail('Start did not return a valid docId', EXIT_CODES.FLOW_START_FAILED, {
        status: startRes.status,
        body: startJson,
      });
    }
    const docId = startJson.data.docId;
    logger.info('Created doc', docId);

    // Step 2: edit
    const editRes = await fetch('http://localhost:5000/api/test-assembly/edit', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ docId, content: 'smoke human edit' }),
    });
    const editJson = await readJsonSafe(editRes);
    if (!editRes.ok) {
      fail('Edit step failed', EXIT_CODES.FLOW_START_FAILED, {
        status: editRes.status,
        body: editJson,
      });
    }

    // Step 3: polish
    const polishRes = await fetch('http://localhost:5000/api/test-assembly/polish', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ docId, instruction: 'smoke polish' }),
    });
    const polishJson = await readJsonSafe(polishRes);
    if (
      !polishRes.ok ||
      !polishJson?.data?.content ||
      !polishJson.data.content.includes('AI added: smoke polish')
    ) {
      fail('Polish did not add expected content', EXIT_CODES.FLOW_POLISH_FAILED, {
        status: polishRes.status,
        body: polishJson,
      });
    }

    // Verify DB directly
    const pool = new Pool({ connectionString: DB_URL });
    const r = await pool.query('SELECT content FROM assembly_docs WHERE id = $1', [docId]);
    if (!r.rows || !r.rows[0] || !r.rows[0].content.includes('AI added: smoke polish')) {
      await pool.end();
      fail('DB verification failed', EXIT_CODES.DB_VERIFY_FAILED, r.rows);
    }
    await pool.end();

    logger.info('E2E smoke succeeded');
    if (startedServer && server) {
      server.kill('SIGTERM');
    }
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Failed login for smoke test user')) {
      fail(
        [
          `${message}`,
          'Hint: set SMOKE_EMAIL/SMOKE_PASSWORD for a valid test account.',
        ].join('\n'),
        EXIT_CODES.AUTH_FAILED
      );
    }

    fail(`Unexpected smoke failure: ${message}`, EXIT_CODES.UNEXPECTED);
  }
})();
