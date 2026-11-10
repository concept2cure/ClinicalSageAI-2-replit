/**
 * Folders belong to a project, and there is one way to change them (P-123, 2026-11-10).
 *
 * History, so the next reader does not rebuild it. `/api/folders` (server/routes/folder-management.js) kept
 * organisation-wide folders in `public.document_folders`. It first read its organisation from the query string
 * (any tenant's folders, by asking); once bound to the session's organisation it still listed, renamed and
 * hard-deleted every folder of the organisation, which after S6 gave folders to projects meant one sponsor's
 * project folders were reachable from another's inside a CRO (repaired 2026-11-10, then pinned here). It never had
 * a client caller, an audit row or a reason for change.
 *
 * It is retired. A folder is made, renamed, moved and removed only through its project's Vault
 * (server/routes/c2c/project-vault.ts, server/services/vault/vault-folders.ts): the project's write authority, a
 * reason, and a chained audit row, under row security. This pins that the second door stays shut:
 * the route file is gone, nothing mounts it, and no other route writes the store.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) filesUnder(rel, out);
    else if (/\.(ts|js|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
}

describe('folders have one governed door', () => {
  it('the organisation-wide folder route is gone and nothing mounts it', () => {
    expect(fs.existsSync(path.join(ROOT, 'server/routes/folder-management.js'))).toBe(false);
    expect(read('server/bootstrap/register-document-routes.ts')).not.toMatch(/import\(['"][^'"]*folder-management/);
  });

  it('no route but the project Vault writes public.document_folders', () => {
    const writes = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?document_folders\b/i;
    const writers = [...filesUnder('server/routes'), ...filesUnder('server/api')].filter((f) => writes.test(read(f)));
    expect(writers).toEqual([]);
    expect(writes.test(read('server/services/vault/vault-folders.ts'))).toBe(true);
  });
});
