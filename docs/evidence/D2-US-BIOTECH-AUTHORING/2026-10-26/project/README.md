# Recorded project and filing authoring

Local deterministic checks for contract item 3 in `docs/design/US_BIOTECH_AUTHORING_COMPLETION_2026-10-26.md`. No Git publication, global build/compiler, provider calls or agency actions were run by this worker.

## What already exists

`ProjectPlan`, `ProjectHome`, `AuthoringCreateExport`, `AuthoringTemplatePicker` and `DocumentWorkbench` own the current journey. The canonical registry, `resolveProjectMap`, saved filing outline reader, project assignments, authoring template roster and `useAuthoringCreation` own identity, guidance, reads and creation. The original `DocumentAuthoring` working-list reader already guards current project/session and exact recovery readback; its body was extracted unchanged to `editor/useScopedDocuments.ts` for reuse. `reader-extraction.json` records the exact baseline comparison.

The admitted project detail serializer already strips private metadata. Its new optional public `registry_id` resolves recorded `submissionTypeId` through the existing canonical resolver, retaining type/agency fallback and unknown-source ambiguity. Present malformed IDs do not silently become IND. No raw metadata is exposed.

## Result and boundaries

- Recorded US/GLOBAL biotech filings now reach a plan with the saved filing outline, canonical work guidance, existing assignments, and exact filing/shared template starts. NDA, BLA, 351(k) and 505(b)(2) context are separately tested. Guidance explicitly carries no legal completeness verdict. An absent exact identity cannot be inferred from a project title.
- The existing global native picker remains available and searchable. Recorded filing/shared templates form a recommendation group; no filing is selected automatically. Actual selected template identity and module enter the existing creation writer. Blank documents start without an invented CTD placement.
- Current saved template identity takes priority over the project default when the editor reopens. A current primary identity requires the exact requested project reply and current session. Replacing the account at the same project retires the old identity and rejects late replies. A form opened before a project/filing change refuses creation.
- Plan template starts use the same current working-list reader and existing creation/recovery writer. Rows remain mounted while the host refreshes, so uncertain attempts retain their ledger. An identified outcome opens only after exact record and current host readback. Stale project/account replies do not open a document.

Transport/database replies are isolated fixtures. These checks prove caller reachability, payloads, read ownership and existing editor handoff; they do not prove live database persistence, regulatory applicability, a complete filing, rendering fidelity, provider quality, human acceptance or agency dispatch. The plan displays the existing saved home filing outline; it does not add an alternate market-planning engine. Existing DOCX import/export layout limitations remain.

## Retained execution evidence

Each receipt includes actual command, Node version, timing, source hashes before/after, raw-output gzip hash and drift result. Prepatch source snapshots and assertion files are retained as gzip files, rather than rewritten after the result.

| Receipt | Actual outcome | Interpretation |
| --- | --- | --- |
| `red.json` | 14 failed, 29 passed, 3 suites; no drift | Original missing filing plan/picker/context behavior. Original blank-module assertion is retained in the prepatch snapshot. |
| `green.json` | 6 failed, 37 passed; no drift | New Plan fixture lacked the real hook's auth provider. `green-calibration.json` discloses the setup correction. |
| `green-corrected.json` | 43 passed, 3 suites; no drift | Corrected current-session fixture; no production auth bypass. |
| `identity-red.json` | 3 failed, 9 passed; no drift | Malformed recorded IDs incorrectly fell back to IND before the serializer guard. |
| `recovery-red.json` | 2 failed, 7 passed; no drift | Host refresh unmounted creation rows and hid exact identified recovery. |
| `green-final.json` | 1 failed, 48 passed; no drift | Readback state was retained, but the row still displayed the earlier toast instead of the existing hook's updated message. Corrected by displaying the current state message. |
| `green-settled.json` | 80 passed, 4 suites; no drift | Includes saved-template reopen context and actual Plan actor/project/recovery caller cases. |
| `session-red.json` | 4 failed; no drift | Missing/wrong reply project identity and same-project account replacement admitted stale registry context. |
| `qualified-targets.json` | 84 passed, 5 suites; no drift | Final targeted behavior after current-session hardening and action-helper extraction. |
| `qualified-regressions.json` | 212 passed, 11 suites; no drift | Existing reader/editor/plan/market/creation behavior after the final source changes. |
| `qualified-lint.json` | exit 0; no drift | All 15 scoped files: zero errors and zero warning growth by severity/rule against recorded Git HEAD. Existing 21 warnings remain in the three pre-existing large owners; new/extracted owners have zero warnings. |

`qualification-inputs.json` and `regression-inputs.json` pin the tested source; `qualified-*.gz` preserve the final changed source. `lint-initial-details.json` and `lint-after-recovery-details.json` retain warnings found and resolved through helper extraction; no suppression or baseline ratchet was changed. `check-lint.mjs` uses the normal ESLint configuration and actual recorded HEAD source per file.

## Independent review corrections

The earlier qualification did not exercise all owner/visit changes. Independent review found that a retained creation form could revive after a project/filing round trip or account/session replacement. Project home and the guided template catalog also used generic reads that could retain a previous actor's data at the same project UUID. These findings were reproduced before the corrections below.

The existing `useLiveData` now accepts an optional fourth `{ key, current }` owner argument; its third shape guard and unowned caller contract are retained. Owned data is masked during render when the current visit changes, with captured current-owner checks before request initiation and completion. Returning to an earlier key creates a fresh visit; retiring and later revalidating a predicate requires another read. Project home, guided templates and the existing New document roster consume this owner through the canonical authoring read-session guard. No second fetch service was added. HAQ consumes the same optional contract; its separate evidence belongs to its worker.

The creation form captures a visit object containing the effective/shell projects, recorded filing context and canonical actor/session. Once that visit changes, the old form remains retired until an explicit close and reopen, including A → B → A. Existing uncertain creation ledgers remain in the existing creation hook. A reopened form reads the current account's roster and sends current actor headers.

| Receipt | Actual outcome | Interpretation |
| --- | --- | --- |
| `review-red.json` | 7 failed, 28 passed, 2 suites; no drift | Four stale-form revival cases and three owned-reader cases before their correction. |
| `plan-owner-red.json` | 2 failed, 9 passed; no drift | Earlier organization catalog and Project home registry remained visible after an account change at the same project. |
| `review-green.json` | 93 passed, 6 suites; no drift | First corrected behavior. |
| `review-lint.json` | exit 1; no drift | Added tests pushed one describe callback above 100 lines; split the parallel scenario groups without a suppression. |
| `review-settled.json` | 94 passed, 6 suites; no drift | Adds fresh catalog/current-header creation after explicit reopen and predicate retirement/revalidation readback. |
| `review-settled-lint.json` | exit 0; no drift | All 17 scoped files have zero errors and zero warning growth. |
| `review-regressions.json` | 272 passed, 15 suites; no drift | Existing editor/project/creation regressions plus unowned object-reader, shape and failure contracts. |
| `batched-red.json` | 1 failed, 33 skipped; no drift | A project round trip published in one batched turn bypassed render-observed scope changes and sent one unwanted creation POST. |
| `review-final.json` | 95 passed, 6 suites; no drift | Uses the existing shell-project revision guard as well as live form-submit admission; the batched round trip requires explicit reopen too. |
| `review-final-lint.json` | exit 0; no drift | Final 17-file warning ratchet after the shell-project guard. |
| `review-final-creation-regressions.json` | 159 passed, 4 suites; no drift | Repeats the existing creation/recovery/owner/host cases affected by the final form-only correction. |

The latest stable source is pinned by `review-final-inputs.json` with `review-final-*.gz` snapshots; `review-final-regression-inputs.json` additionally pins the existing reader/editor/project/creation regression inputs. The shared `dataConnect.tsx` production API is unchanged between the first review green and this final freeze. Earlier freezes and original failures remain retained as historical evidence.
