# The workflow decision: what we build, for whom, and why (2026-10-08)

**To:** the founder
**Status:** this is a proposed decision. Three items need your explicit yes, listed at the end of §1.
**How to read the sources:**
- **"verified"** means the page was fetched.
- **"by reading"** means a primary-source page read through search excerpts. The research sandbox could not fetch fda.gov, ecfr.gov or ema.europa.eu directly.
- **"unverified"** means a secondary source, or my own inference.

Repository claims were checked at HEAD 149d2d1ac.

---

## 1. The decision

Concept2Cure is one product: the filing. It is not seven apps.

- A project is one regulatory filing, worked in five tabs: Evidence, Author, Review, Submit and Respond.
- One AnA conversation runs alongside, with the document canvas on the right.
- For the next 8 weeks we sell one job, as a labelled limited beta to 3–5 paid design partners: **the next sequence on a US commercial IND, governed.**
  - We import the sponsor's earlier eCTD history into one record.
  - We draft the amendment with AnA, cross-check it with deterministic engines, and sign it under Part 11.
  - We freeze it as an eCTD v3.2.2 sequence, checked against a subset of FDA's published criteria.
  - The sponsor downloads those exact bytes and uploads them through its own FDA ESG NextGen portal account.
- Most of the deterministic lifecycle engines this needs already exist in the repository and are tested. They are locked behind an out-of-scope surface. So most of the work is unlocking and wiring, not building.

- **Who first:** the regulatory lead at a US emerging biotech.
  - Series A–C, 1–3 regulatory staff, no RIM system, not on Veeva Basics or Vault RIM.
  - Holds an active commercial IND already in eCTD, with a lifecycle item due within 16 weeks.
  - Second, as a channel: 1–2 boutique regulatory consultancies.
- **Which job:** a protocol amendment (21 CFR 312.30) or an information amendment (312.31).
  - The annual report or DSUR comes second, once safety data can be imported.
  - Answers to FDA letters come third.
  - The original IND (sequence 0000) is the investor demo, not the first thing a client trusts us with.
- **The workflow in one line:** import the IND's history → engines show what is due → evidence into the Vault → AnA drafts on the canvas → named people review and sign → engines place, check and give the verdict → a person freezes → the sponsor downloads and uploads through its own ESG account → we record what FDA returned.
- **What we stop:**
  - the package-store transmit lane;
  - work on AS2/PKCS#7 transmit;
  - every filing in the New project picker that has no path to the agency;
  - FDA "variation";
  - sequence builds for markets other than the US;
  - 15-day safety reporting;
  - everything outside the amendment job until a partner has filed (D10).
- **What we claim and do not claim:**
  - We claim: "built, reviewed and Part 11-signed, checked against a subset of FDA's published criteria, frozen, and ready for you to upload through your own ESG NextGen account. Our gateway transmission is not yet offered."
  - We do not claim: transmission to FDA, "validated", "will be accepted", "Part 11 compliant", AI that has passed qualification (PQ) before it has, filing in several jurisdictions, or speed figures we have not measured.

**Three items need your explicit yes** (Rule 2 and the deletion and catalog rules require it):
1. **Scope change.** Move these prefixes under Submission Center: `/api/ind-lifecycle` (by allow-list, excluding `/safety-report/*`, `/icsr*` and `/icsr-transmissions*`), `/api/ind-forms`, `/api/ind-master-data` and `/api/haq-manager`.
2. **Catalog wording.** Restate row D2 and the CLAUDE.md catalog wording so that Submission Readiness is the verdict view inside Submit. The name stays as a catalog and entitlement entry.
3. **Shadow Review gate.** Keep it for beta, and add a signed, audited human waiver for use when the AI provider is down.

Your own critical-path items:
- D1 staging: AWS account, DNS, SMTP, secrets, and the Anthropic key.
- Approve `server/eval/pq/pq-protocol.json`, which is still a draft.
- Recruit the design partners.

---

## 2. Why

### The regulators: what an agency must receive, and where a human must sign

**The package must be technically valid. That check comes before any science.**
- At FDA, a High-severity eCTD error means the submission is "considered not received" and must be resubmitted (https://www.fda.gov/media/87056/download, by reading). The common causes include:
  - a leaf with no file, or a file with no leaf (rules 1306 and 1323);
  - a missing us-regional.xml;
  - an invalid submission type or sub-type (rules 2034 and 2022).
- eCTD has been legally required for commercial INDs since 5 May 2018. Noncommercial INDs are exempt (https://www.fda.gov/media/135373/download, by reading).
- FDA supports v3.2.2 and has announced no date when v4.0 becomes mandatory (https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/ectd-submission-standards-ectd-v40-and-regional-m1, by reading).
- The EU has accepted only sequences built to EU Module 1 v3.1.1 and checked against validation criteria v8.2 since 1 Dec 2025. Failing one pass/fail rule sends the sequence back (https://esubmission.ema.europa.eu/eumodule1/, by reading). Our EU Module 1 is flat, so an EU sequence built by us would fail.
- PMDA requires eCTD v4.0 for new applications from April 2026 (https://www.pmda.go.jp/files/000251321.pdf, by reading). We build v3.2.2 only.
- Our own FDA criteria check calls itself "NOT a substitute for the agency validator" (`server/services/ectd/external-validator/fda-criteria-adapter.ts:1-17`). There are no eCTD DTD files in the repository.

**The content must be complete.** FDA's refuse-to-file grounds are mostly gaps in completeness:
- forms;
- certifications;
- financial disclosure;
- labeling in SPL format;
- English translations;
- the environmental assessment;
- the initial pediatric study plan (iPSP).

Sources: 21 CFR 314.101(d) (https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-314/subpart-D/section-314.101) and CDER's refuse-to-file guidance (https://www.fda.gov/files/drugs/published/Refuse-to-File--NDA-and-BLA-Submissions-to-CDER-Guidance-for-Industry.pdf), both by reading. A checklist that needs no model can catch these.

**A named person is accountable.**
- **Signatures.** Part 11 requires each signature to show the signer's name, the date and time, and the meaning (§11.50). The signature must stay bound to its record (§11.70), and each signer must be unique (§11.100) (https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11). The sub-points are from my own knowledge, so they are unverified.
- **Non-repudiation letter.** Before first use, the organisation must certify its electronic signatures to FDA (§11.100(c): https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11/subpart-C/section-11.100, by reading).
- **AI disclosure.** No agency asks the applicant to disclose that AI drafted text (unverified).
- **FDA AI guidance.** FDA's January 2025 draft guidance excludes AI that only drafts a submission, when the drafting does not affect safety, quality or reliability. It does cover AI that produces analyses supporting a decision (https://www.fda.gov/regulatory-information/search-fda-guidance-documents/considerations-use-artificial-intelligence-support-regulatory-decision-making-drug-and-biological, by reading). That is the line CLAUDE.md Rule 2 already draws: engines produce the numbers, and the model narrates.
- **Applicant accountability.** The EMA reflection paper makes the applicant accountable for every model being fit for purpose (https://www.ema.europa.eu/en/news/reflection-paper-use-artificial-intelligence-lifecycle-medicines, unverified). FDA and EMA published joint good AI practice principles in January 2026 (https://www.fda.gov/about-fda/artificial-intelligence-drug-development/guiding-principles-good-ai-practice-drug-development, by reading).

**The channel.**
- ESG NextGen accepts a browser upload through the Unified Submission Portal, with multi-factor sign-in. It also offers an API and AS2.
- FDA's pages conflict on whether a company new to ESG can get AS2. Compare https://www.fda.gov/industry/resources/esg-nextgen-frequently-asked-questions with https://www.fda.gov/industry/electronic-submissions-gateway-next-generation-esg-nextgen/esg-nextgen-as2-account-set-steps (both by reading). Confirm with ESGNGSupport@fda.hhs.gov.
- CROs and consultants can submit for a sponsor with an authorization letter (https://www.fda.gov/industry/getting-started-esg-nextgen/steps-cros-us-agents-and-consultants-create-esg-nextgen-account, by reading).

**Safety reporting has moved.** Since 1 Apr 2026, 15-day reports of serious and unexpected suspected adverse reactions (SUSARs) go to FDA's adverse event database, AEMS, as E2B(R3) data, not into eCTD (https://www.fda.gov/drugs/investigational-new-drug-application-ind/ind-application-reporting-ind-safety-reports, by reading).

**Where a human must decide and sign.** AnA may draft, find and explain at every one of these points. It decides none of them.
- a) The pathway, the application type, and the submission type and sub-type, including the amendment type and any supplement category.
- b) The approval of each governed document, by author, reviewer and approver, with a §11.50 signature. Every AI-drafted span is accepted or rejected by a named person.
- c) Confirming that each figure traces to its source.
- d) Signing the agency forms. The sponsor's official signs the Form FDA 1571; the investigator signs the Form FDA 1572.
- e) Freezing the sequence.
- f) Uploading or authorising transmission under the sponsor's own account.
- g) Approving each answer to an agency letter, and every commitment in it.
- h) Choosing what to do after a refusal or a complete response letter.

### The clients: who pays first, and for what

**Who pays first is the small sponsor.**
- Emerging biopharma holds about 70% of clinical-stage assets (https://www.iqvia.com/locations/emea/blogs/2026/01/biopharma-m-and-a-outlook-for-2026, by reading).
- These companies cannot build what Novo Nordisk built on Claude (https://claude.com/customers/novo-nordisk).

**The volume is in the lifecycle, not the original IND.**
- CDER received 1,210 commercial original INDs in 2025 (https://www.fda.gov/drugs/ind-activity/ind-receipts, by reading).
- It received 429,879 submissions in FY2025 (https://fda.gov/media/193422/download, by reading).
- The recurring work is:
  - protocol amendments (312.30);
  - information amendments (312.31);
  - the annual report or DSUR, due 60 days after the anniversary (https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312/subpart-B/section-312.33);
  - answers to FDA, on a clock.
- Recurring work is what earns repeat use and makes the product hard to leave.

**Budgets are consultant and publisher budgets, not seat budgets.**
- NIH SEED cites $50K to over $500K for drug development consulting (https://seed.nih.gov/sites/default/files/2024-12/Regulatory-and-Manufacturing-Consulting-for-Life-Sciences.pdf, unverified).
- No public price per sequence exists.

**Who is not first:**
- Pharma needs SOC 2, a penetration test and a supplier audit. We have none of these yet.
- Large CROs are tied up: Parexel works with Weave, and IQVIA has its own platform.
- Medtech already uses FDA's own eSTAR template (https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program, by reading).

### The market: where competitors are weak

**Drafting is commoditised.**
- Anthropic sells drafting and gap-finding directly: "Claude flags gaps in your regulatory package before anything ships" (https://claude.com/solutions/life-sciences, verified).
- Weave Bio claims multi-jurisdiction drafting and agency-question handling with Takeda and Parexel (https://www.businesswire.com/news/home/20260615319013/en/Weave-Bio-Enables-Global-Submissions-From-a-Single-Source-of-Truth, unverified).

**The incumbent is already in our segment.**
- Veeva Basics serves more than 175 emerging biotechs (https://www.veeva.com/resources/emerging-biotechs-standardize-on-veeva-basics-to-accelerate-drug-development/, by reading).
- Veeva's regulatory agents are planned for November 2026 (https://www.veeva.com/products/falcon/, by reading).

**Where they are weak:**
- None of them is shown to hold the sponsor's whole sequence history together with signed, source-pinned leaves, deterministic clocks and lifecycle checks, and the next sequence built from that record.
- None is shown to do it at a price a 40-person biotech can pay without installing a RIM system.
- That handoff from governed record to signed sequence is the moat. AnA is the interface to it, not the product.

### What Anthropic would do

**Documented in Anthropic's own published record:**
- **Simple patterns first.** Use the simplest composable pattern, add complexity only when it "demonstrably improves outcomes", and keep human checkpoints before high-stakes steps (https://www.anthropic.com/engineering/building-effective-agents, verified; https://www.anthropic.com/news/our-framework-for-developing-safe-and-trustworthy-agents, verified).
- **Qualified review in high-risk domains.** "A qualified professional in that field must review the content or decision prior to dissemination or finalization" (https://www.anthropic.com/legal/aup, verified).
- **Evals before shipping.** "20-50 simple tasks drawn from real failures is a great start". Domain experts write the tasks, and deterministic graders are used where possible (https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents, verified).
- **Honesty.** Never create false impressions. Unhelpfulness is "never trivially 'safe'" (https://www.anthropic.com/constitution, verified).
- **Staged launches.** Claude Code went from research preview to general availability (https://www.anthropic.com/news/claude-3-7-sonnet ; https://www.anthropic.com/news/claude-4, verified). The life-sciences launch came with hands-on expert support (https://www.anthropic.com/news/claude-for-life-sciences, verified).
- **The artifact sits beside the conversation.** It appears "in a dedicated window alongside their conversation" (https://www.anthropic.com/news/claude-3-5-sonnet, verified).
- **Traceability.** "Every output carries an auditable history of how it was made" (https://www.anthropic.com/news/claude-science-ai-workbench, verified).
- **Model declines and fallback.** Opus 5.5 can decline legitimate life-sciences work and fall back to another model (https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback, verified).
- **Life Sciences Verification Program.** It lists regulatory affairs as covered work. It is a beta, first-party only, and not for organisations with a BAA (https://www.anthropic.com/news/life-sciences-verification-program, verified).

**Inferred (my reading):**
- Anthropic would ship one narrow vertical slice, labelled as a limited beta, to a few design partners with hands-on help.
- It would keep the model on drafting and explaining, and let engines and named people decide.
- It would run an eval before any governed output reaches a client.
- It would refuse to offer a filing it cannot finish.
- It would widen only on measured evidence.

---

## 3. The workflow, end to end, as the client lives it

The AnA conversation stays open on every tab, with the canvas on the right. In each step below:
- **Person** is what the client does.
- **AnA** may draft, find and explain. It never decides or signs.
- **Engines** are the deterministic code that decides.
- **Signs** is where a named person signs.
- **Regulator** is what FDA ends up receiving.

**0. Onboarding (outside the product, with our help, started in week 1)**
- **Person:**
  - Opens or confirms its ESG NextGen account.
  - Files its §11.100(c) non-repudiation letter.
  - Runs any FDA test submission that FDA requires; review can take up to a week.
  - Gives us its earlier sequence folders, which may sit with a former publisher or CRO.
- **AnA:** states plainly that it is AI. Article 50 of the EU AI Act has applied since 2 Aug 2026 (https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act, by reading), and we do this everywhere. AnA also explains the onboarding steps.
- **AI-literacy training:** good practice for US sponsors, not a legal duty for them.

**1. New project and history import (project creation, then the Evidence tab)**
- **Person:** chooses "US commercial IND (FDA)" and confirms the IND number, the FDA receipt date of sequence 0000, and the dates of any clinical hold or lift.
- **Engines:**
  - The picker offers only filings that have a path.
  - Scaffolds the FDA Module 1 v2.3 outline (`migrations/20260901_ind_fda_m1_v2_3_outline.sql`).
  - **History import (new build):** parses each earlier sequence's index.xml and us-regional.xml into sequences and leaves, marked "filed outside the platform" and read-only.
  - Stores those files in the Vault with fixity checks and reports any gaps in sequence numbering.
- **Without the import:** the first sequence uses only new and append operations. A "replace" target is never guessed. The amendment service itself warns that replacing the wrong leaf corrupts the lifecycle (`ind-amendment-service.ts:37-40`).

**2. What is due (the project header line, F9)**
- **Engines:** compute from the recorded receipt dates only:
  - the 30-day clock and clinical-hold state (`ind-regulatory-clock.ts`; https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312/subpart-C/section-312.40);
  - the annual report due date;
  - open agency letters;
  - amendments in draft.
- **AnA:** explains a date. It never produces one.

**3. Evidence**
- **Person:** uploads the revised protocol, the redline and the rationale for the change. The Vault assigns versions, verifies hashes and records where each file is used.
- **AnA:** summarises what arrived and proposes which source belongs to which section.
- **Engines:** pin each mapping to an exact source version.

**4. Author (F3, F4, F5)**
- **Person:** chooses the amendment type: a 312.30 new protocol, protocol change or new investigator; or a 312.31 CMC, pharmacology/toxicology or other information amendment. Clicking an unstarted section starts it.
- **Engines:**
  - The amendment planner (`ind-amendment-service.ts`) proposes the module placements and each leaf's lifecycle operation.
  - The person confirms every "replace" target against an imported leaf.
  - The lifecycle validator checks that the sequence type is legal against the history.
  - Engines assign the next sequence number and fill Form FDA 1571 and the cover letter's fixed fields from master data (`/api/ind-forms`, using the official AcroForm templates).
- **AnA:** drafts the cover letter and the summary of changes on the canvas, with citations to Vault sources. In production, until PQ passes for that document class, the person writes and AnA reviews and explains. `model-governance.ts:171` refuses drafting and allows review.
- **Engines:** every number comes from source data. Each AI span records the model that actually served it, including any fallback.

**5. Review (F1, F1b, F7)**
- **Person:** sends the document for review. The reviewer comments. The author accepts or rejects each AI span.
- **AnA:** explains the comments and proposes edits.
- **Engines:** run cross-document checks, such as protocol number, version, dates and enrolment N agreeing across leaves (`dossier-number-reconciler.ts`).
- **Signs:** author, reviewer and approver each sign through `reverify-signer`.
  - Section status follows the signature (F1).
  - The PATCH request at `documents.ts:470-500` can no longer set "approved".
  - Freeze refuses text whose AI spans have not been accepted.

**6. Submit (F9, F10/F11, F17, F18; Submission Readiness is this view)**
- **Engines:**
  - Place only approved leaves (`leaf-source-resolver.ts:159`).
  - Give one verdict per sequence (`assess-dispatch-readiness.ts`). The verdict combines:
    - the structural check;
    - the FDA-criteria subset, labelled "pre-validation";
    - the lifecycle validator;
    - the release signature;
    - an amendment completeness checklist: a signed 1571, a cover letter, correct Module 1 placement, legal lifecycle operations, no unaccepted AI text, Form FDA 3674 where a new protocol triggers ClinicalTrials.gov certification, and an investigator-signed Form 1572 collected for new-investigator amendments.
- **AnA:** explains each failing check and opens its fix. It never clears a check.
- **Signs:** the person freezes the sequence after a clean verdict, with a release signature.
- **Engines:** assemble the frozen bytes with a checksum and signed-leaf manifest.
- **Person:** runs an agency-grade validator on those bytes. Until we license one, that is the partner's own validator, run under a written beta SOP.

**7. File (beta form of F12, then F13)**
- **Person:**
  - Downloads the exact frozen bytes.
  - The sponsor's official signs the 1571.
  - Uploads through the ESG NextGen portal under the sponsor's own account.
  - Records the ESG core ID and the acknowledgement files, which are stored in the Vault.
- **Engines:** keep three separate states:
  - **Received:** Ack1 and Ack2.
  - **Technically processed:** Ack3, which is the center's load and processing message. That is our reading; confirm it against FDA's ESG pages.
  - **Regulatory effect:** for an IND, in effect at Day 30 unless FDA imposes a hold.
  - None of these is shown as "accepted" unless it is. The recorded receipt date drives the next clocks.
- **Regulator:** receives the same bytes that were checked, signed and frozen.

**8. Respond (F15, after D10)**
- **Person:** uploads the FDA letter and confirms how it splits into questions.
- **AnA:** proposes the split and drafts each answer from the evidence. It never invents question numbers or dates.
- **Signs:** each answer and each commitment gets a §11.50 signature (F1b; today `haq-manager.ts:399-416` approves without one).
- **Engines:** refuse to assemble while any answer is unapproved. A partial response does not start FDA's clock. The response becomes a new sequence through steps 5–7.

**9. Annual report or DSUR (after D10, with a safety-data import)**
- **Engines:** produce the tabulations, line listings and the gap list (`ind-annual-report-service.ts`, `ind-sae-line-listing.ts`).
- **AnA:** writes the narrative.
- Then steps 5–7.

**AnA never:**
- chooses a pathway, sequence type or supplement category;
- produces a figure or a date;
- marks anything approved;
- signs, freezes, uploads or transmits.

---

## 4. The five open questions

1. **Transmit from the sequence or from a separate package store?**
   From the sequence. For beta, "transmit" means two actions on the frozen sequence: "Download frozen package" and "Record filing". Next comes the ESG API, after a partner's test submission passes. AS2 comes last, after FDA confirms whether a company new to ESG can get it.
   *Reason:* FDA judges the bytes it receives, and §11.70 requires the signed record to be the filed record.

2. **What do we sell, and should the picker stop offering filings with no path?**
   Sell the next amendment on a US commercial IND. Yes, the picker stops offering filings with no path, and creation refuses them with the reason. That covers: device programs past authoring, MHRA "IND", new Japanese NDAs, Health Canada, agencies with no rule pack, and FDA "variation". The EU (including EU trial applications through CTIS) and continuing PMDA lifecycles are offered as "Author documents for this market" only.
   *Reason:* a sequence we know would fail the agency's validation is a false impression, but withholding real authoring value is not "safe" either.

3. **Submission Readiness: a named app or a view in Submit?**
   A view in Submit: one verdict per sequence per market. The name stays only as a catalog and entitlement entry. In the same change, the duplicate `ind-dispatch-gate.ts` is merged into `assess-dispatch-readiness.ts`. This needs your yes.
   *Reason:* agencies and buyers care whether the sequence passes, not what the app is called.

4. **US supplements (PAS, CBE-30, CBE-0) and Japanese partial-change applications before beta?**
   Coming later, shown on the market row. A model never suggests the category. After D10, a marketed-product client gets a supplement type the human picks and signs.
   *Reason:* under 21 CFR 314.70 the category decides when the changed product may legally ship (https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-314/subpart-B/section-314.70, by reading). Whether a continuing v3.2.2 lifecycle can carry Japanese partial changes is unverified.

5. **Run model PQ before beta, or demo on staging and say so?**
   Both, in order.
   - Demos run now on staging, labelled "staging; AI drafting not yet qualified".
   - Beta clients start at once with human authoring and AI review.
   - No AI-drafted text enters a client's sequence until PQ passes for that document class.
   - The PQ is 20–50 tasks written by regulatory experts. It covers Opus 5.5 and its Opus 5 fallback, measures decline and fallback rates, and records which model served each span.

   *Reason:* no regulator requires a vendor's model PQ, but Rule 2 does, and the client's QA team will ask for it.

---

## 5. What we cut or hide now

| Cut or hide | Reason |
|---|---|
| Transmit on the package store (`/api/submission-ops`, the GatewayTransmittals form at :466 and :655). Stop work now. Lock the form once F12/F14 provide the replacement, named by path. Before locking, fold the package-spine lane's packager fixes (work-orders README:73: xlink namespace, applicant info, Module 1 order) into sequence assemble. | A second store splits the record that must be one. Zero duplication. |
| **Do not stop** the IND eCTD demo lane (README:61). Re-point it onto the sequence spine. | It owns ind-forms, IndFormsPanel and AuthoringPlaceIntoFiling, which this decision needs. |
| AS2/PKCS#7 work, and the Health Canada adapter. Health Canada must refuse, not post to an endpoint written from no agency source. | The AS2 envelope is not PKCS#7 (`fda-esg.ts:18-35`), and the portal upload works today. |
| Picker entries with no path, and FDA "variation" (coded as an amendment to the original application, `core-to-packager.ts:226-227`). | It would misfile a post-approval change, and offering it creates a false impression. |
| Non-US sequence builds. Fix `submission-resolver.ts:237` so EMA and PMDA no longer read as buildable. | Flat EU Module 1; PMDA requires v4.0. |
| `/safety-report/*`, `/icsr*`, `/icsr-transmissions*`. Never unlocked; a CI allow-list enforces this. | SUSARs go to AEMS as E2B(R3). The route still files them as eCTD amendments, which is stale. |
| The Cross-region model verdict (F21). | A model producing a verdict breaks Rule 2. |
| Respond, the annual report/DSUR, F21–F23, eCTD v4.0, EU M1 v3.1.1, Canadian REP XML, supplements: until D10. | The hard cut line: only the amendment job ships before a partner files. |
| New sessions on QMS or on Reporting beyond "Find a report". | Both stay in the catalog, but they do not serve the wedge. |
| The 93 out-of-catalog surfaces stay locked, and none is deleted without its replacement named by path. | The working agreement on deletions. |
| Parallel sessions on one slice. | F2 was built twice today. |

---

## 6. Build order for the next 8 weeks

Every item files a red run, then a green run, under `docs/evidence/<row>-<slice>/`.

| Week | Work | Slice / new | Row | Evidence that proves it done |
|---|---|---|---|---|
| 0–1 (you) | Staging: AWS, DNS, SMTP, secrets, `anthropic_api_key` (already required by `terraform/stack` and the deploy preflight). Approve the PQ protocol. File the Life Sciences Verification Program expression of interest. Recruit partners and start their ESG onboarding. Legal review of the pilot agreement. Email ESGNGSupport about AS2 for new companies. | founder | D1, D4, D9, D10 | Staging `/readyz` green; signed protocol; FDA's written answer |
| 1 | Record the decisions after your yes | F24 | D2 | Decision filed; SURFACE_DECISIONS:106-108 corrected |
| 1 | Section status follows the signature; the PATCH request can no longer set approved. Agency-letter answer approval moves onto the signature (F1b). | F1, F1b | D5 | OQ cases: a PATCH to "approved" is refused (red before, green after); a signed approval moves the status |
| 1 | Picker refusals, resolver fix, FDA "variation" removed, Health Canada refuses | F19 (pulled forward), new | D2 | Test: each no-path filing is refused at creation with its reason |
| 1 | History-import spike on one partner's real backbone (anonymised) | new (L1) | D2 | Go/no-go written down; if no-go, new/append-only fallback for partner 1 |
| 1 | F0 gate registers the F3 fix; correct the stale EU AI Act fact (`currency-registry.ts:228-240`; Omnibus: https://digital-strategy.ec.europa.eu/en/news/ai-omnibus-enters-force) | new | D2 | Baseline drops one red hop; governed registry update with its source |
| 2 | Start an unstarted section; Author rows open the document; Review tab shows this filing's reviews | F4, F3, F7 | D2 | Reachability gate: those hops turn green |
| 2–3 | Build the history import; commit the public ICH v3.2.2 and US regional v2.3 DTDs | new (L1) | D2 | Import of a synthetic history with a deliberate gap and a wrong leaf ID is refused (red), a clean history imports (green); schema check runs on the DTDs |
| 3 | Unlock by allow-list with a CI gate. Wire into Submit: amendment planner, replace confirmation, 1571 fill, cover letter, cross-reference register, lifecycle validator, clocks. | new (L2) | D2 | CI fails when `/safety-report/*` is added to the allow-list; new hops added to the F0 baseline |
| 3 | One AnA while editing | F5 | D2 | `check-canvas-path.mjs` green; no second `useAnaChat` in DocumentWorkbench |
| 4 | Verdict per market; Submission Center opens on the sequence; placement states the filing copy's status; readiness buttons do their job | F9, F10/F11, F17, F18 | D2 | Assemble dry run on a staging sequence; a stale filing copy is flagged |
| 4 | Merge `ind-dispatch-gate.ts`; amendment completeness checklist; "pre-validation" wording; signed waiver for the Shadow Review gate | new | D2, D5 | The duplicate gate file is deleted in the same change; the checklist refuses a sequence with no 1571; OQ case for the waiver |
| 5 | Download the frozen sequence with its manifests; Record filing with three states; compile carries the sequence | F12 (beta), F13, F14 | D2, D7 | Downloaded bytes hash-match the frozen manifest; an Ack3 is never shown as "accepted" |
| 5 | Validator decision: license an agency-grade validator such as Lorenz, or write the client-validator SOP | you | D7 | Licence, or a signed SOP |
| 5–6 | Run the PQ on the amendment cover letter and the summary of changes (plus the response and DSUR classes, prepared for later) | new | D4 | PQ report, decline and fallback rates, approved-models entries updated |
| 6 | No dead ends; New submission takes the project's filing; QA pack and per-document AI provenance export | F16, F20, new | D2, D5 | F0 baseline at zero for the amendment path; an exported pack opens and lists every model that served |
| 6–7 | Replay one past amendment per partner on staging; the partner's own validator checks the output | new | D10 | Validator report with zero High errors |
| 7 | Production cutover; governed drafting switched on per document class that passed PQ | D1 | D1, D4 | Production `/readyz`; the drafting refusal lifts only for passed classes |
| 8 | Partner 1 files a real amendment: built, signed, frozen, downloaded, uploaded, recorded | — | D10 | ESG core ID and ack files in the Vault; the named user's signatures in the audit chain |
| After D10 | Respond with the agency-letter workflow; annual report/DSUR with safety-data import; ESG API transmit after a partner's test submission (F12 full); then F21–F23, v4.0, EU M1 v3.1.1, REP XML, human-picked supplements, AS2 | F15, F12, F21–F23 | D2, D7 | Per slice |

---

## 7. Go to market

**Beta design partners**
- 3–5 US emerging biotechs:
  - an active commercial IND already in eCTD;
  - an amendment due within 16 weeks;
  - not on Veeva RIM or Veeva Basics publishing;
  - no need for EU hosting, and no PHI.
- Plus 1–2 boutique consultancies. The multi-client workspaces they need appear only as a proposal in `docs/commercial/PRICING.md`. Check the code before promising them.
- The beta is white-glove:
  - we import their history;
  - we replay a past amendment first;
  - we sit with their regulatory lead through the first real sequence.
- Each partner receives a QA pack: the Part 11 controls map, an audit-chain export, the approved-models entry for every model that served, PQ status, and the per-document AI provenance export.
- **Exit criterion per partner:** one real sequence filed (D10).

**Pricing hypothesis (unverified; test it in discovery)**
- A $15K, 90-day paid pilot covering up to two lifecycle sequences (from PRICING.md).
- Then an annual subscription per active IND, set below the sponsor's current outsourced spend per sequence. PRICING.md proposes $15–20K per sequence, and that anchor is unverified.
- Ask every prospect what one outsourced sequence costs them today.
- Aim to close pilots before Veeva's agents ship in November 2026.

**What to show investors** (on staging, labelled as staging):
- a sample IND history imported;
- what is due, computed by the engines;
- AnA drafting the cover letter on the canvas;
- a cross-document mismatch in N caught;
- a re-verified §11.50 signature;
- the verdict refusing an unapproved leaf and naming why;
- freeze, download and the manifest.

Then:
- **The market logic:** about 1,210 new commercial INDs a year against about 430k CDER submissions.
- **The moat:** Anthropic, Veeva and Weave all draft. We hold the signed, traceable sequence the regulator receives.
- **The pipeline:** the design-partner list.

**Claims we can make (exact wording):**
- "Your next IND amendment, drafted with AnA, reviewed and signed with Part 11 controls, and frozen as an eCTD v3.2.2 sequence."
- "Pre-validated against a subset of FDA's published eCTD criteria. Run your validator before upload."
- "You upload through your own ESG NextGen account. Our gateway transmission is not yet offered."
- "Every figure comes from your source data. AnA drafts text, and a named person accepts or rejects every AI span."
- "Built for Part 11 controls, with a validation package. You validate the system for your intended use."
- "Other markets: we author the documents. Your publisher or the agency portal files them."

**Claims we must not make:**
- That we transmit to FDA, or are "ESG-integrated".
- "Validated" or "will be accepted".
- "Part 11 compliant".
- "FDA-approved" or "FDA-compliant AI".
- That AI drafting is qualified before PQ passes.
- Filing in several jurisdictions, or in the EU, Japan, Canada or the UK.
- Supplements or safety reporting.
- SOC 2 or a penetration test.
- Any time-saved or accuracy figure not measured on a partner.
- That an agency requires an AI disclosure.

---

## 8. Risks, and how we will know we are wrong

Thresholds are my proposals. Set them before week 1 and do not move them afterwards.

| Risk | Signal that we are wrong | Response |
|---|---|---|
| D1 infrastructure slips | Staging not green by the end of week 1, or production not live by the end of week 7 | Everything else pauses. No feature work substitutes for it. |
| History import is not feasible | The week-1 spike cannot parse partner 1's backbone, or the week-3 import misreads any leaf ID | Partner 1 files with new/append operations only, or a pre-IND partner starts sequence 0000 in the product |
| Our package fails at FDA | The partner's validator finds any High or pass/fail error on a replayed or real package | No upload. Fix it, add the rule to our subset, and keep the "pre-validation" wording until a licensed validator runs |
| PQ fails, or the model declines routine content | PQ below the protocol's pass mark, or a decline/fallback rate above 5% on IND cover letters or summaries of changes | Human authoring continues and drafting stays off for that class. Pursue the Life Sciences Verification Program. Whether a platform serving other companies qualifies is unverified, so ask Anthropic. |
| Part 11 regression from F1/F1b | Any older caller breaks, or any path sets "approved" without a signature | OQ cases block the merge. Update D5. |
| The wedge does not sell | Fewer than 3 signed paid pilots by the end of week 4, or prospects say amendments are not where they lose time | Re-run discovery. Test the annual report/DSUR or agency responses as the lead job. |
| The value is not there | Time from change to frozen package is not shorter than the partner's current publisher, or reviewers reject more than half of the AI spans after PQ | Narrow the drafting scope. Lead with record, checks and signature. |
| ESG onboarding blocks D10 | A partner's account, letter or test submission is not complete by week 6 | Switch the D10 filing to the partner who is ready |
| Competition closes the window | Veeva ships regulatory agents to Basics customers, or Weave shows eCTD publishing, before our pilots close | Compete on imported history, signed sequences and price. Disqualify Basics users. |
| Process waste | Two sessions on one slice again, or any session outside this order | One owner per slice on the board. Rule 2 refuses the rest. |
| Facts move | FDA's AI guidance is finalised, the Annex 11/22 drafts are finalised, PMDA's v4.0 switch is confirmed or changed, or FDA answers the AS2 question | Governed registry update with its source, then revisit §4 if a ruling depends on it |

Research limits: several FDA, ESG NextGen and PMDA claims rest on search excerpts of primary pages. Re-check each against the primary page before it appears in sales material.
