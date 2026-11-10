# rD: the cross-cutting work areas (Quality, CMC / Module 3, Vault, Reporting, audit trail and e-signatures)

Rehearsed on 2026-11-10, 11:50 to 12:45 UTC. The app was http://127.0.0.1:5240 on the database gademo, with app_service,
RLS on, launch scope on, dev sign-in off and no model key, on a development build (see below). Personas: quinn (QA lead), ava and rhea (signers),
cal (CMC lead), ana (Vault and reporting). Viewports: 1440×900 light, then 390×844, then dark. Screenshots are in
`shots/rD-*.png`.

## Before you rely on this walk: the environment moved under it

The server is a Vite dev server, and other agents were editing source files during the walk. The server log shows
`[vite] (client) page reload src/concept2cure/v2/...` again and again (12:22 to 12:28 and later). Each reload threw the open page
back to its URL. It closed open e-signature modals, emptied an upload, and left blank white screens for 10 to 30 s while
the client recompiled (`rD-35`, `rD-53` first capture, `rD-80` first attempt). The headless tab also crashed twice
("Target crashed") on the organisation Vault while the box was at load 11 and 11 GB used. A third and fourth load were fine.
None of this is counted as a product finding. A presenter must run on a production build, never on a dev server that
anyone is editing. Because of this, the code under test is **not exactly commit 8a65a6f**.

## What already exists (read before walking)

- The deep walk of 2026-11-09 (`../2026-11-09-rehearsal/deep-walk/findings.json`), areas `quality-audit-reporting`,
  `cmc-and-ana` and `vault-comms-tasks`. Each finding is re-checked below.
- HUMAN-TEST J2 (Vault) and J5 (Quality, CMC, Reporting).
- The demo seed, which filled org 2's Quality (11 controlled documents, 3 changes, 4 CAPAs, 4 deviations, 3 nonconformances,
  5 suppliers, 4 audits, 2 management reviews, most of them from the Lumen copy) and C2C-201's CMC registers.

## Records this rehearsal created (all named "Rehearsal rD …")

| Record | Where | State reached |
|---|---|---|
| SOP-001 "Rehearsal rD SOP Supplier Qualification" | Quality, project C2C-101 | Effective (ava reviewed, rhea approved, both e-signed); Cal and Quinn assigned to train; Quinn acknowledged |
| RD-DEV-2026-001 deviation | Quality (organisation) | Under investigation |
| CAPA "RD-DEV-2026-001: …" (shown as CAPA-2026-0001) | Quality, C2C-201 | Open |
| RD-CC-2026-001 change | Quality, C2C-201 | Approved (ava e-signed) |
| §3.2.S.1 section approval | CMC, C2C-201 | Approved (cal e-signed) |
| Contradiction sweep and a Module 3 compile | CMC, C2C-201 | 2 contradictions recorded; 21 governed artifacts written as V2 |
| "Rehearsal rD - C2C-201 Stability Chamber Qualification.pdf" | Vault, C2C-201, folder 3.2.S.7 | Filed v1.0, text indexed |
| Report runs: Compliance & Audit Assurance Pack (C2C-201) and Inspection & Finding Summary (NeuroPanel-Dx) | Reporting | Partial |

## Run of show (only the steps that worked, in a presenter's order)

1. **Quality register** (`rD-02`). Quality on the rail shows 11 controlled documents, their status, approver, effective date and next
   review, with filters for All, Effective, Under review and Draft.
2. **New controlled document** (`rD-03`→`rD-05`). Choose the project, title and SOP template, give a reason, then **Create and open**.
   The document opens in the one editor.
3. **Write and save with a reason** (`rD-07`). Type the Purpose text, give a reason for change of 8 characters or more, then Save.
   The revision is recorded.
4. **Send for review** (`rD-09`→`rD-11`). Name a reviewer (Ava) and a QMS approver (Rhea) with due dates and a reason. People who are
   not designated as QMS approvers are greyed out, with the reason given.
5. **Reviewer signs** (`rD-12`, `rD-13`). As Ava, open Review route, then **Sign the review**. The Part 11 modal shows the meaning,
   the reason and the password.
6. **Approver signs and the document becomes effective** (`rD-15`, `rD-16`). As Rhea the row says "Your turn: approve". After the
   signature the row reads Effective with "Approved by Rhea Reviewer … Meaning: Approval", and it persists after reload.
7. **Training** (`rD-18`→`rD-21`). Under More, then Training, assign people by name. As Quinn, **Read and acknowledge** shows the text,
   records a personal attestation with its receipt and refresh date, and coverage moves to "1 of 2 acknowledged".
8. **The other registers** (`rD-22`→`rD-28`). Change control with lifecycle filters, CAPA, Deviations, Nonconformances, Suppliers,
   Internal audits and Management reviews, all populated.
9. **Deviation to investigation** (`rD-29`→`rD-33`). Record deviation, then Investigate, and move it to "Under investigation".
10. **Change control with independent approval** (`rD-46`→`rD-49`). Raise a change inside the project and move it to Under assessment.
    The proposer is offered **Advance**, never Approve. A second person (Ava) sees **Approve** and signs it.
11. **Audit trail** (`rD-53`→`rD-56`). Reach it through Search, "Audit trail". The E-sign filter shows the three signatures just made.
    An entry's detail shows the actor, reason, meaning (§11.50), signature record, entry hash and previous hash.
    **Export signed bundle** downloads a signed JSON (data, manifest, signature, verification).
12. **CMC / Module 3 section approval** (`rD-60`, `rD-63`→`rD-65`). On C2C-201, Overview lists Section approvals. Approve section
    §3.2.S.1 opens "Read before you sign", showing the exact composed content and its hash. Sign it and the row reads Approved
    after reload.
13. **CMC's honest refusal** (`rD-73`). On C2C-101 (a biologic), Module 3 build says it is not composed here for a biologic and
    names ICH Q6B, Q5A(R2) and Q5C.
14. **Vault upload with filing** (`rD-80`→`rD-82`). In the C2C-201 Vault, Add files, give the title, type, classification and
    folder, then Upload. The record shows "Filed by Ana Author" with the SHA-256.
15. **One document's audit trail** (`rD-83`). Its History reads "Audit chain verified", with each event, its actor and hash.
16. **Full-text search** (`rD-84`). Searching for "chamber qualification" finds the PDF by its text.
17. **A report by client type** (`rD-92`). In Reporting for C2C-201, the Catalog lets you **Run** the Compliance & Audit Assurance Pack,
    which lists the CAPA and change created above.

## Avoid today

- **Export PDF** in Reporting. It answers 503 `REPORT_PDF_FONTS_UNAVAILABLE` and shows nothing (`rD-93`).
- **Audit trail at the moment.** The second banner now reads "Audit-event chain verification failed — 1 broken link over 1 entry"
  (`rD-57`, `rD-104`). At 12:16 it read "no entries yet" (`rD-53`). Do not open the Audit trail until this is explained.
  If it is opened, do not say "every chain verifies".
- **CMC Study records, QC testing and Batch records.** DS-2502-R2 shows 97.4 % against 98.0–102.0 % with "Pass", and batch
  C2C201-DS-2502 shows "Eligible: Yes" (`rD-68`, `rD-69`).
- **Run contradiction sweep.** It reports two "High specification_conflict" findings that compare assay, impurities, water and solid form
  as if they were one attribute (`rD-71`). These are false.
- **§3.1 read panel** ("The drug substance is C2C-201 tablets", `rD-62`) and **§3.2.P.8** (the false "more than one storage condition" text, `rD-61`).
- **Organisation-level Vault "Governed artifacts".** Every row has no title (`rD-78`).
- **The Raise CAPA modal at organisation level.** It says "No project is open … nothing here is recorded", but a CAPA was recorded.
  Raise a CAPA only inside a project.
- **Reporting home, and the IVD pack on NeuroPanel-Dx.** It ends in "Inspections 0 … Blocking" (`rD-96`). The pharma project home
  says "0 for Pharma: No standard pack … can run here" above a 24-month grid of zeros (`rD-90`).
- **Holds and retention.** These are not in the Vault document panel. They live in Admin settings, which this walk did not cover. Do not
  promise them from the Vault screen.
- **Clicking quickly in Quality.** Reloading the register a few times gives 429 "Too many document requests" (`rD-42` window).

## Earlier findings re-checked (2026-11-09 deep walk)

| Ref | Now | Evidence |
|---|---|---|
| quality v0: audit trail shows only the newest 200 | still open: "200 entries" against 1868, then 1935, chained | `rD-53`, `rD-57` |
| quality v2: no training acknowledgement on SOP-001 | still open for seeded SOPs (nobody assigned); acknowledging works when assigned | `rD-21` |
| quality v4: Reporting says C2C-101 0 % | still open in kind: C2C-201 "scores 0 % … 23 critical gaps" beside 21 composed sections | `rD-90` |
| quality u0: "Open document" on a draft opens an empty acknowledge box | could not check | n/a |
| quality u1: raw section codes in Version history | still open ("qms-purpose Purpose", "qms-scope Scope"), also in the editor's unsaved-changes dialog | `rD-51`, `rD-06` |
| quality u2: MDX-CC-2026-001 links show Vault UUIDs | still open (46852fb3-…, 7ef57bd0-…) | `rD-50` |
| quality u3: Approve offered to the proposer | fixed: proposers see Advance; the second person sees Approve | `rD-48`, `rD-50` |
| quality u4: raw codes in audit rows | still open ("C2c Work Approve", "qms-change:5", "user:3", "cre_evidence_source:463") | `rD-54` |
| quality u7: enum codes in the report catalog | still open (USA_OLAW, "pm", "ra lead") | `rD-91` |
| quality u9: Device projects grid on a biotech report page | still open | `rD-90` |
| quality u15: "digitally signed" | still open in entry detail | `rD-55` |
| cmc v0: stability says all 14 results OOS | partly fixed: now "0 outside limits · 14 not assessed", but §3.2.P.8 names 1 OOS | `rD-67`, `rD-61` |
| cmc v1: §3.1 "C2C-201 tablets" | still open | `rD-62` |
| cmc v2: DS-2502-R2 Pass, batch eligible | still open | `rD-68`, `rD-69` |
| cmc u0: camelCase missing inputs | still open | `rD-60` |
| cmc u1: garbled §3.2.A.3 missing input | still open | `rD-60` |
| cmc u3: composed narrative unsupported claims (§3.2.P.8 storage conditions) | still open | `rD-61` |
| cmc u8: drug substance row "--" and "phase_2" | still open | `rD-66` |
| cmc u12: biologic refusal honest | still holds (refusal honest); Compile and sweep buttons still shown above it | `rD-73` |
| vault u0: org governed-artifact titles collapse to 0 px | still open (title width measured 0) | `rD-78` |
| vault u2: governed tree "not started" where content exists | still open in kind: 21 compiled Module 3 artifacts, 3.2.S.1–3.2.P.8 folders read 0/0 | `rD-82` |

## Findings (new or re-confirmed with fresh evidence), most severe first

See the structured result for the full list. In short:

**Blocks the demo:**
- Report Export PDF fails with 503.
- The audit-event chain shows as failed.
- QC shows a fail as "Pass" and the batch as eligible.
- The contradiction sweep reports false positives.
- Organisation Vault artifacts have no titles.
- The device reporting pack is empty.

**Embarrasses:**
- Duplicate CAPA numbers.
- The organisation-level CAPA modal lies about recording nothing.
- A change can be approved with no impact, risk or plan.
- An SOP can be approved with 8 of 9 sections empty.
- Two different e-signature modals.
- Compile Module 3 gives no feedback.
- The editor shows contradictory lock banners on an effective SOP.
- Raw codes appear in audit, CMC and the report.
- Raw ISO times appear in the report.
- A row of 8 equal buttons appears under More.
- Each approval timestamp appears twice.
- The audit trail at 390 px squeezes to one word per line.
- 429s on reload.
- A new SOP is numbered "SOP-001" beside C2C-SOP-001.
