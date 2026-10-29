/**
 * The Part 11 console is folded into Audit trail, and stays folded (D2,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-part11-console/).
 *
 * `part11-console` was a separate screen (surfaces/Part11Console.tsx) with two
 * functions: the live verdict of the audit_events chain, from GET
 * /api/part11/audit-trail/chain-integrity, and AnA reading both chains'
 * verdicts. Audit trail (AdminSurfaces.tsx AuditTrail) now carries both: the
 * second verdict in its chain banner and the audit_events verdict in its AnA
 * facts (surfaces/AuditEventChain.tsx; auditTrailEventChainVerdict.test.tsx).
 *
 * This pins the fold from both ends:
 *   - the old id resolves to Audit trail through an alias, from a URL, an in-app
 *     move or AnA's kept navigation target, with or without a project open;
 *   - Audit trail reads the route the console read, and the registry entry it is
 *     launch-scoped by claims that route;
 *   - the old screen is gone: no view, no registry entry (so ⌘K cannot list it),
 *     no component, no publisher of its own AnA context;
 *   - it is in no launch scope list and no rail, and no tour stops on it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { destinationFor, locationForSurface, surfaceIdFromLocation } from '../routing';
import { DEEP_LINK_ALIASES, SEGMENT_MODULES } from '../registryModel';
import { SURFACE_VIEWS } from '../surfaceViews';
import { AUDIT_EVENT_CHAIN_PATH } from '../surfaces/AuditEventChain';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { LAUNCH_MODULE_IDS, LAUNCH_SHELL_SURFACES, isLaunchSurface } from '@shared/constants/launch-scope';
import { findNavigationTarget } from '@shared/navigation';
import { DEMO_SCRIPTS } from '@shared/navigation/demo-scripts';

const ROOT = path.resolve(__dirname, '../../../../..');
const CLIENT = path.join(ROOT, 'client/src');
const SELF = path.resolve(__filename);
const RETIRED = 'part11-console';
const TARGET = 'audit-trail';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && full !== SELF) {
      out.push(full);
    }
  }
  return out;
}
/** The code of a file, without its comments: a note that a screen retired names it, and is not a use. */
const code = (f: string) =>
  fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const naming = (pattern: RegExp) =>
  sourceFiles(CLIENT).filter((f) => pattern.test(code(f))).map((f) => path.relative(ROOT, f));

describe('part11-console is folded into Audit trail', () => {
  it('resolves part11-console to Audit trail from a link, an in-app move and AnA, with or without a project open', () => {
    expect(DEEP_LINK_ALIASES[RETIRED]).toBe(TARGET);
    expect(surfaceIdFromLocation(locationForSurface(RETIRED))).toBe(TARGET);
    expect(surfaceIdFromLocation(`/concept2cure/${RETIRED}`)).toBe(TARGET);
    expect(destinationFor(RETIRED, true).surfaceId).toBe(TARGET);
    expect(destinationFor(RETIRED, false).surfaceId).toBe(TARGET);
    // AnA's handle is kept so an old conversation's move still lands.
    expect(findNavigationTarget(RETIRED)).toBeDefined();
  });

  it('lands on Audit trail, which reads the console\'s route under a registry claim that covers it', () => {
    expect(SURFACE_VIEWS[TARGET]).toBeDefined();
    expect(getSurface(TARGET)?.apiPrefixes.some((p) => AUDIT_EVENT_CHAIN_PATH.startsWith(p))).toBe(true);
    const admin = code(path.join(CLIENT, 'concept2cure/v2/surfaces/AdminSurfaces.tsx'));
    const auditTrail = admin.slice(admin.indexOf('export function AuditTrail'));
    expect(auditTrail).toMatch(/useAuditEventChain\(\)/);
    expect(auditTrail).toMatch(/<AuditEventChainBanner /);
    expect(auditTrail).toMatch(/auditEventChainForAna\(/);
  });

  it('keeps no screen of its own: no view, no registry entry for ⌘K, no component, no AnA publisher', () => {
    expect(SURFACE_VIEWS[RETIRED]).toBeUndefined();
    expect(getSurface(RETIRED)).toBeUndefined();
    expect(UI_SURFACES.some((s) => s.id === RETIRED)).toBe(false);
    expect(naming(/\bPart11Console\b/)).toEqual([]);
    expect(naming(/usePublishSurfaceContext\(\s*['"]part11-console['"]/)).toEqual([]);
    for (const gone of [
      'client/src/concept2cure/v2/surfaces/Part11Console.tsx',
      'client/src/concept2cure/v2/__tests__/part11Console.test.tsx',
      'client/src/concept2cure/v2/__tests__/part11ConsoleHonesty.test.tsx',
    ]) expect(fs.existsSync(path.join(ROOT, gone)), gone).toBe(false);
  });

  it('is in no launch scope list and no rail, and no tour stops on it; Audit trail stays never-switchable', () => {
    expect(Object.keys(LAUNCH_SHELL_SURFACES)).not.toContain(RETIRED);
    expect(isLaunchSurface(RETIRED)).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain(RETIRED);
    expect(LAUNCH_SHELL_SURFACES[TARGET]).toMatch(/never switchable/);
    const rail = Object.values(SEGMENT_MODULES).flatMap((groups) => groups.flatMap((g) => g.items));
    expect(rail).not.toContain(RETIRED);
    expect(rail).toContain(TARGET);
    const stops = DEMO_SCRIPTS.flatMap((d) => d.steps.flatMap((s) => (s.navigate ? [s.navigate.target] : [])));
    expect(stops).not.toContain(RETIRED);
    expect(stops).toContain(TARGET);
  });
});
