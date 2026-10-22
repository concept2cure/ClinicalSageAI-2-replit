# F10 remainder: the Vault's "Open in Submission Center" opens the sequence (break 13; D2, 2026-10-22)

Lane: `…session_01T2wooCZu46W7msw4TJuuzr`. Spec: `docs/design/FILING_SPINE.md` §7.2 F10, §6 break 13. Found by the filing-spine status read at `59105431a9`. One investigator then checked it, told to refute it as hard as it confirmed it.

## What already exists

- **The Vault door.** `client/src/concept2cure/v2/surfaces/VaultPlaceIntoSubmission.tsx`, mounted at `Vault.tsx` ("Place into filing…"). After a placement it offers "Open in Submission Center". When the reply was lost, it offers "Check filing status". Both called `onNav('submission-center')` and stashed nothing, so the Submission Center opened on its first submission and sequence. The person had to find the one they had just placed into, and the uncertain case was the one where that mattered most.
- **The Authoring door.** `AuthoringPlaceIntoFiling.tsx` (F10, `8bbb310146`) calls `stashNavParamsForTarget('submission-center', { submissionId, sequenceId, ws: 'builder' })` before it navigates.
- **The Submission Center** reads those parameters (`consumeNavParams('submission-center')`).
- **The F0 gate** (`tests/ui/filing-path-reachability.test.ts`, hop `placed-document-to-sequence`) checked only `AuthoringPlaceIntoFiling.tsx` and `ProjectMarkets.tsx`. It could not see the Vault door.
- **No board row claims either file.** No second door was built.

## What changed

- **The Vault door stashes the same parameters as the Authoring door.** `FilingRecovery` takes the chosen submission and sequence. The chosen sequence is the placed one: a receipt for any other sequence is not confirmed (`matchingLeafReceipt`), and the fields lock once a document is placed.
- **The F0 hop reads the Vault door too.** A future door to the Submission Center that carries no sequence fails that gate.
- **Tests in `vaultPlaceIntoSubmission.test.tsx`.** A confirmed placement opens its sequence in the Builder. The existing lost-reply case now also asserts what it carries.

## Red, then green

| | File | Result |
|---|---|---|
| Red at `9eea7d7ced` | `red.txt` | 3 tests: the two behavioural cases carry nothing, and the F0 gate names the Vault door a regression |
| Green | `green.txt` | 78/78 on the two files. Every Vault, placement and filing-path client suite: 43 files, 379/379. ESLint unchanged per file |
| Mutations | `mutations.txt` | 4/4 red: no stash; no sequence; no Builder; no submission |

## Not done

- "Open readiness" on Submit's market rows still opens `dispatch-readiness`. It is pinned by two tests, and no record decides whether it stays. Since F18 the readiness screen renders the market rows itself, so it may now be right.
