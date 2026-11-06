# S6 V6: the project's filing and region select the Vault's words and Module 1 (2026-11-05)

Package S6 of `docs/design/ONE_DESIGN_PLAN.md`: Vault at Veeva parity, on the existing Vault. This slice changes
behaviour only. It adds no screen, route, table or source file.

The founder's rule: one configurable platform. The project's settings (filing pathway, client type, region) select the
behaviour that already exists. Two places did not read those settings. Part A is the Vault header, which did not read
a device filing pathway. Part B is the filing classifier, which did not read the region. The two parts touch separate
files and can be committed separately.

## A. The Vault header names a device or diagnostic filing (F1)

### The defect

The seeded NeuroPanel-Dx 510(k) Vault read **"IVD / Diagnostics"** in its header. Its project has program_type
`'510k'` and product_type `'ivd'` (`scripts/demo/launch-demo/packs/mdx.mjs:61`).

`vaultSpineLabel` (`shared/constants/domain/vault-taxonomy.ts:318`) compared the raw program_type with the
taxonomy's filing values. A project's program_type is written in the portfolio's vocabulary, and the taxonomy uses
different spellings:

| program_type | taxonomy value |
|---|---|
| `510k` | `k510` |
| `de_novo` | `denovo` |
| `mdr` | `cer` |
| `ivdr` | `ivdr_pe` |

None of them matched, so every 510(k), De Novo, EU MDR and IVDR project's Vault named its view. The same function
words the device case of "Required documents" (`server/services/vault/vault-coverage.ts:108`), so that sentence named
the view as well.

### What already exists

- **`vaultSpineLabel` and `VAULT_FILING_TYPES`** (`shared/constants/domain/vault-taxonomy.ts`). The table already
  carries `k510` as "510(k)" with 21 CFR 807, `pma` with 21 CFR 814, `denovo` as "De Novo" (no regulation),
  `cer` with EU MDR 2017/745 Art. 61, and `ivdr_pe` with EU IVDR 2017/746.
  - The function was fixed on D2 so that an NDA vault no longer read "IND". It still compared spellings.
- **The portfolio's one alias map.** `REGULATORY_PATH_TO_PATHWAY` and `pathwayKey` are in `shared/constants/mdx.ts:43`
  and `:65`. `pathwayForProgram` and `pathwaySqlCase` (`shared/constants/domain/product-types.ts`) already read it.
  - It maps `510k` to `k510` and `mdr` to `cer`.
  - It spells De Novo and IVDR as `de_novo` and `ivdr`, where the taxonomy has `denovo` and `ivdr_pe`.
  - It also maps the segment `ivd` to `ivdr`. The seed records that `'ivd'` as a program type "carries no US premarket
    path", so an `ivd` program must not be named an IVDR filing.
- **The callers.** `server/routes/c2c/project-vault.ts:1978` (the header's `spine`) and
  `server/services/vault/vault-coverage.ts:108`.
- **The test.** `shared/constants/domain/__tests__/vault-spine-label.test.ts` (NDA, IND, BLA, and the view fallback).

Searches run over `shared`, `server` and `client/src`:
- the names: `vaultSpineLabel`, `REGULATORY_PATH_TO_PATHWAY`, `pathwayKey`, `pathwayForProgram`;
- the values: `'denovo'`, `ivdr_pe`, `k510`;
- the seed: `NeuroPanel`.

### What changed

`vaultSpineLabel` reads the program_type through `pathwayKey` and `REGULATORY_PATH_TO_PATHWAY`. It names, inside the
function, the two pathways the taxonomy spells differently (`de_novo` to `denovo`, `ivdr` to `ivdr_pe`). A
program_type that is a segment (`ivd`, `device`) is not aliased, so it still names the view. One import line was added
for the map.

| Project | Before | After |
|---|---|---|
| IVD, `510k` (NeuroPanel-Dx) | IVD / Diagnostics | 510(k) · 21 CFR 807 |
| Device, `de_novo` | Medical Device | De Novo |
| Device, `mdr` | Medical Device | CER · EU MDR 2017/745 Art. 61 |
| IVD, `ivdr` | IVD / Diagnostics | IVDR PE · EU IVDR 2017/746 |
| IVD, `ivd` | IVD / Diagnostics | IVD / Diagnostics |
| IVD, `mdr` (CER is a device filing) | IVD / Diagnostics | IVD / Diagnostics |
| Every value in `VAULT_FILING_TYPES`, in every view that lists it | its label | unchanged (tested by loop) |

## B. Module 1 proposals follow the project's region (S6)

### The defect

The classifier's Module 1 proposals were US headings for every CTD project:
- Labeling was proposed at `1.14` (`server/services/vault/vault-filing.service.ts`, the labeling rule).
- The IB body rule used `soleModule1Placement('investigators_brochure', 'US', 'ind')`, which is `1.14.4.1`.
- FDA forms were proposed at `1.1`.
- The CTD filename detector gave a cover letter `1.2`, an application form `1.1` and a patent `1.3.5`. It resolves
  them against the US tree (`server/services/ctd-ingestion-service.ts`, `m1Section`).

`resolveVaultView` read only `product_type`, so the classifier could not know the region. An EMA project's SmPC and a
PMDA project's package insert were proposed at US 1.14. Neither the EU Module 1 (1.0 to 1.10) nor the JP Module 1
(1.1 to 1.13) has a heading with that number.

### What already exists

- **The regional Module 1 record**, `shared/regulatory/regional-module1.ts` (read only; another lane's).
  - It holds the US, EU and JP trees, each heading with roles and applicability.
  - `soleModule1Placement(role, jurisdiction, kind)` (`:551`) gives one heading, or null when the record holds none.
  - `product_information_draft` resolves to 1.14.1.3 (US), 1.3.1 (EU) and 1.8 (JP). Each was checked in the trees.
  - `investigators_brochure` is held only in the US tree, at 1.14.4.1, for an IND. The EU and JP trees have no IB
    heading.
  - The tree kinds are US `ind`, `nda`, `bla`, `anda`; EU `maa`; JP `jnda`.
  - Its header says what it does not model: CA, UK, CH, AU, CN, KR, BR, IN and SG.
- **Region identity**, `shared/regulatory/region-identity.ts` (read only).
  - `regionForAgency` (`:122`) matches the registry's agency name exactly.
  - The intake wizard stores `HEALTH_CANADA` and `SWISSMEDIC` (`server/routes/c2c/project-intake.ts`,
    `AGENCY_TO_REGION`). The registry spells these `Health_Canada` and `Swissmedic`, so `regionForAgency` misses them.
  - `canonicalRegionOf` (`:163`) resolves them case-insensitively. It is used here, as
    `server/services/submission-service/market-application-number.ts:70` already uses it on the same column.
- **The program's settings.** `regulatory_programs.primary_agency` is NOT NULL (`shared/schema/programs.ts:67`), and
  `program_type` is the application kind.
  - `regulationRequiredModule1` (`server/services/region-profiles/region-profile-service.ts:172`) already pairs
    `canonicalRegionOf` with an application kind for the Module 1 record. This slice follows that pattern.
- **The callers.**
  - `server/services/vault/vault-ingest.service.ts:402` (ingest);
  - `server/services/vault/vault-placement.service.ts:475` (`proposeFilingFromReadText`, the processing sweep);
  - `vault-placement.service.ts:248` resolves the view only, to check a person's chosen folder. It classifies nothing,
    so it is unchanged.

Searches run over `server`, `shared` and `tests`:
- the record: `soleModule1Placement`, `placementFor(`, `ModeledJurisdiction`;
- the region: `regionForAgency`, `canonicalRegionOf`, `primary_agency`;
- the classifier: `classifyForFiling`, `resolveVaultView`, `resolveOrgVaultView`, `FILING_RULES`, `TEXT_RULES`.

### What changed

- **The resolver.** `resolveVaultView`'s query became `resolveVaultFilingContext`'s
  (`server/services/vault/vault-filing.service.ts`). It reads `product_type`, `primary_agency` and `program_type` in
  one statement and returns `{ view, jurisdiction, applicationKind }`. `resolveVaultView` returns its `view`, so every
  other caller is unchanged.
- **The classifier.** `classifyForFiling` takes `jurisdiction` and `applicationKind`.
  - The labeling rule carries the role `product_information_draft`, and the IB body rule carries
    `investigators_brochure`.
  - The region is applied to the name's proposal before the declared-type check, so a conflict message names the
    region's heading too.
  - Only a Module 1 proposal that names a section is affected. A module-only proposal names no US heading and is left
    as it is.

| Project's region | Module 1 proposal |
|---|---|
| US, or no region stated by the caller | Unchanged, byte for byte (`04b-us-byte-for-byte.txt`: 12,600 comparisons with trunk, 0 differences) |
| EU or JP, with a role the record places | The record's heading for that role and application: labeling at EU 1.3.1 and JP 1.8, with the heading named in the rationale |
| EU or JP, the record holds no heading for the role or the application | No section; needs review. Examples: the IB in an MAA or a J-NDA; labeling in an EU CTA, which the EU tree does not model. The rationale says the record holds no heading. |
| EU or JP, from a rule with no role (FDA forms; the filename detector's cover letter, form and patent) | No section; needs review. No US code is proposed in an EU or JP project. |
| CA, AU, any other region, or an agency that names none | Folder `module-1`, no section, medium confidence, needs review: "Module 1 is regional, and the CA Module 1 is not modelled here, so no section is proposed. A person places it." |

Modules 2 to 5 and the device and service views do not depend on the region; ICH harmonises Modules 2 to 5.

A proposal is still a suggestion. Ingest records it as `suggested` (`vault-ingest.service.ts:443`) and a person
confirms or moves it. The confirm path (`placeVaultDocument`) is unchanged.

Two test mocks were extended with `resolveVaultFilingContext`:
- `server/services/vault/__tests__/vault-ingest-storage.test.ts`;
- `server/routes/__tests__/vault-ingest-type-binding.test.ts`.

Their factories list each export by hand, and without it 24 of their 33 tests failed with "No resolveVaultFilingContext
export is defined on the mock".

## Evidence

| File | What it shows |
|---|---|
| `01a-red.txt` | `vault-spine-label.test.ts` before Part A: 3 of 8 fail (510(k), De Novo, MDR/IVDR). The 5 that pass are the behaviours kept: NDA, IND/BLA, the view fallback, segments, and every existing label. |
| `02a-green.txt` | The same suite with Part A: 8 of 8 pass. |
| `03a-related-suites.txt` | With Part A, the suites that reach `vaultSpineLabel` or import the taxonomy: 62 of 62 pass. These are `vault-coverage` 19, `vault-taxonomy-labels` 5, `vault-taxonomy-etmf` 15, `project-vault-cabinet` 15 and `vault-document-filter` 8. |
| `01b-red.txt` | `vault-filing.service.test.ts` and `vault-view-resolution.test.ts` before Part B: 9 of 39 fail. That is 6 regional classifier cases and 3 resolver cases. The 30 that pass include the US, Modules 2 to 5 and module-only controls. |
| `02b-green.txt` | The same two suites with Part B: 39 of 39 pass. |
| `03b-related-suites.txt` | With Part B, the suites that import the classifier or the resolver, and the repo-wide Module 1 gates: 246 of 246 pass in 12 files. That includes `m1-placement.consistency`, `ctd-registry-consistency`, `m1-placement-repo-wide`, `fda-module1-numbering`, `regional-module1-record`, both ingest suites, `chat-upload-*`, `data-room-capture-coverage` and `regulatory-knowledge-tools`. |
| `04b-us-byte-for-byte.txt` | Trunk's classifier (`git show HEAD:…`) beside the changed one, over 5 views, 28 names, 5 body texts and 6 declared types. Each is compared with no region, US + NDA, and US + IND: 12,600 comparisons, 0 differences. The script is included. |
| `05b-regional-samples.txt` | What the changed classifier proposes, with its rationale, for US, EU, JP, CA, AU and an unplaced agency. |
| `06-eslint.txt` | ESLint on the four changed source files, before and after. It shows the same 3 warnings with the same figures; all three were there before. |

## Not done here

- **The data room's classifier call states no region.**
  - `server/services/clinical-regulatory-evidence/data-room-processing.ts:165` calls `classifyForFiling` with the view
    only, so it still gets the US heading. That file is outside this slice.
  - The fix there is to call `resolveVaultFilingContext` and pass its two fields.
- **US labeling stays at 1.14, the Labeling heading.**
  - EU and JP take the record's leaf (1.3.1, 1.8). The US leaf for the same role is 1.14.1.3.
  - Moving the US proposal is a change to US results, which this slice holds unchanged.
- **The US IB stays at 1.14.4.1 for every application kind.** This is as before, although the record applies
  1.14.4.1 to an IND only.
- **The filename detector's cover letter, form and patent get no EU or JP heading.**
  - `detectCTDSection` returns no role.
  - Its application-form row also matches FDA's 356h and 1571, so a role cannot be inferred from the US heading
    without proposing EU 1.2 for an FDA form.
  - The EU cover letter (1.0) is in the record. Returning the role is work in `server/services/ctd-ingestion-service.ts`.
- **Not run:**
  - the database suites (`tests/db/vault-processing-sweep.dbtest.ts`, `tests/db/vault-placement.dbtest.ts`), which
    need a real database;
  - `tsc` (excluded for this session);
  - the running app (no dev server for this session).
