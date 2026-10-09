# AnA deficiency context read sharing — W3 / D4

Canonical branch: `concept2cure-v2`. Publication base:
`2f5c5129356af05b7d9fb428270d9ea3670ae9b9`.
Owned production scope: `server/services/ana-ri/context-enrichment.ts`.
No UI contribution.

## Delivered behavior

Overlapping deficiency, reviewer-simulation and agency-question triggers read
the same deficiency context for the same tenant/project. A lazy raw promise
now shares that existing helper result within one enrichment invocation.
The existing consumers keep their individual deadline/reporting wrappers,
source labels, repeated prompt contributions and composition algorithm.

The mounted stream reaches this path through `enrichContextForChat`. Existing
slash-command and natural-language helper call sites use the same callback.
Unrelated turns do not start the read. Later invocations, including concurrent
tenants/projects, read separately. There is no cross-turn cache, TTL, dependency,
public signature, model, tool, integration or new capability.

The underlying helper, memory SQL, tenant/project arguments, live RIM-pattern
lookup, output formatting and catches remain unchanged. Existing fail-soft
memory handling remains. Sharing does not add a transaction snapshot or cancel
an in-flight database query when a consumer's deadline expires.

## Qualification

| Check | Result |
| --- | --- |
| Regression checks against original source | Both selected checks failed; 18 cases skipped |
| Final focused suite | 20 passed, zero failed or skipped |
| Fixed-seam output comparisons | All 15 complete `EnrichmentResult` objects match |
| Overlapping deficiency reads | Three reads become one; recurring lookup also three to one |
| Broader AnA qualification | 519 passed across 32 files in 54.485s; zero failed or skipped |
| Forced lint | Zero errors; six unchanged production warnings; zero new-test warnings |
| Production build | Passed in 18.692s |
| Unchanged full pre-push gate | Passed in 56.103s |
| TypeScript gate | Zero errors, `tsc` exit zero; baseline remains zero |
| Independent review | Source, focused tests and evidence approved without blockers |

The final source checkpoint qualified by the full pre-push gate is
`8591a68ca51a95e36d753cba3f511ace6494ad66` against publication base `2f5c5129356af05b7d9fb428270d9ea3670ae9b9`.
The existing native TypeScript cache-preparation helper ran in 2 bounded
processes with zero unchecked files and zero cached diagnostic files remaining.
Preparation is not the typecheck verdict; the unchanged repository gate then
ran `tsc --noEmit --incremental`. Node 22.23.3 and a 6656 MB heap were used.
No compiler configuration, gate, lint suppression or baseline was changed.

Healthy, empty, thrown/rejected memory, live-pattern fallback and timeout fixtures
compare the original and candidate results, including all eight slash consumers.
The healthy overlap retains repeated prompt content and source metadata. Timeout
fixtures retain healthy precedent output and the original unavailable-source
keys, and a late result does not mutate the returned enrichment result.
Unrelated turns remain lazy; fresh, concurrent, resolved-project and missing
scope cases are covered by the focused suite.

The memory reader, deficiency helper and deadline-budget implementation are
byte-identical to the base. The independent reviewer made no edits and did not
run tests. Candidate capture metadata was corrected from a copied fixture label
to the capture's source checkpoint; captured outputs and counts were unchanged.

The final whitespace check found trailing empty lines in the new test. Exactly
two trailing LF bytes were removed; every preceding byte and the production
source remained unchanged. `formatting-correction.json` pins both versions.
Both the focused and broader suites, forced lint and the full pre-push gate were
rerun against the final files. Earlier evidence is retained under
`before-formatting-*`. The production build and 15 output comparisons qualify
the identical final production blob.

These are controlled fixtures and a scoped regression suite, not a production
latency benchmark or a full-repository test run. Natural-trigger composition
still follows completion timing. Sharing may change settlement timing, so exact
whole-prompt ordering is established only for the fixed tested seams. One shared
raw result also removes repeated snapshots/retry attempts within that turn;
underlying fail-soft behavior remains unchanged.

## Publication boundaries

Qualified production blob: `44f9e4bdd9707ca6811a6a42dce90c74d8d8f47f`.
Qualified focused-test blob: `b44b80cce4b75b093bdb89070b3265de57328493`.
Unchanged client subtree: `f4a50c306387585250e354c68e08a099362e3823`.
SHA-256 pins are in `source-files.json`.
Publication uses an expected-SHA, non-force update of `concept2cure-v2` and
verifies each uploaded blob and the complete resulting tree. Source publication
is separate from production deployment. Remote CI status is reported separately.
