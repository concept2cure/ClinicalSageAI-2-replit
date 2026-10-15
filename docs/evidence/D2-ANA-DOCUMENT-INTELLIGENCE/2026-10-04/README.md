# D2 — AnA's regulatory document intelligence (2026-10-04)

Lane: `…session_017d4r3CzS4BdBo5x7EpLdEt`, row **D2** (launch catalog: Authoring,
Vault, Submission Readiness). Claimed in `docs/work-orders/README.md` §0.

Requested: *"she must understand how to put together a full CTD … a CSR, an NDA
… the sequence … how it should be organized inside of our data room … that this
passes through the AI system at the FDA called ELSA. Cleanly."*

The facts every change relies on, with their sources and how they were
checked, are in [`research.md`](research.md).

## What AnA was told before this lane, and what she is told now

| # | Before | Now | Red → green |
|---|---|---|---|
| 1 | Three hand-kept CTD tables were injected into her prompt, and they disagreed. `ana-ri/orchestrator.ts` said 2.7.3 is "pharmacodynamics", 2.7.4 efficacy, 2.7.5 safety, and 1.14 an "environmental assessment". `lumen-context/sections.ts` said 1.1 is the cover letter, 1.2 the table of contents, 1.3.3 the IB, and 5.3.5.1 the protocol. `document-templates.ts` filed the efficacy summary at 2.7.4 and the safety summary at 2.7.5, so "section 2.7.4" fetched the efficacy template. | Both tables read the canonical `CTD_AUTHORING_GUIDANCE` through `server/services/ind/ctd/section-brief.ts`, and their duplicate entries are deleted. `document-templates.ts` files efficacy at 2.7.3 and safety at 2.7.4, each with its ICH M4E sub-headings. | `1-section-truth-red.txt` (20 failed) → `1-section-truth-green.txt` (109/109) |
| 1b | The canonical guidance itself said 2.7.3 "is where the Integrated Summary of Effectiveness (ISE) narrative lives", and said the same of 2.7.4 and the ISS. | 2.7.3 and 2.7.4 are summaries ("data summaries, not a complete exposition"). The ISE and ISS are integrated analyses filed at 5.3.5.3 (E10, E21). | `1b-ise-iss-placement-red.txt` (3 failed) |
| 2 | The IND, NDA and BLA workflows in her prompt encoded the dossier backwards. Every workflow made 2.7 depend on 2.5 and 2.6 on 2.4. The NDA and BLA put Module 2 before Modules 3 and 5, so her first named document after planning was the Quality Overall Summary. The IND misfiled the pre-IND request, Form 1572 and the IB in Module 1. | Modules 3 and 5 come before Module 2. 2.7 comes after the CSRs and the ISS/ISE, 2.6 before 2.4, 2.7 before 2.5, and the USPI after both. The IND's Module 1 matches FDA's list: forms under 1.1, the cover letter at 1.2, the pre-IND request at 1.6.1, the IB at 1.14.4.1. | `2-sequence-truth-red.txt` (14 failed) → `2-sequence-truth-green.txt` (45/45) |
| 2b | The pre-NDA and pre-BLA meetings were labelled Type A. | They are labelled Type B (E20). | `2b-meeting-type-red.txt` (2 failed) |
| 3 | The platform held five partial copies of the CSR outline, with paraphrased headings and nothing on what belongs under each. Section 14 was labelled as in-text tables (E3 §14 is the tables not in the text), and the template AnA was given stopped at section 13. `medical-writing.ts` said to follow E3 "numbering exactly". | One E3 tree covers every heading down to 16.4. Each heading records what it holds, its sources, how it is presented, its pitfalls and its basis. Every CSR outline reads from that tree. E3 is "not a template" (E3 Q&A (R1), E12). | `3-csr-e3-red.txt` (5 failed) → `3-csr-e3-green.txt` (20/20) |
| 4 | No tool told AnA what a section must contain, what comes after database lock, or which FDA technical rules apply. | Three read-only tools, described below. | `4-tools-registration-red.txt` (6 failed) → `4-tools-green.txt` (1095/1095); mutations in `4-tools-mutations.txt` |
| 5 | The persona's drafting step said to apply requirements "from your training". | Drafting and audit call `get_document_section_requirements`. A new persona section routes post-lock questions and technical-acceptance questions to the other two tools, and says Elsa has no published acceptance criteria. | `5-persona-routing-red.txt` (1 failed on the old persona) → `5-persona-routing-green.txt` (68 files, 1667/1667) |

## The three tools

All three are deterministic and read-only. They are registered in every shared
register (`regulatory-knowledge-registration.test.ts` pins each one).

- **`get_document_section_requirements`**
  - Takes any of the 115 CTD sections, any of the 20 lifecycle document types
    (NDA, BLA, ISS, ISE, DSUR …), or any ICH E3 heading.
  - Returns what the item must contain, where its content comes from, how a
    reviewer expects it presented, and where it is filed.
  - If an item is not indexed, the tool says so and tells AnA not to supply
    requirements from memory.
- **`plan_submission_from_database_lock`**
  - Holds 18 steps in `server/services/ind/ctd/submission-chain.ts`, from the
    final SAP to transmission. Each step says what it produces, what it is
    written from, its gate, what the reviewer checks, and its basis.
  - With a project open, it reads that project's Vault, scoped by organization
    and program, and returns the standing of each step: filed, suggested
    (a classifier's proposal, not a filing), not found, or not visible.
  - The datasets and outputs are not visible because the Vault cannot hold
    them. They are never reported missing, and never as done.
  - A failed read is reported as a failure. A read that is cut short says it is
    incomplete and claims nothing is missing.
- **`list_fda_technical_rules`**
  - Holds 16 of FDA's published rules for PDF, eCTD, study data and content,
    in `server/services/ind/ctd/fda-technical-rules.ts`.
  - Each rule gives its source URL, what missing it costs, and whether the
    platform enforces it, checks it in part, or does not check it.
  - Today: 1 enforced (no PDF security), 4 partial, 11 not checked.

The mutations in `4-tools-mutations.txt` were each caught, then reverted to
37/37:

- counting a step the platform cannot see as missing (3 tests failed);
- reporting a failed Vault read as a project with nothing filed (1 failed);
- swapping the organization and program parameters on the Vault read (1 failed).

## Elsa

FDA has said the following:

- Elsa launched on 2025-06-02 (E1).
- Reviewers use it to summarise adverse events, compare labels and summarise
  literature (E2, E3).
- Reviewers "reviewed and verified all ELSA output" (E3).
- Agentic AI was deployed to all FDA staff in December 2025 (E4).

FDA has published **no acceptance criteria for Elsa**. "Passing Elsa" is
therefore not a claim this platform can make, and AnA is told never to make
it.

What can be defended is meeting FDA's own written technical rules. A dossier
that meets them can be opened, searched, navigated and traced by a reviewer and
by any tool the reviewer uses. That means:

- searchable text (E24);
- embedded fonts;
- bookmarks that mirror the table of contents;
- relative links;
- study data with TS, DM, ADSL and define.xml;
- integrated analyses where FDA places them.

`list_fda_technical_rules` gives that answer rule by rule, and says which rules
the platform does not yet check.

## Limits, stated plainly

- **Primary documents could not be opened here.** `fda.gov`, `database.ich.org`
  and `ecfr.gov` are blocked by this environment's network policy, and the
  Lawstronaut connector needs re-authorisation. Facts marked `regulator-text`
  rest on search extracts of regulator-hosted copies (see `research.md`).
  Every E3 heading's content is marked `recall`. The verbatim re-reads are
  listed under "Owed" in `research.md`.
- **The data path from EDC to CSR is not built, and this lane does not build
  it.** The Vault refuses `.xpt` and `.xml`, and every eCTD leaf must be a PDF.
  No XPT reader or writer exists, and there is no EDC connector. AnA can
  therefore plan and track the documents after database lock, but not the
  datasets. An EDC connector would be a new integration, which Rule 2 does not
  allow before the launch rows are green.
- **The drafting prompts do not yet inject the section brief.**
  `server/services/authoring/section-generation-service.ts` is in another
  lane's window until 2026-10-05 17:10 UTC. AnA's chat path is routed to the
  tool; Authoring's generate path is not.

## Handed on (found, not changed here)

1. **Authoring lane, after 2026-10-05 17:10 UTC.** Inject
   `renderSectionBrief(code)` (and `renderE3Brief` for a CSR) into
   `section-generation-service.ts`, in place of free-recall section
   requirements.
2. **Vault / Submission Readiness.**
   - The US market spec allows a 230-character path
     (`market-specs/market-submission-specs.ts`); the FDA eCTD TCG allows 150
     (E13). Reconcile against the guide's text.
   - The PDF version is read (`ectd/pdfa-detect.ts`) and decided by nothing.
   - No package check refuses an image-only leaf.
   - No external eCTD validator or DTD validation is wired.
3. **Authoring templates.**
   - The DOCX `csr-ich-e3` template uses non-E3 numbering. It is unreachable,
     so it was left alone.
   - The `csr:ich` rule pack holds 8 nodes in the database; it needs a
     migration, under Rule 1.
   - `SEMANTIC_MODELS` carries a dead E3 tree.
   - `template-seeds` has M1 numbering to re-check against E14.
4. **AnA tools.**
   - `ind_generate_section` appears to call an authenticated route without
     credentials. It is unverified and recorded for the tool-honesty round.
   - `AnaDocumentDraftingService` uses a coarse blueprint.
   - The IND's 2.5 / 2.7 `requiredFor` is uncertain.
5. **Reasoning lane (`…01TTTQ1h`).** The persona's "requirements from your
   training" drafting line is replaced here. The same phrase in
   `routes/chat/retrieval-evidence-block.ts` ("answer from your training
   knowledge") is that lane's.
