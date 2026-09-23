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
| A non-author could finalize as `authorship`, which separation of duties does not examine, and record a false meaning. | An `authorship` signature is checked against the recorded authors: 403 `NOT_AN_AUTHOR`. | Route test. Removing the check fails it. *This fix did not hold on real data: see the second round.* |
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

### Second review round (the Part 11 lens, and the working tree)

The Part 11 reviewer read the first push, and the security reviewer read the
first round's working tree. Most of their findings were already fixed by the
first round (above). Six were not, and one of those undid a first-round fix.

| Finding | Fix | Proof |
|---|---|---|
| **The authorship check ran after the domain write**, on the same client. Finalize writes a `protocol_versions` row under the signer's id, and that table was in the author set. So on real data every finalizer became an "author" of what they were signing: a non-author finalizing as `authorship` **passed**, and an independent approver was **refused**. The route test could not see it, because its authors were stubbed. | The check runs after `BEGIN` and **before** the write, on the transaction's client. That is the canonical order (SoD before `writeMutation`). Version rows are no longer authorship. | PGlite on the real migrations, through `signProtocolAct` and the real `finalizeProtocolTx`: red 3/26 (`p1-order-red.txt`). The non-author passed and the approver was refused, exactly as described. Green 32/32 (`p1-order-green.txt`). A mutation for each piece fails a named test: the check moved back after the write; `protocol_versions` put back; the old ledger clause restored. |
| A reviewer's AnA comment was recorded as `update` on the protocol, so the reviewer became an author and could no longer sign the review. Budget parameters and version snapshots counted the same way. So did another module's `documentId` (Other Support's own document id). | AnA records a comment as `create`, as the HTTP route does. The author set excludes `update` rows on the protocol that carry review, budget or version payloads. A payload `documentId` counts only on the protocol's own visit and SoA targets. Anything unlisted still counts as authorship, which refuses a signer rather than admitting one. | PGlite: a comment, budget parameters, a snapshot (ledger row and version row) and an Other Support entry leave the authors as the creator alone. A synopsis edit, which records no payload, still counts. |
| The signature row did not say what was signed. A reviewer's approve and reject produced the same `electronic_signatures` manifest; the decision existed only in the ledger payload. | The domain write names its act. The act goes into the ledger payload and onto the signature manifest (`extraManifest.act`): the decision, the protocol, the version reviewed and, for a disposition recorded on someone's behalf, whose. For finalize: the version finalized. | Route tests assert the manifest for both acts. Dropping the pass-through fails both. PGlite: the disposition reports the version reviewed. |
| A review could be assigned to any user id: another organization's user, or a viewer. Nothing reassigns a review, and only the assignee can sign it, so such a review could never complete. The refusal text told users to "reassign the review", which the product cannot do. | Assignment checks `organization_users`: the reviewer must be a member with a role that can sign. The refusal no longer points to a reassign that does not exist. | PGlite: another organization's user and a viewer are refused; a member and a named reviewer with no account are accepted. |
| A failed authorship lookup returned its internal cause (`database error <SQLSTATE>`) to the signer. | Logged; the signer gets the canonical handler's sentence, as a 503. | Route test. Passing the cause through fails it. |
| The two signing routes each built their own limiter under one scope name. Each had its own count, so a signer got 20 guesses per window where the scope promised 10. | One limiter instance per scope. | Limiter suite: attempts at finalize and disposition share one budget. Removing the memo fails it. |
| **The gate missed a sign command chosen by a ternary**: `governed(req, res, approved ? 'sign' : 'resolve', …)`. That hid four live sign writes, with no re-authentication and no signature row: IRB, IBC and IACUC approvals, and RIM label approval. | The gate parses a helper's first three arguments and a `command:` value, and finds `'sign'` bare, in a ternary or as a template literal. `callSpan` skips parentheses inside strings. The four sites are baselined as defects, with reasons. All four are in modules outside the launch catalog. | Selftest 13/13. The new ternary case failed before the change. The live scan finds exactly the four named sites and no others. |

### The reviewer signs their own review

Until this change, every disposition recorded in the UI was a `responsibility`
signature. *Request a review* took only a typed name, so no review was ever
assigned to an account. The path where the reviewer signs their own review
(`review` or `approval`) existed on the server but could not be reached from the
product.

*Request a review* now has a **Reviewer account** select. It lists the
organization's members from `GET /api/tenant-users/:orgId`, the member-readable
list, and leaves out viewers, whom the server refuses as assignees. Choosing an
account sends `reviewerUserId`, and the listed name defaults to the account's
name. "No account here" keeps the on-behalf path. If the member list cannot be
read, the drawer says so and still allows a reviewer without an account; a
failed read is never shown as an organization with nobody in it. With neither an
account nor a name, nothing is sent.

Proof: `protocolDevSurfaceWrites.test.tsx`. Red 4/20 against the previous
surface (`picker-red.txt`; the existing request case fails on the renamed
field). Green 20/20 (`picker-green.txt`). The protocol client suites and UI
contracts pass 153/153.

## The class: `ci:sign-ceremony`

The census found **30 `sign` ledger write sites**. Two were already correct
(Module 3 approval, FCoI certification); the third correct one is the new
protocol helper. `scripts/ci/check-sign-ceremony.mjs` now requires every such
site's handler to both re-verify the signer (`verifyReauth` / `verifySigningPin`)
and write the signature row.

- The **28 remaining** sites were baselined per file (19 after the AnA fix
  below, 23 once the gate learned ternary commands in the second review round)
  in
  `scripts/ci/sign-ceremony-baseline.json`, each with a written reason. The
  baseline may only shrink, and an entry without a reason fails.
- **Two** of the 28 are a proof the gate cannot see across a function boundary
  (eSTAR filing, governed transmit). Both reasons were checked in code; the AnA
  transmit caller is taken from its documented contract and marked as not
  re-traced.
- **The other 26 are real defects.** Seventeen are in modules outside the launch
  catalog (research administration, CMC, BLA): no launch surface calls them, and
  they must be fixed before those modules are enabled. Four more of the same
  kind (IRB, IBC, IACUC, RIM) became visible in the second review round, which
  makes 21. The other nine are AnA
  tools that sign from a chat turn. The census first assumed these were
  unreachable too; the trace below proved they were reachable in every
  organization, and they are fixed.

Where it runs: in `.husky/pre-push`, and as a step in the per-commit `ci.yml`
Lint job, selftest first.

**Proof it fails** (`gate-sign-ceremony.txt`):

- The selftest has 13 cases. Its first case is the pre-fix finalize route's
  shape, and it fails.
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

## The request client could carry an open transaction to the next request

Found by the P2 behaviour reviewer. It predates this work, and it is shared by
every governed write that runs on the request-scoped connection:
`governedScoped` in protocol development, and QMP plans.

The middleware releases the request's connection on `res` `finish` **and**
`close`, and a client abort fires `close` mid-handler. If that happened between
`BEGIN` and `COMMIT`, `LazyRequestDbClient.release()` reset the session
variables and handed the connection back to the pool, still inside the
transaction. The handler's own `COMMIT` or `ROLLBACK` then threw "released", so
nothing ended the transaction. The next request to take that connection ran
inside it:

- its `COMMIT` could commit the aborted request's half-written change, including
  a domain write whose ledger row never landed: an unaudited change;
- the resets are `set_config(…, false)`, which are transactional. A later
  rollback therefore reverted the connection's tenant variables to the
  **previous request's** tenant.

**Fix** (`server/middleware/lazyRequestDbClient.ts`): after the resets, which
queue behind any statement still in flight, `release()` reads node-postgres's
`getTransactionStatus()`. A connection that is not idle is discarded, not pooled,
and Postgres rolls its transaction back on disconnect. A normal release costs no
extra round trip.

**Proof:** `lazy-request-db-client.test.ts` with a client that models pg's
transaction status. Red 2/13 (`request-client-tx-red.txt`): an open transaction
and a failed one both went back to the pool. Green 13/13
(`request-client-tx-green.txt`). A committed transaction still returns its
connection. Both handlers that open transactions on this client (`governedScoped`
and the QMP plan writes) commit before they respond, so a completed request is
unaffected.

## P2: quality-management plans

**The defect.** A QMP sets the gates governed documents are validated against.
Creating, activating (any change) or deleting one was a bare Drizzle write, with
no reason and no ledger row. One click activated a plan, and nothing recorded
who did it.

**The fix** (`server/routes/quality-management-api.ts`, `QmpWorkspace.tsx`),
written test-first, then read by three independent reviewers and repaired:

- **The governed path.** A reason (at least 8 characters, trimmed) is required.
  `BEGIN` → tenant variables → plan write → `recordGovernedAction` → `COMMIT`
  all run on the request-scoped connection that the Drizzle write also uses, so
  the plan and its ledger row commit together. A ledger failure changes
  nothing: 500 `AUDIT_WRITE_FAILED`.
- **Nothing overwritten is lost (§11.10(e)).** The ledger carries the whole row
  on create and on delete, and each changed field's before and after value on a
  change, including `metadata`, which holds `allowWaivers`.
- **Authority (§11.10(g)).** `requireEditorAccess` gates all three writes, so a
  viewer gets 403. The actor comes from the canonical `governedActorId`. The
  first version had a second resolver of its own.
- **The active plan is archived, never deleted.** Deleting it is refused with
  409 `PLAN_ACTIVE`, enforced on the server. The UI offers Archive, a governed
  change, in its place.
- **Honest outcomes.**
  - A change to values the plan already holds (a double click, a stale board) is
    refused 409 `NO_CHANGES`, so no `active → active` ledger row is written.
  - A plan that CTQ factors or traceability rows still reference is refused 409
    `PLAN_IN_USE`, not an unexplained 500.
  - A COMMIT that fails is answered `OUTCOME_UNKNOWN`: "could not be confirmed;
    reload to check". It is never "nothing was changed". The UI does not call
    that a refusal, and it re-reads the register.
  - One write runs at a time from the UI.
- **Copy.** The activation dialog said the plan's gates "apply once active".
  Validation selects a plan by id, whatever its status, so the dialog now says
  what activation actually does.

**Proof.** The new route and client suites were run against the unfixed files
from HEAD: red 34/38 (`p2-red.txt`). Green 38/38 (`p2-green.txt`). A mutation of
each reviewer fix fails a named test: value compare, commit stage, FK mapping,
changed-fields-only, the canonical actor, the in-flight guard, the unknown
outcome, and the copy. Gates: `ci:discarded-audit-write`,
`ci:regulated-delete-audit`, `ci:server-error-leaks`, `ci:internals-in-copy`,
`ci:empty-state-honesty`, `check:microcopy`. Scoped typecheck: no errors in
the changed files.

The two cases in `qmpWorkspace.test.tsx` that pinned the one-click,
reasonless writes were removed. Once rewritten they duplicated the governed
suite.

**Validation owed (D4/W3).** OQ-006 is now v0.5, and OQ-QMS-12 refuses a
reasonless create before creating with a reason. It is **not executed** at
that version. Before signature, through change control:

- steps for the viewer refusal, the active-plan delete refusal and the ledger
  row;
- URS-QMS-011 restated;
- its RA-001 classification re-assessed (still `low`, no Part 11 relevance);
- TM-001 updated;
- then re-execution.

**Open, for the control tower.** The other QMS writes on this router (CTQ
factors, section gating, quality validation, batch validate) have no authority
gate and no ledger row. They are the same gap, and they are outside this item.

## T1–T4, P3

*In progress, not yet verified. These fixes are being written test-first and
adversarially reviewed; this section is filled in when they land.*

## Known limits

Open items, left as they are on purpose:

- **Two signing-authority policies exist.** One is the writer roles plus the
  `GOVERNANCE_RBAC_ENFORCE` gate: the canonical `makeHandler` path, which
  protocol signing follows. The other is `isSigningAuthorized` (admin, approver,
  reviewer), used by `/api/esignature/sign`, submission sign-release and
  MDx QMS. Choosing one is a policy decision for QA and the founder. It is not a
  change to make inside a defect fix.
- **The signer IP on the signature row is the first `X-Forwarded-For` entry**,
  which the client controls unless the edge overwrites it. The canonical handler
  does the same thing. The fix is to use `req.ip` behind a correct
  `trust proxy`, in both places, in one change.
- **The signing modal offers every meaning.** The server refuses a meaning the
  act cannot carry, with a 400, before it re-authenticates. The attempt still
  counts against the limiter.
- **For D2, not fixed here: the non-launch modules' APIs are reachable unless
  the production environment says otherwise.** `deploymentEnforcementMode`
  (`server/services/entitlements/enforcement-mode.ts`) reads
  `MODULE_ENFORCEMENT` and defaults to `off`. A mode stored on the console is
  capped at the deployment's (`capAt`), so the console cannot switch it on. No
  deploy configuration in the repository sets the variable. This checkout cannot
  see whether production's own environment sets it. Where it is off, the 21
  unceremonied sign routes baselined above (research administration, CMC, BLA,
  IRB, IBC, IACUC, RIM) are live APIs, even though no launch surface links to
  them. Turning enforcement on is a deployment change that needs a staging run
  first. It belongs to D2, and the founder should see it before it is made.
- The gate is textual. It proves a new signature cannot be written without its
  author wiring the ceremony. It does not prove the ceremony is correct; each
  surface's tests do that.
- `ci.yml` step names: this change added one step and renamed nothing.
