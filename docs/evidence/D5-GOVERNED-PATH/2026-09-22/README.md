# D5: governed changes on the canonical path

**Row:** D5, Part 11 evidence (`docs/LAUNCH_DEFINITION_OF_DONE.md`).

**Source:** the four critical findings of the first weekly review
(`docs/evidence/reviews/2026-09-22/README.md`: P1, T1, P2, P3).

**Claim:** `CLAIM.md` in this folder, pushed before any code.

Each fix below was shown failing first, then fixed, then passing. The red and
green outputs are in this folder.

## P1: a signature nobody gave

### The defect

Two routes wrote a `command='sign'` row to the governed ledger through
`recordGovernedAction` and did nothing else:

- protocol finalization (`POST /api/protocol-development/documents/:id/finalize`)
- a reviewer's disposition (`PATCH /api/protocol-reviews/assignments/:id/disposition`)

That row is what an inspector reads as an electronic signature. Neither route:

- re-authenticated the signer (§11.200);
- checked that the signer was independent of the protocol's authors;
- wrote the `electronic_signatures` row with printed name, time and meaning
  (§11.50) bound to the signed content (§11.70).

The disposition route also never looked at who the review was assigned to, so
any org member could record any reviewer's decision.

The census that followed found a third path to the same defect: the AnA tool
`finalize_protocol_document` finalized a protocol and wrote the same `sign` row
from a chat turn, in which nobody can enter a password.

### The fix

Both routes now run `signProtocolAct`
(`server/services/protocol-development/protocol-signature.ts`). It runs the
canonical ceremony inside the domain route's own transaction:

1. Refuse any meaning this act cannot carry.
2. `verifyReauth`, before anything is written.
3. `BEGIN`, then the domain write.
4. `assertSignerIsNotAuthor`.
5. The ledger pair and `persistGovernedSignSignature`, on the same client.
6. `COMMIT`. A refusal at any step rolls everything back.

Supporting changes:

- **Separation of duties** now knows a protocol's authors: the creator of record,
  plus everyone with a governed content edit in the ledger. `protocol_sections`
  records no editor, so the ledger is the edit history. Review activity
  (assigning, commenting, resolving a comment, a disposition) is not counted as
  authorship.
- **The signature binds content**, via a new basis,
  `protocol-document-content-sha256`: the protocol's identity, its version and
  its ordered live sections at signing time.
  - A disposition binds the protocol the reviewer read.
  - A finalization binds the version it froze.
  - Workflow status is not in the digest, so a signature cannot invalidate itself
    through the act it authorized (the `ectd-sequence` lesson, 2026-09-21).
- **Who may sign a disposition** is decided by the assignment:
  - the assigned user signs as `review` or `approval`;
  - anyone else is refused (403);
  - a reviewer named with no account can only have their decision recorded by
    someone signing as `responsibility`, and the ledger payload carries
    `recordedOnBehalfOf`.
- **AnA cannot sign.** `finalize_protocol_document` now reports whether the
  protocol can be finalized, writes nothing, and says the person finalizes it in
  the workspace with their password. Its tool description now says the same. The
  capability manifest was regenerated in a separate commit, because it was 20
  tools stale from other sessions.
- **The client** routes both acts through the shared `EsignModal` (§11.50 meaning,
  reason, §11.200 password, TOTP when enrolled): `ProtocolDevSigning.tsx`.
  - The reason-only finalize form was removed.
  - The disposition drawer now only picks the decision and hands off to signing.
  - A rejected password is reported as a rejected password, not as an expired
    session.
  - *Record disposition* is disabled, with the reason, for a review assigned to
    another user.

### Evidence

| What | Red (before) | Green (after) |
|---|---|---|
| Route ceremony (`server/routes/__tests__/protocol-signatures.routes.test.ts`, 12 cases) | `p1-red.txt`: 12/12 fail (`expected 201 to be 401` with no credentials) | 12/12 pass, `p1-green.txt` |
| AnA tool (`server/services/ana/__tests__/finalize-protocol-tool.test.ts`) | `p1-ana-red.txt`: 3/3 fail | 3/3 pass |
| SQL against the real migrations (`protocol-signature.pglite.integration.test.ts`, 11 cases) | see mutations below | 11/11 pass |
| Client (`protocolDevWrites`, `protocolRegisterForms`, `protocolDevSurfaceWrites`) | see mutations below | 40/40 pass |

**Mutations: each removal made the tests fail, and restoring it made them pass.**

| Removed | Tests that failed |
|---|---|
| The protocol-document authorship case | 3 |
| The content binding case | 2 |
| The assigned-reviewer check | 1 |
| The `reauth` field on the client request | 3 |

Two existing tests pinned the defect and were rewritten:

- *finalize → POST … with only the reason*
- *records a disposition against the assignment*, which PATCHed from a
  reason-only drawer.

Two assembler test fixtures hand-built `protocol_review_assignments` without the
real schema's `reviewer_user_id`. They were aligned with the migration.

## The class: `ci:sign-ceremony`

The census found **30 `sign` ledger write sites**. Two were already correct
(Module 3 approval, FCoI certification); the third correct one is the new
protocol helper. `scripts/ci/check-sign-ceremony.mjs` now requires every such
site's handler to both re-verify the signer (`verifyReauth` / `verifySigningPin`)
and write the signature row.

- The **28 remaining** sites are baselined per file in
  `scripts/ci/sign-ceremony-baseline.json`, each with a written reason. The
  baseline may only shrink, and an entry without a reason fails.
- **Two** of the 28 are a proof the gate cannot see across a function boundary
  (eSTAR filing, governed transmit). Both reasons were checked in code; the AnA
  transmit caller is taken from its documented contract and marked as not
  re-traced.
- **The other 26 are real defects**, all outside the launch catalog: research
  administration, CMC, BLA, and nine AnA tools that sign from a chat turn. No
  launch surface calls any of them. They must be fixed before those modules are
  enabled.

Where it runs: in `.husky/pre-push`, and as a step in the per-commit `ci.yml`
Lint job, selftest first.

**Proof it fails** (`gate-sign-ceremony.txt`):

- The selftest has 9 cases. Its first case is the pre-fix finalize route's shape,
  and it fails.
- Scanning the committed pre-fix files from git flags both routes:
  `protocol-development.ts:483` and `protocol-reviews.ts:148`, with
  `reauth:false, signatureRow:false`.

## T1–T4, P2, P3

*In progress, not yet verified. These fixes are being written test-first and
adversarially reviewed; this section is filled in when they land.*

## Known limits

- The gate is textual. It proves a new signature cannot be written without its
  author wiring the ceremony. It does not prove the ceremony is correct; each
  surface's tests do that.
- `ci.yml` step names: this change added one step and renamed nothing.
