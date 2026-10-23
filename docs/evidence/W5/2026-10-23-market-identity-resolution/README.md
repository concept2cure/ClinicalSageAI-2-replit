# W5 / D7 — fail-closed market identity resolution

Status: integrated 221 checks and production build passed after canonical catch-up; normal compiler/push gates pending. Baseline `526e86cba`.
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
services already consume that reader. AnA's project packaging in
`server/services/ana/AnaToolExecutor.ts` also uses `isHomeMarket`; the fallback
previously admitted unknown home agencies. Its refusal needs the same truthful
ownership diagnosis. The unanchored-reader early return also incorrectly
marks the market-number UI as home, although real packaging refuses it. Existing PGlite reader/export, real chained-writer,
route and UI suites are extended. No second resolver, registry, writer or UI
is needed. P-44's prior evidence explicitly hands this fallback on. EMA slash
handling remains outside this change under P-26's dash-form decision.

Searches covered home/market/application numbers, aliases, routes, services,
schema/migrations, AnA and UI. Deleted-history searches over region identity,
package identity, market-number and both UI names found no replacement; broader
submission deletions were legacy routers/shells. The design records each path
and the precise existing limitation.

## Result and verification

Unknown effective package regions, unresolved project agencies and unanchored
records no longer borrow a number or masquerade as home. Only recognized equal
regions prove home. Explicit null is unresolved; only omitted/undefined region
uses the submission region. A recognized home sequence still proves home even
if the submission's primary region is invalid. Version-1 snapshot fields/bytes
remain unchanged.

The one writer validates current region, project agency and authority after its
submission lock and project share lock. Refusals leave both number and audit
rows unchanged. The existing GET supplies the runtime diagnosis to the existing
Submit row, which hides record/change forms and inconsistent numbers while
unresolved. AnA distinguishes unresolved home agency from another known market.
No store, schema, dependency, vocabulary, approval engine or surface was added.

- `core/`: real PGlite reader/export, alias/snapshot and AnA checks; red-first
  failures and final input pins, including the additional unanchored/AnA review
  corrections. The initial five-file cohort passed 150 tests. Later cohort
  details are recorded in its README, not added as a full-suite total.
- `writer/`: 33 checks passed across three files (23 actual governed-writer/read,
  two access-checked route and eight shared-region tests). Five read leaks were
  reproduced first; split assertions then reproduced ten read/writer failures.
  Current-record injection covers region/home-agency/lead changes immediately
  before the transaction. This is PGlite, not native row-blocking proof.
- `ui/`: 17 scoped checks and seven actual Chromium scenarios passed, with no
  page errors. Browser responses are intercepted synthetic fixtures; the
  actual component, form and production CSS run. Initial driver and test-table
  corrections are retained separately. The browser server was stopped.
- `review/REVIEW.md`: independent caller/lock/null/diagnosis review. Scoped lint
  reports zero errors and no added warnings; final normal gates are pending.

These cohorts overlap and are not a full-suite or agency-conformance total.
`HUMAN_CHECK.md` remains explicitly unexecuted. Agency assets, live gateway
qualification, witnessed human testing, production deployment and D7 acceptance
are separate. This packet closes the P-44 unknown-market engineering handoff;
EMA slash handling and other P-44 handoffs remain outside it.


## Canonical catch-up and final source checks

Source commit `b0beb9392` was merged normally with incoming reporting and Vault
passage-freshness work at `8a4893fea`. All ten changed lane source/test files
were unchanged across that merge. The combined twelve-file cohort passed
**221 checks** on that tree. The production client, server and audit-chain
verifier build passed; the existing chunk-size advisory remains. All **10,123**
pinned tracked source/config inputs matched after tests and build. These are
source/config pins, not qualification of every agency asset. Exact receipts and
the reproducible pinning helper are under `verification/`.

The packet secret scan passed with zero findings. Its first scan mistook
content hashes keyed by credential-related source filenames for credentials;
the same path/hash values were expressed as explicit row fields and rescanned,
without an exception or baseline change (`hash-format-correction.json`).
Normal compiler and direct-push gates still must pass before publication is
reported. No overall CI, production deployment or human acceptance is claimed.


## Later canonical Authoring catch-up

The first normal push passed every gate and the full compiler reported
**zero errors (tsc exit 0, baseline 0)**. The remote advanced during compilation,
so Git refused the ref update. Its receipt is retained in
`verification/push-first-ref-race.txt.gz`. No force or bypass was used.

Ordinary merge `6c7235f22` preserves incoming deliberate saved-section refiling
and its qualification through `7184fb1fd`. The eight differing original broad
source pins are explicitly listed in `catchup-broad-input-diff.json`; the
earlier 221-check/build receipt stays bound to `8a4893fea`. All ten lane
source/test inputs remain unchanged. A focused five-file Authoring/package
cohort passed **161 checks**, and a fresh production build passed on the merged
tree, with all thirty catch-up inputs unchanged. These overlapping results
are not summed. Final normal push/compiler gates are pending on that tree.


## Canonical project-intake catch-up

The second normal push again passed every gate and full TypeScript with zero
errors, but the remote advanced to `66ad10eaf` before its update could land.
`verification/push-second-ref-race.txt.gz` preserves that result. Ordinary merge
`e7f38d5fd` retains explicit client-workspace project intake and all preceding
work. All thirty previous catch-up pins still match. The four-file project
creation/workspace/market-reader cohort passes **92 checks** and a fresh
production build passes, with all fifty-seven latest pins unchanged. These are
source-bound overlapping cohorts, not a summed full-suite total. Normal gates
and publication remain pending on the latest candidate.


## Canonical eSTAR catch-up

The third normal push passed all gates and full TypeScript with zero errors;
the remote ref advanced to `035ee6854` before its update. The receipt is
`verification/push-third-ref-race.txt.gz`. Ordinary merge `c503801bf` retains
the governed official eSTAR attachment workflow. All fifty-seven preceding
scoped pins still match. The four-file market-reader, eSTAR export and dispatch
renewal cohort passes **58 checks** and a fresh production build passes; all
eighty-five latest source/test/config pins match. The later `164b062b2` update
is documentation only and leaves those pins unchanged. All earlier cohorts
remain source-bound, with overlapping counts kept separate. Final normal gates
and direct publication remain pending.
