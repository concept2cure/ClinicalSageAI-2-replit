/**
 * Who may add to the Vault, file in it, or record what its documents say —
 * decided where the write happens, not only at the route.
 *
 * The web routes that write the Vault carry `requireEditorAccess`
 * (fd2ffa6ac: "a viewer could do both"). The services behind them —
 * `ingestVaultDocument` and `placeVaultDocument` — are also called by AnA's
 * `file_chat_upload_to_vault` and `place_project_document`, by authoring's
 * file-to-vault and by eSTAR retention, and none of those paths checked a role.
 * AnA's ToolContext carries no role at all, so no tool handler could have
 * decided on one. A viewer who asked AnA to file a document had it filed, and
 * row-level security does not stop it: the Vault's write policy scopes by
 * program, not by role. Reproduced on real PostgreSQL as the runtime role
 * (docs/evidence/D3/2026-09-24-vault-write-role/).
 *
 * AnA's `catalog_project_document` asks too (2026-09-26), in its handler,
 * `completeCatalog`'s only caller: the comprehension record's purpose line
 * reaches every member's session recall, so a viewer rewriting it is a write.
 *
 * So the services ask, from the role the tenant scope carries. On every request
 * path that is the `organization_users` role — the value `requireEditorAccess`
 * reads as `req.userRole` (server/auth.ts and establishRequestTenantScope both
 * take it from that column; the authoring router's token claim is minted from
 * it) — and the set is the middleware's own, not a copy. A scope with no role
 * is refused: every caller that writes the Vault today runs in a request scope,
 * and one that arrives without a role is one this check cannot vouch for.
 */
import { getTenantScope } from '../../db/tenantStore.js';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership.js';

export interface VaultWriteRefusal {
  ok: false;
  status: 403;
  code: 'VAULT_WRITE_ROLE_REQUIRED';
  message: string;
}

/** Null when the acting role may write the Vault; otherwise the refusal to return. */
export function vaultWriteRefusal(): VaultWriteRefusal | null {
  const role = String(getTenantScope()?.role ?? '').toLowerCase();
  if (GOVERNED_WRITE_ROLES.has(role)) return null;
  return {
    ok: false,
    status: 403,
    code: 'VAULT_WRITE_ROLE_REQUIRED',
    message: role
      ? `Your role in this organization (${role}) can read the Vault but not change it. ` +
        'Nothing was changed. An administrator can give you member access.'
      : 'No organization role is attached to this request, so nothing in the Vault was changed.',
  };
}
