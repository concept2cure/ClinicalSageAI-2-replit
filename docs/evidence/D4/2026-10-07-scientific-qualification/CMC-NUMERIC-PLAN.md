# CMC numeric evidence qualification plan

Workstream W3, launch row D4. Control tower approved this bounded contract on
2026-10-07 before production edits. Source boundary:
`server/services/cmc/recorded-stability.ts`; existing Module 3 consumers use the
same parser. No new dependency, store, model, route, or approval path.

## Contract

- Measured values are finite number primitives or complete signed decimal /
  scientific-notation strings, optionally followed by `%`. Percent remains in
  percentage points; nothing is rescaled. Nonzero strings that underflow to zero
  are refused. No object/array/boolean coercion, censor substitution, grouping
  interpretation, unit inference, or malformed-substring extraction.
- Stability time is nonnegative months, matching the current register. Preserve
  bare numeric values, `6M`, `6 mo`, `6 mos`, `6 month(s)`, and `Month 6` / `Month6`
  (case-insensitive). Days, weeks, years, percentages, and ambiguous composite
  labels are refused without conversion. Existing generator emits `24 months`.
- Null, undefined, and blank measured results remain missing with visible
  recorded/usable counts. A present result requires a valid result AND a valid
  time, including when its time is missing. Any invalid observation refuses its
  whole attribute/condition series with row/field reasons; it is never silently
  omitted before fitting the others.
- Any invalid observation in a selected poolability batch blocks the affected
  parameter for all selected batches. Missing/insufficient eligible batches
  retain the existing exclusion rules. Independent valid series remain readable,
  but an observation-invalid parameter prevents a programme shelf-life claim.
- Acceptance-criterion grammar is not expanded. A narrow preflight across every
  candidate refuses reproduced exponent-like, grouped, and malformed numeric
  tokens before the legacy parser can extract a different limit or skip to a
  supported candidate. Unsupported notation needs client clarification; existing
  ordinary comparators, ranges, textual criteria, and unit labels remain intact.
- Raw source records stay unchanged. Module 3 stability and QC comparisons use
  the corrected shared value parser; unresolved results are not compared. Human
  scientific review, approval, source linkage, and export controls remain intact.

## Proof before completion

1. Add qualification tests and run them against the unfixed production code;
   retain actual RED output.
2. Prove complete finite lexemes, month-label compatibility, missing-versus-invalid
   handling, raw preservation, and unsupported criterion handling.
3. Exercise shelf life, trending, and three-batch poolability with one invalid
   observation among otherwise sufficient data. Keep independent valid series
   visible while withholding an incomplete programme claim.
4. Exercise Module 3 stability tables/narratives and QC conformance for censored
   results, scientific notation, and unsupported criteria.
5. Run targeted existing acceptance, shelf-life, poolability, trending, Module 3,
   and AnA tests plus scoped ESLint; retain GREEN output and exact counts.

These are deterministic in-memory software qualification controls, not client
dataset or intended-use validation, a regulated shelf-life decision, staging
qualification, or completion of launch row D4. Acceptance-criterion semantics
beyond the explicit guard, generic units, censoring methods, and upload-to-analysis
dataset qualification remain outside this change. Full TypeScript and shared
release gates are control-tower/CI work because local full TypeScript is known to
exhaust memory.
