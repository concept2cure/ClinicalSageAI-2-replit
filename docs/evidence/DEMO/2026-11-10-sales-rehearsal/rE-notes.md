# rE: what a buyer sees first, and whether it all looks like one product

Walked 2026-11-10 on http://127.0.0.1:5240 (database gademo; build 8a65a6f3a). Posture: app_service, RLS on, launch scope
enforced, dev sign-in off, no model key, a development build served by Vite over a shared working tree. Persona: `ana` (Ana Author, org 2). 1440 x 900 light unless stated. Screens are in
`shots/rE-*.png`. The only mutation is the project **Rehearsal rE** (RE-101, IND), which persisted after a reload
(`rE-59`, `rE-60`).

## Run of show (only what worked)

1. Sign-in: e-mail, password, then the e-mailed code (sign-in screens are not kept). The page is calm, and there is no "DEV ONLY" demo button any more.
2. Home: serif greeting and one composer (`rE-03`). Above the fold, this is the closest screen to Claude.
3. ⌘K / Search: go-to list, then a project by name (`rE-12`, `rE-13`). Enter opens the project.
4. Project (Xanomeline CDISCPILOT01) (`rE-15`): composer, conversations and Project knowledge on the right. Plan, Author, Review, Submit and Respond each open (`rE-16`, `rE-18`..`rE-21`).
5. Editor, CDISCPILOT01 CSR: 119-section ICH E3 tree and the section editor (`rE-24`). Wait about 3 s for it to load.
6. Projects grid (`rE-26`). Calm cards; the filters work.
7. Vault with the CDISC ADaM files approved and hashed (`rE-29`). Quality SOP register (`rE-34`). Communication (`rE-28`). Submission Center (`rE-37`).
8. New project wizard, completed in one go: IND, then configure, then review and create (`rE-56`..`rE-59`). It persists (`rE-60`).
9. Dark theme (`rE-72`..`rE-76`) and 390 px (`rE-62`..`rE-66`). No horizontal overflow on any of the five screens.

## Avoid today

- Do not type to AnA, click a starter chip, use "Demos > Sales demonstration" or "Triage my day". Every one of them ends in "No AI provider is configured" (`rE-08`, `rE-11`). Sales demonstration also puts "demo script id: sales-flagship … start_product_demo" on screen.
- Do not reload a conversation. It vanishes (`rE-09`).
- Do not open a project's **Evidence > Data room**. It lists the organisation's Lumen suppliers, audits and another rehearsal's deviation, says "original file is unavailable" on every row, and shows "Quality record relationship: 7". This happens even on a brand-new project (`rE-17`, `rE-61`).
- Do not open notification links "Open the version in the Vault". The result is 422 and "Retry linked record" (`rE-80`). "Open task" lands on "managed outside the board" (`rE-81`).
- Do not claim search finds documents. "Clinical Study Report" finds nothing (`rE-14`).
- Do not linger on New project or open Collaborate right after a navigation. Twice the open panel blanked and the app fell back to the list. One of those times it lost a filled-in Review step (`rE-39`, `rE-58b-wizard-lost`, `rE-56`).
- Do not show Reporting & analytics on a biotech project ("0 for Pharma", 24 rows of raw `2024-12 0` month keys, device-project sections) (`rE-35`), or the RBM board (`rE-52`).
- Do not show Subscription & billing: "First payment not completed", "7 of 5 seats" against "7 of 25" elsewhere (`rE-49`).

## Launch gate

No visible control showed "not in this release" on any tab of Submission Center, Vault, CMC, RBM, Quality or Reporting (`gademo/rE/tabs-probe.json`).
RBM opens and shows the LMN-201 data. Its **Load extract…** dialog (`rE-54`) posts to `/api/mdx/rbm-data-runs`, and that address
answers `403 LAUNCH_SCOPE "This part of the product is not in this release."` (GET as ana, both with and without programId). That is a visible
control leading to a refusal. The submit was not pressed, because it would mutate seeded data.

## Ten screens that would most hurt a sales presentation

1. Project Evidence / Data room (`rE-17`, `rE-61`). It is the data room, step 1 of the spine, and it shows other organisations' quality records and errors on every row.
2. Risk-based monitoring (`rE-52`, `rE-33`). Eyebrow label, "Linked to" chip row, six stat tiles, ten tabs on two lines, raw `ctms`/`edc`, ISO UTC timestamps, and "0 sites" beside site-104 signals.
3. AnA conversation (`rE-08`, `rE-09`). A wall of controls under the composer (AnA drives, Demos, Manual/Auto, Skills, Engine, governance line), four outlined header buttons, a title truncated mid-word, and the turn gone on reload.
4. Vault (`rE-29`). Three header buttons, three AnA chips, six tabs, five filter dropdowns, a truncated tree full of "0/0", six equal buttons in the detail pane, and "IND × FDA · eCTD M1 (FDA Module 1 Spec v2.3) + ICH M4 M2–M5 · version ich-m4-v2.2".
5. Reporting & analytics (`rE-35`). Raw month keys, "0 for Pharma" on a biotech project, and "XT scores 0% … 23 critical gaps" as the header.
6. Editor header (`rE-24`, and `rE-65` at 390). Two rows of equal controls, the grey "Unbound working copy" box, and the "Nothing to edit yet · New document" empty state shown for about 3 s while a 119-section document loads (`rE-25`).
7. Project Author / Module completion (`rE-15`, `rE-18`). Six "0%" blocks, each saying "No editing copy of this filing yet".
8. Tasks (`rE-36`). Eyebrow "Project — collaboration", a kanban of chips with raw "done", and "No open work is assigned" while Home lists 27 items for Ana.
9. Admin console (`rE-45`). Four stat tiles and raw scopes such as `records:read`. This screen belongs to another workflow; the observation is recorded here only for the design verdict.
10. Biostatistics on an Alzheimer's CSR project (`rE-32`). Oncology worked example, "project XT", "study-design spine", "Deterministic engine, version 1.0.0".

## Earlier findings rechecked

- 2026-11-09 front-door 0.2 / 0.6 ("0 drafted", "No editing copy" under a list of drafts): still open (`rE-18`).
- 0.3 (data room shows raw records, other programs' records, "original file unavailable"): still open (`rE-17`, `rE-61`).
- Unverified 0.0 (notification links fail with "Retry linked record"): still open (`rE-80`).
- Unverified 0.6 (AnA no-provider turn vanishes, contradicting "every turn is saved"): still open (`rE-09`).
- Unverified 0.7 ("DEV ONLY" demo access on the sign-in card): fixed (seen in the walk; sign-in screens are not kept).
- Unverified 0.8 (no objective on demo programs): still open on XT (`rE-15`). A new project records one (`rE-59`).
- Unverified 0.17 (setup checklist "Record your company details · To do"): still open (`rE-03`).
- Unverified 0.11 (top bar has no organisation control): partly fixed. There is an organisations panel (people icon) and a Switch organisation control in Account (`rE-42`, `rE-43`).

## Scratch
`gademo/rE/` holds repl.cjs, lib.js, rail.json, menu.json, tabs-probe.json, PROGRESS.md and project.txt.
