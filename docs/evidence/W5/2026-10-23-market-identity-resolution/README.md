# W5 / D7 — fail-closed market identity resolution

Status: claimed; implementation and verification pending. Baseline `526e86cba`.
Contract: `docs/design/MARKET_IDENTITY_RESOLUTION_2026-10-23.md`.

## What already exists

`shared/regulatory/region-identity.ts` already resolves recognized aliases.
`server/services/ectd/package-identity.ts` owns P-44 number selection, refusal
and the signed snapshot, but currently treats unknown package/home regions as
home. `server/services/submission-service/market-application-number.ts` owns the
single audited writer/read and also trusts that comparison. Existing GET/POST
`/api/submissions/:id/application-number` in `server/routes/submissions.ts`
connect `MarketApplicationNumber.tsx` to `ProjectMarkets.tsx` on Submit; a home
read is hidden. The existing program/submission tables hold all required facts.

Compile/export/orchestrator/binding/coverage/transmit and company-document
services already consume that reader. AnA's project packaging already refuses
an unresolved home market. Existing PGlite reader/export, real chained-writer,
route and UI suites are extended. No second resolver, registry, writer or UI
is needed. P-44's prior evidence explicitly hands this fallback on. EMA slash
handling remains outside this change under P-26's dash-form decision.

Searches covered home/market/application numbers, aliases, routes, services,
schema/migrations, AnA and UI. Deleted-history searches over region identity,
package identity, market-number and both UI names found no replacement; broader
submission deletions were legacy routers/shells. The design records each path
and the precise existing limitation.

## Evidence to file

Failing-first reader/writer/UI checks; final scoped integration results;
source-bound verification; production build; normal compiler/push receipts;
an explicitly unexecuted human checklist. Nothing here establishes agency or
human acceptance.
