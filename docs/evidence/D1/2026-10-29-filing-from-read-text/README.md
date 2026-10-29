# D1: a scan is proposed for filing once its text is read (MR-08 Stage 3 step 5, 2026-10-29)

`docs/work-orders/MR-08-vault-upload-safety-and-document-control.md` Stage 3, step 5: "Re-propose filing ... only through the placement service's audited writer. Never override `confirmed`."

OCR moved off the upload request on 2026-10-29 (`../2026-10-29-ocr-off-request/`). A scanned PDF now reaches ingest with no text, so the filing classifier proposes from its name and title alone. A scan named `scan-0001.pdf` landed in Unfiled. It stayed there after the processing sweep read its text, even when that text said, in its first line, that it was a clinical study report. Before the move, ingest had OCR'd the scan and proposed Module 5 from the same words.

Now the sweep asks the classifier again, from the text it read, in the same transaction as the text.

## What already exists

Searches run: `classifyForFiling`, `re-propose`, `repropose`, `placement_status`, `placeVaultDocument`, `vault.document.file`, `actorKind`, `inheritedPlacement`, `unfiled`, and the classifier's `TEXT_RULES`. Deleted history (`git log --all --diff-filter=D`): nothing under those names.

- **`classifyForFiling`** (`server/services/vault/vault-filing.service.ts`) is the one filing classifier. It reads a file's name and title first and its text only when they match nothing. Ingest calls it once, at admission. Nothing called it again.
- **`placeVaultDocument`** (`server/services/vault/vault-placement.service.ts`) is the one writer of a filing *decision*. It writes for a person (`confirmed`, `placed_by`) or an agent (`suggested`, `placed_by` null, the agent named in the audit row). It requires a person's current program write access, so a system proposal is not one of its shapes. The new writer sits beside it in the same module, under the same audit action.
- **Ingest** writes the classifier's proposal at admission: `suggested` with confidence and rationale, or `unfiled`, `placed_by` null. A check-in keeps its head's filing (`inheritedPlacement`, `vault-version-checkin.ts`).
- **The processing sweep** (`server/jobs/vaultProcessingSweep.ts`) writes the text, the catalog outcome and a chained `vault.document.extracted` row in one transaction. Nothing in it touched the filing.

## What changed

| Piece | Where |
|---|---|
| `proposeFilingFromReadText` reads the version `FOR UPDATE`, runs the classifier over the text read, and writes `suggested`, the classifier's confidence and rationale, and a chained `vault.document.file` row naming `actorKind: 'classifier'`. No person is named as the placer. | `server/services/vault/vault-placement.service.ts` |
| The sweep calls it inside its transaction, after the outcome is recorded, under a savepoint. It names the proposal, or why none was made, in its `vault.document.extracted` row. | `server/jobs/vaultProcessingSweep.ts` (`proposeFiling`) |

It proposes only for a version that is still the classifier's to propose:

- `unfiled`;
- placed by no person;
- with no `vault.document.file` row on record other than the classifier's own (so no person's or agent's filing or unfiling);
- not a check-in, which keeps the filing of the version it replaced.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The final suite against HEAD's code, on real PostgreSQL 16 (`RLS_ENFORCE=on`, `app_service`). The two cases that need a proposal fail: the scan whose body names a clinical study report stays `unfiled`, and the extraction row carries no proposal. The six guard cases pass on HEAD, as they must, because nothing proposed anything; `03-mutation.txt` is what proves each guard. |
| `02-green.txt` | <ul><li>**The sweep suite on real PostgreSQL 16:** 16 of 16. Its eight filing cases, each listed in the file:<ul><li>a scan proposed by its body text, with one classifier audit row;</li><li>a proposal that fails, where the text is still recorded and the scan stays unfiled;</li><li>a scan a person unfiled;</li><li>a scan an agent unfiled;</li><li>a scan its name already filed;</li><li>a scan a person filed before filings were audited;</li><li>a person's filing on the audit trail, where the row names no placer;</li><li>a check-in of an unfiled version.</li></ul>The last six are unchanged, with no new audit row.</li><li>**The placement, filing, ingest and catalog dbtests:** 93 of 93 across 8 files.</li><li>**Vault service and jobs unit suites:** 856 of 856 across 69 files.</li><li>**Type check:** `tsc` exits 0.</li></ul> |
| `03-mutation.txt` | Eight mutations, each run against the filing cases, each caught by a case of its own. |

## Decisions recorded here

- **`suggested` is left alone, which is narrower than the work order.** The work order allows re-proposing a `suggested` placement too. The classifier reads text only when a file's name and title match nothing, so a proposal made from the name comes out the same from the text. Re-proposing it would only write a second audit row under a person who may be reviewing the first. A suggestion awaiting a person stays as it is.
- **A check-in is not re-proposed.** It carries its head's filing, and that filing may have been an agent's unfiling, recorded on the head's row, not the new version's. Reading the decision across the chain is possible, but a check-in is a new version of a document someone has already seen, not a new arrival.
- **A failed proposal never costs the text.** The proposal runs on the sweep's transaction under a savepoint. If it fails, only the proposal is rolled back. The text, the outcome and the extraction row still commit, the row names the error, and the version stays visibly unfiled for a person to file. Rolling the whole read back instead would have left a version that the classifier cannot handle pending, and OCR'd again, on every run.
- **Two guards overlap, and each is proven alone.** Every live writer of `placed_by` also writes a filing audit row, so either guard would catch a person's filing. They part only on rows the live writers no longer make. One is a filing recorded before filings were audited, which has `placed_by` and no row. The other is a filing on the audit trail whose row names no placer. The audit trail is the record, and the column is a convenience. A case builds each state directly, so each guard is seen to bite alone.
