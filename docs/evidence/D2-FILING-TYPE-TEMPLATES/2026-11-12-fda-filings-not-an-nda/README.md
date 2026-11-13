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
