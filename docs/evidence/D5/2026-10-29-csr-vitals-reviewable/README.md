# D5: a CSR's vital-sign and concomitant-medication figures can be reviewed against their cells (2026-10-29)

Session `…01E8btkB`, D5 CSR-path lane. A hand-on from the CSR end-to-end lane
(`docs/work-orders/README.md`, its row: "`CSR_TABLE_KEYS` lacks `vitalSigns` and
`concomitantMedications` (fails closed)"). `shared/authoring/csr-scientific-review.ts`
is this lane's file (that lane's evidence READMEs, "Boundary").

## What already exists

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The engine's table keys | `server/services/csr/cortex-authoring-context.ts` `CSR_TABLE_KEYS` | Thirteen keys. CSR slice 6 (`735ac21cd`) added `vitalSigns` (§12.5, ADVS/ADEG) and `concomitantMedications` (§11.2, ADCM), built only when the source supplies them | A second copy of the list |
| The scientific review's keys | `shared/authoring/csr-scientific-review.ts` `CSR_TABLE_KEYS` | Read by the verifier (`csr-scientific-review-core.ts`) and the review screen (`csrEvidenceMap.ts`) | Eleven keys, without the two |
| What that did | the same | The screen offered no vital-sign or con-med cell. The verifier refused a claim naming either table (`CSR_EVIDENCE_CLAIM_INVALID`). The tables hash (`scientificTablesSha256`) walked the eleven keys, so a run's vital-sign table was not in it | A CSR reporting vital signs could not be reviewed figure by figure, and a change to those figures did not invalidate a review receipt |
| The CSR card's required tables | `CsrSourceInputControls.tsx` `TABLE_KEYS` | The eight tables every approved source must carry (`isTables`) | Not a copy: a different list with a different job. Unchanged |
| The assembly plan | `csr-assembly-plan.ts` | Reads the engine's list | Unchanged: it reads the same thirteen keys, now re-exported |

## What changed

- **One list.** `shared/authoring/csr-scientific-review.ts` holds all thirteen
  keys, in the engine's order. `cortex-authoring-context.ts` imports and
  re-exports it, and its own copy is deleted.
- **The hash.** The keys are appended in the engine's order, so a run with
  neither table hashes exactly as before. Computed with both lists:
  `4bfc2078…ffedff278` for a run with only a disposition table. A run that
  carries either table now hashes it.

  A receipt over such a run (possible only since slice 6, today) re-verifies
  as "tables changed" and needs a new review. That fails closed, and it is
  right: the earlier receipt never covered those figures.

## Evidence: seen failing first

| Check | Red (`red.txt`, the committed code) | Green (`green.txt`) |
|---|---|---|
| `csrEvidenceVitals.test.ts` (new), one list: the review's keys equal the engine's and include both tables | fails: 11 keys against 13 | passes |
| The tables hash: unchanged for a run with neither table (pinned), and covering a vital-signs table | fails: a run with vital signs hashed as one without | passes |
| A review map onto §12.5 vital-sign and con-med cells: the screen offers the cells, the server accepts the map | fails: 0 cells offered | passes |
| Every AnA suite (451 files) | — | 7,235 passed, 3 failed |
| Authoring, CSR, and every suite importing the review, the engine's evidence context or the tool registry (125 files) | — | 2,065 passed, 1 failed |

The 4 failures in the wide runs fail identically on the committed code
(`green.txt`, last section):
- `document-template-description`: the 16-heading CSR outline, and a
  description over the 1,024-character trim;
- `notification-category-schema`;
- `cross-sector-builtin-authoring-templates` (392 against 446).

Each fails the same way with this change's four source files at HEAD.

## Disclosed (files another lane changed in the last 24 hours)

- `server/services/csr/cortex-authoring-context.ts`: CSR slices 2 and 6
  (`8cf9bd399`, `735ac21cd`). The local list is replaced by an import and a
  re-export of the shared one, with the same keys in the same order.
