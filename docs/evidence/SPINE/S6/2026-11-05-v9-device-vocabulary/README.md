# S6 V9: a device project's Vault offers its own vocabulary at upload and in the filters (2026-11-05)

Package S6 of `docs/design/ONE_DESIGN_PLAN.md`, Vault at Veeva parity. The founder's vision of 2026-11-05: *"The
project's settings determine the work."*

## The defect

A 510(k) project's Vault offered every evidence kind the platform knows, in two places:
- the upload row's "Evidence kind";
- the Library's "Evidence kind" filter.

So a device sponsor was offered "CMC document", "Batch record", "Nonclinical study document" and "Protocol". It was
also offered a "CTD section (optional)" field with the hint "e.g. 3.2.P.8" in both places. A 510(k) is not
CTD-numbered, and the Vault refuses a section it cannot normalise as a CTD code (`filingVocabularyRefusal`), so the
field invited a value the Vault would refuse.

`01-red.txt` shows it against trunk: the device cases fail in both suites, and the pharma row is offered the device's
"Software artifact".

## What already exists

- **The vocabulary by view.** `docKindsForView` (`shared/constants/domain/vault-taxonomy.ts`) already lists the kinds
  each view files. `VAULT_DOC_KINDS` gives each kind its `views`: CMC, batch records and nonclinical are pharma and
  biotech only, and software artifacts are device and IVD only. Nothing on the client read it.
- **The project's view.** The Vault read returns it as `standard` (`server/routes/c2c/project-vault.ts`), and the
  folders the upload offers are already that view's.
- **The two places.** `VaultUploadStaging.tsx` (the upload row) and `VaultFindFilterRow` in `Vault.tsx` (the Library's
  filters). The filter row's rule, from VR-18, is that a filter that narrows the list is never out of sight
  (`hiddenFindFilters`).

Searches run: `VAULT_DOC_KINDS`, `docKindsForView`, `CTD section` and `ctdSection` over
`client/src/concept2cure/v2`. The third user, `VaultCatalogRecord.tsx` (correcting a document's catalog kind), keeps
the whole list here. A correction may name any kind the vocabulary holds, and the server refuses one outside it.

## What changed

- **The upload row** offers the project's view's kinds. It offers a CTD section only to a CTD-numbered filing
  (pharma, biotech), or when the row already holds one, a manifest's, which is shown so it can be seen and cleared.
  The filing fields moved into `FiledFields`, to keep the row under the complexity limit.
- **The Library's filters** offer the project's view's kinds and, for a filing that is not CTD-numbered, no CTD
  section.
  - A kind or a CTD section that the filters already hold, from a saved view, stays offered (`kindOptionsFor`).
  - Across projects (the library of every project the person can open), the filters still offer every kind and the
    section, since those projects' views differ.
- A pharma or biotech project is offered what it was, except the device-only "Software artifact".

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | `vaultSearchFilters.test.tsx` and `vaultUploadStaging.test.tsx` with the new cases, against trunk: 4 of 30 fail, the new ones |
| `02-green.txt` | With the change: 30 of 30 |
| `03-suites.txt` | Every Vault client suite and `useVaultUpload.test.tsx`: 65 files, 667 tests |
| `running-app-510k-filters.png`, `running-app-510k-upload.png` | The dev server, MDX demo 510(k): the filter row and an upload row offer the device's 12 kinds (Report, Specification, Certificate, Labeling, Software artifact, Supplier document, Agency correspondence, Submission, Clinical document, Quality-system record, CAPA record, Template), and neither offers a CTD section. Clean console, no failed requests. |
| `running-app-ind-upload.png` | The biotech demo IND: 16 kinds, CMC among them, and the CTD section in both places |
