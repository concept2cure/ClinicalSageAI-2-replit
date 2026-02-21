#!/usr/bin/env node
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import { Pool } from 'pg';

const logger = console;

const DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  logger.error('TEST_DATABASE_URL or DATABASE_URL is required for E2E smoke tests');
  process.exit(2);
}

let server = null;

async function waitForReady(timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const r = await fetch('http://localhost:5000/healthz');
      if (r.ok) return true;
    } catch (e) {
      // ignore
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function loginAndGetToken() {
  const email = process.env.SMOKE_EMAIL || 'jm.smith@concept2cure.pro';
  const password = process.env.SMOKE_PASSWORD || 'Concept2Cure2026!';

  const response = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const payload = await response.json();
  const token = payload?.accessToken || payload?.token;

  if (!response.ok || !token) {
    throw new Error(`Failed login for smoke test user: ${response.status}`);
  }

  return token;
}

(async () => {
  let ready = await waitForReady(4000);
  let startedServer = false;

  if (!ready) {
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
    logger.error('Server did not become ready in time');
    if (server) server.kill('SIGTERM');
    process.exit(3);
  }

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
  const startJson = await startRes.json();
  if (!startJson?.data?.docId) {
    logger.error('Start did not return docId', startJson);
    if (server) server.kill('SIGTERM');
    process.exit(4);
  }
  const docId = startJson.data.docId;
  logger.info('Created doc', docId);

  // Step 2: edit
  await fetch('http://localhost:5000/api/test-assembly/edit', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ docId, content: 'smoke human edit' }),
  });

  // Step 3: polish
  const polishRes = await fetch('http://localhost:5000/api/test-assembly/polish', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ docId, instruction: 'smoke polish' }),
  });
  const polishJson = await polishRes.json();
  if (!polishJson?.data?.content || !polishJson.data.content.includes('AI added: smoke polish')) {
    logger.error('Polish did not add expected content', polishJson);
    if (server) server.kill('SIGTERM');
    process.exit(5);
  }

  // Verify DB directly
  const pool = new Pool({ connectionString: DB_URL });
  const r = await pool.query('SELECT content FROM assembly_docs WHERE id = $1', [docId]);
  if (!r.rows || !r.rows[0] || !r.rows[0].content.includes('AI added: smoke polish')) {
    logger.error('DB verification failed', r.rows);
    await pool.end();
    if (server) server.kill('SIGTERM');
    process.exit(6);
  }
  await pool.end();

  logger.info('E2E smoke succeeded');
  if (startedServer && server) {
    server.kill('SIGTERM');
  }
  process.exit(0);
})();
