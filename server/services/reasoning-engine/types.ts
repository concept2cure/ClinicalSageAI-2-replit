/**
 * Reasoning Engine — types (WO-5)
 *
 * The reasoning engine isolates HRM-CANDIDATE regulatory reasoning behind a
 * single `resolve()` contract so a future HRM resolver can swap in without
 * touching callers. Today the deterministic `rules-resolver` answers; the
 * `hrm-resolver` is a stub that declines and falls back.
 *
 * Tasks resolved here are structural/deterministic (required-section
 * resolution, CTD dependency resolution, granularity, review-clock). The LLM
 * narration in submission-ai sits ON TOP of these answers — it never invents the
 * structure. This keeps the determinism boundary intact.
 */

export type Region = 'fda' | 'eu' | 'jp';

export type ApplicationType =
  | 'ind'
  | 'nda'
  | 'bla'
  | 'maa'
  | 'cta'
  | 'anda'
  | '510k'
  | 'pma';

export type ReasoningTaskType =
  | 'required-sections' // region + applicationType → required CTD sections
  | 'ctd-dependencies' // sectionCode → prerequisite sections
  | 'granularity' // sectionCode → granularity rule
  | 'review-clock'; // region + applicationType → review clock model

export type ResolverName = 'rules' | 'hrm';

export interface ReasoningRequest {
  task: ReasoningTaskType;
  region: Region;
  applicationType: ApplicationType;
  /** Required for `ctd-dependencies` and `granularity`. */
  sectionCode?: string;
}

export interface RequiredSection {
  sectionCode: string;
  title: string;
  module: 1 | 2 | 3 | 4 | 5;
  required: boolean;
  /** Region-specific (Module 1) vs ICH-common (Modules 2–5). */
  regional: boolean;
  granularityRule: string;
}

export interface ReviewClock {
  region: Region;
  applicationType: ApplicationType;
  /** e.g. 'PDUFA', 'EU centralised', 'PMDA', '510(k)'. */
  model: string;
  /** Nominal review duration in calendar days (0 = no fixed statutory clock). */
  nominalDays: number;
  clockStops: boolean;
  basis: string;
}

export interface ReasoningResult<T = unknown> {
  ok: boolean;
  /** Which resolver answered (provenance for the determinism boundary). */
  resolver: ResolverName;
  task: ReasoningTaskType;
  data: T;
  rationale: string;
  /** Version of the rule data used, for auditability. */
  profileVersion: string;
}

export interface ReasoningResolver {
  readonly name: ResolverName;
  supports(req: ReasoningRequest): boolean;
  resolve<T = unknown>(req: ReasoningRequest): ReasoningResult<T>;
}

export class ReasoningError extends Error {
  constructor(
    public code: 'UNSUPPORTED_TASK' | 'BAD_INPUT' | 'NO_RESOLVER',
    message: string
  ) {
    super(message);
    this.name = 'ReasoningError';
  }
}
