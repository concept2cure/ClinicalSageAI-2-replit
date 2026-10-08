/**
 * What an organization role may do, for Admin and access (QA 2026-10-08, j9
 * finding 6). Every role card said "Org-level role derived from live
 * membership." and listed no scopes; an access review (21 CFR 11.10(d)) could
 * not read what a role grants.
 *
 * The scopes are not a second policy. Each one is read from the check that
 * enforces it, so the page cannot say a manager signs while the signing policy
 * refuses one, and a change to any of those checks shows here without an edit:
 *
 *   records:read        every member of the organization
 *   records:write       GOVERNED_WRITE_ROLES (middleware/orgMembership.ts)
 *   programs:manage     canMutateProgram's organization-wide branch (c2c/program-access.ts)
 *   records:sign        isSigningAuthorized (part11/signing-authority.ts)
 *   reports:finalize    the session's report:finalize (sessionPermissions)
 *   audit:read          AUDIT_READER_ROLES (audit/audit-api-authority.ts)
 *   members:administer  ADMINISTRATOR_ROLES (tenant/membership-change.ts, authorizeOrgAccess)
 */
import { GOVERNED_WRITE_ROLES, sessionPermissions } from '../../middleware/orgMembership';
import { isSigningAuthorized } from '../part11/signing-authority';
import { AUDIT_READER_ROLES } from '../audit/audit-api-authority';
import { canMutateProgram } from '../c2c/program-access';
import { ADMINISTRATOR_ROLES } from './membership-change';
import { REPORT_FINALIZE_PERMISSION } from '../../../shared/constants/permissions';

/** One sentence per role this product assigns; the signing sentence is appended from the policy. */
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  admin: 'Administers the organization (members, roles, settings, API keys) and may do everything a manager may.',
  approver: 'Everything a manager may.',
  manager: 'Manages every program, writes governed records and reads the audit trail.',
  reviewer: 'Everything a member may.',
  member: 'Writes governed records and creates programs.',
  viewer: 'Reads only; writes nothing.',
};

const UNDESCRIBED =
  'A role that is not one this product assigns; it may do only what the scopes below grant it.';

export interface RoleScopes {
  desc: string;
  scopes: string[];
}

export function roleScopesOf(role: string): RoleScopes {
  const r = role.trim().toLowerCase();
  const signs = isSigningAuthorized(r);
  const scopes = ['records:read'];
  if (GOVERNED_WRITE_ROLES.has(r)) scopes.push('records:write');
  if (canMutateProgram({ actor: { userId: null, orgRole: r }, program: { leadUserId: null } })) scopes.push('programs:manage');
  if (signs) scopes.push('records:sign');
  if (sessionPermissions(r).includes(REPORT_FINALIZE_PERMISSION)) scopes.push('reports:finalize');
  if (AUDIT_READER_ROLES.includes(r)) scopes.push('audit:read');
  if (ADMINISTRATOR_ROLES.includes(r)) scopes.push('members:administer');
  const base = DESCRIPTIONS[r] ?? UNDESCRIBED;
  return { desc: `${base} ${signs ? 'Signs electronic records.' : 'Does not sign.'}`, scopes };
}
