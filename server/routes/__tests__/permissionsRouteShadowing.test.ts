/**
 * Two routers claimed /api/authoring/docs/:docId/permissions. Only one ever ran.
 *
 * server/bootstrap/register-inline-routes.ts mounts authoringPermissionsRouter
 * on '/api' BEFORE the big authoring router is mounted on '/api/authoring', and
 * the permissions router registers '/authoring/docs/:docId/permissions' with the
 * prefix baked in. It owns the same full path and never calls next(), so Express
 * matched it first every time and the authoring router's own POST/GET for that
 * path had never executed.
 *
 * They were also a divergent implementation of a governed capability: the legacy
 * POST wrote a bare INSERT INTO doc_permissions with no audit row, no
 * ON CONFLICT and no revoke, while the canonical one gates on a permission
 * manager, captures a reason, supports an expiry, and calls recordPermissionAudit
 * on grant and revoke.
 *
 * The cost of leaving it there was not neutral. The deleted POST carried a
 * careful tenant-scoping fix — role allowlist, document-in-tenant check,
 * section-belongs-to-document check, each with its own 404 — written into a
 * route Express never reaches. A reader would have believed those guards were in
 * force.
 *
 * These assertions pin the ownership so the dead pair cannot come back.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8');

const bootstrap = read('server/bootstrap/register-inline-routes.ts');
const permissionsRouter = read('server/routes/authoring-permissions.ts');
const authoringRouter = read('server/routes/authoring.router.ts');

describe('ownership of /api/authoring/docs/:docId/permissions', () => {
  it('mounts the permissions router BEFORE the authoring router', () => {
    const permissionsMount = bootstrap.indexOf("app.use('/api', authoringPermissionsRouter)");
    const authoringMount = bootstrap.indexOf("app.use('/api/authoring'");

    expect(permissionsMount).toBeGreaterThan(-1);
    expect(authoringMount).toBeGreaterThan(-1);
    // Express matches in registration order — this ordering is what decides the winner.
    expect(permissionsMount).toBeLessThan(authoringMount);
  });

  it('the permissions router owns the path and never delegates', () => {
    expect(permissionsRouter).toMatch(/router\.(get|post)\('\/authoring\/docs\/:docId\/permissions'/);
    // A next() would let the shadowed route run after all; there is none.
    expect(permissionsRouter).not.toMatch(/\bnext\(\)/);
  });

  it('the authoring router no longer declares the shadowed pair', () => {
    // Match route DECLARATIONS only — the deletion note mentions the path in prose.
    const declarations = authoringRouter.match(
      /router\.(get|post)\(\s*'\/docs\/:docId\/permissions'/g,
    );
    expect(declarations).toBeNull();
  });

  it('the surviving permission-management implementation writes an audit row', () => {
    expect(permissionsRouter).toMatch(/recordPermissionAudit/);
  });

  it('writes doc_permissions through the canonical grant writer, never with its own INSERT', () => {
    /* This router used to carry one remaining raw INSERT: POST /docs granting
       the creator AUTHOR on the document it had just made, best-effort and
       outside the transaction. That was a second, weaker writer — email-only,
       no principal id, no grantor, no reason — sitting beside the canonical
       DDL trigger that already seeds the creator as OWNER + AUTHOR keyed on the
       verified principal. The bootstrap grant is still made here (without it
       the creator is denied on their next edit, with the per-user matrix
       enforced by default), but it goes through grantAuthoringPermission, which
       is idempotent against the trigger and records what the canonical
       decision reads.

       So the assertion is now stronger than "exactly one": this file may
       contain NO raw write to the permission store at all. The deleted
       management route cannot return, and neither can a hand-rolled grant. */
    /* Comments stripped first — the deletion note above the removed routes
       quotes the statement it is describing, and a prose mention is not a
       writer. */
    const code = authoringRouter
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code.match(/INSERT INTO doc_permissions/g)).toBeNull();
    expect(code).toMatch(/grantAuthoringPermission\(/);
    // …and the one caller is the creator bootstrap, which cannot fail the create.
    expect(code).toMatch(/creator ownership grant failed/);
  });

  it('drops the constant that only the deleted route used', () => {
    expect(authoringRouter).not.toMatch(/GRANTABLE_SECTION_ROLES/);
  });
});
