/**
 * OQ-002 step OQ-VAULT-22: review annotations on a Vault version (plan
 * critique 15). Run by ./run.mjs after the filing and compare steps.
 * Kept in its own module so the runner stays within the file-length limit.
 * The refusals a second identity is needed for (only the author retracts)
 * and the record's own guards are in tests/db/vault-version-annotations*.dbtest.ts.
 */
import { createHash } from 'node:crypto';
import { ingestPdf, ingestText } from '../../lib/fixtures.mjs';

const TEXT = 'Section 4. The dosing table states 5 mg once daily.';
const QUOTE = 'the dosing table';

/** Post one annotation on a version; the response. */
const annotate = (api, programId, docId, body) =>
  api('POST', `/api/c2c/project-vault/${programId}/documents/${docId}/annotations`, body);
const act = (api, programId, id, what, body) =>
  api('POST', `/api/c2c/project-vault/${programId}/annotations/${id}/${what}`, body);

async function pageAnchors(api, expect, programId, pdf) {
  const ok = await annotate(api, programId, pdf.document.id, { kind: 'comment', body: 'Page 1 reads well.', anchor: { kind: 'page', page: 1 } });
  expect(ok.status === 201, `page 1: expected 201, got ${ok.status}`, ok.json);
  const far = await annotate(api, programId, pdf.document.id, { kind: 'comment', body: 'Page 2?', anchor: { kind: 'page', page: 2 } });
  expect(far.status === 422 && far.json?.error === 'PAGE_OUT_OF_RANGE', `page 2: expected 422 PAGE_OUT_OF_RANGE, got ${far.status}`, far.json);
}

async function passageThread(api, expect, programId, txt) {
  const read = await api('GET', `/api/c2c/project-vault/${programId}/documents/${txt.document.id}/text`);
  expect(read.status === 200 && read.json?.data?.text === TEXT, `text read: expected 200 with the text, got ${read.status}`, read.json);
  const textSha256 = read.json.data.textSha256;
  expect(textSha256 === createHash('sha256').update(TEXT, 'utf8').digest('hex'), 'the text read names another SHA-256', read.json.data);
  const charStart = Array.from(TEXT.slice(0, TEXT.indexOf(QUOTE))).length;
  const posted = await annotate(api, programId, txt.document.id, {
    kind: 'request_changes', body: 'Give the dose per kilogram.', anchor: { kind: 'text', quote: QUOTE, charStart, textSha256 },
  });
  expect(posted.status === 201, `passage: expected 201, got ${posted.status}`, posted.json);
  const id = posted.json.data.id;
  const reply = await act(api, programId, id, 'replies', { body: 'Agreed.' });
  expect(reply.status === 201, `reply: expected 201, got ${reply.status}`, reply.json);
  const bare = await act(api, programId, id, 'resolve', {});
  expect(bare.status === 422, `resolve without a note: expected 422, got ${bare.status}`, bare.json);
  const done = await act(api, programId, id, 'resolve', { note: 'Dose per kilogram added in the next version.' });
  expect(done.status === 200, `resolve: expected 200, got ${done.status}`, done.json);
  return id;
}

async function retraction(api, expect, programId, txt) {
  const posted = await annotate(api, programId, txt.document.id, { kind: 'comment', body: 'Posted on the wrong document.', anchor: { kind: 'document' } });
  expect(posted.status === 201, `comment: expected 201, got ${posted.status}`, posted.json);
  const bare = await act(api, programId, posted.json.data.id, 'retract', {});
  expect(bare.status === 422, `retract without a reason: expected 422, got ${bare.status}`, bare.json);
  const done = await act(api, programId, posted.json.data.id, 'retract', { reason: 'Posted on the wrong document by mistake.' });
  expect(done.status === 200, `retract: expected 200, got ${done.status}`, done.json);
}

async function annotationStep({ step, state, stamp }) {
  await step(
    {
      id: 'OQ-VAULT-22',
      urs: ['URS-VAULT-021'],
      title: 'A version is annotated on a page and on a passage; a thread is replied to and resolved with a note; one is retracted with a reason; each act is in the history',
      action:
        'Ingest a one-page PDF and a text file. Post a page-1 comment, then a page-2 one. Read the text file\'s text; post a change request on a passage of it; ' +
        'reply; resolve without a note, then with one. Post a comment; retract it without a reason, then with one. Read the annotations and the text file\'s history.',
      expected:
        '201 for page 1, 422 PAGE_OUT_OF_RANGE for page 2; 200 for the text read; 201 for the passage and the reply; 422 then 200 to resolve; 422 then 200 to retract. ' +
        'The list shows the passage resolved with its reply and the comment retracted; the history carries "Extracted text read…", "Change request posted on a passage…", ' +
        '"Reply to…", "Annotation resolved…" and "Annotation retracted…", and says nothing is cut.',
      dependsOn: ['OQ-VAULT-00'],
    },
    async ({ api, expect }) => {
      const programId = state.programId;
      const pdf = await ingestPdf(api, expect, { programId, title: `OQ-002 annotated report ${stamp}` });
      const txt = await ingestText(api, expect, { programId, title: `OQ-002 annotated notes ${stamp}`, text: TEXT });
      await pageAnchors(api, expect, programId, pdf);
      const resolved = await passageThread(api, expect, programId, txt);
      await retraction(api, expect, programId, txt);
      const list = await api('GET', `/api/c2c/project-vault/${programId}/documents/${txt.document.id}/annotations`);
      const roots = list.json?.data?.annotations ?? [];
      const thread = roots.find((a) => a.id === resolved);
      expect(thread?.status === 'resolved' && thread.replies.length === 1, 'the passage thread is not listed as resolved with its reply', roots);
      expect(roots.some((a) => a.status === 'retracted'), 'the retracted comment is not listed as retracted', roots);
      const h = await api('GET', `/api/c2c/project-vault/${programId}/documents/${txt.document.id}/history`);
      const events = (h.json?.data?.entries ?? []).map((e) => e.event);
      const wanted = ['Extracted text read for annotation', 'Change request posted on a passage', 'Reply to', 'Annotation resolved', 'Annotation retracted'];
      const missing = wanted.filter((w) => !events.some((e) => e.startsWith(w)));
      expect(missing.length === 0 && h.json?.data?.truncated === false, `the history is missing ${missing.join(', ')}`, events.slice(0, 10));
      return `page and passage annotations posted; the passage thread resolved; a comment retracted; ${wanted.length} acts in the history`;
    },
  );
}

/** @param {{ step: Function, state: Record<string, any>, stamp: string }} run */
export async function runAnnotationSteps(run) {
  await annotationStep(run);
}
