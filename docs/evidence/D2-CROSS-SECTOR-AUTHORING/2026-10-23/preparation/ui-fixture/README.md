# Align the existing template-search fixture with creation admission

## What already exists

`AuthoringCreateExport` uses the canonical `useAuthoringCreation` hook. Its
creation owner requires a signed-in actor, organization and captured bearer
claims to agree before opening New document. Creation requests pin that actor's
Authorization and organization headers. The existing passing
`authoringCreateExport.test.tsx` fixture already initializes and cleans up this
real authentication service with matching synthetic actor/token data.

`authoringTemplateSearch.test.tsx` mounted that same component without an actor
or bearer. The current gate correctly disabled New document, so all 25 existing
picker cases failed before reaching the search behavior. Root's initial combined
raw run retains those failures; `initial-failure-reference.json` records its
compressed hash and this fixture's pre-change pin. This is fixture drift after
canonical admission tightened, not a demonstrated production defect.

## Correction and qualification

Only the search fixture changes. It now sets a matching account/organization
and token using the same real-service pattern as the existing creation fixture,
and clears authentication, token storage and selected project during cleanup.
Existing POST payload assertions also require the pinned actor headers. All
search, retained selection, native keyboard/focus, catalog failure/partial-read,
blank creation and no-extra-GET assertions remain unchanged. No admission gate,
C2CForm, picker or other production code was edited or mocked away.

`green.json` passes all 25 cases (one suite), exit 0. `lint.json` passes the
changed file with --max-warnings 0, exit 0. Receipts retain argv, timing, Node
selection, before/after owned pins, raw gzip hashes and no source drift.
`freeze.json` records the final fixture pin. Transport remains synthetic; this
does not qualify browser/human acceptance or native server authentication.
No Git, compiler/build, global scan, provider or deployment work was performed.
