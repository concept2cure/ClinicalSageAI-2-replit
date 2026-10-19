# D2 · Filing document classes, increment 2: review corrections — 2026-10-18/19

**Row moved:** D2. **Workstream:** W1. **Scope rule kept:** no new surface, module, tool or model.
Every change corrects or reaches a record the platform already holds.

The six-lens review of the first increment (`../README.md`, "Adversarial review") produced 30
findings: 16 were confirmed by a majority of three skeptics each, and a completeness critic added 7
more. This increment fixes all of them. Each fix was first shown failing. The red runs are in
this directory.

## a. Class projects on the Submit tab and in readiness (pushed in `a94a6c0c`)

| Finding | Fix | Red → green |
|---|---|---|
| A PAS, CSR or meeting-package project was offered "Add a market" (refused), "Compile and download" (a CTD backbone) and readiness. | `ProjectHome` reads the class, and `ectdFiling` is false for it. `ProjectMarkets` states the platform's limit instead of those doors, and the status line no longer promises a market. | `submit-tab-red.txt`: 4/5 red → 5/5 |
| Submission Readiness told a class project to "Create its pas submission… and build a sequence". | `noSubmissionWords` and the AnA summary have a class branch. `programTypeLabel` names a class by its label. | same file |
| The add-market refusal called an NDA project's own filing "a document", and stated a platform limit as a regulatory fact. | Two refusals, one per case. The reason is the platform's limit. | `add-market-message-red.txt`: 3/12 red → 12/12 |

The four places that state the limit (the offer, the Submit tab, readiness and the refusal) all
read one wording: `classNotSequencedReason` (`shared/regulatory/filing-document-classes.ts`).

## b. Regulatory corrections, minted as new pack versions

The canonical records were corrected first; the packs were then minted from them:

- `lifecycle-document-types.ts`: `nda_pas`, `cbe_0`, `ind_annual_report`, `ind_safety_report`
  and `nda_bla_annual_report`;
- `project-bootstrap.ts`: the ICF, PADER and IND safety report blueprints, and new US-only
  designation and orphan arrays;
- `document-template-library.ts`: the PBRER.

`migrations/20261018c_filing_class_packs_review_corrections.sql` (generated) seeds twelve
versions: ten supersede exactly the version `20261018` seeded, and two (`fast_track`, `rmat`)
are the first packs of new classes. `20261018` itself is not touched. The file's sha is in
`emitter-refuses-rewrite.txt`, recorded against the committed file.

| Pack | What the correction changes |
|---|---|
| `pas:fda` v1.1 (20 nodes) | Adds an efficacy supplement's clinical and nonclinical data: `PAS-CLINICAL`, plus 2.3–2.7, 4.2 and 5.3 under Updated CTD Sections, all optional (v1.0 held Module 3 only). Adds its PREA part (`PAS-PEDIATRIC`, FD&C Act 505B). The fee part is optional, since PDUFA VI removed supplement fees. 601.12(b) and (f)(1) are cited for a BLA. |
| `cbe:fda` v1.1 | The change description (314.70(c)(3)–(4)) and the environmental claim (21 CFR 25.15(a)) are now parts of the CBE-0 record too, so both are required. |
| `annual_report:fda` v1.1 | The BLA citation is corrected: v1.0 cited 601.12(a), the general provisions. The label names the NDA rule the parts follow, and the BLA's 601.12(d), 601.70, 601.28 and 600.81 reports are cited, not modelled. |
| `pader:fda` v1.1 | The first part is now the non-expedited ICSRs, sent electronically under 314.80(g), not Form 3500A reports embedded in the report. |
| `ind_safety_report:fda` v1.1 | The 312.32(c)(1) analysis of previously submitted similar reports is its own required part. Confidence is now `low`, and the basis says the route facts were checked, not the outline. |
| `ind_annual_report:fda` v1.1 | Adds a required 312.33(b)(5) part: information pertinent to the drug's actions. |
| `orphan:fda` v1.1 | 316.20(b)(7) is required. (b)(5) is added, and so is (b)(6) in its 2013 form (an orphan subset: use outside it would be inappropriate). Both are conditional. |
| `designation:fda` v1.1 (Breakthrough) and `fast_track:fda` / `rmat:fda` v1.0 | One outline per FD&C Act 506 designation. Each requires its own criteria: 506(a)(1) for Breakthrough, 506(b)(1) for Fast Track, 506(g)(1) and (g)(8) for RMAT. `designation` keeps its doc_type for the Breakthrough request. Fast Track and RMAT are now their own classes. |
| `icf:ich` v1.1 | Adds the 50.25(c) ClinicalTrials.gov statement and the 50.25(b) additional elements, each conditional. Both are read from the one consent record (`informed-consent-elements.ts`), never copied. |
| `psur:ema` v2.1 (42 nodes) | Adds the title page, the executive summary and §20. §8–§12 are now required. The E2C(R2) subsections of §5–§7 and §16–§18 are listed. |

### How a pack is changed now

`scripts/db/emit-filing-class-packs.ts` no longer regenerates `20261018`:

- Run with no argument, it lists every `FILING_CLASS_PACKS` version and the migration that seeds
  it. It exits 1 if any version is unseeded.
- Run with a new file name, it writes only the unseeded versions into that file. Each one
  supersedes exactly the version its spec names. The `doc_type` CHECK is widened only when a new
  class needs it.
- It refuses to rewrite an existing file (`emitter-refuses-rewrite.txt`: an edited outline gives
  exit 1, and the file's sha is unchanged).
- The new file's tree assertion is `same IS NOT TRUE`. A CASE that names no tree is therefore
  refused, not passed. This answers the NULL-logic nit declined in the first increment.

## c. AnA and the template picker read the same outlines

| Finding | Fix | Red → green |
|---|---|---|
| AnA drafted no section of the PAS, CBE, IND annual report or meeting outlines from a record (0/7, 0/8, 0/6, 0/6). | `lifecycleOutlineRequirements` answers each section from the record its outline is read from. A CTD section below one the outline holds goes to the CTD record. A miss is named. | `ana-lifecycle-drafting-red.txt`: 11/11 red → green |
| A CBE-0's change description was drafted to the CBE-30 brief alone. | A shared part gives each variant's brief, named by variant. | `ana-drafting-critic-red.txt` |
| The PSUR front matter and subsections, 103 of the CSR's 119 nodes and the IB front matter returned no requirements. | `componentRequirements` walks front matter and subsections. A CSR section is answered from ICH E3. A miss is named. | same file: 17/19 red on the committed code → 19/19 |
| A document saved before an outline changed was described with today's outline as its own. | `open-document` compares the recorded template snapshot with the current one and says so when they differ. | `open-document-earlier-outline-red.txt`: 1/2 red → 2/2 |
| PAS and sBLA templates had identical names. Coverage rows named a retired blueprint. | The registry's own name is used. The coverage row reports the outline source actually served. | — |

## d. The corrections reach only the filings they correct (completeness critic)

The FD&C Act 506 and 316.20 corrections were first written into blueprint arrays that EU PRIME,
EU accelerated assessment, Sakigake, UK ILAP, the Breakthrough Device request, Priority Review and
the EU orphan request also read. The US requests now have their own arrays. The shared arrays are
byte-identical to HEAD (`tests/regulatory/filing-class-corrections-scope.test.ts`;
`correction-scope-red.txt`: 7/10 red with the leaked arrays → 10/10).

The IND safety report outline's basis said "checked against the regulator's text", so the
governed pack carried that claim too. The basis is now `platform-convention`, and it says the
subtypes, formats and routes were checked against FDA's page, not the outline.

## e. Second review, of 55ca92c3 before it was pushed

A second four-lens review (regulatory, AnA drafting, blast radius, migration) ran over the commit
as built. Every finding verified so far was confirmed by both of its skeptics. `20261018c` had not
been pushed, so it was regenerated rather than superseded.

| Finding | Fix | Red → green |
|---|---|---|
| The orphan (b)(6) node stated the "medically plausible subset" standard, which the 2013 final rule replaced. | It now states the 2013 "orphan subset" standard. | — (content) |
| One designation outline could not require each designation's own criterion. A Fast Track request had no required criterion at all. | Three outlines and three classes. | `second-review-red-on-55ca92c3.txt` |
| The PAS efficacy supplement had no PREA part. | `PAS-PEDIATRIC`. | — (content) |
| The ICF nodes copied the 50.25 elements. | They read `INFORMED_CONSENT_ELEMENTS`. | — |
| A lifecycle miss was final. It refused Module 1 codes, legacy blueprint codes and bootstrapped project sections. A CTD node asked with another title was refused. | A miss goes the way it went before. Only a miss on that path too is named. A CTD node or its descendant goes to the CTD record. | `second-review-red-on-55ca92c3.txt` |
| The sBLA brief told the author to cite 314.70(b). | The brief names the record it is read from and tells a BLA supplement to cite 601.12(b) or (f)(1). | same |
| CSR: "12-Week Efficacy Results" was read as §12, and a title E3 holds twice resolved to the first. | An E3 number counts only alone or with its own title. A duplicate title lists both. | same |
| Retitled rows lost their former titles. | `formerTitles` on a blueprint row. | same |
| open-document rebuilt the builtin templates every turn (50–140 ms). | One snapshot per template per process. | — |
| The picker's document dropped front matter and subsections the pack holds. A coverage row named a blueprint that was not served. | The picker carries the whole outline. A blueprint id is reported only when it is served. | `picker-and-coverage-red-on-55ca92c3.txt` (5/5 red → 5/5) |
| Superseded v1.0 rows kept the claims the corrections withdraw, and 20261018 re-asserts them on every deploy. | 20261018c, which runs after it, notes "Superseded by … : why" on each row. It corrects the IND safety report's and the annual report's false governing rule and confidence. A replay ends where the last deploy did. | `second-review-contract-red-on-55ca92c3.txt` |
| 20261018c's own tree assertion was never exercised. | A tampered v1.1 row with the right node count stops the file. Removing the check makes the test red. | `corrections-tree-check-red-when-removed.txt` |
| The mint date was hard-coded. | A spec's `minted` date. The emitter refuses a spec whose date is not the file's, and a supersede with no change note. | — |

## Tests the corrections move on purpose

- `document-template-library.test.ts`: the IND safety report gains code 7.
- `regional-template-source-selection.test.ts` and `template-library-truth.test.ts`: the PBRER
  is now §1–§20 plus front matter.
- `requirements-resolver.test.ts`: the R2 snapshot moves for exactly ten inputs: the five
  corrected records, each in two casings (`requirements-snapshot-delta.json`). The other 674
  fingerprints are unchanged.
- `c2c-filing-class-packs.contract.test.ts` (12/12):
  - The deployed-database case: v1.0 is live with a document bound to it. Two deploys later the
    corrections are live, and the document keeps its outline.
  - `packs-red-without-20261018c.txt`: without the file, the node-for-node, supersede and
    scaffold tests fail.

## Limits, stated

- No pack is reviewed by a regulatory professional. The regulator's text was not re-read: its
  hosts are unreachable from the build environment. The corrections are recalled at the certainty
  the review stated. The 50.25(c) statement is quoted from recall and says so.
- A document already bound to a v1.0 pack keeps its outline. Re-assembling an old authoring
  document against a changed builtin template still appends the new sections beside the old ones.
  AnA now says the outline changed, but assembly does not flag it.
- The project bootstrap's own `PSUR_SECTIONS` (10 rows) is a second, older PSUR outline beside
  the PBRER template. It is not changed here.
- Pre-existing, unrelated, red on clean trunk (`a65b139f`) as well:
  - `cmcRegisterForms.test.ts`;
  - `conversationThreadCanvas.test.tsx`;
  - `governed-reason-not-invented.test.ts` (`generate_schedule_of_events`).
