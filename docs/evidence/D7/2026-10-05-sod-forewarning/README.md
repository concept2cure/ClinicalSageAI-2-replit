# Separation of duties on the release path: the bypass closed, and the creator told in advance

**Rows:** D5 (Part 11 independence), D7 (the governed path to one real sequence).
**Date:** 2026-10-05. **Asked by the founder:** "make these pop up warnings or
reminders … in the correct place and time."

## The warning asked for

A sequence's creator cannot sign its freeze or dispatch (separation of duties,
`assertSignerIsNotAuthor`). For a two-or-three-person regulatory team, the
creator found that out only after opening the signing dialog and typing a
password and second factor — the server refused afterwards.

Now:

- `GET /sequences/:seqId/dispatch-readiness` also returns `signer` — whether
  THIS user may sign, from `resolveTargetAuthors`, the same lookup the sign step
  enforces (not a client copy). `independent | author | unresolved | unverified`;
  a failed lookup is `unverified`, never `independent`.
- The Dispatch tab shows the warning **from the moment the sequence exists**
  (draft onward, until dispatched), so the team can arrange the signer before it
  is needed: *"You created this sequence, so you cannot sign its freeze or
  dispatch. Separation of duties requires a different colleague with signing
  rights to sign both steps — arrange who that is before the sequence is ready."*
- The Freeze and Dispatch buttons are not offered to someone the server will
  refuse. `unresolved` (no creator recorded) says nobody can sign. `unverified`
  hides nothing and says the check runs again at signing.

Chosen over an AnA reminder: the tab is where the step is taken, it is shown to
whoever opens the sequence, and it needs no model — the verdict is the
deterministic server lookup (RULE 2: the model narrates, it does not decide).

## The bypass found while building it — BLOCKER, fixed

The Freeze/Dispatch signing dialog offered every §11.50 meaning, including
**"Authorship"**. The sign route skips separation of duties for an authorship
meaning (`requiresIndependence` — correct for a document author signing as
author). Gate 1 (`governedSignatureVerdict`) checked the declared step, never the
meaning, and the release resolver accepted the signature. So the sequence's
creator could pick "Authorship" and **release their own submission** — the one
guarantee recorded in the 2026-10-05 decision (`separation-of-duties.ts`,
`SINGLE_AUTHOR['ectd-sequence']`).

Fixed at the step, so it holds for any client:
- Gate 1 refuses a freeze, dispatch or transmit signature whose meaning is an
  authorship meaning (via the canonical `requiresIndependence`; "author" and
  "Authorship" both caught).
- The dialog no longer offers it: freeze `approval | responsibility`, dispatch
  `release | approval | responsibility`.

## Falsification

| Probe | Result |
|---|---|
| Gate 1 refusal removed | 2 failed / 19 passed — exactly the two authorship cases |
| `!cannotSign` button guard removed | 3 failed |
| creator notice removed | 2 failed |

The authorship cases also assert the same sequence freezes and dispatches on an
approval/release meaning, so the refusal is specific, not blanket; a signature
recording no meaning is unchanged (it was checked for independence when signed).

## Results

- `freeze-gate-binding.pglite.test.ts` 21 passed (real freeze/dispatch path, PGlite)
- client dispatch/freeze/honesty suites 31 passed
- `tsc --noEmit` exit 0, no errors

## Handed on — not fixed here (lane held)

**The agency gateway's transmit runs no separation-of-duties check at all.**
`POST /api/mdx/gateways/:region/:gateway/transmit` → `executeGovernedTransmit`
(`server/services/submission-gateways/governed-transmit.ts`) re-authenticates
and records the declared meaning, but never calls `assertSignerIsNotAuthor`, and
`GatewayTransmittals.tsx` offers "Authorship — I authored this package". So
whoever assembled a package can transmit it to FDA under any meaning. That path
is the **Package-model spine** lane (claimed 2026-09-24, D7). Removing the
"Authorship" option alone would hide the gap, not close it; the fix belongs with
an author source for the package (assembler) and the check in the service.

Also still open from 2026-10-05: no per-org setting exists to tighten
separation of duties ("admin may tighten" has no mechanism).
