# Retain source-document starts in the existing native creator

## What already exists

`AuthoringCreateExport.tsx` owns the native C2CForm and template picker;
`useAuthoringCreation.ts` owns pinned actor requests, per-attempt creation
outcomes and deliberate recovery. The existing recovery ledger preserves
entries by owner/project/lane and guards pending or unknown navigation.
The selected-source context currently does not enter that ledger, and the
existing creator does not consume a source-start prop. These existing paths
are completed; no second form, writer, store or recovery transport is added.

This worker owns the two production paths, its focused context test and this
evidence folder. Root later authorized the narrow current-read fixture correction
in `taskDrawerCreationGuard.test.tsx`. Root captured the composed actual-flow RED
and released production editing after this worker's meaningful RED. Results are
recorded by actual commands with pins, UTC time, exit and raw gzip. No live
provider, native database, human acceptance or deployment is qualified. Initial
capture setup corrected the existing authService filename suffix before any
test executed; that setup error is not a feature RED.

## Implemented behavior

The existing creator accepts one `AuthoringDocumentStart` object and consumes each
offered identity once, including refused stale, held or ceremony-blocked offers.
It opens the existing C2CForm and searchable template picker and gives the selected
source count using the existing form notice. Ordinary button/event opening and
Cancel clear the active form context. Neither opening nor creating starts a build.

The existing creation ledger snapshots the optional source context before POST
and preserves it through pending, unknown, identified recovery and known-created
entries. Automatic and deliberate recovered opens use that entry's context,
even after a newer request or an ordinary form reset. Retired source ownership
refuses a new POST; retirement after a confirmed reply retains the known receipt
without adopting sources or navigating. Actual-outcome checks remain available.
Ordinary section creation, pinned actor headers and same-session bearer refresh
keep their existing behavior.

## Captured checks

| Receipt | Actual result | Interpretation |
| --- | --- | --- |
| `red.json` | 9 failed, 2 passed; exit 1 | Meaningful pre-production source-context/form behavior failures with 14 unchanged inputs. No missing-export or setup failure is counted. |
| `focused-green.json` | 11 passed; exit 0 | Initial focused correction. Later guard cases supersede this bounded count. |
| `lint-initial.json` | Exit 1, two warnings | Retained intermediate function-length/effect-dependency findings. |
| `lint-qualified.json` | Exit 1, one warning | Retained intermediate function-length finding. |
| `lint-final.json` | Exit 0 | Initial strict three-owned-file lint. |
| `green-final.json` | 174 passed, 2 failed; exit 1 | Both failures occurred before native editor mount: an older test fixture only recognized unscoped current detail/section URLs. Negative creation guards were not reached. |
| `green-qualified-final.json` | 9 suites, 176 passed; exit 0 | Final 15 focused creation cases plus existing creation, identified recovery, section recovery, actor ownership, template picker, task-drawer, dialog-focus and C2CForm accessibility regressions. |
| `lint-qualified-final.json` | Exit 0, no warnings | Strict lint of the two production paths and both owned tests. |

Final qualification uses `qualified-final-freeze.json`; all 22 pinned inputs
matched before and after both commands on Node v22.23.3. Every receipt includes
the exact command, UTC start, exit, pins and SHA-256 of its raw `.log.gz` output.
`regression-selection.json` lists the nine suites. Repeated/overlapping executions
must not be added together as distinct coverage.

The fixture correction admits the exact current detail and section URLs with
`?programId=<original-project>`, retains the explicitly separate bare section
recovery URL, and asserts that the actual host requested the scoped section URL.
It does not normalize away scope or weaken the old unknown/wrong-scope assertions.

The final owned-file snapshot is `owned-freeze.json`. Root owns actual
source-chooser → real creator → same-editor integration, cross-file race fixes,
compiler/build/global checks, human testing and Git publication. This worker ran
no compiler, build, global scan, dependency change or Git command.
