/**
 * AnA renderer prop contracts — the component API Claude Design builds against
 * and Claude Code renders into. PURE TYPES (no React, no runtime) so both sides
 * import the same contract and stay aligned as tools evolve.
 *
 * Each AnA tool result declares a `renderer` (see docs/ana-capability-manifest.json).
 * This file defines the props for each of those renderers. The mapping is:
 *
 *   manifest "renderer"        →  props interface
 *   ─────────────────────────────────────────────
 *   result-card                →  ResultCardProps
 *   findings-list              →  FindingsListProps
 *   ranked-cards               →  RankedCardsProps
 *   table-csv                  →  TableCsvProps
 *   document-canvas            →  DocumentCanvasProps
 *   artifact-xml               →  ArtifactPreviewProps
 *   readiness-panel            →  ReadinessPanelProps
 *   list                       →  ListProps
 *   chart:bars                 →  BarsChartProps
 *   chart:trace                →  CohortTraceChartProps
 *   chart:ceac                 →  CeacChartProps
 *   chart:icer-plane           →  IcerPlaneChartProps
 *   chart:regression-band      →  RegressionBandChartProps
 *   navigation                 →  NavigationChipProps
 *
 * Cross-cutting: every result carries an AnaResultEnvelope; governed actions use
 * GovernedActionConfirmProps; structured inputs use StructuredInputDrawerProps.
 *
 * @module shared/ui-contracts/ana-renderers
 */

// ── Cross-cutting envelope ────────────────────────────────────────────────────

export type AnaResultStatus =
  | 'computed' | 'generated' | 'built' | 'composed' | 'parsed' | 'formatted'
  | 'validated' | 'checked' | 'coded' | 'ok' | 'navigation_ready'
  | 'needs_parameters' | 'needs_context' | 'unknown_command'
  | 'not_found' | 'no_match' | 'lookup_failed' | 'failed';

/** Wraps every tool result. The UI MUST surface `scopeCaveats` — they are the
 *  platform's core honesty contract (tools refuse to fake submittable artifacts). */
export interface AnaResultEnvelope {
  toolName: string;
  status: AnaResultStatus;
  /** 'deterministic' | 'seeded-monte-carlo' | external source name, etc. */
  engine?: string;
  /** The model's one-line narration of what it did, for the card header. */
  summary?: string;
  /** Scope/limit notes the tool returned (e.g. "not the validator of record"). Render these. */
  scopeCaveats?: string[];
  /** Provenance for the audit trail (deterministic tools carry a hash/version). */
  provenance?: { engineVersion?: string; computedAt?: string; deterministic?: boolean; hash?: string };
  /** Present when status indicates a non-success path; show as the empty/guidance state. */
  message?: string;
}

export type Severity = 'error' | 'warning' | 'info';

export interface KeyValue {
  label: string;
  value: string | number | boolean;
  /** Optional unit (e.g. "%RSD", "months", "QALY"). */
  unit?: string;
  /** Optional pass/fail emphasis. */
  emphasis?: 'pass' | 'fail' | 'neutral';
}

// ── Renderers ─────────────────────────────────────────────────────────────────

export interface ResultCardProps {
  envelope: AnaResultEnvelope;
  /** Headline metrics shown as a key/value grid. */
  metrics: KeyValue[];
  /** Optional secondary key/value rows behind a "details" expander. */
  details?: KeyValue[];
}

export interface Finding {
  severity: Severity;
  message: string;
  /** Where the finding applies (e.g. dataset/variable, JSON path, section). */
  location?: string;
  /** Stable rule id, when the engine has one. */
  rule?: string;
}
export interface FindingsListProps {
  envelope: AnaResultEnvelope;
  findings: Finding[];
  /** Render errors before warnings; show the summary as a header chip row. */
  summary: { errors: number; warnings: number; pass?: boolean };
}

export interface RankedCard {
  id: string;
  title: string;
  score: number;
  /** 0–100 band or a label like "adequate"/"marginal". */
  band?: string;
  factors?: Array<{ factor: string; awarded: number; max: number; rationale: string }>;
  strengths?: string[];
  concerns?: string[];
}
export interface RankedCardsProps {
  envelope: AnaResultEnvelope;
  /** Already ordered best-first. */
  cards: RankedCard[];
  recommendedId?: string | null;
}

export interface TableCsvProps {
  envelope: AnaResultEnvelope;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | number | boolean | null>>;
  /** Pre-rendered CSV to download (engine already produced it). */
  csv?: string;
  /** Optional summary tabulation shown above/below the table. */
  summary?: KeyValue[];
  onExportCsv?: () => void;
}

export interface DocumentCanvasProps {
  envelope: AnaResultEnvelope;
  /** Document body (markdown). */
  body: string;
  /** Sections that were missing/empty — render as a prominent banner; never hide. */
  missingSections?: string[];
  onExport?: (format: 'docx' | 'pdf' | 'md') => void;
}

export interface ArtifactPreviewProps {
  envelope: AnaResultEnvelope;
  fileName: string;
  mimeType: string; // e.g. 'application/xml'
  content: string;
  /** Structural validity flag + issues, when the generator reports them. */
  structurallyValid?: boolean;
  issues?: Finding[];
  onDownload?: () => void;
}

export interface ReadinessPanelProps {
  envelope: AnaResultEnvelope;
  /** What can honestly be produced (e.g. 'official-estar' | 'content-package-draft' | 'none'). */
  artifactKind: string;
  canProduce: boolean;
  /** Every blocker preventing a submittable artifact — render as a checklist. */
  blockers: string[];
}

export interface ListProps {
  envelope: AnaResultEnvelope;
  items: Array<Record<string, string | number | boolean | null>>;
}

// ── Charts (5) ────────────────────────────────────────────────────────────────

export interface BarsChartProps {
  envelope: AnaResultEnvelope;
  /** e.g. per-year budget impact. */
  series: Array<{ label: string; value: number }>;
  yLabel?: string;
  /** Optional secondary line (e.g. cumulative). */
  cumulative?: Array<{ label: string; value: number }>;
}

export interface CohortTraceChartProps {
  envelope: AnaResultEnvelope;
  /** State names = series. */
  states: string[];
  /** trace[cycle][stateIndex] = membership fraction/count. */
  trace: Array<{ cycle: number; distribution: number[] }>;
  totals?: KeyValue[]; // total cost / QALY etc.
}

export interface CeacChartProps {
  envelope: AnaResultEnvelope;
  /** Cost-effectiveness acceptability curve. */
  curve: Array<{ willingnessToPay: number; probabilityCostEffective: number }>;
  icer?: number | null;
  probabilityDominant?: number;
}

export interface IcerPlaneChartProps {
  envelope: AnaResultEnvelope;
  incrementalCost: number;
  incrementalEffect: number;
  icer: number | null;
  willingnessToPay?: number;
  dominance?: string;
  /** Optional PSA cloud of (Δeffect, Δcost) points. */
  cloud?: Array<{ effect: number; cost: number }>;
}

export interface RegressionBandChartProps {
  envelope: AnaResultEnvelope;
  points: Array<{ time: number; value: number }>;
  regression: { slope: number; intercept: number };
  /** The confidence bound used (lower/upper) and the spec line. */
  bound: 'lower' | 'upper';
  specLimit: number;
  /** The estimated crossing (e.g. shelf life). */
  estimate?: { x: number; label: string };
  exceedsEvaluatedRange?: boolean;
}

// ── Navigation ────────────────────────────────────────────────────────────────

export interface NavigationChipProps {
  label: string;
  /** Target id + params from the navigation registry (shared/navigation). */
  targetId: string;
  path: string;
  params?: Record<string, string>;
  onNavigate: (path: string, params?: Record<string, string>) => void;
}

// ── Structured input (for tools whose inputs are tables/matrices/specs) ───────

export type InputFieldType =
  | 'number' | 'string' | 'boolean' | 'enum'
  | 'number-array' | 'object-array' | 'matrix' | 'json' | 'file-ris';

export interface InputField {
  name: string;
  label: string;
  type: InputFieldType;
  required: boolean;
  description?: string;
  enumValues?: string[];
  /** For object-array/matrix: the per-item field shape. */
  itemFields?: InputField[];
}
export interface StructuredInputDrawerProps {
  toolName: string;
  /** Derived from the tool's manifest `inputs` array. */
  fields: InputField[];
  /** AnA can pre-fill from the conversation; the user edits before running. */
  prefill?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel?: () => void;
}

// ── Governed-action confirmation (Part 11) ────────────────────────────────────

export interface GovernedActionConfirmProps {
  /** Command/tool being confirmed (e.g. 'sign_document'). */
  action: string;
  humanLabel: string;
  /** Reason-for-change is always required for governed actions. */
  reasonRequired: true;
  /** High-impact actions additionally require an e-signature. */
  signatureRequired: boolean;
  onConfirm: (signoff: { reason: string; signature?: { username: string; password: string } }) => void;
  onCancel: () => void;
}
