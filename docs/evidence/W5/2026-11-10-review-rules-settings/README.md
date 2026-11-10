# The review rules are each organisation's settings (P-117), 2026-11-10

Row **D5** (governed approval), workstream W5, session `…01QoxbLaF`. The founder: *"Those rules should be set by the
client super admin in client security user settings."* The rules are P-116's: how many independent reviewers an
approval needs, and whether a one-person organisation may approve its own document.

## What already exists (RULE 3)

- **The rules, fixed in code (P-116):** `reviewFloor` and `reviewQuorumVerdict`
  (`server/services/artifact-approval-act.ts`), and `isSoleMember` with its admission in `assertSignerIsNotAuthor`
  (`server/services/governance/separation-of-duties.ts`). The signed act records a sole member's act as unreviewed
  (`server/services/artifact-signed-act.ts`).
- **The organisation's settings:** `organizations.settings`, a JSON object with a `security` section.
- **The governed settings door:** `PATCH /api/organizations/:id/settings` (`server/routes/organizations-routes.ts`),
  for the organisation's administrator or owner, with a reason. It writes through the one settings writer
  (`server/services/tenant/tenant-settings-writer.ts`), which records the audited `security` values before and after.
  `PATCH /api/tenant-config/:id/settings/:section` (`server/routes/tenant-config.ts`) validates the same section.
- **The settings screen:** Administration's Settings (`client/src/concept2cure/v2/surfaces/AdminSettings.tsx`), with
  the card "Session policy" (`client/src/concept2cure/v2/onboarding/SessionPolicySetting.tsx`), which already writes
  two `security` values through that door.

Nothing new was added: no route, table, service or screen. The two values join the existing `security` section; the
card joins the existing settings screen, in the file of the card it sits beside.

## What changed

| Piece | Where |
|---|---|
| The two values, their bounds and defaults, and the refusal of a value outside them | `shared/artifact-governance.ts` (`reviewPolicyOf`, `reviewPolicyRefusal`) |
| The approval act reads them on the signing transaction | `organizationReviewPolicy`, `soleMemberMayApprove` in `separation-of-duties.ts`; `reviewFloor`, `reviewQuorumVerdict` in `artifact-approval-act.ts` |
| The settings door refuses a value outside the bounds (400) | `organizations-routes.ts`; the zod schema in `tenant-config.ts` |
| The audit row carries both values, before and after | `VALUE_AUDITED.security` in `tenant-settings-writer.ts` |
| The card "Review and approval" | `ReviewPolicySetting` in `SessionPolicySetting.tsx`, mounted in `AdminSettings.tsx` |
| The decision | P-117 in `docs/LAUNCH_DEFINITION_OF_DONE.md`; P-116's "Not a setting" line amended |

Defaults, when an organisation has set nothing: one reviewer, and self-approval on. That is P-116 as the founder
decided it, so nothing changes for an organisation until its administrator changes a value.

## Red, then green

- **Red** (`review-rules-red.txt`): the new cases against the approval act as it was. 3 fail: two reviewers required
  and one approved was approved; self-approval switched off and the sole member still approved (two cases).
- **Green** (`review-rules-green.txt`): the same 5 cases pass with the change.
- **Affected suites** (`affected-suites.txt`): 47 files, 1,370 tests pass. They cover the approval ceremony, the signed
  act, AnA's signed act, separation of duties, both settings routes and the settings card.
- Three fixtures gained an `organizations.settings` column, because the act now reads it and refuses when it cannot.

## Opened and used in the running app

`screenshots/`, with `walk-log.txt`. Signed in as the Lumen demo organisation's lead (an administrator), on the local
app at this commit:

1. `01-review-rules-as-read.png`: the card reads 1 reviewer, self-approval allowed (nothing set).
2. `02-zero-reviewers-refused.png`: 0 reviewers is refused in the card; nothing is sent.
3. `03-two-reviewers-saved.png`: 2 reviewers and no self-approval, saved with a reason (`PATCH … -> 200`).
4. `04-after-reload.png`: after a reload the card reads 2 and off, from the server.

`audit-row.txt` shows the audit rows for those writes, with the reason and both values before and after. The
organisation was then set back to 1 reviewer and self-approval on, through the same card, also audited.

## The editor's approver signature (added later the same day, P-120)

The founder then asked for the open questions to be researched and decided, and the work continued. The decisions are
P-120 in `docs/LAUNCH_DEFINITION_OF_DONE.md`, with their sources.

**What already exists.** An APPROVER signature on the editor's document is taken by E-sign or by the workflow sign
(`server/routes/authoring.router.ts`). Both refused an author (`separationOfDutiesRefused`, P-18) and a document whose
review route was not complete (`reviewRefused`, `approvalReviewRefusal` in
`server/services/authoring/authoring-review-route.ts`, P-95). Freeze with the meaning AUTHOR was already open to an
author, so a sole member could always freeze.

**What changed.** One function, `approverIndependenceRefused`, now answers both doors:

- the organisation's only member, where its review rules allow it, approves with no reviewer, and the signing
  transaction's audit trail carries `APPROVAL_WITHOUT_INDEPENDENT_REVIEW`;
- everyone else is checked as before, and the review route must name at least the number of reviewers the
  organisation set (`independentReviewersRequired`).

**Red, then green.** `editor-door-red.txt`: against the router as it was, 3 of the 7 new cases fail (the sole member
is refused on both doors, and one reviewer satisfies a rule of two). `editor-door-green.txt`: all 7 pass, with the 7
existing P-95 cases. The editor's other suites that load the router or the review route pass, apart from 13 that already fail on trunk (`editor-suites.txt`).

## Not done here

- The editor door was not signed in the browser by a one-person organisation: the demo organisations all have
  several members. It is proven by the route tests above, which run the real router over a fake database.
- Sequence freeze and dispatch, QMS controlled documents, Module 3 sections, labeling approvals and the document
  lifecycle do not yet admit a sole member, so the settings do not reach them yet. P-120 item 7 orders them.
- No approval was signed in the browser under a changed rule; that path is proven by the integration tests above, which
  run the real route and the real signed act on PGlite.
