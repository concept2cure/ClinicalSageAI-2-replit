# D5: a CSR can be approved through the product (2026-10-29)

Session `…01E8btkB`. Found by the CSR-path review run for the LMN-201 / RePreve
prospect. The server refuses to approve, sign, freeze, export or file a
document it recognises as a CSR without a scientific-review map
(`CSR_SCIENTIFIC_REVIEW_REQUIRED`, `07857e3e3`, 2026-10-28). No screen could
send one, so no CSR could be finalised through the UI.

## What already exists

Searched: `csr_evidence`, `csrEvidence`, `csr-evidence/preview`,
`prepareCsrScientificApproval`, `parseScientificReviewSubmission`,
`ReviewDecisionDialog`, `recordPeerReview`, `submission-orchestrator/runs` in
`client/src`, `server/`, `shared/`. `git log --all --diff-filter=D` on
`*CsrEvidence*` and `*csrEvidence*` found nothing.

| Exists | Path | What it does | What it did not do |
|---|---|---|---|
| The gate | `server/services/authoring/csr-scientific-review.ts`, `csr-scientific-review-core.ts` | Requires, for a CSR's approval, a map binding every saved section (by hash) and each quantitative claim (text range, quote hash) to an exact retained table cell, plus the reviewer's two attestations; verifies every byte | — |
| The preview | `POST /api/authoring/documents/:id/csr-evidence/preview` (`routes/authoring-assembly.ts`) | Returns the retained runs' tables, their hash and the saved snapshot | No caller |
| The review schema | `shared/authoring/peer-review.ts` `csr_evidence` | Carries the map with the verdict | Nothing filled it |
| Runs with retained clinical tables | `OrchestratorRunControls.tsx` in eCTD compile (launch); `GET /api/submission-orchestrator/runs?programId=` | Starts a package run with the approved CSR source tables; lists a program's runs | — |
| The decision dialog | `client/src/concept2cure/v2/surfaces/ReviewDecisionDialog.tsx` | Records approve / request changes / decline against the saved snapshot | Had no CSR step; a refused CSR approval read as "reload" |

Nothing was rebuilt. The dialog gained the step the server already defined.

## What changed

- **`shared/authoring/csr-scientific-review.ts`** (new) holds what the server
  and the screen must agree on: the format, the table keys, the shapes, the
  CSR label rule (`labelledCsr`) and the exact numerical-display rule, with a
  position-aware form (`isExactNumericalDisplayAt`).
  - `csr-scientific-review-core.ts` and `csr-scientific-review.ts` import it
    and re-export it, so the rule is not copied and behaviour is unchanged.
  - Both files are inside the 24-hour windows of `07857e3e3` and of
    `142c133dd` (`…01T2wooC`). The edit moves code only, and is disclosed on
    the board.
- **`client/.../surfaces/csrEvidenceMap.ts`** (new), the deterministic half:
  - Finds each place a retained cell's exact value appears in a section's
    saved text. It skips markup and entities, never offers "12" inside
    "10/12" or "190" inside "1190", and accepts "83.3%" only for a cell in a
    % column, since a count is never "12%". Arm labels ("LMN-201") are not
    offered.
  - Lists every cell each figure could be, and builds the submission from what
    the reviewer confirmed. Hashing uses WebCrypto SHA-256 over UTF-8, which
    the test shows equal to the server's node:crypto.
  - `mapGaps` says in the reviewer's words what still stops approval.
- **`CsrEvidenceReview.tsx`** (new), the panel in three steps:
  1. Pick the program's retained run and read its tables.
  2. Each figure, in context, with its possible cells. A figure with one
     possible cell is proposed; one with several stays undecided until the
     reviewer chooses. Then a statement per section: how it was checked, or
     that it reports no quantitative results.
  3. The two attestations the server requires.
- **The dialog and its hook:**
  - The panel opens for an approval when the saved label names a CSR, or when
    the server answers `CSR_SCIENTIFIC_REVIEW_REQUIRED`. The server also
    recognises a CSR by template, origin or an earlier receipt; that case now
    opens the panel instead of saying "reload".
  - "Record approval" stays disabled until the map is complete, and the map
    goes with the approval as `csr_evidence`.
  - A document that is not a CSR approves as before.
- **`Review.tsx`** passes the document's program to the dialog.

What it does not do: judge clinical meaning, find a result written differently
from its table, or fill the tables. Those are the reviewer's attestations and
the clinical source's job. Every saved section must have text: the server
approves a CSR only when every section is written, and the panel names any
blank section.

## Evidence: seen failing first

| Check | Red | Green |
|---|---|---|
| `client/.../__tests__/reviewDecisionCsrEvidence.test.tsx` (trunk's dialog, hook, transport and board) | `screen-red.txt`: 2 failed / 3. No CSR panel; a refused CSR approval said to reload. The non-CSR control passes both ways | `green.txt` |
| `client/.../surfaces/__tests__/csrEvidenceMap.test.ts`, against the server's own `prepareScientificReviewReceipt` | Its first run caught two of my rules wrong: "LMN-201" offered as a figure, and "83.3" in "83.3%" not offered. Both fixed | 8 / 8. A confirmed map passes the server verifier; a section edited after mapping is refused |
| `tests/regulatory-honesty.contract.test.ts`, which pins the dialog's reason rule | My first edit rewrote the pinned expression | The rule is kept verbatim; the CSR clause is separate |
| Every suite touching the CSR review or peer-review code | — | `affected-suites.txt`: 445 passed. The one failing file, `workflow-import-governance.pglite.test.ts`, fails 27 / 27 identically on trunk (handed on) |

ESLint ratchet unchanged. Typecheck: the pre-push gate's.
