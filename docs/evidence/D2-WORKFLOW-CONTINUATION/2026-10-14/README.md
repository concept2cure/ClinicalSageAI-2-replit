# Existing Authoring human review, connected and bound

W1 / D2 continuation, 2026-10-14, canonical `concept2cure-v2`. Initial audit
`269d2c18c`; synchronized with `71444466b` before final verification. Approved
[technical contract](../../../design/AUTHORING_HUMAN_REVIEW_BINDING_2026-10-14.md).
[Source manifest](source-manifest.json) pins the changed code and tests.

The existing Review board now opens the complete saved Authoring document with
the native section/table/figure renderer before recording a decision. A decision
starts unstated, captures the actor, organization, saved snapshot and request,
and confirms the returned audited receipt. The existing task rail and project
review summaries distinguish current, stale and legacy unbound verdicts.
Confirmed saves refresh the native review/task standing.

The native endpoints require current membership, project access, full-document
permission, the actor's actual assignment and independent authorship. Requested
reviewer names/emails come from current members. The canonical author resolver
reads the original creator, immutable prose revisions and existing visible-write
audits for headings, section creation and order. A section-only grant cannot
read the complete document. Queue admission happens before private content is
selected and is checked again before returning.

Verdict, existing task transitions and audit records commit together. Full
snapshot JSON, hash, basis and before/after facts remain in the existing audit.
The current review index gains three nullable fields through both replayable
creator migrations, with no legacy backfill. Re-request rotates the existing
row id, retains its natural document/reviewer/tenant uniqueness, and preserves
older round ids in audit/signature facts. Timestamp rounding cannot admit an
older dialog into a new request.

Known-source REVIEWER adoption and release now require the same verified
content-bound verdict and current contributor independence. A reviewer's later
contribution cannot be laundered through an earlier approval, even when bytes
were restored. Historical signatures stay intact. Canonical full snapshot reads
use signing's total section order when indices tie. The legacy signature digest,
ordinary final-approval policy, qualification holds and required task signing
remain unchanged.

## Verification

- **726/726 tests in 39 suites**, one combined final run after upstream sync,
  covering native HTTP/SQL, UI/transport, authorship, private queue admission,
  migration upgrade/replay, adoption/release, existing signatures, exports and
  governed figures: [combined-regression.txt](combined-regression.txt). The two
  affected test fixtures were then replayed after type-only fixes: 21/21 in
  [fixture-type-recheck.txt](fixture-type-recheck.txt), included in that unique count.
- Official zero-baseline compiler and production build results are recorded in
  [release-verification.json](release-verification.json). Publication hooks and
  hosted outcomes are added when observed; no baseline increase or bypass.
- Real Chromium, actual AuthProvider/Review/components and canonical transport,
  with explicitly synthetic API responses: two-section complete saved read,
  native table, unstated decision, exact request/binding headers, confirmed
  receipt after queue-empty refresh, stale-content refusal, and account swap
  refusing before dispatch. Desktop 1440/light and phone 390/dark; no horizontal
  overflow or page errors. [Browser results](browser-verification.json),
  [desktop read](light-desktop-saved-read.png),
  [phone read](dark-phone-saved-read.png),
  [phone receipt](dark-phone-receipt.png).
- No new production dependencies, table, renderer, approval engine, tool or
  module. SQL interpolation allowance decreases from four to three in the
  native router after removal of its old interpolated peer-review query.

Meaningful negatives failed before repair: the old direct endpoint accepted
unassigned/self verdicts; private board content leaked to a denied same-tenant
reader; the UI posted unbound decisions and trusted unaudited success; adoption
accepted earlier prose/title and unbound verdicts. Independent checks additionally
proved heading-only writers could approve their own heading and distinct
PostgreSQL request timestamps could collapse to one JavaScript millisecond.
The corresponding final canonical tests now pass. Exact local boundaries and
safe verdict metadata are in [backend verification](backend-verification.md)
and [board/authorship verification](board-and-authorship.md). Saved release
ordering and adoption negatives are retained under [red/](red/).

The pre-existing document-access fixture initially failed its setup because it
omitted current project/member prerequisites. It now opts into the already
existing `AUTHORING_ACCESS_DDL` and supplies the request client; all eight cases
pass in the final combined run. Production admission was not weakened.

## Human and production boundary

[Human beta checklist](../../../testing/HUMAN_BETA_CHECKLIST_V1.md) contains the
exact two-person review, stale dialog, re-request, contributor, private access
and account-switch checks. Automated database cases use canonical DDL on PGlite
and deterministic mutation hooks. They do not qualify deployed PostgreSQL/RLS,
multi-session lock scheduling, production identity, external storage/scanning,
or regulated intended use. The browser checks exercise real client code with
synthetic API replies; a partner's deployed workflow must still be witnessed.

TaskTray exact-task navigation and readiness target remediation are confirmed
separate opportunities, left for the next continuation.
