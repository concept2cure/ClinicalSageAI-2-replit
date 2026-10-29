# Sequences filed outside the platform, declared (2026-10-29)

Launch row D7 (W5). Slice 2 of
`docs/design/SEQUENCE_SPINE_FDA_IDENTITY_2026-10-29.md`, and the part of MR-10
Stage 9 (CAT2-07) that the missing ICH DTD does not block. Stage 9's plan
allows it in its own words: sequences are refused unless they are
"consecutive from 0000 or from a declared baseline the user signs as
cumulative".

LMN-201's IND already holds sequences, filed with another tool. On the
Submission Center spine:
- the first platform sequence is 0000, typed `original`;
- since slice 1, an amendment with no Original Application held on the
  platform is refused, because its submission-id would have to be guessed.

So Lumen cannot file its CSR amendment here until the platform knows what was
already filed.

## What already exists

Searched `baseline`, `prior_sequence`, `last_filed`, `starting_sequence`,
`external_sequence`, `filed_outside`, `first_sequence` and `origin` in
`migrations/`, `db/migrations/` and `shared/`. Searched `nextSequenceNumber`,
`createSequence`, `filingOrderRefusal`, `planSequence`, `detectSequenceGaps`,
`isOriginalSequence` and `hasEarlierSequence` across `server/` and `client/`.
Ran `git log --all --diff-filter=D` for `*baseline*`, `*external-sequence*`,
`*prior-filed*`, `*filed-outside*` and `*sequence-import*`.

| Exists | Path | What it does | What it does not |
|---|---|---|---|
| The sequence writer | `submission-service.ts` `createSequence` | The one INSERT into `ectd_sequences`, for the Submission Center and IND Lifecycle | Checks no number against anything; defaults the type to `original` |
| The Submission Center's numbering | `SubmissionCenter.tsx` `nextSequenceNumber`, empty state | Next = the highest platform number + 1; an empty submission offers only "Start sequence 0000" (`original`) | Knows only platform rows |
| The FDA identity | `sequence-spine-fda-identity.ts` (slice 1) | An amendment names the submission's Original Application | Only an Original Application held on the platform |
| The filing-order guard | `submission-service.ts` `filingOrderRefusal` | Orders platform sequences that share lifecycle keys | Allows a first platform sequence of 0005 |
| Dispatch readiness | `assess-dispatch-readiness.ts` `isOriginalSequence`, `isOriginalApplicationSequence` | Holds a sequence typed `original` (or numbered 0000) to the initial-IND rules | Counts only platform rows as earlier |
| Lifecycle against earlier leaves | `package-from-core.ts` `dropUnbindableLifecycle` | Refuses replace, append and delete when no filed leaf is held | — (correct: the leaves are not held) |
| The governed-act model | `market-application-number.ts` | A submission identity fact: lead or manager, a reason, an audit row | Not signed |
| The signing ceremony | `routes/governed-signed-act.ts` `signGovernedAct` | Reason, meaning, password, authority, ledger pair and signature in one transaction; content binders by target prefix | — |
| Evidence a signature binds | `filed-sequence-rejection.ts`, `commitment-fulfilment` | Bind a Vault document's content hash; the database refuses an unsigned record at COMMIT (`20261019_commitment_fulfilment_evidence.sql`) | — |
| The full import | MR-10 Stage 9 (`legacy-sequence-import.ts`, `filed-sequence-import.ts`, `ectd_sequences.origin`) | Planned | None of it exists; blocked on the ICH DTD |

Nothing records that sequence numbers were taken outside the platform.
Nothing was deleted.

## Design

### The record

`public.submission_filed_baselines`
(`migrations/20261029g_submission_filed_baselines.sql`). One row per
declaration; the latest for a submission and region is current. A change is a
new row.
- What it holds:
  - the submission and the region, `fda` only in this slice;
  - the last sequence number filed elsewhere, N;
  - the sequence that opened the Original Application, O (O ≤ N, normally
    0000);
  - the Vault document holding the evidence, and that document's sha256;
  - the reason, who declared it and when.
- It is public, with `organization_id INTEGER NOT NULL`, before the tail of
  `C2C_MIGRATION_FILES`. It is in the tenant purge list. It has no foreign key.
- UPDATE and TRUNCATE are refused.
- **The database refuses an unsigned declaration at COMMIT.** A deferred
  constraint trigger requires, from the same transaction, a live
  `governed-action` signature with these properties:
  - target `submission-filed-baseline:<id>`;
  - basis `filed-sequence-baseline-content-sha256`;
  - signed by the declarer;
  - meaning approval or responsibility;
  - a manifest naming the same N, O and evidence sha256.

  This mirrors the commitment fulfilment guard.

### The act

`POST /api/submissions/:id/filed-baseline`
(`server/routes/submission-filed-baseline.ts`), through `signGovernedAct`. The
fields are N, O and the Vault document; the signature components are reason,
meaning, password and code.
- **The binder.** `governed-target-binders.ts` binds
  `submission-filed-baseline:<id>` to a digest (recipe
  `filed-sequence-baseline/v1`) over:
  - the submission and region;
  - N and O;
  - the Vault document and its sha256.

  The act declares that basis, so a binding that falls back is refused.
- **Refused by name, with nothing written.**
  - The submission is another organization's, is not an FDA one, or has no
    project.
  - The signer is not the project's lead or an organization manager (the
    market number's gate).
  - A number is malformed, or O > N.
  - The evidence is not a retained Vault document of this organization.
  - The submission's FDA sequences are locked for the check, so a freeze
    waits for the declaration, or the declaration for the freeze. The act is
    refused when a platform sequence there:
    - is frozen or dispatched. Its submission-id and number were signed
      under the declaration then in force, and the sequence signature does
      not bind it;
    - is numbered N or lower, or is typed `original`, and holds content.
  - The declaration is the same as the current one.
- **Empty drafts are replaced.** An empty draft numbered N or lower, or typed
  `original`, is removed by the act (`deleted_at`): a "Start sequence 0000"
  that was never used. There is no other way to remove a sequence. The signed
  record names each one (`removedDraftSequences`).
- **The read.** `GET /api/submissions/:id/filed-baseline` returns the current
  declaration, with who signed it, when, the meaning, and the signature.

### What it changes

- **`createSequence`** reads the baseline for the submission and region. Both
  creators (Submission Center and IND Lifecycle) are covered.
  - A number N or lower is refused: it was filed elsewhere.
  - A sequence typed `original`, or with no type, is refused: O opened the
    Original Application.
- **The FDA identity** (`sequence-spine-fda-identity.ts`).
  - The declared original joins the openers, so an amendment numbered N+1 or
    higher names O.
  - A sequence numbered N or lower is refused at assembly: the second check,
    behind `createSequence`.
- **The Submission Center.**
  - The next number offered is max(platform, N) + 1.
  - An empty submission with a declaration offers its first follow-up at N+1,
    not 0000.
  - Without a declaration, it offers both "Start sequence 0000" and "Declare
    sequences filed before this platform".
  - Above the sequence list: "Sequences 0000–N were filed outside the
    platform. Sequence O opened the Original Application", with who declared
    it and when.
  - When the declaration cannot be read, the screen says so and offers no
    sequence number. It never treats the failure as "nothing declared",
    because 0000 may already be taken.
- **Dispatch readiness** needs no change. No platform sequence after a
  declaration is typed `original` or numbered 0000, so the initial-IND rules
  do not apply to it; the continuing-IND rules (Form 1571 at 1.1, the cover
  letter at 1.2) do.

## Not in this slice

- Replace, append and delete against leaves filed elsewhere. They are still
  refused, because the leaves are not held. That is Stage 9's import.
- Regions other than FDA. Their sequence relationships (for example the EU's
  related sequence) are not decided here.
- Withdrawing a declaration. A mistake made before any FDA sequence is frozen
  is corrected by a new declaration. After one is frozen, the declaration is
  fixed.
- A declaration whose signature is later revoked still counts. The database
  checks the signature at COMMIT, as the commitment fulfilment does. The
  readers on the packaging path do not re-check it.
- The cover letter's "Initial IND" heading follows `submissions.lifecycle_stage`
  (`ind-lifecycle/cover-letter-context.ts`), a field of its own. It is not
  read from this declaration.
