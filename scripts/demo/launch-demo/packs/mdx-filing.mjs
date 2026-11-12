/**
 * packs/mdx-filing.mjs — the device pack writes into the project's filing, and its leaf probe leaves nothing behind.
 * Split out of mdx.mjs (RULE 6: a file split out of a large one goes inside the folder it came from).
 *
 * GA-DEMO-10 (docs/evidence/GA-READINESS/2026-11-10/ledger.json). The pack authored the 510(k) Summary, the
 * Substantial Equivalence Discussion and the Cybersecurity Summary as working documents of the project. None was
 * the filing's editing copy, so the filing (the project's eSTAR outline, 38 sections) held no text and the seeded
 * NeuroPanel-Dx export answered 422 NO_AUTHORED_CONTENT. A document is the filing's editing copy only when its
 * create names the filing (server/services/authoring/authoring-documents.ts resolveBinding), and a section's text
 * reaches the filing when it is saved with a reason (PATCH /api/authoring/sections/:id). The pack now does both,
 * as the editor's filing list does (client/src/concept2cure/v2/editor/FilingMarkets.tsx). It writes no new text:
 * each filing section is filled from what the pack already authors (mdx-content.mjs AUTHORING).
 *
 * GA-DEMO-12. The pack asks the leaf route whether it takes an eSTAR section code by placing a leaf. Since the
 * route began to answer 200 the leaf stayed, a seventh and a second copy of the device description. The probe's
 * leaf is removed again, and one an earlier run left is removed too.
 */
import { must } from '../lib.mjs';
import { AUTHORING } from './mdx-content.mjs';
import { rowsOf } from './mdx-shared.mjs';

const section = (doc, code) => AUTHORING[doc].sections.find((s) => s.code === code).content;
const whole = (doc) => AUTHORING[doc].sections.map((s) => `<h3>${s.title}</h3>${s.content}`).join('');

/** The filing's own section keys (its outline), each filled from text the pack already authors. */
export const FILING_TEXT = [
  { key: 'A5', content: () => whole('summary') }, // 510(k) summary or 510(k) statement
  { key: 'B1', content: () => section('summary', '4') }, // Device description and principles of operation
  { key: 'B2', content: () => section('summary', '5') }, // Indications for use statement
  { key: 'B3', content: () => section('summary', '2') }, // Classification, product code and regulation
  { key: 'C1', content: () => section('summary', '3') }, // Predicate and reference devices
  { key: 'C2', content: () => whole('se') }, // Substantial equivalence discussion and comparison table
  { key: 'E3', content: () => whole('cyber') }, // Cybersecurity
  { key: 'E5', content: () => section('summary', '7') }, // Bench performance testing
  { key: 'E7', content: () => section('summary', '8') }, // Clinical performance testing
];
const REASON = 'Demo: write the dossier text into the 510(k) filing';

/** The filing's editing copy: found by its binding, or created naming the filing. */
async function ensureEditingCopy({ api }, programId, filing) {
  const docs = must(await api('GET', '/api/authoring/docs'), 200, 'list authoring docs').documents ?? [];
  const found = docs.find((d) => d.c2c_document_id === filing.id);
  if (found) return { copy: found, created: false };
  const r = must(await api('POST', '/api/authoring/docs', {
    title: filing.title, module: null, client_program_id: programId, c2c_document_id: filing.id,
  }), [200, 201], "create the filing's editing copy");
  if (!r.governance?.bound) throw new Error(`the document was created but not bound to the filing: ${JSON.stringify(r.governance ?? null)}`);
  return { copy: r.document, created: true };
}

/** One section into the filing: created in the copy if it is not there, then saved with a reason, which files it. */
async function fileSection({ api }, copy, have, slot, text) {
  const content = text.content();
  const s = have.get(text.key)
    ?? must(await api('POST', '/api/authoring/sections', { doc_id: copy.id, code: text.key, title: slot.label, content }), [200, 201], `create section ${text.key}`).section;
  const saved = must(await api('PATCH', `/api/authoring/sections/${s.id}`, { content, changeReason: REASON }), 200, `save section ${text.key} into the filing`);
  if (!saved.filing?.committed) throw new Error(`section ${text.key} was saved but the filing did not take it: ${JSON.stringify(saved.filing ?? null)}`);
}

/** The project's 510(k) filing holds the dossier's text, so its content package can be exported. */
export async function seedFiling({ api, run }, programId) {
  const filings = must(await api('GET', `/api/c2c/documents?projectId=${encodeURIComponent(programId)}`), 200, "list the project's filing documents").documents ?? [];
  const filing = filings.find((d) => (d.doc_type ?? d.docType) === 'k510');
  if (!filing) throw new Error('the 510(k) project has no filing document to write into');
  const outline = must(await api('GET', `/api/c2c/documents/${filing.id}/outline`), 200, 'read the filing outline').outline ?? [];
  const slots = new Map(outline.map((o) => [o.key, o]));
  const missing = FILING_TEXT.filter((t) => !slots.has(t.key)).map((t) => t.key);
  if (missing.length) throw new Error(`the filing's outline has no section ${missing.join(', ')}`);
  const todo = FILING_TEXT.filter((t) => !slots.get(t.key).has_content);
  if (!todo.length) {
    run.record('filing', { id: filing.id, sectionsFiled: FILING_TEXT.length, writtenThisRun: 0 });
    return `${filing.id}: ${FILING_TEXT.length} sections already filed`;
  }
  const { copy, created } = await ensureEditingCopy({ api }, programId, filing);
  const have = new Map((must(await api('GET', `/api/authoring/docs/${copy.id}/sections`), 200, "read the copy's sections").sections ?? []).map((s) => [s.code, s]));
  for (const text of todo) await fileSection({ api }, copy, have, slots.get(text.key), text);
  run.record('filing', { id: filing.id, editingCopy: copy.id, editingCopyCreated: created, sectionsFiled: FILING_TEXT.length, writtenThisRun: todo.length, keys: FILING_TEXT.map((t) => t.key) });
  return `${filing.id}: ${todo.length} sections filed through ${copy.id} (${created ? 'created' : 'existing'}), ${FILING_TEXT.length - todo.length} already filed`;
}

/** The probe is a question put to the route, not a placement: its leaf, or one an earlier run left, is removed. */
export async function removeProbeLeaf({ api }, sequenceId, estarCode) {
  const leaves = rowsOf(await api('GET', `/api/submissions/sequences/${sequenceId}/leaves`));
  const strays = leaves.filter((l) => (l.sectionCode ?? l.section_code) === estarCode);
  for (const l of strays) {
    must(await api('DELETE', `/api/submissions/sequences/${sequenceId}/leaves/${l.id}`, {
      reason: 'Demo: the eSTAR section-code probe asks the route a question; it is not a placement',
    }), [200, 204], 'remove the probe leaf');
  }
  return strays.length;
}
