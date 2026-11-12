# The Vault's Required documents view names each section it lists

2026-11-11. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1 (the change includes a stylesheet rule, which is not an S6 path). Completes
`client/src/concept2cure/v2/surfaces/VaultCoverage.tsx`.

## The defect

The founder, 2026-11-10: "The vault UI seems to be lacking in a lot of ways." And, 2026-11-11: "focus entirely on
getting what we built surfaces correctly on the UI and working for GA."

The Required documents view says what a filing still owes. It said it by number alone:

```
1.12.14   No confirmed document   [Upload] [Choose a document…] [File here]
```

A person had to know that 1.12.14 is the environmental analysis, or go and find it in the Library's tree. The
names were already on the page's own data: the server sends the filing's outline, and the Library shows it as the
binder.

## What already exists

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The coverage figure | `server/services/vault/vault-coverage.ts`, from `server/services/ectd/required-sections.ts` | For each CTD module, the required section numbers with a confirmed document and those without | It carries numbers only; the resolver has no titles |
| The view | `client/src/concept2cure/v2/surfaces/VaultCoverage.tsx` | The counts, where the list came from, and for each missing section Upload and File here | It showed the number and "No confirmed document" |
| The filing's outline | The `tree` of `GET /api/c2c/project-vault/:id` (`server/routes/c2c/project-vault.ts`), drawn by `surfaces/Vault.tsx` as the binder | Every heading of the filing with its number (`code`) and name (`label`) | It was not read by the Required documents view |

Nothing on the server changes. Searches run: `vault-coverage`, `RequiredSectionSet`, `PackSection`, `MODULE_NAMES`,
`VaultFolder`, `flattenDocs`, `coverageDocuments`.

## What changed

- `surfaces/Vault.tsx`: `sectionNamesOf(tree)` reads each heading's name by its number from the tree the server
  sent, and the page passes `sectionName` to the view.
- `surfaces/VaultCoverage.tsx`: a missing section's row is its number, its name, then "No confirmed document".
  Where the outline has no heading for a number, the row is the number and the gap as before. No name is made up.
  A reader who may not file sees the names too.
- The rule pack's agency is written as people write it ("FDA"; the pack records "fda").
- `styles/misc-surfaces-v2.css`: a section's name wraps beside its number and is never cut.

Nothing is removed or moved (P-122).

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The two new cases fail on the unchanged view: no name is on the row |
| `02-green.txt` | `vaultCoverage.test.tsx` 9 of 9 (three new: named from the outline and number alone where it has none; named for a reader who may not file; the agency's case). Every Vault client suite: 69 files, 784 cases |
| `03-running-app.txt` | In the running app on PostgreSQL, the demo's IND project: 33 of 33 missing sections named at 1440px and 390px, none cut, no horizontal scroll, no console error |
| `04-before-1920.png`, `05-after-1440.png`, `06-after-390.png` | The view before and after |

## Not done here

- A section that has a confirmed document is still listed by number in its module's line ("confirmed: 1.14.4.1").
- A filing with its own outline (510(k), De Novo, PMA) has no CTD count; its view points to the Library, as before.
- What AnA is told about the Vault's coverage is unchanged: counts, by module.
