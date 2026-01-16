#!/usr/bin/env node
/*
 * Dev Guardian - automated caretaker for local development.
 * Cleans up common issues (ports, missing columns) before launching dev server.
 */

import 'dotenv/config';
import killPort from 'kill-port';
import postgres from 'postgres';
import { spawn } from 'child_process';

const DEV_PORT = parseInt(process.env.PORT || '5000', 10);
const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_DEV || '';

const shellOption = process.platform === 'win32';

const log = (tag, message) => console.log(`${tag} ${message}`);

async function ensurePortFree(port) {
  try {
    await killPort(port);
    log('[cleanup]', `Freed port ${port}`);
  } catch (error) {
    if (error && /No process running/.test(error.message)) {
      log('[ok]', `Port ${port} already free`);
    } else {
      log('[warn]', `Could not verify port ${port}: ${error.message}`);
    }
failed



















  }
}

async function ensureDatabaseShape() {

  if (!connectionString) {
    log('[info]', 'No DATABASE_URL found; skipping database healing');
    return;
  }

  log('[db]', 'Verifying organizations table columns (slug/domain)');

  const sql = postgres(connectionString, {
    ssl:
      connectionString.includes('neon.tech') || process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  });

  try {
    const columns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organizations'
    `;

    const columnSet = new Set(columns.map(col => col.column_name));
    const missingColumns = [];

    if (!columnSet.has('slug')) missingColumns.push('slug');
    if (!columnSet.has('domain')) missingColumns.push('domain');

    if (missingColumns.length === 0) {
      log('[ok]', 'organizations table already has slug/domain columns');
    } else {
      for (const column of missingColumns) {
        if (column === 'slug') {
          log('[db]', 'Adding slug column to organizations table');
          await sql`
            ALTER TABLE organizations
            ADD COLUMN IF NOT EXISTS slug text
          `;
        }
        if (column === 'domain') {
          log('[db]', 'Adding domain column to organizations table');
          await sql`
            ALTER TABLE organizations
            ADD COLUMN IF NOT EXISTS domain text
          `;
        }
      }
    }

    // Populate and normalize slug values to avoid null/duplicate issues
    const rowsNeedingSlug = await sql`
      SELECT id, name, slug
      FROM organizations
      WHERE slug IS NULL OR slug = ''
    `;

    for (const row of rowsNeedingSlug) {
      const baseSlug = (row.name || `tenant-${row.id}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || `tenant-${row.id}`;

      const targetSlug = `${baseSlug}-${row.id}`;
      await sql`
        UPDATE organizations
        SET slug = ${targetSlug}
        WHERE id = ${row.id}
      `;
    }

    // Ensure uniqueness by re-suffixing duplicates
    const duplicateSlugs = await sql`
      SELECT slug, array_agg(id) AS ids
      FROM organizations
      WHERE slug IS NOT NULL
      GROUP BY slug
      HAVING COUNT(*) > 1
    `;

    for (const duplicate of duplicateSlugs) {
      const ids = duplicate.ids.slice(1); // keep first entry as-is
      for (const id of ids) {
        const uniqueSlug = `${duplicate.slug}-${id}`;
        await sql`
          UPDATE organizations
          SET slug = ${uniqueSlug}
          WHERE id = ${id}
        `;
      }
    }

    // Align with schema expectations
    await sql`
      UPDATE organizations
      SET slug = CONCAT('tenant-', id)
      WHERE slug IS NULL OR slug = ''
    `;
    await sql`
      ALTER TABLE organizations
      ALTER COLUMN slug SET NOT NULL
    `;
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'organizations_slug_unique'
        ) THEN
          ALTER TABLE organizations
          ADD CONSTRAINT organizations_slug_unique UNIQUE (slug);
        END IF;
      END
      $$;
    `;

    log('[ok]', 'organizations.slug column normalized and constrained');
  } catch (error) {
    log('[warn]', `Database healing skipped: ${error.message}`);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

async function runCommand(name, command, args, { allowFailure = false } = {}) {
  log('[run]', `${name}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: shellOption });

    child.on('exit', code => {
      if (code === 0) {
        log('[ok]', `${name} completed`);
        resolve(true);
      } else if (allowFailure) {
        log('[warn]', `${name} exited with code ${code} (continuing)`);
        resolve(false);
      } else {
        reject(new Error(`${name} failed with code ${code}`));
      }
    });
  });
}

async function launchDevServer() {
  log('[start]', 'Starting dev server (press Ctrl+C to stop)');
  const child = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: shellOption });

  child.on('exit', code => {
    log(code === 0 ? '[ok]' : '[error]', `Dev server exited with code ${code}`);
    process.exit(code ?? 1);
  });

  // Passive health watcher
  const maxAttempts = 10;
  let attempt = 0;

  const checkHealth = async () => {
    if (attempt >= maxAttempts) {
      log('[warn]', `Health check timeout after ${maxAttempts} attempts`);
      return;
    }

    try {
      const response = await fetch(`http://127.0.0.1:${DEV_PORT}/health`);
      if (response.ok) {
        log('[health]', `Dev server healthy at http://127.0.0.1:${DEV_PORT}`);
        return;
      }
    } catch (error) {
      // Ignore until server is up
    }

    attempt += 1;
    setTimeout(checkHealth, 2000);
  };

  setTimeout(checkHealth, 4000);
}

async function main() {
  try {
    log('[info]', 'Dev Guardian initializing');

    await ensurePortFree(DEV_PORT);
    await ensureDatabaseShape();

    const installArgs = ['install', '--no-audit', '--no-fund'];
    await runCommand('Install dependencies', 'npm', installArgs, { allowFailure: true });

    await runCommand('Drizzle schema sync', 'npm', ['run', 'db:push'], { allowFailure: true });

    await launchDevServer();
  } catch (error) {
    log('[error]', error.message);
    process.exit(1);
  }
}

main();

