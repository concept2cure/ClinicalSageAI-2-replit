# Rule 2 S5-0 — stated-input calculation envelopes

D2, continuing the existing Rule 2 audit. This is the common labeling mechanism only;
S5a–S5d's engine/default audits remain queued. R-2/F2 calculator availability is still
unresolved. This change preserves the offered tools and applies the label the design says
is required under either policy; it does not treat “Continue” as an availability decision.

## What already exists

- `ana/stated-input-result.ts` was introduced by S4 for successful FIH, safety-margin,
  tox-classification and carcinogenicity worksheets. It is extended, not duplicated: an object
  decorator now owns metadata/instructions, and the existing string adapter delegates to it.
- `AnaToolExecutor.ts` has a common `runStatsTool` wrapper and `ivdComputed` plus standalone
  inline envelopes. AST inspection finds **208** stats-wrapper calls (the design's 209 was stale)
  and **8** IVD calls. Existing engine functions, computations, seeded methods and numerical
  outputs remain unchanged.
- The stats wrapper is also used by RIM database readers, curated currency/guidance lookups and
  static structures. The design's claim that no record reader passes through it was incorrect.
  Those callers need an explicit opt-out from a stated-input claim.
- Successful recorded CMC calculations already use separate manual envelopes with source
  identifiers; they are preserved. Saved-document critique has a separate early return from
  its caller-provided-text branch; the record branch is preserved too.
- Searches covered wrapper AST callsites, their imported services, inline computed/assessed
  replies, tests and record-backed control paths. No additional engine, route, schema, dependency,
  record loader, document writer or parallel calculator was introduced.

## Resulting behavior

Successful calculations get:

- `basis: 'stated'`;
- `appliesTo: 'the inputs stated in this conversation'`, unless a more specific scope already exists;
- an instruction to report only the stated-input worksheet and any engine defaults disclosed in
  the result, with no claim that program/product source records were read, and no program/product
  verdict or governed-content claim.

The note deliberately does **not** say “Every input was stated”: real arithmetic defaults exist
(e.g. FIH safety factor, simulation iteration counts and seeds). S5's later default audits must
handle omitted deciding facts; a metadata label cannot make them stated.

The wrapper defaults cover **196** calculation callers; **12** existing source/reference/structure
callers pass `{statedInputs: false}` explicitly:

- `query_rim_patterns_by_domain`, `summarize_rim_intelligence` — tenant-scoped RIM store reads;
- `check_regulatory_currency`, `guidance_change_radar` — curated, dated currency records;
- `fetch_fda_guidance_list`, `fetch_ich_guideline_updates`, `check_guidance_freshness` — unavailable
  FDA index or curated guidance registries/freshness, not live fetching;
- `generate_psur_structure`, `generate_dsur_structure`, `assess_plr_structure`,
  `assess_pregnancy_lactation_labeling`, `structure_smpc` — structures/reference or unassessed output.

All 8 IVD sites decorate the successful serializer/calculation envelope. They do not read records.
The existing `valid` fields remain payload validation results; the instruction forbids treating
stated fields as recorded product facts or approved governed content (record-identity work is S12).

29 additional manual success paths use the same decorator, including the ten named in the design
where they were not already covered, plus standalone biostat/BLA/HEOR calculations and supplied-text
reviews/reconciliation. S4's FIH and tox-classification string adapters use the same implementation.
The exact additional names and opt-outs are in `envelope-audit.json`.

Fault/refusal envelopes keep their previous objects and raw strings. Generic and caller-specific
notes are idempotent, so nested S4 wrappers do not duplicate cautions. Numeric results, seed/method,
opaque provenance references and explicit list-only scopes are preserved.

## Verification

- `red/wrappers-and-inlines.txt`: **13 failed / 8 passed** before the mechanism, across the named
  calculator/wrapper cases, default disclosure and successful record/source/structure controls.
- `red/helper-idempotency.txt`: restoring only the published S4 helper makes the existing nested
  dose caution duplicate and fail. This is a behavioral mutation, not a missing-export failure;
  the current helper was restored in a finally block.
- `green/source-exceptions.txt`: all **14** successful record/reference/structure controls pass,
  including real f2 comparison over scripted stored profiles, recorded shelf life, RIM reads,
  unavailable FDA index, dated registry lookups and nonempty report/label structures.
- `green/helper-contracts.txt`: **8** tests pass for numerical precision/seed/provenance preservation,
  explicit scope, refusal/fault identity/raw formatting, and idempotent generic/specific notes.
- The expanded focused calculator suite has exact IVD/stats refusal and engine-fault pins, so a
  refused call cannot gain a success basis. It also checks default arithmetic is not described
  as something the person stated.

The full AnA directory run passed **431 files, 6,778 tests**, with **1 skipped**
(888.48 seconds); see `green/broad-summary.txt` and the complete compressed
`green/broad-run.txt.gz`. Whole-program TypeScript passed with **0 errors**. The changed-file
ESLint ratchet passed with no added warnings, and validation traceability passed
(`green/gates.txt`).
No native PostgreSQL or live-provider proof is claimed: records/source controls use scripted DB
and service seams, while dissolution uses the actual pure comparison engine over those rows.
No description/schema changed, so no AnA capability-manifest regeneration was necessary.
