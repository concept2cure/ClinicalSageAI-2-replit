/**
 * RbmBoard — the client contract for the real RBM board read-model
 * (GET /api/mdx-rbm/rbm-board/:programId, assembled in
 * server/routes/mdx-rbm-board.ts). Mirrors the server's `data` shape exactly.
 *
 * The RBM sub-surfaces read their slices from a `board` of this type. Writes go
 * to the granular /api/mdx/rbm-* routes and the shell then re-fetches this
 * board, so the board is the single source of truth on screen.
 *
 * Fields the RBM store has no column for are documented here as always-null /
 * always-empty, and the surfaces neither render nor collect them — a form that
 * captured them would drop them on save:
 *   - assessment.history        → always []      (no version history store)
 *   - assessment/plan.approval  → { by, when, reason } only — NO `audit` id
 *   - items.riskCat / .control  → absent          (board exposes refCode instead)
 *   - kris: no threshold method, analysis level or per-site drilldown
 *   - qtls.unit                 → always null; the breach response is the flat
 *     breachActionTaken narrative, not a structured breach record
 *   - signals: resolution notes only, no structured investigation record
 *   - patients.metrics          → always []
 *   - sites.country             → always null
 *   - plan.version/basis        → absent; plan.tiers → always null; anaDraft false
 */

export interface RbmBoardSummary {
  overallRisk: string | null;
  asOf: string;
  riskItems: { total: number; critical: number; open: number; high: number };
  // `notEvaluated` counts indicators with no reading (or no threshold to read
  // against). They are surfaced, not folded into the healthy remainder.
  kris: { total: number; red: number; amber: number; notEvaluated: number };
  qtls: { total: number; breached: number; approaching: number; notEvaluated: number };
  signals: { total: number; open: number; high: number };
  sites: { total: number; enhanced: number };
  patients: { scored: number; flagged: number; review: number };
}

export interface RbmBoardAttention {
  sev: string;
  kind: string;
  nav: string;
  t: string;
  d: string | null;
}

export interface RbmBoardReport {
  programId: string;
  asOf: string;
  framework: string;
  overallRisk: string;
  headline: string;
  attentionCount: number;
  approved: boolean;
  sections: { title: string; status: string; items: string[] }[];
}

export interface RbmBoardApproval {
  by: string | null;
  when: string | null;
  reason: string | null;
}

export interface RbmBoardAssessment {
  id: number;
  framework: string;
  version: number;
  status: string;
  updated: string | null;
  approval: RbmBoardApproval | null;
  history: unknown[];
}

export interface RbmBoardItem {
  id: number;
  category: string;
  factor: string;
  l: number;
  i: number;
  det: number | null;
  critical: boolean;
  mitigation: string;
  residual: number | null;
  status: string;
  owner: string | null;
  refCode: string;
}

export interface RbmBoardKri {
  id: number;
  name: string;
  metric: string;
  source: string;
  unit: string;
  dir: string;
  amber: number | null;
  red: number | null;
  current: number | null;
  status: string;
  at: string | null;
  spark: number[];
}

export interface RbmBoardQtl {
  id: number;
  parameter: string;
  rationale: string;
  unit: null;
  secondary: number | null;
  threshold: number | null;
  current: number | null;
  status: string;
  breachActionTaken: string | null;
}

export interface RbmBoardSignal {
  id: number;
  source: string;
  type: string;
  severity: string;
  title: string;
  site: string;
  detail: string;
  detected: string | null;
  status: string;
  resolution: string | null;
}

export interface RbmBoardPatient {
  sid: string;
  site: string;
  anomaly: number | null;
  top: string;
  status: string;
  at: string | null;
  // The board exposes the profile row's scalar fields; the per-dimension z
  // breakdown is not carried in the read-model, so this is always []. Typed to
  // the dimension shape (matching the server) so surfaces render it null-safe.
  metrics: { k: string; z: number }[];
}

export interface RbmBoardSite {
  n: string;
  name: string;
  country: null;
  composite: number | null;
  enr: number | null;
  qual: number | null;
  ops: number | null;
  tier: string;
  drivers: string[];
  at: string | null;
}

export interface RbmBoardPlan {
  id: number;
  title: string;
  strategy: string;
  status: string;
  updated: string | null;
  // Monitoring tiers (enhanced/standard/reduced) when the plan carries them;
  // null when the read-model has not populated them. Typed `null` previously,
  // which collapsed `plan.tiers.enhanced` accesses in RbmSurfacesB to `never`.
  tiers: Record<string, string> | null;
  anaDraft: boolean;
  approval: RbmBoardApproval | null;
}

export interface RbmBoardAction {
  id: number;
  type: string;
  title: string;
  priority: string;
  owner: string;
  due: string;
  status: string;
  overdue: boolean;
  origin: string;
}

export interface RbmBoard {
  programId: string;
  asOf: string;
  summary: RbmBoardSummary;
  attention: RbmBoardAttention[];
  report: RbmBoardReport | null;
  reportMarkdown: string | null;
  assessment: RbmBoardAssessment | null;
  items: RbmBoardItem[];
  kris: RbmBoardKri[];
  qtls: RbmBoardQtl[];
  signals: RbmBoardSignal[];
  patients: RbmBoardPatient[];
  sites: RbmBoardSite[];
  oversight: Record<string, { open: number; high: number }>;
  plan: RbmBoardPlan | null;
  actions: RbmBoardAction[];
  pendingStore?: boolean;
}

/** A program (study) that has real RBM data — GET /api/mdx-rbm/rbm-programs. */
export interface RbmProgram {
  id: string;
  label: string;
}

/**
 * True when the board carries any real RBM content for the selected program.
 * Used by the shell to decide between rendering the sub-surfaces and the honest
 * seed/empty state — never a fixture.
 */
export function rbmBoardHasData(board: RbmBoard | null): boolean {
  if (!board || board.pendingStore) return false;
  return (
    board.assessment != null ||
    board.plan != null ||
    board.items.length > 0 ||
    board.kris.length > 0 ||
    board.qtls.length > 0 ||
    board.signals.length > 0 ||
    board.sites.length > 0 ||
    board.patients.length > 0 ||
    board.actions.length > 0 ||
    board.attention.length > 0
  );
}
