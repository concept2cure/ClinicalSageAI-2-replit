# Existing editor remedy lifecycle

W1 / D2 follow-through on `concept2cure-v2`, base `bd873886`. Evidence:
`docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/remedy-lifecycle/`.
This closes the remaining reject/discard reapplication gap recorded in
`saved-review/README.md`. Preserve one AnA, one canvas, existing editor controls,
source/version/model checks and governed decision/save paths. No new editor,
route, store, tool, provider, dependency or migration.
The final combined source is synchronized with `11fb58f1`; it preserves the
incoming session-switch reservation and current source-access safeguards.

## Identity and source of truth

The existing explicit replacement operation mints one application UUID, stamps
it on its real insertion/deletion marks and returns that receipt on success.
Preserve it through mark parse/render, range collection, grouping and decisions.
Ordinary typing-run grouping and legacy mark identities stay unchanged.
Include the application identity in decision IDs so reject/reapply/accept within
one minute and identical fixes in different sections cannot overwrite the same
decision projection. Source AnA turn attribution remains unchanged.

Expose receipt state from the existing rich-editor handle through the same
guarded bridge. The receipt names the application and editor instance; the
bridge adds its document/section scope. Pending presence comes only from live
canonical marks, including partially resolved groups. Actual accept decisions
in the mounted editor retain a local accepted-application set solely to prevent
retrying an already reviewed application; this is ephemeral lifecycle state,
not a second suggestion or regulated-content store.

States are pending, settled, absent and unavailable. Pending disables duplicate
application while any application mark survives. Settled disables retry after
any accepted part has been fully resolved. Absent permits another explicit
attempt after complete rejection, or after explicit local-draft discard returns
the editor to its saved baseline. A receipt from another editor instance can be
absent only after hydration with no unresolved device-draft choice and a clean
saved baseline; a restored modified draft without its marks is unavailable.
Never infer absence from an unmounted, other-section, source-mode or unsettled
editor. Notify subscribers after content/decision changes, readiness and local
Restore/Discard disposition, without rebuilding the conversation per keystroke.
Subscribe before refreshing the card's current snapshot so hydration between
render and subscription cannot leave its Apply button permanently disabled.

The first application uses the same availability gate as retries. The actual
editor handle refuses before hydration, live sync or its initial device-cache
read settles, behind an unresolved Restore/Discard choice, during save, and
synchronously after unmount even if TipTap destruction is deferred. An
unreadable best-effort device cache must not strand known application state.

Every retry passes the unchanged model/turn qualification, current section,
editable view, saved hash/timestamp, exact quote/context and overlap guards.
Acceptance, partial resolution, stale saved base, unknown state, freezing and
late async results never authorize another edit. No automatic save/approval.
The existing remedy card uses this receipt state instead of a permanent local
boolean and states the current outcome using its existing button/note pattern.
Older callers without an observable receipt remain conservatively disabled
after confirmed application rather than inventing absence.

## Ownership and verification

Root owns bridge integration, AuthoringRemedies, real workbench/navigation
regressions, contract/evidence and release gates. The lifecycle implementation
session owns suggestions.ts, RichSectionEditor and a small helper if needed.
The independent test session owns low-level proposal/lifecycle test files and
captures actual before failures before implementation starts. Sessions never
write another session's production or test files.

Prove full rejection/retry, partial decisions, acceptance, deletion-only
applications, distinct adjacent same-turn attempts, serialization, same-minute
decision IDs, cache Restore versus explicit Discard, current section/document
scope, stale bases and no save/approval side effects. Preserve all IND template,
source/catalogue/Data Room/Vault/project and single-editor regressions. Then
run browser desktop/touch light/dark, compiler/build/design/import/warning and
normal commit/push gates without baseline or hook bypass.

Saved-template oversight context and older authoring-read authorization findings
from the independent audit remain separate bounded follow-through work; this
change does not broaden the lifecycle patch into new authorization/tool paths.
