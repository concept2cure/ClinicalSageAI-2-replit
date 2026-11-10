# Demo Access F1 repair — account, organization, project and Tasking admission

Date: 2026-11-02. Branch: `concept2cure-v2`. Plan: F1. This is a repair of the existing authentication and demo entry, not a new module or customer workflow.

## What already exists

- `server/routes/auth.ts`: development-only `POST /api/auth/dev-login` and authenticated `GET /api/auth/session`; the development shortcut stays gated by `isDevAuthAllowed()`, which requires `NODE_ENV=development` and `ALLOW_DEV_AUTH=1`.
- `server/services/sign-in-organisation.ts`: `membershipsOf` and `signInMembership`, already used by normal login to choose one authorized organization **and its corresponding role**.
- `server/services/account-standing.ts`: existing active/pending status classification for accounts.
- `client/src/concept2cure/auth/ZenLogin.tsx` and `client/src/concept2cure/components/concept2cure-auth/Concept2CureLogin.tsx`: two existing Demo Access buttons; both previously persisted tokens and redirected immediately on HTTP login success.
- `client/src/concept2cure/auth/redirectUtils.ts`: existing shared post-login navigation/auth helper, extended with a bounded Demo Access readiness check; no new screen or route.
- `server/routes/c2c/projects.ts`: existing authenticated, scoped `GET /api/c2c/projects?limit=1` whose `meta.pendingStore` and `meta.reconciliationRequired` distinguish absent infrastructure from a real empty list.
- `server/routes/taskBoard.routes.ts`: existing `GET /api/task-management/board` whose `meta.partial` and `meta.unreadSources` distinguish unread stores from an empty board.
- `scripts/demo/launch-demo`: existing API-based data seed, which must be run by an authorized operator in the **same environment and tenant** as the Demo Access identity. No live seeding occurred in this repair.

The incident report and the unqualified 2026-10-30 demonstration recovery record are in this directory's parent. The current project is one document-type-driven project journey; CSR is a document type, not its own application or workspace.

## Defects and bounded changes

1. **Cross-organization role/tenant mismatch in development login.** The old handler combined `users.defaultOrganizationId` (preference, not authorization) with the role from the **first** `organization_users` membership. The resulting JWT could have a tenant/role combination that no membership authorized. Now it calls the existing `signInMembership(await membershipsOf(user.id), user.defaultOrganizationId)` and takes both values from that ONE membership.
2. **Unusable account and missing organization accepted.** Development login now rejects unverified/inactive accounts and absent/unnamed organizations BEFORE last-login update, session opening or JWT minting. It does not change normal login or widen development authentication access.
3. **False customer-ready Demo Access.** Both existing sign-in pages now verify the returned account through `GET /api/auth/session`, require that its email, user ID and organization ID match the response, require a recorded organization name, require a readable and nonempty authorized Projects list, and require a complete Tasking board read. Only then are tokens stored and the shell opened. A failure stays on the sign-in page with a direct explanation rather than creating an apparently successful empty demonstration.
4. **Unending preflight spinner.** The three GET checks have a 12-second bound covering transport and JSON body parsing. A timed-out or aborted read produces a visible failure; late responses cannot turn it into success. This deadline applies to demo admission reads, NOT document saves, uploads, approvals or signatures.

These are readiness checks, not tenant provisioning. No permission or licensing grant is faked. A project with no clinical data may still pass if at least one project is accessible; deeper Vault/data-room and editor qualification must be performed separately.

## Executed focused verification

The actual `server/routes/auth.ts` development-login callback was read from the pinned GitHub source, had only TypeScript type annotations erased, and was executed in a JavaScript sandbox with explicit DB/session/JWT doubles. **8 of 8** cases met their assertions: standard member, unmatched default preference fallback, matched second membership/role, no membership, unverified, suspended, missing organization, development shortcut disabled.

The actual `redirectUtils.ts` readiness implementation was read from the pinned source, with TypeScript-only syntax erased, and executed against controlled `fetch` responses. **8 of 8** cases met their assertions: healthy authenticated project+Tasking, wrong session organization, no project, unprovisioned store, partial Tasking, offline, malformed account organization, and denied session read.

These are isolated source-level checks against doubles, not a browser or real database. An executable Node test, `tests/ops/dev-login-membership.test.mjs`, and extended existing Vitest UI cases were committed to make the checks repeatable in the repository. Their **native test commands have not run** in this executor.

Commands required in the full checkout:

```sh
node --test tests/ops/dev-login-membership.test.mjs
npx vitest run client/src/concept2cure/auth/__tests__/devLoginUsesConfiguredIdentity.test.tsx
npm run ci:one-design-plan
npm run build
```

No branch gate, baseline, security control or CI setting was changed. The GitHub Actions check runs observed after the last commit were **queued or skipped**, not passed. No full typecheck, integration suite, real authenticated browser or deployed tenant was available here. A browser connection was attempted and refused because the originating browser context was unavailable.

## Operational work still open

- Provision the dedicated fictional Faux Biotech organization and project through the existing authorized Project Management flow, not as a separate "CSR workspace".
- Import the revised synthetic FBT-201 data through that project's existing Data Room/Vault; verify the stored hashes, source metadata, and supported format. The versioned JSON in GitHub is **not** a hosted record.
- Choose the CSR document type in the existing Project Management module, complete contextual questions, preview/freeze source tables, write in the one canvas/editor with AnA and save/reopen through governed workflow.
- Use actual assigned Tasks and Communication and navigate from review task to the right stored document. Test all rail destinations, broken/loading states, and actual role/tenant permissions on the deployed URL.
- Claim success only with the same authenticated browser/deployment, actual project and source IDs, and repeatable screenshots/receipts. Signature/approval require real authorized ceremonies and may not be synthesized by seeding data.

**Status: Source code pushed, focused test doubles pass; live demonstration remains NOT VERIFIED.**
