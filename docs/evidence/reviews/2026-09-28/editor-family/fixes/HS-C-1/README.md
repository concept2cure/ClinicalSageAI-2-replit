# HS-C-1 — a protocol read that could not be read was shown as "no protocol"

**Finding:** periodic review 2026-09-28, editor family, honest-state lens,
ProtocolDev (medium, confirmed by its verifier).

## What was wrong

`ProtocolWorkspace` read `GET /api/protocol-dev` through `useLiveRows` with no
shape guard. A 200 whose body was not the read model therefore became rows
that were not protocols:
- `{}`, an envelope around an object, or an error carried on a 200 unwrapped
  to no rows, and the surface said **"No protocol in development"** and
  offered **Start a protocol**;
- a row with an id and nothing else, or with `sections` and
  `completenessFindings` present but null, reached the readiness gate, which
  computed **"Ready to finalize"** from findings it never received.

A store that is not provisioned (`meta.pendingStore`, which the route sends at
`server/routes/protocol-dev.routes.ts:43`) was shown the same way as an
organisation with no protocol, with a Start button that could not work.

## The change

`client/src/concept2cure/v2/surfaces/ProtocolDev.tsx`:
- `isProtocolReadModel`: every row must carry an `id`, and array `sections` and
  `completenessFindings`. Anything else is reported by `useLiveRows` as a
  failed read, "Couldn't load the protocol". An empty array still passes; that
  is the honest empty state.
- `isPendingStore({ meta })`: "Protocol authoring isn't set up on this
  installation", with no Start button.
- The error hint says that a failed read is not the same as having no
  protocol.

## Shown failing first

`client/src/concept2cure/v2/__tests__/protocolDevSurfaceWrites.test.tsx`,
describe "a protocol read that cannot be read is not an empty register
(HS-C-1)": six malformed bodies, each expected to read "Couldn't load the
protocol" and never "No protocol in development", "Ready to finalize" or
"Start a protocol"; and a pending-store case.

- `red-vitest.txt`: before any change, the five cases then written fail.
- `red2-vitest.txt`: the first guard checked only that rows were objects with
  an id. Its verifier showed null fields passing it, so two cases were added;
  both fail against that guard.
- `green-vitest.txt`: the ten ProtocolDev client suites, 211 of 211.
- `mutants.txt`: three mutants, each caught.
  - Guard checks the id only: two cases fail.
  - Pending-store branch removed: its case fails.
  - Guard not passed: six cases fail.
