/**
 * The password policy must work in the production bundle, not only in source.
 *
 * password-blocklist.ts located its list as
 * `join(dirname(fileURLToPath(import.meta.url)), '..', 'data', …)`. Unbundled
 * (tsx, vitest) that is server/data/common-passwords.txt. In production the
 * server is one esbuild bundle at /app/dist/index.js, so it read
 * /app/data/common-passwords.txt, which does not exist: readFileSync threw, and
 * with it validatePasswordPolicy — first-admin setup, sign-up, password reset
 * and password change all answered 500. Every unit suite stayed green because
 * they run the source, and the route tests mock the policy.
 *
 * So this builds the module with the production esbuild options into
 * <appRoot>/dist/, lays out <appRoot> as Dockerfile.optimized does (WORKDIR
 * /app, COPY dist, COPY server), and runs it in plain Node with cwd = appRoot.
 * The image half (the file is in the image) is ci:image-runtime-assets.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { SERVER_BUILD_OPTIONS } from '../../scripts/build-server.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');
const POLICY_SRC = path.join(REPO_ROOT, 'server/services/password-blocklist.ts');

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('password blocklist in the production bundle', () => {
  it('refuses a common password and admits an uncommon one (esbuild → <appRoot>/dist, node, cwd = appRoot)', async () => {
    const appRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-pwlist-')));
    tmpDirs.push(appRoot);
    fs.symlinkSync(path.join(REPO_ROOT, 'server'), path.join(appRoot, 'server'), 'dir');
    fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ type: 'module' }));

    const entry = path.join(appRoot, 'probe-entry.ts');
    fs.writeFileSync(
      entry,
      `import { isCommonPassword } from ${JSON.stringify(POLICY_SRC)};\n` +
        `process.stdout.write(JSON.stringify([isCommonPassword('Password123!'), isCommonPassword('vellum-otter-quarry-41')]));\n`,
    );
    const outfile = path.join(appRoot, 'dist', 'index.js');
    await build({
      ...SERVER_BUILD_OPTIONS,
      entryPoints: [entry],
      outfile,
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"' },
    });

    const run = spawnSync(process.execPath, [outfile], { cwd: appRoot, encoding: 'utf8' });
    expect({ status: run.status, stderr: run.status === 0 ? '' : run.stderr.split('\n').slice(0, 6).join('\n') })
      .toEqual({ status: 0, stderr: '' });
    expect(JSON.parse(run.stdout)).toEqual([true, false]);
  }, 60_000);
});
