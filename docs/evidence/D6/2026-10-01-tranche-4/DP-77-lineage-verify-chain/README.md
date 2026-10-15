# DP-77: a member's lineage chain check is their organisation's, not the estate's

Date: 2026-10-01 (evening). Lane: D6 (security tranche 4). Found by the security-auditor review of this evening's
commits (finding 3: a second door of IAM-26). Re-read at head and shown failing before it was changed.

## What was wrong

`GET /api/decision-lineage/verify-chain` and `GET /api/decision-lineage/compliance-report`
(`server/routes/decision-lineage.ts`, mounted behind `authenticateToken` only) ran `auditService.verifyChain()` for
any signed-in member. That is the estate verifier of the Part 11 store: `SELECT *` over every organisation's rows of
`audit.tamper_proof_log`, and on a valid chain a platform row appended to the one global chain under its lock. So:

- each call loaded the whole store into the API process and wrote a row: a cost that grows with every organisation's
  history, at any member's request;
- a break anywhere was reported, with its sequence number, to every organisation;
- the compliance report of a caller with no organisation counted every organisation's decisions.

IAM-26 closed the same thing at `GET /api/c2c/actions/verify-chain` on 2026-10-01; this was the second door. The
route is outside the launch catalog, so production refuses it while launch scope is enforced (the production default);
it is reachable wherever enforcement is off. 21 CFR 11.10(e); GDPR Art. 32.

## What changed (`server/routes/decision-lineage.ts`)

One function, `chainVerdictFor(req)`, decides the verdict both handlers give, by IAM-26's rule:

- a platform administrator (`resolvePlatformAdmin`, the guard's own answer) gets the estate verdict, as before,
  `scope: 'estate'`;
- everyone else gets their own organisation's chain verdict (`verifyTenantChainOnAdminScope`, the one the ledger
  states), `scope: 'organization'`, a break named only through `breakForTenant`, nothing written; an anchor that cannot
  be read is `UNVERIFIABLE` (503), not a verdict;
- a caller with neither an organisation nor the platform role is refused 403 `ORG_REQUIRED` by both handlers.

The responses gain `scope`, so a reader knows whose chain the verdict is about. The DecisionLineage surface reads the
response through a plain interface; the added field changes nothing there.

## Tests

| Test | Red (head) | Green |
|---|---|---|
| `server/routes/__tests__/decision-lineage-verify-chain-scope.test.ts` (new, 7 cases): a member gets their organisation's verdict and the estate verifier does not run; a break is reported without naming another organisation's row; an unreadable anchor is 503 `UNVERIFIABLE`; no organisation is 403 with nothing run; a platform administrator gets the estate verdict; the compliance report states the organisation's chain without the estate verifier; no organisation gets no report | `red/decision-lineage-verify-chain-scope.txt`: 7 failed. The administrator case fails at head only on the new `scope` field: the estate verifier ran for it as it does now | `green/decision-lineage-verify-chain-scope.txt`: 7 passed |

Neighbours: `green/neighbour-units.txt`, every suite naming the lineage routes or service, the tenant chain verdict or
a verify-chain door (14 files), 172 passed. ESLint: `decision-lineage.ts` 2 warnings, as at head; the new suite 0.

## What remains

- Whether the platform should keep a lineage chain check a tenant can run at all is the surface's question: the
  surface is outside the launch catalog.
