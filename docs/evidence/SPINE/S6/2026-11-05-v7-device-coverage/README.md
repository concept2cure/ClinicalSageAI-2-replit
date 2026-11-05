# S6 V7: a device or diagnostic filing's Required documents says what it requires (2026-11-05)

Package S6 of `docs/design/ONE_DESIGN_PLAN.md`, Vault at Veeva parity. The founder's vision of 2026-11-05: *"The
project's settings determine the work."*

## The defect

The Vault's Required documents view (`VaultCoverage.tsx`) counts the documents confirmed at each required CTD section.
For a device or diagnostic filing it said: *"This vault is not CTD-numbered, so there is no required-section list to
count against."*

A 510(k) does have a required-section list. Its rule pack lists the eSTAR outline (A Administrative … G References),
and the Vault's own Library already shows that outline under the filing document, with each section marked
**Required** or **Optional**. So the Vault told a device sponsor their filing has no requirement, one tab away from
the Library listing it.

`01-red.txt` shows it: the new service case and the new view case fail against trunk.

## What already exists

- **The count.** `readVaultCoverage` (`server/services/vault/vault-coverage.ts`) resolves the required CTD sections
  through the one resolver (`server/services/ectd/required-sections.ts`, the D7 spine's), and counts confirmed
  filings against them. It is gated to the pharma and biotech views.
- **The outline.** The Vault read (`server/routes/c2c/project-vault.ts`) builds the Library tree from each filing
  document's rule pack. `documentFolder` → `sectionsToNodes` → `leafDoc` marks each section `Required` or `Optional`
  from the pack's `mandatory`, and a mandatory section with no content carries the blocker "Mandatory section — no
  content yet".
- **The filing's name.** `vaultSpineLabel` (`shared/constants/domain/vault-taxonomy.ts`) already names the filing in
  the Vault's header ("510(k) · 21 CFR 807").
- **Placement.** The Vault places documents at CTD sections only (`normalizeCtdCode`, `filingVocabularyRefusal`).
  A Vault document cannot be filed at an eSTAR section today, so the Vault has nothing to count against the outline.

Searches run: `not CTD-numbered`, `not_applicable`, `readVaultCoverage`, `VaultCoverage` and `required_sections`
over `server`, `client/src/concept2cure` and `shared`.

## What changed

- **The service** (`vault-coverage.ts`, a new helper `deviceFilingCoverage`): for a device or IVD view it names the
  filing and says where its requirement is read. It still gives no count.
  - When the Library holds the filing's document: *"This project's filing (510(k) · 21 CFR 807) has its own outline,
    not CTD sections. Its required sections are marked Required in the Library. The Vault counts documents filed at
    CTD sections, so it shows no count for this filing."* The response also carries `outlineInLibrary: true`.
  - When it does not, nothing is pointed to: *"… The Library shows that outline, with its required sections marked,
    once the project has the filing's document. …"*
  - The service view keeps its sentence. Pharma and biotech are unchanged.
- **The Vault read** (`project-vault.ts`, F1) tells the service whether a filing document with a rule-pack outline is
  in the Library (`hasFilingOutline`).
- **The view** (`VaultCoverage.tsx`, `Vault.tsx`): with `outlineInLibrary`, the section offers **Show the outline in
  the Library**, which opens the Library tab.

Nothing is added beside the Vault: no route, table or screen. Nothing is removed.

## Not claimed

The Vault does not count a device filing's sections, and the new sentences say so. Counting them needs Vault
documents to be placeable at outline sections. That touches `required-sections.ts` (the D7 owner) and the MDX lane's
filing vocabulary, which is why this slice gives the honest state and not a figure.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new service and view cases against trunk: both fail |
| `02-green.txt` | `vault-coverage.test.ts`, `vaultCoverage.test.tsx` and `vaultWorkArea.test.tsx` with the change: 38 of 38 |
| `running-app-510k-required.png` | The dev server, MDX demo 510(k): the reason names "510(k) · 21 CFR 807" and offers the outline. Clean console, no failed requests. |
| `running-app-510k-outline.png` | After **Show the outline in the Library**: the Library tab, with the eSTAR outline (A Administrative 0/9, B Device description 0/3, …) |
| `running-app-ind-required.png` | The biotech demo IND, unchanged: "Required sections: 3 of 36 have a confirmed document", from the IND rule pack |

The no-document sentence is covered by the service case. No local device project lacks its filing document, so it
was not seen live.
