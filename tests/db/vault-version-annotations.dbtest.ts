/**
 * Review annotations on a Vault version, through the real routes (plan
 * critique 15, rows D2 and D5). PostgreSQL as the runtime role with RLS on.
 *
 *   - An annotation is anchored to the whole version, a page of a version with
 *     a recorded page count, or a passage of its extracted text counted in
 *     characters (code points); each is listed with the version's open counts,
 *     and each act is a chained row on the version's history carrying the words
 *     and their SHA-256.
 *   - A wrong page, a page on a version with no page count, a passage that is
 *     not where it says, or one selected from text that has since changed is
 *     refused. Reading the text to select a passage is itself recorded.
 *   - Replies go under an open annotation. An annotation is resolved with a
 *     note (optionally naming the version that addressed it) or retracted by
 *     its author with a reason, never both, and neither twice.
 *   - A viewer is refused at the route and at the service; another
 *     organisation reads and changes nothing.
 *   - A stale anchor says so; the quote stays as written.
 * The record's own guards, the purge and the history window are in
 * vault-version-annotations-record.dbtest.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { harness, textFile, threePagePdf, type Tenant } from './vault-annotation-harness';

const h = harness('vanno');
const TEXT = 'Preamble 𝛼 then the dosing table shows 5 mg';
const QUOTE = 'the dosing table';
const CHAR_START = Array.from(TEXT.slice(0, TEXT.indexOf(QUOTE))).length;
const textSha = createHash('sha256').update(TEXT, 'utf8').digest('hex');
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

let mine: Tenant;
let theirs: Tenant;
const u = { author: 0, reviewer: 0, viewer: 0, other: 0 };
const ids = { txt: '', txtV2: '', pdf: '', untexted: '', elsewhere: '' };
const ann = { whole: '', page: '', passage: '', reply: '', toRetract: '' };

const base = (t: Tenant) => `/api/c2c/project-vault/${t.programId}`;
const as = async (who: number, role = 'admin', t: Tenant = mine) => request(await h.appFor(t, who, role));
const post = async (doc: string, body: Record<string, unknown>, who = u.author, role = 'admin') =>
  (await as(who, role)).post(`${base(mine)}/documents/${doc}/annotations`).send(body);
const act = async (id: string, what: 'replies' | 'resolve' | 'retract', body: Record<string, unknown>, who = u.author, role = 'admin') =>
  (await as(who, role)).post(`${base(mine)}/annotations/${id}/${what}`).send(body);
const list = async (doc: string) => (await as(u.author)).get(`${base(mine)}/documents/${doc}/annotations`);
const history = async (doc: string): Promise<string[]> => {
  const r = await (await as(u.author)).get(`${base(mine)}/documents/${doc}/history`);
  expect(r.status).toBe(200);
  return r.body.data.entries.map((e: { event: string }) => e.event);
};
const textAnchor = (over: Record<string, unknown> = {}) => ({ kind: 'text', quote: QUOTE, charStart: CHAR_START, textSha256: textSha, ...over });

beforeAll(async () => {
  h.state.owner = new Pool({ connectionString: databaseUrl, max: 4 });
  u.author = await h.user('dbtest-vanno-author@example.test', 'Ada Author');
  u.reviewer = await h.user('dbtest-vanno-reviewer@example.test', 'Rex Reviewer');
  u.viewer = await h.user('dbtest-vanno-viewer@example.test', 'Vi Viewer');
  u.other = await h.user('dbtest-vanno-other@example.test', 'Otto Other');
  await h.cleanup();
  mine = await h.tenant('mine');
  theirs = await h.tenant('theirs');
  for (const id of [u.author, u.reviewer]) await h.member(mine, id, 'admin');
  await h.member(mine, u.viewer, 'viewer');
  await h.member(theirs, u.other, 'admin');
  ids.txt = await h.ingest(mine, u.author, textFile(TEXT), { documentCode: `${h.CODE}-TXT`, documentTitle: 'Dosing notes' });
  ids.txtV2 = await h.ingest(mine, u.author, textFile(`${TEXT}, revised`), { supersedesDocumentId: ids.txt, documentTitle: 'Dosing notes' });
  ids.pdf = await h.ingest(mine, u.author, await threePagePdf(), { documentCode: `${h.CODE}-PDF`, documentTitle: 'Three page report' });
  ids.untexted = await h.ingest(mine, u.author, textFile('soon to have no text'), { documentCode: `${h.CODE}-NOTEXT`, documentTitle: 'No text' });
  ids.elsewhere = await h.ingest(mine, u.author, textFile('another document'), { documentCode: `${h.CODE}-ELSE`, documentTitle: 'Another' });
  await h.state.owner.query('UPDATE vault.documents SET extracted_text = NULL WHERE id = $1', [ids.untexted]);
}, 120_000);

afterAll(async () => {
  await h.cleanup().catch(() => {});
  await h.state.owner.end().catch(() => {});
  await h.removeStorage([mine, theirs]);
});

describe('posting an annotation (critique 15)', () => {
  it('anchors to the whole version, a page, or a passage, and lists each with the open counts', async () => {
    const whole = await post(ids.txt, { kind: 'comment', body: 'Overall this reads well.', anchor: { kind: 'document' } });
    expect(whole.status, JSON.stringify(whole.body)).toBe(201);
    ann.whole = whole.body.data.id;
    const page = await post(ids.pdf, { kind: 'request_changes', body: 'Page 2 table is missing units.', anchor: { kind: 'page', page: 2 } });
    expect(page.status, JSON.stringify(page.body)).toBe(201);
    ann.page = page.body.data.id;
    const passage = await post(ids.txt, { kind: 'request_changes', body: 'State the dose per kg.', anchor: textAnchor() });
    expect(passage.status, JSON.stringify(passage.body)).toBe(201);
    ann.passage = passage.body.data.id;

    const out = await list(ids.txt);
    expect(out.status).toBe(200);
    const byId = new Map(out.body.data.annotations.map((x: { id: string }) => [x.id, x]));
    expect(byId.get(ann.passage)).toEqual(expect.objectContaining({
      kind: 'request_changes', status: 'open', authorId: u.author, authorName: 'Ada Author', anchorCurrent: true, replies: [],
      anchor: { kind: 'text', quote: QUOTE, charStart: CHAR_START, charEnd: CHAR_START + QUOTE.length, textSha256: textSha },
    }));
    expect(byId.get(ann.whole)).toEqual(expect.objectContaining({ kind: 'comment', anchor: { kind: 'document' }, anchorCurrent: null }));
    expect(out.body.data.openByVersion).toEqual(expect.arrayContaining([
      expect.objectContaining({ versionId: ids.txt, open: 2, openChangeRequests: 1, current: false }),
      expect.objectContaining({ versionId: ids.txtV2, open: 0, openChangeRequests: 0, current: true }),
    ]));
    const pdf = await list(ids.pdf);
    expect(pdf.body.data.annotations[0].anchor).toEqual({ kind: 'page', page: 2, pagesAtPost: 3 });
  });

  it("each post is a chained row on the version's history, with the words and their SHA-256", async () => {
    expect(await history(ids.txt)).toEqual(expect.arrayContaining([
      'Comment posted on the whole document',
      `Change request posted on a passage: “${QUOTE}”`,
    ]));
    expect(await history(ids.pdf)).toContain('Change request posted on page 2');
    const { rows } = await h.state.owner.query(
      `SELECT new_values::jsonb AS v, user_id, sha256_chain FROM audit_logs
        WHERE tenant_id = $1 AND action = 'vault.document.annotate' AND new_values::jsonb ->> 'annotationId' = $2`,
      [mine.orgId, ann.passage],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].v).toEqual(expect.objectContaining({ body: 'State the dose per kg.', bodySha256: sha('State the dose per kg.'), authorName: 'Ada Author' }));
    expect(rows[0].user_id).toBe(u.author);
    expect(rows[0].sha256_chain).toBeTruthy();
  });

  it('counts a passage in characters, not UTF-16 units', async () => {
    const utf16 = TEXT.indexOf(QUOTE);
    expect(utf16).not.toBe(CHAR_START);
    const wrong = await post(ids.txt, { kind: 'comment', body: 'Off by one?', anchor: textAnchor({ charStart: utf16 }) });
    expect([wrong.status, wrong.body.error]).toEqual([409, 'QUOTE_MISMATCH']);
  });

  it('refuses a page out of range, a page without a page count, missing text, and text that changed', async () => {
    const far = await post(ids.pdf, { kind: 'comment', body: 'Page four?', anchor: { kind: 'page', page: 4 } });
    expect([far.status, far.body.error, far.body.message]).toEqual([422, 'PAGE_OUT_OF_RANGE', 'This version has 3 pages.']);
    const noPages = await post(ids.txt, { kind: 'comment', body: 'Page one?', anchor: { kind: 'page', page: 1 } });
    expect([noPages.status, noPages.body.error]).toEqual([422, 'PAGES_UNKNOWN']);
    const noText = await post(ids.untexted, { kind: 'comment', body: 'Quote?', anchor: textAnchor() });
    expect([noText.status, noText.body.error]).toEqual([422, 'NO_TEXT']);
    const stale = await post(ids.txt, { kind: 'comment', body: 'Stale.', anchor: textAnchor({ textSha256: 'f'.repeat(64) }) });
    expect([stale.status, stale.body.error]).toEqual([409, 'TEXT_CHANGED']);
    const kind = await post(ids.txt, { kind: 'approve', body: 'x', anchor: { kind: 'document' } });
    expect([kind.status, kind.body.error]).toEqual([400, 'INVALID_KIND']);
    const empty = await post(ids.txt, { kind: 'comment', body: '   ', anchor: { kind: 'document' } });
    expect([empty.status, empty.body.error]).toEqual([400, 'BODY_REQUIRED']);
  });

  it('reads the text in character windows, and records each read', async () => {
    const one = await (await as(u.author)).get(`${base(mine)}/documents/${ids.txt}/text?from=9&length=1`);
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(one.body.data).toEqual(expect.objectContaining({ text: '𝛼', from: 9, length: 1, totalLength: Array.from(TEXT).length, textSha256: textSha }));
    const tooLong = await (await as(u.author)).get(`${base(mine)}/documents/${ids.txt}/text?length=200001`);
    expect([tooLong.status, tooLong.body.error]).toEqual([400, 'INVALID_WINDOW']);
    const none = await (await as(u.author)).get(`${base(mine)}/documents/${ids.untexted}/text`);
    expect([none.status, none.body.error]).toEqual([422, 'NO_TEXT']);
    expect((await history(ids.txt)).some((e) => e.startsWith('Extracted text read for annotation (characters 10–10'))).toBe(true);
  });
});

describe('the thread: replies, resolution and retraction (critique 15)', () => {
  it('a reply goes under its annotation; a reply to a reply is refused', async () => {
    const r = await act(ann.passage, 'replies', { body: 'Agreed: mg/kg.' }, u.reviewer);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    ann.reply = r.body.data.id;
    const nested = await act(ann.reply, 'replies', { body: 'Nested?' });
    expect([nested.status, nested.body.error]).toEqual([400, 'NOT_A_THREAD']);
    const out = await list(ids.txt);
    const root = out.body.data.annotations.find((x: { id: string }) => x.id === ann.passage);
    expect(root.replies).toEqual([expect.objectContaining({ id: ann.reply, body: 'Agreed: mg/kg.', authorName: 'Rex Reviewer', anchor: null })]);
    const { rows } = await h.state.owner.query(
      `SELECT new_values::jsonb AS v FROM audit_logs WHERE tenant_id = $1 AND action = 'vault.document.annotation.reply'`, [mine.orgId]);
    expect(rows.map((x) => x.v)).toContainEqual(expect.objectContaining({ annotationId: ann.reply, parentId: ann.passage }));
  });

  it('resolving needs a note, can name the version that addressed it, and happens once', async () => {
    const bare = await act(ann.passage, 'resolve', {}, u.reviewer);
    expect([bare.status, bare.body.error]).toEqual([422, 'RESOLUTION_NOTE_REQUIRED']);
    const foreign = await act(ann.passage, 'resolve', { note: 'Fixed in the next version.', addressedInVersionId: ids.elsewhere }, u.reviewer);
    expect([foreign.status, foreign.body.error]).toEqual([422, 'NOT_IN_FAMILY']);
    const done = await act(ann.passage, 'resolve', { note: 'Fixed in the next version.', addressedInVersionId: ids.txtV2 }, u.reviewer);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const again = await act(ann.passage, 'resolve', { note: 'Fixed in the next version.' }, u.reviewer);
    expect([again.status, again.body.error]).toEqual([409, 'ALREADY_RESOLVED']);
    const late = await act(ann.passage, 'replies', { body: 'One more thing.' });
    expect([late.status, late.body.error]).toEqual([409, 'ANNOTATION_RESOLVED']);
    const root = (await list(ids.txt)).body.data.annotations.find((x: { id: string }) => x.id === ann.passage);
    expect(root.status).toBe('resolved');
    expect(root.resolution).toEqual(expect.objectContaining({
      byId: u.reviewer, byName: 'Rex Reviewer', note: 'Fixed in the next version.', addressedIn: { versionId: ids.txtV2, versionLabel: '2.0' },
    }));
    expect((await history(ids.txt)).some((e) => e.startsWith('Annotation resolved: “State the dose per kg.”'))).toBe(true);
  });

  it('only the author retracts, with a reason; the words stay; a retracted one is not resolved, a resolved one not retracted', async () => {
    const created = await post(ids.txt, { kind: 'comment', body: 'Posted by mistake.', anchor: { kind: 'document' } });
    ann.toRetract = created.body.data.id;
    const notAuthor = await act(ann.toRetract, 'retract', { reason: 'Not mine to retract, but trying.' }, u.reviewer);
    expect([notAuthor.status, notAuthor.body.error]).toEqual([403, 'NOT_AUTHOR']);
    const noReason = await act(ann.toRetract, 'retract', {});
    expect([noReason.status, noReason.body.error]).toEqual([422, 'REASON_REQUIRED']);
    const done = await act(ann.toRetract, 'retract', { reason: 'Posted on the wrong document.' });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const resolveIt = await act(ann.toRetract, 'resolve', { note: 'Resolving a retracted one.' }, u.reviewer);
    expect([resolveIt.status, resolveIt.body.error]).toEqual([409, 'ANNOTATION_RETRACTED']);
    const retractResolved = await act(ann.reply, 'retract', { reason: 'Too late to retract this.' }, u.reviewer);
    expect([retractResolved.status, retractResolved.body.error]).toEqual([409, 'ANNOTATION_RESOLVED']);
    const row = (await list(ids.txt)).body.data.annotations.find((x: { id: string }) => x.id === ann.toRetract);
    expect(row).toEqual(expect.objectContaining({ status: 'retracted', body: 'Posted by mistake.' }));
    expect(row.retraction).toEqual(expect.objectContaining({ byId: u.author, reason: 'Posted on the wrong document.' }));
    expect(await history(ids.txt)).toContain('Annotation retracted: “Posted by mistake.”');
  });
});

describe('who may annotate (critique 15)', () => {
  it('a viewer is refused at the route and at the service', async () => {
    for (const r of [
      await post(ids.txt, { kind: 'comment', body: 'Viewer note.', anchor: { kind: 'document' } }, u.viewer, 'viewer'),
      await act(ann.whole, 'replies', { body: 'Viewer reply.' }, u.viewer, 'viewer'),
      await act(ann.whole, 'resolve', { note: 'Viewer resolving it.' }, u.viewer, 'viewer'),
      await act(ann.whole, 'retract', { reason: 'Viewer retracting it.' }, u.viewer, 'viewer'),
    ]) expect(r.status).toBe(403);
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const svc = await import('../../server/services/vault/vault-annotations');
    const actor = { programId: mine.programId, organizationId: mine.orgId, userId: u.viewer };
    const outs = await runWithTenantScope(
      { tenantId: String(mine.orgId), orgUuid: mine.orgUuid, role: 'viewer', source: 'request', caller: 'tests/db/vault-version-annotations.dbtest.ts' },
      async () => [
        await svc.postAnnotation({ ...actor, documentId: ids.txt, kind: 'comment', body: 'x', anchor: { kind: 'document' } }),
        await svc.replyToAnnotation({ ...actor, annotationId: ann.whole, body: 'x' }),
        await svc.resolveAnnotation({ ...actor, annotationId: ann.whole, note: 'Resolving as a viewer.' }),
        await svc.retractAnnotation({ ...actor, annotationId: ann.whole, reason: 'Retracting as a viewer.' }),
      ],
    );
    expect(outs.map((o) => (o.ok ? 'ok' : o.code))).toEqual(Array(4).fill('VAULT_WRITE_ROLE_REQUIRED'));
  });

  it("another organisation neither reads nor changes this organisation's annotations", async () => {
    const read = await (await as(u.other, 'admin', theirs)).get(`${base(mine)}/documents/${ids.txt}/annotations`);
    expect(read.status).toBe(404);
    const write = await (await as(u.other, 'admin', theirs)).post(`/api/c2c/project-vault/${theirs.programId}/annotations/${ann.whole}/resolve`)
      .send({ note: 'From another organisation.' });
    expect([write.status, write.body.error]).toEqual([404, 'ANNOTATION_NOT_FOUND']);
    const rls = await h.asRuntime('SELECT count(*)::int AS n FROM public.vault_version_annotations', [], theirs);
    expect(rls).toEqual({ ok: true, rows: [{ n: 0 }] });
  });
});

describe('a stale anchor says so (critique 15)', () => {
  it('when the text or the page count changes, the anchor reads not current and the quote stays', async () => {
    await h.state.owner.query(`UPDATE vault.documents SET extracted_text = extracted_text || ' amended' WHERE id = $1`, [ids.txt]);
    await h.state.owner.query('UPDATE vault.documents SET page_count = 2 WHERE id = $1', [ids.pdf]);
    const txt = (await list(ids.txt)).body.data.annotations.find((x: { id: string }) => x.id === ann.passage);
    expect(txt.anchorCurrent).toBe(false);
    expect(txt.anchor.quote).toBe(QUOTE);
    const pdf = (await list(ids.pdf)).body.data.annotations.find((x: { id: string }) => x.id === ann.page);
    expect(pdf.anchorCurrent).toBe(false);
    await h.state.owner.query('UPDATE vault.documents SET extracted_text = NULL WHERE id = $1', [ids.txt]);
    const gone = (await list(ids.txt)).body.data.annotations.find((x: { id: string }) => x.id === ann.passage);
    expect(gone.anchorCurrent).toBe(false);
  });
});
