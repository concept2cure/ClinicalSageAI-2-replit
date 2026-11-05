# F1: the CTD filename detector's Module 1 documents take their region's heading (2026-11-05)

This follows S6 V6 (`docs/evidence/SPINE/S6/2026-11-05-v6-filing-region/`, part B). There, the Vault's classifier began
reading the project's region, and gave labeling and the IB their region's Module 1 heading from the regional record.
Its README left one gap: a cover letter, application form, patent or risk-management plan named by the CTD filename
detector got the US heading. In an EU or JP project such a document was proposed no section and marked for review,
although the record holds a heading for most of them.

## What already exists

- **The detector.** `detectCTDSection` (`server/services/ctd-ingestion-service.ts`) proposes a CTD placement from a
  file name. Its four Module 1 rows already read their US heading from the record (`m1Section`, through
  `soleModule1Placement(role, 'US', kind)`), so the role was known and dropped.
- **The classifier.** `classifyForFiling` (`server/services/vault/vault-filing.service.ts`) carries a Module 1 role on
  its proposal. `inProjectRegion` gives an EU or JP project the record's heading for that role, or none with the
  reason.
- **The record.** `shared/regulatory/regional-module1.ts`:

  | Role | EU (MAA) | JP (J-NDA) |
  |---|---|---|
  | Cover letter | 1.0 Cover Letter | none |
  | Application form | 1.2 Application Form | 1.2 Application Form |
  | Patent | none | 1.4 Patent Status |
  | Risk management plan | 1.8.2 Risk Management System | 1.11 Post-Marketing Surveillance Plan / Risk Management Plan |

- **The detector's other caller,** `server/routes/ctd-onboarding.ts`, reads the same result. The added field is
  optional and changes nothing there.

Searches run: `detectCTDSection`, `m1Section` and `soleModule1Placement` over `server` and `shared`.

## What changed

- **The detector** returns the role of each of its four Module 1 rows. An FDA form number (`356h`, `Form 1571`) names
  a US form, which no other region files. That row is split from the generic "application form" and carries no role,
  so an EU project is not proposed its Application Form heading for an FDA form.
- **The classifier** puts that role on the proposal, so `inProjectRegion` reads the region's heading. A document the
  US record gives no heading, an RMP, is remapped too. Its reason then reads "The file name names a Module 1
  document. Module 1 follows the project's region: EU 1.8.2, Risk Management System." It no longer opens with "no
  section; confirm where".
- US proposals are unchanged (tested for each of the five file names).

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | `vault-filing.service.test.ts` with the new cases, against trunk's detector and classifier: the region case fails (an EU cover letter is proposed no Module 1 heading). The US-unchanged and FDA-form cases pass on trunk, as guards should. |
| `02-green.txt` | With the change: 35 of 35 |
| `03-suites.txt` | Every suite that imports the detector or the repo's Module 1 gates (7 files), with every Vault and Data Room suite: 125 files, 1,864 tests |

The case "a US-only rule gives no other region a heading" pinned that a cover letter in an EU project gets no heading.
It now pins the FDA form numbers instead. The cover letter's EU heading is the new case.

## Found, not changed

In a pharma or biotech Vault, a file named "Risk management plan" is claimed first by the device risk-file rule
(`FILING_RULES`, "engineering / DHF / risk file"), which has no pharma folder, so it is left unfiled in every region.
"RMP" reaches the CTD detector. Which rule should claim the full name is a classifier decision for this lane's next
pass.
