# The deep demo walk, 2026-11-09: every screen a client could reach, and what it said

**What this is.** This walk followed the dress rehearsal in `../README.md`, on the same freshly seeded database at
trunk `b4284d08ce`. Seven walkers each took one area and opened every screen a presenter or a client could reach from
it, one level deep. Every finding was then reproduced by an independent verifier, starting from a fresh browser
session. `findings.json` holds all of it: the screens walked, the walkthrough claims checked, each verified finding
(steps, what the screen showed, what was expected, the code path, the verdict and its cause) and the presenter advice
for each area.

**Package.** F1, with the demo seed and the walkthroughs. RULE 3: the "What already exists" for each fix is in its
commit and in the fix evidence under `fixes/`.

## Numbers

| Area | Walkthrough claims checked | Verified (all high) | Not verified (medium / low) |
|---|---|---|---|
| Front door, Home, Projects, the three program pages | 21 | 8 | 20 |
| The editor on C2C-101 | 21 | 3 | 21 |
| The device program end to end (NeuroPanel-Dx 510(k)) | 38 | 7 | 17 |
| Submission Center and dispatch readiness | 15 | 6 | 17 |
| Vault, Communication and Tasks | 16 | 3 | 18 |
| Quality, Audit trail, Reporting, Biostatistics, RBM | 26 | 5 | 17 |
| CMC / Module 3 and AnA | 7 | 4 | 15 |
| **Total** | **144** | **36** | **125** (91 medium, 34 low) |

Every one of the 36 high findings was reproduced and confirmed real:
- **12 are stale walkthrough.** The screen was right and the presenter script was out of date.
- **24 are product or seed defects.**

The 125 medium and low findings were recorded but not independently verified. They are in `findings.json` under
each area's `unverified`, and are not claimed as defects here.

## The 36, and where each went

Ids are `area.index` into `findings.json`.

| Id | Finding | Kind | Where it went |
|---|---|---|---|
| 0.0, 0.1, 0.4, 0.5, 1.0, 2.1, 2.2, 2.3, 3.0, 3.1, 5.1, 5.2 | The scripts name codes, a stage, counts and banners the screens do not show | stale walkthrough | Fixed in `docs/demo/*-walkthrough.md` (fix `walkthroughs`) |
| 6.2, 6.0 | An out-of-specification QC result shows Pass and its batch eligible; Stability calls 14 results out of specification when 1 is | product | Fix `cmc-verdicts` |
| 6.1 | Composed §3.1 calls the drug substance "C2C-201 tablets" | product | Fix `m3-naming` |
| 5.3 | Biostatistics "Sensitivity Points" breakpoints are wrong | product | Fix `biostat-fragility` |
| 2.0 | The release-signature gate reads "Satisfied" on an unsigned 510(k) sequence | product | Fix `release-signature` |
| 3.4 | A personal email address shows as reviewer of the FDA 1572 and 3454 templates | product | Fix `ind-forms-email` |
| 5.0 | The audit trail shows the newest 200 entries as if they were the whole trail | product | Fix `audit-trail` |
| 4.0, 1.1, 2.4, 4.1 | Seeded PDFs print "?"; review comments raised by the author; a query resolution claims an edit never made; a seed note replaces the product's own filing rationale | seed | Fix `demo-seed` |
| 6.3 | Each failed AnA turn opens a circuit breaker that blocks AnA's reads for 30 s | product | Fix `circuit-breaker` |
| 0.7, 2.5 | The 510(k)/eSTAR page opens with red "Could not load" errors and a raw "fetch failed" | product | Fix `k510-errors` |
| 3.3 | Module 2 QC says 2.3 is missing while the sequence carries a 2.3 leaf | product | Fix `module2-qc` |
| 3.5 | The IND checklist calls placed sections "Not started" | product | Fix `ind-checklist` |
| 5.4 | Reporting says C2C-101 has no governed artifacts | product | Fix `reporting-artifacts` (server); the header copy in `Insights.tsx` is held, handed to its holder |
| 2.6 | Orchestration shows the wrong program under the open project's breadcrumb | product | Fix `orchestration` |
| 0.3, 4.2 | The data room shows raw record names and other programs' change controls, and its counts contradict its list | product | Fix `data-room` |
| 1.2 | A frozen, signed document is labelled "Unbound working copy" | product | Fix `unbound-labels` (`DocumentWorkbench.tsx`; that file's hold covers only the saved-refresh hand-off) |
| 3.2 | Two validators disagree on sequence 0000 (8 errors and 37) | product | Fix `one-gate-identity` |
| 0.2, 0.6 | The project page's Dossier readiness says "0 drafted" and "No editing copy" under a list of drafts; C2C-201 says it has no documents | product | `Project*.tsx` is held by the project-page lane. Handed off in `.design/claude-convergence/COORDINATION.md` with the verifier's copy fix |

Each fix is recorded in `fixes/<name>/`: its patch, the test that failed before it (red first), green, a mutant that
turns the test red again, the neighbouring suites, and lint on each changed file, base against patched.

## Method, and its limits

- **One database, one trunk.** The counts in the findings (4 blockers, 8 errors, 7 leaves, 579 chained entries) are
  this seed on this trunk. The walkthroughs now tell the presenter to read such counts off the screen.
- **No model provider.** AnA's answers were not exercised beyond its honest "No AI provider is configured" reply.
- **Screens.** The walkers' screenshots (1,113 PNGs, 210 MB) stayed on the rehearsal machine. `findings.json` names
  each finding's screenshots by their local path, and the steps to reproduce each one are in the finding itself.
- **Not verified is not cleared.** The 125 unverified findings are leads for the next walk, not a pass.
