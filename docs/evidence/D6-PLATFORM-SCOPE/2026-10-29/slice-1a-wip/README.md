# P-72 slice 1a: work in progress, not landed

**Status: stopped mid-work on 2026-10-30.** The account's weekly agent limit stopped the worker. Nothing here is in the product or on the deploy set.

**What the patch holds**
- The D1 regression fix, partly written:
  - the three function SET clauses (`user_id_for_email`, `user_id_for_reset_token`, `invitations_for_member`) amended in the 20260928 creators;
  - a new converge migration, `migrations/20261030b_platform_scope_role.sql`, and its migration-set entry.
- The role-string fix, partly written:
  - `authoring.router.ts` applies the membership role (`applyOrganizationRole`, router hunks for P-72 only);
  - `auth.js` becomes a re-export of `auth.ts`;
  - the request-scope builders (`establishRequestTenantScope`, `tenantStore`, `poolInstrumentation`) refuse `app_super_admin`;
  - a role CHECK in `20260926_organization_users_own_writes.sql`. The worker's last step was appending that CHECK block.

**What the worker had proven.** It reproduced the red only: on a production-shaped (non-superuser) applier, deploy-migrate halts at `migrations/20260928_users_membership_rls.sql` (320/455) with "permission denied to set parameter app.current_user_role". Nothing in the patch is verified green. Rule 1 review of the migrations is owed before it lands. In particular, the CHECK must be conditional, and safe for the role values already in deployed data.

**Why it matters.** Until the SET clauses go, a deploy on an RDS-shaped applier cannot complete (launch row D1). CI's superuser applier hides this. The production apply has not happened yet.

**To resume:** `git apply docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1a-wip/p72-slice-1a.patch.txt`, then continue from `brief.md`. The design, the slice-0 evidence and decision P-72 bind the work. The migration-set entry must be re-anchored before `UUID_TENANT_ISOLATION_NONPUBLIC` if the file has moved.
