# D2 · F1: an FDA filing states what it is, so none is an NDA by default (2026-11-12)

**Rule:** CLAUDE.md RULE 3 and the working agreement's "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1**. No screen, route, table or tool is added.
**From:** the S12 biotech sweep, item 3 (`docs/evidence/SPINE/S12/2026-11-09-biotech-sweep/defects.json`), with the
split agreed by message with the project-page session (`01FTWcmX…`) on 2026-11-12.

## The defect

A catalog filing with no stated pathway and no document class was given the pathway 'ctd' by the New project wizard
(`ctx.pathwayKey || 'ctd'`), and 'ctd' becomes the program type 'nda'. So these FDA filings were each created as a
505(b)(1) NDA, with a five-module dossier of 59 sections and an NDA submission spine:
- Post-Marketing Requirement (PMR) / PMC;
- SUPAC Supplement;
- 15-Day Alert Report (ICSR);
- Environmental Assessment;
- Priority Review.

Accelerated Approval Application and Rolling Submission reached 'nda' the same way.

## What already exists (RULE 3)

- **The catalog's pathway map:** `PATHWAY_BY_ID` in `shared/regulatory/filing-catalog.ts`. It named none of these.
- **The document classes:** `shared/regulatory/filing-document-classes.ts`. A class is a single-document project and
  never an application. The `protocol` class already exists, with its pack minted from ICH_PROTOCOL.
- **The one rule both sides read:** `programTypeFor` (`shared/constants/domain/filing-application-type.ts`). It asks
  for a filing's document class before any pathway rule, and the create endpoint refuses a filing sent as another
  type.
- **Each filing's own registry entry and outline,** read on `1e74fd32d`:
  - `US_ACCEL_APPROVAL` and `US_ROLLING` record CTD M1–M5 and resolve the full dossier outline;
  - `US_PMR` resolves the blueprint "Post-Marketing Requirement / Commitment Study", which is the protocol's sections.
- **Searches run:** `git grep` for each of the seven ids in both casings across `shared`, `server`, `client` and the
  tests; the registry entry and `getRegistryDocumentTemplate` output for each.

## The change (this lane's half, part 1)

- **`us_accel_approval` and `us_rolling` state their pathway, 'ctd'.** That is what the wizard's default gave them,
  now said by the catalog. Nothing changes for a user today.
- **`US_PMR` joins the `protocol` document class.** A post-marketing requirement is authored as its study's protocol.
  It creates one protocol document and no application. No new pack is seeded.

## Not in this change

- **`us_priority_review`, `us_ea` and `us_icsr_15day`** each get their own document class in the change that seeds
  their packs. Priority Review's outline is also corrected there: it shares a generic designation list whose part 5
  is "Preliminary Clinical Evidence (Breakthrough/RMAT)", which is not its criterion.
- **`us_supac`** is a change category, not a filing. Its level decides whether the change files as a Prior Approval
  Supplement, a CBE supplement or in the annual report, and those three classes exist. Whether it stays creatable is
  put to the founder.
- **A biologic's accelerated approval or rolling review** still resolves to an NDA. The dossier is right; the
  application type should follow the product class. That is in the wizard's half.
- **The wizard's `|| 'ctd'` default** is removed by the project-page session after these mappings are on origin.
- **The roughly 60 non-US filings** whose not-offered reason names an NDA (sweep item 4) are that session's too.

**User-visible:** starting a Post-Marketing Requirement creates a protocol document, not an NDA. Nothing else changes
yet.

## Proof

- **Red:** `red.txt`. On trunk `1e74fd32d`, 3 of 4 fail on assertions; the control (filings already classed keep
  their class) passes.
- **Green:** 4 of 4.
- **In the running app:** `app-walk.txt`.
  - Before: `us_pmr` → 201, `program_type=nda`, a dossier of 59 sections in 5 modules.
  - After: `us_pmr` → 201, `program_type=protocol`, one "clinical trial protocol" document of 75 sections.
  - After, the old request (a PMR sent as an NDA) is refused with 400: "The selected filing is a clinical trial
    protocol; create it as that filing, not as "nda"."
  - `us_accel_approval` and `us_rolling` create the same NDA dossier before and after.
  - These were created through the API the wizard calls. The wizard screen itself was not walked here; the test
    pins that the wizard's own input today (pathway 'ctd') resolves a PMR to 'protocol'.
- **Neighbourhood:** every test that names the catalog, the classes, `programTypeFor` or these ids: 906 of 906 in
  27 files.
- **Gates:** typecheck 0 errors; the ESLint ratchet changes no file's warning count.

---

# Part 2 (2026-11-13): the same pass over the filings outside the US, and four stated at today's value

**Asked by:** the project-page session and the coordinating session on 2026-11-12, after the first part: go through the
filings outside the US that reach 'nda' only through the wizard's default, map each one that can be mapped, and name
the rest.

## What already exists (RULE 3)

- **The list:** `docs/evidence/SPINE/S12/2026-11-12-unmapped-filings/` (the project-page session's): 111 catalog
  filings with no pathway and no document class. It computes each offer "with every rule pack treated as present".
- **What a deployment really offers:** `real-offers-by-agency.txt`, read from the running app's market verdict.
  **'nda' has an outline at the FDA only.** At the EMA, Health Canada, the MHRA, the TGA, the MFDS and the NMPA it is
  not offered. So every one of these filings was already refused, for want of "a governed NDA outline", whatever it
  was. Nothing creatable is lost by stating what each is.
- **The rule that reads the pathway:** `programTypeFor`. It already has a rule for a trial application ('cta'), a
  master file ('dmf'), an MAA, a generic ('anda') and a biosimilar, each ahead of the NDA line.
- **Each filing's own registry entry** (family, stage, CTD modules, recorded authority), read on `226fdd7b5`.

## The change

Fifteen filings state their pathway in `PATHWAY_BY_ID`:

| Filing | States | Why (its registry entry) | With today's packs |
|---|---|---|---|
| `eu_cma`, `eu_line_extension` | 'maa' | a conditional MA is a full MAA; a line extension is assessed as one | **now creatable**, as an MAA with EU Module 1 |
| `ca_mf` | 'dmf' | master-file content maps to 3.2.S, as the US DMF and EU ASMF | **now creatable**, as a Module 3 master file |
| `uk_cta`, `au_cta`, `kr_ind` | 'cta' | a regional trial application | refused, now for want of a CTA outline |
| `ca_nds`, `uk_ma`, `uk_irp`, `au_cat1`, `au_cat2`, `kr_ma_new` | 'ctd' | the CTD M1–M5 marketing dossier under its regional name | refused as before |
| `ca_ands`, `kr_ma_generic` | 'anda' | a generic application, with bioequivalence reports in 5.3.1 | refused, now for want of an ANDA outline |
| `au_biosimilar` | 'biosimilar' | a biosimilar application | refused as before |

Four FDA filings are **stated at today's value**, 'ctd', each awaiting its own answer, so the wizard's default can be
removed with no exception:
- `us_supac`: a change category, not a filing. Whether it stays creatable is with the founder.
- `us_priority_review`, `us_ea`, `us_icsr_15day`: each gets its own document class in the change that seeds its
  pack. Each line is removed with that change.

## Deliberately not mapped

These are no application and have no document class, so they state no pathway. With today's packs none was creatable.
Each needs its own document class and pack before it can be offered:
- **Changes to an authorisation, and renewals:** `eu_variation_ia`, `eu_variation_ib`, `eu_variation_ii`,
  `uk_variation`, `ca_snds`, `ca_sands`, `cn_supplement`, `eu_renewal`, `cn_renewal`, `ca_cta_a`.
- **Requests, designations and meetings:** `eu_pip`, `eu_orphan`, `eu_scientific_advice`, `eu_prime`,
  `eu_accel_assess`, `uk_ilap`, `ca_presub_meeting`, `au_presub_meeting`.
- **Pharmacovigilance documents and messages:** `eu_rmp`, `eu_psmf`, `eu_eudravigilance_icsr`.
- **A module or a format, never a filing a project is created from** (the coordinating session's ruling):
  the six `*_ctd_m1_regional` entries and `eu_nees`. The four `qms_*` entries are the device lane's.

**User-visible:** a Conditional Marketing Authorisation, an EU Line Extension and a Canadian Master File can be
started. A UK or Australian trial application and a Korean IND are refused for the right reason.

## Proof

- **Red:** `red-outside-us.txt`. On trunk `226fdd7b5`, 19 of 24 fail on assertions; the 5 that pass are the first
  part's cases and the two controls.
- **Green:** 24 of 24.
- **In the running app:** `app-walk-outside-us.txt`.
  - Before: all five are refused with "… has no governed NDA outline here".
  - After: `eu_cma` and `eu_line_extension` create an MAA with 61 sections in five modules, EU Module 1.
    `ca_mf` creates a Module 3 master file with 4 sections. `uk_cta` is refused for want of a CTA outline.
    `ca_nds` is refused as before.
  - Created through the API the wizard calls; the wizard screen was not walked.
- **One pin updated:** `registryPickerOffers.test.tsx` counted two offered Health Canada filings, the device
  classes. It now expects three and names the master file. The medicinal applications keep their refusal there.
- **Neighbourhood:** 66 files; 1,442 of 1,443 passed on the first run, the one failure being that pin. It then
  passes 30 of 30.
- **Gates:** typecheck 0 errors; the ESLint ratchet changes no file's warning count.

---

# Part 3 (2026-11-13): three FDA filings that are one document each

## The defect, still open after part 2

These three were each still created as a 505(b)(1) NDA, with a 59-section dossier in five modules:
- Priority Review;
- Environmental Assessment;
- 15-Day Alert Report (ICSR).

Part 2 stated their pathway at that same value only so the wizard's default could be removed with no exception.
The project-page lane removed it in `790501d69`.

## What already exists (RULE 3)

- **Each filing's own outline,** read with `getRegistryDocumentTemplate`:
  - `US_EA`: `us_ea_sections`, eight parts after 21 CFR 25.40.
  - `US_ICSR_15DAY`: `us_icsr_15day_sections`, eight ICH E2B(R3) groups.
  - `US_PRIORITY_REVIEW`: the generic `DESIGNATION_REQUEST_SECTIONS`. That list is shared with PRIME and the device
    breakthrough request. Its part 4 is the Fast Track criterion (unmet medical need) and its part 5 is the
    Breakthrough and RMAT evidence, neither of which is the priority review criterion.
- **The pattern this follows:**
  - `shared/regulatory/filing-document-classes.ts` (a class is one document, never an application);
  - `server/services/c2c/filing-class-packs.ts` (a pack is minted from the class's own outline);
  - `scripts/db/emit-filing-class-packs.ts` (the only way a pack reaches a database, RULE 1);
  - the class-pack contract test.

  The 17 US biotech classes of 2026-10-29 were added the same way.
- **The 506 designations already have their own outlines** (`US_BTD_SECTIONS`, `US_FAST_TRACK_SECTIONS`,
  `US_RMAT_SECTIONS`, corrected 2026-10-18). Priority review was left on the shared list.

## The change

- **Three document classes:** `priority_review`, `environmental_assessment` and `icsr_15day`. Each has one registry
  id and a pack agency of FDA.
- **Three pack specs,** each minted 2026-11-13 with `reasoned_construction` and `low` confidence, and each saying
  what was recalled and not re-read. The environmental assessment's pack says it does not decide whether a
  categorical exclusion (21 CFR 25.31) applies instead. The 15-day report's pack says it neither creates nor
  transmits the E2B(R3) message.
- **One seed migration,** `migrations/20261113_fda_priority_review_ea_icsr_class_packs.sql`, generated by the
  emitter (206 lines). It is entered in `C2C_MIGRATION_FILES` after the 2026-10-29 packs, and widens the doc_type
  CHECK only while it does not admit them. No table.
- **Priority review gets its own outline,** `US_PRIORITY_REVIEW_SECTIONS`, from the criterion the expedited-programs
  guidance states (recalled, not re-read):
  - a serious condition;
  - the available therapy;
  - a significant improvement in safety or effectiveness;
  - where the supporting data sit in the application.

  It carries no development plan, because it is asked for with the application it concerns. Codes keep their
  places, and each changed heading names the old one in `formerTitles`. PRIME and the device breakthrough request
  keep the shared list.
- **The catalog** drops the three temporary 'ctd' lines. Only `us_supac` stays there, awaiting the founder.

**User-visible:** starting a Priority Review, an Environmental Assessment or a 15-Day Alert Report creates that one
document with its own parts, not an NDA.

## Proof

- **Red:** `red-part3.txt`. On trunk `b0300fe5c` (first run on `48b826300`, same result), 4 of 25 fail on assertions:
  the three classes do not exist, and the priority review outline is the generic one.
- **Green:** 25 of 25.
- **Pins this moves, each updated with a dated note:**
  - `tests/regulatory/filing-class-corrections-scope.test.ts`: `US_PRIORITY_REVIEW` leaves the list that keeps the
    shared outline. PRIME, EU accelerated assessment, Sakigake, ILAP and the device breakthrough request stay on it.
  - `tests/schema-contract/c2c-filing-class-packs.contract.test.ts`: the new file joins `PACK_FILES` and the class
    files, so the contract applies it and holds each new pack to the module, node for node.
  - The cross-sector built-in template digest: 1 object changed (`registry:US_PRIORITY_REVIEW`), none added or
    removed. Per-object delta: `part3-builtin-snapshot-delta.txt`.
- **Neighbourhood:** `green-part3-neighbourhood.txt`. 195 files, 193 pass (4,164 tests). The key six re-ran green on
  trunk `d44d5313d` after the fast-forward, with both migration gates.
- **Red on trunk too, not this change:** `vault-taxonomy-etmf.test.ts` ("Etmf.tsx imports tmfArtifactName") and
  `catalog-module-claims.contract.test.ts` (relation `tmf_artifact_filings` does not exist) fail the same way on an
  unmodified archive of `b0300fe5c`. Both follow the eTMF lane's `2dc105c1b` and `790706d7c`.
- **Migration:** `ci:migration-drop-safety` and `ci:migration-set-order` pass (475 files). The deploy migration ran
  twice on the local database (475 applied, exit 0, both runs). The three packs are live, one each.
- **In the running app:** `app-walk-part3.txt`.
  - Before: each creates `program_type=nda` with 59 sections in five modules.
  - After: `priority_review` creates 6 sections, `environmental_assessment` 8 and `icsr_15day` 8, each one document
    with its own parts, read back from the outline route.
  - Sent as an NDA, a priority review request is now refused with 400: "The selected filing is a priority review
    designation request; create it as that filing, not as "nda"."
  - Created through the API the wizard calls; the wizard screen was not walked.
