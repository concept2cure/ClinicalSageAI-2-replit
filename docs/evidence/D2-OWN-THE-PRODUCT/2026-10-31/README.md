# D2: "The UI doesn't work", walked in the app (2026-10-31)

**Where.** The founder reported "The UI doesn't work /design". The app has no `/design` route: ZenRouter sends
every unknown path to Home, and the walk confirmed it lands there. So the whole shell was walked in headless
Chromium. The lane database was migrated as a deploy migrates (459/459 files), and the app was signed in as the
organization's admin.

## What already exists

- **The shell.** `client/src/concept2cure/v2/Shell.tsx`, and the routing in `routing.ts` (`destinationFor`).
- **Project skills.** The Project home's skills panel (`ProjectSkills.tsx`) reads
  `GET /api/ana-skills/projects/:project` (`server/routes/ana-skills.ts`). Admission is decided by
  `admitAnaProjectScope` (`server/services/ana/project-scope-admission.ts`).
- **The Vault's CSV manifest reader.** `vaultUploadManifest.ts` imports `csv-parse/browser/esm/sync`.
- **The build.** `vite.config.ts` had no `optimizeDeps`.

## Found and fixed

1. **Project home refused the admin its own project's AnA skills (403, `ANA_PROJECT_ACCESS_DENIED`).**
   - **What the person saw.** "An identified organization member is required to read this project."
   - **Cause.** The route passed `req.user.id` and `req.user.organizationId` raw. Auth sets the id to the token's
     subject, which can be a string, and admission takes numbers only. The router's own `orgOf` and `actorOf`
     already coerce.
   - **Fix.** `projectOf` coerces the same way.
   - **Proof.**
     - The new test in `ana-skills-project-routes.test.ts` was red (`{ …(3) }` did not match
       `{ organizationId: 42, userId: 5 }`) and is green now.
     - Both ana-skills suites pass, 34 of 34.
     - Live: 403 before, 200 after, with `canChange: true`.
2. **The first Vault open after a restart blanked the whole screen.**
   - **Cause.** Vite discovered `csv-parse/browser/esm/sync` only when the Vault's chunk loaded. The server log
     then read "new dependencies optimized … reloading", and the entire page reloaded: a blank screen, with
     what was on it dropped.
   - **Fix.** The dependency is pre-bundled at start (`optimizeDeps.include`).
   - **Proof.** With a cold `node_modules/.vite`, the first Vault open renders (6,235 characters), and the
     server logs no re-optimization. Dev and preview servers only; a production build never re-optimizes.

## After

`ui-walk-after.txt`, from `ui-walk.cjs`: Project home and every rail surface with a project open (Vault, Tasks,
Communication, CMC / Module 3, Risk-based monitoring, Quality, Reporting & analytics, Projects, Home). Each
renders with 0 page errors, 0 console errors and 0 failed requests. `vault-after-first-open.png` is the Vault
on its first open.

## Not changed, for a decision

**With no project open, five rail entries land on Projects, and nothing says why.** The entries are Tasks,
Communication, Vault, CMC / Module 3 and Quality.

- **Where it happens.** `routing.ts:35` sends a project-scoped destination to Projects (`8b192f1e75`,
  deliberate). Projects then shows no "choose a project to open the Vault", and choosing one does not continue
  to the Vault.
- **What exists to build on.** Each of those surfaces already has its own honest empty state ("Open a project to
  see its vault"); the redirect keeps it from being reached.
- **Why it isn't changed here.** It is the client-journey lane's design, under active development.

## Also checked

- **Production.** `vite build` and the server build both succeed.
- **The production server boots only with every required secret, and a clamd that answers.** It refused to
  start without `AUDIT_HMAC_SECRET`, `CONNECTOR_ENCRYPTION_KEY` and `MFA_ENCRYPTION_KEY`, as `.env.example`
  documents. These requirements are weeks old, not new.
- **No clamd here.** This sandbox has none, so the production bundle was not walked.
- **HawkScan** was not run, because there is no `HAWK_API_KEY`.
