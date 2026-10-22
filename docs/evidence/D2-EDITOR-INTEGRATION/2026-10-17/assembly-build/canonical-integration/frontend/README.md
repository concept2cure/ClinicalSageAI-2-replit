# Canonical editor integration

The incoming canonical Workbench added explicit edit authority, same-surface
document targets, notification URL restoration, governed-form holds and a dirty
Back decision. Its project channel added a canonical tenant-boundary clear;
the AuthService addition stores an MFA challenge without changing session-read
guard semantics.

The auto-merged Workbench retains one rich editor, controlled AnA review
sessions, exact document/section acceptance guards, the stable acceptance
callback alias and assembly inside the existing document scroll region.

Assembly now receives the existing explicit edit-refusal reason. Its canonical
admission check returns that exact reason, and its operation signature changes
when the decision changes, invalidating a preview or pending operation across a
denial/restoration. Missing edit metadata retains the existing unknown-access
policy. Read-only saved-record checks remain read-only; the denial is never
described as a frozen document.

The added actual Workbench case previews successfully, then receives a fresh
server refusal. It checks the native editor and assembly controls are read
only, the exact reason is shown, saved text remains and no structural commit or
AnA generation starts. `edit-permission-red.json` preserves its failure before
the integration fix.

Two incoming notification/deep-link fixtures replaced the AuthService module
with only a display hook. They now preserve the actual module exports while
retaining that display stub, matching the existing partial-mock convention.
Their assertions are unchanged.

The targeted run passed **242/242 across 11 files**. It covers assembly, incoming dirty Back/read-only/deep-link and
notification behavior, native/specialist creation recovery, project guards and
workflow imports. The changed controller files and Workbench test pass strict
lint with zero errors or warnings. Source hashes were captured after the run
under the production freeze; no before/after comparison is claimed. Raw log
hashes are retained, including legacy React act warnings in the successful run.
Generated candidates and transport are synthetic; this does not
qualify a live provider, native PostgreSQL, scientific content or human review.
