# D3 — governed decisions under the production posture, and a claim this effort had to take back

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-24. **Database:** PostgreSQL 16, provisioned from an empty
database by `install-fresh` + `deploy-migrate` at `e0e42ec4` (973 public tables;
both steps exit 0). The runtime connects as `app_service` — not superuser, no
BYPASSRLS — with `app.rls_enforce=on`; `decision_records` has RLS enabled and
FORCEd and is owned by `postgres`. See `posture.txt`, read from the catalog.

**What this is not:** the row's closing evidence. D3 closes on the contract
passing against staging with the production image, which is owed with D1. This
is the same contract, on a from-blank local install, in the same posture.

## Why governed decisions needed to be in the contract

`tests/db/two-tenant-application-rls.dbtest.ts` is the two-tenant isolation
contract D3 names. Its header says the domains it lists are the coverage number
and "adding to it is the work". Governed decisions were not in it, and in the
two days before this run three defects in their paths were found and fixed on
PGlite, which enforces no RLS:

- `f55dfcec` — the governed-document fabric had never persisted a decision
  (its vocabulary failed the table's CHECK constraints), and the control-plane
  *simulate* route recorded under a **request-body** organization.
- `e9739e91` — three read routes queried `organization_id = NULL` and always
  answered "0 decisions".

Neither had been tested where it matters for D3: through the app role, with the
policy enforcing.

## What the four new cases prove

Counts are read through the **owner** pool, which is exempt from RLS — counting
through the app role would be circular, because a row RLS hides looks exactly
like a row never written.

| Case | Asserts |
|---|---|
| 1 | Tenant A's recording evaluator persists A's decision through `app_service`. The recording is an un-awaited promise, so this also proves the tenant scope survives that hop. The id the fabric hands back is the row's id. |
| 2 | From tenant A's session, a decision the recorder files for tenant B does **not** land. |
| 3 | `POST /api/control-plane/governed/evaluate`, as A, naming B, returns a result and records nothing for either tenant. |
| 4 | A lists its decision and fetches it by the id the list returned (positive control); B lists nothing, gets 404 for A's id, and traces nothing for A's artifact. |

## The evidence

| File | What it shows |
|---|---|
| `posture.txt` | The catalog facts above: role flags, RLS/FORCE/owner on `decision_records`, its policy, and the two CHECK vocabularies. |
| `red/contract-at-e0e42ec4.txt` | The extended contract on the code as it stood: **21 of 23.** Case 1 persisted but failed its identity check (row `21ed2a4b…` vs handed-out `e72a249f…`); case 4: *"tenant A must be able to fetch its own decision by the id it was given: expected 404 to be 200."* |
| `green/contract-23-of-23.txt` | After the fix: **23 of 23** — the original 19 and the four above. |
| `red/mutation-A-rls-disabled-on-decision_records.txt` | RLS disabled on that one table, everything else unchanged. Case 2 fails: *"a decision filed for tenant B from tenant A's session must not land: expected 1 to be 0."* So case 2 detects a cross-tenant write, and without the table's policy the recorder does file one. |
| `green/mutation-C-pre-fix-route-contained-by-rls.txt` | The simulate route put back to the RECORDING evaluator, RLS on: **23 of 23.** The database refused the cross-tenant insert the old route issued. |

Every mutation was reverted and the table's `rls=true force=true` restored and
re-read before the green run.

## The new defect: two identifiers for one decision

The fabric returns a decision reference carrying `decisionId` before the insert
completes. The insert never used it — the row took `gen_random_uuid()` — and
`mapRow` reported `decision_context.governedDecisionId` as the id. The detail
route, `GET /governed/decisions/:decisionId`, looks up `WHERE id = $1`: the
other identifier. **Every decision the list returned answered 404 on fetch, to
every tenant, including the one that owned it.**

That made the isolation check worthless as well as the feature: "tenant B gets
404 for A's decision" proves nothing when tenant A gets 404 too. Case 4 adds the
positive control first, which is how this surfaced.

Fixed by making the recorder write the id it hands out as the row's primary key
(`CreateDecisionInput.id`, inserted as `COALESCE($16::uuid, gen_random_uuid())`,
so every other caller is unchanged). The only production caller of the recorder
passes `randomUUID()` on both paths, so the cast cannot fail on a non-UUID.

## The claim taken back

`f55dfcec` and ledger L181 said the simulate route, once recording worked,
"would let any caller … file a decision into another tenant's decision_records."
**Mutation C shows that is not true in the posture D3 requires.** With RLS
enforcing, the policy's `WITH CHECK` refused the foreign row. The claim holds
where enforcement is off for this table — mutation A — and that is not
hypothetical: `app.rls_enforce` is set only when `RLS_ENFORCE=on`, and D3 itself
is the row saying production has not yet been shown running that way. So:

- the app-layer fix stands, as defense in depth; the route no longer attempts
  the write at all, and that is proven **without** RLS by step 11c of
  `tests/golden-journeys/haq-correction.journey.test.ts`, where the old route
  "filed 1 decision(s) into org 2";
- this contract proves the **database** half, and on its own cannot tell the
  two route versions apart — mutation C passes — which is why both tests exist;
- under RLS the old route did not fail visibly either: the refused insert was
  swallowed by the recorder and the route answered 200. That is L185's class —
  a durable write whose failure no caller can see.

L181 is corrected to say this.

## Reproduce

```
# a disposable database provisioned by install-fresh + deploy-migrate with
# APP_SERVICE_DB_PASSWORD set, then:
TEST_DATABASE_URL=<owner url> APP_DATABASE_URL=<app_service url> \
  npx vitest run --config vitest.db.config.ts tests/db/two-tenant-application-rls.dbtest.ts
```

The suite fails closed without a database and defaults to `RLS_ENFORCE=on`
(`tests/setup.db.ts`).
