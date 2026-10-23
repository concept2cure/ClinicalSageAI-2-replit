# Review finding resolutions

W5 / D7, MR-10 applicant identity integration. This records the disposition of
the named findings in [backend.md](backend.md) and [program-ui.md](program-ui.md).
Those initial reports and their intermediate failures remain intact. The
executions linked below are scoped worker evidence; this document is not a
final publication, full-suite, deployed-human or agency qualification record.

## What already exists

The existing IND sponsor registry owns applicant, contact and signatory facts.
The existing program-facts route selects that record, and the existing form
assembler and sequence packager consume it. The existing Part 11 binder,
sequence release verdict, dispatch action, chained audit and Submission Center
signing UI govern release. The existing forms panel owns checks and mutation
receipts. Each resolution below completes those paths; none introduces a
second registry, signature engine, release action or form-check engine.

## B1 — changed applicant facts stranded an unsent dispatched sequence

**Resolved through the existing dispatch action.**

The original finding had two causes: every changed FDA digest was classified
as invalid content, and an already dispatched sequence could not reach a fresh
dispatch authorization. The current
[`sequence-release-signature.ts`](../../../../../server/services/ectd/sequence-release-signature.ts)
distinguishes proven identity-only staleness from changed sequence/leaf content.
For modern proof, renewal requires the unchanged sequence-content digest, a
well-shaped captured identity that differs from the current identity, a matching
attributed bound digest and the stored manifest hash. A malformed modern proof
cannot fall back to the legacy rule. A pre-integration leaf-only signature
invites current authorization only when its actual digest equals the current
legacy sequence/leaf digest. Historical signature rows remain retained.

Changed leaves remain invalid, including when applicant facts also changed.
An unexplained digest mismatch with unchanged identity remains invalid too.
The existing binder retains the sequence-content digest alongside its FDA
identity proof; computed proof is applied after caller-supplied extra metadata.
See [`ectd-sequence-binding.ts`](../../../../../server/services/part11/ectd-sequence-binding.ts)
and [`signature-persistence.ts`](../../../../../server/services/part11/signature-persistence.ts).

[`submission-service.ts`](../../../../../server/services/submission-service/submission-service.ts)
now lets the existing dispatch action renew an explicitly unsent FDA dispatch
(`null`, `pending` or `rejected`). It requires a fresh signature and current
gates, preserves frozen state, compares the dispatch status under the sequence
lock, rechecks the spent-signature ledger and commits its chained audit with
the action. In-flight, sent, acknowledged, unknown and non-FDA renewal states
remain refused. The generic lifecycle transition table remains forward-only.

The existing
[`SubmissionSeqWorkspaces.tsx`](../../../../../client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx)
reaches that same server-owned eligibility through the precheck, sign modal and
dispatch chain. It does not offer an unverified renewal or turn an unconfirmed
act into a completed release.

Evidence:

- [Backend recovery follow-up](backend.md): independent inspection and 39
  checks across the binding/release suites.
- [Signature five-suite replay](../signature/final-five-suites.log.gz): 70
  passing checks, including legacy compatibility, identity-only staleness,
  damaged proof, changed leaves and the existing ledger fallback.
- [Caller evidence](../callers/README.md): failing-first renewal and spent-ledger
  cases; final fresh 260/260 checks in 19 files. The controlled renewal tests
  use the actual binder, packager, row mutation and audit, with an explicitly
  positive readiness fixture.
- [`dispatch-reauthorization.pglite.test.ts`](../../../../../server/services/submission-service/__tests__/dispatch-reauthorization.pglite.test.ts)
  covers fresh authorization, audit rollback, status movement and a signature
  spent during assembly.
- [UI evidence](../ui/README.md) and the browser record's
  [renewal stages](../browser/result/result.json) exercise reached and refused
  renewal controls with synthetic records. They are not a human witness.

## Extraction follow-up — asynchronous errors escaped the existing fallback

**Resolved.** Extracting the existing sequence binder initially returned its
promise without awaiting it inside the surrounding `try`. An asynchronous
`42P01` therefore bypassed the existing honest ledger-only fallback. The caller
now uses `return await deriveEctdSequenceBinding(...)`; other failed identity
reads still propagate, and ledger-only evidence does not become a content-bound
signature.

The regression is
[`ectd-sequence-binding-applicant.test.ts`](../../../../../server/services/part11/__tests__/ectd-sequence-binding-applicant.test.ts),
“retains the existing honest ledger-only fallback when the sequence store is
absent.” The independent [follow-up](backend.md) and
[five-suite replay](../signature/final-five-suites.log.gz) verify the correction.
A transient wrong literal in the new test was corrected to the existing
canonical basis constant; that intermediate failure was not relabelled a pass.

## Normal ownership gate — the existing facts reader owns its row lock

**Resolved; no defect found in the corrected lock path.** The normal ownership
gate rejected a standalone ownership-shaped query that had been added only to
acquire the program lock. The correction requests that lock from the existing
`resolveProgramIdent()` full-facts reader in
[`program-form-facts.ts`](../../../../../server/services/ind-forms/program-form-facts.ts).
Its `.for('update', { of: regulatoryPrograms })` targets the actual unaliased
program table only. It does not try to lock the nullable organization or
sponsor sides of the outer joins, and it retains the same organization and
nondeleted-program predicates.

The independent backend follow-up reported no defect in this correction. The
writer's order remains transaction and tenant context, program write lock,
canonical authority through `requireGovernedProgramWriteTx()` and
`programInOrganization()`, a fresh facts read with exact revision comparison,
the selected sponsor's share lock, then mutation and chained audit before
commit. Reusing the reader does not replace the authority check or loosen the
CAS, tenant or audit boundary.

[Program follow-up evidence](../program/README.md) retains the original normal
push refusal and reproduced ownership-gate failure. The corrected path passed
[97/97 checks in four files](../program/green-reader-lock.log), including the
focused authority/CAS/audit/applicant cases. The one-file
[lint run](../program/lint-reader-lock.log) completed with zero errors or
warnings. The unchanged [normal ownership gate](../program/ownership-green.log)
and [selftest](../program/ownership-selftest.log) passed; the selftest found all
10 intentional copies and accepted six legitimate reads.
[Separate source inputs](../program/source-inputs-reader-lock.json) pin this
worker replay. Root owns the subsequent full compiler and publication gates.

## M1 — late form checks could survive changed recorded facts

**Resolved.**
[`IndFormsPanel.tsx`](../../../../../client/src/concept2cure/v2/surfaces/IndFormsPanel.tsx)
now owns a synchronous form-input generation. A recorded read or receipt
changes that generation and clears checks when the program-input key changes;
the key includes the bound sponsor record, so a shared sponsor revision can
retire a check even if the program revision did not change. Per-form edits
retire checks synchronously too. A request must still own its input generation
after the response and after JSON parsing before it may publish a verdict.
Existing session and project-visit guards remain in force.

[`indFormsPanelRecords.ts`](../../../../../client/src/concept2cure/v2/surfaces/indFormsPanelRecords.ts)
holds the existing program-input projection. Regression cases in
[`indApplicantIdentity.test.tsx`](../../../../../client/src/concept2cure/v2/__tests__/indApplicantIdentity.test.tsx)
cover a late check after an identity save, an explicit reload with changed
facts, a serial-number edit and a changed bound sponsor with an unchanged
program revision. [UI evidence](../ui/README.md) retains the three failing-first
cases in `red-stale-check.txt`; its 132-check, 12-file replay includes the fixes.

## M2 — recorded signatory facts disappeared or could be replaced at build

**Resolved in form generation and reached editing.** The existing
[`form-context-assembler.ts`](../../../../../server/services/ind-forms/form-context-assembler.ts)
maps `signatoryName` / `signatoryTitle` to the forms' authorized-representative
fields. `recordedRequestMetadata()` in
[`ind-forms.routes.ts`](../../../../../server/routes/ind-forms.routes.ts) now
preserves that recorded sponsor projection after stated metadata. A bound
registry representative survives a build with no override and cannot be
replaced by caller-supplied representative metadata. The existing program
address remains the address authority; permitted per-build choices remain.

The route regression
[`ind-program-applicant.contract.integration.test.ts`](../../../../../server/routes/__tests__/ind-program-applicant.contract.integration.test.ts)
builds FDA 3454 with both absent and spoofed representative overrides and checks
the recorded name/title. [Program evidence](../program/README.md) retains its
failing-first signatory case and the 97/97, four-file replay.

The compact existing sponsor editor in
[`IndApplicantIdentity.tsx`](../../../../../client/src/concept2cure/v2/surfaces/IndApplicantIdentity.tsx)
also reaches both nullable registry fields. Users can record, edit or clear
them; the editor labels them as authorized-representative facts and expressly
states that recording them does not sign a form. Its exact receipt comparison
requires both fields to be present and equal to the submitted facts. Missing
or differing representative values hold the write as unconfirmed.
[UI evidence](../ui/README.md) retains six failing-first editor/receipt cases and
the [35/35 focused replay](../ui/green-authorized-representative.txt), followed
by the 132-check integrated UI cohort.

## M3 — malformed or partial investigator checks appeared clean

**Resolved.** The existing
[`checkedBuildResult()`](../../../../../client/src/concept2cure/v2/surfaces/indFormsPanelRecords.ts)
requires a matching form ID, a field-result object and an explicit array of
nonempty missing-field strings. An empty result set or any malformed result
is not a verifiable check. For a multi-investigator result, every row is
validated and all missing fields are collected with investigator labels; a
clean first investigator no longer hides gaps in the second.

The same [UI regression file](../../../../../client/src/concept2cure/v2/__tests__/indApplicantIdentity.test.tsx)
checks malformed HTTP 200 bodies, an empty array, absent `missingRequired`, a
wrong form, malformed later investigators and a second investigator's missing
field. [UI evidence](../ui/README.md) records the initial malformed-receipt
failures and the corrected object-wrapped table fixture for the actual empty
array case. The server remains the completeness engine; the client validates
the returned contract instead of inventing a separate form validator.

## L1 — a sponsor PATCH receipt could retain the prior revision

**Resolved.** `matchesSponsorReceipt()` in
[`IndApplicantIdentity.tsx`](../../../../../client/src/concept2cure/v2/surfaces/IndApplicantIdentity.tsx)
requires a PATCH receipt to name the edited record and advance its opaque
revision, as well as match every submitted business field and carry an audit
outcome. An unchanged revision is held for explicit read/reconciliation.
The existing program receipt already required an advancing facts version.

The regression is “requires an updated revision on a shared sponsor PATCH
receipt” in the [UI test](../../../../../client/src/concept2cure/v2/__tests__/indApplicantIdentity.test.tsx).
[Registry evidence](../registry/README.md) separately verifies that the writer
advances its precise database revision, including concurrent/stale saves. The
UI still distinguishes a committed registry mutation with an unconfirmed or
nonretrievable ancillary audit entry; it does not retry that mutation blindly.

## Refuted — an extra Submission Center readiness refresh was required

The corrected actual-parent continuation test passes with the proposed extra
refresh line absent. The existing confirmed dispatch chain reloads sequence
rows and the Dispatch workspace reads its assessment again, including a
dispatched-to-dispatched renewal. An unconfirmed act does not show a successful
signature or publish a newly cleared verdict.

The test is “reads the new release verdict after a confirmed dispatched to
dispatched act” in
[`submissionCenterLifecycleQa.test.tsx`](../../../../../client/src/concept2cure/v2/__tests__/submissionCenterLifecycleQa.test.tsx).
[`refresh-mutation-refuted.txt`](../ui/refresh-mutation-refuted.txt) records the
passing removed-line check. [UI evidence](../ui/README.md) explains the earlier
preflight's two harness mistakes: an HTTP 503 marked `ok:true` and an initial
Validation read included in the count. That preflight is not product red
evidence. `SubmissionCenter.tsx` remains byte-identical to pretask `b9a48ce71`;
no production refresh change remains from this proposal.

## Broad diagnostic disposition and historical Stage 11 posture

The [broad diagnostic summary](../verification/backend-broad-summary.json)
records 163 files and 2,219 tests: 2,163 passed, 17 failed, 37 skipped and 2 todo
at that point. It ran while workers were finishing changes and is explicitly
not a final-source witness or a full-suite pass. Exact failures and original
outputs are retained.

The named private-schema/sponsor fixture gaps were corrected without relaxing
production gates ([fixture evidence](../integration-fixtures/README.md)). Real
xmllint and isolated-hook replays passed
[38 checks](../verification/xmllint-replay.log.gz) and
[14 checks](../verification/hook-qualification-replay.log.gz). The caller's
fresh 260-check cohort covers the spent-renewal case that the in-flight run saw
before the last edit; its later
[12-check compatibility replay](../callers/green-broad-compatibility.txt)
resolves the old CAS source assertion and captured-FDA dry-run fixtures.
These are separate executions, not additive unique-test counts or a rewritten
green result for the original broad run.

**Two pre-existing posture assertions failed in the original 21 Oct run.**
`submission-gate-posture.test.ts` still records PreSTAR as absent and the eSTAR
asset precondition as blocking, while the tracked `PreSTAR-q-sub.pdf` was
already present at the pretask baseline. The
[input comparison](../verification/preexisting-posture-inputs.json) proves the
test (25,396 bytes), PreSTAR asset (3,803,448 bytes), checksum file and template
registry are byte-identical to `b9a48ce71`; the
[history](../verification/preexisting-posture-history.log.gz) is retained.
On 23 Oct resumption, root confirmed another session had corrected the stale
assumptions in `4d27ecc74` on 22 Oct; the current file passed 8/8. See the packet
README and canonical-refresh.json. Enforcement is still a separate decision.
This slice
does not silently rewrite that record, change enforcement defaults or call
those checks passed.

## Limits retained

The backend review's optional lowest-adapter proof hardening remains an
observation: reached real FDA callers supply captured proof, and the explicit
dry-run path needs its absence; no public bypass was demonstrated. This
document does not claim that speculative future internal misuse was eliminated.

Final source/build/publication pinning belongs to the root qualification
record. Actual pilot facts, deployed human witnessing, licensed agency assets,
telephone vocabulary and agency conformance/acceptance remain outside these
review closures. No full MR-10 Stage 4 or D7 closure follows from this report.
