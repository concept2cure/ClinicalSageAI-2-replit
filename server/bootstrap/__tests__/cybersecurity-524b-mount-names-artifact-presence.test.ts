/**
 * The §524B module mounts under a name that says what it reports: SBOM
 * completeness and artifact presence, not readiness.
 *
 * Until 2026-10-15 the mount was named "Premarket Cybersecurity (FDA §524B SBOM +
 * readiness)", printed at every boot, while the §524B engine and its route
 * (routes/cybersecurity-524b.ts) report which §524B artifacts are recorded
 * present: presence is not readiness. Read as source, like the other bootstrap
 * guards, because importing the registrar loads every route module it mounts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'server', 'bootstrap', 'register-advanced-platform-routes.ts'),
  'utf8',
);
const entry = /\{\s*path:\s*'\/api\/cybersecurity-524b',[^}]*?name:\s*'([^']+)'/.exec(source);

describe('the /api/cybersecurity-524b mount', () => {
  it('is named for SBOM completeness and §524B artifact presence', () => {
    expect(entry, 'no /api/cybersecurity-524b mount entry').not.toBeNull();
    expect(entry![1]).toBe('Premarket Cybersecurity (FDA §524B SBOM + artifact presence)');
    expect(entry![1]).not.toMatch(/readiness/i);
  });
});
