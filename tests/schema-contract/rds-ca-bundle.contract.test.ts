/**
 * The production image trusts the RDS certificate authority.
 *
 * Production verifies the database server certificate (server/db/ssl.ts:
 * `rejectUnauthorized: true`), and the Terraform-composed URLs carry
 * `sslmode=verify-full`. Node verifies against its built-in root store, and no
 * RDS certificate is in it: none of the 108 in AWS's published bundle matched a
 * Node root, by fingerprint or by subject, on 2026-09-24. The image set no
 * NODE_EXTRA_CA_CERTS, so a deployed task's first database connection would
 * have failed verification. That covers the API, and the migrate task too,
 * since it runs the same image.
 *
 * These checks prove the path from the Dockerfile to Node, not merely that a
 * file exists. The ENV names a file inside a directory the image copies, and
 * .dockerignore does not drop it. The bytes match the recorded checksum. A Node
 * process started with that exact setting loads every certificate as an extra
 * CA, including the production region's roots, and those roots are not
 * already among Node's bundled ones.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCKERFILE = fs.readFileSync(path.join(REPO_ROOT, 'Dockerfile.optimized'), 'utf8');

/** The image's WORKDIR is /app and the repo's assets/ is copied to /app/assets. */
function imagePathToRepoPath(p: string): string {
  expect(p.startsWith('/app/assets/'), `${p} must live under /app/assets`).toBe(true);
  return path.join(REPO_ROOT, p.slice('/app/'.length));
}

const envMatch = /^ENV\s+NODE_EXTRA_CA_CERTS=(\S+)\s*$/m.exec(DOCKERFILE);

describe('the image trusts the RDS certificate authority', () => {
  it('sets NODE_EXTRA_CA_CERTS in the production stage, after assets are copied in', () => {
    expect(envMatch, 'Dockerfile.optimized must set ENV NODE_EXTRA_CA_CERTS').not.toBeNull();
    const productionStage = DOCKERFILE.slice(DOCKERFILE.indexOf('AS production'));
    expect(productionStage).toContain('COPY --from=builder /app/assets ./assets');
    expect(productionStage.indexOf('NODE_EXTRA_CA_CERTS')).toBeGreaterThan(
      productionStage.indexOf('COPY --from=builder /app/assets ./assets'),
    );
  });

  it('names a committed file that .dockerignore does not drop', () => {
    const repoPath = imagePathToRepoPath(envMatch![1]);
    expect(fs.existsSync(repoPath), `${repoPath} must be committed`).toBe(true);
    const ignore = fs.existsSync(path.join(REPO_ROOT, '.dockerignore'))
      ? fs.readFileSync(path.join(REPO_ROOT, '.dockerignore'), 'utf8')
      : '';
    const rules = ignore.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    // Coarse on purpose: any rule that could reach a .pem or this directory.
    const reaching = rules.filter((r) => /\.pem|rds-ca|^\*$|^assets\/?\*?$|^assets\/\*\*/.test(r) && !r.startsWith('!'));
    expect(reaching, `.dockerignore rules that could drop the bundle: ${reaching.join(', ')}`).toEqual([]);
  });

  // existsSync above passes on a working tree that holds an UNTRACKED file. That
  // is how 63fbf452f shipped: .gitignore's `*.pem` silently dropped the bundle,
  // the test passed where the file had been fetched, and trunk named a file
  // that no checkout contains. Ask git, which is what the image build copies.
  it('is tracked by git, not merely present in this working tree', () => {
    const rel = path.relative(REPO_ROOT, imagePathToRepoPath(envMatch![1]));
    expect(() =>
      execFileSync('git', ['ls-files', '--error-unmatch', rel], { cwd: REPO_ROOT, stdio: 'pipe' }),
    ).not.toThrow();
  });

  // libpq (psql, pg_dump in the image) does not read NODE_EXTRA_CA_CERTS; with
  // sslmode=verify-full it needs a root file of its own.
  it('points PGSSLROOTCERT at the same bundle, for libpq', () => {
    const pg = /^ENV\s+PGSSLROOTCERT=(\S+)\s*$/m.exec(DOCKERFILE);
    expect(pg, 'Dockerfile.optimized must set ENV PGSSLROOTCERT').not.toBeNull();
    expect(pg![1]).toBe(envMatch![1]);
  });

  it('matches the SHA-256 recorded in checksums.txt', () => {
    const repoPath = imagePathToRepoPath(envMatch![1]);
    const manifest = fs.readFileSync(path.join(path.dirname(repoPath), 'checksums.txt'), 'utf8');
    const line = manifest.split('\n').find((l) => l.endsWith(`  ${path.basename(repoPath)}`));
    expect(line, 'checksums.txt must record the bundle').toBeDefined();
    const actual = crypto.createHash('sha256').update(fs.readFileSync(repoPath)).digest('hex');
    expect(actual).toBe(line!.split('  ')[0]);
  });

  it('is loaded by Node as extra CAs, and supplies roots Node does not already have', () => {
    const repoPath = imagePathToRepoPath(envMatch![1]);
    const pem = fs.readFileSync(repoPath, 'utf8');
    const certs = (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map(
      (p) => new crypto.X509Certificate(p),
    );
    expect(certs.length).toBeGreaterThan(0);
    for (const c of certs) expect(c.subject).toMatch(/Amazon RDS/);

    // Production runs in us-east-1 (terraform/environments/production/variables.tf).
    const usEast1Roots = certs.filter((c) => /CN=Amazon RDS us-east-1 Root CA/.test(c.subject));
    expect(usEast1Roots.length).toBeGreaterThan(0);

    // A fresh Node process with the image's exact setting. getCACertificates
    // ('extra') is what NODE_EXTRA_CA_CERTS added; ('bundled') is Node's own.
    const probe = execFileSync(
      process.execPath,
      [
        '-e',
        `const tls=require('tls'),c=require('crypto');` +
          `const fp=s=>new c.X509Certificate(s).fingerprint256;` +
          `process.stdout.write(JSON.stringify({extra:tls.getCACertificates('extra').map(fp),bundled:tls.getCACertificates('bundled').map(fp)}))`,
      ],
      { env: { ...process.env, NODE_EXTRA_CA_CERTS: repoPath }, encoding: 'utf8' },
    );
    const { extra, bundled } = JSON.parse(probe) as { extra: string[]; bundled: string[] };
    expect(extra.length).toBe(certs.length);
    for (const root of usEast1Roots) {
      expect(extra, `${root.subject} loaded as an extra CA`).toContain(root.fingerprint256);
      expect(bundled, `${root.subject} is not already a Node root`).not.toContain(root.fingerprint256);
    }
  });
});
