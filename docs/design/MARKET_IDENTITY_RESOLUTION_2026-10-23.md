# W5 / D7 — finish fail-closed market identity resolution

Baseline: `526e86cba` on canonical `concept2cure-v2`. Evidence:
`docs/evidence/W5/2026-10-23-market-identity-resolution/`.

## What already exists

- `shared/regulatory/region-identity.ts` resolves the existing twelve regions,
  agency names, gateway slugs and rule aliases. Unknown values stay unknown.
- `server/services/ectd/package-identity.ts` owns the recorded identity reader,
  P-44 market-number selection, named package refusal and version-1 captured
  proof. `isHomeMarket` currently returns true if either region is unknown,
  allowing an unknown package region or project agency to borrow the project's
  number. Its submission reader already uses the actual sequence region when
  supplied and refuses another known market's number.
- `server/services/submission-service/market-application-number.ts` is the one
  governed market-number writer/read. It shares `isHomeMarket` and casts a
  resolved region without separately proving it is recognized. Fixing the
  comparison alone would therefore open its writer to unknown markets.
- `server/routes/submissions.ts` already serves the tenant/access-checked GET
  and governed POST `/api/submissions/:id/application-number`. Existing tables
  hold the project's agency/number and submission's region/number; these region
  columns are text. No new registry, schema, migration or write route is needed.
- `client/src/concept2cure/v2/surfaces/MarketApplicationNumber.tsx`, reached by
  `ProjectMarkets.tsx` on Submit, reads that endpoint and draws the existing
  reason-bearing record form. A read treated as home draws nothing; unresolved
  ownership needs a visible refusal and no number-recording offer.
- Compile, export, orchestrator, sequence binding, current release coverage,
  transmit, and company-document identity/correspondence consume the canonical
  submission reader. AnA's project-only packaging path in
  `server/services/ana/AnaToolExecutor.ts` also uses `isHomeMarket`: the old
  fallback let an unknown home agency pass, and a strict comparison alone
  would mislabel unresolved ownership as another market. Its existing refusal
  must explain the unresolved agency. No parallel resolver is needed. The prior non-US identity completion is already canonical.
- Existing PGlite reader/export and real chained-writer tests, route tests and
  `marketApplicationNumber.test.tsx` cover the reachable paths. P-44's evidence
  explicitly hands on the unknown-region home fallback. EMA slash handling is
  separate; P-26's current dash-form decision stays unchanged.
- Searches covered home/market/application numbers, region/agency aliases,
  routes, services, tables, AnA and UI. `git log --all --diff-filter=D` over
  region identity, package identity, market-number and UI names found no deleted
  replacement. Broader submission history contains deleted legacy routers and
  shells, not another authoritative market-number path.

## Contract

1. `isHomeMarket` is true only for two recognized, equal canonical regions.
2. The existing submission reader returns no application number when the
   effective package region or project's home agency is unresolved. A known
   non-home region also requires the submission's own recognized matching
   region to read its market number. An unanchored record also carries its existing anchor
   remedy through this diagnosis, rather than being labelled home. An explicit
   known sequence region can still prove the home market even if the submission's primary region is bad.
   Only an omitted/undefined override uses the submission region; explicit
   null, empty or unknown overrides never fall back.
3. Unresolved ownership carries an additive runtime-only reason through the
   existing refusal and market-number read. The existing Submit row shows it
   and offers no number form. It must not say the project lacks a number or
   ask the person to record a number against an unresolved market.
4. The one writer refuses unknown submission regions or home agencies before
   any number/audit mutation. Its authoritative market and authorization checks
   must still hold when the number is written. No new edit workflow is invented.
5. Recognized home/non-home selection, tenant isolation, identifier rules,
   frozen-number policy, audit reason/authority and FDA facts remain intact.
   Version-1 snapshot fields/bytes are unchanged; runtime diagnosis is not a
   signed fact. Historical signatures are never rewritten. A corrected identity
   continues through existing coverage and independent renewal rules.

## Verification and scope

Reproduce the current leak and misleading UI first. Qualify canonical-reader
selection on actual PGlite records, refusal/no writes on the real governed
writer, actual existing UI rendering, alias/home/non-home regressions, and
snapshot compatibility. Review package/export callers for bypasses. Run scoped
lint/tests, production build and normal zero-error compiler/push gates. Publish
directly to the canonical branch; no PR or gate/baseline changes.

This closes one P-44 engineering handoff. Human witnessing, live agency assets,
gateway qualification and D7 acceptance remain separate evidence.
