/**
 * The design-statistics calculators, as data.
 *
 * ── Why a registry and not fourteen forms ────────────────────────────────────
 * `server/routes/biostat-design-stats.ts` mounts fifteen deterministic
 * statistical engines under `/api/biostat`, and until now the workbench reached
 * exactly one of them (assurance). The other fourteen were running, tested and
 * unreachable from the product.
 *
 * Hand-writing fourteen more bespoke forms would have been ~1,500 lines of
 * near-duplicate JSX, and adding the sixteenth engine would cost another
 * hundred. Instead each calculator is declared here — endpoint, fields, and how
 * to shape the request — and one generic renderer in `BiostatWorkbench.tsx`
 * draws them all. Adding a calculator is a data change.
 *
 * ── The field names are not invented ─────────────────────────────────────────
 * Every `key` below matches what the route handler actually reads from
 * `req.body`, taken from the handler source rather than from its docstring.
 * Dotted keys (`prior.alpha`, `treatment.times`) build nested objects, which is
 * how those handlers expect them. A field the server ignores is worse than a
 * missing one: it silently implies the number had an effect.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────────
 * `/region-rules/*` is a design-rule catalogue rather than a calculator (it
 * takes a structured design object and returns rule verdicts), so it does not
 * fit the numeric-form shape and is left to its own surface. Nothing else under
 * `/api/biostat` is omitted.
 */

export type FieldKind =
  | 'number'
  | 'int'
  | 'select'
  | 'numlist'
  | 'text'
  /** One record per line; the calculator's `parseRows` turns them into objects. */
  | 'rows';

export interface CalculatorField {
  /** Request body key. Dotted paths build nested objects: `prior.alpha`. */
  key: string;
  label: string;
  kind: FieldKind;
  /** Omitted from the request when left blank. Required fields block submission. */
  optional?: boolean;
  placeholder?: string;
  /** Shown under the input — units, ranges, and what the number means. */
  hint?: string;
  options?: Array<{ value: string; label: string }>;
  /** Only render this field when another field currently holds one of these values. */
  showWhen?: { key: string; equals: string[] };
}

export interface Calculator {
  id: string;
  title: string;
  /** One line on what question this answers for a study team. */
  subtitle: string;
  /** Path under this calculator's `base`. */
  path: string;
  /**
   * The router this calculator's path is under. Defaults to `/api/biostat`
   * (the design-statistics engines). `/api/diagnostics-performance` holds the
   * CLSI analytical and clinical-performance engines, which were mounted,
   * Zod-validated and reference-tested against the CLSI methods — and reached
   * by no client code and no AnA tool, so an IVD sponsor could not obtain the
   * analytical performance section of their own submission.
   */
  base?: string;
  /**
   * The response key the result sits under. `/api/biostat` answers
   * `{success, data}`; `/api/diagnostics-performance` answers `{result}`.
   * Reading the wrong one renders a refusal where a result was returned.
   */
  resultKey?: 'data' | 'result';
  method?: 'POST' | 'GET';
  /** Longer framing shown above the form: what it computes and what it assumes. */
  about: string;
  fields: CalculatorField[];
  /**
   * Extra body keys that are constant for this calculator (e.g. a mode
   * discriminator the server switches on).
   */
  fixedBody?: Record<string, unknown>;
  /** Turn a `rows` field's parsed number lists into the shape the server wants. */
  parseRows?: Record<string, (rows: number[][]) => unknown>;
}

export const SPENDING = [
  { value: 'obrien-fleming', label: "O'Brien–Fleming" },
  { value: 'pocock', label: 'Pocock' },
  { value: 'linear', label: 'Linear (Pocock-like)' },
];

export const PROCEDURES = [
  { value: 'bonferroni', label: 'Bonferroni' },
  { value: 'holm', label: 'Holm (step-down)' },
  { value: 'hochberg', label: 'Hochberg (step-up)' },
  { value: 'fixed-sequence', label: 'Fixed sequence' },
  { value: 'weighted-bonferroni', label: 'Weighted Bonferroni' },
];

/** The default router for a calculator that names none. */
export const DEFAULT_CALCULATOR_BASE = '/api/biostat';

/** The CLSI analytical and clinical-performance router. */
export const IVD_CALCULATOR_BASE = '/api/diagnostics-performance';

/**
 * The full path a calculator posts to. One definition, so the form, the
 * provenance stamp and the tests cannot disagree — the workbench composed
 * `'/api/biostat' + calc.path` inline in two places before a second router
 * existed.
 */
export function calculatorEndpoint(calc: Calculator): string {
  return `${calc.base ?? DEFAULT_CALCULATOR_BASE}${calc.path}`;
}

/** Which response key holds this calculator's result. */
export function calculatorResultKey(calc: Calculator): 'data' | 'result' {
  return calc.resultKey ?? 'data';
}
