# D4 / D7: three Lint guardrails that went red on trunk this evening, cured

**Row:** D4, with D7 for the gateway account choice. **Lane:** `…session_01JNRgCKWRqqJxZ1cJCyxoor`. These turned up in a
full Lint-guardrail sweep run to check the analytics-export change (`docs/evidence/D4/2026-10-01-analytics-export/`).
Each was under three hours old and inside its lane's window, and each was still red on trunk at 20:40 UTC. They are
fixed under the founder's instruction of 2026-10-01, and the edits are disclosed on the board.

| # | Guardrail | Cause | Cure |
|---|---|---|---|
| 1 | `ci:tenant-isolation:no-regression` (9 against a baseline of 8) | `48c430139` (`…01WcyqbqWn`, 20:02): `pgliteSeed` in `server/services/authoring/__tests__/authoring-read-fixture.ts` resets its test database with `DELETE FROM … projects` | A `tenant-isolation-safe:` marker with its reason: the statement empties the test's own in-memory PGlite database before seeding it. This is the gate's documented remedy for a statement that is correct without a tenant predicate. |
| 2 | `ci:audit-logs-fixture` | `5e9d39be4` (`…015oLV2v`, 17:57): the purge-coverage self-test declares a three-column `audit_logs` | The fixture declares every column `writeChainedAuditRow` writes. The self-test needs only the table's name and `organization_id`, so nothing else changes. The fixture gate was not given an exception: extra columns cost nothing. |
| 3 | `ci:launch-scope-api` | `723395ed4` (`…01J935DZ`, 19:30): `GatewayAccountsSetting.tsx` calls `/api/gateway-accounts`, which no surface or platform entry claims ("unmapped") | Declared on `LAUNCH_PLATFORM_API` with its reason. The setting is shown in admin Setup and in an onboarding step every organisation passes through, so binding it to one surface's module (`gateway-transmittals`) could refuse it at onboarding to an organisation without that module. `/api/organizations` and `/api/mdx/industry-profile`, written by Setup and onboarding, are declared the same way. Production refuses an unmapped path once unattributed-path enforcement is `enforce`. Until then the path is recorded as would-refuse. |

## Proof

| File | |
|---|---|
| `red/1-tenant-isolation.txt`, `red/2-audit-logs-fixture.txt`, `red/3-launch-scope-api.txt` | Each gate on trunk `07ced1367`, exit 1, naming exactly the file above. |
| `green/ci-tenant-isolation-no-regression.txt`, `green/ci-audit-logs-fixture.txt`, `green/ci-launch-scope-api-selftest.txt`, `green/ci-launch-scope-api.txt` | Exit 0. |
| `green/2b-purge-coverage-selftest.txt` | The self-test whose fixture changed, against real PostgreSQL: 20 passed, "the gate fails on what it exists to catch". |
| `green/4-neighbour-suites.txt` | The suites that use the authoring PGlite fixture, plus the entitlement and launch-scope suites: 16 files, 344/344. |

Each fix is the only change between its red and its green. `npm run typecheck`: 0 errors.

A proof-tier failure in the same sweep was not a code result. The machine has 15 GB, and the typecheck and the
proof tier ran together and ran out of memory (exit 137). Run alone, the proof tier exits 0.
