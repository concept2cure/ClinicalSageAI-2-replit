# WO2 — 2026-09-21/22 — the Protocol development surface becomes a builder

The worker that did this was killed by an Anthropic API outage (HTTP 529)
before it wrote this README. Its work was complete on the tree. The control
tower re-ran everything below itself and files this record; nothing here is
taken on the worker's report.

## What changed

`protocol-dev` joined the Authoring launch app on 2026-09-21 and its read
model was completed the same day (`docs/evidence/WO/2026-09-21/README.md`),
but the screen stayed read-only: no section editor, no way to add a visit or
an assessment, no residual-risk form, no budget entry, no reviewer entry. A
protocol author could look at a protocol and change nothing.

The surface is now a builder. `ProtocolDev.tsx` was split into nine modules
under `surfaces/` (Workspace, Registers, Forms, Panes, Section, Soa, Reviews,
Shared, Writes) rather than suppressing the repo's size limits, and each
register writes through a route that already existed:

| Register | What the author can now do |
|---|---|
| Sections | Edit content in the codebase's one rich editor (`editor/RichSectionEditor.tsx`, imported as-is), saved with stale-write conflict handling |
| Schedule of assessments | Add, rename and remove a visit; add and remove an assessment; toggle cells; the SoA engine's findings render as findings |
| Risks | Residual likelihood and impact, owner, mitigation |
| Budget | Line-item entry; the engine's verdict appears only when its inputs exist, and says so plainly when they do not |
| Reviews | Request a review with a reviewer and a due date; record a disposition |
| Cover page | Sponsor and principal investigator |
| Consent | **Wired, not removed.** The read model now returns the latest linked consent form and its elements, so the tab shows them instead of the hard-coded empty list it used to read |

## Verification re-run by the control tower

| Check | Result |
|---|---|
| protocol client suites (7 files) | 53 passed |
| protocol server suites (5 files) | 31 passed |
| whole-tree `tsc --noEmit` | 0 errors |
| eslint warning ratchet | no file grew; net -9 across the changed set |
| `ci:launch-scope` | pass |
| `ci:ana-surface-context` | 114 of 120, baseline exact |
| `ci:undefined-css-classes` | pass |
| `ci:design-system` | pass |

The worker's own fail-first transcripts are `writes-test-failing-first.txt`
(the register writes) and `reread-gate-failing-first.txt` (the stale-write
conflict), and `route-refusals.txt` records the refusal paths. Fourteen
screenshots at 1440x900 cover the document tab and a saved section, the
schedule before and after a visit and an assessment were added, a risk
residual, the budget empty state and then its verdict, reviews, the empty
state and "Start a protocol", and the section conflict.

## Owed

The founder directed on 2026-09-22 that the protocol solution must also be
able to submit to an IRB, through the unified Submission Center. That is
tracked separately: a read-only survey the same day found an IRB capability
already exists in this repository and is unreachable — see the IRB design
record. This surface does not yet link to it.
