/**
 * The production image carries the official FDA form PDFs.
 *
 * The IND form renderer fills the vendored FDA editions (1571, 1572, 3454,
 * 356h, 3674) from `<package root>/templates/forms/acroforms`
 * (server/services/ind-forms/template-locations.ts), each with a SHA-256
 * manifest the fill service checks before it trusts the file. Dockerfile.optimized's
 * production stage copied `assets/` but never `templates/`, so in the deployed
 * image every read missed: 1571 and 3674 were drawn as reconstructions, the
 * rest went out as labeled drafts, and the genuine FDA-secured 1571 a sponsor
 * placed was refused as LEAF-ENCRYPTED when the sequence was packaged. No test
 * saw it, because every test runs from a checkout that has the folder
 * (docs/evidence/W2/2026-09-24-multi-task/audit-findings.md, blocker;
 * docs/evidence/D1/2026-10-01-production-blockers/).
 *
 * These checks prove the path from the Dockerfile to the resolver: the stage
 * copies the folder to where the resolver looks inside the image, git tracks
 * every file in it, and .dockerignore drops none of them.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PACKAGE_ROOT, indFormTemplatesDir } from '../../server/services/ind-forms/template-locations';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCKERFILE = fs.readFileSync(path.join(REPO_ROOT, 'Dockerfile.optimized'), 'utf8');
const PRODUCTION_STAGE = DOCKERFILE.slice(DOCKERFILE.indexOf('AS production'));
const IMAGE_ROOT = '/app';

/** The folder, relative to the package root, the resolver reads without an override. */
function templatesRelativeToPackageRoot(): string {
  const saved = process.env.IND_FORM_TEMPLATES_DIR;
  delete process.env.IND_FORM_TEMPLATES_DIR;
  try {
    return path.relative(PACKAGE_ROOT, indFormTemplatesDir());
  } finally {
    if (saved !== undefined) process.env.IND_FORM_TEMPLATES_DIR = saved;
  }
}

/** Each `COPY [--from=…] <src> <dest>` of the production stage, dest resolved against WORKDIR. */
function productionCopies(): Array<{ from: string | null; src: string; dest: string }> {
  const workdir = /^WORKDIR\s+(\S+)\s*$/m.exec(PRODUCTION_STAGE)?.[1] ?? '/';
  const out: Array<{ from: string | null; src: string; dest: string }> = [];
  for (const m of PRODUCTION_STAGE.matchAll(/^COPY\s+(?:--from=(\S+)\s+)?(\S+)\s+(\S+)\s*$/gm)) {
    out.push({ from: m[1] ?? null, src: m[2], dest: path.posix.resolve(workdir, m[3]) });
  }
  return out;
}

describe('the image carries the official FDA form templates', () => {
  it('runs the server from /app, with its package.json there, so the resolver lands on /app', () => {
    expect(PRODUCTION_STAGE).toMatch(/^WORKDIR \/app\s*$/m);
    expect(PRODUCTION_STAGE).toMatch(/^COPY package\*\.json \.npmrc \.\/\s*$/m);
    // PACKAGE_ROOT is the nearest package.json above the module; in a checkout
    // that is the repository root, and in the image it is /app.
    expect(PACKAGE_ROOT).toBe(REPO_ROOT);
  });

  it('copies the folder the resolver reads to the same place inside the image', () => {
    const rel = templatesRelativeToPackageRoot();
    expect(rel).toBe(path.join('templates', 'forms', 'acroforms'));
    const wanted = path.posix.join(IMAGE_ROOT, rel.split(path.sep).join('/'));
    const copy = productionCopies().find((c) => c.dest === wanted);
    expect(copy, `the production stage must COPY ${rel} to ${wanted}`).toBeDefined();
    // From the builder's full checkout (COPY . .), at the same relative path.
    expect(copy!.from).toBe('builder');
    expect(copy!.src).toBe(path.posix.join(IMAGE_ROOT, rel.split(path.sep).join('/')));
  });

  it('ships every vendored form with its manifest, all tracked by git', () => {
    const dir = path.join(REPO_ROOT, 'templates', 'forms', 'acroforms');
    const pdfs = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf'));
    expect(pdfs.length).toBeGreaterThanOrEqual(5);
    const tracked = new Set(
      execFileSync('git', ['ls-files', 'templates/forms/acroforms'], { cwd: REPO_ROOT, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .map((f) => path.basename(f)),
    );
    for (const pdf of pdfs) {
      expect(tracked.has(pdf), `${pdf} must be tracked`).toBe(true);
      expect(tracked.has(`${pdf}.manifest.json`), `${pdf}.manifest.json must be tracked`).toBe(true);
    }
  });

  it('is not dropped by .dockerignore', () => {
    const ignore = fs.readFileSync(path.join(REPO_ROOT, '.dockerignore'), 'utf8');
    const rules = ignore
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
    // Coarse on purpose: any rule that could reach these files or their folder.
    const reaching = rules.filter((r) => /\.pdf|\.json|templates|forms|acroforms|^\*$|^\*\*/.test(r));
    expect(reaching, `.dockerignore rules that could drop the templates: ${reaching.join(', ')}`).toEqual([]);
  });
});
