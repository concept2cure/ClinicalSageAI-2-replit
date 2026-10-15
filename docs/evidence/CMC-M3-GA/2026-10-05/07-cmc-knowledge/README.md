# AnA answers CMC requirements from a cited record, not from memory

Row **D2** (AnA in the launch catalog). CLAUDE.md Rule 2 says "numbers, verdicts
and governed content come from deterministic engines; the model narrates". The
product owner asked on 2026-10-04 that AnA be "the global expert on all things
CMC with academic expertise across all global regulatory bodies", and on
2026-10-05 that open academic literature and white papers be used rather than
waiting on direct regulator access.

## The gap

AnA could compute CMC figures from the record: shelf life, poolability,
impurity class and the Module 3 compile. It had nothing to say what an authority
*requires*. Asked "what does the FDA require for CMC in a phase 1 IND" or "is
Q2(R2) final", it answered from model memory. That is the same defect the
engines exist to prevent, applied to requirements: an unverifiable version,
date or obligation in a regulatory answer.

## What was built

**The record: `server/services/cmc/knowledge/cmc-regulatory-record.json`.**
It is built as of 2026-10-04 from a 20-agent research run (`build-cmc-record.py`
in this folder).

- **Research.** One researcher per authority group: ICH; FDA; EU; UK and
  Switzerland; Japan and Korea; China; Canada and Australia; and Brazil, India,
  Singapore, WHO and PIC/S. An independent verifier then re-searched every source
  in each group and corrected or deleted what it could not support.
- **Academic deep dives.** Four topics:
  - small-molecule drug substance;
  - drug product and stability;
  - biologics and ATMPs;
  - analytics, lifecycle and regional differences.

  Each cites peer-reviewed literature (PMID, PMCID or DOI) and industry white
  papers.

| | Count |
|---|---|
| Sources (guidelines, regulations, papers) | 329 |
| Requirements, each tied to its sources | 390 |
| Submission pathways (IND, IMPD under the EU CTR, Japan CTN, China IND, Canada CTA, …) | 27 |
| Expert notes with literature citations | 66 |
| Peer-reviewed papers (authority `Literature`) | 27 |
| Sources with a PubMed, PMC or DOI corroboration | 139 |

Source status: final 271, unknown 32, draft 16, superseded 9, withdrawn 1.

**Confidence is carried, not hidden.** Every entry carries `high`, `medium` or
`low` and a sentence saying what could not be established.

- Regulator websites could not be fetched from the build environment, so most
  facts rest on corroborating search results and literature.
- An entry with no established date is `undated` and `low`.
- **The FDA verifier did not run.** Its output was blocked by a content filter
  (`API Error: Output blocked by content filtering policy`). The FDA group ships
  the researcher's corpus, every entry capped at `medium` (59 sources:
  46 medium, 13 low).
- Several authorities are mostly `low` because their primary documents could
  not be re-fetched: MHRA, Swissmedic, MHLW, Health Canada, TGA and NMPA. This
  is the honest state. The tools surface it, and the persona tells AnA to say
  "low confidence" where the record does.

The build repairs and reports what it changes (`record-build-report.txt`):

- authority names normalised;
- CTD codes normalised;
- dangling source ids dropped;
- unverified groups capped.

A paper co-authored by agency staff is filed under `Literature`, never under
that agency. The first build misfiled one such paper as PMDA; the build now
checks literature first.

**The tools: `server/services/ana/cmc-knowledge-tools.ts`.** All three are
deterministic and classed read.

- `find_cmc_guidance`: which documents govern a question, in which version, with
  status, date and successor.
- `get_cmc_requirements`: what an authority requires, by application type,
  phase, CTD section and modality, with the pathway that receives the quality
  dossier.
- `explain_cmc_topic`: the science behind a requirement, with guideline and
  literature citations.

A question the record does not index is answered as not indexed, with the
instruction not to supply it from memory. Every result fits 5,000 characters
serialized.

**Wiring.**

- Tool definitions and handlers use the injected-register pattern.
- Pedigree is `deterministic registry`, and each tool has its own plan label.
- Each tool has an authorization-register entry and is in launch scope.
- The persona's CMC capabilities paragraph names the three tools and says "do
  not supply the requirement from memory".
- The routing eval has five cases.

**One answer to "which revision is current".** The record test cross-checks
every ICH quality, M4 and M7 code in the AnA-RI ICH index
(`server/services/ana-ri/ich-guideline-corpus.ts`) against the record.

- It found two disagreements: the index said `Q3C(R8)` and `M4`, while the
  record has `Q3C(R9)` (Step 4, January 2024) and `M4(R4)`.
- The index now carries the current revisions.
- A family cited without its revision ("ICH M4", "Q3C") still resolves, to the
  revision in force, so existing citations do not fall out of the corpus.

The impurity engine still names `ICH Q3C(R8)` as the basis of its solvent
table. That is the table it implements. Moving it to R9 needs R9's changed
values verified first. The record says what R9 changed could not be
corroborated. Left for the engine-currency slice.

## Red, then green

- **Consistency test.** `cmc-regulatory-record.test.ts` was red against the old
  index:

  ```
  × every ICH quality and M4/M7 code the ana-ri index names is current in the record
    → [ 'Q3C(R8): not in the record', 'M4: not in the record' ]
  ```

  It is green after the index fix.
- **Wiring.** With `...CMC_KNOWLEDGE_TOOLS` and `registerCmcKnowledgeHandlers`
  removed (`red-without-wiring.txt`), 7 tests fail: the five routing cases,
  "are offered to the model" and "have a handler". The rest pass because they
  read the module directly. With the wiring restored, all pass.
- **Green.** The knowledge, registration, routing, launch-scope,
  authorization, pedigree, plan-label, registry-consistency, QOS and ICH-corpus
  suites: 14 files, 993 tests. Persona and learning: 4 files, 93 tests.

## What this does not do

- It does not replace reading the guideline. Every answer names its source and
  date so a person can.
- It is a snapshot as of 2026-10-04. The consolidated ICH Q1 (Step 4 targeted
  November 2026) and Q3C(R10) are recorded as drafts or in development.
  Refreshing the record is a rebuild from a new research run, not an edit.
- FDA entries are unverified until the verifier is re-run in smaller chunks.
