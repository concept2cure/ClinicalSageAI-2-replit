# rB: the Phase 2 study story (LMN-201, Lumen account, org 6), rehearsed 2026-11-10

Walked on http://127.0.0.1:5240 (database gademo) with app_service, RLS_ENFORCE=on,
LAUNCH_SCOPE_ENFORCE=on, dev sign-in off, no model key, on a development build served by Vite over a shared working tree. Signed in through the real form as lumen-lead and
lumen-reviewer. Screens were shot at 1440 x 900 light, then at 390 x 844, then Home, the project and the editor in dark.
Scripts and JSON logs are in the scratch folder `gademo/rB/` (s01 to s26).

## What already exists (RULE 3)

These were read before the walk:
- docs/evidence/DEMO/2026-11-10-lumen-data-handoff/README.md
- docs/evidence/DEMO/2026-11-10-sales-showcase/README.md (scenes 1 to 12)
- docs/evidence/DEMO/2026-11-09-rehearsal/deep-walk/findings.json (quality-audit-reporting, vault-comms-tasks)
- the seed `scripts/demo/launch-demo/packs/lumen*.mjs`

This walk extends the showcase's scenes 5, 6, 8, 9, 11 and 12, under the launch gate.

## Launch gate: what is reachable

Every stop in this story opened under LAUNCH_SCOPE_ENFORCE=on. No screen answered "not in this release":
- the CSR editor and "Build from the study's data"
- Biostatistics
- Risk-based monitoring, all ten tabs
- Tasks
- the Review step and the review board
- Communication and Respond
- Reporting & analytics

The only refusal from the gate is `GET /api/mdx/rbm-data-runs` (403 LAUNCH_SCOPE, read through the API). No screen in this walk called it.
`POST /api/mdx/rbm-metric-ingest` (Load extract) is admitted.

## Stops, in presenter order

| # | Stop | Shots | Result |
|---|---|---|---|
| 1 | Home, LMN-201 project | rB-01, rB-02 | Opens clean. "Dispatch blocked · 3 blockers", Agency letters 2 open, Team of three |
| 2 | CSR in the one editor | rB-03 | 119 ICH E3 headings in the outline. Section bodies are empty ("Write the section content here") |
| 3 | Build from the study's data | rB-04, rB-05, rB-06, rB-57 | Study data frozen (DEMO-LMN201-PARTB-001, synthetic). **Build CSR draft pressed (build 1).** Title Page and Study Objectives were drafted from records. For about 2 minutes the panel read "Writing §9.8 … Reading the study's tables". The server log says the gateway refusal was classed CSR_DRAFTING_RATE_LIMITED. The build ended "not complete · 26% … because no AI model is configured", with 16 headings as template text with data missing. "§12.5 … its study tables hold no results" |
| 4 | Biostatistics | rB-07, rB-08, rB-09, rB-10, rB-11 | Deterministic sample size: 314 subjects, 80% power. "Save as a working document" worked, and the document appears in the editor outline ("CSR Statistical Methods Section …"). The AnA starter only prefills the composer |
| 5 | Risk-based monitoring | rB-12 to rB-26 | All tabs populated except Site risk and Site oversight ("0 sites"). I logged the manual signal "Rehearsal rB signal …" and it persisted after a reload (rB-25). Load extract accepted a one-row probe (run #27). Loading it again answers 409 "already loaded" with an honest reason |
| 6 | Tasks | rB-27, rB-28, rB-29, rB-30 | "5 tasks stand between you and Database lock readiness checklist, and 2 tasks are overdue". Critical path lists 5 tasks. I created "Rehearsal rB task: confirm the site 103 screen-failure log" and it persisted after a reload |
| 7 | IB under review (lumen-reviewer) | rB-32 to rB-37 | "Waiting on you 1". The Investigator's Brochure opens as an **empty Draft**: the review dialog lists 9 sections, each "No saved content in this section" |
| 8 | Communication and Respond | rB-38 to rB-47 | The FICTIONAL FDA information request: 3 questions found "without AI". I recorded Q1 (CMC, §3.2.P.5.2, Major) and it persisted. "Write response" requires a working copy, through a drawer that shows a uuid, a SHA fingerprint and `agency.context` keys. The response was not completed |
| 9 | Reporting & analytics | rB-49 to rB-56 | 4 runs, a bundle and 2 schedules. Opening a run works. **Export PDF answers 503 REPORT_PDF_FONTS_UNAVAILABLE** ("No file saved — Reporting PDF fonts are unavailable on this deployment") |
| 10 | Phone 390 | rB-58 to rB-65 | No horizontal overflow on any of the 8 stops. The editor's header wraps into four rows of buttons. On RBM, ten tabs and the link cards push the content below the fold |
| 11 | Dark | rB-66, rB-67, rB-68 | The theme applies. Nothing broke |

## Records this rehearsal created or changed (all in org 6, LMN-201)

- CSR build 1 on "[Demo · Lumen] LMN-201 RePreve Part B Clinical Study Report — SYNTHETIC": not complete. "Resume build 1" will be offered to the next presenter.
- The working document "CSR Statistical Methods Section (Pharma / biotech) — Prevention of recurrent Clostridioides difficile infection", saved from Biostatistics.
- The RBM manual signal "Rehearsal rB signal: site 103 …" (Medium, site 103).
- RBM metric run #27, one row with `rehearsal_rb_probe`.
- The task "Rehearsal rB task: confirm the site 103 screen-failure log".
- Information request question 1, recorded. The letter now reads "In progress".

## Findings

These are listed in the structured result: rB-F1 to rB-F22.

## Earlier findings re-checked

- Biostatistics sensitivity breakpoint float: **still open** ("breakpoint 0.15000000000000002 (50% margin)", rB-08).
- Reporting "no governed artifacts" (2026-11-09, C2C-101): **changed on LMN-201**. The digest now reports artifact_state ready. But the IND Safety pack says 1.14.4.1 IB has "No document recorded", while the Vault binder shows 1/1 at 1.14.4.1.
- RBM Site risk and Site oversight "0 sites" (handoff item 5): **still open** (rB-20, rB-21).
- RBM "New KRI" 500: could not check. I did not create a KRI.
- PDF export fonts (showcase: fixed in the Codespace image): **still open on this host** (rB-56).
