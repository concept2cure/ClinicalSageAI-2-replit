# OQ-002 v0.15 — the Vault OQ protocol revised for RR1b (D2, 2026-10-29)

RR1b made a review route required to send a Vault version for review (`REVIEW_ROUTE_REQUIRED`), and a routed
version is approved by its named approver signing on the route. OQ-VAULT-13 and OQ-VAULT-14 still sent with
`advance {to:"in_review"}` and no route and approved through `/advance`, so they failed. This folder holds the
runs of the protocol before and after the revision. The revision itself is recorded in
`docs/validation/OQ-002-VAULT.md` (v0.15, revision history and §6).

## What already exists

| Piece | Path | What it does | What this change did |
|---|---|---|---|
| The executable protocol | `tests/validation/oq/vault/run.mjs`, `steps-filing-compare.mjs`, `steps-annotations.mjs` | OQ-VAULT-00 to OQ-VAULT-22 | Revised 13 and 14, moved to `steps-review-route.mjs` (run after OQ-VAULT-12, so `run.mjs` stays within the file-length limit); corrected 18 and 22 (below) |
| The protocol document | `docs/validation/OQ-002-VAULT.md` | steps, revision history, results | v0.15 row, the 13 and 14 rows, §6 |
| The credential helpers | `tests/validation/lib/credentials.mjs` (`requireSigner`, `requireApprover`, `signerCode`) | the second and third identities | Reused unchanged |
| The program fixture | `tests/validation/lib/fixtures.mjs` (`createProgram`) | creates an IND program | States `productType` (P-21 at intake) |
| The route's server | `server/routes/document-lifecycle-review-route.ts`, `server/services/review/review-route*.ts` | send, routed sign, the refusals asserted here | Unchanged |

No new helper duplicates an existing one: `startRecord` is the start half of the old `sendForReview`, which
is gone; `sendOnRoute` is the one routed send; `signAs` moved with the steps that use it. OQ-VAULT-18 now
creates its program through `createProgram` instead of its own copy of the request.

## Runs

All on one installation: a database provisioned from empty by `scripts/db/provision-test-db.sh`
(`c2c_oq_vault_rr1b_20261029`), the working tree at `22ea55f33`, `RLS_ENFORCE=on`, runtime role
`app_service`, `NODE_ENV=development` with dev-login refused, no AI provider. Synthetic identities in a
synthetic organisation: `oq-runner@validation.local` (admin, the uploader and sender),
`oq-signer@validation.local` (reviewer), `oq-approver@validation.local` (approver), each signed in by password
and an authenticator code enrolled through the product's own endpoints. Their password and secrets came from
the environment and are in no file here; a scan of this folder for them found none. jm.smith and sarah.chen
were not used.

| Folder | Runner | Result |
|---|---|---|
| `red-fixture/` | v0.14, unchanged | 1 pass, 1 fail, 22 not-executed. OQ-VAULT-00: program create 400, "State whether the product is a drug or a biologic" (P-21, 2026-10-08; not RR1b) |
| `red/` | v0.14 with only the fixture's product class | 20 pass, 3 fail, 1 not-executed. **OQ-VAULT-13: send for review 409 `REVIEW_ROUTE_REQUIRED`** (`steps/OQ-VAULT-13.api-2.json`); OQ-VAULT-14 not executed; OQ-VAULT-18 400 (its own program create, same P-21 cause); OQ-VAULT-22 409 `QUOTE_MISMATCH` (the runner's quote was not in its text) |
| `revised-first-attempt/` | v0.15, first draft (steps still in `run.mjs`) | 22 pass, 1 fail. OQ-VAULT-13 read the route from `version.round`; the versions read carries it at `version.lifecycle.round`. The runner's path was corrected, not the assertion |
| `green/` | v0.15 | **24 pass, 0 fail, 0 deviation, 0 not-executed** |
| `red-route-refusal-removed/` | v0.15, against the server with only the `REVIEW_ROUTE_REQUIRED` refusal disabled (restored afterwards) | OQ-VAULT-13 fails: "the send without a route: expected 409 REVIEW_ROUTE_REQUIRED, got 200". The new expected result catches the case it exists for |

Each folder holds `transcript.txt` and `OQ-VAULT/` (the generated execution record, `result.json`, and per-step
requests, responses and screenshots).

## Limits

- A local execution, not the W3 qualification run (production `NODE_ENV`), which is still outstanding.
- URS-VAULT-013 is unchanged: the route is how its separation of duties is enforced now, but the requirement
  does not yet name the route. Whether it should is a URS revision, outside this change.
- TM-001 was not regenerated: it is built from the W3 executions under `docs/evidence/W3/`.
