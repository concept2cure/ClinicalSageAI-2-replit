# DP-26 — no browser session replay (ADR-0014 §3)

**Decision.** A session replay is a recording of a regulated screen sent to a third party. Masking
(`maskAllText`, `maskAllInputs`, `blockAllMedia`, stated since P1-27 on 2026-09-26) changes what the
recording shows, not that it is made and sent. Error reports and traces stay; recordings go.

**Change.** `client/src/utils/sentry.ts`: the `replayIntegration` and both replay sample rates removed.
The scrubbers (`beforeSend`, `beforeBreadcrumb`) and `sendDefaultPii: false` are unchanged.

**Red first.** `client/src/utils/__tests__/sentry-init.test.ts` now asserts no replay integration and no
replay sample rate. Against the previous `sentry.ts` it failed (`red/sentry-init.txt`: the replay spy was
called once with the masking options); after the change it passes (`green/sentry-init.txt`, 3/3).
