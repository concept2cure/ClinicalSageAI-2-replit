/**
 * May this member change governed records in this organization?
 *
 * The one check behind every door that writes a governed record for a person
 * without an HTTP route in front of it: the AnA tool registry wrapper
 * (AnaToolExecutor.ts, writeRoleRefusal) and the MCP connector's governed tools
 * (server/mcp/tools/runtime.ts). The HTTP routes make the same decision with
 * requireEditorAccess (server/middleware/orgMembership.ts) against the same
 * GOVERNED_WRITE_ROLES.
 *
 * The role is read live from organization_users for the verified principal,
 * never from a token claim or tool input. A lookup that fails refuses.
 *
 * Moved here 2026-09-28 from a private helper in AnaToolExecutor.ts when the
 * MCP connector needed the same decision (coverage-gap sweep GS-S-1), so the
 * two doors cannot drift.
 */

export type EditorRoleDecision =
  | { allowed: true; role: string }
  | { allowed: false; reason: 'not_editor'; role: string | null }
  | { allowed: false; reason: 'lookup_failed'; error: string };

export async function editorRoleDecision(userId: number, organizationId: number): Promise<EditorRoleDecision> {
  let role: string | null;
  try {
    const { resolveSignerOrgRole } = await import('./resolve-signer-role');
    role = await resolveSignerOrgRole(Number(userId), Number(organizationId));
  } catch (err) {
    return { allowed: false, reason: 'lookup_failed', error: err instanceof Error ? err.message : String(err) };
  }
  const { GOVERNED_WRITE_ROLES } = await import('../../middleware/orgMembership');
  if (!role || !GOVERNED_WRITE_ROLES.has(role)) return { allowed: false, reason: 'not_editor', role };
  return { allowed: true, role };
}

/** The refusal sentence for a decision that did not allow the write, naming what was attempted. */
export function editorRoleRefusalText(subject: string, act: string, decision: Exclude<EditorRoleDecision, { allowed: true }>): string {
  return decision.reason === 'lookup_failed'
    ? `${subject} could not confirm your role in this organization, so nothing was changed: ${decision.error}`
    : `Insufficient permissions: ${act} needs an editor role in this organization. Nothing was changed.`;
}
