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
  `protocol-document-content-sha256`.
  - A disposition binds the protocol the reviewer read.
  - A finalization binds the version it froze.
  - *As first pushed, the digest covered the document's version and its
    sections' status. That was wrong; see "Review round" below.*
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

### Review round (adversarial, after the first push)

Three independent reviewers (Part 11; behaviour and regression; security and
gate soundness) read the pushed change. Every finding below was verified in the
code before it was fixed.

| Finding | Fix | Proof |
|---|---|---|
| The binding held the version and section status. Finalize bumps the version, so a reviewer's signature taken before finalization stopped re-deriving with no content changed (the `ectd-sequence` defect again). It also left out the synopsis, cover page, objectives, eligibility, visits, schedule of assessments and team. The claim above, "no workflow status in the digest", was false. | The binding is now content only: cover page, synopsis, sections, objectives, eligibility, visits, SoA assessments and cells, team. No version, status or timestamp. | PGlite: the digest is unchanged by finalize (version + status). It moves for an objective, an eligibility criterion, a visit, the synopsis or the sponsor. Putting `version` back fails the test. |
| A non-author could finalize as `authorship`, which separation of duties does not examine, and record a false meaning. | An `authorship` signature is checked against the recorded authors: 403 `NOT_AN_AUTHOR`. | Route test. Removing the check fails it. |
| Authorship missed whoever built the schedule of assessments, objectives, eligibility, visits or team. | Authors are now the creators of every content row, plus governed content edits. Review tables are excluded. | PGlite: the SoA builder and objective author are counted, the commenting reviewer is not. Dropping the SoA rows fails it. |
| A completed disposition could be signed again, overwriting the decision while the first signature stayed live. | Refused with 409 `INVALID_STATE`; the decision stands. | PGlite. Allowing it fails the test. |
| No authority gate: a viewer could sign, and the canonical path's RBAC gate was absent. | `requireEditorAccess` on both routes, plus the `GOVERNANCE_RBAC_ENFORCE` `can()` gate the canonical path runs. | Route tests: a viewer gets 403 with nothing asked or written. |
| Password guessing was unlimited on the two new endpoints (§11.300(d)). | One per-signer limiter (`middleware/signing-attempt-limiter.ts`), extracted from `esignature.ts`, which now uses it too. | Limiter suite: the 11th attempt gets 429, counted per signer. |
| Separation of duties borrowed a second pool connection while the signing transaction held one. | The authorship reader takes the transaction's client (additive, optional parameter). | PGlite and route tests assert the client is passed. |
| Two concurrent finalizations could both commit. | `finalizeProtocolTx` locks the row (`FOR UPDATE`). | Code; the lock is inside the signing transaction. |
| The client never asked for the authenticator code, while the server (upgraded upstream) now demands it whenever one is enrolled. The same gap blocked enrolled signers in Submission Center freeze and dispatch. | `requireMfa` from the session, in both modals. Refusals now name the password or the code correctly. | Route test for `REAUTH_TOTP_REQUIRED`; client refusal wording test. |
| The signer's name could print as "undefined" after a reload. | The printed name falls back to the email, and is absent rather than invented. | Code. |
| The AnA tool told the user to finalize a protocol that was already finalized. | The tool reads the status first. | 2 new cases. |
| The gate did not enforce "shrink only", and its blind spots were undocumented. | The baseline is exact: a freed allowance fails. The known misses are written in the gate header. | Selftest case 10. |
| A UI contract still said the surface offers no e-signature, and no test proved the replacement finalize path was reachable. | The contract is restated: no local ceremony; the signed acts use the shared modal and send `reauth`. A surface test drives Finalize to the signed POST. | 12/12 contract cases; 41/41 client cases. |

## The class: `ci:sign-ceremony`

The census found **30 `sign` ledger write sites**. Two were already correct
(Module 3 approval, FCoI certification); the third correct one is the new
protocol helper. `scripts/ci/check-sign-ceremony.mjs` now requires every such
site's handler to both re-verify the signer (`verifyReauth` / `verifySigningPin`)
and write the signature row.

- The **28 remaining** sites were baselined per file (19 after the AnA fix
  below) in
  `scripts/ci/sign-ceremony-baseline.json`, each with a written reason. The
  baseline may only shrink, and an entry without a reason fails.
- **Two** of the 28 are a proof the gate cannot see across a function boundary
  (eSTAR filing, governed transmit). Both reasons were checked in code; the AnA
  transmit caller is taken from its documented contract and marked as not
  re-traced.
- **The other 26 are real defects.** Seventeen are in modules outside the launch
  catalog (research administration, CMC, BLA): no launch surface calls them, and
  they must be fixed before those modules are enabled. The other nine are AnA
  tools that sign from a chat turn. The census first assumed these were
  unreachable too; the trace below proved they were reachable in every
  organization, and they are fixed.

Where it runs: in `.husky/pre-push`, and as a step in the per-commit `ci.yml`
Lint job, selftest first.

**Proof it fails** (`gate-sign-ceremony.txt`):

- The selftest has 9 cases. Its first case is the pre-fix finalize route's shape,
  and it fails.
- Scanning the committed pre-fix files from git flags both routes:
  `protocol-development.ts:483` and `protocol-reviews.ts:148`, with
  `reauth:false, signatureRow:false`.

## AnA cannot sign: nine more tools, live in every organization

The census baselined nine AnA tools that write a `sign` ledger row. A trace on
2026-09-23 (static, file:line) showed they are reachable in production:

- **Reachable everywhere.** Nothing on AnA's tool path consults the launch
  catalog or module entitlements. `governedToolsetFor` applies only a tenant
  deny-list, and `selectToolsForTurn` keeps any tool whose name matches the
  request. Dispatch classifies them `UNGOVERNED`.
- **No safeguards on the write.** There is no approval step, no password and no
  `electronic_signatures` row. When the user gives no reason, a canned one is
  used ("DMS plan finalized via AnA").
- **Two further holes:**
  - `finalize_committee_determination` skipped the approve privilege its HTTP
    route enforces.
  - In `approve_no_cost_extension`, the model supplied the `authority` that
    decides whether sponsor prior approval applies.

The tools: `finalize_dms_plan`, `certify_other_support`, `finalize_biosketch`,
`finalize_export_control_determination`, `execute_research_agreement`,
`finalize_committee_determination`, `finalize_grant_closeout`,
`execute_subaward`, `approve_no_cost_extension`.

**The fix.** All nine now call one helper, `refuseSignatureInChat`
(`AnaToolExecutor.ts`), which returns
`{ ok: false, signatureRequired: true, message }` and writes nothing. Their
descriptions now say "AnA cannot sign", so the model does not promise the act.
This also closes both holes, because the service is never called.

**Capability removed.** AnA can no longer perform these nine acts. That is
deliberate, and it is a product change for the founder to see. The remaining
path is each module's own HTTP route, which is itself baselined in
`ci:sign-ceremony` as lacking the ceremony, in modules that are off in
production. When those modules ship, the acts should be signed there, as the
protocol acts now are.

**Evidence:**

- `server/services/ana/__tests__/ana-cannot-sign.test.ts`, 18 cases: red
  18/18 (`ana-sign-red.txt`), green 18/18 (`ana-sign-green.txt`).
- Three `grants-tools.test.ts` cases that asserted the old input validation of
  these tools were rewritten to the refusal.
- The `ci:sign-ceremony` baseline drops from 28 to 19 sites, with the
  `AnaToolExecutor.ts` entry removed.
- ESLint on `AnaToolExecutor.ts` shows 0 errors and 102 warnings, the same as
  HEAD.

## T1–T4, P2, P3

*In progress, not yet verified. These fixes are being written test-first and
adversarially reviewed; this section is filled in when they land.*

## Known limits

- The gate is textual. It proves a new signature cannot be written without its
  author wiring the ceremony. It does not prove the ceremony is correct; each
  surface's tests do that.
- `ci.yml` step names: this change added one step and renamed nothing.
