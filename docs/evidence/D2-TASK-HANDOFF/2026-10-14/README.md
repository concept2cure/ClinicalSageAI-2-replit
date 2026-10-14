# Your work → exact native task

W1 / D2, 2026-10-14. Contract:
[`TASK_DRAWER_HANDOFF_2026-10-14.md`](../../../design/TASK_DRAWER_HANDOFF_2026-10-14.md).
Baseline: `6ffcb425284d68c159fbfc8c4af78e52b589504a`, canonical
`concept2cure-v2`. This increment finishes an existing handoff; it introduces no
store, endpoint, task model, editor or approval engine.

Assigned task and unified task approval rows retain their exact business IDs.
The existing TaskBoard refreshes its org-scoped read before opening its native
detail, including on an already-open board with excluding filters. Duplicate
titles never identify a task. Consumed identity-bound URL parameters allow the
same task to reopen and cannot silently ambush a later visit. Unavailable,
archived, ambiguous and unreadable unified-store targets are explicit refusals.
Other task stores and unrelated review/workflow queue IDs retain their native
semantics and destinations.

Existing task detail, create, workflow and signature dialogs keep ownership of
in-progress work. The drawer shares the Workbench's current dirty/busy refusal,
including its triage exit. It never saves or discards edits implicitly. Actor/org
replacement retires old drawer/board reads and callbacks, including A → B → A
and token replacement before React renders. The existing optional workflow
assignment rechecks the original owner and pins that actor's request headers;
an accepted creation remains a fact if its follow-up cannot proceed.

## Browser boundary

The retained browser driver and component harness use the real TaskTray,
TaskBoard, AuthProvider, query, router and shipped styles, with synthetic API and
account responses intercepted by Playwright. They are not a deployed server,
PostgreSQL/RLS or live credential/signature test. Four scenarios passed in real
Chromium: desktop/light and 390px phone/dark exact selection through hidden
filters, a removed target, and a same-tick account replacement. All made zero
writes; no page errors or horizontal overflow. Screenshots and
[`browser-results.json`](browser-results.json) are retained. The phone exercise
also verified that the native detail action row wraps, keeping Advance visible.

## Verification

- Failing first: [`tray-before.txt`](tray-before.txt) shows the lost-ID defect
  (expected identity-bound task destination, received only `tasks`). The board's
  failing-first log covers ignored exact IDs, same-surface selection and
  other-store refusal.
- Final focused regression: **218/218 tests in 21 suites**, including the
  35 exact-target/workflow cases and 13 existing refusal cases. Production
  client/server build, design-system, token contrast, canvas-path and shipped
  component-class coverage checks passed. Official compiler: **0 errors**,
  baseline unchanged at zero. Ordinary push-gate results are recorded beside
  this note after publication. The compiler first
  caught an unsupported Testing Library selector option in the new test; that
  option was removed and all 35 target tests reran green, without a baseline
  change. No gate, authority check or test is
  disabled or skipped to publish this work.
- [`beta-setup-audit.md`](beta-setup-audit.md) explains the corrected seed/setup
  claim. The seed script emits a description, not persisted test records.

## Human acceptance remains to execute

Follow the existing [human beta checklist](../../../testing/HUMAN_BETA_CHECKLIST_V1.md)
with actual authorized accounts, organization/program/task/document IDs and the
deployed release. A named two-person witness, current membership/private-access
checks, configured MFA, live PostgreSQL/RLS, storage/scanning and required native
signature outcomes remain deployed acceptance work. These source/browser checks
make no certification, clinical validation or regulated intended-use claim.

## Independent review

Read-only review identified and rechecked three corrected paths: triage shared
the drawer exit guard; retired board callbacks received a monotonic owner
generation and fresh-bearer check; optional workflow assignment received captured
headers and post-await ownership checks. The reviewer inspected the fresh-read,
query-consumption, partial-store and native ceremony protections and their actual
regressions, then re-read the final workflow repair and its five failing-first
cases. No remaining concrete defect was found in this bounded review.

The broader shell check found a mock compatibility regression before transport:
the drawer had imported a second auth hook while existing Shell callers used
`useAuth`. The drawer now uses that same canonical hook. The four unchanged
shell suites passed 52/52 (66/66 including drawer cases); no legacy shell
assertion or mock was weakened. The first push was interrupted before GitHub
received it, then ordinary publication gates reran on the corrected source.

The preceding exact `6ffcb425` hosted run passed its 1433/1433 proof tier,
zero-error compiler, blank-database migration and production boot with RLS and a
non-superuser role. Its broad Test exposed an older project-creation fixture
without the now-required current membership (24/26 failures). The bounded
fixture-only repair retains every original business assertion and the actual
production admission service; [dedicated evidence](project-create-fixture.md) records 30/30 including missing
membership, foreign organization, viewer and locked-read revocation cases. This
modeled-query route test does not establish deployed database authorization.
