# A2.10: merged filing-reference fold and expanded parity review

Launch row D2, `concept2cure-v2`, 2026-10-26. Convergence of continuation `37f2ed240` and published A2.10a `c7f320403`.

## What already exists

Both changes extend the same RegistryPicker/Projects/ProjectPlan, filing catalogue,
alias action and catalogue seed owners. They are converged into one shared
`shared/regulatory/filing-lifecycle-reference.ts` with the incoming exact
admission and recorded type/agency checks, and one
`surfaces/FilingLifecycleReference.tsx` projection. No parallel reference widget,
project creator, grant or filing store is retained. Existing unavailable-file
inspection and its distinct AnA context are carried alongside the stronger
reference safeguards. Server detail exposes only a normalized exact active
catalogue identity, withholding unknown/broad aliases and private metadata.

The existing catalogue-claims PGlite suite owns actual subscription/FK replay
proof; this merge reaches its fresh-install check there and removes the smaller
parallel fixture test after carrying its assertion. Both catalogue migration
writers remain amended in place; existing subscriptions/metadata stay intact.

## Source attribution

- [Continuation snapshot](pre-merge-37f2ed240/README.md): 378 focused tests,
  16 native database cases, three browser flows and build qualified its source.
  These are historical, not claims about the merged implementation.
- [Published A2.10a](../A2.10a/README.md) retains its own accepted checks and
  source hashes. No accepted evidence is discarded or relabelled as merged.
- `merged/` will record the final combined source, tests, native browser/build
  proof and normal publication receipt after qualification.

The four other folds retain their documented data/function/admission gaps;
see `.design/client-journey/A2_10_REMAINING_PARITY_REVIEW.md`. CRO label fixes and
existing project-command metadata clarification are preserved. Formal revised
OQ remains unexecuted/unsigned, with historical executions retained.


## Current combined result

The two filing implementations now share the stricter existing exact-reference
API and one collapsed `surfaces/FilingLifecycleReference.tsx` projection. The
incoming admission map and recorded agency/type matcher are byte-identical;
metadata stays inspectable even where no clock/guide applies. Broad/legacy
filing aliases and unknown IDs are withheld by the public detail projection.
Unavailable inspection remains a distinct, cleared AnA fact and never selects
or creates a filing. Shared catalogue metadata and server offer/build facts
retain their separate bases. Project guard/handler/dispatch/audit behavior and
commercial admission are unchanged.

| Combined check | Observed result | Evidence |
| --- | --- | --- |
| Focused regression union | 671 passed, 48 disjoint suites, 100.43 seconds | `merged/qualified.log.gz`, `merged/test-files.txt` |
| Native authenticated browser | 4 passed, 47.0 seconds: both complementary filing workflows, IND and 510(k) Plan/reload/mobile, no premature Create and no model send | `merged/browser.log.gz`, `merged/native/` |
| Production build | Client 21.21 seconds; server and audit verifier complete | `merged/build.log.gz` |
| Canonical serializer + real catalogue replay | 46 passed, 2 suites; included in the combined union | `merged/server-catalog.log.gz` |
| Strict reference/picker/Plan context integration | 144 passed, 8 suites; included in the combined union | `merged/filing-focused.log.gz` |
| Native PostgreSQL intake SQL | 16 unique native cases passed cleanly; 6.88 seconds, confirmed in 7.31 seconds after teardown repair | `merged/native-cleanup-review.md`, `merged/native-cleanup-green.log.gz`, `merged/native-cleanup-confirm.log.gz` |
| Surface context, CSS classes and text ramp | Passed | `merged/context-gate.log.gz`, `merged/css.log.gz`, `merged/ramp.log.gz` |
| Formal traceability | 117 parent requirement IDs preserved; 69 historical pass, 2 partial, 46 uncovered; revised 007a has no executed step | `merged-formal-review.md` and its proof/logs |
| Normal publication gates | Pending normal accepted push | Receipt will be filed after acceptance |

The smaller parallel catalogue replay test is removed after its fresh-install
assertions are carried into the existing actual-schema
`tests/schema-contract/catalog-module-claims.contract.test.ts`, alongside its
real subscription/cascading-FK replay checks. Historical red/green proof remains
in the pre-merge snapshot. One duplicate reference widget is likewise removed
after all metadata/context/refusal functions and tests move to the sole owner.
`merged/source-review.md` independently compares admission declarations, exact
projection, command handler bodies, scope arrays and six guard/service owners.

The native SQL rerun exposed a pool teardown race after all assertions: pool.end
could finish before client TCP end acknowledgements, so DROP DATABASE WITH FORCE
terminated two still-closing owner connections. The final cleanup awaits
real client end acknowledgements and drops the disposable database without FORCE;
no production behavior or assertion is relaxed. The failing execution is kept
and is not represented as a clean native pass.

The revised formal requirement/protocol is v0.10 and remains unexecuted/unsigned.
No historical result is promoted to a merged formal pass. A2.10's four other
folds remain open, with their stores/screens preserved. Continue A3's existing
prompt-key convergence while tracking those concrete prerequisites.


Final native cleanup preserves the functional test body byte-for-byte and both
repeats exit zero with no unhandled errors. The sixteen cases are counted once.
The existing catalogue SQL test also rechecks exact retired metadata/tier
preservation on the final assertion set (`merged/catalog-final.log.gz`); this
is a stricter affected-suite rerun, not an extra test count.
