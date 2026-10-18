# Existing editor remedy lifecycle browser checks

W1 / D2 qualification on `concept2cure-v2`, synchronized base `11fb58f1` with
the lead's frozen remedy changes. The [browser summary](browser-summary.json)
records exact SHA-256 pins for all six changed production modules and the
synthetic API contract, alongside the tested base and capture time. The tracked
[reproduction instructions](browser-eval-fixture/reproduce.txt) use relative
imports to the actual DocumentCanvas, Workbench, rich editor and remedy cards.
No production UI, CSS, editor, provider or dependency was changed for this run.

## Current result

All four contexts passed: 1440×1000 desktop and 390×844 touch, each in light and
dark mode. There are **24 fresh scenario pages and 44 captured stages**.
Every capture holds one native editor and no horizontal page overflow.
The visible editable region measured **764×320 px on desktop** and at least
**298×231 px on touch**, exceeding the unchanged 250×100 px minimum.
Frozen documents retain a readable native editor and permit no replacement.

The native review controls prove full rejection enables another explicit
application, partial rejection keeps the surviving mark pending, and acceptance
keeps the reviewed application settled. Reapplication uses a distinct UUID;
actual decision request IDs remain distinct within the same evaluation minute.
The cache scenarios use the real guarded Section/Document transition and
leave-without-saving choice: unresolved Restore/Discard remains unavailable,
Restore retains pending marks and their identity, and explicit Discard returns
to the saved baseline before another application. Four safeguards per context
refuse stale saved versions, frozen documents, other-section fixes and
unqualified synthetic turns.

There are **16 successful explicit applications**, **12 captured accept/reject
audit requests**, and **zero PATCH, approval or filing requests**. All configured
API requests remain in scope; there are zero unknown endpoints, browser console
errors or page exceptions. These are intercepted browser requests, not proof
of backend audit persistence or authorization.

Axe reported **zero violations across all 44 stages** for WCAG 2 A/AA,
2.1 A/AA and 2.2 AA tags. Incomplete ARIA, contrast and label/name rules remain
recorded in the metrics artifacts and require further manual qualification;
this is not a complete WCAG certification. Representative captures were
visually inspected in all four contexts: desktop light partial rejection,
desktop dark acceptance, touch light cache choice and touch dark acceptance.
The existing typography, controls and light/dark tokens remain intact.

The lead's screenshot review identified that centering the full editor in a
touch capture could leave the paragraph start above the inner scroller's visible
area. A [touch passage supplement](browser-touch-passage-supplement.json) uses
native paragraph scrolling to show the start and both deletion/insertion marks
in restored-pending and discard-reapplied states. Both supplemental images were
inspected. The correction paragraph measures 258×42.25 px with 258×42.05 px
visible, within a one-pixel rounding tolerance; the unchanged editing viewport
gate still measures 298×231 px. Both supplemental axe scans report zero
violations. No CSS or layout changed. This adds one fresh page, two captured
stages and two explicit applications to the main matrix counts above; neither
supplemental state sends PATCH or audit-decision requests.

## Harness provenance and limits

The [initial fixture failure record](browser-initial-failure/classification.txt)
retains the earlier diagnostic JSON/screenshots and reconstructed summary.
The missing template-prefetch mock and unrelated denied-action profile were
corrected in the fixture before this takeover. The current replay kept the same
viewport, overflow, native-editor and axe assertions. The original denied-profile
composition remains a bounded observation in those artifacts; it is not replaced
by a claim about every possible permission profile.

Executable fixture files and the TSX probe passed forced, strict zero-warning
ESLint. Raw output: `/workspace/scratch/remedy-browser-fixture-lint.log`.
The current four-context output is `/workspace/scratch/remedy-browser-current.log`.
The isolated Vite fixture host was stopped by verifying and terminating only
its known PID, **71042**, after capture and inspection.
For the passage supplement it was restarted as known PID **80762** and stopped
after that capture, source-pin verification and strict lint. The supplemental
output is `/workspace/scratch/remedy-browser-touch-passage.log`.

No live AnA/model request or backend service was called. Qualified model fields,
actor permissions, project data and audit responses are explicit synthetic
fixtures. These checks do not establish live model qualification, database
persistence, RLS, concurrent-writer behavior or deployment. Low-level, integration,
compiler/build and repository gate evidence belongs to the control tower.
