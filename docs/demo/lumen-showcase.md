# The Lumen showcase: run of show

**Who this is for.** The founder, presenting the whole platform from the Codespace in the Lumen account, about 20
minutes. The original screen tour was walked in the running app on 2026-11-10
(`docs/evidence/DEMO/2026-11-10-showcase-walk/`); the three-report example below follows the 2026-11-12 seed record. Every record is synthetic and says so; say so too.

**Current operator update, 2026-11-13:** the three complete synthetic CSRs seeded on 2026-11-12 are the default document demonstration below. The screen walk above is historical evidence, not a claim that today's rehearsal has passed. This recovery cannot verify hosted Codespaces access: its Codespaces API request returns HTTP 403. Local/Bookworm results are recorded separately in `docs/evidence/F1/2026-11-13-codespaces-demo-continuation/README.md`.

The same account by person and scene, with what the reviewer and the approver each see, is in
`docs/evidence/DEMO/2026-11-10-sales-showcase/README.md`. For the clinical study report, this page is the one to
follow.

**The story in one breath.** Lumen Bioscience (demo) is taking LMN-201, for prevention of recurrent *C. difficile*
infection, to its IND. One project holds the goal. The Vault is its data room. The protocol, the statistics and the
monitoring are worked where the study is. The existing seed writes three complete synthetic clinical study reports from their frozen synthetic sources.
The optional live path has AnA draft from the study's own tables, a second person review it, and the approved
sections enter the same editor. The filing says plainly what still blocks it.

## Before the meeting

1. Use the default local Codespace lifecycle on `concept2cure-v2`: pull that branch, then run `bash .devcontainer/post-start.sh`. Open forwarded port **5000**. The script separates local database/app readiness, seeding and AnA/provider outcomes; inspect a named log if a step is blocked. Allow the initial setup and seed time before the meeting.
2. Confirm the Lumen seed finished, then use **Demo access → Lumen Reviewer → Projects → LMN-301 → Author** to rehearse the default headline. LMN-201 and LMN-801 have the same 119-section report structure. No model key is needed to read these already-written synthetic reports or their evidence preview.
3. **For optional live AnA and search**, two keys matter. `ANTHROPIC_API_KEY` serves the approved drafting path; `OPENAI_API_KEY` serves the configured search/embedding and project-memory lane. After changing Codespaces secrets, stop and start the Codespace. A model-list response alone does not prove billable generation, tenant placement or PQ. Do not present missing-key or refused-provider states as ready.
4. For the full platform story, sign in as **Lumen Lead** and open **Projects → LMN-201** first; the work areas follow the open project. Keep a separate window as **Lumen Reviewer** for the seeded reports' evidence check. The approver remains available through the same chooser for the applicable later approval steps.
5. **If presenting live generation**, run one actual CSR build to its end before the meeting and time it. The 2026-11-10 walk reported 69 draftable headings; use the current job's own heading count and limits. It takes minutes, not seconds. Look for an actual answered drafting-call outcome, not merely “key accepted.” During the meeting, a second build may show the writing while review/import uses the already-finished build. Import a document's sections from one selected build only. Without a successful real-provider rehearsal, use the populated synthetic report and say how it was produced.

## The run

| # | Where | Show | Say |
|---|---|---|---|
| 1 | **Home** | The box "How can I help with your filing today?" and the projects under it. With a rehearsed working model route, ask AnA one real question | "It opens like Claude, because it is Claude for life sciences. Everything starts in a project." |
| 2 | **Projects → LMN-201** | The objective, with its source and version. The journey: Plan, Evidence, Author, Review, Submit, Respond. The Filing card: "Dispatch blocked" | "One project, one goal, written down and versioned. The product says what blocks the filing; it does not hide it." |
| 3 | **Plan** (journey) | "What this IND needs": every document of an initial IND, by phase, with its owner and due date | "The plan is the filing's own required content, not a task list someone typed." |
| 4 | **Vault** (rail) | Library by CTD module; **Uploads**; **Required documents** (the count of sections with a confirmed document); **Seals & fixity** | "Every file is hashed on the way in. Filing is a person's decision. A seal says what the data room held when it was signed." |
| 5 | **Study & Protocol Design** (project page, Work areas) | Protocol LMN-201-CDI-02: sections, objectives, schedule of assessments, risks, an amendment | "The protocol is structured, not a PDF: its objectives and endpoints are what the statistics and the report read." |
| 6 | **Biostatistics** (project page, Work areas) | The study design and the Sample Size Rationale, written by the deterministic engine | "Numbers come from an engine with a version. The model narrates; it never computes." |
| 7 | **Risk-based monitoring** (rail) | Overview and "Needs attention now"; **Key risk indicators**; **Patient profiles**; **Risk assessment (RACT)**; **Site risk** (eight sites, site 104 Enhanced, with the indicators behind it) and **Site oversight**; on **Central monitoring**, press **Run central monitoring**: two Critical signals for site 104 | "ICH E6(R3) monitoring on the same study: indicators, limits, signals, and the subjects that stand out, each with the method behind the number." |
| 8 | **Quality** (rail) | SOP register with signed approvals; **CAPA**; **Change control**, signed over the content the approver read | "The work runs under controlled documents. An approval is an electronic signature bound to exactly what was read." |
| 9 | **The CSR** (below) | Three populated synthetic reports and the reviewer's evidence preview; optional live generation after its own rehearsal | |
| 10 | **Communication** (rail) | The FDA information request (fictional): "1 agency communication needs a response" | "A letter becomes questions, owners and commitments, traced to the filing." |
| 11 | **Submission Center** (rail) | Sequence 0000; **Validation**: what the rules find | "The gate is deterministic. It names each rule it applied." |
| 12 | **Reporting & analytics** (rail) | **Run history**: the computed reports | "Every figure is computed from the governed record, and says so when it could not be." |

### Step 9, the default headline: three complete synthetic clinical study reports

The normal Lumen seed supplies these existing reports; no model generates their seeded text:

| Project | Report | Source and state |
|---|---|---|
| LMN-201 | RePreve Part B Clinical Study Report | Frozen synthetic Phase 2 study source; 119 populated ICH E3 sections; sent for scientific review |
| LMN-801 | Phase 1 First-in-Human Multiple Ascending Dose CSR | Frozen synthetic study source; 119 populated sections; sent for scientific review |
| LMN-301 | Phase 2a Viral Challenge CSR | Frozen synthetic study source; 119 populated sections; sent for scientific review |

1. Sign in through **Demo access** as **Lumen Reviewer**. Open the chosen project, then **Author → Open** its report in the one editor.
2. Show the title page's synthetic-data label, the synopsis, efficacy §11.4.1 and adverse events §12.2.2. The figures come from that report's frozen synthetic source. They are not real study results or proof of an AnA generation.
3. Open **Review tasks → Open the Review board**, select this report, then **Record review decision**. Choose **Approve** to reveal **CSR scientific review**, select **Study data frozen for this document**, and press **Read the retained tables**. This only previews the evidence; do not press **Record approval** without completing the review. Compare the saved text snapshot and table cells. Explain that a named human reviewer must map the quantitative claims before approval or Freeze; the seed intentionally leaves that check outstanding.
4. Show the existing approval/freeze state as it is. Do not mark a scientific review complete or manufacture a signature merely to make the demonstration green. Any real review and applicable independent approvals follow the product's own controls.

Say: *“These three reports are complete synthetic examples, written from their frozen synthetic sources. The reviewer can inspect the saved text and its tables in the same editor. Approval and filing remain controlled human acts.”*

The seed and its prior evidence are in `docs/evidence/DEMO/2026-11-12-three-completed-csrs/README.md`. The [November 13 fresh Bookworm rehearsal](../evidence/F1/2026-11-13-codespaces-demo-continuation/README.md) verifies this reviewer path, including efficacy, adverse events and an HTTP 200 evidence preview. It does not establish a hosted GitHub Codespaces launch or live model generation.

### Optional step 9b: live AnA drafting, section review and import

Keep this path available; rehearse it with the actual provider before presenting it. A key, seeded report or stand-in-provider walk does not establish live generation or model qualification.

1. On LMN-201, **Author → Open** "LMN-201 RePreve Part B Clinical Study Report — SYNTHETIC". It opens in the one
   editor, 119 ICH E3 headings.
2. Open **Build from the study's data**. Point at the frozen study data: an approved source, frozen under its hash.
3. Press **Build CSR draft**. Show the actual current heading, progress count and prose as the job writes them.
   The earlier walk showed "Writing §1 Title Page · 1 of 69 headings written"; that is historical, not a fixed count or timing guarantee. Read the line under it aloud: *"This text is being written now. It is saved only after
   every figure in it is checked against the study's tables."*
4. As headings land they appear under **Section review** as "Draft". Press **Read saved section text** on one.
5. Switch to the finished build (the "CSR build" picker). Press **Send for review** on two or three headings.
6. In the second window, as **Lumen Approver**: open the same report, read a heading's saved text, **Approve**.
7. Back as the lead: **Import approved sections into this document**. Read the preview, give a reason, import.
8. Close the build section and click the heading in the outline: the approved text is in the document, with its
   revision. Then **Assemble CSR files**: the report body as a PDF with its bookmarks and checked links, and the
   §14 tables.

Only after observing the real build and applicable reviews, say: *"AnA drafted it from the study's own tables. Every figure was checked against a table cell before it was
saved. A second person approved each heading before it entered the document. The document is then reviewed and
signed as itself."*

## What to say when asked

- **"Can I file what AnA drafted?"** Only after the current gates pass. Model-drafted text is released only
  from a model that has passed performance qualification, after a named person has adopted it. The qualification
  protocol was approved on 2026-11-10; check the current serving environment's qualification status rather than infer it from a key or a past walk. A failed or pending qualification remains a gate. The seeded synthetic reports are not model-PQ evidence.
- **"Where are the patient narratives?"** The three populated synthetic examples include narrative text computed from their own synthetic sources. The existing narrative engine uses subject-level ADaM when those records are available; a summary-only source cannot establish subject-level dates or events. The prepared CDISC pilot study in the development organisation is a separate source and workflow.
- **"Module 3?"** CMC / Module 3 composes small-molecule Module 3 for a US IND. Every Lumen product here is a
  biologic, and the screen says it does not compose one. Show **Study records** in CMC for Lumen. To show Module 3
  being composed, sign in as **Cal CMC** in the development organisation and open C2C-201.
- **"Is this real data?"** No. Every record is synthetic, labelled "[Demo · Lumen]" or "SYNTHETIC", and not
  affiliated with Lumen Bioscience, Inc.

## Scope of the earlier tour, and what to confirm before presenting

- **Evidence** remains an existing project capability. The 2026-11-10 tour preferred the Vault for study documents; verify the current Evidence read before adding it to the spoken tour. This script does not remove, hide or move the screen or its actions (P-122).
- **CMC / Module 3 → Quality by design** and **Module 3 build** in the Lumen account (see above).
- **Search**, without `OPENAI_API_KEY`.

## If something is not where this says

The seeds are idempotent: `bash .devcontainer/post-start.sh` runs them again and reports what it found. A CSR build
that stops shows why, and **Resume build** continues it from the heading where it stopped. A rerun does not perform the human scientific review of the three seeded reports. Preserve the existing editor actions in their current places; this is a run of show, not a UI redesign.
