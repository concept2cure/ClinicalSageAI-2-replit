# D2 — the filing cabinet shows every document it counts

**Row:** D2 Launch catalog (Vault). **Date:** 2026-09-24. **Session:** `session_01KnUGoX3g4R4FWKWGc2sTbN`.
Found by the 2026-09-24 Vault-against-Veeva mapping (workflow `wf_7221b784-39b`, taxonomy mapper, which probed the
exported `filingCabinet`: the device view rendered 2 of 3 uploads, the pharma view 1 of 3).

## 1. What was wrong

`filingCabinet` (`server/routes/c2c/project-vault.ts`) placed an upload in a folder only when the upload's
`folder_id` belonged to the vault view resolved **at read time**. That view is not stored on the row: it
comes from the program's product type, and `resolveVaultView` falls back to the service view on any error.
So a document filed under another view's folder appeared in no folder and not in Unfiled, while the
branch's document count still included it. Examples are a 510(k) folder on a program that now reads as
pharma, or a document filed while the view lookup had fallen back. A reviewer reads "not in the tree" as
"not in the vault".

## 2. What changed

Such a document is shown in a folder labelled **"Filed under another view · needs review"**, which appears
only when there is one. Its flag names where it was filed, as the folder's label and its view (e.g.
"“510(k) submissions” (Medical Device view)"), and tells the reader what to do. Every other document is
placed as before.

## 3. Proof

| | |
|---|---|
| `red/cabinet-other-view.txt` | Old cabinet: **2 of 3 fail**. The device-folder document is missing from the tree, and there is no folder for it. |
| `green/cabinet-other-view.txt` | 3 of 3. Every test file that imports the project-vault read model or mounts the Vault surface: 25 files, 190 tests. tsc 0, ratchet unchanged. |

## 4. Not done here

The root cause is that the view is not stored with the filing. Recording it at ingest and placement means
changing the placement writer (`vault-placement.service.ts`) and the ingest, both the AnA client-files
lane's files (`…01DiJJAk`). It is handed on through the work-order board rather than edited here.
