# Existing market-number row — UI qualification

Executed 2026-10-23. The final scoped unit cohort passes **17 checks**, and
scoped ESLint reports **zero errors and zero warnings**. Actual Chromium passes
**seven scenarios**, with no page errors and stable source hashes. These are
synthetic UI checks; human witnessing and live backend/agency use remain open.

## What already exists

- `client/src/concept2cure/v2/surfaces/MarketApplicationNumber.tsx` already
  reads the existing market-number endpoint and opens the governed `C2CForm`
  with a number and reason. `ProjectMarkets.tsx` already reaches it on Submit.
  No surface, writer, jurisdiction resolver or styling system was added.
- `dataConnect.tsx` already turns malformed payloads into failed reads through
  a supplied shape guard. The existing guard is extended to validate the
  additive diagnosis field instead of silently treating malformed diagnosis
  as permission to record a number.
- The prior W5 non-US identity browser packet supplies the actual-component
  Vite/Chromium/source-pinning pattern reused by this evidence fixture.

## Observed behavior

The server's nonempty `unresolvedReason` is shown in an alert before either the
home flag or application number can hide or contradict it. The existing record
form and change controls are withheld. A reread that becomes unresolved removes
an open form, and a later resolved read does not reopen that stale form. A null
or absent diagnosis retains the existing recognized-market behavior.

The unit cohort covers contradictory home/number responses, malformed diagnosis
types and blank strings, old/null compatibility, open-form invalidation, reason
recording, unchanged receipts, refused retry, home rendering and role restrictions.
`green-final-inputs.json` pins the final executed unit inputs; `lint.json` holds
the final lint result. `green-inputs.json` / `green.txt` retain the earlier
passing cohort before test grouping only.

## Failing-first and driver corrections

`red.txt` records nine initial failures and eight passes against unchanged
production code. One initial parameter-table row passed an empty array as no
arguments rather than as a value. The corrected named case passes a real array,
and `red-array.txt` records its failure against unchanged production. Its first
name selector skipped the case; that attempt is retained in
`array-selector-skipped.txt` and is not counted as a proof. Input pins and exact
commands are in the corresponding `*-inputs.json` files.

The first lint found that adding cases made the original `describe` callback
102 lines. The new cases were grouped separately; no assertion or production
behavior changed. The original warning remains in `lint-first.json` and the
final cohort/lint were rerun.

The first Chromium run timed out at a field selector because a required-field
marker makes its label longer than the exact text. The driver was corrected to
match the field label prefix, with production code unchanged. That incomplete
attempt remains in `browser-execution-first.txt`; only the complete replay in
`browser-execution.txt` and `browser-result/result.json` is counted.

## Chromium execution

With Node 22 on PATH, from the repository root:

```sh
node docs/evidence/W5/2026-10-23-market-identity-resolution/ui/browser-server.mjs
node docs/evidence/W5/2026-10-23-market-identity-resolution/ui/browser-check.mjs
```

The loopback-only server uses port 5199 and is stopped after qualification.
The probe mounts actual `MarketApplicationNumber` and `C2CForm` components with
production CSS; every API response is intercepted and explicitly synthetic.
One recognized-market POST is asserted against its exact synthetic number and
reason. Every unresolved case performs GETs only. No production write, electronic
signature or transmission occurs. Harness controls simulate parent rereads; the
driver invokes one by DOM while the actual shared form correctly traps focus,
so this is a simulated external read change rather than a person clicking
through the dialog.

`browser-result/` holds three screenshots and structured results with exact
source pins, seven checks, requests and the empty page-error list. The unknown
home and recognized-market screenshots were visually inspected. This proves
the existing component behavior, not an end-to-end live application or human
acceptance session.
