import { spawn } from 'node:child_process';
import process from 'node:process';

const DEFAULT_BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: false, ...options });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function waitForServer(baseUrl, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(baseUrl, { method: 'GET' });
      if (res.ok || res.status < 500) return;
    } catch {
      // retry
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for dev server at ${baseUrl}`);
}

function startDevServer() {
  const env = {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/concept2cure-ri?sslmode=disable',
    SKIP_DB_STARTUP_TEST: process.env.SKIP_DB_STARTUP_TEST || 'true',
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || '5000',
    SESSION_SECRET: process.env.SESSION_SECRET || 'dev-session-secret',
    JWT_SECRET: process.env.JWT_SECRET || 'dev-jwt-secret-32-char-minimum-value',
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'dev-refresh-token-secret-32-char-min',
    CONCEPT2CURE_SIGNER_MODE: process.env.CONCEPT2CURE_SIGNER_MODE || 'dev',
  };

  const child = spawn('npx', ['tsx', 'server/index.ts'], {
    stdio: 'inherit',
    env,
  });

  return child;
}

async function main() {
  await run('node', ['scripts/seed-beta-510k-workspace.mjs']);

  const server = startDevServer();
  let closed = false;
  server.on('close', () => {
    closed = true;
  });

  try {
    await waitForServer(DEFAULT_BASE_URL);
    await run('npx', ['playwright', 'test', 'tests/e2e/510k-founder-path.e2e.spec.ts'], {
      env: {
        ...process.env,
        BASE_URL: DEFAULT_BASE_URL,
      },
    });
  } catch (error) {
    console.error(
      'Founder proof failed. Ensure Playwright is installed: npm i -D @playwright/test && npx playwright install'
    );
    throw error;
  } finally {
    if (!closed) {
      server.kill('SIGTERM');
    }
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
