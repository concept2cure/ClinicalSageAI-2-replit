# The Module 1 contract now holds the whole repository, not a roster (2026-10-13)

**Row:** D2 (AnA document intelligence). **Workstream:** the regulatory record.

## Why a scan, not the inventory that was promised

`ctd-registry-consistency.test.ts` holds the CTD copies someone listed by hand. Its own comment
promised a ratchet — `scripts/ci/check-ctd-registry-inventory.mjs` — that would refuse a copy nobody
declared. That script was never written, and measuring the repository shows why writing it would
have been the wrong build:

**113 files carry five or more distinct CTD section-code literals.** The registry declares 11. A
baseline with 113 entries is a snapshot, not a gate, and the next session adds the 114th.

So this holds **the rule instead of the roster**. Every placement defect found on 2026-10-12 had one
shape — a Module 1 section code written beside a title naming a Module 1 document — and
`violationsFor` already decides that from a `{code, title}` pair. The gate extracts those pairs from
source text across `server`, `shared`, `client/src`, `services` and `scripts`, and runs the same
contract. A new copy in a new file is caught the day it is written, with nothing to declare.

## What the first run found

**141 violations.** Region filtering and two scanner corrections cut that to **32 real defects in 10
files**, every one the same class, every one a wrong eCTD number the platform would hand a sponsor:

| File | Said | FDA says |
|---|---|---|
| `server/services/ctd-ingestion-service.ts` | cover letter **1.1**, FDA 356h **1.2**, patent info **1.3.1**, patent cert **1.3.2** | 1.1 is Forms, 1.2 is the Cover Letter; patent information and certification are **1.3.5.1 / 1.3.5.2**; FDA 1.3.2 is **field copy** certification, a different document |
| `server/services/docx/templateRegistry.ts` | cover letter 1.1; Forms 1571/1572/3674 at 1.2/1.3/1.4; a TOC at 1.5 | all three forms are **1.1**; the cover letter is 1.2; FDA has **no Module 1 TOC heading** |
| `server/routes/deep-research.ts` (×2 outlines) | cover letter 1.1; 1571 at 1.2; 1572 at 1.3 | as above |
| `server/services/regulatory/registry/adapters/ctdBlueprintNormalizer.ts` | cover letter 1.1; labeling **1.3**; TOC 1.5 | labeling is **1.14**; 1.3 is Administrative Information |
| `shared/regulatory/project-bootstrap.ts` | cover letter 1.1; TOC 1.5 | as above |
| `server/services/regulatory/templateCatalog.ts` | cover letter 1.1 | 1.2 |
| `server/services/intelligence/template-seeds.ts` | patent **1.12**; environmental assessment **1.14** | patents are 1.3.5; US 1.12 is Other Correspondence, and the environmental assessment is its child **1.12.14**; 1.14 is Labeling |
| `services/regulatory/pyramids/ind-amendment-pyramid.ts` | cover letter 1.1; 1571 at 1.2; administrative info at **1.0** | 1.0 is the **EU** cover-letter heading — the FDA tree has no 1.0 at all |
| `services/regulatory/pyramids/ind-annual-report-pyramid.ts` | GIP **1.3**; cover letter 1.1; annual report at 1.2 | the general investigational plan is **1.20**; the annual report is **1.13** (21 CFR 312.33) |

The first row is the one worth naming twice. `ctd-ingestion-service.ts` held the **same swapped pair
twice**, in two tables, and yesterday's step fixed only one of them. The gate caught my own
incomplete fix in the file I had just edited. That alone is the argument for holding the rule rather
than the roster.

The two pyramids are now on the record through `m1Binding()`. The eight data tables carry corrected
literals with the record cited beside them: they are distinct data (templates with authoring
instructions, blueprints with content types), not duplicate implementations, and the gate — not a
comment — is what now keeps them honest.

## Three scanner corrections, each forced by a real file

A text scan is a heuristic, and each version of this one was wrong in a way a real file exposed:

1. **Region.** Module 1 is *the* regional module: 1.1 is Forms at FDA, a Comprehensive Table of
   Contents in the EU, a Cover Letter at PMDA. Applying the FDA contract to every pair called
   thirteen correct EU and JP headings in `regional-module1.ts` wrong. The scan now takes the region
   from the nearest preceding marker, defaulting to US. **94 of the 141 findings were this.**
2. **`\b` does not match inside `M1_EU`.** `_` is a word character, so the first region heuristic
   read every one of this repository's regional blocks — `M1_FDA`, `M1_EU`, `M1_EMA` — as unmarked.
   The boundary now treats `_` as a separator.
3. **Pairing must be object-scoped.** A plain nearest-title window paired `code: '1.0'` in
   `filing-placement.ts` with the heading of the row *above* it, and reported a finding about a row
   that does not exist. Preferring the title *after* the code then dropped `templateCatalog.ts`
   entirely, because its rows write `title` before `sectionCode` — **a false negative, which is
   worse than the false positive it fixed.** Pairing now uses the object's own braces. That also
   retired six findings against `regional-module1-requirements.ts`, whose `code` key holds an id and
   whose placements are correct.

Correction 3 is the reason this gate is worth trusting: it was found by checking what *disappeared*
between runs, not only what remained.

## One contract gap it exposed

`{ code: '1.3', title: 'Administrative Information (1.3.1 contact/sponsor; 1.3.4 financial
certification)' }` in `reasoning-engine/rule-data.ts` is **correct** — 1.3 *is* Administrative
Information, and the title lists what sits beneath it with the codes written out. The contract read
that as a claim about the node's own content and demanded 1.3.4.

`violationsFor` now treats a node that **names the child heading in its own title** as a container
for it, alongside the existing rule for a node naming several documents. Without this, the only way
to state a container honestly would be to stop naming its children.

## The baseline, and why it has three guards

One pair survives that the heuristic cannot place: `template-seeds.ts` 1.0 "Cover letter", in the
EMA centralised-procedure block. 1.0 *is* the EU cover letter and the row is right; the nearest
marker before it is the word **FDA** inside the block's own note — *"Centralised procedure uses EU
forms, not FDA 356h"* — and a text scan cannot read that as a negation.

It goes in `NOT_FDA_ECTD` with that reason written out, which is the idiom CLAUDE.md Rule 1 sets for
`migration-drop-safety-baseline.json`: *"an entry without one is the thing that file exists to
prevent."* Three tests keep it from becoming a parking space, and **all three were shown failing**:

| Guard | Broken how | Result |
|---|---|---|
| every entry carries a written reason | reason replaced with `'because'` | `expected 7 to be greater than 40` |
| no entry is stale | the entry's title changed so it matches nothing | 1 failed, naming the entry |
| no entry exempts a pair the contract allows anyway | same mutation | 1 failed, naming the entry |

A pair that **is** an FDA placement and disagrees with the record does not belong there. The ten
files above were fixed, not listed.

## Verified by making the check fail

- **Red first**, three times: the gate was written and run before any production file changed, and
  re-run after each scanner correction. All three outputs are filed.
- **Live mutation on the green tree**: `templateCatalog.ts`'s cover letter put back from 1.2 to 1.1
  — `server/services/regulatory/templateCatalog.ts:43 — 1.1 "Cover Letter" — cover letter files
  under 1.2`. Restored, green again.
- The scanner's own reading is asserted rather than described: that it finds the record and more than
  twenty files, that a bare `'1'` is not a CTD code (a USPI's "1 Indications and Usage" is not a
  heading), and the three real file shapes that drove correction 3 — each as its own test with the
  file named in the test's title.

## What this does not do

- **It is a text scan, not a parser.** A placement computed at runtime, built by string
  concatenation, or stored in a database is invisible to it. It catches the literal, which is what
  every defect so far has been.
- **Regions other than US are unchecked, not held.** The scan skips non-US pairs because there is no
  EU or JP Module 1 contract yet. Thirteen EU and JP headings in the record are correct as far as
  this gate knows and as far as it can say.
- **Modules 2–5 are deliberately not held repo-wide.** This was built, measured and removed — see
  below. The registered copies are still held to the Module 2–5 contract.
- `advise_ctd_structure` still answers from five hardcoded modules, and placements already stored in
  client databases are still uncorrected. **Owed, unchanged.**


---

# Second round, same day: the Module 2–5 extension, built and removed

The note above originally read *"the same scanner would extend to Modules 2–5 … owed"*. It was
built. The reasoning was sound — Modules 2–5 are the **common** technical document, so unlike
Module 1 the check needs no region: 2.7.3 is Summary of Clinical Efficacy in Tokyo, Amsterdam and
Silver Spring alike (ICH M4E(R2)). The measurement was not.

**Twenty-eight findings, and almost none was a CTD defect.** The digits `4.x` and `5.x` belong to
three other numbering systems this platform legitimately holds:

| Source | What its `4.x` / `5.x` / `2.x` means |
|---|---|
| `server/services/labeling/smpc-qrd-catalog.ts` | **EU SmPC sections** — 4.4 Special warnings, 4.5 Interactions, 4.8 Undesirable effects, 4.9 Overdose. The QRD template, not CTD Module 4. |
| `scripts/seed/ga-demo.d/70-vault-memory-symbols.mjs` | **ISO 15223-1 symbols** — 5.1.1 Manufacturer, 5.1.4 Use-by date, 5.4.3 Consult instructions for use. Device labelling, not CTD Module 5. |
| `server/services/csr-builder.ts` | a **CSR outline's own numbering** — 2.8 Efficacy Results, 2.9 Safety Results, 2.10 Conclusions. |

A gate whose baseline would hold twenty-eight rows of other people's numbering is a gate nobody
reads. So it is **not shipped**, and `m1-placement-repo-wide.test.ts` says so in a named test
rather than leaving the absence to be rediscovered — the same discipline the claims engine used
when it deleted a rule the corpus could not make fail.

The Module 1 half is viable for a reason worth writing down: a `1.x` code under a section key is
almost always an eCTD regional placement, and the region heuristic has real markers to work from.
The `4.x` and `5.x` digits have neither property.

## Two things the measurement produced, which are kept

**A real defect.** `violationsFor`'s *Module 1 document filed outside Module 1* rule now runs on the
widened code key, repository-wide, and found
`services/regulatory/pyramids/ind-amendment-pyramid.ts:285 — 5.3.5.4 "Investigator's Brochure"` —
the same Module 5 misfiling `ind-pyramid.ts` carried until 2026-10-12. The sibling pyramid kept it
a day longer. It is now on the record through `m1Binding()`.

**A gap in the record itself.** Six rows reported as *"not an ICH M4 heading"* were **correct**:
ICH M4S(R2) **2.4.1–2.4.6** — the Nonclinical Overview's own subsections (Overview of the
Nonclinical Testing Strategy, Pharmacology, Pharmacokinetics, Toxicology, Integrated Overview and
Conclusions, List of Literature References). `server/services/market-specs/document-template-library.ts`
stated them correctly and `ich-m4-headings.ts` did not hold them at all. The record was the half
that was wrong, and it now carries them with the file's own `M4S(R2)` recall basis.

## One refinement attempted and reverted, because a proven rule caught it

Two annual-report bindings also fired the outside-Module-1 rule:
`2.7.4 "Summary of Clinical Safety — Annual Report"` and
`5.3.5 "Individual Study Information — Annual Report"`. Both are the annual report's Module 2 and
Module 5 **content**, not the report misfiled.

The first attempt stood the rule down whenever the pair agreed with the Module 2–5 record. That
**broke the rule for the case it was built for**: the Vault mutation — the IB put back at 5.3 —
started passing, because 5.3 *is* a modelled heading ("Clinical Study Reports") and
"investigator's brochure" does not *contradict* that title by any term pair. The permanent
revert-mutation from 2026-10-12 is what caught it, within one test run.

So the refinement was reverted and the two titles were fixed instead — they no longer end in
"— Annual Report", because the annual report is one document and it files at 1.13 (21 CFR 312.33).
The rule stays as proven.

## Green, second round

- `tests/regulatory/` — **69 files, 1395 tests** (two more than the first round: the removed
  check's reason, and the record's six new headings).
- `tests/services/regulatory/` + `server/services/ind/__tests__` + `server/services/market-specs` —
  33 files, 533 tests.
- `tsc --noEmit` clean.

The record's new rows had to move: `ich-m4-headings.test.ts` requires CTD order, and inserting
2.4.1–2.4.6 after 2.5.7 failed it. That gate was not written by this change and it worked.
