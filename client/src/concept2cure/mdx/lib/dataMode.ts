/**
 * Data-mode contract — every MDX surface declares whether it reads live
 * data, fixtures, or both, and that declaration is observable at runtime.
 *
 * Why:
 *   1. CI can fail when a surface stays on fixtures past its scheduled
 *      wire-up date (`expectedLiveBy` field).
 *   2. The dev persona switcher can show a banner per surface when it's
 *      rendering fixtures, so demos never accidentally pass off mock
 *      data as real.
 *   3. When backend services are unreachable (shadow service down, 503
 *      from predicate-intelligence), surfaces can transparently fall back
 *      to fixtures while flagging the mode to the user.
 *
 * Usage in a surface:
 *
 *   const mode = useDataMode('k510');         // 'live' | 'fixture' | 'both'
 *   const liveQuery = useK510Predicates(programId);
 *   if (mode === 'fixture') return <K510WithFixtures />;
 *   if (liveQuery.isError && mode === 'both') return <K510WithFixtures />;
 *   return <K510Live data={liveQuery.data}/>;
 *
 * The default mode is governed by an env var so demo deployments can
 * force fixtures globally without code changes:
 *
 *   VITE_MDX_DATA_MODE=live      // production default once GA stable
 *   VITE_MDX_DATA_MODE=fixture   // demos / offline
 *   VITE_MDX_DATA_MODE=both      // try live, fall back to fixture (default)
 *
 * Per-surface override:
 *
 *   VITE_MDX_DATA_MODE_K510=live
 *   VITE_MDX_DATA_MODE_CER=fixture
 */

export type DataMode = 'live' | 'fixture' | 'both';

export interface SurfaceRegistration {
  /** Stable id, e.g. 'k510', 'cer-conformity', 'pre-sub'. Used for the
   *  per-surface env override and the persona-switch banner. */
  id: string;
  /** Human label for the dev banner. */
  label: string;
  /** Today's mode default if no env override is set. */
  defaultMode: DataMode;
  /** ISO date string of the GA-plan target to be live-only. CI alerts
   *  when current date passes this and the surface is still in fixture or
   *  both mode. */
  expectedLiveBy?: string;
}

/** Registry of every MDX surface and its data-mode commitment. Update
 *  this when porting a new kit or wiring an existing one to live data. */
export const MDX_SURFACE_REGISTRY: SurfaceRegistration[] = [
  { id: 'overview',         label: 'Overview',                defaultMode: 'fixture',                            },
  { id: 'project-home',     label: 'Project home',            defaultMode: 'both',     expectedLiveBy: '2026-08-01' },
  { id: 'k510',             label: '510(k) workstream',       defaultMode: 'fixture',  expectedLiveBy: '2026-07-01' },
  { id: 'pma',              label: 'PMA workstream',          defaultMode: 'fixture',  expectedLiveBy: '2026-08-15' },
  { id: 'cer',              label: 'CER (basic)',             defaultMode: 'fixture',  expectedLiveBy: '2026-08-15' },
  { id: 'cer-conformity',   label: 'CER · GSPR conformity',   defaultMode: 'fixture',  expectedLiveBy: '2026-08-15' },
  { id: 'cer-equivalence',  label: 'CER · Equivalence',       defaultMode: 'fixture',  /* design gap — see HANDOFF.md */ },
  { id: 'cer-pms',          label: 'CER · PMS / PMCF',        defaultMode: 'fixture',  expectedLiveBy: '2026-09-01' },
  { id: 'predicate',        label: 'Predicate intelligence',  defaultMode: 'fixture',  expectedLiveBy: '2026-07-15' },
  { id: 'pre-sub',          label: 'Pre-Sub manager',         defaultMode: 'fixture',  /* backend gap — Q-Sub schema needed */ },
  { id: 'estar-editor',     label: 'eSTAR editor',            defaultMode: 'fixture',  expectedLiveBy: '2026-07-15' },
  { id: 'pma-editor',       label: 'PMA editor',              defaultMode: 'fixture',  expectedLiveBy: '2026-08-15' },
  { id: 'cer-editor',       label: 'CER section editor',      defaultMode: 'fixture',  expectedLiveBy: '2026-08-15' },
  { id: 'tasks',            label: 'Tasks and reviews',       defaultMode: 'fixture',                            },
  { id: 'vault',            label: 'Document vault',          defaultMode: 'fixture',                            },
  { id: 'validation',       label: 'Validation center',       defaultMode: 'fixture',                            },
  { id: 'submissions',      label: 'Submission center',       defaultMode: 'fixture',                            },
  { id: 'templates',        label: 'Templates',               defaultMode: 'fixture',                            },
];

const REGISTRY_BY_ID: Record<string, SurfaceRegistration> = MDX_SURFACE_REGISTRY.reduce(
  (acc, r) => Object.assign(acc, { [r.id]: r }),
  {} as Record<string, SurfaceRegistration>,
);

/** Resolve the runtime data mode for a surface. Per-surface env override
 *  beats the global env override beats the registry default. */
export function getDataMode(surfaceId: string): DataMode {
  const reg = REGISTRY_BY_ID[surfaceId];
  const override = readEnv(`VITE_MDX_DATA_MODE_${surfaceId.toUpperCase().replace(/-/g, '_')}`);
  if (override && isMode(override)) return override;
  const global = readEnv('VITE_MDX_DATA_MODE');
  if (global && isMode(global)) return global;
  return reg?.defaultMode ?? 'fixture';
}

/** Hook variant — same resolution but stable across renders. Suitable
 *  for use in component bodies. */
import { useMemo } from 'react';
export function useDataMode(surfaceId: string): DataMode {
  return useMemo(() => getDataMode(surfaceId), [surfaceId]);
}

/** True when the surface is rendering fixture data and should display
 *  the dev banner (or hide governed actions). */
export function isFixtureMode(mode: DataMode): boolean {
  return mode === 'fixture';
}

// ─── Helpers ──────────────────────────────────────────────────────────

function readEnv(key: string): string | undefined {
  // Vite injects import.meta.env at build time; guard for SSR/test.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined) ?? {};
  const v = env[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function isMode(s: string): s is DataMode {
  return s === 'live' || s === 'fixture' || s === 'both';
}
