# Canonical source intake transport qualification

This packet covers `authoringHandoff.ts`, the new focused transport suite and the
existing edited-workflow reuse fixture. The sole existing import POST remains
`/api/authoring/import/source`. Root owns the dialog/hook, broader integration,
compiler, build, gates and canonical publication; those receipts are separate.

## Actual checks

- `red.json`: unchanged production, **9 failed / 1 passed / 10 cases**, exit 1.
  The existing pure workflow receipt decoder admitted nine malformed fresh
  document/section/ownership/content/order/provenance variants. The valid receipt
  passed. No missing-export failure was used. Exact pre-edit source/test snapshots
  are retained in `red-*.gz`; the 10 declared inputs had no drift.
- `lint-before.json`: historical exit 1, one new-test multiline-call style error
  and the existing `writeHandoffStage` complexity warning. The test call style was
  corrected without changing production or the retained behavioral RED.
- `transport-first.json`: first expanded run, **19 failed / 63 passed / 82 cases**,
  exit 1, no drift. These failures came from the test's expression-returning
  `beforeEach`: Vitest treated the returned mock as cleanup and invoked the mock
  again without request arguments. The block-body fixture correction is test only;
  the exact first test source is archived and matches its original freeze hash.
- `transport-first-lint.json`: exit 0; zero errors and one existing warning.
- `final-green.json`: **82 passed / 2 suites**, exit 0, no 14-input drift, using
  `source-freeze.json`. The 65 focused cases cover binary/fresh workflow strict
  receipts, actor/tenant/parent/source checks, captured headers and immutable
  selector/preview snapshots, retryable reads, typed and generic uncertain
  creation, response/body retirement, exact read-only recovery, all three stale
  read hops, and inventory that cannot identify a receipt. The existing 17-case
  reuse suite preserves legitimate renamed/added/removed/reordered saved sections.
- `final-lint.json`: exit 0 under `--max-warnings 1`, zero errors and **only** the
  original `writeHandoffStage` complexity warning. No new warning or baseline
  increase. `specialist-prefix.json` verifies the unchanged specialist writer
  prefix against the retained RED snapshot.

Every command receipt retains exact argv, Node 22.23.3, raw exit, before/after
input hashes and the SHA-256 of its unmodified deterministic gzip output. These
are synthetic HTTP/jsdom checks, not live provider/database/browser proof. The
initial runner setup tried an incorrect auth-service filename before dispatching
any checks; correcting the declared `.tsx` path produced the retained runs above.
No compiler, build, dependency or Git mutation was performed by this owner.

## Contract and limits

Pure binary/workflow receipt APIs retain three/four arguments. Active transports
pin actor headers and selectors once per operation, refuse retired owners, check
saved actor/organization and preserve typed uncertainty including malformed
recovery identity. Exact recovery requires the original scoped inventory plus
whole-document header/sections and matching stored source provenance. Generic
inventory yields no saved-copy receipt and no automatic retry. Recovery uses only
existing GETs and never an import write. Saved-copy readback does not prove current
source eligibility, cancel a prior request or provide durable exactly-once import.

`source-freeze.json` pins this bounded transport replay; `red-source-freeze.json`
and `transport-first-source-freeze.json` are historical qualifications. Final
source archives permit exact replay of owned changed inputs. Root integration
receipts qualify later cross-owner bytes and any later canonical catch-up.

Human checks: **Not run**. No deployment or live provider call.
