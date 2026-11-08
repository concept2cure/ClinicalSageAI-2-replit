#!/usr/bin/env node
/**
 * Real AnA -> existing Authoring editor verification.
 * This is a privileged operator-only acceptance probe, not a CSR module.
 *
 * Generation and accept are deliberately TWO commands. Generation never
 * writes to Authoring; accepting requires an exact, human-inspected text file,
 * one saved draft id, one SHA-256, and a reason for the governed change.
 *
 * Dependencies: the EXISTING /api/authoring/sections/:id/ai/draft,
 * /ai/draft/accept, and GET /api/authoring/docs/:id/sections.
 * No fixture mode, auth bypass, privilege grant, review decision or signature.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/i;
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const fail = reason => { throw new Error(reason); };
const arg = (args, name) => { const n = args.indexOf('--' + name); return n < 0 ? null : args[n + 1]; };
const has = (args, name) => args.includes('--' + name);
function uuid(id, name) {
  if (!UUID.test(String(id ?? ''))) fail('An exact existing ' + name + ' UUID is required.');
  return String(id).toLowerCase();
}
async function checked(api, method, path, body, status = 200) {
  const r = await api(method, path, body);
  if (r.status !== status || !r.json) {
    fail(method + ' ' + path + ': HTTP ' + r.status + ' ' + String(r.text ?? '').slice(0, 350));
  }
  return r.json;
}
export function checkAnADraft(result) {
  const d = result?.draft;
  if (result?.success !== true || result?.source !== 'model' || !d ||
      typeof d.content !== 'string' || d.content.trim().length < 80 ||
      !UUID.test(String(d.draftId ?? '')) || typeof d.metadata?.model !== 'string' ||
      !d.metadata.model.trim() || /demo.?mode/i.test(d.metadata.model) ||
      d.metadata?.retrievalStatus !== 'ok' || !(d.metadata.sourcesRetrieved > 0) ||
      d.turnRecord?.status !== 'recorded') {
    fail('AnA did not produce an attributable real-model draft from readable project Data Room evidence, with a saved candidate and turn record.');
  }
  return { draftId: d.draftId, content: d.content, sha256: sha(d.content),
    model: d.metadata.model, provider: d.metadata.provider ?? null,
    sourceCount: d.metadata.sourcesRetrieved, turnRecordId: d.turnRecord.id ?? null };
}
export function checkAnAAccept(receipt, reopened, docId, sectionId, content) {
  if (receipt?.success !== true || receipt.section?.id !== sectionId ||
      receipt.section?.doc_id !== docId || receipt.section?.content !== content) {
    fail('AnA accept did not return the exact saved document, section and human-accepted text.');
  }
  if (reopened?.success !== true || reopened.readScope !== 'document' ||
      !Array.isArray(reopened.sections)) {
    fail('The authoring editor could not reread the saved section.');
  }
  const matches = reopened.sections.filter(s => s.id === sectionId);
  if (matches.length !== 1 || matches[0].doc_id !== docId || matches[0].content !== content) {
    fail('The saved AnA draft did not reopen identically in the existing editor.');
  }
  return { saved: true, documentId: docId, sectionId, contentSha256: sha(content),
    attributedSourceSpans: receipt.attribution?.sourceSpans ?? null,
    filing: receipt.filing ?? { bound: 'not_established' } };
}
async function qualify({ api, args, projectId, documentId, sectionId, outputDir }) {
  const params = '?programId=' + encodeURIComponent(projectId);
  const detail = await checked(api, 'GET', '/api/authoring/docs/' + documentId + params);
  if (detail.success !== true || detail.document?.id !== documentId ||
      detail.document.client_program_id !== projectId ||
      String(detail.document.status).toUpperCase() !== 'DRAFT' ||
      detail.document.readScope !== 'document' || detail.access?.edit?.allowed !== true) {
    fail('This actor does not have editable DRAFT access to the exact project CSR document.');
  }
  const sections = await checked(api, 'GET', '/api/authoring/docs/' + documentId + '/sections' + params);
  const current = (sections.sections ?? []).filter(s => s.id === sectionId);
  if (sections.success !== true || sections.readScope !== 'document' ||
      current.length !== 1 || current[0].doc_id !== documentId) {
    fail('The requested section is not open in the current project document.');
  }
  const studyData = await checked(api, 'GET',
    '/api/submission-orchestrator/csr/study-data' + params + '&documentId=' + documentId);
  const frozen = studyData?.studyData;
  if (!Array.isArray(frozen) || !frozen.some(s => s.sources?.length &&
      s.sources.every(x => x.sourceApproval === 'canonical-lifecycle' && SHA.test(String(x.sha256 ?? ''))))) {
    fail('The document has no verified frozen, platform-approved clinical source. Finish the Data Room freeze first.');
  }
  if (has(args, 'generate')) {
    const body = await checked(api, 'POST', '/api/authoring/sections/' + sectionId + '/ai/draft', {
      tone: 'professional',
      context: 'Clinical Study Report ICH E3 medical writing. Work only from this document and its recorded project evidence. Explain gaps rather than inventing study statistics or conclusions.',
      requirements: 'Draft the selected ICH E3 heading. Preserve exact endpoint definitions, comparators, populations, denominators and dates. Keep evidence attribution for human medical writing and biostatistics review.',
    });
    const candidate = checkAnADraft(body);
    mkdirSync(outputDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(outputDir, 'ana-draft-for-human-review.txt'), candidate.content, { mode: 0o600 });
    const { content, ...summary } = candidate;
    const receipt = { verdict: 'DRAFT_GENERATED_HUMAN_ACCEPTANCE_REQUIRED',
      ...summary, programId: projectId, documentId, sectionId, savedInEditor: false,
      browserQualification: 'NOT_EXECUTED' };
    writeFileSync(join(outputDir, 'ana-draft-receipt.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
    return receipt;
  }
  const draftId = uuid(arg(args, 'draft-id'), 'draft candidate');
  const acceptedPath = arg(args, 'approved-text-file');
  const expectedSha256 = arg(args, 'expected-sha256');
  const changeReason = arg(args, 'change-reason');
  if (!acceptedPath || !SHA.test(String(expectedSha256 ?? '')) ||
      typeof changeReason !== 'string' || changeReason.trim().length < 12) {
    fail('Accept needs --draft-id, --approved-text-file, --expected-sha256, and a reason of at least 12 characters.');
  }
  const content = readFileSync(resolve(acceptedPath), 'utf8');
  if (sha(content) !== expectedSha256) fail('The human-inspected approved file changed since its SHA-256 was recorded.');
  if (typeof current[0].content === 'string' && current[0].content.trim().length > 0 &&
      !has(args, 'replace-existing-content')) {
    fail('This section already has content. Use the regular editor, or explicitly pass --replace-existing-content.');
  }
  const receipt = await checked(api, 'POST', '/api/authoring/sections/' + sectionId + '/ai/draft/accept', {
    draftId, content, changeReason,
  });
  const reread = await checked(api, 'GET', '/api/authoring/docs/' + documentId + '/sections' + params);
  const saved = checkAnAAccept(receipt, reread, documentId, sectionId, content);
  return { verdict: 'ANA_EDITOR_DRAFT_SAVED_HUMAN_SCIENTIFIC_REVIEW_REQUIRED',
    ...saved, browserQualification: 'NOT_EXECUTED' };
}
export async function main(args = process.argv.slice(2)) {
  if (has(args, 'generate') === has(args, 'accept')) fail('Choose exactly one of --generate or --accept.');
  if (!process.env.DEMO_SEED_TOKEN) fail('A real authorized DEMO_SEED_TOKEN is required.');
  const projectId = uuid(arg(args, 'program-id'), 'program');
  const documentId = uuid(arg(args, 'document-id'), 'document');
  const sectionId = uuid(arg(args, 'section-id'), 'section');
  const organizationId = arg(args, 'organization-id');
  if (!/^[1-9]\d*$/.test(String(organizationId ?? ''))) fail('An exact numeric organization id is required.');
  const baseUrl = arg(args, 'base-url') || process.env.DEMO_BASE_URL;
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) fail('An actual deployment base URL is required.');
  const { connect } = await import('./lib.mjs');
  const link = await connect({ baseUrl, token: process.env.DEMO_SEED_TOKEN, expectedOrganizationId: organizationId });
  const expectedName = arg(args, 'organization-name');
  if (!expectedName || expectedName.trim() !== link.identity.organizationName.trim()) {
    fail('The organization name does not match the signed-in tenant.');
  }
  const outputDir = resolve(arg(args, 'output-dir') || '/tmp/concept2cure-ana-editor-acceptance');
  let verdict;
  try { verdict = await qualify({ api: link.api, args, projectId, documentId, sectionId, outputDir }); }
  catch (cause) {
    verdict = { verdict: 'NOT_QUALIFIED', failedStage: has(args, 'generate') ? 'AnA generation' : 'governed editor acceptance',
      reason: cause instanceof Error ? cause.message : String(cause),
      programId: projectId, documentId, sectionId, browserQualification: 'NOT_EXECUTED' };
    process.exitCode = 1;
  }
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(outputDir, 'ana-editor-acceptance.json'), JSON.stringify(verdict, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(verdict, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
}
