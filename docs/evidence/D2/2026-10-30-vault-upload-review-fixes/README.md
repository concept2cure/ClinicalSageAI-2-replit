# D2: the Vault upload list after a Part 11 and wording review (2026-10-30)

A read-only Part 11 / GxP UX and microcopy review was run on two changes from the same day:
- the upload progress (`docs/evidence/D2/2026-10-30-vault-upload-progress/`);
- the CSV of file details (`docs/evidence/D2/2026-10-30-vault-upload-manifest/`).

It found no blocker. It confirmed that 100% sent is never shown as recorded: "Recorded" appears only on the server's 2xx. It found the following, all fixed here, each red first.

## What already exists

- **The same-bytes rule** (Vault Part 11 F3): a file the Vault already holds, uploaded again, is reported as already in the Vault and changes nothing. This is what makes resending after a lost reply safe.
- **The sibling wording for an unknown outcome** (`VaultConfirmSuggested.tsx`): "it is not known which filings were confirmed. Reload the Vault and check before trying again." The upload's wording follows it.
- **The upload list's own live region and error styling** (`VaultUploadStaging.tsx`).

## The findings, and what changed

| # | Finding | Fix |
|---|---|---|
| 1 | A connection lost after every byte had gone out was reported as "dropped before the file was sent", and the file counted as not recorded. The server records before it replies, so the file may have been recorded. | The transport says whether the whole body had gone out (`IngestNoReply.afterSending`). After it, the row reads "Not known whether it was recorded: no reply came after the file was sent, so it may have been recorded. Sending it again is safe: if it was, the Vault says it already holds these bytes." The batch note and the live region say "not known", never "not recorded". |
| 2 | The CSV's note ("Nothing has been uploaded; check the rows, then upload") stayed on screen after the upload had begun. | The note clears when an upload starts. |
| 3 | "Manifest applied to 0 files" could appear inside an alert. A line naming only a file counted as applied. | The note names the CSV and counts lines: "library.csv: 295 of 300 lines applied." Where none applied: "library.csv was not applied: no line could be applied. Nothing in the list changed." A line that sets nothing is refused as "it gives no field to set". |
| 4 | A refused row being tried again still showed its old red "Not recorded" while it waited behind another file. | It reads "Waiting its turn: files are sent one at a time." and is not styled as an error. The live region counts it among the files uploading. |
| 5 | "Manifest downloaded" claimed more than the browser reports, said "one line per file" when recorded files are left out, and gave no remedy on failure. | "Your browser is saving vault-upload-details.csv: one line for each of the 3 files not yet recorded. Fill it in, then apply it here." On failure: "The browser did not save the file. Allow downloads for this site, then try again." |
| 6 | A CSV that finished reading after Upload was pressed changed rows whose fields had already been sent. | After the read, an upload in progress refuses the CSV: "An upload started while late.csv was being read, so it was not applied. Nothing in the list changed." |
| 8 | The note was inserted already carrying its role, and switched between status and alert, so it was not reliably announced. The progress bar's label differed from its visible text. | Two live regions are always present, one polite and one assertive. The bar is labelled "Upload progress, <file>". |
| 9 | Wording. | <ul><li>**The actor:** the Vault is named as the actor, as elsewhere in the list: "Sent. The Vault is scanning it and storing it…".</li><li>**No "manifest":** that word means the eCTD's to a regulatory team. The buttons read "Download these files' details as CSV" and "Apply details from a CSV…".</li><li>**Refusals:** they read "is not a column the Vault takes", "x is not in the list", and "neither this line nor the row gives one".</li><li>**Long lists:** a list names at most five, then how many more.</li><li>**Excel:** the downloaded CSV starts with a byte-order mark, so a spreadsheet reads "Module 3 · Quality" as written and the line applies on the way back.</li></ul> |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new and changed cases with the fixes taken out. 15 fail. The retry case fails with the upload list taken back alone. |
| `02-green.txt` | The upload, CSV, staging and hook suites, the Vault client suites, `tsc` and the lint ratchet. |
| `03-mutation.txt` | Eight mutations, each caught:<ul><li>a reply lost after sending called a drop before it;</li><li>a stale note;</li><li>a CSV applied after an upload began;</li><li>a retried row's old refusal;</li><li>a line that sets nothing counted;</li><li>no byte-order mark;</li><li>every file named, however many;</li><li>a CSV of which no line applied called applied.</li></ul> |

## Handed on, not done here

- **Finding 7, provenance.** The review found no Part 11 failure here. The person reviews and uploads what the rows show, and the ingest records them as the uploader. It recommended that the ingest record which CSV set a file's fields: its name and SHA-256, as an optional `metadataSource`, beside the existing `dataRoomSource` and `companyLegalSource`. The row would then show "Set from <CSV>". That is a change to the ingest contract and its audit row. It is recorded here for the Vault lane.
- **Finding 8, `aria-disabled` styling.** The panel's `aria-disabled` buttons have no disabled style. That is the panel's existing pattern, not this change's.
