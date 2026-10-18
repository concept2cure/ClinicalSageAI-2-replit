# A section approval is independent of whoever entered the records it cites

Row **D2**. GA plan item 2's second half (decision 2026-10-05, P-28).

## The defect

The Module 3 section-approve endpoint checked re-authentication, signing
authority, a stated reason, the signature's §11.50(a)(3) meaning, the
read-before-sign content hash, open critical contradictions, the compiler's
completeness verdict, staleness, lineage drift and superseded evidence.

It did not check **who wrote the data**.

One person could record every register row a section is composed from and then
sign the approval that puts it in an IND. `docs/validation/URS-007-CMC-MODULE-3.md`
§3 said so, and said why it could not be fixed:

> The approver may still be the last writer of the records a section was
> composed from; separating those two people needs the record-level audit rows
> that name that writer, which is open work.

Those rows landed on 2026-10-18
(`docs/evidence/CMC-M3-GA/2026-10-18/02-register-create-attribution/`). This is
the control they were for.

And a second, narrower hole in the same endpoint: it accepted the
§11.50(a)(3) meaning **authorship** — which is precisely the meaning that
switches the four-eyes check off (`requiresIndependence` in
`services/governance/separation-of-duties.ts`). The platform closed the
identical hole on freeze/dispatch on 2026-10-05, where a release signer could
be the sequence's creator by choosing it. Here the route flips the section to
`approved` and snapshots the version the export gate and the placement path
then file, so there is no authoring act at this endpoint for that meaning to
describe.

## The fix

**A Module 3 section's authors are the people who ENTERED its records.** Not
the person who ran the compile: the compile is deterministic and writes
nobody's judgement into the section. What a section says is what its records
say, so the data entry *is* the authorship — and that is the pairing a quality
unit's second-person review exists to separate (21 CFR 211.22, 211.100(a);
§11.10(g) is the enforcement).

`server/services/cmc/register-operators.ts` reads it along the section's own
lineage, the same path the drift check walks:

```
cmc_module3_sections → cmc_section_lineage.source_object_id
                     → cmc_source_objects (source_type, source_key)
                     → audit_logs (action 'cmc.register.create')
```

`cmc_source_objects.source_key` is always `'<source_type>:<record id>'` (every
`writeThroughX` builds it that way), and a `cmc.register.create` row carries
the register and the record id it wrote. `REGISTER_BY_SOURCE_TYPE` is the
19 → 18 map between them — `satisfies Record<CmcSourceType, CmcRegister>`, so a
new canonical source type does not compile until it names its register, and a
section can never cite records the control silently cannot attribute. (It is
19 → 18 because the material register writes two source types: an excipient is
§3.2.P.4 content, a raw or starting material is §3.2.S.2.3.)

The lineage is replaced on every compile (`module3-compile.ts` DELETEs before
it INSERTs), so what the check reads is the current compile's sources, never an
earlier one's.

**The rule is the platform's, not a second copy.** `cmc-module3-section` is a
new target in `services/governance/separation-of-duties.ts`, beside
`document`, `canonical_document`, `ectd-sequence`, `submission-package`,
`report-run` and the rest; the route calls the same `assertSignerIsNotAuthor`
every other governed signature calls, and maps its three errors through the
same `separationOfDutiesRefusal`. That mapper **moved** from
`routes/c2c/actions.ts` to the governance module beside the three errors it
maps, and is re-exported from its old home so its existing importer is
unchanged — a route is not what another route should have to import to answer
the same refusal the same way, and the CMC approval would otherwise have pulled
a 1,000-line route module in to get at it.

**A partial answer is not a negative one.** `TargetAuthorship` gains
`incomplete`: set when some of what a record is built from names its author and
some does not. Rule 3 of the governance module's header — unknown author means
refuse — now applies to each contributing part, not only to the whole, because
a signature must never imply a four-eyes check that did not happen for the
records it could not see. So a cited record with no `cmc.register.create` row
refuses the approval **and is named**, rather than passing as "no conflict".
The plainer refusal is said first: if the signer is one of the known authors
they are told that, not that attribution is partly missing.

In practice an unattributed cited record is one recorded **before**
2026-10-18. CMC/Module 3 was refused to every organisation until the catalog
flip of 2026-10-12 (P-28), so that window is six days wide and holds no
production data; a development or demo database carrying older rows sees the
refusal, and the refusal says what to do.

**The client stops offering Authorship** in the Sign-to-approve form. Both
approvals it serves are approvals; offering a meaning the endpoint refuses
could only produce a refusal the signer could not have predicted.

## Red, then green

**At the route, where the signature is made**
(`server/api/cmc/__tests__/module3SectionApproveFourEyes.test.ts`, 10 cases).
Shown failing first by restoring the route to its pre-change source
(`red-route-before.txt`): **6 of 10 fail**, and the refusals that should have
happened are instead *signed, filed approvals* by the very person who entered
every record the section cites:

```
refuses the recorder with 403, rolls back, and writes nothing
  → {"success":true,"sectionKey":"3.2.P.5","versionNumber":1,
     "approvedVersionId":"ver-1","governance":{"actionId":"act-1","sha256Chain":"chain"}}
     expected 200 to be 403

refuses the authorship meaning before the password and before any SQL
  → expected 200 to be 400

refuses with 409 when a cited record has no recorded operator, and names it
  → {"success":true,…"approvedVersionId":"ver-1"…}: expected 200 to be 409

answers 503 — not 200 — when the check could not run
  → {"success":true,…"approvedVersionId":"ver-1"…}: expected 200 to be 503
```

After: **10 pass.** They hold the authorship-meaning refusal before the
password and before any SQL; the recorder refused 403 with a ROLLBACK and no
version row, no state flip and no governed action; a colleague admitted and the
approval landing; the check running only *after* the section row is locked and
*before* anything is written; the 409 naming the unattributed record; the 409
for a section citing nothing; and 503 — never 200 — when the lookup fails, with
the internal cause kept out of the body.

**The rule itself, over a real Postgres and the real `cmc.register.create`
rows** (`server/services/cmc/__tests__/section-approval-separation-of-duties.pglite.integration.test.ts`,
9 cases): every operator of the cited records named with its authorship source;
both material source types resolving to the one material register; another
tenant's create row *not* counted as this tenant's operator; the operator
refused and a colleague admitted; one unattributed record refusing and named;
"you wrote it" said in preference to "partly unknown" when both are true; a
section citing nothing refused; a failed lookup reading as *could not verify*;
and an authorship-meaning signature skipping the check — which is exactly why
the route refuses that meaning.

A fixture bug caught on the way, worth recording because it is the failure mode
this kind of test has: the suite imported the action name from
`register-operators` (which does not export it) instead of from the module that
*writes* it, so every `audit_logs` row the fixture wrote carried
`action = undefined` and matched nothing. The import now comes from
`register-audit.ts`, so a fixture cannot drift from the real row.

**The staff simulation, against the real server: 162 passed, 0 failed**
(`green-simulation.txt`, up from 158 — the four new assertions are below).

The QA approver is now a *second person*. Every register this programme cites
was recorded by the signed-in staffer, so step 15 adds an `approver`-role
colleague through the members API, signs them in, and the approvals are theirs.
Step 15b proves the control from the other side: the staffer who recorded the
data is refused **403 `SEPARATION_OF_DUTIES`**, and an authorship-meaning
approval is refused **400 `APPROVAL_IS_NOT_AUTHORSHIP`**. That is not a test
contrivance — it is the predicate rule the control enforces.

The first run of that step produced twenty `REAUTH_PASSWORD_INVALID` refusals
and then `REAUTH_ACCOUNT_LOCKED`, which is the platform behaving **correctly**:
the members API leaves `password_hash` as an invitation placeholder and the
signature path re-authenticates, so an invited approver cannot sign until they
set their own password from the invitation link. A script cannot click that
link, so step 15 sets the password as a clearly-labelled fixture — the one step
in that file that is not an API call — and says why in the script.

### Two things the simulation found, both fixed here

1. **A second change-control register, invisible to the first draft of this
   control.** §3.2.P.3 cited `change_control:9335db89-…` and the approval was
   refused for an unattributed record. The cause: `cmc_change_controls` (uuid
   ids, `cmc-change-control-service.ts`) is a **second** change-control table
   beside `cmc_change_control` (serial ids, the register route), and both feed
   the one `change_control` canonical source type. The proposal table records
   its operator in `created_by` — it has since it was written, and its route
   sets it from the session — so the operator *was* recorded, just not where
   the chain keeps everyone else's. `register-operators.ts` now reads that
   column for a cited record the chain does not name, the refusal says which
   source it used (`change proposals (created_by)`), and
   `register-create-recorded.test.ts` names the exception instead of leaving it
   as a hole in the gate.

2. **This machine's database was behind trunk's schema**, which is why the run
   also showed four failures downstream of a 500: `ectd_sequences` was missing
   `transmit_signature_action_id` / `transmit_attempt_id`
   (`migrations/20261014_ectd_transmit_attempt_binding.sql`) and
   `submission_leaves` was missing `stf_file_tag` / `study_id`
   (`migrations/20261012_submission_leaf_stf_study_tagging.sql`). Neither is in
   this change's path. `npm run db:migrate:deploy` cannot close the gap on this
   machine — it stops at *"authoring subsystem provisioning failed … must be
   owner of function authoring_audit_trail_append_only"*, an ownership problem
   of the local role. **→ whoever owns local provisioning:** that is worth a
   look; a developer's database silently drifts behind trunk and the next
   session reads the resulting 500s as a regression.

**The four suites that drive this endpoint's SQL and audit sequence** stub the
governance module, with a comment saying where the control is proved instead.
They would otherwise all refuse on a fixture that cites no recorded source,
which would have told us nothing about what they exist to check.

**Also green:** the CMC, governance and c2c suites — **2047 passed** across 131
files; `tsc --noEmit` clean; the ESLint warning profile of every touched file
unchanged. Four `server/routes/c2c` suites fail (14 cases: the pptx/docx export
and retrieval-status suites and `project-route-access-requestdb`), and they
fail **identically at the pushed trunk commit with these changes stashed** —
not this change's, and recorded here rather than left looking like it.

The chained governed action for an approval now also records
`independence: <the verdict's own reason>`, so the trail shows the check ran
and against which authorship source, rather than only the absence of a
refusal.

## What this does not claim

- Four-eyes against the data entry is claimed for the **Module 3 section
  approval** only. The specification approval, the batch release and the
  register qualifications each have their own authority gate and
  re-authentication; none of them yet checks the data entry.
- A **one-person** sponsor cannot approve its own Module 3 sections. That is
  the control, not a defect: the platform's separation-of-duties policy is
  un-disableable by design ("admin may only tighten, never loosen"), and a
  second authorized identity is what a quality unit's review means.
- OQ-008 and its runner are still owed (P-28), and OQ-007 for Reporting &
  analytics does not exist.
