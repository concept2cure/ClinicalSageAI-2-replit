You are a scoped worker in /home/user/ClinicalSageAI-2-replit doing P-72 slice 1a.

Read first, in full:
- docs/design/PLATFORM_SCOPE_AS_A_ROLE_2026-10-29.md;
- docs/LAUNCH_DEFINITION_OF_DONE.md "### P-72", with its amendment;
- the slice-0 evidence at docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-0/README.md (commit 486d3af3c), whose measurements override the design where they disagree.

The lead commits and pushes. You do NOT commit, push, stash or change git state.

Other workers share the tree:
- Offboarding custody (P-58/P-59) owns the tenant export, the purge doors and the purge loop. It is moving the export and the purge into the organization's own scope now. Do not touch those files.
- CSR draft control (editor and authoring client files; the draft route in authoring.router.ts).
- Fold F5 (device filing).

If you must edit a file another lane touches, message the lead first.

When the lead sends "freeze":
- stop editing;
- stop your PostgreSQL;
- run nothing heavy;
- reply "frozen";
- wait for "go".

Work compactly: logs to files, read their tails.

Reuse the slice-0 worker's private cluster and scripts in /tmp/claude-0/-home-user-ClinicalSageAI-2-replit/6396cbd4-d9c3-52f8-9173-e7fd431e4774/scratchpad/p72/ (pgstart.sh, the probes, the production-shaped copy method), on its port 55472.

## Slice 1a: two things, in this order (CLAUDE.md Rule 1 applies throughout: amend creators in place with dated headers; every migration re-runs on every deploy)

1. **D1 regression: unblock the non-superuser deploy.** Three functions name a custom setting in their SET clause:
   - user_id_for_email (migrations/20260928_users_membership_rls.sql:96);
   - user_id_for_reset_token (:114);
   - invitations_for_member (migrations/20260928_invitations_for_member.sql:78).

   PostgreSQL 15+ refuses that to a non-superuser creator, so deploy-migrate halts at file 320 of 455 on an RDS-shaped applier.

   Do the following:
   - Remove the SET clauses by amending the creators in place.
   - Keep the functions' behaviour (pre-auth lookups for login and password reset) without any session-settable scope. The design re-owns them; follow its §3.5.
   - For installed databases, converge the stored definitions with a guarded migration, as 20261029j does for its helpers. It must be conditional on the stored text, and its slot goes before the final sweep pair.
   - Prove it:
     - **red:** deploy-migrate halts on the production-shaped, non-superuser applier;
     - **green:** it runs to the end, and login and password-reset lookups work on the production-shaped owner;
     - a second replay is clean.
   - Add a test or gate that fails if any function's SET clause (proconfig) names a custom setting, so this cannot come back. P-70's gate reads only function bodies.
2. **The role string.**
   - server/routes/authoring.router.ts:238 sets req.user.role from the token's claim, and :8276 sends it to app.current_user_role. Use the membership role, the way server/auth.ts:296 and applyOrganizationRole do. This is a minimal diff; the CSR lanes edit this file too, so re-read it first.
   - Refuse the literal 'app_super_admin' as the role of any per-user or request scope, wherever the request scope is built (establishRequestTenantScope / tenantSessionVars / poolInstrumentation). The system scope is built only by the server's own system-scope helpers.
   - Add a database guard: organization_users.role has no CHECK today. Add one admitting the assignable org roles plus whatever staff values exist in deployed data. Measure those first, and make it conditional and NOT VALID-safe for existing rows.
   - Prove it: red today (slice 0 measured a role string of 'app_super_admin' reading and updating another tenant's rows, and writing 'app_super_admin' onto its own membership), then green, then mutations.

Everything else in slice 1 (zero-row verifiers, the retention sweep, the chain sweep's scope, the 15 dependent paths) is the next brief. Do not start it.

Gates:
- ci:migration-drop-safety and its selftest;
- ci:migration-set-order;
- ci:migration-deploy-path and its selftest;
- ci:session-scoped-rls-bypass and its selftest;
- ci:tenant-isolation:no-regression;
- ci:tenant-resolvers;
- eslint, with no new warnings;
- scoped tsc.

Evidence goes in docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1a/, with a README containing "What already exists".

Report back:
- every file changed;
- your exact migration-set.mjs lines;
- red, green and mutation counts;
- gates;
- decisions needed;
- what is not done.

If you find a live cross-tenant read or a deploy that cannot complete, message the lead at once.
