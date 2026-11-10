# Submission-readiness walkthroughs (mock walk-through pack)

> **Presenting the whole platform?** The run of show for the Lumen account in the Codespace is
> [`lumen-showcase.md`](./lumen-showcase.md) (2026-11-10). The pages below are the script-driven readiness demos.

Four runnable, end-to-end demos — one per regulatory pathway — that exercise the
real, deterministic regulatory services (no DB, no network) and end in the
submission-readiness capstone. The capstone reports the **completeness of the
domains it assessed** — not readiness — and names the required domains it did
not assess. A domain the script computes no figure for is left out, so all four
currently end **not-assessed** (output of the runs on 2026-10-15):

| Demo | Scenario | Run | Capstone (as printed) |
|---|---|---|---|
| IVD 510(k) | Cardiac-troponin immunoassay | `npx tsx scripts/demo/ivd-510k-walkthrough.ts` | 100% of 2 of 5 required domains → **not-assessed** (not assessed: analyticalPerformance, clinicalPerformance, postMarketPlan) |
| CDx | PD-L1 companion Dx + checkpoint inhibitor | `npx tsx scripts/demo/cdx-walkthrough.ts` | 100% of 1 of 4 → **not-assessed** (not assessed: analyticalPerformance, clinicalPerformance, postMarketPlan) |
| PMA | Implantable CGM + connected app (Class III) | `npx tsx scripts/demo/pma-walkthrough.ts` | 100% of 3 of 6 → **not-assessed** (not assessed: clinicalPerformance, udiGudid, postMarketPlan) |
| EU IVDR | IVD CE marking (2017/746) | `npx tsx scripts/demo/eu-ivdr-walkthrough.ts` | 100% of 1 of 4 → **not-assessed** (not assessed: analyticalPerformance, clinicalPerformance, udiGudid) |

> The verdicts are `complete` (every required domain assessed and complete),
> `nearly-complete` (every one assessed, mean ≥ 80%), `incomplete` (an assessed
> domain is incomplete) and `not-assessed` (nothing assessed is incomplete, but a
> required domain was not assessed). Lower an assessed domain's input in a
> `scripts/demo/*.ts` file and re-run to show it reported incomplete.

Detailed talking points and the verified IVD 510(k) output are in
[`IVD_510K_WALKTHROUGH.md`](./IVD_510K_WALKTHROUGH.md).

## The one-screen thesis

Each demo reduces a dozen standards-grounded checks (CLSI EP05/06/07/09/12/17/25/28,
2×2 + ROC/DeLong, FDA SE flowchart, IMDRF/IEC 62304, §524B/NTIA, IEC 62366-1,
GS1/LOINC, IVDR Annex XIII, FDA CDx) into **one weighted verdict and a prioritized
gap list** — `complete` / `nearly-complete` / `incomplete` / `not-assessed`,
over the domains assessed.

## Defensibility (for the deposition)

Every number is closed-form and reproducible; the same code paths are unit-tested
against published reference values. Edit the scenario inputs in any
`scripts/demo/*.ts` file and re-run to show the result update live. The pathway →
required-domains map is also queryable: `GET /api/submission-readiness/pathways`.

## The whole platform in thirty minutes

Assembled from the 2026-11-10 sales rehearsal, which walked five stories with
launch scope on, row-level security on, dev sign-in off and no model key, on a
development build served by Vite over a shared working tree. Every step here
worked in the app; its screenshot shows what was seen. The steps, their
screenshots and the line to say for each are in
[`docs/evidence/DEMO/2026-11-10-sales-rehearsal/README.md`](../evidence/DEMO/2026-11-10-sales-rehearsal/README.md),
"Run of show". The in-app walkthroughs behind it are
[`biotech-walkthrough.md`](./biotech-walkthrough.md) and
[`mdx-walkthrough.md`](./mdx-walkthrough.md).

**Before the room.**
- Run from a production build of a frozen commit, not a Vite dev server that
  anyone is editing: a hot reload closes open wizards and signature dialogs.
- Install `fonts-noto-core` and `fonts-noto-cjk` on the demo host, or report PDF
  export answers 503.
- The Audit trail is not in the order below. Its second chain banner reads
  "verification failed" until AUD-02 runs on the demo server, so it is not
  opened in the room until then.
- Fill every wizard and dialog in one pass, and click calmly: quick reloads of
  Quality and the Vault meet rate limits.

**The order (about 30 minutes).**

| Minutes | Story | Who signs in | What it shows |
|---|---|---|---|
| 3 | rE, first impression | Ana | Sign-in with a code (no screenshot kept), Home and its composer, ⌘K to a project, the six steps, the CSR in the one editor, dark and phone |
| 8 | rA, a biotech IND (C2C-101) | Ana, Rhea, Ava | Objective, plan, Vault upload and new version, review and approval with Part 11 signatures, the protocol, a document from the plan with comment, review signature and freeze, independent checks, the dispatch gate, the agency question answered (in the editor, before the room) and approved |
| 7 | rB, the Phase 2 study (LMN-201, Lumen account) | Lumen Lead, Lumen Reviewer | The CSR's study-data build and its honest stop, Biostatistics, risk-based monitoring (RACT, KRIs, QTLs, patient profiles, a logged signal, the plan), a new task, the IR questions, report bundles and schedules |
| 6 | rD, quality and CMC (C2C-201) | Quinn, Ava, Rhea, Cal | An SOP from draft to Effective with two signatures, training and acknowledgement, a change the proposer can only advance, a CMC section signed after "read before you sign", the honest biologic refusal, a Vault upload found by search |
| 6 | rC, a device and an IVD (NeuroPanel-Dx 510(k)) | Ana, Rhea, Ava, Quinn | The device facts on the project, the 510(k) plan, the approved 510(k) Summary and its signatures (all Rhea's on this seed: not a separation-of-duties screen), an ISO 14971 document reviewed and approved by two other people, a hazard and a design input, the official eSTAR PDF, an SOP acknowledgement, a new 510(k) project |

**Which story for which buyer.**
- **Biotech:** rE, rA, then rB's Biostatistics and Communication; finish with rD's Quality.
- **Pharma (small molecule):** rE, rA, rD's CMC section signing and biologic refusal, then rD's Quality.
- **CRO:** rE, rB's run of show (which leaves out the Investigator's Brochure, the critical path and the readiness digest), then rA's review and signature steps and rD's Quality.
- **Medical device:** rE, rC (create the new project as "510(k) Premarket Notification"), then rD's Quality.
- **Diagnostics:** rE, then rC on NeuroPanel-Dx (an IVD); do not create a "510(k) for IVD" project live.

**What to avoid, in short.** The full list is "Do not click, do not claim" in
the rehearsal README. The ones that end a demo:
- Any AnA question, chip, starter or demonstration (no model key), and Build
  CSR draft.
- A project's Evidence step (data room), on any project.
- Place into filing after Freeze; Assemble a test package; Compile eCTD; quoting
  error counts.
- CMC QC testing, Batch records and Run contradiction sweep; the organisation
  Vault's governed artifacts; Reporting on a pharma project or the IVD pack.
- The Lumen Reviewer's Investigator's Brochure (empty); notification links;
  the Client Review Room.
- Role gating: every demo persona is an organisation admin.
