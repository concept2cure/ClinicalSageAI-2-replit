# The registers that had the signature columns and no signature

**URS-CMC-023. OQ-CMC-34, OQ-CMC-35.**

Five CMC registers reached their signed state only under a 21 CFR Part 11
signature — a container closure, a reference standard, an impurity profile and
a characterisation study are *qualified*; a manufacturing process is
*validated*. The rule was written down once
(`server/services/cmc/signed-record.ts`), enforced on the create, enforced on
the edit, and performed by one ceremony (`qualifyRegisterRecord`).

Eight more registers offered their signed word on a plain dropdown. Four of
those had **the signature columns already in the table** and nothing but an
ordinary write ever filled them:

| Register | Signed state | Columns an ordinary write filled | Who reads it as a completed act |
|---|---|---|---|
| `analytical_methods` | `status = 'validated'` | `validated_by`, `validation_date` | §3.2.S.4.3's *Validation Status* and *Validated* columns and the §3.2.S.4 narrative (`module3Composer.ts:2446, 2457-2458, 2426-2435`, mirrored at §3.2.P.5); the ICH Q2 engine, whose `VALIDATED` set turns a shortfall into a pass (`ich-compliance-q2.ts:44, 123-125`); the contradiction sweep's `method_validation_gap` (`contradiction-registers.ts:85`) |
| `process_validation` | `status = 'approved'` | `approved_by`, `approval_date` | the composer's process-validation statement for §3.2.S.2 and §3.2.P.3 (`module3Composer.ts:2342, 2376, 2672, 2687, 2757`) — this register is the only matched source emitting `validationStatus` into those sections |
| `cmc_comparability_assessments` | `status = 'approved'` | `reviewed_by` (free TEXT, **no FK to users**) | §3.2.P.8's *Comparability Assessments (ICH Q5E)* table, whose *Status* and *Reviewed By* columns are exactly these two values (`module3Composer.ts:962, 967, 970`) |
| `qc_testing` | `reviewed_by` non-null | `reviewed_by`, `release_date` | the batch-release gate: `reviewed: r.reviewed_by != null`, and a FULL release is refused while any result is unreviewed (`batch-release-evidence.ts:51, 67, 126-133`) |

The QC one is the sharpest. That register's **edit** has governed the review
properly since it was written — the reviewer is the session and never the body,
and a reviewer who is the analyst is refused — but the **create** spread the
whole parsed body into the insert. So one ordinary POST filed a result already
stamped as reviewed and released, by a colleague who never saw it, and turned a
conditional release into a signed full one. The second-person check was
reachable only by callers who chose to go through the edit.

## Before

```
$ BASE=http://127.0.0.1:5000 bash probe-signed-states.sh      # commit c1a6916c4
analytical-method      200  ACCEPTED status=validated reviewed_by=None
process-validation     200  ACCEPTED status=approved  reviewed_by=None
comparability          200  ACCEPTED status=approved  reviewed_by=None
qc-testing             200  ACCEPTED status=None      reviewed_by=1
```

Full output: `red-before-create.txt`.

## After

Each refusal names the endpoint that does record the act, and that endpoint
exists:

```
analytical-method      409  Method validation (ICH Q2) is a governed action … POST /api/cmc/analytical-methods/:id/validate
process-validation     409  Approval of a process-validation record is a governed action … POST /api/cmc/process-validation/:id/approve
comparability          409  Approval of a comparability assessment (ICH Q5E) is a governed action … POST /api/cmc/comparability-studies/:id/approve
qc-testing             409  REVIEW_IS_A_SECOND_PERSON
```

and the ceremony behind it, end to end:

```
validate with no reason                        400  Invalid input data
validate, reason, no re-auth                   401  REAUTH_PASSWORD_REQUIRED
validate, no Q2 parameters recorded            409  This method records no ICH Q2 validation parameters…
record the Q2 package (ordinary edit)          200
validate with the package + password           200  status=validated validated_by=3 validation_date=2026-10-18
edit a validated method                        409  …is validated under a recorded signature…
un-validate by an ordinary edit                409  …is validated under a recorded signature…
approve a PV record naming no report           409  This record names no validation report…
approve an assessment stating no case          409  This assessment states no justification…
approve the PV record                          200  status=approved approved_by=3
approve the comparability assessment           200  status=approved reviewed_by=3

— the 21 CFR Part 11 signature rows these three acts wrote —
analytical_method:80   meaning=approval  signer=JM Smith  act={"status":"validated"}  auth=password  basis=governed-action-sha256-chain
process_validation:10  meaning=approval  signer=JM Smith  act={"status":"approved"}   auth=password  basis=governed-action-sha256-chain
comparability_study:…  meaning=approval  signer=JM Smith  act={"status":"approved"}   auth=password  basis=governed-action-sha256-chain

— the chained audit rows the same transactions wrote —
analytical_method:80   c2c.work.sign  user=3  chain=9ad68bb26eaaddef  seq=5616
process_validation:10  c2c.work.sign  user=3  chain=f215153b23995d7d  seq=5619
comparability_study:…  c2c.work.sign  user=3  chain=a68ee63f144ed19e  seq=5620
```

Full output: `green-after.txt`. Both probes are in this directory
(`probe-signed-states.sh`, `probe-ceremony.sh`) and run against any development
server; the ceremony needs a signing identity with a password, which on this
machine was a labelled bcrypt fixture, as the staff simulation uses.

## The OQ steps, executed

OQ-CMC-34 and OQ-CMC-35 were added to OQ-008 for URS-CMC-023 and run against a
development server with the run identity's password supplied
(`oq-008-run-with-the-new-steps.md`, **16 pass · 0 fail · 11 deviation ·
8 not-executed** — and OQ-CMC-33, the section-approval four-eyes rule, executes
positively for the first time in the same run, because it needs the same
`OQ_RUN_PASSWORD`):

```
OQ-CMC-34  pass   4 registers refuse the signed state on create; 3 refuse it on an edit;
                  each names its own governed path
OQ-CMC-35  pass   3 registers signed through the path their refusal named; each records
                  the signer and refuses the edit after
```

```
$ cat OQ-CMC-35.signatures.json | the signer each register recorded
analytical-methods      -> 3           (a users.id reference)
process-validation      -> 3           (a users.id reference)
comparability-studies   -> JM Smith    (the printed name §3.2.P.8 renders)
```

`OQ-CMC-34.refusals.json` and `OQ-CMC-35.signatures.json` are the two steps'
own attachments: four 409s with nothing written, then three signatures each
setting the status and the signer, each with exactly one
`electronic_signatures` row read back through `/api/part11/signatures/by-target`
— the product's own route, because what an inspector reads is the row — and
each followed by a 409 on the edit after it.

A register signature is **not** a two-person act, and OQ-CMC-35 says so in the
step: the five ceremonies that predate these three have no independence check
either, because the person who records a method's Q2 package is ordinarily the
person who signs its validation. The four-eyes rule is on the Module 3 *section*
approval (URS-CMC-022, OQ-CMC-33), where the signer must not be an author of the
records the section cites. The step therefore re-authenticates as the run
identity rather than calling `requireSigner`, which deviates when the signer is
the author.

Two runner defects were found by running it, not by reading it: the step first
read an empty detail off the register refusal envelope — a third shape,
`{ success: false, error: <prose> }`, which `errDetail` did not handle — and so
reported that the refusal did not name the path it did name; and
`signatureRowsFor` takes the api function, not the context. Both are fixed in
`signed-acts.mjs`, which now documents all three envelopes and tells a code from
a sentence by shape rather than by case.

## What was built, and what was not duplicated to build it

The ceremony already existed and was already parameterised. What it lacked was
a single place to read a register's signing words from. There were three:

- `QUALIFICATION_VOCAB` / `PROCESS_VOCAB`, chosen at each call site;
- the `signing: { statusColumn, signedValue, signedByColumn, signedAtColumn }`
  block each ceremony declared;
- `SIGNED_REGISTERS`, which named the table, the status column and the word.

So a register's signed word was written down two or three times, and the eight
registers with no entry had no rule at all. They are now one descriptor:
`SIGNED_REGISTERS` carries the table, both columns, the id shape, the path, the
verb and the noun, and the refusal, the ceremony and the client all read it.
`withoutGovernedFields`, which hard-coded `qualifiedBy` / `qualificationDate`,
is **deleted**: `withoutSignatureFields(register, data)` strips whichever pair
that register uses, at all eight call sites.

The surface loses no capability. Each register's status control drops the signed
word and gains the governed action beside it, exactly as the five earlier
registers have: `Validate` on the method library, `Approve` on process
validation and on comparability, each opening the Part 11 form (reason, meaning,
re-authentication) and each with `Retire` for the record that holds the
signature. `statusOptionsFor(statuses, current, signedValue)` already
generalised the word, so a record that IS signed still round-trips its own
status through an edit rather than being sent back to draft.

## One thing the first pass got wrong in the dossier itself

The ceremony writes `userId` into the signer column, which is right for seven
registers — they all hold a `users.id`. `cmc_comparability_assessments.reviewed_by`
is free TEXT with no FK, and §3.2.P.8 prints it as the **Reviewed By** name. So
the first version of this change made the composed dossier read
**"Reviewed By: 3"**: a regression in the filed document, introduced by the fix
for the governance hole.

The descriptor now carries `signedByKind: 'userId' | 'name'`, and for a `name`
column the ceremony resolves the signer's printed name on the signing client,
inside the transaction, through the same `resolveSignerIdentity` the §11.50 row
uses — so the signature row and the register cannot name different people, and
an unattributable signer fails the whole act rather than writing a number into
a name field:

```
$ psql -c "SELECT id, status, reviewed_by, approved_at IS NOT NULL FROM cmc_comparability_assessments WHERE status='approved'"
4b27f209-… | approved | reviewed_by=JM Smith | approved_at set: true
```

## Verified by making the check fail

`comparabilityAssessments` was first written `idKind: 'integer'`, because the
four registers before it are serial. Its table is uuid-keyed, so **every**
approval answered `A comparability assessment id is required` — found by running
the ceremony, not by reading the file. The test that now exists for it,
`server/services/cmc/__tests__/signed-registers-match-the-schema.test.ts`,
checks each descriptor against the Drizzle table it claims to describe. With the
bug put back:

```
$ npx vitest run server/services/cmc/__tests__/signed-registers-match-the-schema.test.ts
 × comparabilityAssessments > declares the id shape the primary key actually has
   → expected 'integer' to be 'uuid'
      Tests  1 failed | 48 passed (49)
```

`ci:validation-traceability` was also shown refusing the protocol rows before
their runner steps existed:

```
  [unexecuted-step] OQ-CMC-34: OQ-008-CMC-MODULE-3.md describes it; run.mjs does not execute it
  [unexecuted-step] OQ-CMC-35: OQ-008-CMC-MODULE-3.md describes it; run.mjs does not execute it
```

And the client test that asserted the old behaviour —
`cmcSuiteWrites.test.tsx`, which clicked Edit on a fixture whose status was
`'validated'`, chose `'retired'` from the dropdown and expected the PUT to
land — now asserts the new rule: Edit is disabled and says why, `Validate` is
withheld because the record already holds the signature, and `Retire` carries
the reason and nothing else.

## What remains, from the same survey

The survey ranked eight findings; four are closed here. The remaining four need
a column the table does not have, or have no reader:

| Register | Why it is not in this change |
|---|---|
| `stability_studies` (`status`, `shelf_life`) | **The highest-value one left.** `shelf_life` is §3.2.P.8's sole required field and the code itself calls it "a regulatory decision a person makes on the close-out form"; ICH Q1A's `status = 'failed'` finding makes the pre-submission verdict *hold*. The table has **no signer column at all**, so this needs an additive migration before the ceremony can record anything. |
| `cmc_change_control` (`status`, `approvers[]`) | §3.2.P.3's *Change History (ICH Q12)* table prints it. `approvers[]` asserts who approved with no signature behind it, and there is no single signer column; the shape needs deciding before it is governed. |
| `cmc_change_controls` (uuid proposal store) | Create-only, with no write form in the shipped client, so only a direct API caller reaches it. |
| `drug_substances.status` / `drug_products.status` offering `'approved'` and `'qualified'` | Nothing reads either as a governance act — the value's only consumer is the composer's retire filter. The defect is a surface asserting a completed approval, not a reader believing it. |

Two findings from the same survey are **not** about signing and are recorded
here so they are not lost:

1. **No ordinary register EDIT writes a record-level audit row.** URS-CMC-021
   covers the creates (`register-audit.ts`); the PUTs are bare updates and no
   middleware supplies one.
2. **`cmc_batch_records.disposition` is written by no application path.** It
   feeds the only *critical*-severity CMC contradiction, `batch_rejected` —
   the only one that can block a final export — yet the batch create's INSERT
   omits the column and the governed release writes `release_status` and
   `status` instead.
