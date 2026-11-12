# The Vault's Library shows a filing's outline once (P-123 item 8)

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane, which carries the Vault's open items now that S6 has
released them). Plan package F1. Completes `server/routes/c2c/project-vault.ts`. The decision is P-123 item 8, taken
under the same delegation as P-123 and reversible by the founder.

## The defect

The Library listed every filing's outline twice:

- **the filing binder**, holding the files placed against each heading;
- below it, **the authored filing document's own sections**, under the same headings.

The two counted different things. On the demo 510(k), the binder read "A Administrative 0/0" while the document read
"A Administrative 0/9". The same held for eSTAR's A to G headings and for both demo INDs (eCTD Modules 1 to 5)
(`09-tree-roots-before-after.txt`; `01-before-510k-library.png` shows the binder at the top, and the second
outline is further down the tree, which scrolls inside the page). It was noted as an open item at `c2670e8ef2` and confirmed on the INDs at
`c3e5808c45`.

## What already exists

| Piece | Path | What it does |
|---|---|---|
| The filing binder | `server/routes/c2c/project-vault.ts` (`filingCabinet`), `server/services/vault/vault-folders.ts` | The filing's outline as folders, first in the tree, holding placed files (S6, 2026-11-06 to -10) |
| The authored filing document's branch | `project-vault.ts` (`documentFolder`, `sectionsToNodes`, `leafDoc`) | Each section of the authored filing: its requirement (eSTAR's per device, P-107 item 3), state, owner, and the door to the one editor |
| The editor door | `client/src/concept2cure/v2/surfaces/Vault.tsx` (`vaultDocFilingReference`, `vaultEditorReference`) | Reads the filing's identity and type from the folder above a section |
| S6's ordering | `project-vault.ts`: "the Vault opens on the filing's binder, not on an authored document's draft outline" | Kept |

## What changed

- **`server/services/vault/vault-binder-outline.ts`** (new, in the Vault's service folder, `placeAuthoredSectionsInBinder`).
  Each authored section goes into the binder heading with its key, first among the files placed there. A heading is
  found by the outline's key in its id, since its shown code is blank for a module.
  - The section keeps its requirement, state and owner. It also carries its filing document's identity and type,
    because no folder above it names the filing any more.
  - A section the binder has no heading for stays under its document. That document's folder leaves the tree only
    when nothing is left in it.
  - Left as it was: a market's part (F22), two documents of the same filing, another document type, another agency,
    and a project with no binder.
- **`project-vault.ts`** calls it once the cabinet is in the tree. `VaultDoc` declares the two fields.
- **`Vault.tsx`**: the editor door reads a section's own filing identity when it has one, and checks it as it checks
  a folder's. The client `VaultDoc` type declares the fields.
- **Tests:**
  - `server/routes/c2c/__tests__/project-vault-one-outline.test.ts` builds a real binder (`buildFolderIndex`,
    `filingCabinet`). It checks the placement, what stays, and the five cases left alone.
  - `vaultOpenInEditorCarriesDoc.test.tsx` gains two cases: from a binder heading the door opens the editor at the
    filing and the section, and a malformed identity is refused.

## In the running app (PostgreSQL, 1440 by 900)

- **One outline root on each filing:** the 510(k) (48 folders, was 56), IND C2C-101 and IND C2C-201
  (`02-after-510k-library.png`, `03-after-ind-c2c101-library.png`). Before, each filing also had its document's
  outline as a second root.
- **Under "A1 Cover letter"** sits the authored section, with "Mandatory section — no content yet" and "Open in editor"
  (`04-after-510k-A1-section-in-binder.png`). The binder reads "0/37": 6 files and 31 sections.
- **The door behaves as it did.** From the old place, on the code before the change, it opened the editor with "Couldn't
  open 'Cover letter' (section A1) — No accessible working document is bound to the requested filing"
  (`05-before-door-from-old-place.png`). From the binder heading it says the same (`06-after-door-from-binder.png`).
  The editor received the filing and the section both times. It refuses because this demo 510(k) has no working copy
  yet (the editor offers "Create editing copy"), which is the editor's honest answer and was not changed here.
- No console error.

## Evidence

| File | What it shows |
|---|---|
| `07-red.txt` | The new server suite against the code as it stood: it cannot load the merge, which does not exist. The two client cases against `Vault.tsx` as it stood: the door opens the editor with no filing type and no filing identity |
| `08-green-suites.txt` | Every Vault client suite, every project-vault server suite and the Vault service suites: 3,560 of 3,561 pass. The one failure is `vault-document-filter.test.ts`, red on trunk and handed to the data room lane (COORDINATION). This change touches neither file it names |

The typecheck is at 0. The lint ratchet shows no new warning. `ci:unreferenced-modules`, `ci:untracked-imports`
and `ci:sql-interpolation` pass. `ci:duplicate-exported-types` names nothing of this change's (its other 16 new
names are trunk's, in files this change does not touch).
