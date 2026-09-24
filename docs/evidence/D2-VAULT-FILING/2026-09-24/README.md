# D2 — the Vault's "Place into submission" judged every submission as eCTD, and offered to file files that can never assemble, 2026-09-24

**Launch row:** D2, the launch catalog (Vault) working honestly
(`docs/LAUNCH_DEFINITION_OF_DONE.md`). Both defects are in code this session
built on 2026-09-17/19 (`VaultPlaceIntoSubmission.tsx`, the shared
`judgeSectionCode` in `filingTarget.tsx`). Found by the 2026-09-24
re-verification of the vault assessment and upheld by its skeptic.

## What was wrong

1. **The wrong vocabulary.** Since `d0da50de` the server judges a section code
   against the submission type's own vocabulary
   (`shared/regulatory/placement-vocabulary.ts`): an IRB package files on
   artifact slots, a 510(k) on eSTAR sections. The dialog applied the CTD rule to
   every submission. So it **refused every valid IRB and eSTAR placement** — as a
   malformed-code error, which read as the user's mistake — and it **accepted a
   CTD code for an IRB package**, which the server then refused.
2. **A promise the packager cannot keep.** The dialog offered to file any vault
   document and reported "the vault copy is what will be assembled". The
   packager's vault branch refuses any leaf whose bytes are not a PDF
   (`leaf-source-resolver.ts`), so a Word or Excel file could be placed and
   would never assemble. The upload projection dropped `mime_type`, so the
   surface could not tell.

## The fix

- `judgeSectionCode(section, vocabulary = 'ctd')`: a non-CTD vocabulary is judged
  by the same shared `validateSectionCode` the write boundary calls, and its
  message is shown as written. The CTD branch is unchanged, so the other caller
  (`AuthoringPlaceIntoFiling.tsx`, the IND lane's file, which passes no
  vocabulary) behaves exactly as before — its 62 tests pass unchanged.
- The dialog takes the vocabulary from the chosen submission's
  `applicationType`; the placeholder and the refusal tooltip follow it.
- The upload projection carries `mimeType`; the dialog refuses a non-PDF before
  it loads anything, and says why.

## Proof

| | |
|---|---|
| `red/before-fix.txt` | The three files as at HEAD: 5 of 18 fail — an IRB slot refused, a CTD code accepted for an IRB package, an eSTAR section refused, a Word file offered for filing, and `mimeType` absent from the projection. |
| `green/after-fix.txt` | 25 of 25, including the dialog's existing tests unchanged. |

## Not done here

- The dialog still does not offer the IRB or registry slots as a pick-list; the
  person types the code and sees the verdict.
- `vocabularyForApplicationType` indexes `VOCABULARY_BY_APPLICATION[key]`
  directly, so a key such as `constructor` reaches `Object.prototype` — the
  class this repo has fixed elsewhere with an own-key lookup. That file is not
  this lane's; noted on the work-order board.

---

## 3. The same document had two names

The tree named a document's type through the shared label map I added on
2026-09-19 (`vaultIngestTypeLabel`, "Module 3 · quality"); two places did not.
**Search hits** were mapped separately and rendered the raw stored token
(`MODULE_3`), and the **upload type picker** showed the token with underscores
swapped for spaces (`MODULE 3`, `CSR`). Both now use the one helper; the
picker's option VALUES are still the tokens the ingest schema accepts.

| | |
|---|---|
| `red/type-labels-before-fix.txt` | `Vault.tsx` as at HEAD: 2 of 21 fail. |
| `green/type-labels-after-fix.txt` | 21 of 21. |

---

## 4. An upload was reported to AnA as "0% complete"

`uploadLeaf` set `pct: 0` for uploads — "rather than a fabricated figure", its
comment said — and search hits did the same. But 0 is a figure: the Vault
publishes the selection's `pct` to AnA as `percentComplete`, so AnA was told an
uploaded PDF was a document nobody had started. The re-verification found it; I
first handed it to the AnA lane, and it is not theirs — the number is made in
this lane's projection and surface. `pct` is now `number | null`, and null
("not assessed") is what an upload and a search hit carry.

Tests: `project-vault-cabinet.test.ts` ("projects pct as null, not 0"; the older
assertion that pinned `0` as "no authoring completion" now pins `null`, the same
intent) and `vaultSurface.test.tsx` ("a search hit is not '0% complete'", read
through the published surface context). Both were red on the code as at HEAD
("expected +0 to be null") and are green after.
