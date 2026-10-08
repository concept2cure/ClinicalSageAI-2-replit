# Submission Center, third pass: signing authority on every signed act, the package's applicant and application from the record, anchors of the right type, a picker that never truncates silently

Follow-ups from the second browser walk of j6 (Submission Center), `scratchpad/qa/findings-2/j6-submission-center.json`.
This moves row **D7** (transmit to the agency: who may sign it, and what the package names) and **D2** (the filing
spine: anchoring a submission to its project, placing documents from the Builder). Nothing outside the launch catalog
was added; no migration was added.

Every new or changed test was written first and run **red against the working tree before its fix** (`red/`), then
green (`green/`). The working tree is shared with other workers, so nothing was stashed. Other workers' uncommitted
hunks in `submission-service.ts` (upsertLeaf / alreadyPlaced), `coauthor.ts` (POST /documents `written`) and
`ind-checklist-view-assembler.ts` were kept untouched.

| | Red, before the fix | Green |
|---|---|---|
| All new and changed tests (29 files) | see the per-item files in `red/` | 445 / 445 ([`green/all-new-and-changed-tests.txt`](green/all-new-and-changed-tests.txt)) |
| Golden journeys (11 files) + `tests/lineage` | — | 22 / 22 and 15 / 15 ([`checks/journeys-and-lineage.txt`](checks/journeys-and-lineage.txt)) |
| DB tier, fresh database `concept2cure-ri_qa_fresh2`, RLS on (49 files) | — | 669 / 669 ([`checks/db-tier.txt`](checks/db-tier.txt)) |
| Related suites (submission-service, ectd, part11, gateways, tasking, ana-ri, c2c, ind-lifecycle, pathway engines, CMC, routes, client v2) | — | [`checks/related-suites.txt`](checks/related-suites.txt) |

## 1. Security: the Gateway transmit had no signing-authority check (and six more signed acts did not either)

**Cause.** `POST /api/mdx/gateways/:region/:gateway/transmit` ran `requireEditorAccess` (who may *write*) and
`verifyReauth` (who *is* signing), never whether the signer *may* sign (21 CFR 11.10(g)). A manager — P-18: managers do
not sign — signed a transmit as "Release", passed re-authentication, and was refused only because the package did not
exist. The technical-rejection sign on the same router had the same gap.

**Fix — one policy, one helper.**
- `server/services/part11/signing-authority-gate.ts` (new) holds `checkSigningAuthority(userId, orgId)`: the
  membership row's role (`resolveSignerOrgRole`) against `isSigningAuthorized`; 403 `ESIGNATURE_NO_AUTHORITY`, or 503
  `SIGNING_AUTHORITY_UNVERIFIED` when the lookup cannot run (cause logged, never shown). It is the governed ceremony's
  private `assertSigningAuthority`, **moved**, not copied: `governed-signature-ceremony.ts` now delegates to it. It
  lives outside `resolve-signer-role.ts` so a test's module mock of the resolver still governs it.
- Gateway transmit and technical rejection ask it **before the password** (`mdx-submission-gateway.ts`). Rollback is
  not a signature (no signature row; `transmittal_rollback` is not in the canonical route's `SIGNATURE_COMMANDS`), so
  it keeps the editor gate and re-authentication.
- `GET /api/mdx/gateways` answers `meta.signing.canSign` from the same check. The Gateway transmittals screen does not
  offer **Transmit** or **Technical rejection** to a non-signer and says why; unknown (`null`) hides nothing; a 403 is
  said in the server's words.

**Sweep.** Every handler that calls `verifyReauth` / `reverifySigner`, after the change:

| Handler | Signs? | Authority before the password |
|---|---|---|
| `POST /api/c2c/actions/sign`, revoke (`c2c/actions.ts` makeHandler) | yes | already: `signingAuthorityRefusal` |
| `signGovernedAct` ceremony (protocol finalize / review, report finalize) | yes | already; now via `checkSigningAuthority` |
| `governed-signed-act.ts` (IRB and domain acts) | yes | already: inline `isSigningAuthorized` |
| CMC batch release, spec approve, register qualify, Module 3 approve | yes | already: `refusedWithoutSigningAuthority` |
| Authoring `/docs/:id/freeze`, `/e-sign`, `/sign` | yes | already: `assertSigningAuthority` (helper `reverifyAuthoringSigner` baselined) |
| `/api/esignature/sign`, document-lifecycle sign/advance, QMS approvals, RBM ×2, PCCP, sign-release, AnA seal-verified | yes | already |
| **Gateway transmit** (`mdx-submission-gateway.ts`) | yes | **added** |
| **Gateway technical rejection** | yes | **added** |
| **Financial disclosure certify** (`financial-disclosures.ts`, Form 3454/3455) | yes | **added** |
| **eSTAR filing** (`PATCH /api/510k/estar/submissions/:id` → filed) | yes | **added** |
| **AnA apply-rewrite with a signature** (`ana-features.ts`) | yes | **added** |
| **AnA governed-action, e-signature tier** (`ana-ri/governed-esignature.ts`) | yes (every action of the tier writes a signature) | **added**, after the meaning, before the password |
| **Artifact approve / lock** (`PUT …/artifacts/:id/status`) | yes | **added** (the status table read the session role, not the membership row) |
| **Task sign-off** (`services/tasking/task-signoff.ts`, both task routers) | yes | **added** |
| Gateway rollback | no signature row | none, by design (baselined with reason) |
| `/api/c2c/documents/:id/lock` | `lock` writes no signature | none, by design (baselined) |
| Gateway account change (`gateway-accounts.ts`) | admin/owner config change | none, by design (baselined) |
| `verifyReauth` itself (`c2c/actions.ts`) | the primitive | its callers ask (baselined) |

**ci:sign-ceremony now requires it.** It had no way to; it gained one: every handler that re-verifies a signer must
also call the signing-authority policy in that handler, or be baselined under `authority` with a written reason
(`scripts/ci/check-sign-ceremony.mjs`, `sign-ceremony-baseline.json`). The rule fails on HEAD's sources for all seven
fixed files and passes now ([`checks/sign-ceremony-authority-rule-head-vs-tree.txt`](checks/sign-ceremony-authority-rule-head-vs-tree.txt));
the selftest gained six cases, including the pre-fix transmit shape (25 pass).

**Red → green.** `item1-gateway-authority-before-fix.txt` (7 red; the cases now live in
`tests/mdx-submission-gateway-signing-authority.test.ts`), `item1-gateway-client-before-fix.txt` (2 red, 2 guards),
`sweep-*-before-fix.txt` (financial disclosures 3, eSTAR 2, apply-rewrite 2, AnA governed action 3, artifact status
2, task sign-off 3). All green.

## 2. The package named "UNASSIGNED (organization 1)" and the program code as the application number

**Cause.** Each path filled the gap itself: `recordedApplicationId` answered the recorded number, else the **program
code**, else `UNASSIGNED-SEQ-<id>`; the applicant defaulted to `UNASSIGNED (organization N)` in
`assembleSubmissionEctd`, `transmitSequence` (the client sends no sponsor name) and the eCTD compile. A transmit
for a project with no recorded number accepted any typed one.

**Fix.** `server/services/ectd/package-identity.ts` (new) is the one reader: the applicant is `organizations.name`
(the sponsor of record, as Form FDA 1571 takes it); the application number is `regulatory_programs.application_number`
of the submission's project, and nothing else. With either missing, `packageIdentityRefusal` refuses by name.
- Export / inspection copy (`assembleSubmissionEctd`): refused, 409 `PACKAGE_IDENTITY_MISSING` (`ectd-export.ts`).
- Transmit (`transmitSequence`): refused before the gateway, the signature void; the governed precheck and the
  Dispatch tab say so before anyone signs, and the Dispatch tab shows **Applicant** and **Application number** as
  recorded. The route no longer takes a `sponsorName`.
- eCTD compile: the assembly is refused (`ASSEMBLY_REFUSED`, status `failed`); the draft backbone (a non-transmissible
  status document) says `UNASSIGNED-…` instead of the program code.
- `recordedApplicationId` is deleted; its replacement is named in its place.
- XML builders checked: the regional packager writes what it is given (the callers above were the fallback). The IND
  us-regional envelope builder (`ind-ectd-envelope.ts`) silently omitted an empty sponsor; it now refuses by name.

**Red → green.** `item2-export-identity-before-fix.txt` (4 red), `item2-export-route-before-fix.txt` (1),
`item2-compile-identity-before-fix.txt` (4 red, plus 1 fixture expectation updated), `item2-dispatch-tab-before-fix.txt`
(2), `item2-ind-envelope-before-fix.txt` (2). The transmit cases (`refused-step-voids-signature.pglite.test.ts`,
3 new) were first run against a sequence an earlier case had already sent, so that red run did not isolate the
defect; it is not filed. Fixtures that exported or transmitted without a recorded identity now record one (export
golden journey, lineage world — the project is created with its IND number — rehearsal, gateway-selection,
guard-refusal, validated-honesty).

## 3. "Anchor to a project" offered every program

**Cause.** `anchorSubmissionToProgram` checked organisation, role and leaves, not type; the client listed
`GET /api/c2c/projects` (every project, capped at 50).

**Fix.** The rule is the shared submission-type resolution (`shared/regulatory/submission-type-bridge.ts`,
`isSameSubmissionType`: both strings resolve to one registry entry; unknown matches nothing; never a name). The anchor
refuses 409 `APPLICATION_TYPE_MISMATCH` before the role check. `GET /api/submissions/:id/program-anchor`
(`listAnchorCandidates`) answers the projects of the submission's type and counts the rest; the control offers only
those and says how many are not offered.

**Red → green.** `item3-anchor-server-before-fix.txt` (8 red: an IND was anchored to a 510(k) programme),
`item3-anchor-client-before-fix.txt` (3 red). Green.

## 4. The co-author picker showed 50 of 53 documents silently

**Cause.** `GET /api/coauthor/documents` took only `limit` (default 50); the picker had no search, no paging, no count.

**Fix.** The list takes `q` (title or module number, case-insensitive text; `%`/`_` match themselves) and `offset`
(ties broken by id), and `total` counts what the search matches. The Builder's picker has a search box, says
"50 of 53 documents shown …", offers "Show 3 more", and keeps a chosen document when a later search hides it.

**Red → green.** `item4-coauthor-list-before-fix.txt` (4 red), `item4-picker-client-before-fix.txt` (5 red). Green.

## Checks

- Gates: [`checks/gates.txt`](checks/gates.txt) and [`checks/gates-related.txt`](checks/gates-related.txt), rerun after
  the last edit in [`checks/gates-final.txt`](checks/gates-final.txt) (ci:sign-ceremony, its selftest,
  ci:undefined-css-classes, ci:untracked-imports, ci:drizzle-tenant-scope). `ci:drizzle-tenant-scope` first failed on
  the coauthor search (organisation filter hidden in an array); the statement now names it. The new authority rule
  also caught this change once: moving the apply-rewrite check into a helper outside the handler (to keep the
  handler under its line limit) failed the gate at `ana-features.ts:2263`; the check is back in the handler.
  `ci:untracked-imports` currently fails on four imports of another worker's uncommitted AnA files, none of this
  change; `signing-authority-gate.ts`, `package-identity.ts` and the new tests must be added with this change.
- Related suites: [`checks/related-suites.txt`](checks/related-suites.txt). Server run: 423 files green after the
  rehearsal fixture recorded its identity. Client/routes/unit run: 1073 green, 1 red in
  `tests/regulatory-honesty.contract.test.ts`, which reads `surfaces/Review.tsx` — another worker's uncommitted edit,
  not touched here.
- Scoped tsc over the 58 changed files: [`checks/tsc-scoped.txt`](checks/tsc-scoped.txt) — no error on any line this
  change wrote; the remaining errors are on lines unchanged from HEAD.
- ESLint per changed file, HEAD vs now: [`checks/lint-table.txt`](checks/lint-table.txt) — no file gains a warning
  or an error (`mdx-submission-gateway-routes.test.ts` loses one).

## Decisions needed

1. **The applicant's `<id>` (D-U-N-S)** has no recorded home on the sequence path; packages still write
   `UNASSIGNED-ORG-<n>` there. Record it on the organisation (and refuse without it), or accept the gap.
2. **AnA e-signature tier now requires signing authority** — every action of the tier writes a signature, so a member
   or manager can no longer `place_in_dossier`, `revert_to_version` or `submit_document` through AnA (the HTTP
   placement route still lets an author place). Keep, or move those actions out of the e-signature tier.
3. **Task sign-off** on approval-gated tasks now refuses members and managers.
4. **Remaining placeholder assemblies that deliver no package**: the freeze/dispatch packageability check, the
   `POST /sequences/:id/assemble` dry run, and the package orchestrator's validation assembly (`'UNASSIGNED
   (applicant)'`). And AnA's `package_ectd_for_region` tool takes the sponsor and application number from model input.
5. **Inspection copies** now need a recorded application number; an IND before FDA pre-assigns one can be compiled
   only as a failed compile with the reason. Confirm.
6. Consolidating the remaining inline copies (`actions.ts signingAuthorityRefusal`, `cmc-signer`, eight inline
   checks) onto `checkSigningAuthority`.
