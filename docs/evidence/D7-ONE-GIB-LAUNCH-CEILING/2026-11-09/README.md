# P-93: an FDA package over 1 GiB is refused before anyone signs (row D7, 2026-11-09)

The founder's decision, verbatim (`docs/LAUNCH_DEFINITION_OF_DONE.md`, "P-93 — FDA sequences over 1 GiB are out of scope
for launch", 2026-11-02):

> - **What is decided.** A sequence over the size the documented channel takes is refused **before signing**, with a
>   plain message, from `sequenceTransmitReadiness`. The undocumented SFTP transmit (`transmitViaSftp`,
>   `ssh2-sftp-client`) is retired: removed, its reachable replacement being that refusal, named by path in the
>   removing commit (working agreement).
> - **Owner.** RIM, under F1.

The design is `docs/evidence/RIM/2026-11-08-designs/p93-sequence-size-limit-retire-sftp.design.md`. It was critiqued
in two rounds; its section 1 is the full "What already exists" map, by path and line.

**A note for the coordinating session (design §9, question 1(b)).**
- The 1 GiB is the record's heading. It is **not** FDA's documented limit: the only FDA limit on file is 10 GB (Form
  5640 v2.0, `FDA_GATEWAY_LIMIT_BYTES`).
- The build refuses at 1 GiB, which fails closed. No message states 1 GiB as FDA's limit; it is worded as
  Concept2Cure's launch scope.
- Questions 1(a), 1(b), 3 and 4 went to the coordinating session on 2026-11-09. This build follows the design's
  defaults: FDA only, 1 GiB, and site (a) kept.

## What already exists (RULE 3), re-anchored on the tree at `a842e9603`

- `sequenceTransmitReadiness` (`server/services/submission-service/submission-service.ts`) is the transmit precheck.
  - It reads the status, the re-send rule, the dispatch verdict, the package identity, the typed number and the
    gateway's credentials.
  - **It never assembled, so it could not know a package's size.** Its comment said "same functions, same order"
    as transmit, but transmit runs a package re-check that readiness did not.
- Readiness's one caller is `precheckGovernedStep`, behind `POST /api/submissions/sequences/:seqId/governed-precheck`.
  It is reached from two places in the client:
  - `SubmissionCenter.tsx` asks it on the click and again in the e-signature dialog, both with an environment. A
    refusal there opens no e-signature.
  - The Dispatch tab (`SubmissionSeqWorkspaces.tsx`) reads it on mount, with no environment.
- `assertSequencePackageable` is the package gate. It assembles exactly as transmit does and judges
  `assembledTransmitBlockers`, at freeze, dispatch, renewal and their prechecks. It had no size rule.
- `transmitDispatchedSequence` re-checks the assembled package after the claim, before the gateway. It had no size
  rule either.
- `FdaEsgGateway.transmit` (`server/services/submission-gateways/fda-esg.ts`) switched every bundle over
  `1_073_741_824` bytes to `transmitViaSftp`. `ssh2-sftp-client` is declared nowhere, so every such send was
  refused **after** the signature: a 500 and a 'rejected' transmittal row.
- The guard's size check (`pre-transmit-check.ts`) holds sourced channel facts only (FDA 10 GB, EU 600 MiB). The
  launch ceiling is not one, so it does not go there (design §3.2, R7).
- Searched for an existing launch ceiling: `1_073_741_824|1073741824|1024 \*\* 3|2 \*\* 30|MAX_(SEQUENCE|PACKAGE|BUNDLE)`
  across `server`, `shared`, `client/src` and `scripts`, plus `shared/constants/launch-scope.ts`. The only hits were
  the SFTP switch and PMDA's unsourced warning.

## Commit 1: the refusal

- **`server/services/ectd/ectd-regional-rules.ts`**, beside `FDA_GATEWAY_LIMIT_BYTES`:
  - `LAUNCH_SEQUENCE_MAX_BYTES` is 2^30. A package of exactly 1 GiB is sent.
  - `launchSequenceSizeRefusal(sizeBytes)` gives the clause: "the package is 1.27 GiB, and at launch Concept2Cure
    sends packages of up to 1 GiB to FDA". A size that would read "1.00 GiB" is given in bytes. A size that is not a
    count of bytes is refused, never sent.
- **`submission-service.ts`**:
  - `packageBlockers(assembled, fda)` composes the region-blind rule with the clause, for an FDA package. It is the
    one composition for the package gate and transmit's re-check.
  - **(b) Readiness.** `withLaunchCeiling` runs after every earlier check clears, only for an FDA sequence and only
    when an environment is named. It runs the package gate's own assembly, judged on the size alone
    (`judge: 'size'`). A package that does not assemble cannot be measured, so it is refused. A busy converter passes
    through to the route's 503.
  - **(a) The package gate** (freeze, dispatch, renewal, and their prechecks) adds the clause. Its tail depends on
    whether the leaves can still change:
    - while they can: "Remove some of its leaves and place them in a later sequence, so that each package is 1 GiB or
      less.";
    - once frozen or dispatched: "The sequence is frozen, so its leaves can no longer be changed, and it cannot be sent
      as it is."
    - The existing tails are unchanged.
  - **(c) Transmit's re-check** adds the clause on the bytes it assembled. It releases the claim and voids the
    signature (P-23): "Transmit blocked — the package is …. Nothing was sent. The signature given for this transmit is
    now void; sign again for a new attempt."
  - No sentence names a retire act. P-86 has not landed, and no sentence describes an act that does not exist.
- No migration, no new non-test file, no client change, and no route change.

## Proof

| File | What it shows |
|---|---|
| `red.txt` | `launch-sequence-size.pglite.test.ts` at HEAD `a842e9603`: 6 of 12 fail. The 6 controls pass on the real assembler: exactly 1 GiB, no environment, another region, the scope pin, a non-US freeze, and a 1 GiB freeze |
| `green-commit1.txt` | every test naming a changed function or the rules module, and every submission-service test: 970 pass. The two failures are pre-existing on trunk: `gateway-selection`'s AUDIT_UNCONFIRMED case (with the coordinating session), and `refused-before-wire`'s audited-site count, fixed in `86723994c` in this push |
| `mutation-01` … `mutation-10` | each design mutation, red on its named case (table below). Each file records the restored file's sha256 against the original |

| Mutation | Red |
|---|---|
| 01 readiness without the size check | the over-1 GiB cases at readiness, and the unmeasurable case |
| 02 `>` → `>=` | exactly 1 GiB is sent |
| 03 no clause at the package gate | freeze, and dispatch of a frozen or dispatched sequence |
| 04 no clause at transmit's re-check | test 2 (the act) |
| 05 readiness assembles without an environment | the Dispatch tab's read does not assemble |
| 06 readiness assembles for every region | another region is not measured |
| 07 readiness judges the whole package gate | the scope pin |
| 08 readiness clears an assembly that fails | the unmeasurable case |
| 09 the locked tail gives the unlocked advice | dispatch of a frozen and of a dispatched sequence |
| 10 the clause for every region | a non-US freeze |

The tests:
- `server/services/submission-service/__tests__/launch-sequence-size.pglite.test.ts` (new): readiness, freeze,
  dispatch and renewal, on the real assembler with only the measured size overridden.
- `transmit-guard-refusal-releases-claim.test.ts`: the two SFTP-branch cases are **replaced in place** by one case on
  the same input. It is refused with `DISPATCH_BLOCKED` before the guard, the archive or the gateway; the claim is
  released and the signature voided. Their `integrity.ignoreSize` and storage size override went with them.
- `client/src/concept2cure/v2/__tests__/submissionCenterLaunchCeiling.test.tsx` (new; `submissionCenterLifecycleQa`
  is at the 500-line limit, so the case has its own file):
  - the click's precheck names the environment and refuses with the size sentence, so no e-signature opens and
    nothing is signed;
  - the Dispatch tab's read names none.
  - It pins how the screen renders readiness's refusal, so it passes before and after; the server tests carry the red.

The readiness, gate and act tests run as `vitest` on PGlite and in-memory doubles. The running-app check of design §4
is not in this commit.

## Plan

`Plan: F1`, `Completes: server/services/submission-service/submission-service.ts`, `Completes:
server/services/ectd/ectd-regional-rules.ts`. The holds are as `.design/claude-convergence/COORDINATION.md` records
them.
