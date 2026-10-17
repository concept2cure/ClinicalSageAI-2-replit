/** The source-copy release graph must initialize in the plain Node runtime
 * that ships. Vitest's loader does not reproduce esbuild's cached async
 * module initializer cycle caused by CSR Builder's provider import. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- production build script has no declaration file
import { SERVER_BUILD_OPTIONS } from '../../../../scripts/build-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const OUT = path.join(ROOT, 'node_modules', '.cache', `workflow-production-import-${process.pid}.mjs`);
beforeAll(async () => {
  await build({
    ...SERVER_BUILD_OPTIONS,
    // Both services initialize concurrently during the real server's eager
    // bootstrap. A direct or sequential service entrypoint masks the cycle.
    stdin: {
      contents: "export async function coldWorkflowGraph() { return Promise.all([import('./server/services/authoring/authoring-export'), import('./server/services/authoring/workflow-import-governance')]); }",
      resolveDir: ROOT, sourcefile: 'workflow-cold-import-probe.ts', loader: 'ts',
    },
    outfile: OUT,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
}, 60_000);
afterAll(() => { fs.rmSync(OUT, { force: true }); });

it('cold-imports the actual production-built Authoring release graph without waiting for an AI client', () => {
  // No server is started and no drafting function is called. Database/provider
  // checks belong to the separate full production boot proof. These values
  // keep the cold-import fixture offline and contain no real credentials.
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/cold_import',
    APP_DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/cold_import',
    SKIP_DB_STARTUP_TEST: 'true', JWT_SECRET: 'synthetic-cold-import-only',
  };
  delete env.NODE_OPTIONS;
  const script = `const m=await import(${JSON.stringify(OUT)});const [render,governance]=await m.coldWorkflowGraph();` +
    'if(typeof governance.assertWorkflowImportRelease!=="function"||typeof render.sectionsDigest!=="function")throw new Error("Release guard missing");' +
    'process.stdout.write("WORKFLOW_IMPORT_READY\\n");process.exit(0);';
  const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, env, encoding: 'utf8', timeout: 8_000, killSignal: 'SIGKILL',
  });
  expect(stdout).toContain('WORKFLOW_IMPORT_READY');
}, 12_000);
