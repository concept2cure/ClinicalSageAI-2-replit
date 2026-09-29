# P1-33: the `/ana` socket re-checks its session while it is open (IAM-19, Medium)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-19, raised by the 2026-09-26 weekly
security lens and re-confirmed open by the 2026-09-28 lens. **Plan item:** P1-33.

## What was wrong

The `/ana` duplex namespace (`server/services/ana/ana-realtime.ts`) checked the session at the handshake only:
- token class;
- liveness;
- membership;
- tenant state.

Every handler on that namespace can reach the AnA tool loop, which can write. After connect, nothing looked
again. So the following all kept a live channel into the tool loop for the rest of the token's lifetime:
- a member removed from the organisation;
- a session ended by sign-out, password change or revocation;
- an account taken out of use;
- a suspended tenant.

The main namespace has re-checked on a timer since P1-9 (IAM-12), using a private `startSessionRecheck` in
`server/socketServer.ts`.

## What is true now

- **The re-check is shared.** The timer, its three checks (`verifyLiveToken` with `activity: false`, live
  membership, tenant active) and its interval moved into `server/socket/sessionRecheck.ts`. The plan asked
  for this: "shared not copied". Both namespaces call it, so they cannot drift.
- **`/ana` runs it on every connection.** The handshake keeps the verified token on the socket for it.
- **An ending session is closed out.** The socket is told why (`session:ended` with the reason) and
  disconnected. The disconnect disposes the AnA session, which aborts any turn in flight.
- **Unreadable membership fails closed.** A membership that can no longer be read ends the session, as it
  does at the handshake.

## Evidence

- `red.txt`: the new test on the unfixed code. It fails 7 of 8. The eighth ("the timer stops on
  disconnect") passes trivially when there is no timer, and pins the cleanup once there is one.
- `green.txt`: after the fix, the new test, the `/ana` handshake and session tests, and the main namespace's
  own re-check test, which now runs through the shared module (4 files, 33 tests).
- `server/services/ana/__tests__/ana-realtime-session-recheck.test.ts`. Each of these is told why and
  disconnected within 60 s:
  - a revoked membership;
  - an unreadable membership;
  - an ended session;
  - an inactive tenant.
  It also pins the following:
  - the handshake token is re-verified without counting as activity;
  - a member in good standing is left alone;
  - the timer stops on disconnect;
  - an in-flight turn is aborted.

## Residual, recorded

The Hocuspocus collaboration socket (`server/services/hocuspocus-server.ts`) authenticates once, and it
has no re-check either. It is off by default (`ENABLE_COLLAB_CRDT`), and no deployment file turns it on,
so it is not live. It needs the same re-check before that flag is enabled for anyone.

**Closed 2026-09-28.** The collaboration socket now runs the same re-check. `sessionRecheck.ts` exposes
`sessionEndReasonFor` (token, membership, tenant, with the transport's own tenant rule) and
`startRecheckTimer`; `hocuspocus-server.ts` starts it in the `connected` hook and closes the
connection (4401) with the reason. Its tenant rule keeps a view-only connection for a read-only tenant and
ends a writable one, so it reconnects downgraded. Admission now also refuses a subject that is not a
platform user id, where it used to skip the membership check. Evidence:
`server/services/collab/__tests__/collab-session-recheck.test.ts` — 9 failed before the change, 9/9 after;
admission against a real token store stays in `collab-governance.pglite.integration.test.ts` (unchanged, green),
and the socket.io re-check suites are unchanged.
