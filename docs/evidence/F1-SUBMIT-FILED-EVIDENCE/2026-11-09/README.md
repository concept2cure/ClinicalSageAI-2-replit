# F1: a document is submitted on a sequence only once the agency has received it (2026-11-09)

The coordinating session assigned this F1 item on 2026-11-02:

> POST /api/c2c/documents/:id/submit accepts only a filed sequence as filing evidence (isFiledDispatchStatus from
> filed-dispatch.ts), not a dispatched-but-unsent one; after slice 2.

## What already exists (RULE 3)

- **`POST /api/c2c/documents/:id/submit`** (`server/routes/c2c/documents.ts`) sets a governed document's status to
  `submitted`, a regulatory claim. It takes one of two bases and records it on the governed ledger row:
  - a `sequenceId`;
  - an `externalFiling` attestation.
- **For a sequence**, it accepted `status = 'dispatched'` **or** a `dispatch_status` in its own local set
  `{'sent', 'acknowledged'}`. A sequence frozen and dispatched whose send was pending, in flight, rejected or never
  made was therefore taken as evidence that the document had been filed.
- **The one filed rule** is `isFiledDispatchStatus` (`server/services/submission-service/filed-dispatch.ts`):
  `sent`, `acknowledged`. The route's local set was a second copy of it.
- **No client screen calls this route in this tree.** A search of `client/src` for the submit path finds no caller.
  Its callers are API clients. The refusal is a 409 with a plain sentence, so a caller reads why.

## The change

- **The route asks the one rule**, `isFiledDispatchStatus(row.dispatch_status)`, and the local set is deleted (zero
  duplication). A sequence's `status` alone no longer counts.
- **A sequence the agency has not received** answers 409 `SEQUENCE_NOT_FILED`, with its status fields as before and
  this sentence:
  > Sequence 0001 has not been received by the agency (its send is pending), so it is not evidence of a filing. A
  > sequence is filed once its send is sent or acknowledged. Nothing was submitted.
- **Unchanged:** the external attestation path, the evidence-required refusal, the access checks, and the ledger row
  and its payload.
- **The refusal's code** was `SEQUENCE_NOT_DISPATCHED`, with no message. Nothing in `server`, `client` or `shared`
  reads that code.

## Proof

| File | What it shows |
|---|---|
| `red.txt` | at `27b901c49`: a dispatched sequence whose send is pending, transmitting, rejected or not recorded is each taken as evidence, and the document is marked submitted (4 fail). An acknowledged one is taken (passes) |
| `green.txt` | every test that imports the documents router: 189 pass in 18 files |
| `mutation-1-dispatched-status-accepted-again` | the old `status = 'dispatched'` door reopened: the four refusal cases fail |
| `mutation-2-pending-accepted` | the pending case fails |
| `mutation-3-acknowledged-refused` | the acknowledged case fails |

The cases are in `server/routes/c2c/__tests__/documents-project-scope.pglite.test.ts`, which carries the real access
policy and the documents' migrations on PGlite. Each case starts from the document as it was made.

`Plan: F1`, `Completes: server/routes/c2c/documents.ts`.
