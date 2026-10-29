/**
 * AnA memory is folded into the conversation, and stays folded (D2,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-ana-memory/).
 *
 * `ana-memory` was a separate screen (surfaces/AnaMemory.tsx), already outside
 * the launch shell. Two of its functions were real: how AnA is tuned to the
 * person, and the "Things I got wrong" ledger. The conversation carries both in
 * "What AnA remembers" (WhatAnaRemembers.tsx, opened from its header;
 * whatAnaRemembers.test.tsx, conversationRemembers.test.tsx), with the
 * project-scoped profile the screen never read. The rest (memory atoms, filters,
 * verify, supersede, superseded rows, the thread list and pin) was not real
 * today and is not carried, so its routes went with the screen.
 *
 * This pins the fold from both ends:
 *   - the old id resolves to the conversation through an alias, from a URL or an
 *     in-app move, with or without a project open;
 *   - the conversation mounts the panel for the project its turns carry, and the
 *     panel reads the one route the conversation's registry entry claims;
 *   - the old screen is gone: no view, no registry entry (so ⌘K cannot list it),
 *     no deferred-inventory row, no component;
 *   - its router serves the profile read and nothing else, and no surface claims
 *     the retired paths;
 *   - it is in no launch scope list and no rail, and no tour stops on it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { destinationFor, locationForSurface, surfaceIdFromLocation } from '../routing';
import { DEEP_LINK_ALIASES, SEGMENT_MODULES } from '../registryModel';
import { SURFACE_VIEWS } from '../surfaceViews';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { DEFERRED_CAPABILITY_INVENTORY } from '@shared/constants/deferred-capability-inventory';
import { LAUNCH_MODULE_IDS, LAUNCH_SHELL_SURFACES, isLaunchSurface } from '@shared/constants/launch-scope';
import { findNavigationTarget } from '@shared/navigation';
import { DEMO_SCRIPTS } from '@shared/navigation/demo-scripts';

const ROOT = path.resolve(__dirname, '../../../../..');
const CLIENT = path.join(ROOT, 'client/src');
const SELF = path.resolve(__filename);
const RETIRED = 'ana-memory';
const TARGET = 'conversation-thread';
const PROFILE = '/api/mdx/ana/memory/profile';

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

describe('ana-memory is folded into the conversation', () => {
  it('resolves ana-memory to the conversation from a link and an in-app move, with or without a project open', () => {
    expect(DEEP_LINK_ALIASES[RETIRED]).toBe(TARGET);
    expect(surfaceIdFromLocation(locationForSurface(RETIRED))).toBe(TARGET);
    expect(surfaceIdFromLocation(`/concept2cure/${RETIRED}`)).toBe(TARGET);
    expect(destinationFor(RETIRED, true).surfaceId).toBe(TARGET);
    expect(destinationFor(RETIRED, false).surfaceId).toBe(TARGET);
    // AnA never had a navigation target for it, and is given none.
    expect(findNavigationTarget(RETIRED)).toBeUndefined();
  });

  it('lands on the conversation, which mounts What AnA remembers for its own project, read under its own claim', () => {
    expect(SURFACE_VIEWS[TARGET]).toBeDefined();
    expect(getSurface(TARGET)?.apiPrefixes).toContain(PROFILE);
    const thread = code(path.join(CLIENT, 'concept2cure/v2/surfaces/ConversationThread.tsx'));
    expect(thread).toMatch(/<WhatAnaRemembers projectRef=\{shellProjectId\} /);
    expect(thread).toMatch(/projectId: shellProjectId,/);
    expect(code(path.join(CLIENT, 'concept2cure/v2/WhatAnaRemembers.tsx'))).toContain(`'${PROFILE}'`);
  });

  it('keeps no screen of its own: no view, no registry entry for ⌘K, no inventory row, no component', () => {
    expect(SURFACE_VIEWS[RETIRED]).toBeUndefined();
    expect(getSurface(RETIRED)).toBeUndefined();
    expect(UI_SURFACES.some((s) => s.id === RETIRED)).toBe(false);
    expect(DEFERRED_CAPABILITY_INVENTORY.some((e) => e.surfaceId === RETIRED)).toBe(false);
    expect(naming(/\bAnaMemory\b/)).toEqual([]);
    for (const gone of [
      'client/src/concept2cure/v2/surfaces/AnaMemory.tsx',
      'client/src/concept2cure/v2/__tests__/anaMemoryNoFixtures.test.tsx',
      'client/src/concept2cure/v2/__tests__/anaMemoryPlainLanguage.test.tsx',
    ]) expect(fs.existsSync(path.join(ROOT, gone)), gone).toBe(false);
  });

  it('serves the profile read and nothing else of the retired screen, and no surface claims its paths', () => {
    const router = code(path.join(ROOT, 'server/routes/mdx-ana-memory.ts'));
    const routes = [...router.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(routes).toEqual(['get /ana/memory/profile']);
    const claims = UI_SURFACES.flatMap((s) => s.apiPrefixes ?? []);
    expect(claims).not.toContain('/api/mdx/ana/memory');
    expect(claims).not.toContain('/api/mdx/ana/threads');
  });

  it('is in no launch scope list and no rail, and no tour stops on it', () => {
    expect(Object.keys(LAUNCH_SHELL_SURFACES)).not.toContain(RETIRED);
    expect(isLaunchSurface(RETIRED)).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain(RETIRED);
    const rail = Object.values(SEGMENT_MODULES).flatMap((groups) => groups.flatMap((g) => g.items));
    expect(rail).not.toContain(RETIRED);
    const stops = DEMO_SCRIPTS.flatMap((d) => d.steps.flatMap((s) => (s.navigate ? [s.navigate.target] : [])));
    expect(stops).not.toContain(RETIRED);
  });
});
