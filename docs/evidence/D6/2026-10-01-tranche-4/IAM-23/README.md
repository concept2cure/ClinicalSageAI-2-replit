# IAM-23 — every JWT verifier applies the token-class rule

Found 2026-10-01 by the re-verification of the P0-2 residual. Four in-route verifiers checked only the signature, so a
refresh, pre-MFA challenge or connector token (same signature) was admitted: `server/middleware/tenantContext.ts`,
`server/routes/approval-workflow.ts`, `server/routes/contentAssembly.routes.ts` (SSE) and
`server/routes/cortex-unified.ts` (threads). Each now refuses a non-access token with `requireAccessTokenReason`, the
rule the main authenticator applies. `approval-workflow.ts` also lost its development fallback identity (a request with
no token was answered as user 1 of organisation 2).

`server/middleware/__tests__/token-class-every-verifier.test.ts` fails if any server file calls `verifyJwtWithRotation`
without the rule, except three named with a reason (the MFA-challenge and e-mail-verification readers check their own
class; `verifyLiveToken` is the shared primitive whose callers apply theirs).

| Check | Red | Green |
|---|---|---|
| the every-verifier contract | 6 files listed (`red/every-verifier.txt`) | passes; 20 neighbouring suites green after the cortex-threads fixtures gained `type: access` (`green/every-verifier.txt`). Its first case loads the router inside a 10 s limit and can time out under load; it passes on rerun, as on the old code. The smoke case "rejects invalid JWT on POST /api/cortex/chat" fails on the old code too |
