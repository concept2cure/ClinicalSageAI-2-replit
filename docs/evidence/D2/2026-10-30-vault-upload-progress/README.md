# D2: each Vault upload row says how far its file has got (MR-08 Stage 6 step 2, 2026-10-30)

`docs/work-orders/MR-08-vault-upload-safety-and-document-control.md` Stage 6, step 2; CAT1-17 (upload ergonomics).

A regulatory team's uploads are large. A clinical study report, an investigator's brochure or a scanned batch record runs to tens of megabytes, under the Vault's 50 MB cap. Each one is scanned for malware and read for text before it is recorded. The upload list said only "Uploading…" for the whole of that time, and the rows behind it said nothing. A list that says nothing for a minute reads as stalled. People then cancel and send the file again, which in a controlled repository makes a second attempt to record the same bytes.

## What already exists

Searches run, in client and server: `XMLHttpRequest`, `upload.onprogress`, `onUploadProgress`, `uploadWithProgress`, `progress`, `useVaultUpload`, `VaultUploadStaging`, `FileDropZone`, `/api/vault/ingest`. Deleted history (`git log --all --diff-filter=D` on `*pload*` and `*rogress*`) holds legacy uploaders (`CSRDirectUploader.tsx`, `DropzoneUpload.jsx`, `FileUploader.jsx`, `DocumentUploadForm.jsx` and others). They were deleted long ago, are outside the launch catalog, and none of them was the Vault's.

- **The upload hook** (`client/src/concept2cure/v2/useVaultUpload.ts`, gap 7.1). It is the one path to `POST /api/vault/ingest`, for the v2 Vault, the MDX Document vault and the MDX pathway attach. It sends one file at a time and tells the caller as each file starts and settles (`onFileStatus`: uploading, stored, refused). It sent the request with `fetch`, which reports no upload progress.
- **The upload list** (`client/src/concept2cure/v2/surfaces/VaultUploadStaging.tsx`, gap 7.1). One row per file, with its own title, document type, classification and folder. Each row says what became of its file. While uploading, the row said "Uploading…" and a row not yet sent said nothing.
- **The drop zone** (`client/src/concept2cure/v2/FileDropZone.tsx`): this work order's step 1, delivered by gap 7.1.
- **The per-row document type** (step 2's last ask): already there.
- **Nothing reported bytes sent**, anywhere in the client.

## What changed

| Piece | Where |
|---|---|
| `sendIngest(form, headers, onProgress)`: the one ingest request, through `XMLHttpRequest`. It reports the body's bytes sent and returns the reply the hook already read (`ok`, `status`, `json()`). The request itself is unchanged: the bearer header, the session cookie (`withCredentials`) and a body whose multipart boundary the browser writes. A request that gets no reply rejects, and the hook reports that as the same "the connection dropped before the file was sent". | `client/src/concept2cure/v2/vaultIngestTransport.ts` (new) |
| The hook passes each file's progress to `onFileStatus` as `{ state: 'uploading', sent, total }`, at most once per whole percent. The batch stays one file at a time. | `client/src/concept2cure/v2/useVaultUpload.ts` |
| Each row reads one of:<ul><li>"Uploading… 42% of 47.7 MB sent", with a progress bar labelled "Sending <file>";</li><li>"Sent. The server is scanning it and storing it…", once every byte is out;</li><li>for a row not yet sent while the batch runs, "Waiting: files are sent one at a time."</li></ul>The recorded and refused wording is unchanged. | `client/src/concept2cure/v2/surfaces/VaultUploadStaging.tsx`, `styles/misc-surfaces-v2.css` |
| `ci:unauthenticated-fetch` checks that every raw request sends the bearer token, and it matched only `fetch(`. Moving the ingest to XHR took it out of the scan (72 calls became 71). Each `sendIngest(...)` call is now scanned as a `fetch()` is, and a `new XMLHttpRequest` anywhere else in the client is refused. | `scripts/ci/check-unauthenticated-fetch.mjs` |
| The tests' fake: an `XMLHttpRequest` with the signature a `fetch` mock had, so the existing assertions on method, credentials, body and headers keep their meaning. | `client/src/concept2cure/v2/__tests__/_ingest-xhr-fake.ts` (new); `useVaultUpload.test.tsx`, `vaultUploadStaging.test.tsx`, `vaultOpensUploadedDocument.test.tsx` and `vaultCheckInVersion.test.tsx` moved onto it |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | Before the change, the new and changed cases fail on what they are for: no bytes are reported; a row says only "Uploading…"; a row waiting its turn says nothing. One case, a dropped connection, already passes, and is kept to pin that wording across the change of transport. |
| `02-green.txt` | <ul><li>**The upload suites:** 37 of 37 across 4 files, including the version check-in.</li><li>**Every Vault, eTMF and MDX client suite, plus the other suites that render the Vault:** 1,529 of 1,529 across 161 files.</li><li>**One run of the whole client tree** printed 3,133 passes and no failure. It then printed nothing for over ten minutes and was stopped, and which suite stalled was not established. It is reported, not counted.</li><li>**Type check:** `tsc` exits 0.</li><li>**Lint ratchet:** no file rises. `useVaultUpload.test.tsx` falls by 6.</li></ul> |
| `03-mutation.txt` | Seven mutations, each caught:<ul><li>every progress event reported;</li><li>progress not passed to the request;</li><li>the row saying only "Uploading…";</li><li>no word for a waiting row;</li><li>no progress bar;</li><li>a 4xx refusal read as recorded;</li><li>the session cookie not sent.</li></ul> |
| `05-gate.txt` | The extended gate exits 1 when the ingest caller drops the bearer header, and exits 1 on a second `XMLHttpRequest` outside the transport. Restored, it scans 72 calls and exits 0. |
| `04-browser.txt` | The bundled transport, in Chromium, sends a 20 MB multipart body to a local endpoint that reads slowly. The browser reports progress many times, rising, with one total that equals the bytes the server received. The bearer header and the session cookie reach the server. A 422 comes back as a refusal with its body, and a connection the server cuts mid-body rejects. |

## Decisions recorded here

- **One file at a time, not two.** The work order proposed a concurrency of 2. A second file in flight shares the same person's upload bandwidth, so the batch finishes no sooner. It would also put two malware scans and two text reads on the server at once for one person, which is how the hook's original comment says one user stalls the pool. One at a time keeps each outcome in the order the list shows. That matters when two files in a batch carry the same name: the first is recorded, and the second is reported against it. What the step needed was for each row to say how far its file has got, and now it does.
- **Progress is bytes sent, then the server's work, never a guessed percentage of the whole.** A bar that reaches 100% while the server is still scanning would claim something that has not happened. At 100% the row instead says the file is sent and that the server is scanning and storing it, until the server's own answer arrives.
- **One transport.** `XMLHttpRequest` replaces `fetch` for this request only, in one function, and the hook has no second path. Every other request in the client is unchanged.

## Not done here

- Cancelling an upload in flight. An aborted request is reported as a dropped connection, and nothing in the list offers to abort one. Whether a person may stop a file the server has begun to scan is a question for the ingest route, not for this client.
