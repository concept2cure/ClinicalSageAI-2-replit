// S6: move and remove a person's folder on the real database under RLS (app_service), with the refusals.
import { createProgramFolder, moveProgramFolder, removeProgramFolder } from '../../../../../server/services/vault/vault-folders.ts';
import { pool } from '../../../../../server/db.ts';
import { runWithTenantScope } from '../../../../../server/db/tenantStore.ts';
const PROGRAM = '9942786f-4c01-436e-aab7-9a4e65990549';
const org = Number(process.argv[2]); const user = Number(process.argv[3]); const filled = process.argv[4];
const base = { programId: PROGRAM, organizationId: org, userId: user };
const show = (k: string, r: unknown) => console.log(k, JSON.stringify(r));
await runWithTenantScope({ tenantId: String(org) }, async () => {
  const t = Date.now() % 100000;
  const a = await createProgramFolder({ ...base, name: `Move walk A ${t}`, parentFolderId: 'bn:5.3', reason: 'Live check of move and remove.' });
  const b = await createProgramFolder({ ...base, name: `Move walk B ${t}`, parentFolderId: a.ok ? a.folder.folderId : null, reason: 'Live check of move and remove.' });
  if (!a.ok || !b.ok) throw new Error('setup');
  show('into itself  ', await moveProgramFolder({ ...base, folderId: a.folder.folderId, parentFolderId: b.folder.folderId, reason: 'Should be refused.' }));
  show('not empty    ', await removeProgramFolder({ ...base, folderId: a.folder.folderId, reason: 'Should be refused: it holds a folder.' }));
  show('holds a file ', await removeProgramFolder({ ...base, folderId: filled, reason: 'Should be refused: it holds a document.' }));
  show('binder       ', await removeProgramFolder({ ...base, folderId: 'bn:5.3', reason: 'Should be refused: the binder.' }));
  show('moved        ', await moveProgramFolder({ ...base, folderId: b.folder.folderId, parentFolderId: 'bn:M4', reason: 'It belongs with the nonclinical reports.' }));
  show('removed B    ', await removeProgramFolder({ ...base, folderId: b.folder.folderId, reason: 'Made for the walk; empty.' }));
  show('removed A    ', await removeProgramFolder({ ...base, folderId: a.folder.folderId, reason: 'Made for the walk; empty.' }));
  globalThis.__a = a.folder.folderId;
});
// Another organization: neither act reaches this project's folders.
await runWithTenantScope({ tenantId: String(org + 999) }, async () => {
  show('other org mv ', await moveProgramFolder({ ...base, organizationId: org + 999, folderId: filled, parentFolderId: null, reason: 'cross-tenant probe' }).catch((e) => ({ thrown: String(e.message ?? e) })));
  show('other org rm ', await removeProgramFolder({ ...base, organizationId: org + 999, folderId: filled, reason: 'cross-tenant probe' }).catch((e) => ({ thrown: String(e.message ?? e) })));
});
await pool.end();
