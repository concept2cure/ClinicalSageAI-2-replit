# Saved document oversight and working-copy handoffs

W1 / D2 continuation from `87b27c89` on `concept2cure-v2`, under
[the implementation contract](../../../../design/EDITOR_SAVED_REVIEW_CONTINUATION_2026-10-14.md).
The canonical path remains ConversationThread → DocumentCanvas →
DocumentWorkbench → RichSectionEditor, shared with the Authoring surface.

AnA's existing `critique_document` now accepts the exact saved document UUID
from the open project's context. It reads every ordered section in one
tenant-scoped repeatable-read transaction after current project and whole
document permission checks. Its deterministic review checks accepted text,
cross-section consistency and supplied structure requirements, reports pending
changes and unavailable/unregistered citations, and returns exact saved section
identities and versions for remedies. Every page fits the existing 5,000
character result budget. Continuations require the snapshot digest and refuse
changed text, titles, citation eligibility, permissions or review options.
Invalid or oversized reads return no plausible document verdict. The existing
supplied-text mode remains explicitly labelled and rejects malformed arrays
instead of silently reviewing a filtered subset.

Remedies now open their actual section in Section view through the existing
unsaved-work decision. Switching views also uses that guard; Cancel and refused
Save retain the mounted dirty editor. Draft requests use fixed prose with saved
identity and names carried through structured context. Edited source copies
reopen against their real saved structure, while preserving source fingerprint
and provenance checks. Protocol imports verify retained cells against recorded
removed endpoints, compose the canonical live matrix and refuse foreign or
missing endpoints. Healthy all-live source fingerprints remain unchanged.

The same UI controls, typography, themes and tokens remain. Desktop browser
checks found the existing track-changes checkbox below the minimum target size;
its established 24px touch checkbox sizing now applies to all pointers, with
the 44px touch label retained. No editor, model call/provider, production
dependency, migration, route, store or tool name was added.

## Evidence

- [EDITOR_NAVIGATION.md](EDITOR_NAVIGATION.md): six reproduced navigation/prompt
  failures, existing guard/remedy behavior and focused frontend checks.
- [WORKFLOW_WORKING_COPIES.md](WORKFLOW_WORKING_COPIES.md): real HTTP/JWT/PGlite
  edited-copy regression and governed Protocol removal regressions, then fixes.
- [SAVED_REVIEW_TESTS.md](SAVED_REVIEW_TESTS.md): 40 real-SQL saved-review checks,
  deterministic engine coverage and workload measurement. A 96-section,
  187,392-character review took 79.67 ms in the local fixture; this is not a
  production latency guarantee.
- `critique-before.txt`: three failing existing-handler/schema checks before
  saved-record admission and strict supplied-section validation.
- `tests.txt` and `authorization-tests.txt`: **976 tests in 61 suites pass**,
  including the complete editor directory, canonical saved reads, workflow
  imports, citation authority, writing gates and current tool authorization.
- `typecheck.txt`: zero TypeScript errors against the zero-error baseline.
  `build.txt`: client and server production builds pass; the existing chunk-size
  advisory remains informational.
- `gates.txt`, `class-coverage.txt` and `warning-ratchet.txt`: existing design,
  token, CSS, canonical canvas, AnA context, SQL and lint gates pass without
  baseline increases or suppressed findings.
- `browser.json`: four desktop/touch and light/dark scenarios, eleven behavioral
  checks each. Cancel/refused Save retain edits; deliberate Save includes them;
  the remedy opens its section and adds an attributed tracked change without
  saving or approving. Each keeps one editor, no horizontal overflow or browser
  errors, and no WCAG A/AA violations. The visible editor body measures 382px on
  desktop and 418px on touch after opening the remedy. The pre-fix desktop
  checkbox finding is in `browser-accessibility-before.json`.

The browser harness, actual-component fixture and Vite server are recorded as
`browser-harness.txt`, `browser-probe.txt` and `browser-server.txt`. Restore the
fixture beneath `.visual-qa/editor-consistency/` and serve the recorded HTML
entry on port 5174. Browser APIs use synthetic intercepted records and immutable
AnA turn fixtures; no live provider request occurs. Database checkout is
injected into the PGlite saved-review suite; the canonical authorization,
citation SQL, renderer and deterministic engine run unchanged. These checks do
not qualify live RLS, concurrent native PostgreSQL writers, external storage or
production deployment, and do not make the entire D2 launch row green.

One follow-through gap remains: the remedy card does not query the current
tracked suggestion's state after rejection or local discard, so its previously
applied action can remain disabled. The note now accurately describes the
application event; reapplication needs the existing editor's real suggestion
identity/state, as recorded in EDITOR_NAVIGATION.md.
