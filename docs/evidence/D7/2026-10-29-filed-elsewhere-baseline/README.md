# D7: sequences filed outside the platform, declared (2026-10-29)

Session `…01E8btkB`, W5. Slice 2 of
`docs/design/SEQUENCE_SPINE_FDA_IDENTITY_2026-10-29.md`, and part of MR-10
Stage 9 (CAT2-07): "a declared baseline the user signs as cumulative". Design
and **What already exists**: `docs/design/FILED_ELSEWHERE_BASELINE_2026-10-29.md`.

## Why

LMN-201's IND already holds sequences, filed with another tool. On the
Submission Center spine:
- the first platform sequence was always 0000, an Original Application;
- since slice 1, its CSR amendment was refused, because no Original
  Application is held here and the submission-id would have to be guessed.

So Lumen could not file the CSR on the platform at all.

## What already exists

Summarised from the design:
- `createSequence` checked no number against anything.
- The Submission Center numbered only from its own rows.
- The FDA identity knew only an Original Application held here.
- `market-application-number.ts` is a submission identity fact, recorded
  without a signature.
- `signGovernedAct` and the content binders are the platform's one signing
  ceremony.
- The commitment fulfilment migration already refuses an unsigned record at
  COMMIT.
- Stage 9's import (`legacy-sequence-import.ts`, `ectd_sequences.origin`) was
  never built: it is blocked on the ICH DTD.

Nothing recorded sequence numbers taken outside the platform, and nothing was
deleted. This change completes the spine with a declaration. It does not
rebuild the import.

## What changed

- **`migrations/20261029g_submission_filed_baselines.sql`** (in
  `C2C_MIGRATION_FILES` before the tail; the tenant purge list).
  - Public, with `organization_id INTEGER NOT NULL`, append-only (UPDATE and
    TRUNCATE refused), US only.
  - A deferred constraint trigger refuses, at COMMIT, a row without its own
    signature. The signature must be:
    - governed-action, on `submission-filed-baseline:<id>`;
    - basis `filed-sequence-baseline-content-sha256`;
    - by the declarer, meaning approval or responsibility;
    - over the same sequences and evidence sha256.
- **`submission-service/filed-sequence-baseline.ts`**: the act, and
  `sequenceCreationRefusal`.
- **`submission-service/filed-sequence-baseline-content.ts`**: the reads and
  the digest (recipe `filed-sequence-baseline/v1`).
- **`part11/governed-target-binders.ts`**: the binder.
- **`signature-persistence.ts`**: the basis.
- **`routes/submission-filed-baseline.ts`**: `GET`/`POST
  /api/submissions/:id/filed-baseline`, mounted beside the submission core.
  - Both read the submission under current project access first.
  - The POST is `signGovernedAct` (reason, meaning, password, signing
    authority), with the content basis declared.
- **The act, in one transaction:**
  - the project's lead or a manager;
  - the evidence, a retained Vault document of the organization, read FOR
    SHARE;
  - the submission's US sequences locked, refused when one is frozen or
    dispatched, or numbered within the declared ones (or typed `original`)
    and holds content;
  - empty drafts of that kind removed, and named in the signed record;
  - an unchanged declaration refused.
- **`createSequence`** (both creators): a number N or lower is refused and the
  next is named; `original`, or no type, is refused.
- **`sequence-spine-fda-identity.ts`**:
  - the declared original joins the openers;
  - a sequence numbered N or lower is refused at assembly;
  - the "no Original Application" refusal now says to declare.
- **Submission Center** (`FiledElsewhereBaseline.tsx`, mounted in
  `SubmissionCenter.tsx`):
  - shows the declaration in force, who declared it and when;
  - offers "Declare sequences filed before this platform" (the facts, then the
    shared EsignModal);
  - numbers the next sequence after the declared ones;
  - when the read fails, says so and offers no number.

For LMN-201: Lumen declares 0000–N, with the FDA acknowledgment of N from the
Vault. The CSR amendment is then sequence N+1, typed amendment, and its
`us-regional.xml` names submission-id 0000.

## Evidence: seen failing first

| Check | Red | Green |
|---|---|---|
| `filed-baseline-effects.pglite.test.ts` (new), 9 cases. On the IND pglite harness, through `assembleSequence` and `createSequence`:<ul><li>the amendment names 0000;</li><li>a declared original of 0003 is named;</li><li>the latest declaration is in force;</li><li>a number within the declared ones is refused at assembly and at creation;</li><li>a second original is refused.</li></ul> | `red-effects.txt`: against slice 1's identity and `createSequence`, 7 fail and the 2 controls pass | 9/9 |
| `submission-filed-baseline.pglite.test.ts` (new), 18 cases. The real router, ceremony, binder, signature INSERT and migration. Covers:<ul><li>the signature binds the re-derived digest;</li><li>the read back;</li><li>a draft removed and named;</li><li>a change is a new row;</li><li>ten refusals with nothing written;</li><li>the standing asked before the password;</li><li>an unsigned row refused at COMMIT;</li><li>UPDATE and TRUNCATE refused;</li><li>the migration replays.</li></ul> | `red-act.txt`, five mutations, each caught:<ul><li>no COMMIT guard: 2 fail;</li><li>no binder: 6 fail;</li><li>no lead gate: 2 fail;</li><li>a frozen sequence ignored: 1 fails;</li><li>no project-access read: 1 fails.</li></ul> | 18/18 |
| `filedElsewhereBaseline.test.tsx` (new, 6), and two new Submission Center cases in `submissionCenterCreate.test.tsx`: after a declaration the first platform sequence is 0042, an amendment; with none, 0000 or a declaration | `red-client.txt`: the next number ignoring the declaration fails its case; a failed read offering a number fails its case | 6/6 and 6/6 |
| The wide server run (`wide.txt`): ectd, submission-service, ind-lifecycle, submission-gateways, part11, tenant and the route tests, 4284 tests | Two suites failed on this change; fixed (below) | Slice 1's ten baseline files fail with the same counts per file. Two more are static checks of files this change does not touch. Nothing else fails |

## Fixtures changed, and why

The Submission Center now reads the declaration before it offers a number,
and a failed read offers none. Three suites' mocks answered no such read, so
they lost the next-sequence control. Each now answers `{ baseline: null }`,
nothing declared:
- `submissionCenterCreate`
- `submissionCenterGovernedWorkspaces`
- `submissionCenterOpensOnSequence`

The IND pglite harness applies the real migration with `submissionCore`,
because `createSequence` and the FDA identity read it.

`createSequence` first read the declaration through `pool`. Two suites mock
only `db`:
- `ind-filing-flow-pglite.integration` (3 cases): its mock has no `pool`;
- `create-sequence-fda-variation` (1 case): its `pool` has no `query`.

The read now goes through `db`, as the rest of `createSequence` does. The
variation suite's `db` mock answers the read with no declaration (15/15
across the three suites, `wide.txt`).

## Not done

- Replace, append and delete against leaves filed elsewhere are still refused:
  the leaves are not held. That is Stage 9's import.
- Regions other than the US.
- A declaration whose signature is later revoked still counts. The database
  checks the signature at COMMIT; the packaging path does not re-check it.
- No withdrawal of a declaration. A new one corrects it until a sequence is
  frozen.

## Disclosed (files another lane changed in the last 24 hours)

- `scripts/db/migration-set.mjs` (`5985619e5`, `07d0116f9`): one set entry.
- `server/db/pglite-harness.ts` (`3ecb4cda4`): the migration under
  `submissionCore`.
- `server/services/part11/governed-target-binders.ts` (`5985619e5`,
  `84aada8f7`, `765f2b399`): one binder and its registration.
- `server/services/part11/signature-persistence.ts` (`84aada8f7`,
  `765f2b399`): one `BINDING_BASIS` entry.
- `server/services/tenant/tenant-offboarding.ts` (`e2cf417ba`, `07d0116f9`):
  one purge-list entry.
