# Reach regional device project initialization

W1 / D2; canonical `concept2cure-v2`; Codespaces/local testing only.
This follows the device authoring increment `352ca5aae` and its 392-template
inventory. Work remains within Projects, Authoring, Vault and Submission Center.

## What already exists

- `shared/regulatory/global-document-registry.ts` and `filing-catalog.ts` already
  identify FDA HDE, Canada MDL/IVD licensing and Japan approval, certification,
  notification and diagnostic records. Several currently resolve to generic
  `device`/`ivd` project pathways, which deliberately fail closed.
- `server/services/market-specs/document-template-library.ts` and
  `shared/regulatory/device-authoring-sections.ts` serve exact regional working
  outlines to the existing editor and AnA. These are limited authoring groups,
  not independently verified current agency forms or complete legal requirements.
- `server/services/c2c/document-class.ts`, `rule-pack-lookup.ts` and
  `scaffold-project-documents.ts` already perform class resolution, exact pack
  lookup and transactional governed-document creation. Generic device/IVD is
  unclassified; no FDA near-neighbour substitution is acceptable.
- `shared/regulatory/filing-document-classes.ts`,
  `server/services/c2c/filing-class-packs.ts` and
  `scripts/db/emit-filing-class-packs.ts` already connect documentary filings to
  immutable, provenance-labelled pack versions. These classes are document-only
  and must not be silently repurposed as regional application identities.
- `server/services/regulatory/market-support.ts` already offers author-only
  projects when their exact outline exists, and refuses unavailable classes,
  packs and transports. `Projects.tsx` already renders the shared filing catalog
  and uses the canonical product vocabulary; no new wizard or editor is needed.
- The migration applier replays its whole set. Existing pack provenance,
  review status and CHECK constraints must be reused and replay-tested; a seed
  script alone cannot admit a document class to an installed database.
- Previous coverage also corrected the legacy EU CDx template title. The
  canonical product descriptor still states blanket Class D, so its UI-facing
  wording remains inconsistent with the current class-neutral filing record.

Searches covered HDE, MDL, IVD licence, Shonin, Ninsho/Nintei, Todokede,
project/bootstrap/class/pack paths, routes, services, shared taxonomy and
migration files. Deleted-history searches over device/MDL/Shonin/HDE/rule-pack,
bootstrap and filing-class paths found legacy device routes/generators retired
in the canonical 510(k) convergence (`c6d7295a8`) and later cleanup; no separate
regional governed project pipeline was found to restore. Existing implementations
will be extended, with no competing editor, bootstrap or submission transport.

## Implementation contract

Extend the existing filing catalog with explicit application-class metadata;
keep `FILING_DOCUMENT_CLASSES` document-only. Each registry entry retains its
identifier and exact existing editor outline. Program type and governed doc
type are identical for these eight classes:

| Registry | Program/doc type | Pack agency | Default product | Permitted product classes |
| --- | --- | --- | --- | --- |
| US_HDE | hde | fda | device | device, samd, ivd, cdx |
| CA_MDL | mdl | hc | device | device, samd |
| CA_IVD_LICENCE | ivd_licence | hc | ivd | ivd, cdx |
| JP_SHONIN | shonin | pmda | device | device, samd |
| JP_NINTEI | ninsho | jp_rcb | device | device, samd |
| JP_TODOKEDE | todokede | pmda | device | device, samd |
| JP_IVD_APPROVAL | ivd_approval | pmda | ivd | ivd, cdx |
| JP_CDX | jp_cdx | pmda | cdx | cdx |

`REGIONAL_DEVICE_APPLICATION_CLASSES` lives in `filing-catalog.ts`. Its rows
have `registryId`, `docType`, `packAgency`, `defaultProductType`, `productTypes`
and optional `refineFromIvdLane` (HDE only). Public lookups are
`regionalDeviceApplicationClassOf(programType)`,
`regionalDeviceApplicationClassForFiling(registryOrCatalogOrLegacyId)` and
`regionalDeviceApplicationClassTypes()`. Display/region metadata continues to
come from the existing registry. `jp_rcb` means the registered certification
body, never a PMDA alias. Unknown regional classification facts stay unknown.

The existing wizard, intake, document binding, market offer and rule-pack
lookup consume that contract. Reject conflicting filing/program/agency/product
families, and refuse an absent exact pack without ICH/FDA substitution. Keep
all eight classes outside the medicinal submission spine. Projects stays within
its existing line-count budget and uses existing controls and styles.

Extend the existing pack projection and migration emitter to mint eight new
immutable, unreviewed, low-confidence preparation packs from those exact
outlines, dated 2026-10-20. Preserve all prior pack bytes and review attribution.
Admit types and `jp_rcb` through replay-safe conditional strict-superset CHECK
widening and the canonical migration manifest. No parallel emitter or bootstrap.
The device offers remain author-only, with no package or transport claim.

The governed SQL readiness trigger already starts optional-outline documents at
0/draft. Correct the existing regulatory readiness evaluator's zero-required
section case to unassessed/0 with `SECTION_REQUIREMENTS_NOT_MODELLED`, mirroring
its existing unmodelled-artifacts handling. Do not invent mandatory flags.
Pack provenance is disclosed; it is not an execution gate requiring pack review.

Independent review also traced `ectd/required-sections.ts` and its existing
compile/status/validate and Vault consumers. Even with exact agency candidates,
an optional device outline reaches that resolver's terminal medicinal CTD
baseline. Extend its existing provenance DTO with `source: 'not_applicable'`
and no CTD modules for these eight non-CTD applications. The three existing
eCTD endpoints must refuse that result with 422 `ECTD_NOT_APPLICABLE` before
interpreting an empty set; Vault maps it to its existing not-applicable state.
This is an explicit refusal in existing surfaces, not an additional compiler or
requirement model. Preserve medicinal fallback behavior. Cover all eight
identities and actual anchored endpoint refusals, with no package/write.
Both program UUID and numeric project identifiers must resolve applicability
through the existing organisation-scoped `projects.regulatory_program_id`
bridge. A numeric identifier must not erase a regional program type and enable
the legacy CTD baseline; a failed linked-program read refuses work. Preserve a
genuinely unbound legacy project's existing behavior and test that distinction.

Review also reached `c2c/add-project-market.ts`: this existing medicinal
Module 1/3.2.R scaffold and submission-spine writer checks the home product
family and documentary filing classes, but newly admitted device applications
can pass its requested-type branch through an author-only market offer. A
deleted-history search found no alternate market/spine guard to restore. Root
extends that existing refusal before pack lookup or writes, for all eight
requested types and exact regional home classes even if the saved product
field is inconsistent. Reuse `AddMarketRefusal` and the existing PGlite suite,
with actual new packs installed, unchanged state and no write calls; preserve
the NDA-to-MAA positive control. No additional market workflow is introduced.
The existing standalone submission route also accepts author-only market
offers. For this increment these eight preparation classes stay outside
canonical submission creation, including direct and transactional callers:
root adds a named 422 refusal in the existing shared `insertSubmissionRow`
writer in `submission-service.ts`. Existing supported 510(k)/PMA and medicinal
submission paths remain available. Test both entry points before insert/audit;
author-only offers do not establish a qualified submission store or transport.

Final UI review traced `ProjectHome.tsx`'s existing primary-agency chip: it
prints the saved enum literally, so newly canonicalized `Health_Canada` and
`Registered_Certification_Body` values show storage underscores. The existing
`filing-catalog.ts` `AGENCY_LABEL` already owns their human labels. Root reuses
that map in the same chip, preserving unknown recorded values, raw identity,
layout and controls. Existing project identity/device/status DOM suites own
this rendering coverage. Label/formatter/deleted-history searches found no
additional agency formatter to restore. The original 116-file integration
freeze remains historical evidence. Canonical catch-up subsequently brought
exact-text capture extraction evidence in two existing ingestion paths; their
three tests join the header and original integration suites in a full final
rerun, followed by compiler and build on the combined tree. Correct the test
fixture tuple parameter typing rather than increasing the compiler baseline.

Root owns shared catalog/product metadata, evidence, integration and direct git.
Root also extends the existing AnA `intelligence-questions/client-segment.ts`
resolver from that metadata: exact regional device/IVD classes must select their
existing interview family rather than falling through to unknown. The existing
pathway-question suite already owns its regression cases; deleted-history
search found no older regional interview resolver to restore.
The initialization worker owns existing wizard/intake/class/offer/startability
paths and tests. The pack worker owns existing projection/emitter/migration,
schema/replay contracts and readiness evaluator/tests. No overlapping writes.
The initialization worker also owns this required-sections consumer correction
and its focused regressions, identified by review before final qualification.

Qualification covers positive creation/binding, negative authority/family/pack
cases, exact source trees, empty readiness, replay with bound old/new documents,
unchanged prior provenance and template snapshots, compiler/build/design gates.
Human cases remain explicitly not run. Current official forms, expert legal
adequacy and agency transport acceptance remain unverified separate work.
