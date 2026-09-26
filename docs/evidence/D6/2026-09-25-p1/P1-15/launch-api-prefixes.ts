/**
 * Computes the API prefixes each launch app declares: UI_SURFACES[].apiPrefixes
 * (shared/constants/ui-surface-registry.ts) for the surfaces LAUNCH_APPS names
 * (shared/constants/launch-scope.ts), plus the shell set. This is the same
 * attribution ci:launch-scope-api enforces; the pen-test scope's §2.2 table is
 * this output with a mount citation per prefix. Run from the repository root:
 *   npx tsx docs/evidence/D6/2026-09-25-p1/P1-15/launch-api-prefixes.ts
 */
import { UI_SURFACES } from '../../../../../shared/constants/ui-surface-registry';
import { LAUNCH_APPS, LAUNCH_SHELL_SURFACES } from '../../../../../shared/constants/launch-scope';

const byId = new Map<string, { apiPrefixes?: readonly string[] | null }>();
for (const s of UI_SURFACES as ReadonlyArray<{ id: string; apiPrefixes?: readonly string[] | null }>) byId.set(s.id, s);

for (const app of LAUNCH_APPS) {
  const prefixes = new Set<string>();
  for (const sid of app.surfaces) for (const p of byId.get(sid)?.apiPrefixes ?? []) prefixes.add(p);
  process.stdout.write(`${app.id} (${app.label}): surfaces=${app.surfaces.join(',')}\n`);
  process.stdout.write('  ' + [...prefixes].sort().join(' ') + '\n');
}
const shell = new Set<string>();
for (const sid of Object.keys(LAUNCH_SHELL_SURFACES)) for (const p of byId.get(sid)?.apiPrefixes ?? []) shell.add(p);
process.stdout.write('shell: ' + [...shell].sort().join(' ') + '\n');
