# F1: the Data Room's filing proposal reads the project's region (2026-11-05)

This follows S6 V6 (`docs/evidence/SPINE/S6/2026-11-05-v6-filing-region/`, part B). That change gave the Vault's
ingest the project's region and application, so an EMA project's labeling is proposed at the EU Module 1 heading,
1.3.1. The Data Room proposes a filing for each capture with the same classifier, but it read the project's view alone.
So the same file captured in the same EMA project was proposed at the US heading, 1.14, on the way in, and at 1.3.1
once filed into the Vault.

## What already exists

- **The proposal.** `describeCapture` (`server/services/clinical-regulatory-evidence/data-room-processing.ts`) stamps
  the classifier's proposal on a capture as a suggestion. Filing stays a governed act. Its callers are the chat upload
  route (`server/routes/chat/upload.ts`) and the processing step.
- **The settings.** `resolveVaultFilingContext` (`server/services/vault/vault-filing.service.ts`, S6 V6) reads a
  program's view, region (`canonicalRegionOf` its primary agency) and application kind in one query.
  `resolveVaultView` returns its view.
- **The classifier.** `classifyForFiling` takes the region and application, and gives a Module 1 heading from the
  regional Module 1 record. Where the record has none, or the region's Module 1 is not modelled, it proposes no section
  and marks the capture for review.

Searches run: `classifyForFiling`, `resolveVaultView` and `resolveOrgVaultView` over `server`. Their callers are now
the Vault ingest, the processing sweep (`vault-placement.service.ts`, both from V6), and this one.

## What changed

`describeCapture` reads the program's filing context and gives it to the classifier. A capture with no project has no
region, and is proposed as before, from the organization's view.

The four suites that stub the filing service now stub `resolveVaultFilingContext` too. Their classifier stub is
unchanged.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | `data-room-capture-region.test.ts` against trunk: an EMA project's labeling is proposed at US 1.14, and a Health Canada project's is too. 2 of 4 fail. The FDA and no-project cases pass. |
| `02-green.txt` | With the change: 4 of 4 |
| `03-suites.txt` | Every Data Room suite, the ingest type-binding suite and the classifier's suite: 54 files, 923 tests |

The test uses the real classifier and states only the program's settings.
