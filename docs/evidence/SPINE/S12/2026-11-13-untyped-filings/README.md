# A filing the catalog states no type for creates no project, and says so in its own name (sweep items 3 and 4)

**Package:** S1. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. **Ruled by:** the coordinating session, 2026-11-12
23:14 UTC (a correction, not a P-122 removal; filing types maps first; each filing that becomes not offered is named
for the founder). **Built on:** filing types' passes `075cb41e3` and `d93331925`. The list of 2026-11-12 is
`../2026-11-12-unmapped-filings/`.

## What already exists (RULE 3)

| Piece | Path | Did | Did not |
|---|---|---|---|
| The one application-type rule | `shared/constants/domain/filing-application-type.ts` `programTypeFor` | Gives each filing the type its stated pathway, document class or id says | Know a filing with none of these: it took the wizard's `'ctd'`, so an NDA |
| The wizard's default | `client/src/concept2cure/v2/surfaces/Projects.tsx` (`ctx.pathwayKey \|\| 'ctd'`, twice) | Gave every filing with no stated pathway the pathway 'ctd' | — |
| The create endpoint's check | `server/routes/c2c/projects.ts` `sendFilingTypeMismatch` (S12 sweep, 2026-11-09) | Refuses a filing sent as another type, computing the type with the same rule and the same default | Refuse a filing that has no type |
| The picker | `client/src/concept2cure/v2/surfaces/AnaVerbs.tsx` `RegistryPicker` | Asks the server's market verdict about each filing's type and lists it offered or not, with the server's reason | Say anything about a filing except as its type: "no governed NDA outline" for a variation |
| Where the ICH quality rows are written | `server/services/regulatory/market-support.ts` `WRITTEN_IN_THE_APPLICATION_PROJECT` (P-55 row 5, founder 2026-10-26) | The three sentences, as each row's refusal at ICH / Global | Reach the shared rule |
| The catalog | `shared/regulatory/filing-catalog.ts` `PATHWAY_BY_ID`, `filing-document-classes.ts` | States each filing's type (filing types' lane) | — |

## What changed

- `programTypeFor`: a chosen filing with no stated pathway, no document class and no id rule has **no application
  type** (`NO_APPLICATION_TYPE`, empty). With no filing chosen yet, the lane's usual first filing, as before.
  `noProjectReason(filing)` gives the one sentence, in the filing's name: a quality system record; a module of a
  dossier; the three ICH quality rows' founder-decided sentences, word for word (the constant moved unchanged from
  `market-support.ts`, which imports it); another ICH row; or "no project type is stated for <name>".
- `Projects.tsx`: the two `|| 'ctd'` become `?? ''`.
- `AnaVerbs.tsx` (released by the coordinating session for this change only): a typeless filing is asked of nobody
  (lines 196-198) and listed under Not offered with `noProjectReason` (lines 214-217); a comment at 145-147; one import.
- `projects.ts`: a typeless filing is refused `422 FILING_NOT_OFFERED` with the same sentence, whatever type it is
  sent as, before any SQL.

## What it changes, filing by filing (`changed.json`, `list-changed.ts`)

Against trunk `a9e71b4afa`: 85 of 251 catalog filings change. 53 were already not offered and change only
their reason. 32 were offered (with every rule pack treated as present) and are no longer creatable:

### At FDA: 5, all of them "not a filing a project is created from" (the coordinating session's ruling, item 4)

These were the only ones creatable in a real deployment: they were built and sequenced as a full 505(b)(1) NDA.

| Filing | Id | Agency | Reason the picker and the server now give |
|---|---|---|---|
| Design Controls / DHF | `qms_design_controls` | FDA | Not offered: Design Controls / DHF is a quality system record, not a filing, so no project is created from it. |
| Device History Record (DHR) | `qms_dhr` | FDA | Not offered: Device History Record (DHR) is a quality system record, not a filing, so no project is created from it. |
| Device Master Record (DMR) | `qms_dmr` | FDA | Not offered: Device Master Record (DMR) is a quality system record, not a filing, so no project is created from it. |
| QMSR (21 CFR 820) | `qms_qsr_820` | FDA | Not offered: QMSR (21 CFR 820) is a quality system record, not a filing, so no project is created from it. |
| CTD Module 1 — US Regional | `us_ctd_m1_regional` | FDA | Not offered as its own project: CTD Module 1 — US Regional is a module of an application's dossier, so it is written in that application's project. |

### Outside the US: 27, none of them creatable in a real deployment before this change

Filing types read the real verdict on a migrated database
(`docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-11-12-fda-filings-not-an-nda/real-offers-by-agency.txt`): 'nda' has an
outline at the FDA only, so each of these was already refused, in the NDA's name. Now each is refused in its own.
Filing types left them unmapped on purpose: variations, renewals, supplements, meetings, designation requests,
safety and pharmacovigilance documents, and regional Module 1, which have no application and no document class yet.

| Filing | Id | Agency | Reason the picker and the server now give |
|---|---|---|---|
| Accelerated Assessment | `eu_accel_assess` | EMA | Not offered: no project type is stated for Accelerated Assessment, so no project is created from it. |
| CTD Module 1 — EU Regional | `eu_ctd_m1_regional` | EMA | Not offered as its own project: CTD Module 1 — EU Regional is a module of an application's dossier, so it is written in that application's project. |
| EudraVigilance Report | `eu_eudravigilance_icsr` | EMA | Not offered: no project type is stated for EudraVigilance Report, so no project is created from it. |
| NeeS Submission | `eu_nees` | EMA | Not offered: no project type is stated for NeeS Submission, so no project is created from it. |
| Orphan Drug Designation (ODD) | `eu_orphan` | EMA | Not offered: no project type is stated for Orphan Drug Designation (ODD), so no project is created from it. |
| Paediatric Investigation Plan | `eu_pip` | EMA | Not offered: no project type is stated for Paediatric Investigation Plan, so no project is created from it. |
| PRIME Designation | `eu_prime` | EMA | Not offered: no project type is stated for PRIME Designation, so no project is created from it. |
| Pharmacovigilance System Master File (PSMF) | `eu_psmf` | EMA | Not offered: no project type is stated for Pharmacovigilance System Master File (PSMF), so no project is created from it. |
| Renewal Application | `eu_renewal` | EMA | Not offered: no project type is stated for Renewal Application, so no project is created from it. |
| Risk Management Plan | `eu_rmp` | EMA | Not offered: no project type is stated for Risk Management Plan, so no project is created from it. |
| Scientific Advice / Protocol Assistance | `eu_scientific_advice` | EMA | Not offered: no project type is stated for Scientific Advice / Protocol Assistance, so no project is created from it. |
| Type IA Variation (Minor) | `eu_variation_ia` | EMA | Not offered: no project type is stated for Type IA Variation (Minor), so no project is created from it. |
| Type IB Variation | `eu_variation_ib` | EMA | Not offered: no project type is stated for Type IB Variation, so no project is created from it. |
| Type II Variation (Major) | `eu_variation_ii` | EMA | Not offered: no project type is stated for Type II Variation (Major), so no project is created from it. |
| Clinical Trial Application Amendment | `ca_cta_a` | Health Canada | Not offered: no project type is stated for Clinical Trial Application Amendment, so no project is created from it. |
| CTD Module 1 — CA Regional | `ca_ctd_m1_regional` | Health Canada | Not offered as its own project: CTD Module 1 — CA Regional is a module of an application's dossier, so it is written in that application's project. |
| Pre-submission Meeting (Health Canada) | `ca_presub_meeting` | Health Canada | Not offered: no project type is stated for Pre-submission Meeting (Health Canada), so no project is created from it. |
| Supplemental Abbreviated New Drug Submission | `ca_sands` | Health Canada | Not offered: no project type is stated for Supplemental Abbreviated New Drug Submission, so no project is created from it. |
| Supplemental New Drug Submission | `ca_snds` | Health Canada | Not offered: no project type is stated for Supplemental New Drug Submission, so no project is created from it. |
| CTD Module 1 — UK Regional | `uk_ctd_m1_regional` | MHRA | Not offered as its own project: CTD Module 1 — UK Regional is a module of an application's dossier, so it is written in that application's project. |
| Innovation Passport (ILAP) | `uk_ilap` | MHRA | Not offered: no project type is stated for Innovation Passport (ILAP), so no project is created from it. |
| UK Marketing Authorisation Variation | `uk_variation` | MHRA | Not offered: no project type is stated for UK Marketing Authorisation Variation, so no project is created from it. |
| CTD Module 1 — CN Regional | `cn_ctd_m1_regional` | NMPA | Not offered as its own project: CTD Module 1 — CN Regional is a module of an application's dossier, so it is written in that application's project. |
| Registration Renewal (China) | `cn_renewal` | NMPA | Not offered: no project type is stated for Registration Renewal (China), so no project is created from it. |
| Supplementary Application (China) | `cn_supplement` | NMPA | Not offered: no project type is stated for Supplementary Application (China), so no project is created from it. |
| CTD Module 1 — AU Regional | `au_ctd_m1_regional` | TGA | Not offered as its own project: CTD Module 1 — AU Regional is a module of an application's dossier, so it is written in that application's project. |
| Pre-submission Meeting (TGA) | `au_presub_meeting` | TGA | Not offered: no project type is stated for Pre-submission Meeting (TGA), so no project is created from it. |

## Red first, then green

- The 2026-11-12 list was the red: 107 filings an NDA only by the default.
- New cases: `filing-application-type.test.ts` (no type; no filing becomes an NDA or IND by default; the reason never
  names another application), `projects-create-market-offer.test.ts` (a Device Master Record sent as an NDA and as an
  IND, and a Type II Variation by catalog and legacy id, each 422 in its own name, before any SQL; a CMA sent as an
  NDA refused as an MAA), `registryPickerOffers.test.tsx` (the DMR not offered in its own name and asked of nobody; no
  read names an empty type; US Module 1 says where it is written).
- On trunk without this change those cases fail; with it, the affected suites pass 3,239 of 3,239 (`green.log`).
  Typecheck 0. No changed file gained a lint warning.

## In the running app (`walk.log`, `post.log`, screenshots)

- New project: Device Master Record, CTD Module 1 — US Regional and Type II Variation (Major) each list under Not
  offered with the sentence above. SUPAC, the Conditional Marketing Authorisation, Accelerated Approval and the PMR
  are offered. The picker made 2 reads, none naming an empty type.
- POST `/api/c2c/projects`: `qms_dmr` as an NDA, `eu_variation_ii` as an MAA, `us_ctd_m1_regional` as an NDA, each
  `422 FILING_NOT_OFFERED` with its sentence; projects 50 before and 50 after.

## Not done, said plainly

- A filing filing types mapped to an application the agency has no outline for (a Canadian New Drug Submission,
  stated 'ctd') is still refused in the application's name: "Health Canada has no governed NDA outline here". That is
  the server's market verdict for the type, not this rule; naming the filing there too is outside the leave given for
  `AnaVerbs.tsx` and is asked of the coordinating session.
- `us_supac`, `us_priority_review`, `us_ea` and `us_icsr_15day` are stated 'ctd' (today's value) by filing types until
  their classes land or the founder answers; they are still created as an NDA, as before. Not this change's to decide.
