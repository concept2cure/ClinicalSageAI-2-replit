# Part 11 UX lens — eCTD / Submission Center lane, 2026-09-28

Head reviewed: `c1cd656b2` (`concept2cure-v2`). Lens read-only.
Lens: `.claude/agents/part11-ux-auditor.md`, invoked by name.
Prior review read first: `docs/evidence/reviews/2026-09-24/part11-ux.md`. None of its
open items (Q1–Q6) touch this lane.

This lens is one of the three the 2026-09-24 review recorded as owed:
*"Authoring, Submission Center and Readiness were not swept under Part 11 or
honest state … the next weekly review owes those first."*

One BLOCKER found. Its freeze half is **fixed in this change**; its dispatch
half is **reported, not fixed** — see P11-28b for why that is a decision and
not a cleanup.

---

## P11-28a — CONFIRMED, BLOCKER — the Freeze button read the dispatch verdict. FIXED.

`client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx:1277` (pre-fix)

`assess-dispatch-readiness.ts` returns **two** composed verdicts for one
assessment:

- `gate` (`:494`) — the dispatch step. Every gate, including the §11.70
  requirement that a release signature already **exists**.
- `freezeGate` (`:495`) — the same gates with that one requirement dropped.
  `composeDispatchGatesForStep`'s own comment says why: *"requiring one to
  freeze inverted the order the product works in"*, for *"a control whose own
  module calls itself 'the transmit-time re-check'"*.

The client gated **both** buttons on `a.gate.cleared`, and its
`ReadinessAssessment` interface declared only `gate` — not `freezeGate`, not
`releaseSignature`. Reading the wrong field was therefore not a type error.

**Failure scenario.** An NDA sequence reaches `validated`. No release signature
exists. `signatureRequired` is true for IND / NDA / BLA / MAA, so
`resolveReleaseSignatureStatus` returns `unsigned`, `evaluateReleaseSignatureGate`
blocks, and `gate.cleared === false` — while `freezeGate.cleared` is `true` in
the very same response. The Freeze button never renders. The sequence cannot
leave `validated` through this screen, for exactly the four submission types
the control exists to govern.

**Verified independently** before acting, not taken from the lens: `freezeGate`
is typed at `assess-dispatch-readiness.ts:141` and returned at `:536`, and
`grep freezeGate client/**/surfaces/*.tsx` matched **nothing** — the server
computed it and no client read it.

**Why it survived.** The server half was fixed when `composeDispatchGatesForStep`
landed; the client was never updated, and nothing failed, because no test
asserted the button ever renders. `dispatchWorkspaceHonesty.test.tsx:32` carries
only `gate: { cleared: false }` — the always-blocked case, green either way.

**Fix**, in this change:
1. `freezeGate` and `releaseSignature` added to the client `ReadinessAssessment`.
2. Freeze gated on `a.freezeGate?.cleared === true`.
3. `client/src/concept2cure/v2/__tests__/dispatchWorkspaceFreezeGate.test.tsx`,
   four cases: renders when the two verdicts disagree; hides on a real freeze
   blocker; hides on an `invalid` signature (requiredness governs whether a
   signature must be PRESENT, never whether a broken one may be ignored); hides
   without crashing on a payload carrying no `freezeGate`.

**Falsification.** Two probes, each reverted:

| Probe | Result |
|---|---|
| revert to `a.gate.cleared` | 1 failed / 3 — the positive case, and only it |
| drop the `?.` fail-closed guard | 1 failed / 3 — the malformed-payload case |

The second probe is recorded because **it passed the first time.** Without the
`?.` the component throws a TypeError mid-render; React discards its output; the
Freeze button is then absent for the worst possible reason. Vitest reported the
throw as an *unhandled error* — a warning, not a failure, with its own notice
that this *"might cause false positive tests"* — and the test stayed green,
because it asserted the symptom of the crash and called it fail-closed. The test
now captures `console.error` and fails on the TypeError, and only then does
removing the guard turn it red. A no-crash assertion that does not assert on the
crash tests nothing.

---

## P11-28b — CONFIRMED, BLOCKER — the Dispatch button has the same shape one step later. NOT FIXED: a design decision.

`SubmissionSeqWorkspaces.tsx:1296` gates Dispatch on `a.gate.cleared`, which for
these four types requires a release signature to already exist. For a sequence
authored purely on the submissions spine, the signature that would satisfy it is
the sequence's own `dispatch`-intent governed sign
(`sequence-release-signature.ts:82`, `RELEASE_INTENT = 'dispatch'`) — and that
signature is created **inside the click handler of the button being gated**:
`SubmissionCenter.tsx:584-592` signs, then `:602-605` transitions.

So the readiness assessment is fetched *before* signing, reports `unsigned`,
hides the button, and the signature is never created. Circular.

Server-side the order is fine: `dispatchSequence` re-evaluates the gate after
the signature row exists. The defect is that the client hides the control on a
pre-signing read.

**Why this is not fixed here.** The obvious remedy — render the button and let
the server refuse — has a Part 11 consequence: a `dispatch`-intent signature is
recorded *before* the gate is evaluated, so a refused dispatch leaves a spurious
signature row against the sequence. Choosing between that, a third server-side
verdict, or splitting sign from transition is a §11.70 design decision for the
control tower, not a cleanup a review session should make unilaterally.

Note that `freezeGate` is *not* the right field here either: dropping the
requirement at the dispatch step would remove the control, not re-scope it.

**Workaround, undocumented.** Signing a release through the orchestrator spine
(`EctdCompile.tsx` → `POST /api/submissions/:id/sign-release`) produces a
signature `resolveReleaseSignatureStatus` accepts independently of sequence
status, clearing `gate` and revealing both buttons. Nothing in either surface
tells the user this, and it inverts the documented order ("freeze, then build
and sign the release").

**Recommended:** a test asserting Dispatch renders in the state a frozen,
correctly-signed sequence is actually in — the positive case, which is what was
missing on the freeze side too.

---

## Checked, no findings

- **§11.70 record linking.** Traced fully. `undetermined` is never treated as
  `unsigned` (`dispatch-gate.ts:196-203`); `invalid` blocks unconditionally,
  including when not required (`:154-163`); the gate is composed through the
  single `composeDispatchGates` / `composeDispatchGatesForStep` seam and
  consumed at the real transition sites (`submission-service.ts:940-948` freeze
  and dispatch, `:1285-1288` transmit). No "computed but never merged" instance
  in this lane. Sequence- and region-scoped binding — a signature over 0000
  cannot clear 0001 — is explicit and tested (`release-signature-status.ts:140-337`).
- **§11.50 manifestation.** `EctdCompile.tsx:1429-1502` shows printed name,
  `GovernedTimestamp`, and `signatureMeaningLabel(...)`, and says "not recorded"
  rather than fabricating a missing field.
- **Re-authentication.** `submission-sign-release.ts` and `c2c/actions.ts`'s
  `sign` both route through `reverifySigner` — password + conditional TOTP,
  account standing and lockout checked before any comparison, never a
  client-asserted "already verified" flag. `runGoverned` forwards
  password/TOTP as `reauth`, not session state.
- **Reason for change.** `PUT /sequences/:seqId/leaves` enforces a real minimum
  length server-side via `requireGovernedReason` (`submissions.ts:945-948`) —
  not client-only, not a placeholder.
- **Immutability.** `BuilderWorkspace` disables leaf placement once
  `frozen`/`dispatched` and says why (`SubmissionSeqWorkspaces.tsx:446,503-507`);
  no edit/delete affordance on historical rows in any of the four UI files.

## Not covered

- **Separation of duties (signer ≠ author) for freeze/dispatch.**
  `governedSignatureVerdict` (`submission-service.ts:493-528`) checks target,
  intent, replay and digest binding; the lens found no author-vs-signer check
  there and did not trace whether one exists elsewhere. Plausible, unconfirmed,
  and a distinct question from re-authentication. **Worth a dedicated pass.**
- `submission-package-orchestrator.ts` internals (the `package.sign` step's own
  audit-fatality guarantees) — read only through what `release-signature-status.ts`
  needed.
- `regulatorySubmissions.ts`, `ectd-export.ts` — not opened; time went to
  tracing the gate composition end to end.
- Whether a second client caller of `POST /sequences/:seqId/freeze` exists
  outside the four files reviewed. The AnA surface-action bus on this screen was
  checked and explicitly excludes the governed chain.
