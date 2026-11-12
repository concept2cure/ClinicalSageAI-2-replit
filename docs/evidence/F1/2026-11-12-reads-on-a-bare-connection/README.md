# Eleven review reads found no row for any organization (2026-11-12)

Plan package F1 (defects). Launch rows D2 and D6. The founder, 2026-11-12: "completing what we have, enhancing,
hardening and preparing for a commercial release of the system."

## The defect

The pool sets the tenant on a connection in two ways (`server/db/poolInstrumentation.ts`):

- `pool.query` runs each statement in a micro-transaction that sets the tenant first;
- a connection taken with `pool.connect()` gets the tenant only when its caller issues `BEGIN`.

Eleven reads took a connection and read on it with no `BEGIN`. Their tables have forced row-level security, so the
parent row was invisible and each answered **404 "not found for this organization"**, for every organization, for a
record that existed.

| Read | Where | Called by |
|---|---|---|
| `GET /api/nonclinical/studies/:id/send-readiness` | `routes/nonclinical.ts` | `Nonclinical.tsx` |
| `GET /api/ha-interactions/interactions/:id/readiness` | `routes/ha-interactions.ts` | no screen yet |
| `GET /api/iacuc/protocols/:id/completeness` | `routes/iacuc.ts` | no screen |
| `GET /api/ibc/registrations/:id/containment` | `routes/ibc.ts` | no screen |
| `GET /api/financial-disclosures/disclosures/:id` and `POST …/:id/ai-review` | `routes/financial-disclosures.ts` | no screen |
| `GET /api/effort-certification/:id/validation` | `routes/effort-certification.ts` | no screen |
| `review_send_readiness`, `review_ha_interaction`, `review_iacuc_protocol`, `review_ibc_registration`, `review_financial_disclosure` | `services/ana/AnaToolExecutor.ts` | AnA |

The twelfth and thirteenth, `GET /api/irb/submissions/:id/completeness` and AnA's `review_irb_submission`, were
found first, by opening the protocol workspace's IRB tab in the running app, and fixed in `ebef3236f`
(`docs/evidence/DESIGN/R1/2026-11-12-irb-submission-record/`).

**Why every suite was green.** The tests mocked the pool so that `connect()` handed back the same executor as
`query()`. That mock cannot tell a scoped read from an unscoped one.

## What already exists (RULE 3)

Nothing new. `pool.query` is the existing scoped path that the same routers' list reads already use, and
`requestPgClient(req)` (`server/db/requestDb.ts`) is the request's own scoped client that `ha-interactions.ts`
already uses for its other reads. No reader's signature changed: each still takes an executor, and each write path
that hands it a connection inside a transaction is untouched.

## The fix

Each read hands its reader the scoped executor in place of a bare connection:

- five routes: `scopedReads`, a three-line wrapper over `pool.query`, defined once in each route file;
- the agency-meeting route: `requestPgClient(req)`, as its other reads;
- the five AnA handlers: the same wrapper over `getPool().query`.

## How the others were found

A scan of `server/routes`, `server/api`, `server/services`, `server/src` and `server/middleware` (3,290 files) for
a `connect()` whose block, up to its `release()`, holds no `BEGIN`, no `setTenantContext` and no `set_config` of
the tenant, and which runs a query or passes the connection on. It reported 30 blocks. Read one by one:

- the eleven above: fixed;
- `src/routes/stability.router.ts` (3), `protocol-signature-manifestation.ts`, `rbm-assessment-seed.ts`,
  `site-risk-engine.ts`, `vault/document-catalog-governance.service.ts` (2), `lazyRequestDbClient.ts`: set the
  tenant themselves, or begin a transaction in the function they call. Not defects;
- `submission-orchestrator-continuation.ts`: takes an advisory lock only, no tenant table;
- `ana/turn-record.ts` `reconcileTurnRecord`: its pool is the request's connectable, whose `connect()` returns the
  request's scoped connection (`requestDb.ts`). Not a defect;
- `cognitive-ecosystem/agent-runtime.service.ts` (3), `innovation/submission-readiness-twin-service.ts` (2),
  `cortexComplianceService.ts`, `src/services/reg/evidence.ts`: outside the launch catalog (RULE 2 gives the
  digital-twin and self-evolving engines no sessions). Not read further and not changed.

## Verified

Red first.

| What | Where | Result |
|---|---|---|
| The six routes | `server/routes/__tests__/review-reads-take-no-bare-connection.test.ts`: `connect()` is refused, and each reader probes the executor it was handed | Before: 6 fail (500, "a read took a bare pool connection"). After: 6 pass, no connection taken, the probe arrives on the scoped path |
| The five AnA handlers | `server/services/ana/__tests__/review-tools-take-no-bare-connection.test.ts`, the same way | Before: 5 fail. After: 5 pass |
| The suites around them | 53 files: the research routers, the IRB, IACUC, IBC, nonclinical, agency-meeting, disclosure and effort services, the AnA tool suites | 539 pass |
| Lint ratchet | `check-eslint-warning-ratchet.mjs --since HEAD` | No file changed its warning count |

**In the running app**, as the runtime role with row security enforced, signed in as the Lumen lead. One record of
each kind was created through its own route, then read:

| Read | Before the fix | After |
|---|---|---|
| nonclinical send-readiness | 404 "Study not found for this organization." | 200, "Missing required SEND domain(s): TS, DM, EX, …" |
| IACUC completeness | 404 "Protocol not found for this organization." | 200, "Replacement (alternatives to animal use) is not addressed." |
| IBC containment | 404 "IBC registration not found for this organization." | 200, "No biological agents are registered." |
| agency-meeting readiness | 404 "Interaction not found for this organization." | 200, "Readiness is assessed once the meeting is scheduled; this one is planned." |
| a financial disclosure | 404 "Disclosure not found for this organization." | 200, the disclosure |

Effort validation was not walked: a statement needs a personnel record, which this database does not hold. Its
test covers it.

## Open

- **A gate.** The scan is a heuristic with nine known false positives. As a pre-push gate it would need a baseline
  with a written reason for each. Proposed to the coordinating session; not added here.
- **The mock.** Any suite whose pool mock gives `connect()` the executor `query()` uses is blind to this. The two
  new suites and the three IRB suites refuse or starve the bare connection; the others were not rewritten.
- **The four out-of-catalog services** above were not checked.
- HawkScan did not run: no `HAWK_API_KEY` in this environment.
