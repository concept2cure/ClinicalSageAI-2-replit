# The Submission Center spine declares its FDA identity by the one rule (2026-10-29)

Launch row D7 (W5). Found in the CSR path review for LMN-201. Its CSR goes to
its existing IND as an information amendment, built on the Submission Center
spine (`submissions` → `ectd_sequences` → `assembleSequence` →
`transmitSequence`).

## What already exists

Searched `submission-id`, `submissionId`, `fdaSubmissionTypeFor`,
`resolveFdaSequenceIdentity`, `nextSequenceNumber`, `planSequence`,
`detectSequenceGaps`, `filedSequences`, `filed outside`, `CAT2-07` and
`Stage 9` across `server/`, `client/src/`, `docs/` and `migrations/`.

| Exists | Path | What it does | What it does not |
|---|---|---|---|
| The rule | `server/services/ectd/fda-sequence-identity.ts` `resolveFdaSequenceIdentity` | Decides a sequence's FDA submission type, sub-type and submission-id. An Amendment's submission-id is the first sequence of the activity it continues ("an IND amendment is … submission-id 0000"). It refuses a second Original Application, and an amendment naming nothing on file | Its header records that "the shared packager keeps its defaults for the other spine's callers": the package spine (`submission-ops.ts`) calls it; the Submission Center spine never did |
| The type mapping | `core-to-packager.ts` `fdaSubmissionTypeFor` | Maps the sequence type to an FDA submission type and sub-type (amendment/response → Original Application + Amendment) | Sets no submission-id |
| The packager | `regional-packager.ts` | `submissionId = fda.submissionId ?? input.sequence` | Every main-spine sequence therefore declared its own number |
| The filed history | `ectd_sequences.dispatch_status` (`sent`, `acknowledged`) | What is on file, as `prior-sequence-loader.ts` reads it | — |
| Sequences filed outside the platform | MR-10 Stage 9 (CAT2-07, STILL_OPEN) | A full plan: parse earlier `index.xml` and `us-regional.xml`, then a signed import | Blocked on the full ICH heading map, which needs the ICH DTD; that DTD is not vendored (`assets/ectd-dtd/`) |

## This change (slice 1)

- `server/services/ectd/sequence-spine-fda-identity.ts` decides the
  submission-id through `resolveFdaSequenceIdentity`.
  - The activity an amendment or response continues is the submission's
    Original Application: its earlier sequence in the same region (numbering
    restarts per region) typed `original` that the agency has not rejected.
    One not yet sent counts. The filing-order guard
    (`submission-service.ts` `filingOrderRefusal`) sends it first, so a
    follow-up can be built and frozen while it is in flight.
  - An original, an annual report and an IND safety report open their own
    activity and declare their own number.
  - Whatever the resolver refuses is refused, by name.
- `package-from-core.ts` passes the result to the packager
  (`buildPackagerInputFromCore` `fdaSubmissionId`).
- `assemble-from-core.ts` records a refusal as `ECTD_ASSEMBLE_BLOCKED`
  (`fda_submission_identity`) and raises `EctdAssemblyBlockedError`, as the
  path-safety refusal does. The assemble route answers it with a 422.
- An amendment with no Original Application on file is refused: "its
  submission-id would have to be guessed. Nothing was packaged." This is the
  case of every existing IND whose earlier sequences were filed outside the
  platform. Slice 2 lets a sponsor declare them.

## Slice 2 (next): sequences filed outside the platform, declared

A narrow part of Stage 9 that the missing DTD does not block. The plan's own
words cover it: "a declared baseline the user signs as cumulative". The
sponsor declares that sequences 0000–N of this application were filed outside
the platform, and which of them opened the Original Application. That
declaration is recorded on the submission as a governed act, like the market
application number. Then:
- the next number offered is N+1;
- a sequence numbered at or below N is refused;
- an amendment's submission-id names the declared original;
- dispatch readiness does not treat the first platform sequence as the
  original IND.

Replace, append and delete still refuse against leaves the platform does not
hold, until Stage 9's import. A CSR amendment files new leaves, so this is
enough for LMN-201.
