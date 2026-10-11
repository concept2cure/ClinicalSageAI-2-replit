import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDispositionHarness, type DispositionFixture, type DispositionHarness } from './disposition-fixture';

let h: DispositionHarness;
beforeAll(async () => { h = await createDispositionHarness(); });
afterAll(async () => { await h.close(); });

async function draft(f: DispositionFixture, status = 'draft', sourceId = f.vault, hash = 'a'.repeat(64), tenant = f.org) {
  const id = randomUUID();
  await f.pg.query(`INSERT INTO authoring_documents (id,tenant_id,status,client_program_id,provenance)
    VALUES ($1,$2,$3,$4,$5)`, [id, tenant, status, f.program, JSON.stringify({ source: 'ana', projectSourceReferences: [
    { sectionCode: '2.5', sources: [{ documentId: sourceId, contentHash: hash, span: { start: 0, end: 10, totalChars: 20 } }],
      qualification: 'unassessed', verification: 'current_at_save' },
  ] })]);
  return id;
}

describe('saved project-source references contribute to withdrawal impact', () => {
  it('counts a saved draft without claiming approval or blocking retained data', async () => {
    const f = await h.seed();
    const before = await f.service.preview(f.scope);
    await draft(f);
    const after = await f.service.preview(f.scope);
    expect(after.counts.downstreamReferences).toBe(before.counts.downstreamReferences + 1);
    expect(after.approvals.active).toBe(0);
    expect(after.allowedChoices).toContain('keep_data');
  });

  it.each(['review', 'IN_REVIEW', 'APPROVED', 'FROZEN', 'locked', 'submitted', 'EFFECTIVE'])('blocks source withdrawal for saved-source document state %s', async status => {
    const f = await h.seed();
    await draft(f, status);
    const preview = await f.service.preview(f.scope);
    expect(preview.approvals.active).toBe(1);
    expect(preview.allowedChoices).toEqual([]);
    expect(preview.blockers.join(' ')).toContain('Active review');
    await expect(f.service.apply({ ...f.scope, choice: 'remove_data', reason: 'Withdraw incorrect endpoint values', previewToken: preview.previewToken }))
      .rejects.toMatchObject({ code: 'DISPOSITION_BLOCKED' });
    expect(await f.records()).toHaveLength(0);
  });

  it('invalidates a reviewed preview when the source is saved into a draft afterward', async () => {
    const f = await h.seed();
    const preview = await f.service.preview(f.scope);
    await draft(f);
    await expect(f.service.apply({ ...f.scope, choice: 'remove_data', reason: 'Withdraw incorrect endpoint values', previewToken: preview.previewToken }))
      .rejects.toMatchObject({ code: 'STALE_PREVIEW' });
    expect(await f.records()).toHaveLength(0);
    expect(await f.audits()).toHaveLength(0);
  });

  it('does not count another tenant, another document ID or a different source hash', async () => {
    const f = await h.seed();
    const before = await f.service.preview(f.scope);
    await draft(f, 'APPROVED', f.vault, 'a'.repeat(64), f.org + 100);
    await draft(f, 'APPROVED', randomUUID());
    await draft(f, 'APPROVED', f.vault, 'b'.repeat(64));
    const after = await f.service.preview(f.scope);
    expect(after.counts).toEqual(before.counts);
    expect(after.approvals.active).toBe(0);
    expect(after.allowedChoices).toContain('remove_data');
  });
});
