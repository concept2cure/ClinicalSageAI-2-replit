/**
 * Setup is folded into Admin and access, and stays folded (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-setup/).
 *
 * `setup` was a separate admin screen (AdminSurfaces.tsx Setup). Every function
 * it had now lives on admin-console: the organisation's name and client type
 * under a reason (OrganizationProfileCard.tsx), the gateway, session, PDF/A,
 * retention and legal-hold cards (AdminSettings.tsx, on the Settings tab), the
 * Identity console door (the SSO tab), and AnA's summary of the configuration
 * (admin-console's context; adminConsoleSettings.test.tsx).
 *
 * This pins the fold from both ends:
 *   - the old id resolves to admin-console's Settings tab through an alias, from
 *     a URL or an in-app move (ComplianceReports, OnboardingSecurity and the
 *     locked-feature notice still say `setup`), with or without a project open;
 *   - admin-console mounts the settings Setup held, and its registry entry claims
 *     the routes those cards call that no shared claim covers;
 *   - the old screen is gone: no view, no registry entry (so ⌘K cannot list it),
 *     no component, no publisher of its own AnA context;
 *   - it is in no launch scope list and no rail, no CI list names it, and no tour
 *     stops on it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { destinationFor, locationForSurface, surfaceIdFromLocation } from '../routing';
import { ALIAS_APPLIES, DEEP_LINK_ALIASES, NAV_GROUP_OF, NAV_HIDDEN, SEGMENT_MODULES } from '../registryModel';
import { SURFACE_VIEWS } from '../surfaceViews';
import { RETENTION_PERIOD_PATH } from '../surfaces/RetentionPeriodCard';
import { LEGAL_HOLDS_PATH } from '../surfaces/LegalHoldsCard';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { LAUNCH_MODULE_IDS, LAUNCH_SHELL_SURFACES, isLaunchSurface } from '@shared/constants/launch-scope';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { DEMO_SCRIPTS } from '@shared/navigation/demo-scripts';

const ROOT = path.resolve(__dirname, '../../../../..');
const CLIENT = path.join(ROOT, 'client/src');
const SELF = path.resolve(__filename);
const RETIRED = 'setup';
const TARGET = 'admin-console';
const SETTINGS = { actionId: 'admin-console.open-tab', params: { tab: 'settings' } };

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

describe('setup is folded into Admin and access', () => {
  it('resolves setup to admin-console’s Settings tab from a link and an in-app move, with or without a project open', () => {
    expect(DEEP_LINK_ALIASES[RETIRED]).toBe(TARGET);
    expect(ALIAS_APPLIES[RETIRED]).toEqual(SETTINGS);
    expect(surfaceIdFromLocation(locationForSurface(RETIRED))).toBe(TARGET);
    expect(surfaceIdFromLocation(`/concept2cure/${RETIRED}`)).toBe(TARGET);
    for (const projectOpen of [true, false]) {
      expect(destinationFor(RETIRED, projectOpen)).toEqual({ surfaceId: TARGET, applies: SETTINGS });
    }
    // The action the alias asks for exists on admin-console and names the tab.
    expect(resolveSurfaceAction(SETTINGS.actionId, SETTINGS.params).ok).toBe(true);
  });

  it('lands on admin-console, which mounts the settings Setup held and claims the routes they call', () => {
    expect(SURFACE_VIEWS[TARGET]).toBeDefined();
    const access = code(path.join(CLIENT, 'concept2cure/v2/surfaces/AdminAccess.tsx'));
    expect(access).toMatch(/<AdminSettingsTab\b/);
    expect(access).toMatch(/<IdentityConsoleDoor\b/);
    const settings = code(path.join(CLIENT, 'concept2cure/v2/surfaces/AdminSettings.tsx'));
    for (const card of ['OrganizationProfileCard', 'SessionPolicySetting', 'GatewayAccountsSetting', 'PdfARequirementSetting', 'RetentionPeriodCard', 'LegalHoldsCard']) {
      expect(settings, card).toMatch(new RegExp(`<${card}\\b`));
    }
    const claims = getSurface(TARGET)?.apiPrefixes ?? [];
    // The retention route was claimed by setup alone; the hold routes by setup and the Vault.
    for (const route of [RETENTION_PERIOD_PATH, LEGAL_HOLDS_PATH]) {
      expect(claims.some((p) => route === p || route.startsWith(`${p}/`)), route).toBe(true);
    }
    expect(claims).toContain(RETENTION_PERIOD_PATH);
  });

  it('keeps no screen of its own: no view, no registry entry for ⌘K, no component, no AnA publisher', () => {
    expect(SURFACE_VIEWS[RETIRED]).toBeUndefined();
    expect(getSurface(RETIRED)).toBeUndefined();
    expect(UI_SURFACES.some((s) => s.id === RETIRED)).toBe(false);
    expect(naming(/export function Setup\b|\bm\.Setup\b|default: m\.Setup/)).toEqual([]);
    expect(naming(/usePublishSurfaceContext\(\s*['"]setup['"]/)).toEqual([]);
  });

  it('is in no launch scope list, rail or CI list, and no tour stops on it; admin-console stays a shell surface', () => {
    expect(Object.keys(LAUNCH_SHELL_SURFACES)).not.toContain(RETIRED);
    expect(isLaunchSurface(RETIRED)).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain(RETIRED);
    expect(LAUNCH_SHELL_SURFACES[TARGET]).toBeDefined();
    expect(NAV_GROUP_OF[RETIRED]).toBeUndefined();
    expect(NAV_HIDDEN.has(RETIRED)).toBe(false);
    const rail = Object.values(SEGMENT_MODULES).flatMap((groups) => groups.flatMap((g) => g.items));
    expect(rail).not.toContain(RETIRED);
    const stops = DEMO_SCRIPTS.flatMap((d) => d.steps.flatMap((s) => (s.navigate ? [s.navigate.target] : [])));
    expect(stops).not.toContain(RETIRED);
    const discoverability = fs.readFileSync(path.join(ROOT, 'scripts/ci/check-surface-discoverability.mjs'), 'utf8');
    expect(discoverability).not.toMatch(/^\s*setup:/m);
  });
});
