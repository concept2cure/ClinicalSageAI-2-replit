# Actual Workbench assembly completion evidence

The existing `workbenchAssemblyBuild.test.tsx` mounts the real DocumentWorkbench,
assembly controller/queue, candidate list and individual AI review panel. Its
existing synthetic HTTP fixture supplies the scoped saved document and sections;
no provider or regulatory endpoint is contacted. Collaboration, filing placement
and export panels remain the fixture's pre-existing mocks. There is one Tiptap
editor. No replacement editor, queue or product surface is introduced here.

Two added cases cover text appearing in the first pending section: between the
confirmed structure refresh and the queue's next inspection, and before an
explicit retry after a generation refusal. They require visible terminal
`preserved` status, the existing factual message, no Review for that row, and
preparation of the following empty section. They open the later candidate in the
existing review panel, edit its body/reason and verify the explicit Accept
control remains available. They leave acceptance unclicked and assert no
acceptance/PATCH, no second structural commit, unchanged saved text, and no
remaining retry control once both rows are terminal.

`red.json` records the focused run before production changes: exit 1, two failed
cases and 29 skipped tests. Both reach the behavioral assertion and receive
`failed` status for confirmed saved text instead of terminal `preserved`.
`red.log` retains raw combined output. `red-source-snapshot.json.gz` retains the
exact test, production owners and configuration used; metadata records SHA-256
hashes before/after and no source drift. `run-check.py` runs only this fixture or
its strict lint check and captures the same bounded source set.

The first post-fix `green.json` records all 31 fixture tests passing. The first
`strict-lint.json` records a real exit 1 for the enlarged describe/file size
limits, with no syntax errors. Both results are retained. With root approval,
the existing data, plan builder and UI actions/mount moved into sibling
`workbenchAssemblyBuild.testSupport.ts`; the original fixture remains the sole
synthetic HTTP/state owner. The added cases have their own describe. This reuses
the same host and assertions without suppressing lint or changing a baseline.

Independent review of the production change found that only a freshly verified
exact nonempty saved row receives terminal status. Missing/invalid/foreign or
partial reads retain the failed stop path. Per-section currentness and Stop
checks still surround inspection, and the next section repeats them before any
request. Provider failure still stops; source-selection and exact target filters,
region admission and the 20-section limit remain unchanged. Ordinary retry
admission in the hook/UI/queue explicitly includes only failed/not-started rows,
so preserved text is skipped without gaining acceptance or edit authority.

`final-green.json` records the post-extraction full fixture: 31 passed, exit 0.
`final-strict-lint.json` records strict lint of both the test and support file:
exit 0 with empty output (zero errors/warnings). Both record no source drift and
the same final source hashes. `final-source-freeze.json` checks those hashes
against the current files; `artifact-manifest.json` hashes the packet artifacts.
The untouched direct-project-switch case emits React `act` diagnostics in both
full runs; the two added completion cases emit none. These diagnostics are kept
in the raw logs rather than hidden.

This is automated jsdom evidence using synthetic HTTP. It does not establish a
human browser session, live provider output, or regulatory submission readiness.
