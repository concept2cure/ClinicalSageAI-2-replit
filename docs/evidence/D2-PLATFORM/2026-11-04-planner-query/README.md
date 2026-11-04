# Shared submission planning: preserve explicit request intent

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `75a1e5ba40dfa860100d6d2dca8dc6e1aa823aec`  
Plan: F1; completes `server/routes/biopharma/submissions.ts`.

## Architecture and what already exists

One configurable platform, not a separate regulator/device/CSR application.
This is the existing planning HTTP boundary over the existing shared resolver.
It changes no project, client license, document, source, scientific conclusion,
review, approval, submission transport or regulatory catalog record.

| Existing owner | Responsibility and limit |
|---|---|
| `server/routes/biopharma/submissions.ts` | Existing `/plan` and `/coverage` GET routes; previously cast query data to strings without runtime validation. |
| `server/services/regulatory/submission-resolver.ts` | Preserves filing identity, compatible product/stage candidates, support gaps and format distinctions. The previous repair remains unchanged. |
| `shared/regulatory/submission-type-bridge.ts` | Canonical filing aliases and IDs; not reimplemented here. |
| `shared/regulatory/document-taxonomy.ts` | Existing product, filing-family and regional vocabulary. No new vocabulary is added. |
| `server/services/regulatory/market-support.ts` and `registry/submittabilityCoverage.ts` | Existing build/transport support claims and limitations; not broadened. |
| `server/services/ana/bla-biologics-tool-defs.ts` | Existing AnA tool advertises a narrower product/family vocabulary. That separate gap was inspected but is NOT fixed or qualified by this HTTP change. |

Root rules and existing roadmap were available/read in the preceding scoped
work. F1 is open in the current ledger, covers existing paths and requires
`Plan: F1` / `Completes:` trailers. The ledger, roadmap, CI gates and branch
policy are unchanged. Related routes, resolver callers and taxonomy were
searched through GitHub. The full deleted Git history was not available:
container DNS cannot reach GitHub; the exact original route was fetched via
the connector and verified against Git blob
`0857f5753919f21434e550d3454677d2d895455f`.

## Confirmed defects

- `regions=` used a falsy test and became omission, silently activating the
  default comparison regions instead of reporting an invalid explicit choice.
- Repeated or nested query parameters were cast to strings. A repeated region
  became an array and could throw at `.split`, yielding 500 instead of a
  useful request refusal. Other structured selectors reached the resolver.
- Empty region components and duplicates were accepted as real dimensions.
- Unsupported/misspelled selectors, including filters `/coverage` never
  applies, were ignored and could present an unfiltered default as an answer.
- Resolver errors were logged verbatim; their message could carry caller
  text or sensitive details from a collaborator.

These are reproducible route behaviors, not proof of a live customer incident.

## Repair within the existing route file

A present selector must be one nonempty string. Only the fields the endpoint
actually accepts are admitted. Outer whitespace is trimmed; region case is
normalized as before; region order is preserved. Empty and duplicate region
components fail with 400 `SUBMISSION_QUERY_INVALID`, before either resolver
is called. Repeated or nested parameters are refused, not selected implicitly.

Omitted parameters retain the existing defaults. Unknown nonempty filing,
product and region values still go to the shared resolver for its existing
unsupported/no-selection result. This is not a second regulatory registry or
an assertion that a named filing is available in a named market. In particular,
a correctly shaped request is not approval to build, transmit or file anything.

Unexpected resolver failures retain 500 `INTERNAL_ERROR`, while logs use fixed
route-specific diagnostic codes, not raw exception objects. No response echoes
an unknown selector's contents. Auth, tenant, license and release gates remain
owned by the existing middleware/services, unchanged by this route repair.

Compatibility note: unknown query keys, previously silently ignored, now
return 400. `/coverage` still accepts only `regions`; passing a product or
filing filter does not falsely imply that the coverage matrix applied it.
No new screen, service, route file, mount, database table, tool or dependency.

## Executed before/after verification

Node 22.16.0; TypeScript 5.8.3. The same committed 64-case suite executes the
actual production route registration and handlers. Express registration and
the two resolver collaborators are explicit substitutes; no database, live
HTTP parser, authentication, browser or agency gateway is qualified.

| Route version | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Exact original Git blob | 11 | 53 | 0 |
| Repaired route | 64 | 0 | 0 |

Covers omitted defaults, preserved selected IDs/product types, all five named
regions, whitespace, repeated/nested/empty values, duplicate dimensions,
unsupported filters, no mutation of request values, unknown semantic values
left to the resolver, and internal-error privacy. The diagnostic/device cases
are selection pass-through tests, not regulatory equivalence or market approval.

Three touched TypeScript files transpile without syntax diagnostics. This is
not whole-repository semantic type checking. `execution.json` records per-case
results, Git blob identities, tool versions and SHA-256 hashes of raw runs.

`submission-query.http.test.ts` adds 12 real Express/Supertest cases under both
simple and extended query parsers. They are committed but NOT executed here:
Express, Supertest and Vitest are unavailable in this container, and npm DNS
cannot resolve. Existing resolver/catalog tests still require native CI.

## Reproduction

```sh
node --test docs/evidence/D2-PLATFORM/2026-11-04-planner-query/offline-runner.cjs
C2C_QUERY_BASELINE=1 node --test docs/evidence/D2-PLATFORM/2026-11-04-planner-query/offline-runner.cjs
npx vitest run tests/services/regulatory/submission-query.test.ts tests/services/regulatory/submission-query.http.test.ts tests/services/regulatory/submission-resolver.test.ts tests/services/regulatory/submission-resolver-registry.test.ts
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

The baseline command intentionally fails 53 cases. Local execution used the
hash-verified source via `C2C_QUERY_BASELINE_FILE`; the runner's TypeScript path
was supplied with `C2C_TS_PATH`, not installed as a new project dependency.

Pending: native HTTP/parser and repository tests, semantic type-check, shared
project/AnA settings handoff, real entitlement enforcement, all region/format
validation and hosted browser-to-submission acceptance. Direct GitHub writes
do not run local pre-push hooks. Queued workflow registration is not a pass.
The inspected AnA schema's missing device/diagnostic product choices remains
a separate unimplemented follow-up; no new AnA capability is claimed here.

## Rollback

Revert this scoped commit through ordinary change control. No migration or
backfill. Reverting restores the demonstrated request ambiguity and raw error
logging; it does not change data already stored in the platform.
