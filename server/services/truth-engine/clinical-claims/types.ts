/**
 * Types of the clinical figure claims engine (design §2). The entry module
 * re-exports these; the parts import them from here.
 */
import type { ClaimReasonCode } from '@shared/ana/clinical-claims-vocabulary';

import type { NumberConvention, WrittenNumber } from './number';

export type ReasonCode = ClaimReasonCode;

export type DocRole =
  | 'csr'
  | 'csr_synopsis'
  | 'm2_5'
  | 'm2_7_3'
  | 'm2_7_4'
  | 'm2_7_6'
  | 'iss'
  | 'ise'
  | 'uspi'
  | 'smpc'
  | 'other';

export interface ClaimSource {
  /** Authoring section id, vault document id, artifact id, or caller ref. */
  id: string;
  /** 'other' when unknown: role-dependent conventions (C5) then never bind. */
  role: DocRole;
  /** Document title: parsed as context, never as claim text. */
  title?: string;
  /** Section code + title chain, outermost first: context only. */
  headings?: string[];
  text: string;
  /** Spans whose figures are never compared (a proposed change, OCR text). */
  excluded?: Array<{ start: number; end: number; why: 'proposed_change' | 'ocr' }>;
  locator?: {
    kind: 'authoring_section' | 'vault_document' | 'artifact' | 'supplied';
    documentId?: string;
    sectionId?: string;
    sectionCode?: string | null;
    sha256?: string;
  };
}

export type SlotName =
  | 'study'
  | 'population'
  | 'arm'
  | 'contrast'
  | 'measure'
  | 'endpoint'
  | 'timepoint'
  | 'period'
  | 'subgroup'
  | 'part'
  | 'analysis'
  | 'model'
  | 'estimand'
  | 'imputation'
  | 'assessor'
  | 'ci'
  | 'scale'
  | 'unit'
  | 'value';

export type SlotFrom =
  | 'form'
  | 'clause'
  | 'sentence'
  | 'paragraph-lead'
  | 'heading'
  | 'table-title'
  | 'column'
  | 'row'
  | 'footnote'
  | 'document'
  | 'record'
  | 'default';

export interface Loc {
  sourceId: string;
  /** Character offsets into ClaimSource.text. */
  start: number;
  end: number;
  /** The text the figure was read from, verbatim, at most 200 characters. */
  quote: string;
  /** Nearest heading line or table title. */
  heading?: string;
  slotFrom: Partial<Record<SlotName, SlotFrom>>;
}

export type StudyRef =
  | { kind: 'study'; aliases: string[] }
  /**
   * members: each member's alias set; null when the pool lists no members. `scope`: the restriction the pool's own
   * name states ("placebo-controlled", "all-exposure", "long-term", "16w"), sorted and joined — two pools of the
   * same studies and different named scopes are different analysis sets (C16, r2 scope-01..03).
   */
  | { kind: 'pool'; members: string[][] | null; cutoff?: string; name?: string; scope?: string };

export type PopulationSet =
  | 'randomized'
  | 'treated'
  | 'itt'
  | 'fas'
  | 'mitt'
  | 'pp'
  | 'efficacy_evaluable'
  | 'pk'
  | 'screened'
  | 'enrolled';

export interface Population {
  set: PopulationSet;
  /** The text defines the set as all randomized patients (ITT ≡ FAS only then, C3). */
  allRandomized?: true;
  /** False when the population is a convention default (C2: safety figures). */
  stated: boolean;
}

export type ArmRef =
  | { kind: 'arm'; drug: string; dose?: string; label: string }
  | { kind: 'total' }
  /** Arms pooled inside one study ("Zelbrutinib total", "10 mg and 20 mg combined"). */
  | { kind: 'combined'; drug: string; doses: string; label: string }
  /** Open-label extension groups ("patients who continued Drug X", "switched from placebo"). */
  | { kind: 'ole'; key: string; label: string }
  /** An unnamed position in a "V vs V" pair: test or control (C12). */
  | { kind: 'role'; role: 'test' | 'control' };

export interface Contrast {
  test?: ArmRef;
  control?: ArmRef;
  /** The text writes the direction ("A minus B", "A vs B"); otherwise test vs control (C12). */
  stated: boolean;
}

export interface Scope {
  /** Sorted keys: 'age>=65', 'sex=female', 'region=japan', 'raw:renal impairment'. */
  subgroups: string[];
  period?: string;
  /** A trial-duration adjective ("a 26-week trial"): matches an unstated period or the same window. */
  softPeriod?: string;
  timepoint?: string;
  part?: string;
}

export interface Analysis {
  /** 'non_primary': the text sets the figure against the primary analysis without naming its own role. */
  role?: 'primary' | 'final' | 'primary_or_final' | 'interim' | 'updated' | 'sensitivity' | 'supportive' | 'supplementary' | 'exploratory' | 'non_primary';
  /** Which occasion of a repeated analysis ("the second interim analysis"): 1, 2, 3 … (r2 scope-12). */
  occasion?: string;
  cutoff?: string;
  model?: string;
  estimand?: string;
  imputation?: string;
  assessor?: 'bicr' | 'investigator';
  /** An analysis named by its method (tipping-point, as-treated, censoring at discontinuation …); never defaulted. */
  method?: string;
}

export interface CI {
  level: string;
  sided: 'two' | 'one';
  sidedStated: boolean;
  kind: 'confidence' | 'credible';
  method?: string;
}

export interface Measure {
  family:
    | 'n'
    | 'completed_study'
    | 'discontinued_study'
    | 'deaths'
    | 'incidence'
    | 'eair'
    | 'lab'
    | 'responder'
    | 'effect'
    | 'median'
    | 'arm_change'
    | 'baseline_mean'
    | 'exposure'
    | 'demographic';
  /** Family-specific attributes that must be equal for two claims to be the same measure. */
  key: Record<string, string>;
}

export interface ClaimFrame {
  study?: StudyRef;
  population?: Population;
  arm?: ArmRef;
  contrast?: Contrast;
  measure: Measure;
  scope: Scope;
  analysis: Analysis;
  /** Effects: the endpoint id and its stated role; both default under C13. */
  endpoint?: { id?: string; role?: string };
  /** Effects: 'ratio' | 'units' | 'percentage_points' | 'proportion'; unit of a continuous endpoint. */
  scale?: string;
  unit?: string;
  ci?: CI;
  /** Event basis and causality (C5) for incidence measures. */
  basis?: 'adverse_event' | 'adverse_reaction';
  causality?: 'all' | 'related' | 'unstated';
}

export interface ClaimValue {
  count?: WrittenNumber;
  percent?: WrittenNumber;
  denominator?: WrittenNumber;
  estimate?: WrittenNumber;
  lower?: WrittenNumber;
  upper?: WrittenNumber;
  /** The interval marker is present but its bounds cannot be read (C15). */
  intervalUnread?: ReasonCode;
  /** A p-value stated with the figure: a component of its claim. */
  p?: WrittenNumber;
  /** What the p-value is: its sidedness, the test named, and any multiplicity adjustment (r1 nsf-01..04). */
  pBasis?: PBasis;
  /** A component carries an undefined qualifier (a footnote marker with no footnote). */
  unreadComponents?: Partial<Record<Component, ReasonCode>>;
}

/** The basis of a p-value as written: two p-values compare only when their sidedness, test and adjustment agree. */
export interface PBasis {
  sided?: 'one' | 'two';
  test?: string;
  adjusted?: 'nominal' | 'adjusted';
}

export type FormId = string;

export interface Claim {
  id: string;
  frame: ClaimFrame;
  value: ClaimValue;
  form: FormId;
  loc: Loc;
  measureLabel: string;
  /** The section (heading path) the claim sits in: within-source pairs come from different sections. */
  section: string;
}

/** A figure a form matched whose frame could not be completed: reported as not_compared, never dropped. */
export interface Unframed {
  form: FormId;
  loc: Loc;
  missing: SlotName[];
  reason: ReasonCode;
  detail: string;
  partial: Partial<ClaimFrame> & { measure?: Measure };
  measureLabel?: string;
  /** The values the form read, canonical. */
  values: string[];
}

export type Outcome = 'consistent' | 'conflict' | 'not_compared';
export type Component = 'count' | 'percent' | 'denominator' | 'estimate' | 'lower' | 'upper' | 'p';

export interface ComponentResult {
  component: Component;
  /** Canonical value as written on each side ('' when the side does not state it). */
  a: string;
  b: string;
  /** Display form exactly as written. */
  aWritten: string;
  bWritten: string;
  result: 'agree' | 'differ' | 'not_compared';
  reason?: ReasonCode;
  comparedAtDp?: number;
}

export interface Side {
  claimId: string;
  sourceId: string;
  quote: string;
  loc: Loc;
}

export interface Comparison {
  /** conflict if any compared component differs; consistent needs one agreeing and none differing. */
  outcome: 'consistent' | 'conflict';
  measureLabel: string;
  /** The compared arm, as the a-side writes it ('total' for a total, a contrast for an effect). */
  arm?: string;
  frameSummary: string;
  a: Side;
  b: Side;
  components: ComponentResult[];
  detail: string;
}

export interface NotComparedSide {
  sourceId: string;
  quote: string;
  loc: Loc;
  claimId?: string;
  /** The figure's values, canonical as written. */
  values: string[];
}

export interface NotCompared {
  outcome: 'not_compared';
  reason: ReasonCode;
  detail: string;
  measureLabel?: string;
  a: NotComparedSide;
  b?: NotComparedSide;
  differingSlots?: SlotName[];
  missingSlots?: SlotName[];
}

export interface MeasureSummary {
  measureLabel: string;
  status: 'conflict_found' | 'consistent_where_compared' | 'not_compared';
  compared: number;
  conflicts: number;
  notCompared: number;
}

export interface ClaimReport {
  sources: Array<{ sourceId: string; role: DocRole; claims: number; unframed: number; numberConvention: NumberConvention }>;
  comparisons: Comparison[];
  notCompared: NotCompared[];
  /** The same frame stated twice in one source, in different sections (synopsis vs body). */
  withinSource: Comparison[];
  summaries: MeasureSummary[];
  verdict: 'conflicts_found' | 'no_conflict_among_compared' | 'nothing_compared';
}

export interface ExtractOptions {
  /** Alias sets from a deterministic project record (C1); never model input. */
  studyAliases?: ReadonlyArray<readonly string[]>;
}

export interface ExtractResult {
  claims: Claim[];
  unframed: Unframed[];
  numberConvention: NumberConvention;
}
