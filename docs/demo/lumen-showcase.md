# The Lumen showcase: run of show

**Who this is for.** The founder, presenting the whole platform from the Codespace in the Lumen account, about 20
minutes. Every screen named here was opened in the running app on 2026-11-10 as the Codespace builds it
(`docs/evidence/DEMO/2026-11-10-showcase-walk/`). Every record is synthetic and says so; say so too.

The same account by person and scene, with what the reviewer and the approver each see, is in
`docs/evidence/DEMO/2026-11-10-sales-showcase/README.md`. For the clinical study report, this page is the one to
follow.

**The story in one breath.** Lumen Bioscience (demo) is taking LMN-201, for prevention of recurrent *C. difficile*
infection, to its IND. One project holds the goal. The Vault is its data room. The protocol, the statistics and the
monitoring are worked where the study is. AnA drafts the Phase 2 clinical study report from the study's own tables,
a second person reviews it, and it lands in the one editor. The filing says plainly what still blocks it.

## Before the meeting

1. Start the Codespace and read three lines of `bash .devcontainer/post-start.sh`:
   - "Lumen account seeded: lumen pack: created …, found …". If it says the seed did not finish, stop and read
     `~/.concept2cure-codespace/lumen-seed.log`.
   - "A drafting call with this key (one small billable request): answered by …". Without this line AnA cannot
     draft, and the headline has nothing to show.
   - "Concept2Cure is running".
2. Two keys matter. `ANTHROPIC_API_KEY` is AnA and the drafting. `OPENAI_API_KEY` is search and AnA's project
   memory: without it, Vault search fails and each AnA answer's Progress panel says "Memory: Could not be read".
3. Sign in with **Demo access**. "Sign in as" opens on **Lumen Lead**. The reviewer and approver are in the same
   list; open a second browser window as **Lumen Approver** for step 9.
4. **Run one CSR build to its end before the meeting** (step 9, "Build CSR draft"), and time it. It asks the model
   for 69 headings and the gateway allows one person 30 requests a minute, so it takes minutes, not seconds. In the
   meeting, start a second build to show the writing, and do the review and import on the finished one. A document
   takes its imported sections from one build, so import from the first build only.
5. Open **Projects → LMN-201** first. The rail's work areas follow the project that is open.

## The run

| # | Where | Show | Say |
|---|---|---|---|
| 1 | **Home** | The box "How can I help with your filing today?" and the projects under it. Ask AnA one real question | "It opens like Claude, because it is Claude for life sciences. Everything starts in a project." |
| 2 | **Projects → LMN-201** | The objective, with its source and version. The journey: Plan, Evidence, Author, Review, Submit, Respond. The Filing card: "Dispatch blocked" | "One project, one goal, written down and versioned. The product says what blocks the filing; it does not hide it." |
| 3 | **Plan** (journey) | "What this IND needs": every document of an initial IND, by phase, with its owner and due date | "The plan is the filing's own required content, not a task list someone typed." |
| 4 | **Vault** (rail) | Library by CTD module; **Uploads**; **Required documents** (the count of sections with a confirmed document); **Seals & fixity** | "Every file is hashed on the way in. Filing is a person's decision. A seal says what the data room held when it was signed." |
| 5 | **Study & Protocol Design** (project page, Work areas) | Protocol LMN-201-CDI-02: sections, objectives, schedule of assessments, risks, an amendment | "The protocol is structured, not a PDF: its objectives and endpoints are what the statistics and the report read." |
| 6 | **Biostatistics** (rail) | The study design and the Sample Size Rationale, written by the deterministic engine | "Numbers come from an engine with a version. The model narrates; it never computes." |
| 7 | **Risk-based monitoring** (rail) | Overview and "Needs attention now"; **Key risk indicators**; **Patient profiles**; **Risk assessment (RACT)** | "ICH E6(R3) monitoring on the same study: indicators, limits, signals, and the subjects that stand out, each with the method behind the number." |
| 8 | **Quality** (rail) | SOP register with signed approvals; **CAPA**; **Change control**, signed over the content the approver read | "The work runs under controlled documents. An approval is an electronic signature bound to exactly what was read." |
| 9 | **The CSR** (below) | The headline | |
| 10 | **Communication** (rail) | The FDA information request (fictional): "1 agency communication needs a response" | "A letter becomes questions, owners and commitments, traced to the filing." |
| 11 | **Submission Center** (rail) | Sequence 0000; **Validation**: what the rules find | "The gate is deterministic. It names each rule it applied." |
| 12 | **Reporting & analytics** (rail) | **Run history**: the computed reports | "Every figure is computed from the governed record, and says so when it could not be." |

### Step 9, the headline: the Phase 2 clinical study report

1. On LMN-201, **Author → Open** "LMN-201 RePreve Part B Clinical Study Report — SYNTHETIC". It opens in the one
   editor, 119 ICH E3 headings.
2. Open **Build from the study's data**. Point at the frozen study data: an approved source, frozen under its hash.
3. Press **Build CSR draft**. Within seconds: "Writing §1 Title Page · 1 of 69 headings written", the bar, and the
   prose as it is written. Read the line under it aloud: *"This text is being written now. It is saved only after
   every figure in it is checked against the study's tables."*
4. As headings land they appear under **Section review** as "Draft". Press **Read saved section text** on one.
5. Switch to the finished build (the "CSR build" picker). Press **Send for review** on two or three headings.
6. In the second window, as **Lumen Approver**: open the same report, read a heading's saved text, **Approve**.
7. Back as the lead: **Import approved sections into this document**. Read the preview, give a reason, import.
8. Close the build section and click the heading in the outline: the approved text is in the document, with its
   revision. Then **Assemble CSR files**: the report body as a PDF with its bookmarks and checked links, and the
   §14 tables.

Say: *"AnA drafted it from the study's own tables. Every figure was checked against a table cell before it was
saved. A second person approved each heading before it entered the document. The document is then reviewed and
signed as itself."*

## What to say when asked

- **"Can I file what AnA drafted?"** Not yet, and the product enforces it. Model-drafted text is released only
  from a model that has passed performance qualification, after a named person has adopted it. The qualification
  protocol was approved on 2026-11-10; no model has been run against it yet. Until one passes, the report can be
  drafted, reviewed and assembled, and a person rewrites what is filed.
- **"Where are the patient narratives?"** They are composed by the engine from subject-level ADaM data. This demo
  study is a summary source, and the panel says so. The CDISC pilot study in the development organisation has them.
- **"Module 3?"** CMC / Module 3 composes small-molecule Module 3 for a US IND. Every Lumen product here is a
  biologic, and the screen says it does not compose one. Show **Study records** in CMC for Lumen. To show Module 3
  being composed, sign in as **Cal CMC** in the development organisation and open C2C-201.
- **"Is this real data?"** No. Every record is synthetic, labelled "[Demo · Lumen]" or "SYNTHETIC", and not
  affiliated with Lumen Bioscience, Inc.

## Leave out, as of 2026-11-10

- **Evidence** on the project's journey, unless asked. Its data room holds what AnA reads beside the Vault: two
  agency letters, then the project's Quality records. The study's documents are in the Vault, so show the Vault.
- **CMC / Module 3 → Quality by design** and **Module 3 build** in the Lumen account (see above).
- **Search**, without `OPENAI_API_KEY`.

## If something is not where this says

The seeds are idempotent: `bash .devcontainer/post-start.sh` runs them again and reports what it found. A CSR build
that stops shows why, and **Resume build** continues it from the heading where it stopped.
