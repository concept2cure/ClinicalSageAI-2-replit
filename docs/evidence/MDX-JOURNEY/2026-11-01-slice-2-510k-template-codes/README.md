# MDX journey M5: the seeded 510(k) template files each section under the eSTAR heading that means the same thing

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md` M5. Plan: F1. Step 2 of the fix whose step 1 was
`b18001667e` (2026-10-18, "A seeded regulatory template can now be corrected").

## What already exists (RULE 3)

- **The template.** `fda_510k_se`, "FDA 510(k) — Substantial Equivalence package"
  (`server/services/intelligence/template-seeds.ts`), is seeded at startup into `intelligence.template_sections`.
  It is offered by the "Start from" picker (`GET /api/authoring/templates`), which does not scope templates to the
  project's filing class.
- **The shipped outline.** `fda-estar-510k-v1.1` (`migrations/20261005c_k510_denovo_estar_outline_v1_1.sql`) has 38
  nodes keyed A…G. A device project's governed filing is scaffolded from it.
- **The rule that joins them.** `filingSectionKey` (`shared/regulatory/filing-section-key.ts`) matches an authored
  section to an outline node by code alone, and never compares labels.
- **The record.** The collision was verified at the line on 2026-10-18:
  `docs/evidence/ANA-REASONING/2026-10-05/r16/template-outline-code-collision/`.
- **The re-apply.** `seedTemplatesIfMissing` runs `seedSetDrift` on every boot (`b18001667e`), so a corrected seed
  replaces the stored sections on every existing database. It is not applied to new databases only.
- **The gate that waits on this.** `scripts/ci/filing-exit-agreement-baseline.json` holds the eSTAR build routes
  (`/build`, `/official`, `/assemble`) out of the agreement check until "the vocabulary fix lands first".

## The defect

| Section | Code was | Filed under | Now | Files under |
|---|---|---|---|---|
| Device description and intended use | D1 | Design and manufacturing information | B1 | Device description and principles of operation |
| Predicate device identification | SE1 | **no node** | C1 | Predicate and reference devices |
| Substantial equivalence comparison matrix | SE2 | **no node** | C2 | Substantial equivalence discussion and comparison table |
| Bench testing | B1 | Device description and principles of operation | E5 | Bench performance testing |
| Biocompatibility (ISO 10993) | B2 | **Indications for use statement** | E1 | Biocompatibility |
| Software documentation (if SaMD) | S1 | **no node** | E2 | Software and firmware |
| Labeling (IFU, package insert) | L1 | **no node** | D2 | Proposed labeling and instructions for use |
| Clinical performance (if applicable) | C1 | Predicate and reference devices | E7 | Clinical performance testing |

Biocompatibility data was filed as the Indications for Use statement. The predicate and the substantial-equivalence
comparison, the substance of a 510(k), reached no node at all.

## Proof

| | Result |
|---|---|
| red (`red/before-the-fix.txt`) | 9 of 10 fail: each of the eight sections against the outline it is scaffolded against, plus "no two under one heading". |
| green (`green/the-tests.txt`) | 6 files, 114 of 114 pass: the new test, the drift test `template-seeds-correct-themselves.pglite`, `document-templates` and the intelligence template suites. |
| gate (`green/filing-exit-agreement-gate.txt`) | `ci:filing-exit-agreement` OK, 5 baselined sites exactly as baselined. That entry's reason now records that the vocabulary fix landed. |

The new test reads the outline from the migration that ships it. So it fails the day either side moves without the
other.

## Not done here

- **Documents already started from the old template** keep their old codes in `authoring_sections`, and this
  change does not touch them. Rewriting a client's existing sections retroactively is a change to their record. It is
  for the founder, with a count of such documents from production. Query: the `authoring_documents` rows whose
  template is `fda_510k_se`, joined to their sections.
- **The agreement check on the eSTAR build routes** (P-29.3) is now unblocked. It is the next step, and then that
  baseline entry drops to 0.
- **M6**, the IVD 510(k) (see the study): the built-in "510(k) for IVD" template, the eSTAR variant default, and an
  IVD outline version, which goes to the founder.
