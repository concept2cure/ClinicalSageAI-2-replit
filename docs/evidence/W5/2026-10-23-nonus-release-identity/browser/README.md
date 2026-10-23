# Existing non-US release renewal UI — Chromium evidence

Executed 2026-10-23 with Node 22.23.3, installed Chromium, and Playwright.
All ten checks passed; no browser page errors. Source hashes were identical
before and after execution and are recorded in `result/result.json` as explicit
`{ path, sha256 }` entries. The final replay retains every source pin in that
representation, avoiding a filename-keyed hash being mistaken for a credential.

## What already exists

- The prior applicant identity browser fixture at
  `docs/evidence/MR-10/2026-10-21-applicant-identity/browser/` supplies the Vite,
  verified synthetic session, component, CSS, Chromium driver and hash-pinning
  pattern reused here. Its historical files and results are unchanged.
- `client/src/concept2cure/v2/surfaces/MarketApplicationNumber.tsx` already reads
  and displays the agency-assigned number for a market. This probe displays
  its actual EU and JP number components, with editing withheld.
- `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx` already renders
  `DispatchWorkspace`, its server-owned unsent renewal eligibility, independent
  signer requirement, generic re-sign label and governed dispatch callback.
  This probe mounts that actual component without rebuilding its behavior.

## Observed behavior

- EU and JP show their own synthetic market number and the existing re-sign
  control on explicit server eligibility. Clicking each invokes the existing
  governed callback with sequence 7, its actual region, and `dispatch`.
- Attempted, in-flight and unknown dispatch statuses with server refusal hide
  renewal; an unknown region with withheld server eligibility does as well.
- Missing server eligibility, a readiness outage, sequence authorship and an
  independently blocked dispatch gate hide renewal and invoke no callback.

`result/` holds five screenshots and structured results. `execution.txt` is the
actual driver output. The EU reachable and JP outage screenshots were visually
inspected after execution.

## Execution

From the repository root, with Node 22 on PATH:

```sh
node docs/evidence/W5/2026-10-23-nonus-release-identity/browser/server.mjs
node docs/evidence/W5/2026-10-23-nonus-release-identity/browser/check.mjs
```

The Vite server bound only `127.0.0.1:5198` and was stopped after qualification.
All API responses are explicitly synthetic and intercepted by this driver. The
probe observes the parent callback; it does not execute a signature ceremony,
persist an audit row, transmit bytes or establish agency acceptance. The real
backend and full sign-to-act UI chain are qualified separately in this packet.
Human witnessing remains unexecuted.
