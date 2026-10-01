# D4 / D1 — six trunk Lint guardrails red: five cured here, at the cause

**Row:** D4 (CI is the OQ evidence base; a red guardrail hides the next regression), with D1 for the Compose contract.
**Lane:** `…session_01JNRgCKWRqqJxZ1cJCyxoor`, under the founder's instruction of 2026-10-01 ("everything is yours to
fix… regardless if it's yours or not"). Every guardrail step of CI's Lint job was run locally against trunk `4c9a73fd0`
(16:20 UTC). Six were red; three of them had been handed to their lanes on the board at ~15:00 and were still red.
Each edit below is inside another lane's 24-hour window, and is disclosed on the board.

| # | Guardrail | Cause | Cure |
|---|---|---|---|
| 1 | `audit-requestdb-coverage --strict-no-regression` | `governed-signed-act.ts` (P0-10, `ae36f2c81`), the signing ceremony behind twenty domain routes, opened its transaction with `pool.connect()` | The transaction runs on the request's own connection, `requestPgClient(req)`, which the auth boundary pins with the tenant's session variables for every authenticated request. No second pool slot per signature; a request with no tenant connection refuses instead of signing on a shared one. |
| 2 | `ci:unbacked-tables` | `extract(epoch FROM last_seen_at)` in `session-inactivity.ts` (`77e11b07d`) read as a table named `last_seen_at`. The second time: on 09-26 (`0fec61dd8`) the same misreading was answered by rewriting the SQL to `date_part` | The parser suppresses a FROM preceded by `EXTRACT(<field>`, the narrow lookbehind it already uses for `FOR UPDATE` and `IS DISTINCT FROM`. Two baseline entries were the same phantom (`created_at`, `publication_date`) and are removed with two that no longer reproduce (`document_approvals`, `user_roles`): 27 → 23. |
| 3 | `ci:compose-boot-contract` | The AWS preflight list, which the contract derives from, grew past the server's boot contract: `DB_AUDIT_REQUIRED` (`385e6fc58`) and the connector's three names (`42842480f`) | `COMPOSE_EXCUSED`, each with its reason: `DB_AUDIT_REQUIRED` is read only by `deploy-migrate` and the Compose database image has no pgaudit; the connector is optional at boot (`server/index.ts:120`), on for the hosted deployment by decision P-2, opt-in for a self-host. A stack that turns the connector on must carry its allowlist. An excusal the preflight no longer needs fails the gate. |
| 4 | `ci:ana-surface-context` | `conversation-thread` became grounded on 10-01 by embedding `DocumentWorkbench` (`cf4aa7800`, `4c8b5534d`) but kept its "needs no context" exemption | Exemption deleted; `ID_BASELINE` 115 → 116. |
| 5 | `ci:unkeyed-request-tables` (+ its self-test) | Two stale entries (`audit.tamper_proof_log`, `vault.document_archives`, both keyed today), and behind them a finding the stale-entry failure masked: `public.audit_log_archives`, read by `chain-anchor.ts` (`735ba0a74`) | Stale entries removed; `audit_log_archives` recorded as **exempt** with its reader and role: the archive door's ledger spans tenants by design, and its one reader is the integrity sweep under `runWithSystemTenantScope`, reading an aggregate. |
| 6 | `ci:surface-text-ramp` | Four new tinted selectors (`.dcv-outline-item`, `.vd-cmp`, `.vd-fix`) | Regenerated on trunk by `c0ca5b2c6` while this was being pushed; this lane's regeneration was byte-identical and dropped out at rebase. Green on the rebased tree. |

`ci:tenant-entry-points`, red earlier today, was already green on trunk (another lane rebaselined it).

## Proof

| File | |
|---|---|
| `red/1-requestdb-trunk.txt` | The gate on trunk's ceremony: 1 new shared-pool route, `governed-signed-act.ts`. |
| `green/1-sign-ceremony-dbtests-runtime-role.txt` | `research-admin-sign-ceremony` + `domain-sign-ceremony` against a deploy-migrated database, as `app_service` with RLS on, through the real `authMiddleware`: **91/91**, including "a domain refusal after the credential rolls the whole sign back". |
| `red/1-mutation-no-request-connection.txt` | With the ceremony denied the request connection: 13 cases fail — every successful signature and the rollback case — so the dbtests go through this path. |
| `green/1-sign-ceremony-unit.txt` | `domain-sign-ceremony.routes.test.ts`: 62/62. |
| `red/2-unbacked-tables-trunk.txt` | `last_seen_at` reported as a table nothing creates. |
| `green/2-unbacked-tables-probe-still-catches-real-from.txt` | Two probe statements, `SELECT extract(epoch FROM t.created_at) … FROM probe_table_nothing_creates t` and the upper-case spelling: both real tables still reported, exit 1. The probe file was deleted. |
| `red/3-compose-boot-contract-trunk.txt` | 8 problems: the four names absent from both stacks. |
| `red/3-compose-mutation-*.txt` | With the allowlist rule removed, and with the stale-excusal check blinded, the self-test fails on exactly the new case. |
| `red/4-ana-surface-context-trunk.txt`, `red/5-unkeyed-tables-trunk.txt`, `red/6-surface-text-ramp-trunk.txt` | Each gate on trunk. |
| `red/5-unkeyed-tables-masked-finding.txt` | With the stale entries gone and no entry for it, the gate names `public.audit_log_archives`. |
| `green/all-gates-after.txt` | All nine commands exit 0. |

`npm run typecheck`: 0 errors with the change.

## Still red, not cured here

- `ci:check-pdf-runtime` — three new PDF writers in `server/services/report-os/pdf/` (`ca360a24e`, `bc5d6dae0`, Reporting lane
  `…015oLV2v`, 15:06 and 16:06 UTC) import pdfkit directly instead of `server/services/pdf-converter.ts`. Whether they
  join the APPROVED list (as the eCTD leaf renderer did, for byte-determinism) or route through the converter is a design
  decision with its own proof; next in this lane.

## Follow-up, same day: the proof tier's deploy-frontend contract

`tests/schema-contract/deploy-frontend-after-api.contract.test.ts` (Lint's proof-tier step) was red from 08:02 UTC: P1-12
(`8060c28bc`) made `deploy-frontend` also need `ci-verdict`, the deploy-time check that the SHA's CI passed (decision
P-3), and the contract's scenarios carried no verdict, which its model reads as `skipped`. The workflow is right; the
contract was stale. Every scenario now carries a green verdict, the test-failure case states its own, and two cases pin
the gate: a red CI verdict publishes nothing, on a full release or a frontend-only dispatch.

| File | |
|---|---|
| `red/7-deploy-frontend-contract-trunk.txt` | On trunk: 2 of 8 fail, the two publishing cases. |
| `green/7-deploy-frontend-contract-after.txt` | 10/10. |
| `red/7-mutation-verdict-dropped-from-condition.txt` | With `needs.ci-verdict.result == 'success'` removed from the workflow's condition, exactly the two new cases fail. |

This also confirms that P-3's deploy gate (deploy only a commit whose CI is green) is in `deploy-aws.yml`.
