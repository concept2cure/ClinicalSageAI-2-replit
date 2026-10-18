# Authoring creation recovery for Codespaces human testing

W1 / D2. Canonical branch: `concept2cure-v2`; direct incremental commits and
pushes, without PRs. This work qualifies the existing local development workflow,
not a deployment. Evidence belongs under
`docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/create-recovery/`.

The current New document/New section drawer can repeat a pending POST, follow
the shell's new project while the editor holds the previous one, and adopt a
late receipt after navigation. Its document callback also cannot open a newly
created draft from an Approved/Frozen filter or pinned conversation canvas.

## Contract

- Keep `AuthoringCreateExport`, `C2CForm`, `DocumentWorkbench` and all existing
  authoring endpoints. No new editor, route, data store, dependency or CSS.
- Pass the workbench's effective `programId` and `programSwitchHeld` into the
  creation component. Legacy direct callers may omit the project prop and use
  the existing shell project. Explicit null never falls back to the shell.
- Refuse creation during a held project switch or mismatch with the shell.
  Pin the program and document at request start. Guard synchronous duplicate
  clicks and suppress stale success, failure, navigation and pending-state
  updates after context changes, round trips or unmount.
- Show pending creation using the existing form busy state. Keep retryable
  refusals distinct from an unknown outcome (network, 5xx, unreadable or
  mismatched successful receipt). Unknown outcomes never claim nothing was
  persisted and block another POST until an explicit successful scoped read.
- A confirmed document receipt must identify the requested project/template;
  a section receipt must identify the requested document. Use the returned ID.
- Recovery uses existing scoped document/section GETs, validates the response
  shape and scope, and invokes optional `onCheckCreation(kind)` to refresh/show
  the existing host. Failed reads do not release the unknown-outcome guard.
  A check is a read, never an automatic repeat creation.
- Route confirmed document opens through the existing `openPulledDocument`
  exact-ID handoff and live unsaved-work guard. Preserve pending created IDs so
  a canceled leave decision can be retried without another POST. Consult the
  current leave guard after asynchronous section/list refreshes.
- Keep the 305 canonical templates, full guidance, source identity, AnA
  remedies, review gates and Data Room/Vault/project paths intact.
- Render creation and export recovery in the workbench's existing notice area,
  outside the touch toolbar's horizontal scroller. A portal changes placement
  only; standalone callers keep the inline fallback and no CSS is added.

## Current-role finding from the real local rehearsal

The isolated fresh PostgreSQL/Express rehearsal found that a former creator
downgraded to Viewer could still PATCH their section through a durable document
OWNER/AUTHOR grant, with both an old admin JWT and a fresh viewer JWT. The metadata
read already reports the current viewer role. This is a blocking authorization
finding, separate from the creation interaction fixes above.

The follow-up uses the canonical authoring permission engine and current
authenticated identity for the same account and organization. Current read-only
membership must refuse writes before historical document grants or stale token
roles can override it; legitimate current author reads/writes and narrower ACLs
remain intact. No additional authorization store, migration or approval bypass
is introduced. Capture the route failure before fixing it, check current-role
and ACL boundaries, then repeat the actual local HTTP denial and positive control.

## Verification and human handoff

Capture actual failing UI regressions before implementing the fixes, then
exercise duplicate clicks, uncertain-result recovery and failed recovery reads,
held/changed/round-trip projects, stale replies, pinned/filter handoffs and dirty
editor leave decisions. Preserve existing creation, template-loading, export
and source-pull tests. Inspect the actual drawer/recovery states in desktop and
touch light/dark; keep synthetic API limitations explicit. Run focused lint,
compiler, build and normal canonical publication hooks without changing baselines.

The human runbook targets a private Codespaces forwarded port, explicit local
database configuration and the current native editor. Manual editor testing and
the provider-dependent AnA lane receive separate, honest prerequisites. No
provider credential is provisioned or model invoked by this increment.
