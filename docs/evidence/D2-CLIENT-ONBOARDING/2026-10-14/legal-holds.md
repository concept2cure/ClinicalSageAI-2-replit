# D2 client onboarding: reachable legal-hold administration

Workstream: W2, client onboarding and administration. Branch: `concept2cure-v2`.

The mounted Vault preservation routes had no v2 UI controls. Admin → Setup now renders `LegalHoldsCard` beside the existing retention-period card. It reuses that card's `txw-set-*`/`txw-row` classes, the canonical `C2CForm` drawer, the canonical `GovernedConfirmDialog`, Lucide icons and the existing tokens. No dependency, new surface id, CSS pattern or alternate persistence path was added.

## Data and authority contract

| Request | UI action | Accepted result |
| --- | --- | --- |
| `GET /api/vault/legal-holds` | Read and filter active/all holds | `{ holds: [...] }`, a maximum of 500 rows, active first |
| `GET /api/regulatory-programs?limit=200` | Choose a named project | The tenant-scoped regulatory program register; the displayed cap is explicit |
| `GET /api/c2c/project-vault/:projectId` | Choose a stored document version | Only actual uploaded Vault documents; authored sections are excluded. Truncated upload windows and unavailable registers are disclosed |
| `POST /api/vault/legal-holds` | Place a project or document hold | An actual active hold matching the chosen scope and target |
| `POST /api/vault/legal-holds/:holdId/lift` | Lift a named active hold | An actual lifted hold matching the selected hold id |

The server retains its existing authority policy: organization owner, administrator or manager, plus an authorized platform administrator with tenant context. No organization id is accepted from the form. The server rechecks tenant ownership, validates the reference and recorded reason, and writes each mutation with its chained audit row in one transaction. An audit failure rolls back the mutation. A failed ownership read is now caught and returned as `HOLD_WRITE_FAILED`, without opening a transaction or leaking database errors.

The list's optional `targetLabel` and `targetProjectLabel` are stored project names and Vault document titles/file names. Both joined records carry an organization predicate. Damaged foreign target ids therefore produce unavailable names, never foreign names. Historic missing names have an honest fallback; UUIDs are kept in the governed confirmation's resource metadata instead of replacing project/document names in the list.

## Failure and interaction behavior

- Failed, malformed and unprovisioned reads do not render an empty register or offer preservation controls. Authority refusals retain the server's words.
- A create validates its recorded reason, locks duplicate submission and dismissal while pending, preserves a refused draft and confirms only the accepted server record. A malformed successful response is explicitly unconfirmed.
- A lift requires a recorded reason and the typed word `lift`. Cancellation sends no mutation. A refusal preserves the active row and entered reason. Successful mutations reread the register.
- Switching projects invalidates a document selection that is not among the new project's loaded uploads. The server remains the final ownership authority.
- These controls administer record preservation; they do not assert a compliance verdict, an electronic signature, an approved document or production deployment.

## Evidence

`legal-holds-tests.txt`: six targeted Vitest suites, **60 passing tests**. The suites exercise create/lift requests, reason validation, pending locks, unavailable reads, stale document choices, Setup reachability, retention/Setup regressions, transaction/audit rollback and the production API attribution gate. The PGlite suite executes the actual joined list SQL and demonstrates exclusion of foreign holds and prevention of name disclosure from corrupt foreign project/document ids.

`legal-holds-negative-mount.txt`: the new Setup reachability test was run with only the `LegalHoldsCard` mount temporarily removed. It failed (`expected null not to be null`, exit 1). The mount was restored and the six-suite run passed.

`legal-holds-lint.txt`: targeted ESLint, `--max-warnings=0`, exit 0. `git diff --check` also passed.

Commands:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run \
  client/src/concept2cure/v2/__tests__/adminLegalHolds.test.tsx \
  client/src/concept2cure/v2/__tests__/adminSetupGoverned.test.tsx \
  client/src/concept2cure/v2/__tests__/adminSetupRetentionPeriod.test.tsx \
  server/routes/__tests__/vault-legal-holds.test.ts \
  server/routes/__tests__/vault-legal-holds-launch-scope.test.ts \
  server/routes/__tests__/vault-legal-holds-labels.pglite.integration.test.ts --reporter=dot

npx eslint \
  client/src/concept2cure/v2/surfaces/LegalHoldsCard.tsx \
  client/src/concept2cure/v2/__tests__/adminLegalHolds.test.tsx \
  server/routes/vault-legal-holds.ts \
  server/routes/__tests__/vault-legal-holds.test.ts \
  server/routes/__tests__/vault-legal-holds-launch-scope.test.ts \
  server/routes/__tests__/vault-legal-holds-labels.pglite.integration.test.ts --max-warnings=0
```

Visual verification and production deployment are not claimed by these automated checks. The control-tower workstream owns the consolidated browser/build/release gates.
