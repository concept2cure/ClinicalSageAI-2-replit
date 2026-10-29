# D7: an IND amendment names its Original Application (2026-10-29)

Session `…01E8btkB`, W5. Found in the CSR path review for LMN-201
(`docs/design/CSR_PATH_REVIEW_2026-10-29.md`): its CSR goes to its existing
IND as an information amendment, built on the Submission Center spine. Design
and plan: `docs/design/SEQUENCE_SPINE_FDA_IDENTITY_2026-10-29.md`.

## The defect

On the Submission Center spine (`submissions` → `ectd_sequences` →
`assembleSequence`), every IND amendment's `us-regional.xml` said, for
sequence 0002:

```xml
<submission-id submission-type="fdast1">0002</submission-id>
<sequence-number submission-sub-type="fdasst4">0002</sequence-number>
```

The sub-type said Amendment. The submission-id opened a regulatory activity of
its own. An IND amendment continues the IND's Original Application, so its
submission-id is that application's first sequence: `0000`. The shared
packager defaults the submission-id to the sequence's own number
(`regional-packager.ts`, `fda.submissionId ?? input.sequence`), and this spine
passed none.

## What already exists

| Exists | Path | What it does | What it did not do |
|---|---|---|---|
| The rule | `server/services/ectd/fda-sequence-identity.ts` `resolveFdaSequenceIdentity` | Decides a sequence's FDA type, sub-type and submission-id. Refuses a second Original Application, and an amendment naming nothing on file | Only the package spine (`submission-ops.ts`) called it. Its header left "the other spine's callers" to the packager's default |
| The type mapping | `core-to-packager.ts` `fdaSubmissionTypeFor` | Sequence type → FDA type and sub-type | Sets no submission-id |
| The packager | `regional-packager.ts` | Writes `us-regional.xml` | Defaults the submission-id to the sequence's own number |
| The filing-order guard | `submission-service.ts` `filingOrderRefusal` | Sends a submission's sequences in order | — |
| Sequences filed elsewhere | MR-10 Stage 9 (CAT2-07, STILL_OPEN) | Planned import of earlier `index.xml` | Blocked: the ICH DTD is not vendored (`assets/ectd-dtd/`) |

This change converges the Submission Center spine onto the existing rule. It
adds no second rule.

## What changed

- **`server/services/ectd/sequence-spine-fda-identity.ts`** (new):
  `sequenceSpineFdaSubmissionId`.
  - It reads the submission's Original Application: the earlier sequence in
    the same region, typed `original`, that the agency has not rejected. One
    not yet sent counts, because the filing-order guard sends it first.
  - It hands that to `resolveFdaSequenceIdentity` and returns its
    submission-id.
  - It refuses what the resolver refuses (`FdaSubmissionIdentityRefusal`).
- **`package-from-core.ts`** calls it for an FDA sequence and passes the
  result to **`core-to-packager.ts`** (`fdaSubmissionId`).
- **`assemble-from-core.ts`** records a refusal as `ECTD_ASSEMBLE_BLOCKED`
  (`fda_submission_identity`, with the code) and raises
  `EctdAssemblyBlockedError`. The assemble route answers it with a 422, as it
  does the path-safety refusal.

| Sequence | Before | After |
|---|---|---|
| 0000 `original` | `fdast1` 0000 | `fdast1` 0000 |
| 0002 `amendment` | `fdast1` / `fdasst4`, submission-id **0002** | `fdast1` / `fdasst4`, submission-id **0000** |
| 0003 `annual` | `fdast5` 0003 | `fdast5` 0003 |
| amendment, no Original Application in this submission | built, submission-id = own number | **refused**: "Its submission-id would have to be guessed. Nothing was packaged." |
| amendment, Original Application rejected by the agency | built | **refused** |
| amendment, Original Application only in another region | built | **refused** |
| a second sequence typed `original` | built, a second Original Application | **refused**: "already filed this application's Original Application" |

## Evidence: seen failing first

`sequence-spine-fda-submission-id.pglite.test.ts` (new) assembles real
sequences on the IND pglite harness and reads `m1/us/us-regional.xml` out of
the bundle.

| Check | Red (`red.txt`, the unchanged spine) | Green (`green.txt`) |
|---|---|---|
| The amendment names 0000 | fails: the bundle says 0002 | passes |
| An annual report, and the original, declare their own number | pass (controls) | pass |
| Three amendments with no Original Application to name are refused | fail: each is built | pass |
| A second `original` is refused | fails: it is built | passes |
| Total | 5 failed, 2 passed (7) | 7/7 |
| The seven suites whose fixtures were typed (below) | — | 66/66; with the new suite, 73/73 across 8 files |

Wide run (`wide.txt`): `server/services/ectd`, `submission-service`,
`ind-lifecycle` and `submission-gateways`, 3285 tests in 272 files.
- With the change: 67 tests fail, in 10 files.
- The same 10 files with the parent's three spine files: the same 67 fail.
  None of them is this change's.
- Five are in the gateway packager (`packageEctdSubmission`). Their fixture
  PDFs are refused by `original-pdf-preservation.ts` ("The original PDF has no
  readable catalog and page tree"), which this change does not touch.
- Five are in `submission-service`. They are the files that already failed
  before this change.

## Fixtures changed, and why

Seven suites built follow-up sequences with no `type`, so the column's default
made each of them a second `original`. The rule refuses that, as it must. Each
fixture now types its rows: 0000 `original`, the follow-ups `amendment`.

- `assemble-from-core.multisource`
- `lifecycle-declared-acts.pglite`
- `lifecycle-from-core`
- `lifecycle-rehearsal.pglite`
- `vault-version-lifecycle-binding.pglite`
- `withdrawal-approval-binding.pglite`
- `freeze-gate-binding.pglite`: also its templated validated sequence, and
  its EMA row

Every production writer of a sequence sets the type: the Submission Center
and IND Lifecycle. The seeds create only 0000 `original`. Only a raw API call
that omits the type is defaulted to `original`, and it is now refused as a
second Original Application rather than built as one.

## Not done

- **Sequences filed outside the platform** (slice 2, in the design). LMN-201's
  IND already has sequences. On this spine its first platform sequence is
  0000, and an amendment there is refused because no Original Application is
  held. The next step lets a sponsor declare, as a governed act, that
  sequences 0000–N were filed elsewhere and which opened the Original
  Application.
- **A first platform sequence typed `original` but not numbered 0000** (one
  the IND Lifecycle lets a user number) is still built as a new Original
  Application under its own number, as before. Refusing it needs to know what
  was filed elsewhere, which is slice 2.
- A sequence typed `response` is coded as an amendment to the Original
  Application (`fdaSubmissionTypeFor`, `fdasst4`), so it names the Original
  Application too. On this spine, no sequence can continue any other activity
  (for example an annual report's).

## Disclosed (files another lane changed in the last 24 hours)

`0d05148bc` and `982ccf229` (trunk green, D7) changed three of the fixtures
above: `lifecycle-declared-acts.pglite`, `lifecycle-from-core` and
`vault-version-lifecycle-binding.pglite`. This change only adds the `type`
column to their `ectd_sequences` rows.
