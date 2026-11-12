# Biotech walkthrough — C2C-101, a Phase 2 IND, end to end in ten minutes

**Who this is for.** The founder, showing the launch catalog (Projects, Vault,
Authoring, Submission Center, Submission Readiness, QMS controlled documents) with one
realistic program. Everything named here exists in the demo tenant after
`DEMO_SEED_EMAIL=<your dev-login address> node scripts/demo/launch-demo/seed.mjs --pack biotech`
(or `DEMO_SEED_TOKEN=…` for a hosted server; ids in
`docs/evidence/DEMO/biotech/manifest.json`). Every record is fictional and prefixed
`[Demo · Biotech]`; say so if asked — and say that the documents were written for the
demo, not drafted by a model.

**The story in one breath.** Concept2Cure Therapeutics is filing an original US IND for
C2C-101, a humanized anti-IL-23p19 monoclonal antibody for moderate-to-severe plaque
psoriasis, to open Study C2C-101-201 — a Phase 2, randomized, placebo-controlled,
dose-ranging study (100 mg / 200 mg / placebo, PASI 75 at Week 16). The Vault holds the
six source documents, Authoring holds the synopsis and the Module 2.5 overview, the
protocol is built in Protocol development, sequence 0000 is assembled, the readiness gate
says what still blocks dispatch, the QMS shows the SOPs the work runs under, and the
audit trail has every step.

**Before you start.** Sign in with "Demo access". In the top bar keep the segment on
*Biotech & Pharma* and the organisation on *Concept2Cure Therapeutics*. Open Projects
first — selecting the program there is what makes Vault, Authoring, Submission center and
Dispatch readiness show *this* program.

---

## 1 · Projects (1 min) — the program and its home

Open **Projects**. Point at **[Demo · Biotech] C2C-101 anti-IL-23p19 mAb — plaque
psoriasis (IND)** (code CAMA). Click it to reach **Project home**.

Say: *"One program, one governed dossier. Sponsor, product, indication, priority, and the
IND number honestly shown as 'not assigned' — the agency hasn't given us one, so the
product doesn't invent one. The journey bar — Plan, Evidence, Author, Review, Submit,
Respond, Lifecycle — is where we are going next."*

## 2 · Vault (1½ min) — the six source documents, filed by CTD module

Open **Vault**. Under **Uploaded files** point at the six PDFs and their filing:

- Investigator's Brochure C2C-101 v3.0 → Module 1
- Pre-IND Meeting Minutes (Type B) → Module 1
- CMC Quality Summary (3.2.S / 3.2.P overview) → Module 2
- Nonclinical Toxicology Summary → Module 2
- Protocol C2C-101-201 v1.0 → Module 5
- Statistical Analysis Plan C2C-101-201 v1.0 → Module 5

Say: *"Each upload is hashed on the way in — SHA-256 — and the hash is what the audit
trail and the submission leaf point at. Filing is a person's decision: the SAP was
auto-suggested into Module 5 and then confirmed; 'FILED' means a human confirmed it.
Open the filing cabinet if you want to see the CTD structure the IND scaffolds — 92
sections for an FDA IND, Module 1 per the FDA eCTD spec, Modules 2–5 per ICH M4."*
Optionally open the IB: it is a real two-page document, not a placeholder.

**The data catalog (30 s, optional).** Still in Vault, open the **Data catalog** tab. It lists every captured file
across this sponsor's projects, organized by study; use **Organize by** to regroup by project, kind, CTD section or
Vault folder. Point at one item's grade and open it: the grade is A to D with a score, and under it each criterion
with the recorded fact behind it (the SHA-256 at capture, whether the bytes are filed and their fixity proven,
whether it is the current version, whether a person confirmed what it is, and for a dataset the CDISC validator).

Say: *"The grade is computed from what the system records about the file, by a fixed engine. AnA reports it; AnA
cannot set it. 'Use in this project' subscribes this project to an item, and the project's Data room then lists what
it uses first."* Press **Use in this project** on one item, then show it under **Used in this project** on the
project page (Evidence → Project files → Data room), with **Remove** beside it. A file captured only in the Vault's
upload does not appear here: the catalog lists what came through the data room (the project page's Evidence step, or
a file attached to AnA with the project open).

## 3 · Authoring (2 min) — draft, comment, resolve, freeze, sign

Open **Document editor & authoring**. The open document is
**Protocol Synopsis C2C-101-201** (sections S.1 Objectives … S.6 Statistical methods).

Point at the red banner: *"This document is frozen. Its content is sealed under a
content hash."* Say: *"Two reviewer comments were raised on the design and the sample
size — 'align the stratification wording', 'confirm the 8 % placebo assumption' — and
resolved with a note. The product refuses to freeze while a comment is open; once
settled, freeze v1.0 sealed the content, and a second person — not the author — applied
a 21 CFR Part 11 electronic signature with a meaning (REVIEWER) and a stated intent,
bound to that exact content hash. Author and signer are different people; the product
enforces that."*

Then say what is still live: *"A Module 2.5 Clinical Overview (2.5.1–2.5.6) is out for
review with a QA workflow step pending — you'll see it on the Review board. And the IB
Summary of Data and Guidance for the Investigator is still a draft with an open comment
from the medical monitor about hepatitis screening — that is what an editor with real
work in it looks like."* (Known limit: the editor lists the program-bound document; the
other two are reachable from the Review board / document list, not from this tree — see
the evidence README, finding 2.)

## 4 · Protocol development (1½ min) — the study, structured

Open **Protocol development** (rail → Author & assemble).

If the surface shows *"not in this release"*, say so plainly: *"Protocol development is
built and seeded but sits outside the launch catalog; it's gated by launch scope, not by
a plan or a setting."* Then describe what is there (it is complete in the API and is
visible when launch-scope enforcement is off — screenshot in the evidence folder):

- Protocol C2C-101-201, Phase 2, interventional, ten ICH M11 sections written
- 6 objectives with endpoints and timepoints (primary: PASI 75 at Week 16)
- 8 inclusion and 8 exclusion criteria
- Schedule of assessments: Screening, Baseline, Week 2, 4, 8, 12, 16, End of Treatment,
  Safety Follow-up × 10 assessments — 51 marked cells
- 6 risks with mitigations and owners (infection, assessor unblinding, enrolment…)
- Milestones: IRB approval, FPI, LPI, DBL, CSR
- Amendment 1 — add Week 2 PK sampling (the pre-IND action item), with its change
- Version 0.2 snapshot

## 5 · Submission center (1½ min) — sequence 0000, assembled, not yet frozen

Open **Submission center**. In the portfolio picker at the top right choose
**[Demo · Biotech] C2C-101 … (IND) · IND · FDA (US)** (the picker opens on the first
submission in the organisation, so pick ours). Click **Sequences**.

Point at **0000 · Original Sequence · FDA (US) · ASSEMBLING**. Say: *"Six leaves placed
from the Vault by their document ids — IB at 1.14.4.1, pre-IND minutes at 1.6.3, QOS at
2.3, toxicology summary at 2.6.6, protocol and SAP at 5.3.5.1. The lifecycle is draft →
assembling → validated → frozen → dispatched. The generic transition endpoint refuses
freeze and dispatch outright — those go through the Part 11 e-signature chain — which is
why the buttons here offer only 'Validated' and 'Draft'."* Do **not** freeze: the next
surface explains why the gate would refuse.

## 6 · Dispatch readiness (1 min) — the deterministic gate, and why it says no

Open **Dispatch readiness**. It resolves the open program's sequence on its own.

Point at **Dispatch blocked — 3 blockers**: *"This is the floor the model can't talk its
way past. One: six error-severity structural findings. Two: no completed Shadow Review.
Three: no Part 11 release signature. The numbers come from a deterministic engine; with
no AI provider configured the narrative is honestly null — the verdict does not need
one."* Be candid about the six errors: *"They are the product's own defect — leaves
placed from the Vault by UUID are reported as unresolvable because the checker only
reads integer document ids. It's logged as a finding; the gate is doing exactly what a
gate should do with it: refusing."*

## 6b · CMC / Module 3 (1 min, optional) — the dossier that composes, and the one that says why not

Open **Projects** and choose **C2C-201 oral JAK1 inhibitor** (the same sponsor's small molecule), then **CMC /
Module 3** in the rail, tab **Module 3 build**. Point at the line "21 sections in CTD §3.2 · 0 of 21 approved · 18
ready to compile", then **Export readiness**: "Not export ready", with the reason beside it (sections not approved,
and sections with no recorded source lineage).

Say: *"Module 3 is compiled from the study's own registers: drug substance and product, methods, specifications,
stability, batches and release results. The export gate fails closed: nothing leaves until every section is approved
and traced to its source."* Then, if asked about biologics, open **CMC / Module 3** on C2C-101: it says Module 3 is
not composed here for a biologic and names the guidelines that apply (ICH Q6B, Q5A(R2), Q5C). That boundary is
deliberate; the platform says it instead of composing something wrong.

## 7 · Quality (1 min) — the SOPs the work runs under

Open **Quality & Assurance**. In the **Controlled-document register** point at:

- **C2C-SOP-001 Document Control — Effective 1.0**, and
- **C2C-SOP-002 Change Control — Effective 1.0**: *"Approved by a second person with
  password re-authentication, meaning APPROVED, a reason and an effective date. The
  approval is an electronic signature bound to a SHA-256 of the document content;
  self-approval is refused."*
- **C2C-SOP-003 Deviation Management — Under review**, **C2C-SOP-004 Training — Draft**:
  the lifecycle in one glance.
- Training compliance: SOP-001 has a read-and-understood attestation against v1.0.

Click **Change control**: **C2C-CC-001 — Add Week 2 PK sampling to Protocol
C2C-101-201 (Amendment 1)**, Document / Minor / Proposed, linked to SOP-002. Say:
*"The protocol amendment in step 4 and this change record are the same event seen from
Clinical and from Quality."*

## 8 · Audit trail (30 s) — every step, hash-chained

Open **Admin → Audit trail**. Point at the newest entries: vault ingest and filing, the
authoring freeze and e-signature, the QMS approvals and the change record — each with
actor, time, target, record hash and previous hash. Filter **E-sign** to show the two
signature events.

Be straight about the banner: *"'Chain verification failed' points at one legacy row
from before sequencing was introduced; every entry written during this demo is chained
and verifies. The product surfaces the break instead of hiding it — that is the point of
an append-only ledger."*

---

**Closing line.** *"One program, six source documents, a signed synopsis, a structured
protocol, an assembled sequence, a gate that refuses for reasons it can name, four SOPs
and a change record — and every one of those steps is on the ledger with a hash. The
things we did not do are the ones a person must do: freeze and dispatch."*

**If something is not where this says.** The seed is idempotent — re-run
`DEMO_SEED_EMAIL=<your dev-login address> node scripts/demo/launch-demo/seed.mjs --pack biotech`
(or `DEMO_SEED_TOKEN=…` for a hosted server; with the second signer's
`OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD` for the signed steps); it creates nothing that
already exists and reports what it found.
