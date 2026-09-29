# Second attempt, 2026-09-27/28: at `af305e8a`, after F-41, F-42 and the protocol changes

IQ-001 and all six OQ protocols executed at `af305e8a`. That commit carries:
- F-41 (`f339a445`, `81eb7491`) and F-42 (`af305e8a`);
- OQ-004 v0.4, OQ-001 v0.9, URS-001 v0.6, URS-004 v0.2;
- the harness waiting out the sign-in limiter.

Same installation and identities as `../README.md`. The server posture was
that of 2026-09-23c, with the auth boundary in its non-production default.

| Protocol | Pass | Fail | Deviation | Not executed |
|---|---|---|---|---|
| IQ-001 | 12 | 0 | 3 | 0 |
| OQ-001 Projects | 19 | 1 | 0 | 0 |
| OQ-002 Vault | 12 | 0 | 0 | 0 |
| OQ-003 Authoring | 23 | 0 | 1 | 0 |
| OQ-004 Submission Center | 14 | 1 | 0 | 0 |
| OQ-005 Submission Readiness | 10 | 0 | 1 | 0 |
| OQ-006 QMS controlled documents | 13 | 1 | 0 | 7 |

The first attempt's failures are gone:
- OQ-PROJ-18 passed: the refusal is on the organisation's ledger (F-41).
- OQ-PROJ-06b passed: the creation entry names `user:1` (F-42).
- OQ-SUBC-04 passed, with another project's document refused 409
  `CROSS_PROJECT`.

The sign-in limiter refused OQ-PROJ-19's own sign-in. The harness waited for
the window the server named (797 s), said so in the transcript and signed in
once more. Three failures remain; none is a defect of the product as it runs
in production.

## OQ-PROJ-19: `SESSION_ENDED`, not `SESSION_IDLE`

After 65 seconds idle, the step's own session was refused 401
`SESSION_ENDED`, where the step expects `SESSION_IDLE`. Reproduced on a
fresh server both ways:
- the boundary in warn mode, the non-production default: `ENDED`
  (`idle-probe-boundary-warn.txt`);
- the boundary enforcing, as production does: `IDLE`
  (`idle-probe-boundary-enforce.txt`).

The cause is the auth boundary's warn mode (`server/middleware/authBoundary.ts`):
1. It authenticates every `/api` request with `authenticateToken`, captures a
   refusal, logs it, and passes the request on.
2. `authenticateToken` revokes an idle session's token as it refuses it
   (`server/middleware/auth.ts`, P1-1).
3. The global gate's authenticator then finds the token revoked and answers
   `ENDED`.

In production the boundary enforces, and the first authenticator's answer,
`IDLE`, is the one sent. The final execution therefore runs the boundary
enforcing (`AUTH_BOUNDARY_MODE=enforce`), as production does; OQ-001 v0.9 §1
records it.

Two things are handed to D6 (VSR-001 §18.4):
- a warn-mode pass has a side effect;
- once the first answer has revoked the token, later requests of the same
  idle session read `ENDED`.

## OQ-SUBC-08 and OQ-QMS-05: the second signer's session had ended

Both refused: "signer identity … could not open a session: session
validation failed after password+totp". The 7 QMS steps that depend on
OQ-QMS-05 were not executed.

What happened:
- `run-all.mjs` signed the second signer in when the run started, for the
  whole run.
- Its first use (OQ-SUBC-08) came after the 797-second wait. Since P1-1
  (2026-09-26), a session left idle for fifteen minutes has ended.
- `sharedSession` raised instead of letting the step sign in again.

Two harness changes follow, in the commit after this one:
- An ended shared session is treated as no session, and the caller signs in
  again.
- `run-all.mjs` no longer signs the signer in up front, so it signs in when a
  step first needs it. That also takes OQ-001 to ten sign-ins from one IP in
  its first fifteen minutes, within the limit, so the final execution should
  not wait.
