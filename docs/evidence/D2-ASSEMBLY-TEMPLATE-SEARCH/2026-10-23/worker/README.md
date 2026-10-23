# Existing assembly template discovery completion

## What already exists

- `client/src/concept2cure/v2/surfaces/AuthoringTemplatePicker.tsx` already owns
  searchable loaded metadata, the native select, retained selected options and
  Clear/focus. Root extended its optional assembly purpose and disabled inputs;
  this worker reuses that component rather than adding a picker.
- `editor/AuthoringAssemblyBuild.tsx`, `editor/useAuthoringAssemblyBuild.ts` and
  `editor/assemblyBuildState.ts` already own the one open document's assembly
  disclosure, per-owner/document buckets, exact outline/commit requests and
  manual/AnA controls. Previously the roster retained only ID/name and the
  assembly select exposed no search.
- `editor/authoringDraftTransport.ts::captureEditorDraftGuard`,
  `editor/assemblyBuildTransport.ts`, `editor/assemblySourceSelection.ts` and
  `editor/savedAssemblySourcesController.ts` already own current project/session
  checks, pinned transports, selected source identities and source reuse.
- `shared/authoring/recorded-template-source.ts` already validates recorded
  filing context; the worker reuses that parser for optional display facts.
- Existing `authoringAssemblyBuild`, `authoringAssemblySources`,
  `savedAssemblySourcesFlow` and `sourceFirstAssemblyFlow` suites exercise the
  assembly/AnA, exact-source and current-owner behavior. The focused new suite
  reaches assembly search with the actual hook, authentication service, shared
  picker and document disclosure. HTTP responses remain synthetic.

Repository-wide discovery and deleted-history findings are recorded in
`docs/design/ASSEMBLY_TEMPLATE_SEARCH_2026-10-23.md`. This worker changes only
the three assigned production files, its focused test and this evidence folder.
Root owns shared picker changes, actual Workbench additions, human guide,
compiler/build/gates and normal direct publication.

## Behavior qualified

The assembly roster retains allowlisted valid search strings, string arrays and
verified recorded context. It drops malformed optional display facts and fails
the whole roster on an invalid required row, empty/padded identity, invalid
numeric identity or select-value collision. Numeric IDs are normalized exactly
to their native select/wire string, with numeric/string collisions refused.

The existing picker searches that metadata inside the existing disclosure. Its
explicit Template label, native selection and Clear/focus remain in use; selected
nonmatches remain available and assembly offers no blank-document choice. No CSS
was added. Existing loading, busy, unknown and editor refusal holds disable it.

Query/Clear update only the current bucket's `templateQuery`: exact selected
source receipts, plan identity, chosen template, requirements, AnA setting and
other assembly fields remain unchanged and no HTTP request starts. Retained
callbacks capture bucket, key, context revision and actor/session identity;
document/project A-B-A, replacement session/account and unmount are refused.
Canonical same-session refresh keeps both the query and current callback valid.

## Actual checks and retained failures

All recorded checks used Node 22 through the existing scratch toolchain, without
dependency changes. JSON receipts record argv, exit, source pins before/after and
raw gzip SHA-256. Every recorded run has an empty source drift list.

| Receipt | Actual outcome | Interpretation |
| --- | --- | --- |
| `red.json` | Exit 1; 11 failed, 13 passed | Initial unqualified run contained test fixture errors: unsupported toggle helper and table argument shape. Retained transparently, not claimed as behavioral RED. |
| `qualified-red.json` | Exit 1; 19 failed, 5 passed | Corrected test fixtures before all owned production edits. Failures demonstrate discarded metadata, unsafe roster acceptance, missing query state and absent assembly search UI. |
| `lint-baseline.json` | Exit 0; four files each 0 errors/0 warnings | Baseline before owned production edits. |
| `green-initial.json` | Exit 1; 1 failed, 23 passed | The remaining assertion treated an absent optional source property as an own property with undefined value. Replaced it with a real selected-source manifest case. |
| `green-expanded.json` | Exit 0; 33 passed | Expanded ownership, refusal, real selected-source preservation and UI cases passed. |
| `lint-initial.json` | Exit 0; two complexity warnings | Both warnings resolved by extracting identity/catalog helpers; no warning baseline changed. |
| `green-cohort.json` | Exit 0; 106 passed across 5 suites | Final focused search plus existing assembly, AnA/source, saved-source and source-first regressions. |
| `lint-final.json` | Exit 0; four files each 0 errors/0 warnings | Forced explicit-file lint with `--no-ignore --max-warnings 0`. |

The original production RED snapshots and corrected RED test source are retained
as deterministic gzip files. `source-freeze.json` pins the exact final worker
production/test files, stable shared picker, bounded regression tests and relevant
contracts/guards/configuration. `final-*.gz` retain final owned source bytes.
`manifest.json` records all worker evidence file hashes, excluding itself.

No compiler, build, Git mutation, provider, agency submission, live database or
human acceptance check was performed by this worker. Broader root qualification
is separate. Search of loaded display metadata does not establish template
applicability or universal catalogue completeness.
