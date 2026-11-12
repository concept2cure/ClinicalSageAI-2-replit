# D4: the qualification protocol is approved, and approval qualifies nothing (2026-11-10)

Launch row D4, ledger package L1 (the protocol sits in S4's paths). Founder decision P-118
(`docs/LAUNCH_DEFINITION_OF_DONE.md`): *"yes I approve"*, and on the regulatory reviewer for the retrieval test bank,
*"impossible right not to get a human reviewer so figure out alternatives."*

## What changed

- `server/eval/pq/pq-protocol.json` is **version 1.0.0, approved 2026-11-10** by the founder as system owner.
- It carries a `scope` block: a qualification is for a named use, on the components that use needs.
- It carries a `csrDrafting` component, **required and not executable**. The run over the CSR builder's own prompts
  is not written, so no run can pass today.
- The readiness report read "it is draft" from prose. It now reads the file (`scripts/ops/ga-readiness-report.mjs`).
- The registry's note on the primary drafting model names the approved version (`approved-models.ts`). Its
  `pq.status` is unchanged: `pending`.

## What approval changed in behaviour: one blocker, replaced by another

`npx tsx server/eval/pq/run-pq.ts --preflight`, before and after:

| | Before | After |
|---|---|---|
| Status | blocked | blocked |
| `PROTOCOL_NOT_APPROVED` | yes | no |
| `REQUIRED_COMPONENT_UNAVAILABLE` (the CSR drafting run) | no | yes |
| The six retrieval-bank blockers | yes | yes, unchanged |

No model's status changed. Nothing a model may do changed.

## What already exists (RULE 3)

Nothing new was built. Each change finishes an existing file.

| Path | What it does today | What it does not |
|---|---|---|
| `server/eval/pq/pq-protocol.json` | Declares the components and criteria; now approved | Its `scope` is not read by the verdict |
| `server/eval/pq/pq-verdict.ts` | Refuses a pass on a draft, on a required component that cannot run, and on one it has no step for | Has no step for `csrDrafting`, and applies every required component to every run |
| `server/eval/pq/verify-pq-record.ts` | Preflight and record check; asks facts of each source and item | Asks no reviewer credential |
| `server/services/ai-gateway/model-governance.ts` | Refuses a use the record did not measure (`use-mismatch`) | Knows no CSR-only use yet |
| `server/services/csr-builder.ts`, `csr/unsupplied-statistics.ts` | Draft a heading and check its figures | Are not yet driven by a qualification run |
| `server/eval/rag/guidance-corpus-manifest.json` | 24 sources, a six-step `verifyProcedure`, candidate URLs | No source is verified: every publisher's site is refused from the sessions' containers |
| `server/eval/rag/gold-dataset.json` | 18 positive items, 2 negative controls | 30 are required; none carries its section and quotation; 5 have open checks |

Searches run: `pq-protocol.json`, `protocol.components`, `PQ-DRAFT-001`, `approvedBy`, `verifyProcedure`,
`guidance-corpus-manifest` across `server/`, `scripts/`, `tests/` and `docs/`.

## Tests

Red first, then green.

- **Red, on the edit alone:** 32 tests in 5 files failed. Each built its fixture by copying the real protocol and
  expected a pass or one named reason; the new required component made every copy INCOMPLETE for a second reason.
  The copies now leave that component out, and say why.
- **Green:** `npx vitest run server/eval/pq server/eval/rag server/services/ai-governance` and the gateway's
  model-governance suite: 22 files, 443 tests. `tests/ops` and the registry suites: 109 tests.
- **The new pins, made to fail:** with `csrDrafting.required` set to false in the file, 6 tests fail, among them
  "a run perfect on generation, extraction and rag is INCOMPLETE, and the one reason is the CSR drafting component".
  The file was restored.

No file gained a lint warning.

## The retrieval bank without a reviewer: what the founder runs

P-118 splits the work by kind. The mechanical part is one command, from the Codespace:

```
node docs/evidence/D4/2026-11-10-pq-protocol-approved/fetch-official-sources.mjs ~/.concept2cure-codespace/guidance-sources
```

- It downloads the 18 sources the bank needs and the 4 publishers' reuse-terms pages, and writes `report.json`
  with each file's URL, size and SHA-256.
- It changes nothing in the repository, and refuses to save inside it.
- A URL that answered is a candidate. The report lists what is still to do for each: confirm the link from the
  issuer's own listing page, read the cover, read the terms.

Tried here against a local stand-in: every site refused (exit 1, each reason listed); one of two sources served
(the saved file's `sha256sum` equals the report's); a folder inside the repository (refused). Against the real
manifest from this container: 0 of 18 and 0 of 4, `ENOTFOUND`, as expected.

## Limits, stated

- **No model has been run against this protocol.** There is still no working provider key in any environment a
  session can reach.
- **The CSR drafting run and the verdict that reads the use are owed** (S4). Until they land, the approved protocol
  can pass no model for any use.
- **The 85% floor has no earlier document behind it.** P-118 says so, and it is the founder's to change before the
  first run.
- **The download helper has not been run against the publishers' sites.** Their page layouts and redirects may need
  a second pass once the founder's report comes back.
