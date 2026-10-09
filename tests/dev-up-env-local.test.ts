/**
 * F-15: development runs the isolation posture production runs.
 *
 * `npm run up` provisions the non-superuser runtime role, and production
 * refuses to boot without RLS_ENFORCE=on. Development defaulted to
 * RLS_ENFORCE=off, "shadow" mode, which production never runs. In it the pool
 * sets no tenant variables and the vault.* policies admit nothing, so a tester
 * on `npm run up` + `npm run dev` could not upload to the Vault, while the same
 * upload passes under the production posture (VSR-001 §12.2 F-15; OQ-VAULT,
 * docs/evidence/W3/2026-09-23b/OQ-VAULT/). Decision (a): one posture everywhere.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { envLocalContents } from '../scripts/dev/env-local.mjs';
import { readEnvFiles } from '../scripts/validation/env-files.mjs';

const WRITTEN = envLocalContents({
  appUrl: 'postgresql://app_service:pw@127.0.0.1:5432/c2c',
  ownerUrl: 'postgresql://postgres:pw@127.0.0.1:5432/c2c',
  port: '5000',
});

describe('the environment `npm run up` writes', () => {
  it('enforces row-level security, as production does', () => {
    expect(WRITTEN).toMatch(/^RLS_ENFORCE=on$/m);
  });

  it('wins over a .env that still says off', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'up-env-'));
    try {
      fs.writeFileSync(path.join(dir, '.env.local'), WRITTEN);
      fs.writeFileSync(path.join(dir, '.env'), 'RLS_ENFORCE=off\nNODE_ENV=development\n');
      expect(readEnvFiles(dir).RLS_ENFORCE).toBe('on');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is the one up.mjs writes', () => {
    const up = fs.readFileSync(path.resolve(__dirname, '../scripts/dev/up.mjs'), 'utf8');
    expect(up).toMatch(/fs\.writeFileSync\('\.env\.local', envLocalContents\(/);
  });
});

describe('the development defaults', () => {
  it.each([
    ['scripts/setup-local-db.sh', /^RLS_ENFORCE=on$/m],
    ['.env.example', /^RLS_ENFORCE=on$/m],
  ])('%s sets RLS_ENFORCE=on', (file, pattern) => {
    const text = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    expect(text).toMatch(pattern);
    expect(text).not.toMatch(/^RLS_ENFORCE=off$/m);
  });
});
