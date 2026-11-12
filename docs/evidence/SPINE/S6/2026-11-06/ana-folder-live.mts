// S6 step 4 live check: AnA's folder writer and her folder listing on the real database (no model).
import { createProgramFolder, folderChoices, readProgramFolderIndex } from '../../../../../server/services/vault/vault-folders.ts';
import { pool } from '../../../../../server/db.ts';
import { runWithTenantScope } from '../../../../../server/db/tenantStore.ts';
const PROGRAM = '9942786f-4c01-436e-aab7-9a4e65990549';
const org = Number(process.argv[2]); const user = Number(process.argv[3]);
await runWithTenantScope({ tenantId: String(org) }, async () => {
const made = await createProgramFolder({
  programId: PROGRAM, organizationId: org, userId: user, name: `AnA study folder ${Date.now() % 100000}`, parentFolderId: 'bn:5.3',
  reason: 'The pivotal study needs its own folder under 5.3.',
  agent: { actorKind: 'agent:ana', tool: 'place_project_document', reason: 'The pivotal study needs its own folder under 5.3.' },
});
console.log('made', JSON.stringify(made));
const choices = folderChoices(await readProgramFolderIndex(pool, PROGRAM, org, 'pharma'));
console.log('binder', JSON.stringify(choices.binder), 'folders', choices.folders.length, JSON.stringify(choices.folders.filter((f) => f.kind === 'person')));
// Another organization cannot make a folder in this project (multi-tenant).
const other = await runWithTenantScope({ tenantId: String(org + 999) }, () => createProgramFolder({ programId: PROGRAM, organizationId: org + 999, userId: user, name: 'x', parentFolderId: null, reason: 'cross-tenant probe' })).catch((e) => ({ thrown: String(e.message ?? e) }));
console.log('other org', JSON.stringify(other));
});
await pool.end();
