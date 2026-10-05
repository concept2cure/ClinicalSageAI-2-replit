# P11-28b — an IND/NDA/BLA/MAA sequence can be dispatched from the Submission Center

**Rows:** D7 (the dispatch step on the path to one real sequence), D5 (the ceremony).
**Finding:** `docs/evidence/reviews/2026-09-28/ectd-lane-second-pass/part11-ux.md`, P11-28b.
**Date:** 2026-09-28.

## The defect

The Dispatch button read `gate`, which for IND/NDA/BLA/MAA requires a §11.70
release signature to already exist. On the submissions spine the signature it
accepts is the sequence's own dispatch-intent signature — recorded by the
Dispatch click itself (`runGoverned` signs, then dispatches). So the only
control that creates the signature was hidden until the signature existed. No
such sequence could be dispatched from the product's own screen; D7's test
sequence (an IND, for a biotech sponsor) could not get past `frozen`.

## Why the fix is on the server

Whether signing now satisfies the requirement depends on the resolver's spine
precedence: the orchestrator's verdict stands unless it is `unsigned`, and only
then is the sequence's signature consulted. Re-deriving that in the client is
how P11-28a (Freeze reading the wrong verdict) happened.

- `release-signature-status.ts` — the resolver reports `decidedBy`
  (`orchestrator` | `sequence`); pure `signingNowResolvesRelease` is true only
  for a sequence-spine `unsigned` or `revoked`. Never for `invalid` (on a
  frozen sequence that is tamper evidence; a fresh signature would paper over
  it), `undetermined`, or any orchestrator verdict.
- `assess-dispatch-readiness.ts` — pure `composeStepVerdicts` is now the only
  place `gate`, `freezeGate` and the new `dispatchGateOnSigning` are composed,
  so membership is testable.
- `SubmissionSeqWorkspaces.tsx` — Dispatch reads `dispatchGateOnSigning`
  (fail-closed on absence). When the signature is what the click supplies, the
  label reads "Sign the release and dispatch" (§11.50: the meaning of the act).

Nothing the server enforces is relaxed: the dispatch transition takes a fresh
assessment after the sign call has recorded the signature and enforces full
`gate` (`submission-service.ts` Gate 2). Checked separately: the release
signature's digest excludes `status` (amended 2026-09-21), so it still verifies
at transmit after dispatch.

## Also fixed — copy my own P11-28a fix left false

- "Freeze and dispatch stay locked while the gate blocks" rendered over a live
  Freeze button. The lock note now names the step that is actually locked.
- The "move it to Validated" freeze instruction was gated on the dispatch
  verdict — the step-verdict defect's third instance. Now reads `freezeGate`.
- The header had two states; a gate whose only blocker is the signature the
  click records read "Dispatch blocked". It now reads "Dispatch gate clear
  except for the release signature — the dispatch e-signature applies it".

The P11-28a tests asserted the button and never read the words around it.

## Falsification — 12 probes, each reverted

| Probe | Failed |
|---|---|
| S1 spine precedence dropped from `signingNowResolvesRelease` | 6 — incl. the real-resolver orchestrator-`revoked` case |
| S2 `invalid` treated as resolvable | 3 — incl. `composeStepVerdicts` membership |
| S3 `dispatchGateOnSigning` composed without the other gates | 3 membership tests |
| S4 resolver stops reporting `decidedBy: 'sequence'` | 1 |
| C1 Dispatch back on `gate` (the defect) | 1 — the positive case |
| C2 fail-closed `?.` guard removed | 8 — the component throws |
| C3 lock note back on `!gate.cleared` | 3 |
| C4 freeze instruction back on `gate` | 1 |

S1 first ran **without** the orchestrator-`revoked` case and was caught only by
the truth table: the orchestrator cases written first (`awaiting`, tampered,
undetermined) pass either way, since those verdicts are never resolvable. The
harmful case is an orchestrator `revoked` — resolvable on the other spine — so
it was added through the real resolver and now fails S1.

Two client failures during writing were the test's own: `/dispatch/i` also
matched "Run dispatch QC". The selector names the governed control.

## Results

- server: `release-signature-status.test.ts` + `assess-dispatch-readiness.gates.test.ts` — 66 passed
- client: dispatch/freeze/honesty/readiness suites — 30 passed
- `tsc --noEmit` clean on the touched files

## Follow-up, same day: on the real schema

`server/services/ectd/__tests__/dispatch-on-signing.pglite.integration.test.ts`
runs the COMPOSITE resolver on PGlite with the real migrations — including the
orchestrator store (`db/migrations/20260725_submission_orchestrator_store_port.sql`),
present and empty — and `composeStepVerdicts`, for a never-signed NDA:

- never signed → `unsigned`, `decidedBy: 'sequence'`, dispatch-now blocked,
  dispatch-on-signing open (the button is offered);
- the dispatch-intent signature the click records → `signed`, dispatch-now clears;
- a freeze-intent signature is not the release;
- a leaf added after the dispatch signature → `invalid`, nothing offered.

4 passed. Probes: without the orchestrator store the lookup cannot run and all
4 fail (the resolver reads `undetermined`, the button would stay hidden — the
defect returning silently); with `signingNowResolvesRelease` returning false,
the two "offered" cases fail.

Separation of duties, checked: `/api/c2c/actions/sign` calls
`assertSignerIsNotAuthor` for every sign/lock, un-disableable, and for
`ectd-sequence:` targets the author is `ectd_sequences.created_by`
(`separation-of-duties.ts:271`, tested at `separation-of-duties.test.ts:102`).
Open policy question, not changed: a user who placed every leaf but did not
create the sequence is not treated as its author.

## Not done

- The route and the client were not driven together against a live server;
  the signing HTTP call itself is exercised by its own suites, not here.
- ~~`transmit` UI gating was not re-examined.~~ **Checked 2026-10-05, no
  defect.** The Dispatch tab carries no Transmit control, only a note pointing
  to the governed path. Transmit is on `GatewayTransmittals.tsx`, which gates
  its control on no pre-signing verdict at all — the server enforces the gate.
  The step-verdict deadlock cannot occur there: by transmit the release
  signature (the dispatch signature) already exists, and the transmit-intent
  signature is a separate Gate 1 checked at the request, not a precondition a
  hidden button waits on.

## Decision, 2026-10-05: a sequence's author is its creator, not its leaf placers

The founder asked for the choice best suited to the launch client base (small
biotech and pharma regulatory teams). Kept as is, now written down at
`separation-of-duties.ts` (`SINGLE_AUTHOR['ectd-sequence']`):

- **Content independence is already enforced where content is written.** Freeze
  and dispatch refuse a sequence carrying an unapproved document
  (`LEAF-UNAPPROVED`, Gate 3), and approving a document excludes everyone who
  wrote any version of it (`documentAuthors`). Placing an approved document is
  assembly.
- **Small teams.** Counting every leaf placer as an author would bar the
  colleague who helped publish from releasing the sequence, so a two-or-three-
  person team could not sign its own IND, for no independence over content
  that the document gate hasn't already separated.

What the rule guarantees: whoever assembled the sequence never releases it.

**Found while recording this:** the module's header says "admin may tighten,
never loosen", but no per-org tightening setting exists. An organization that
wants stricter four-eyes on releases has no way to ask for it today. Not built
here (RULE 2: no new capability unless a launch row needs it); handed on.
