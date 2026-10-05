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

## The agency gateway — fixed the same day

Found while building the warning above and first handed on to the Package-model
spine lane. That lane last touched these files on 2026-10-01, and this repo's
convention passes a held file's findings to its lane only until 24 hours have
passed; its sweep (`docs/evidence/W5/2026-09-30-package-spine-sweep/`) did not
track signer independence. So it was fixed here, narrowly.

**The defect.** `POST /api/mdx/gateways/:region/:gateway/transmit` →
`executeGovernedTransmit` re-authenticated the human and recorded their declared
meaning, but never asked whether they were independent of the package, and the
form offered "Authorship — I authored this package". Whoever assembled a package
could transmit it to FDA themselves, under any meaning.

**The fix**, through the same canonical check as the submissions spine, so the
two paths to an agency cannot disagree about who may release:
- `separation-of-duties.ts` — `SINGLE_AUTHOR['submission-package']`: the
  package's `created_by_id`, tenant-scoped.
- `governed-transmit-checks.ts` — `assertTransmitterIndependent`: refuses an
  authorship meaning (`AUTHORSHIP_NOT_A_RELEASE`, 422) before any lookup; the
  creator (`SIGNER_IS_AUTHOR`, 403); a package with no recorded creator
  (`SIGNER_INDEPENDENCE_UNRESOLVED`, 409); a failed lookup fails closed as an
  internal error.
- `governed-transmit.ts` — called as the **last check before sending**, not the
  first. First placement made a foreign or missing package read "no creator
  recorded" instead of its own refusal; the existing cross-tenant test caught
  it, and moving the call made those refusals keep their codes.
- `GatewayTransmittals.tsx` — the transmit form no longer offers "Authorship".
  The rejection-record form keeps it: recording an agency's notice is authorship.

**Falsification.** Check not called → the two membership cases (unit) and the
two route cases fail; authorship allowed → 2 fail; creator allowed through → 2
fail. 16 transmit suites, 337 tests pass; `tsc` exit 0.

Two harnesses answered every `FROM c2c_submission_packages` query with a
metadata row and never modelled a creator; they now answer the creator lookup
with a colleague (4242) of the acting user (777), and a route case pins the
creator refusal. Two unit suites that test the signature record, not
independence, model the signer as independent; independence is tested in
`governed-transmit-independence.test.ts`. One unrelated failure seen while
running these, `transmit-guard-reports-checks.test.ts` (tenant-RLS fail-closed
under `RLS_ENFORCE=on`), fails identically without this change.

## Handed on

**AnA-created packages have no recorded creator, so they now cannot be
transmitted** — refused with `SIGNER_INDEPENDENCE_UNRESOLVED`, never guessed.
`server/services/ana-ri/command-executor.ts:1969` inserts into
`c2c_submission_packages` without `created_by_id`; the HTTP route
(`submission-ops.ts:267`) sets it. The fix is one column: `created_by_id` =
`ctx.userId`. That file was changed at 2026-10-05 02:14 by another lane, inside
its 24-hour window, so it is that lane's until then. Before launch (D1 is not
green) this is a refusal with a reason, not a silent pass.

Also still open: no per-org setting exists to tighten separation of duties
("admin may tighten" has no mechanism), and Gateway Transmittals has no
advance warning like the Dispatch tab's — the creator learns at the refusal,
which now says why and that a colleague must transmit.
