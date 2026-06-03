/**
 * Workspace shell — shell-level data only.
 *
 * Per design-system/_sync/.../INSTALL_CLAUDE_CODE.md, the kit's lower
 * `data.jsx` (ANL_*, MEM_*, PV_*) is demo content lifted from v2 — do NOT
 * port it. The real surfaces consume their own `client/src/concept2cure/mdx/
 * data/*.ts`. This module carries only what the shell itself needs:
 * SUGGESTIONS (per-surface composer pills), ANA_CONTEXT (grounded opening
 * line), BUILT (which surface ids render a real surface vs. the "in design"
 * pane), SURFACE_META (title + kicker for the work-pane top bar). The
 * 4-group nav IA and ANA_MODES already live in `mdx/data/nav.ts` — reused,
 * not duplicated.
 */

import type { NavItem, NavGroup, AnaMode } from '../mdx/data/nav';
import {
  MDX_NAV_GROUPS,
  MDX_NAV_V2,
  ANA_MODES as MDX_ANA_MODES,
} from '../mdx/data/nav';

/** Surface ids the work pane renders as a real component. The rest fall
 *  through to the "in design" pane until their own absorb-and-wire commit. */
export const BUILT: ReadonlySet<string> = new Set([
  'analytics',
  'memory',
  'postmarket',
]);

export interface SurfaceMeta {
  title: string;
  kicker: string;
}

export const SURFACE_META: Record<string, SurfaceMeta> = {
  overview:    { title: 'Overview',               kicker: 'Portfolio' },
  k510:        { title: '510(k) submissions',     kicker: 'Workstream' },
  pma:         { title: 'PMA submissions',        kicker: 'Workstream' },
  cer:         { title: 'CER generator',          kicker: 'Workstream' },
  predicate:   { title: 'Precedent intelligence', kicker: 'Workstream' },
  tasks:       { title: 'Tasks and reviews',      kicker: 'Workbench' },
  engineering: { title: 'Device engineering',     kicker: 'Workbench' },
  udi:         { title: 'UDI and labeling',       kicker: 'Workbench' },
  postmarket:  { title: 'Post-market vigilance',  kicker: 'Workbench' },
  analytics:   { title: 'Analytics',              kicker: 'Intelligence' },
  memory:      { title: 'Claude memory',          kicker: 'Intelligence' },
  admin:       { title: 'Admin and access',       kicker: 'System' },
};

/** Composer suggestion pills per surface; falls back to `home` on no match. */
export const SUGGESTIONS: Record<string, string[]> = {
  home:       ['Find device-code precedents', 'Generate a readiness report', 'What is blocking BX-204?'],
  analytics:  ['Why is our cycle time above peer p50?', 'Which blocker is trending worst?', 'Draft a portfolio readiness memo'],
  memory:     ['What does AnA know about BX-204?', 'Review unverified atoms', 'Add an atom from a PDF'],
  postmarket: ['Show this week’s critical signals', 'Which MDRs are due in <72h?', 'Open a CAPA for SIG-2186'],
};

/** AnA's grounded opening line when a surface opens. Sentence case, no
 *  cheerleading. Verbatim from the kit's data.jsx. */
export const ANA_CONTEXT: Record<string, string> = {
  analytics:
    'You are looking at portfolio analytics for Medical Device and Diagnostics. Cycle time is the one number above peer median — 187 days vs a 179-day p50, driven by the predicate-to-spec phase. Ask me to trace any metric to its programs.',
  memory:
    'This is what I carry into every conversation about your portfolio — 275 atoms across seven categories. Two are unverified and one is superseded. Pinned atoms travel everywhere; scoped atoms activate only in matching contexts.',
  postmarket:
    'Four signals are critical and two MDRs are due inside 72 hours — CV-330 on a 5-day malfunction clock, BX-204 on a 30-day serious-injury clock. I can roll any signal up to an MDR, an FSCA, or a CAPA.',
};

/** Reused exports so the shell + tests have a single import surface. */
export const NAV_GROUPS: NavGroup[] = MDX_NAV_GROUPS;
export const NAV_ITEMS: NavItem[] = MDX_NAV_V2;
export const ANA_MODES: AnaMode[] = MDX_ANA_MODES;
