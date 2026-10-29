/**
 * The Artifacts center and the device vault are folded into the Vault, and stay
 * folded (D2, fold F3, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f3-vault/).
 *
 * `artifacts-center` was the organization-wide gallery of governed artifacts
 * (AdminSurfaces.tsx ArtifactsCenter over GET /api/artifacts-center).
 * `device-vault` was the device kit's vault (mdx/surfaces/VaultSurface.tsx over
 * GET /api/mdx/vault). The Vault (surfaces/Vault.tsx) carries both: each
 * project's "Governed artifacts" branch with its versions, audit report, governed
 * DOCX and manifest (slices A and B), and the organization view of the projects
 * the caller can open, with AnA's focus by name or artifact id (slice C).
 *
 * This pins the fold from both ends:
 *   - each old id resolves to the Vault through an alias, from a URL, an in-app
 *     move or AnA's kept navigation target, with or without a project open;
 *   - the old screens are gone: no view, no registry entry (so ⌘K cannot list
 *     them), no kit id, no client import of ArtifactsCenter, VaultSurface,
 *     useVault or the kit's vault data, and no server route for /api/mdx/vault;
 *   - neither is in a launch scope list or a rail, no tour stops on either, and
 *     AnA's gallery action is gone while vault.focus-document takes its place,
 *     including the Live Drive hand-off.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { destinationFor, locationForSurface, surfaceIdFromLocation } from '../routing';
import { DEEP_LINK_ALIASES, SEGMENT_MODULES } from '../registryModel';
import { SURFACE_VIEWS } from '../surfaceViews';
import { MDX_SURFACE_IDS } from '../../mdx/surfaceIds';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { LAUNCH_APPS, LAUNCH_MODULE_IDS } from '@shared/constants/launch-scope';
import { MDX_PROJECT_FEATURE_SURFACE_IDS } from '@shared/constants/mdx-project-features';
import { findNavigationTarget } from '@shared/navigation';
import { DEMO_SCRIPTS } from '@shared/navigation/demo-scripts';
import { resolveSurfaceAction, surfaceActionIds } from '@shared/navigation/surface-actions';

const ROOT = path.resolve(__dirname, '../../../../..');
const CLIENT = path.join(ROOT, 'client/src');
const SELF = path.resolve(__filename);
const RETIRED = ['artifacts-center', 'device-vault'] as const;

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

describe('artifacts-center and device-vault are folded into the Vault', () => {
  it.each(RETIRED)('resolves %s to the Vault from a link, an in-app move and AnA, with or without a project open', (id) => {
    expect(DEEP_LINK_ALIASES[id]).toBe('vault');
    expect(surfaceIdFromLocation(locationForSurface(id))).toBe('vault');
    expect(surfaceIdFromLocation(`/concept2cure/${id}`)).toBe('vault');
    expect(destinationFor(id, true).surfaceId).toBe('vault');
    expect(destinationFor(id, false).surfaceId).toBe('vault');
    // AnA's handle is kept so an old conversation's move still lands.
    expect(findNavigationTarget(id)).toBeDefined();
  });

  it('lands on the Vault, which the shell can mount', () => {
    expect(SURFACE_VIEWS.vault).toBeDefined();
    expect(getSurface('vault')).toBeDefined();
    const views = fs.readFileSync(path.join(CLIENT, 'concept2cure/v2/surfaceViews.ts'), 'utf8');
    expect(views).toMatch(/^\s*vault: \{ component: Vault/m);
  });

  it.each(RETIRED)('%s keeps no screen of its own: no view, no registry entry for ⌘K, no kit id', (id) => {
    expect(SURFACE_VIEWS[id]).toBeUndefined();
    expect(getSurface(id)).toBeUndefined();
    expect(UI_SURFACES.some((s) => s.id === id)).toBe(false);
    expect(MDX_SURFACE_IDS as readonly string[]).not.toContain(id);
  });

  it('leaves no client code naming the retired screens, their hook or the kit’s vault data', () => {
    expect(naming(/\bArtifactsCenter\b/)).toEqual([]);
    expect(naming(/\bVaultSurface\b/)).toEqual([]);
    expect(naming(/from ['"][^'"]*hooks\/useVault['"]/)).toEqual([]);
    expect(naming(/from ['"][^'"]*mdx\/data\/vault['"]|from ['"]\.\.?\/(\.\.\/)?data\/vault['"]/)).toEqual([]);
    for (const gone of [
      'client/src/concept2cure/mdx/surfaces/VaultSurface.tsx',
      'client/src/concept2cure/mdx/hooks/useVault.ts',
      'client/src/concept2cure/mdx/data/vault.ts',
      'server/routes/mdx-vault.ts',
    ]) expect(fs.existsSync(path.join(ROOT, gone)), gone).toBe(false);
  });

  it('serves no /api/mdx/vault route and no screen calls one', () => {
    const inline = code(path.join(ROOT, 'server/bootstrap/register-inline-routes.ts'));
    expect(inline).not.toMatch(/mdx-vault|\/api\/mdx\/vault/);
    expect(naming(/\/api\/mdx\/vault/)).toEqual([]);
  });

  it('is in no launch scope list and no rail, and no tour stops on either', () => {
    const vaultApp = LAUNCH_APPS.find((a) => a.id === 'vault')!;
    const projects = LAUNCH_APPS.find((a) => a.id === 'projects')!;
    for (const id of RETIRED) {
      expect(vaultApp.surfaces).not.toContain(id);
      expect(vaultApp.modules).not.toContain(id);
      expect(projects.surfaces).not.toContain(id);
      expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain(id);
      expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[]).not.toContain(id);
    }
    expect(vaultApp.surfaces).toContain('vault');
    expect(vaultApp.modules).toContain('vault');
    const rail = Object.values(SEGMENT_MODULES).flatMap((groups) => groups.flatMap((g) => g.items));
    for (const id of RETIRED) expect(rail).not.toContain(id);
    const stops = DEMO_SCRIPTS.flatMap((d) => d.steps.flatMap((s) => (s.navigate ? [s.navigate.target] : [])));
    for (const id of RETIRED) expect(stops).not.toContain(id);
  });

  it('gives AnA the Vault’s focus in place of the gallery’s, and the Live Drive hand-off rides it', () => {
    expect(surfaceActionIds()).not.toContain('artifacts-center.focus-artifact');
    const byId = resolveSurfaceAction('vault.focus-document', { artifactId: 'artifact_1' });
    expect(byId.ok && byId.directive.surfaceId).toBe('vault');
    const app = fs.readFileSync(path.join(CLIENT, 'concept2cure/v2/V2App.tsx'), 'utf8');
    expect(app).toMatch(/resolveSurfaceAction\('vault\.focus-document', \{ artifactId \}\)/);
    expect(app).not.toMatch(/'artifacts-center'/);
  });
});
