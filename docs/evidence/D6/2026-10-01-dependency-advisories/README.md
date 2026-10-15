# New high advisories cleared from the lockfile (row D6)

**Date:** 2026-10-01. **Found by:** the trunk CI check-in. Security Scan on run
12713 (`ca636c7f`) was red: `ci:dependency-risk` and the Trivy filesystem scan
both failed. No code change caused this. The advisories were published upstream.

## What was red

`red-gate.txt`: nine packages had unreviewed Critical/High findings.

| Package | Installed | Fixed in | Change |
|---|---|---|---|
| axios | 1.18.1 | 1.20.0 | `^1.20.0` (minor). The 1.20.0 advisories include ReDoS, prototype-pollution gadgets, and `maxRedirects: 0` not enforced by the fetch adapter. |
| nodemailer | 9.1.1 | 10.0.9 | `^10.0.9`, as both the dependency and the existing override. The major's only breaking change is "Node.js 20 or newer"; CI and production run Node 22. Version 10 ships its own types, so `emailService.ts` imports `Transporter` by name. |
| undici (transitive) | 7.29.0 | 7.29.1 | Existing override raised to `^7.29.1`, which resolves to 7.30.0. |
| brace-expansion (transitive) | 5.0.9 | 5.0.12 | Existing override raised to `^5.0.12`. |
| engine.io (via socket.io) | 6.6.9 | 6.6.10 | Lockfile update to 6.6.11, within socket.io's `~6.6.0`. |
| firebase, @firebase/firestore, @firebase/firestore-compat, @grpc/grpc-js | 12.17.1 / grpc-js 1.9.16 | none on firebase's line: firestore pins grpc-js `~1.9.0` | **Removed.** Nothing in the repository imports firebase. `git grep` finds only the `package.json` entry. It arrived in `065b5e3b8` (2026-06-03, a task-audit change unrelated to firebase). Removing it took 66 packages out of the tree. |

The dependency-risk ledger was resealed to the new lockfile with
`npm run ci:dependency-risk:reseal`. The reviewed finding set is unchanged:
only the two `image-size` advisories, both still assessed unreachable.

## Verified

- `green-gate.txt`: `ci:dependency-risk` PASS, with 4 occurrences, all reviewed.
- `tsc --noEmit`: 0 errors. The first run after the bump failed on
  `nodemailer.Transporter`. That reference is fixed, not suppressed.
- Under `tsx` (ESM) and `require` (CJS), nodemailer 10's default import yields
  `createTransport`, and a `jsonTransport` send returns a message id.
- The 26 test files that touch mail, notifications, sockets, realtime and
  retention pass (239 tests).
- `scripts/build-server.mjs` bundles the server (packages are external, so
  nodemailer loads from `node_modules` as tested above).

## Not checked here

The Trivy filesystem scan is not run locally. It reads the same lockfile at
CRITICAL/HIGH, so the next CI run is its check.
