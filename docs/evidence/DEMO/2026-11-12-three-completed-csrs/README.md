# Three completed synthetic CSRs in the Lumen account (2026-11-12)

Plan package DATA. The founder, 2026-11-12: "build out more completed full CSR report faux examples in the demo
environment that can be run from my code space and connected to one demo access users."

## What a person sees

Sign in through **Demo access** as any of the three Lumen people. Each project's **Author** step opens its report
in the one editor, written in full:

| Project | Report | Study (all invented) | Primary result, from its source |
|---|---|---|---|
| LMN-201 | RePreve Part B Clinical Study Report | Phase 2, recurrent C. difficile, 23 participants, 2 arms | Synthetic global cure 10/12 vs 4/11 |
| LMN-801 | Phase 1 First-in-Human Multiple Ascending Dose CSR | Phase 1, healthy adults with overweight or obesity, 24 participants, 3 arms | Participants with a TEAE: 5/8 low dose, 8/8 high dose, 5/8 placebo; weight change at Day 28 descriptive |
| LMN-301 | Phase 2a Viral Challenge CSR | Phase 2a, human viral challenge, 40 participants, 2 arms | Symptomatic infection 3/20 (15.0%) vs 12/20 (60.0%); difference −45.0 points (95% CI −71.6 to −18.4), Fisher p = 0.0079 |

Every report has all 119 ICH E3 sections written: title page, synopsis, ethics, investigators, the investigational
plan with its criteria, disposition, demographics, efficacy, exposure, adverse events by system organ class and
preferred term, serious and significant events with narratives, laboratory shifts, vital signs, conclusions, the
tables section, references and the appendices with their listings (randomisation, discontinued participants,
demographics, adverse events). Each title page opens with a banner saying the study and every result are invented.

Each report is **sent for review** to the Lumen reviewer, whose Tasks list the three reviews
(`reviewer-tasks-1440.png`). The chooser now says so: "Lumen Lead — Lead and author: three synthetic CSRs
(LMN-201, LMN-801, LMN-301) and Lumen's projects"; "Lumen Reviewer — Reviewer: the three CSRs wait for your
evidence check; second signer".

## Why the reports stop at review

A CSR is approved only after a reviewer has mapped each quantitative claim in its saved text to a cell of the tables
built from its frozen study data (`CSR_SCIENTIFIC_REVIEW_REQUIRED`,
`server/services/authoring/csr-scientific-review.ts`). The seed first tried to sign and was refused with exactly
that. That check is a person's: a seed that wrote the claim map would be the control answering itself, so it does
not. The editor says "Needs its scientific review first" beside Freeze. The presenter does the check live as the
Lumen reviewer. It needs no model: the tables come from the frozen study data, and the evidence preview answered
200 for LMN-301 and LMN-801 as the reviewer (tables digest, saved-text snapshot, "human review required").

If the founder wants one report pre-approved for a demo, that is a decision to record, not something a seed should
do quietly.

## How the numbers are made

- **LMN-201** uses the kit's subject-level source (`data/seeds/lumen-demo/seed-data/lmn201_synthetic_csr_source_v2.json`),
  already frozen into its report on 2026-11-10.
- **LMN-801 and LMN-301** have sources generated from a fixed seed (`lumen-csr-studies.mjs`): subjects, demographics,
  disposition, adverse events, vital signs, laboratory shifts, concomitant medications, exposure and efficacy, in the
  platform's own format. Each is filed in its project's Vault, reviewed and approved there by the Lumen reviewer and
  approver, and frozen into its report as study data. The bytes are the same on every run (pinned in the test), so a
  Codespace restart finds the file it filed.
- **The text** (`lumen-csr-text.mjs`) computes every count, percentage, mean, confidence interval and p-value from
  that source: the difference in proportions with a Wald 95% interval, a two-sided Fisher's exact test, and for
  LMN-301's sample size the normal-approximation power (75.3% for 20 per arm at 60% vs 20%). The formulas are
  written into Appendix 16.1.9 of each report. Where the source does not hold what a section asks for (individual
  laboratory values, compliance, CRF pages), the section says so.
- No model drafts any of it. "Build from the study's data" still works as before when a model key is set.

## What already exists (RULE 3)

| Path | What it did | What it did not do |
|---|---|---|
| `scripts/demo/launch-demo/packs/lumen-csr.mjs` | LMN-201's CSR: source approved, document created from "GLOBAL · Clinical Study Report (CSR)", study data frozen | Wrote no text; one study only |
| `lumen.mjs` `ensureCsrSource` | Files LMN-201's source in its Vault | Unchanged |
| `lumen-vault.mjs` `ensureStage`, `signingPeople` | The Vault's review and approval by the Lumen reviewer and approver | Reused for the two new sources |
| `PATCH /api/authoring/sections/:id`, `POST /api/authoring/documents/:id/request-review` | The editor's save and send-for-review | Reused, with a reason for change on each save |
| `shared/csr-source-input.ts` | The source format and its schema | Reused; the tests validate against it |
| `server/services/ind/ctd/csr-e3-guidance.ts` | The ICH E3 section list the template is built from | Read by the test, so every section is covered |
| `.devcontainer/post-start.sh` | Re-runs the Lumen seed whenever `scripts/demo` changes | Unchanged: this lands in the Codespace on its next start |

No new route, service, table, screen or mount.

## Verified

| What | Where | Result |
|---|---|---|
| The sources pass the server's schema; bytes pinned; Fisher, Wald and power against known answers; the report's numbers are the source's; every E3 section written with no empty, "undefined" or "NaN" section; only empty sections written on a re-run; everything labelled synthetic and fictional | `scripts/demo/launch-demo/lumen-csr-studies.test.mjs` (8) | Pass. Broken on purpose (a schema declaration removed, one section blanked): 3 fail |
| All seed tests | `node --test scripts/demo/launch-demo/*.test.mjs` | 179 pass |
| Codespace scripts | `npm run codespaces:doctor:test` | 55 pass |
| The seed, against a running app | `npm run demo:seed -- --pack lumen` with the Lumen reviewer and approver | Passed: the two new sources filed and approved, two reports created, 357 sections written, three reviews requested. Again: created 0, found 341 |
| In the running app, through Demo access | As the Lumen reviewer and the Lumen lead, at 1440 | The chooser lists the three Lumen people with the new lines; the reviewer's Tasks show three CSR reviews; each report opens fully written (`lmn301-title-page-reviewer-1440.png`, `lmn801-title-page-reviewer-1440.png`, `lmn301-efficacy-1440.png`, `lmn301-adverse-events-1440.png`); no failed request; no sideways scroll at 390 |

## In the Codespace

Nothing to do but pull and restart: the Codespace re-seeds the Lumen account when `scripts/demo` changes. Then
**Demo access**, choose **Lumen Reviewer**, open **Tasks**, or any of LMN-201, LMN-801, LMN-301 → **Author**.

## Open

- **The approval step is the presenter's**, as above.
- **Phone width:** the editor folds the section list away at 390, so a section is reached through the document view.
  That is the editor's layout, unchanged here.
- **The dose and regimen sections say they are illustrative**, as the product descriptions do; no real dosing is
  implied.
- HawkScan did not run: no `HAWK_API_KEY` in this environment.
