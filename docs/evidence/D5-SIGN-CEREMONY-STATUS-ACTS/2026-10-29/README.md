# D5: fix the sign-ceremony gate's blind spot for status-only governed acts

**Row:** D5 (21 CFR Part 11 electronic signatures).
**Work:** fix `ci:sign-ceremony` (`scripts/ci/check-sign-ceremony.mjs`) so that it sees a governed act written as a status or a flag, and complete its coverage of the population that this exposes.
**Head:** `4d57a4164` (includes `765f2b399`, the VR-19 Vault seal), plus this change in the working tree. Every file here was regenerated at that head.

## The defect

The fold-f1a slice recorded the gate's limit
(`docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/README.md`, lines 172 and 215).

The gate found two kinds of governed act:
- `sign` ledger writes;
- SQL approval stamps (`approver_id`, `approved_by`, `approved_by_user_id`, `approved_at`).

Accepting a hazard's residual risk writes `status = 'accepted', acceptable = TRUE` on `risk_items`, and that table has no stamp column. So the gate had two blind spots:
- **The signed acceptance was invisible.** `server/routes/mdx-risk-management.ts`, `acceptResidualSigned`, signs through `signGovernedAct`, yet the gate did not list it.
- **An unsigned `status = 'accepted'` write would have been invisible too.** That slice's mutation M11, which puts the plain PATCH back, was red on the route test and green on the gate.

## What already exists

Searched: the gate, its selftest and baseline; every `*_STATUS`/`*_STATES`/`*_TRANSITIONS`/`SIGNED*` constant in `server/` and `shared/`; `DECISION_ACT_MEANINGS` and the other meaning sets; the QMS status machines; any registry of governed tables (`GOVERNED_TABLES`, `PART11_TABLES` and similar: none); every ceremony entry point.

**The gate**
- `scripts/ci/check-sign-ceremony.mjs` finds `sign` ledger writes (`recordGovernedAction`, `governed*` helpers, `writeMutation('sign')`) and approval stamps.
- It holds each one to a signature-row write in its handler, measured as the column-0 statement around it. Sign writes must also re-verify the signer.
- A second rule requires `checkSigningAuthority` in every handler that re-verifies a signer.
- `96537cfe` added `signGovernedAct` to the signature-row tokens.
- Selftest: `check-sign-ceremony.selftest.mjs` (29 cases). Baseline: `sign-ceremony-baseline.json`, per file, exact, each entry with a reason.
- **What it did not do:** see any status or flag.

**The ceremonies the gate recognizes**
- `signGovernedAct`, in two places: `server/routes/governed-signed-act.ts` and `server/services/part11/governed-signature-ceremony.ts`.
- `persistGovernedActionSignature`, `persistGovernedSignSignature` and `persistElectronicSignature`.
- `insertAuthoringSignature`.
- `writeMutation`.

**Signature meanings, not statuses**
- `server/services/part11/signature-meanings.ts` declares `DECISION_ACT_MEANINGS` (approval, responsibility), `REVIEW_ACT_MEANINGS`, `SIGN_OFF_ACT_MEANINGS` and `RELEASE_ACT_MEANINGS`.
- These say what a signature means. They name no status, so they cannot tell the gate which writes are acts.

**Product constants that declare the statuses only a signed act may set** (now read by the gate, never copied):

| Constant | Path | Values | Its own words |
|---|---|---|---|
| `DOC_SIGNED_STATUS` | `server/routes/mdx-labeling-approvals.ts:41` | approved, effective, superseded | "The document moves that are electronic signatures" |
| `ARTIFACT_ACT_MEANING` (keys) | `server/services/artifact-approval-act.ts:52` | approved, locked | "The meaning each signed act of the status route is signed with" |
| `GOVERNED_TRANSITIONS` | `server/services/submission-service/submission-service.ts:143` | frozen, dispatched | "must go through the governed e-signature flow" |
| `SIGN_OFF_STATUSES` | `server/services/coauthor/coauthor-status-write.ts:122` | signed, locked, finalized | "Statuses only a governed act may set" |
| `LOCKED_DOCUMENT_STATUSES` | `server/services/authoring/document-lock.ts:83` | FROZEN, APPROVED | "APPROVED — an approval e-signature was applied" |

**Domain vocabularies that are whole lifecycles, not declarations of what is signed.** These were not reused, because they mix working states with decisions:
- QMS: `CHANGE_STATES` / `CHANGE_TRANSITIONS` in `server/services/qms/changeControl.service.ts`; `DOC_STATUS` in `server/routes/mdx-qms.ts:168`; `APPROVABLE_STATES` (the from-state) in `server/services/qms/document-approval-signature.ts:129`.
- `STATUS_ITEM` in `mdx-risk-management.ts`.
- `SECTION_APPROVAL_STATES` (`server/routes/cerv2-sections.ts:21`).
- `SIGNED_SPEC_ACTS` (an audit-log action set, `server/services/cmc/register-history.ts:449`).
- The IRB, IBC, IACUC and grant `STATUSES` lists.
- QMS signs its moves in its ceremonies (`document-approval-signature.ts`, `change-approval-signature.ts`) and declares no signed-status set.

**Not found:**
- **No platform-wide list of signed decision statuses.** Each domain declares its own, or none.
- **No registry of governed tables.** "Governed table" therefore comes from the ceremonies themselves (source 1 below).

## What changed

**`scripts/ci/check-sign-ceremony-status-acts.mjs` (new): the status-act scanner.**

A SQL write that sets a governed status or flag is now a site, of kind `status-act`. It is held to the stamp's rule: a signature-row write in its handler.

It reads `UPDATE … SET`, `INSERT … (cols) VALUES (…)` and `ON CONFLICT … DO UPDATE SET`, and stops each SET list at a top-level WHERE, RETURNING or FROM. A value is read only when it is:
- a literal (`'accepted'`, `TRUE`);
- or a `$n` whose value is a literal in the query's inline parameter array.

What is governed has two sources:
1. **Signed pairs, from the ceremonies.**
   - Every status that a handler holding a ceremony writes, and every flag it sets TRUE, is governed on that table everywhere, as `table.column=value`. Fourteen are found at this head; they are listed in `list-after.txt`.
   - The baseline records them (`signedPairs`). A recorded pair stays governed after its ceremony is removed.
   - A newly signed pair fails the gate until it is recorded.
   - Without the record, removing the ceremony would make the gate stop looking. Product mutation P1b shows that case green; P1 shows it red with the record.
2. **Declared signed statuses**, read from the five constants above on every run.
   - They are governed on every table, except `superseded` and `locked`. The product signs those only on some tables, and the census found nine unsigned writes of them that are not acts (gate mutation G4 lists them).
   - A declaration that cannot be found fails the gate.
   - This head yields: approved, dispatched, effective, finalized, frozen, signed.

Other rules:
- For a status act, `writeMutation` counts only as `writeMutation('sign')`. Its other commands write no `electronic_signatures` row, and the c2c document lock is not a signature, by the product's decision.
- A statement that also stamps an approval stays one site, the stamp, so the existing stamp counts did not move.

**`scripts/ci/check-sign-ceremony-source.mjs` (new).** The gate's text helpers (`stripComments`, `skipString`, `callSpan`, `topLevelArgs`) moved here unchanged, plus `literalEnd`, so the scanner can use them without a cycle.

**`scripts/ci/check-sign-ceremony.mjs`.**
- Wires the status acts into `scanSource` and `scanRepo` (`scanRepo` now takes its sources and governed pairs).
- Adds the pair record and the declaration checks to `main`, and the status-act wording to `--list` and the failure report.
- `main` is split into `printList`, `writeBaseline`, `reportStatusSources` and `siteWhy`.

**Lint.** The split is what kept lint flat: the four files carry 10 warnings and 0 errors, which is what HEAD's two files carried. `main`'s complexity went from 46 to 23. The pre-push hook refuses net warning growth in pushed files.

**`scripts/ci/check-sign-ceremony.selftest.mjs`.** 15 new cases; 44 pass.

**`scripts/ci/sign-ceremony-baseline.json`.**
- Nine new entries, plus `authoring.router.ts` raised from 1 to 3. Each has a reason verified against its caller.
- The new `signedPairs` record (14 pairs).

## The new hits, classified

Every status-act site at this head (`list-after.txt`), and what each one is:

**(a) Already behind a ceremony and recognized: 8, `ok`**

| Site | Act | Ceremony in the handler |
|---|---|---|
| `server/api/cmc/module3OperatingSystemRoutes.ts:823`, `:838` | Module 3 section approved | checkSigningAuthority, verifyReauth, persistGovernedActionSignature |
| `server/api/cmc/specificationRoutes.ts:492` | specification approved | the same |
| `server/routes/authoring.router.ts:4952` | document frozen | checkSigningAuthority, reverifyAuthoringSigner, insertAuthoringSignature |
| `server/routes/biopharma/bla-workbench.ts:326` | BLA assessment signed | signGovernedAct |
| `server/routes/mdx-labeling-approvals.ts:190` | labeling document superseded | signGovernedAct |
| `server/routes/mdx-risk-management.ts:381` | **residual risk accepted (the case this exists for)** | signGovernedAct |
| `server/services/pathway-engines/estar/estar-submission-service.ts:269` | eSTAR filed | persistGovernedActionSignature (its re-authentication is the route's, already baselined) |

The labeling approvals and effectiveness, the translation approval, both QMS approvals and the authoring APPROVED write also set a status. Each of those statements stamps an approval, so it remains the stamp's site.

**(a′) Behind a ceremony one function boundary away: 10, baselined as "PROOF ACROSS A BOUNDARY, verified 2026-10-29"**

Each caller was traced. The gate measures one handler and cannot follow a callback or a helper.

| Site | Act | Its only path |
|---|---|---|
| `server/routes/authoring.router.ts:6881` | filing sections approved | `approveBoundFilingSections`, through `filingApprovalForSignature`, from POST `/docs/:docId/e-sign` and `/docs/:docId/sign`; both ask authority, re-verify and write `authoring_signatures` on the same transaction |
| `server/routes/authoring.router.ts:7104` | workflow step APPROVED | `advanceWorkflowForSignature`, from POST `/docs/:docId/sign` |
| `server/services/audit/compliance-reviews.ts:521` | review signed | `signReviewAct`, the `run` of signGovernedAct in `routes/audit-compliance-reviews.ts:156` |
| `server/services/coverage-analysis/coverage-service.ts:210` | analysis finalized | `run` of signGovernedAct, `routes/coverage-analysis.ts` POST `/analyses/:id/finalize` |
| `server/services/financial-disclosures/fcoi-service.ts:249` | disclosure signed | POST `/disclosures/:id/certify`: checkSigningAuthority, verifyReauth, then on one transaction this write, the sign pair, persistGovernedActionSignature |
| `server/services/iacuc/iacuc-service.ts:163` | protocol approved | only the `'approved'` outcome writes it, and that outcome is the only one sent through signGovernedAct (`routes/iacuc.ts`) |
| `server/services/ibc/ibc-service.ts:169` | registration approved | the same (`routes/ibc.ts`) |
| `server/services/irb/irb-service.ts:230` | submission approved | the same (`routes/irb.ts`) |
| `server/services/protocol-consent/protocol-consent-service.ts:202` | consent form approved | `run` of signGovernedAct, `routes/protocol-consent.ts` POST `/forms/:id/approve` |
| `server/services/protocol-development/protocol-development-service.ts:468` | protocol finalized | `write` of `signProtocolAct` (the service ceremony), POST `/documents/:id/finalize` |

**(b) A real unsigned act: 1, baselined as DEFECT with its follow-up**

- **`server/services/labeling/labeling-pi-service.ts:298`.** `acceptAgencyText` adopts the agency's proposed label text and sets `labeling_pi_sections.status = 'approved'` on a session and a reason for change alone.
  - **The route:** POST `/api/labeling-pi/:sectionNo/accept-agency-text` (`server/routes/labeling-pi.routes.ts`), mounted behind `authMiddleware` alone. It has no editor gate, no signing-authority check and no re-authentication, and writes no `electronic_signatures` row.
  - **Its client caller** is `client/src/concept2cure/v2/surfaces/LabelingPi.tsx`.
  - **Not in the launch catalog.** The `labeling-pi` surface is not in `shared/constants/launch-scope.ts`, so RULE 2 records it and does not fix it.
  - **Follow-up:** run the accept through `signGovernedAct`, as the labeling translation approval does, or adopt the text without marking the section approved.
  - **A second unsigned approval path the gate cannot see:** POST `/api/labeling-pi/` (`upsertLabelingPiSection`) takes `status: 'approved'` from the request body (`status = EXCLUDED.status`).

**(c) False positives, fixed in the matcher (none reached the baseline)**

- **A CASE test is not a write.** `server/services/c2c/commit-section-to-filing.ts:144` has `WHEN ds.status = 'approved'` in a CASE whose results are `'drafted'` and `'todo'`; the census prototype counted it. The gate reads only a whole-value literal. Gate mutation G5 (any quoted literal counts) puts back two such CASE-test false positives over the real tree, `fcoi-service.ts:142` and `ivdr-binder-routes.ts:309`. It also reads `orchestration-checkpoints.ts:272` as a write: that one does write `'approved'`, chosen by CASE, which is a limit (see "Not done").
- **WHERE, FILTER and SELECT conditions are not writes** (selftest case).
- **`superseded` and `locked` count only where a ceremony signs them.** The exclusion prevents 9 false positives, all listed under G4:
  - an AnA proposal, an assumption record, a failure pattern, a EULA version, a RIM label version, a client memory entry and an account canon fact (`superseded`);
  - the c2c document lock and an account canon fact (`locked`).
- **`accepted`, `executed`, `final`, `certified` and `determined` are not governed on every table.** No product constant declares them, and `accepted` and `executed` mean other things elsewhere (an invitation, a plan run). They are governed only as signed pairs.

**The VR-19 Vault seal (`765f2b399`)**
- It signs through `signGovernedAct` (`server/routes/c2c/project-vault.ts:2622`).
- Its domain write is `recordSeal`, an INSERT of a new `vault_data_room_seals` row that carries no status and no stamp. It is therefore not a status act, and the gate's view of it is unchanged.
- `list-after.txt` shows the ceremony's own sign write as `ok`.
- An unsigned INSERT into a sign-only table is a separate blind spot; see "Not done".

## Make the check fail

- **`red.txt`.**
  1. The cases this exists for, against HEAD's gate: 4 of 5 missed. The signed acceptance is not seen, the same write unsigned passes, M11 passes and an unsigned IRB approval passes. Only "a non-governed status is not an act" agrees.
  2. The current gate scored against HEAD's baseline: 10 files over their allowance (11 status-act sites), and 14 signed pairs not recorded.
  3. HEAD's gate lists no site in the risk route.
- **`green.txt`.** Selftest 44 of 44; `ci:sign-ceremony` exit 0 (29 baselined sites); the same 5 cases 5 of 5; eslint 0 errors, 10 warnings.
- **`mutations.txt`.**
  - **Gate mutations:** 10 of 10 red on the selftest. Each runs on a fresh scratch copy; the repository's gate files hash the same afterwards. They cover:
    - status acts dropped;
    - either source switched off;
    - no table-scoped exclusion;
    - lax value reading;
    - any `writeMutation` counted as a ceremony;
    - the record check off;
    - `$n` not read;
    - stamped statements double-counted;
    - a status act passing with no ceremony.

    G4 and G5 also show their false positives over the real tree.
  - **Product mutations:** 9 of 9 as expected, in memory only; no server file is written and the hashes are unchanged. HEAD's gate is green on every one.
    - P1 (M11) is red.
    - P1b is green on a gate without the record, which is why the record exists.
    - Red: a second unsigned accept route, the flag alone, a hazard created already accepted, a new file approving a consent form, a ceremony signing a new pair that is not recorded, and the labeling-pi defect fixed without lowering its allowance.
    - The control (`'mitigating'`) is green.
- **`list-before.txt` / `list-after.txt`.** The gate before (HEAD's, run over the same tree) and after.
- **Harnesses.** Saved as `harness-*.txt` (`.txt` so lint never counts them); `harness-evidence.sh.txt` regenerates every file here.

## Not done, and limits

- **Not seen: a status the gate cannot read as a literal.**
  - A value computed in code, or chosen by CASE. G5 surfaced `server/routes/orchestration-checkpoints.ts:272`, which approves a checkpoint by CASE; the route documents itself as "explicitly NOT a 21 CFR §11.50 electronic signature".
  - A value built from fragments, or supplied in the request body.
  - A Drizzle `.update(t).set({ status: 'approved' })`. Six exist and are not classified here: `WorkflowService.ts:627`, `ai-ml-pccp/pccp.service.ts:213`, `gspr-postmarket/post-market.service.ts:486`, `pdev/pdev-clearance.ts:149`, `workflow/ApprovalOrchestrator.ts:241` and `:300`. The stamp rule has the same limit.
- **The research-administration decisions are governed only where a ceremony writes them in its own handler.** Certified, determined, executed and final are signed across a boundary and declared nowhere. So a later unsigned write of, for example, `effort_certifications.status = 'certified'` is still invisible. The fix is a product declaration of the statuses each act sets, which is product code.
- **A signed act written as a new row**, such as the Vault seal's INSERT, is not a status act. An unsigned INSERT into such a table would not be seen.
- **Proofs across a boundary are still baselined, not recognized.** The gate measures one handler, an existing limit. Ten of the entries above are that.
- **The stamp rule still counts any `writeMutation` as a signature row.** Tightening it to `'sign'`, as status acts now are, changes no count at this head (checked). It is left for main to decide, since it changes an existing rule.
- **IBC and IACUC `'conditional'` outcomes** record a conditional approval under `governed('resolve')`, with no signature. Whether a conditional approval is a signed act is a domain question, not this gate's.
- **Not run:** the full-repo typecheck (instructions: it runs out of memory under parallel load). Lint was run on the four gate files only.

## Files

- `scripts/ci/check-sign-ceremony.mjs` (changed)
- `scripts/ci/check-sign-ceremony-status-acts.mjs` (new)
- `scripts/ci/check-sign-ceremony-source.mjs` (new; helpers moved from the gate)
- `scripts/ci/check-sign-ceremony.selftest.mjs` (changed)
- `scripts/ci/sign-ceremony-baseline.json` (changed)
- `docs/evidence/D5-SIGN-CEREMONY-STATUS-ACTS/2026-10-29/` (this directory)
- `package.json`: unchanged. `ci:sign-ceremony`, `:selftest` and `:list` run the same entry points.
