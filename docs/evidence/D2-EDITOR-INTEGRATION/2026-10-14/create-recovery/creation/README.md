# Existing creation drawer: independent behavioral evaluation

W1 / D2, local Codespaces testing only, on `concept2cure-v2`.
The final run passes **107 cases in two files**: 81 new cases exercising the
actual `AuthoringCreateExport` and actual `C2CForm`, plus all 26 existing
creation/export cases. Only transport is synthetic in the new suite; no helper,
hook, form, provider, or editor implementation is mocked.

The new tests verify synchronous duplicate document/section activation, the
existing busy drawer, cancellation retaining pending protection, uncertain
outcomes blocking another POST, explicit scoped read recovery, six different
failed recovery reads for each kind, empty reads, overlapping checks, and
retryable 4xx refusals. Receipts must match project/template/document scope;
malformed or explicitly unsuccessful receipts cannot confirm creation. Returned
IDs deliberately need not be UUID-shaped. Explicit null, held switches, shell
mismatches, and a shell change with an already open drawer are covered.

The delayed-work matrix covers document and project changes, project A → B → A,
unmount, late response success/failure, and late JSON success/failure. Separate
cases prove an old creation cannot unlock a newer pending request and a stale
check cannot clear uncertainty or strand the check control after a round trip.
Successful recovery only refreshes the existing host; it creates nothing and
does not manufacture a confirmed creation receipt.

## Actual failures and qualifications

- `initial-red.txt`: seven substantive failures before production changes:
  duplicate POSTs twice, missing pending state twice, explicit-null fallback,
  stale adoption after a project round trip, and an unreadable successful reply
  falsely claiming nothing persisted. A label-query setup mistake was corrected
  before this recorded run.
- `expanded-red.txt`: 61 failures and four passes across the initial 65-case
  expansion, against the original component. Its exact test snapshot is retained
  in `expanded-red-suite.tsx.txt` and pinned in `test-evaluation.json`.
- `first-integration.txt`: 96 passes and five failures. Two assertions required
  reopening a pending drawer; the intended UI keeps New disabled while pending.
  Those tests now verify cancellation retains the guard and reopening works only
  after completion. The other failures exposed the canonical document list's
  `program_id` alias and a section read marked `success:false` being accepted.
- `intermediate-green-101.txt`: 101 passes after those corrections.
- `stale-check-supplement.txt`: four passes, 75 skipped. These added cases already
  passed against the cleanup fix; this is supplementary green evidence, not a
  claimed failing run. The scratch filename happened to contain `red`.
- `unsuccessful-receipt-red.txt`: two failures, 79 skipped, proving HTTP 201 with
  `success:false` and an otherwise matching row still caused false confirmation.
  The fix requires `success:true`; the tested intermediate hook and test snapshot
  are retained as historical text evidence.
- `pre-notice-placement-green-107.txt`: 107 passes after the success-flag fix and
  form-helper extraction. Its original source pins remain in the manifest.
- `final-green.txt`: **107 passes, zero failures**, rerun after the optional
  `noticeContainer` portal and pure `documentReceipt` extraction. The same tests
  and assertions ran unchanged. All current source and test hashes are pinned.

The notice change followed separate touch-browser evidence of clipped notices.
Production now places them in the existing Workbench notice area when its host
is provided. These direct component tests retain coverage of the inline fallback;
the Workbench evaluator independently tests host placement. The shortened
persistent creation notice preserves the full binding and seed information in
the existing toast, whose legacy assertions still pass.

The legacy tests changed only four synthetic receipt fixtures to carry the
canonical project/template/document fields. Their exact callback assertions,
unbound notices, export checks, and failure assertions remain intact. The newer
pending request test uses another current project; returning to an old project
does not authorize a blind repeat of an uncertain attempt.

## Lint and limits

The new suite, current creation component, and current creation hook pass strict
lint with zero errors and warnings. The legacy file
has zero errors and its unchanged existing `max-lines-per-function` warning
(147 lines), demonstrated by the current and baseline JSON results. The initial
combined strict attempt failed on that same existing warning; no baseline was
changed. The final new suite has no React act warnings. Existing legacy act
warnings and JSDOM download navigation notices remain in the actual log.

These are component tests with synthetic API replies. They do not establish
database persistence, deployed tenant isolation, provider availability, agency
acceptance, or regulatory readiness. The parent workstream's separate local
database, browser, build, compiler, and publication evidence governs those
claims. Historical `.txt` source snapshots are evidence, not executable product
paths. `test-evaluation.json` records exact commands, outcomes, hashes, and these
test calibrations. No production code, dependencies, routes, or CSS were added
by this evaluator.
