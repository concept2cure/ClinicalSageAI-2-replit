/**
 * Launch scope for AnA — which tools and platform commands serve only apps
 * outside the release.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * docs/LAUNCH_DEFINITION_OF_DONE.md row D2: every surface outside the launch
 * catalog is behind a flag that is off in production. The API enforces that
 * since 2026-09-25 (services/entitlements/launch-scope-api.ts), but AnA calls
 * services in-process, so the API gate never sees her. Until 2026-09-26 a
 * signed-in user in production could have AnA create an IACUC protocol, record
 * a grant award, run an RBM assessment or write a 510(k) section: apps the
 * product hides.
 *
 * ── The classification ───────────────────────────────────────────────────────
 * ana-launch-scope.inventory.json lists every tool and platform command,
 * classified on 2026-09-26 by reading its handler and what it touches
 * (docs/evidence/D2-API-SCOPE/2026-09-26-ana-tools/):
 *   - `hiddenApp`: reads or writes records of surfaces outside the launch
 *     catalog only (named per entry), or drives such a surface's workflow.
 *   - `inScope`: operates a launch surface, or touches no tenant records at
 *     all (guidance, literature, public databases, deterministic calculators
 *     over the input). Those are AnA's own knowledge, not a hidden app.
 * A tool that touches both a launch and a hidden surface is `inScope`, the same
 * rule the API applies to a prefix two surfaces claim.
 *
 * A new tool or command appears in neither list, and ana-launch-scope.test.ts
 * fails until someone classifies it. Nothing is assumed in scope by default.
 *
 * PURE. No I/O; the caller decides whether launch scope is enforced.
 */

import { LAUNCH_SURFACE_IDS } from '../../../shared/constants/launch-scope';
import inventory from './ana-launch-scope.inventory.json';

interface HiddenGroup {
  surfaces: string[];
  names: string[];
}

function index(groups: HiddenGroup[]): ReadonlyMap<string, readonly string[]> {
  const m = new Map<string, readonly string[]>();
  for (const g of groups) for (const n of g.names) m.set(n, g.surfaces);
  return m;
}

/** Tool name → the hidden surfaces it serves. */
export const HIDDEN_APP_TOOLS = index(inventory.tools.hiddenApp);
/** Platform command name → the hidden surfaces it serves. */
export const HIDDEN_APP_COMMANDS = index(inventory.commands.hiddenApp);
/** Everything classified, so a test can refuse an unclassified newcomer. */
export const CLASSIFIED_TOOLS: ReadonlySet<string> = new Set([...HIDDEN_APP_TOOLS.keys(), ...inventory.tools.inScope]);
export const CLASSIFIED_COMMANDS: ReadonlySet<string> = new Set([...HIDDEN_APP_COMMANDS.keys(), ...inventory.commands.inScope]);

/**
 * True unless the name serves hidden surfaces only. The surface check is
 * repeated here (not trusted from the inventory) so that promoting a surface
 * into the launch catalog brings its tools back without editing the inventory.
 */
export function anaCapabilityInLaunchScope(
  name: string,
  hidden: ReadonlyMap<string, readonly string[]>,
  launchSurfaceIds: ReadonlySet<string> = LAUNCH_SURFACE_IDS,
): boolean {
  const surfaces = hidden.get(name);
  if (!surfaces) return true;
  return surfaces.some((id) => launchSurfaceIds.has(id));
}

/** The toolset without tools that serve only hidden surfaces. */
export function withoutHiddenAppTools<T extends { name: string }>(tools: T[]): T[] {
  return tools.filter((t) => anaCapabilityInLaunchScope(t.name, HIDDEN_APP_TOOLS));
}
