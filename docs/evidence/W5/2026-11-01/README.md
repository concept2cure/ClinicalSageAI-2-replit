# This session's D7 work, aligned to the one design plan — 2026-11-01

**Session:** "biotech / MDx regulatory documents end to end" (`session_015weqdGsmiSPjTqK9wiCacL`). It
worked launch row D7 (W5), the sequence path to FDA. Its earlier record is `../2026-09-22/README.md`.

**Plan:** `docs/design/ONE_DESIGN_PLAN.md`, its ledger `docs/design/one-design-plan.json`, `CLAUDE.md`
RULES 3, 5 and 6, and the file holds in `.design/claude-convergence/COORDINATION.md`.

**Asked by the founder:**
- 2026-10-25: "Finish all this work. Make smarter choices and stay aligned with the UI work."
- 2026-11-01: "Continue but stay aligned with [the filing-types session] and our hard new rules and
  roadmap."

The filing-types session's own alignment record is the pattern followed here
(`docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-11-01-plan-alignment/README.md`).

## How the status was checked

Each open item of the 2026-09-22 record ("Not done, and why") was re-checked against the code at HEAD
`5f30fdda0d` on 2026-11-01. Fourteen read-only agents did it in two rounds; the first round was at
`91dbdb9a4` and its gateway files are unchanged since. Every claim cites file and line, and every
repair was shown red before it was fixed.

**What the plan changes for this work:**
- One open package per commit, with its `Plan:` and `Completes:` trailers.
- No file another session holds.
- Nothing new: every repair below completes an existing file.
- A held item goes to its holder, with the proposal, rather than being raced.

## The mapping

| Item (2026-09-22 "Not done") | Status at `5f30fdda0d` | Package | Who |
|---|---|---|---|
| AS2 receipt checks: MIC and MDN signature | **Fixed** by `e1f3fd425` (2026-10-17, `as2-cms.ts`, `classifyVerifiedAs2Delivery`) | — | — |
| DP-81 (2026-10-19 review): an unverified AS2 answer was served as the agency's acknowledgement | **Fixed here**, `8d5bbef3bc`, evidence `dp81/` | F1 | this session |
| DP-81 part 2: a receipt upload overwrites the endpoint's earlier answer | Open; in `fda-esg-receipts.ts` | F1 | **RIM** (holds the file) |
| Filing order at transmit | Open, **high** once a staging send stops counting as filed (RIM's slice 2) | F1 | **RIM** (`submission-service.ts`) |
| A held FDA ESG send: the signer is told "Nothing was sent"; nobody else is told; it cannot be settled without a signed MDN | Open, **high** | F1 (A1–A4); the founder (A5) | **RIM**; the founder |
| ICSR `transmission_unconfirmed` has no release route | Out of launch scope: the ICSR routes answer 403 `LAUNCH_SCOPE` (P-32) | — | when IND safety reporting opens |
| `ssh2-sftp-client` (bundles over 1 GiB) | Open, low. **Not declared**: no FDA source in the repository documents an SFTP channel (a new integration under RULE 6). The refusal comes only after signing, as a 500 | F1 | **RIM** (the refusal before signing needs `sequenceTransmitReadiness`); the founder (scope) |
| `classifyDocument` changes a verdict row's module | **Fixed** by `c3f2b287a` (2026-10-01) | — | — |
| Two approval role tables; quorum met by a completed assignment with no decision | **Fixed** by `7038fec50a` (2026-10-01) and `c91dba5264` (2026-10-09) | — | — |
| The second role table left in `decision-architecture.ts`, and `isActorAuthorized` admitting an action nobody listed | **Fixed here**, `d3be2ca7b7`, evidence `author-not-approver/` | F1 | this session |
| An author can approve their own artifact, which P-18 forbids (found while re-checking the quorum) | **Fixed here**, `7b7b043fda`, evidence `author-not-approver/` | F1 | this session |
| Device titles: a word beginning "plan" (plantar, planar) reads as a plan; a mixed-case "IfU" is not the IFU | **Fixed here**, `fda2509d8d`, evidence `device-titles/` (a regression from this session's `2364f546dd`) | F1 | this session |
| AnA package tool (a): a first sequence written `'0'` | **Fixed here**, `c60cdcac25`, evidence `sequence-four-digits/` | F1 | this session |
| AnA package tool (b): an upper-case `'DELETE'`; (c): `modified_file` not checked against the filed manifest | Open, low | F1 | **filing types** (holds `AnaToolExecutor.ts`) |
| Shadow Review run records no leaf manifest | **Fixed** by `3cacf2e15a` (2026-10-25) | — | — |
| Readiness does not report unapproved leaves | **Fixed**: readiness and transmit agree | — | the founder (below) |
| FDA Module 1 elements outside the published table; the licensed artefacts and credentials | Blocked, unchanged: the us-regional DTD, FDA's valid-values and ESG credentials | — | Procurement, Regulatory Ops |
| A durable record of what each transmit filed | Partly fixed: `3cab286e12` (2026-10-29) keeps the exact bytes sent | — | RIM's slice 1 |
| The per-organization finalization policy | Superseded by DP-35 (2026-10-01): a freeze is a content lock, never an approval | — | — |

## For RIM (`011e42…`), in its held files

Each proposal adds no file, route, table or migration.

**1. Filing order at transmit** (`submission-service.ts`).
- `filingOrderRefusal` runs at freeze and dispatch only. A probe at HEAD had 0001 and 0002 both
  dispatched-pending and replacing the same `m3.2.s.1` leaf: the transmit precheck cleared both.
- Proposal: reuse the rule with step `'transmit'`, in three places:
  - in `sequenceTransmitReadiness`, so the precheck refuses before anyone signs;
  - under `claimTransmitSlot`'s locks, taking the submission row `FOR UPDATE`;
  - with a step-aware HIGHER filter: a higher sequence holds only when it is filed or transmitting.
    Without that filter, the pre-rule frozen pair that the dispatch exception frees would deadlock.
- The proposed test extends `freeze-gate-binding.pglite.test.ts`.

**2. A held FDA ESG send.**
- **A1 — the signer is told the truth.** A `GatewayError` has no `code`, so the route answers
  `500 INTERNAL "Request failed."`. `runTransmit` then appends "Nothing was sent." But the gateway's
  own sentence says FDA may hold it.
  - Server, `routes/submissions.ts`: map `GatewayError` to `OUTCOME_UNKNOWN` with the gateway's
    sentence. The client already treats `OUTCOME_UNKNOWN` as unconfirmed.
  - Client copy, `SubmissionCenter.tsx`: drop "Nothing was sent." when `done.unconfirmed`, and point
    to Gateway transmittals.
  - They ship together: alone, the server half would read "FDA may hold it … Nothing was sent."
- **A2 — others are told.** On the not-refused-before-wire branch, best effort and never masking the
  error:
  - `replaceSourceTask` on `ectd_sequence`, assigned to the signer. It reaches Home's open items,
    because `OpenWork.tsx` reads `my-work`.
  - `createNotification` in the existing `submission_status` category, opening Gateway transmittals
    on the row.
  - The receipt ingest closes the task when the sequence resolves.
- **A3 — a door.** A "Record agency MDN" door on an in-transit row of the Dispatch tab.
- **A4 — the Submit step.** `dispatchStatus` on `LatestSequence`, so "Cleared to dispatch" is not said
  of a sequence held in transit.
- **A5 — settling without a signed MDN** is the founder's decision (below).

**3. DP-81 part 2** (`fda-esg-receipts.ts:74-89`).
- Carry the endpoint's earlier `as2Receipt` into `as2ReceiptHistory`, computing its `sha256` first.
- Stop overwriting a non-null `mdn_raw`.
- Label the upload time as the time recorded.

**4. A bundle over 1 GiB is refused only after signing**, as a 500.
- A deterministic `gateway-transport-limit` check in `pre-transmit-check.ts` (unheld) gives a 422
  with the guard's own sentence. That needs `PRE_TRANSMIT_BLOCKED: 422` in `routes/submissions.ts`.
- Refusing before signing needs the package size in `sequenceTransmitReadiness` (RIM's file).
- `transmitViaSftp` stays until the founder decides.

## For the filing-types session (`011Fyq…`), in `AnaToolExecutor.ts`

`package_ectd_for_region` has two remaining defects:
- **(b)** An upper-case `'DELETE'` passes unvalidated. It is refused for the wrong reason, or packaged
  with `operation="DELETE"`, an href and the withdrawn bytes. Proposal: map every leaf's operation
  through the existing `toOperation` (`ectd/core-to-packager.ts:154`, exported) right after the
  non-empty check, and refuse an unreadable one by name.
- **(c)** A declared `modified_file` is never checked against the filed manifest. Proposal: resolve it
  through the prior-sequence loader the Submission Center path already uses.

Part (a) was fixed in the packager itself (`c60cdcac25`), so every caller is covered.

## For the founder

1. **A held FDA send with no signed MDN.** May a signed act, with re-authentication and a
   Vault-retained agency document, do either of these?
   - release it as not received, on FDA's written confirmation of non-receipt (a duplicate-filing
     risk);
   - record it as received on Ack2 or Ack3 evidence?

   Today nothing settles it: the rollback route was removed on 2026-10-17 because it contradicted
   what the agency held.
2. **FDA sequences over 1 GiB.** Are they in scope for launch? If so, by which channel? SFTP has no
   FDA source in the repository.
3. **Historic acknowledgement downloads already recorded as 'agency'** before DP-81 was fixed. Do
   sponsors who filed one need a notice?
4. **An uploaded PDF leaf (`ctd_onboarding_documents`)** carries no approval state, so it is released
   without one. Must an onboarding upload be approved before it can be filed?
5. *(Answered: P-95, 2026-11-02, clarified under P-107 on 2026-11-09. Landed on the artifact door: the review round
   advances, `0f7706e637`; Q1, the reviewer is neither signer nor author, `64e7ea1824`; no review is refused
   409 REVIEW_REQUIRED, `72232bdbc0`. Evidence `p95/`, `p95-q1/`, `review-round/`.)*
   **Concept2Cure artifacts can be approved with no reviewer assigned**, by design
   (`artifact-approval-act.ts`), and no screen assigns reviewers. Should review be mandatory?
   Reaching the existing reviewer-assignment route from the editor is a D4 or R1 choice.

## What this session does next

1. ~~Land the three repairs in progress.~~ *Landed 2026-11-02: `fda2509d8d` device titles, `7b7b043fda`
   author is not the approver, `d3be2ca7b7` the stale role table. Each was red first and reviewed by
   two adversarial lenses; the lane's holds are released in `COORDINATION.md`.*
2. ~~P-95 on the artifact door.~~ *Landed 2026-11-09 (above). Next on that door: Q2, two completed reviewers
   where the artifact's contract names `regulated_dual_review`. It is designed first, because the contract is
   resolved per request today and must be read from the artifact's own record.*
3. Nothing in another session's held files. What remains on D7 is RIM's (above), the filing-types
   session's (above), the founder's five questions, and the licensed artefacts and credentials.
