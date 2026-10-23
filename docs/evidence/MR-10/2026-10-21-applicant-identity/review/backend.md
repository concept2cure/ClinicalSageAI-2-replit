# Independent backend governance review

Read-only review of other workers’ implementation. No production source edits.
Reviewed at 2026-10-21T01:31:18.001383+00:00.

## What already exists

The canonical `package-identity.ts` reader/lock/snapshot helpers extend the
existing sponsor registry. Existing core assembly, compile/export, AnA and
sequence transmit now consume it. Existing `signature-persistence.ts` binds
FDA recorded identity; existing release-signature readers and Submission
Center dispatch controls decide whether a signature covers the current record.
The review checks these existing boundaries, not a parallel validator or gate.

## Confirmed material finding B1 — changed identity has no reachable reauthorization

**High; product workflow recovery.** An authorized application/binding/contact
edit changes the new FDA governed digest, as intended. However,
`server/services/ectd/sequence-release-signature.ts` maps every digest mismatch
to `invalid`, and `server/services/ectd/release-signature-status.ts:124` expressly
treats `invalid` as tamper evidence that a fresh signature must not replace.
`signingNowResolvesRelease` accepts only `unsigned`/`revoked` sequence verdicts.
Thus the newly enabled ordinary registry/program edit is conflated with tamper.

For an already dispatched sequence, the UI cannot obtain the instructed fresh
release authorization: `SubmissionSeqWorkspaces.tsx` offers the dispatch
signature only for status `frozen`; `precheckGovernedStep` in
`submission-service.ts` refuses dispatched-to-dispatched. Its transmit precheck
then refuses on the invalid release gate. The new recipe also invalidates
pre-deploy FDA dispatch signatures. A next sequence sharing the same lifecycle
keys is blocked by the existing filing-order rule while this lower dispatched
sequence remains unsent.

Reproduction to add: start with a dispatched FDA sequence whose dispatch
signature verifies; edit its bound sponsor contact through the reached PATCH;
assert transmit release is blocked and dispatch precheck refuses its state.
Require a reachable, governed reauthorization path, or a deliberate edit refusal
before creating this condition. Preserve actual leaf-tamper refusals and historical
signature rows. The raw c2c sign API appears able to create a fresh dispatch
signature directly, but the product UI does not reach that recovery and users
should not need an ad hoc API operation. Root notified before any fix.

## Claims refuted by inspection

- **Caller FDA identity override:** compile/export/transmit/AnA read canonical
  facts; export refuses a contradictory supplied DUNS and transmit ignores it.
  The public sequence-assemble route is expressly a dry run.
- **Wrong captured inputs:** `package-from-core.ts` compares captured program,
  application, DUNS, applicant name and full contact array against actual FDA
  inputs before calling the packager. It echoes that capture; the transmit
  checkpoint compares echo, claim capture and freshly derived approved binding.
- **Missing/changed proof:** claim checks approved digest and same program;
  final checkpoint refuses missing/wrong echo or moved identity and releases
  the pre-wire claim. No transaction spans the agency wire.
- **Cross-tenant join:** program and sponsor joins retain tenant predicates;
  a broken/foreign explicit binding cannot fall back to the organization name.
- **DUNS reused as foreign agency ID:** non-FDA branches use absent empty ID
  or an explicitly supplied usable regional ID, not the FDA registry DUNS.
- **Program share-lock upgrade deadlock:** program facts writer takes its
  `FOR UPDATE` before calling the authority helper’s `FOR SHARE`; sequence
  paths take sequence then program then sponsor, registry updates only sponsor.

## Uncertain/nonblocking hardening observation

`packageSequenceFromCore` validates the FDA captured proof only when supplied.
All presently reached real canonical FDA callers supply it; the public dry-run
needs its absence. No public bypass was demonstrated. A future unguarded
internal non-dry-run caller could omit it; preserving an explicit dry-run marker
at this lowest adapter could make that contract harder to misuse.

## Independent execution

Node 22.23.3, three focused suites executed independently: canonical recorded
identity, FDA governed binding, and transmit captured identity: **47 passed in
3 files**, exit 0. Log: `/workspace/scratch/applicant-independent-backend-review.log`.
These cover refusal, tenant query/lock shapes, every applicant/contact digest
change, missing/invalid facts, wrong/missing assembly echo, changes at claim
and during assembly, and non-FDA ID behavior. They do **not** cover B1 recovery.
No native database or deployed human witness was performed by this review.

## Reviewed working-tree input pins

- `server/services/ectd/package-identity.ts` — `65380bebf213afb1cfc1e3bd18ac9757aa0c6b133ffd5591da009bcfc412b658`
- `server/services/ectd/assemble-from-core.ts` — `64153d7eb84fdf4a370efe9f6d4192b373ad8d9684172e3540fb63999fb7b55e`
- `server/services/ectd/package-from-core.ts` — `b9e73bc046310f10cbdf871b9eb05fe689c4a44f7d86ba9de4ec412d3614c899`
- `server/services/ectd/core-to-packager.ts` — `6238c888f9f6e107a1b1d217edd4d44b6f3b98cd749736d747138e44f9944555`
- `server/services/submission-service/submission-service.ts` — `494d27664a48e244912302f1f5cae2b407605be570d088a8cd7c7e2418e9e6ff`
- `server/services/part11/signature-persistence.ts` — `ee36277d4bb269232238a3c1cd242ed5e337bb341080396ac4adc0dbb3e0a9ad`
- `server/routes/ectd-compile.ts` — `11f01bc9c4dd72c794769230d9de71e4d59989578cf9f0e1dd0e024dcedfb6c6`
- `server/services/ana/AnaToolExecutor.ts` — `ff90ee6e49a48d3d366c12169736bd94a626422988ce7d059a04bf1958cfa4d6`
- `server/services/ectd/sequence-release-signature.ts` — `c22e81026c2e294e3e640dcc91daf4777b6d4b195a9b25ed305828a054ba28be`
- `server/services/ectd/release-signature-status.ts` — `a92ddf0fc40fc0739706593d5661daab83394ec9da5118955194ef8eb3547d30`
- `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx` — `f2699d10bf8c50a9e380b8c28ffbcad81385d9bc86748fcd2ee8ea05a6344b29`


## Recovery follow-up — 2026-10-21T01:37:26.504009+00:00

Root’s identity-staleness recovery fixes were reviewed independently. The
extracted `part11/ectd-sequence-binding.ts` preserves the original sequence
columns, ordered leaf fields, source UUID/content pins and null-STF omission.
It computes the exact legacy sequence/leaf digest before adding the versioned
FDA identity and retains that content digest in the attributed signature
manifest. Computed identity/content proof is spread after caller extras.

Modern identity-only staleness now requires all of: unchanged actual current
legacy sequence/leaf digest, equal stored content digest, a well-shaped old
snapshot that differs from current identity, a manifest bound digest equal to
the signature row, and a matching attributed-manifest hash. A changed leaf
stays `invalid` even when identity changed too; a same-identity unexplained
mismatch is also invalid. A malformed modern proof cannot fall back to the
legacy rule. Pre-integration proof absence invites renewal only when its actual
stored bound digest equals the exact current legacy sequence/leaf digest.
No material weakness was found in this classification by inspection.

One concrete extraction regression was reported and fixed: returning the
helper’s promise without `await` escaped the surrounding 42P01 ledger fallback.
The branch now uses `return await`, matching the existing binder branch.
Independent execution of the binding and sequence-release suites: **39 passed
in 2 files**, exit 0. A first run hit the newly added test’s transient incorrect
literal for the existing ledger basis; its correction uses the canonical basis
constant. This was a test expectation typo, not a remaining product failure.
Logs are `/workspace/scratch/applicant-independent-recovery-review.log` and
`/workspace/scratch/applicant-independent-recovery-review-green.log`.

The current caller recovery retains fresh full gates and under-lock status
eligibility: an unsent FDA dispatch can be reauthorized, but a moved/unknown or
transmitting status refuses. A transmit that acquires the sequence lock first
therefore prevents renewal over its active claim. No DB transaction spans the
network. Existing leaf-tamper refusals remain distinct from identity-only
staleness. B1’s classification cause is addressed; final reached UI behavior and
native persisted-manifest recovery proof were still pending the root’s integrated
verification at this review checkpoint.
