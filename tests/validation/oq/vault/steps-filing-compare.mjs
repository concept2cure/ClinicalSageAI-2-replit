/**
 * OQ-002 steps OQ-VAULT-15 to OQ-VAULT-18: filing from the data room (VR-11a),
 * confirming suggestions together (VR-11b), comparing two versions and the
 * library search (plan critique 15). Run by ./run.mjs after OQ-VAULT-14, in this order.
 * Kept in their own module so the runner stays within the file-length limit.
 */
import { ingestPdf, makePdfBuffer } from '../../lib/fixtures.mjs';

/** Capture a PDF into the program's data room through chat upload; the source id. */
async function captureIntoRoom(api, expect, state, stamp) {
  const form = new FormData();
  form.append('file', new Blob([makePdfBuffer(`OQ-002 data room capture ${stamp}`)], { type: 'application/pdf' }), `oq-002-data-room-${stamp}.pdf`);
  form.append('projectId', state.programId);
  const cap = await api('POST', '/api/chat/upload', form);
  const recorded = cap.status === 200 && Number.isInteger(cap.json?.sourceId) && cap.json?.dataRoom?.recorded === true;
  expect(recorded, `capture: expected 200 with a data-room source, got ${cap.status}`, cap.json);
  return cap.json.sourceId;
}

function expectFirstFiling(expect, res) {
  const [filed, missing] = res.json?.items ?? [];
  expect(res.status === 200 && res.json.complete === false, `filing: expected 200 complete:false, got ${res.status}`, res.json);
  const placed = filed?.outcome === 'filed' && ['suggested', 'unfiled'].includes(filed.placementStatus);
  expect(placed, 'the captured source was not filed as suggested or unfiled', filed);
  expect(missing?.outcome === 'refused' && missing.code === 'NOT_FOUND', 'an unknown source was not refused NOT_FOUND', missing);
  return filed;
}

function expectRepeatFiling(expect, res, documentId) {
  const repeat = res.json?.items?.[0];
  const same = res.status === 200 && res.json.complete === true && repeat?.outcome === 'already_filed' && repeat.documentId === documentId;
  expect(same, 'filing it again did not answer already_filed with the same document', res.json);
}

async function fileFromRoomStep({ step, state, stamp }) {
  await step(
    {
      id: 'OQ-VAULT-15',
      urs: ['URS-VAULT-014'],
      title: 'A file captured in the project\'s data room is filed into the Vault from the room, with a result for every source',
      action:
        'POST /api/chat/upload {file, projectId} (a capture into the program\'s data room); POST /api/c2c/project-vault/:id/data-room/file {sourceIds:[that source, 999999999]}; ' +
        'POST it again with the captured source alone; GET /api/c2c/project-vault/:id',
      expected:
        'The capture answers a sourceId with dataRoom.recorded. The filing answers 200 complete:false with [filed (a new document, suggested or unfiled, never confirmed), refused NOT_FOUND]. ' +
        'The second filing answers complete:true, already_filed with the same document. The data room shows the source as filed, as version 1.0.',
      dependsOn: ['OQ-VAULT-00'],
    },
    async ({ api, expect }) => {
      const sourceId = await captureIntoRoom(api, expect, state, stamp);
      const path = `/api/c2c/project-vault/${state.programId}/data-room/file`;
      const filed = expectFirstFiling(expect, await api('POST', path, { sourceIds: [sourceId, 999999999] }));
      expectRepeatFiling(expect, await api('POST', path, { sourceIds: [sourceId] }), filed.documentId);
      const room = await api('GET', `/api/c2c/project-vault/${state.programId}`);
      const row = (room.json?.data?.dataRoom?.sources ?? []).find((r) => r.id === sourceId);
      expect(row?.stage === 'filed' && row?.filedAs?.version === '1.0', 'the data room does not show the source filed as 1.0', row);
      return `source ${sourceId} filed as document ${filed.documentId} (${filed.placementStatus}); unknown source refused NOT_FOUND; second filing already_filed; room shows "filed as 1.0"`;
    },
  );
}

/** Two ingests the classifier suggests into one folder; that folder. */
async function twoSuggested(api, expect, state, stamp) {
  const a = await ingestPdf(api, expect, { programId: state.programId, title: `OQ-002 Confirm set A ${stamp}` });
  const b = await ingestPdf(api, expect, { programId: state.programId, title: `OQ-002 Confirm set B ${stamp}` });
  const folderId = a.filing?.folderId;
  const together = a.filing?.placementStatus === 'suggested' && b.filing?.placementStatus === 'suggested' && folderId && b.filing.folderId === folderId;
  expect(together, 'the two ingests were not suggested into the same folder', [a.filing, b.filing]);
  return { folderId, documentIds: [a.document.id, b.document.id] };
}

const everyItem = (res, pred) => Array.isArray(res.json?.items) && res.json.items.every(pred);

async function confirmTogetherStep({ step, state, stamp }) {
  await step(
    {
      id: 'OQ-VAULT-16',
      urs: ['URS-VAULT-015'],
      title: 'Suggested filings in one folder are confirmed together with one reason, each answered; a second confirmation is refused',
      action:
        'Ingest two PDFs (each suggested a folder by the classifier); GET /api/c2c/project-vault/:id; POST /api/c2c/project-vault/:id/file-batch {folderId, documentIds} without a note, then with a note; ' +
        'POST the same again; GET /api/c2c/project-vault/:id',
      expected:
        'Both ingests answer placementStatus "suggested" in the same folder, and awaitingConfirmationCount counts them. Without a note: 422 REASON_REQUIRED. With one: 200 complete:true, both confirmed. ' +
        'The repeat: 200 complete:false, both refused CONFLICT. awaitingConfirmationCount is two lower than before.',
      dependsOn: ['OQ-VAULT-00'],
    },
    async ({ api, expect }) => {
      const { folderId, documentIds } = await twoSuggested(api, expect, state, stamp);
      const read = async () => (await api('GET', `/api/c2c/project-vault/${state.programId}`)).json?.data?.awaitingConfirmationCount;
      const waiting = await read();
      expect(Number.isInteger(waiting) && waiting >= 2, `awaitingConfirmationCount: expected at least 2, got ${waiting}`);
      const path = `/api/c2c/project-vault/${state.programId}/file-batch`;
      const bare = await api('POST', path, { folderId, documentIds });
      expect(bare.status === 422 && bare.json?.error === 'REASON_REQUIRED', `without a note: expected 422 REASON_REQUIRED, got ${bare.status}`, bare.json);
      const note = 'OQ-002 step 16: confirmed for validation';
      const done = await api('POST', path, { folderId, documentIds, note });
      expect(done.status === 200 && done.json.complete === true && everyItem(done, (i) => i.outcome === 'confirmed'),
        'the two suggestions were not both confirmed', done.json);
      const again = await api('POST', path, { folderId, documentIds, note });
      expect(again.status === 200 && again.json.complete === false && everyItem(again, (i) => i.code === 'CONFLICT'),
        'a second confirmation was not refused CONFLICT for each document', again.json);
      const after = await read();
      expect(after === waiting - 2, `awaitingConfirmationCount: expected ${waiting - 2}, got ${after}`);
      return `2 suggested in ${folderId} (awaiting ${waiting}); no note → 422; confirmed both; repeat → CONFLICT ×2; awaiting ${after}`;
    },
  );
}

/** A text comparison that shows a change, or one withheld with a reason naming a version. */
function textIsHonest(text) {
  return text.available ? (text.counts.added + text.counts.removed) > 0 : /No text was read from v[12]\.0/.test(text.reason);
}

async function compareVersionsStep({ step, state, stamp }) {
  await step(
    {
      id: 'OQ-VAULT-17',
      urs: ['URS-VAULT-016'],
      title: 'Two versions of a document are compared: bytes, recorded details and text; another document is refused',
      action:
        'GET /api/c2c/project-vault/:id/documents/<v2.0>/compare?against=<v1.0> (the OQ-VAULT-11 family); ingest an unrelated PDF; ' +
        'GET …/documents/<v2.0>/compare?against=<that document>',
      expected:
        'The first answers 200 with from v1.0 and to v2.0, sameBytes false (the recorded SHA-256s differ), and either a text comparison with at least one ' +
        'changed line or, when a version has no extracted text, no text comparison and a reason naming that version. The second answers 422 NOT_SAME_DOCUMENT.',
      dependsOn: ['OQ-VAULT-11'],
    },
    async ({ api, expect, attach }) => {
      const base = `/api/c2c/project-vault/${state.programId}/documents/${state.v2.id}/compare`;
      const r = await api('GET', `${base}?against=${state.doc.id}`);
      expect(r.status === 200, `compare: expected 200, got ${r.status}`, r.json);
      const d = r.json.data;
      attach('compare.json', d);
      expect(d.from.version === '1.0' && d.to.version === '2.0', 'the comparison does not run from v1.0 to v2.0', [d.from, d.to]);
      expect(d.sameBytes === false, 'two different files were reported as the same bytes', d);
      expect(textIsHonest(d.text), 'the text comparison neither shows a change nor says which version has no text', d.text);
      const unrelated = await ingestPdf(api, expect, { programId: state.programId, title: `OQ-002 Unrelated ${stamp}` });
      const wrong = await api('GET', `${base}?against=${unrelated.document.id}`);
      expect(wrong.status === 422 && wrong.json?.error === 'NOT_SAME_DOCUMENT', `another document: expected 422 NOT_SAME_DOCUMENT, got ${wrong.status}`, wrong.json);
      return d.text.available
        ? `v1.0 → v2.0: ${d.text.counts.added} added, ${d.text.counts.removed} removed; another document refused`
        : `v1.0 → v2.0: different bytes; ${d.text.reason}; another document refused`;
    },
  );
}

async function librarySearchStep({ step, state, stamp }) {
  await step(
    {
      id: 'OQ-VAULT-18',
      urs: ['URS-VAULT-017'],
      title: 'The library search finds a document in another project of the organisation, named with its project',
      action:
        'Create a second program; ingest a PDF into it with a unique word in its title; GET /api/c2c/project-vault/search?q=<that word>; ' +
        'GET /api/c2c/project-vault/<first program>/search?q=<that word>; GET /api/c2c/project-vault/search?q=',
      expected:
        'The library search answers 200 with the document, named with the second program. The first program\'s search does not list it. ' +
        'The empty query answers no results with reason EMPTY_QUERY.',
      dependsOn: ['OQ-VAULT-00'],
    },
    async ({ api, expect }) => {
      const word = `oqlibrary${stamp.replace(/\W+/g, '').toLowerCase()}`;
      const p = await api('POST', '/api/c2c/projects', { name: `OQ-002 Library program ${stamp}`, programType: 'ind', primaryAgency: 'FDA', indication: 'Validation exercise', priority: 'medium' });
      expect(p.status === 201, `second program: expected 201, got ${p.status}`, p.json);
      const other = p.json.data;
      const doc = await ingestPdf(api, expect, { programId: other.id, title: `OQ-002 ${word} report` });
      const lib = await api('GET', `/api/c2c/project-vault/search?q=${word}`);
      const found = (lib.json?.data?.results ?? []).find((h) => h.id === doc.document.id);
      expect(lib.status === 200 && found?.program?.id === other.id, 'the library search did not find the document in its project', lib.json);
      const own = await api('GET', `/api/c2c/project-vault/${state.programId}/search?q=${word}`);
      expect(own.status === 200 && !(own.json?.data?.results ?? []).some((h) => h.id === doc.document.id), 'the first program\'s search listed another program\'s document', own.json);
      const empty = await api('GET', '/api/c2c/project-vault/search?q=');
      expect(empty.status === 200 && empty.json?.data?.reason === 'EMPTY_QUERY', 'an empty library query was not answered EMPTY_QUERY', empty.json);
      return `found ${doc.document.id} in ${found.program.name}; not in the first program's search; empty query → EMPTY_QUERY`;
    },
  );
}

/** @param {{ step: Function, state: Record<string, any>, stamp: string }} run */
export async function runFilingAndCompareSteps(run) {
  await fileFromRoomStep(run);
  await confirmTogetherStep(run);
  await compareVersionsStep(run);
  await librarySearchStep(run);
}
