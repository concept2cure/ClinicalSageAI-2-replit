/**
 * launch-demo/packs/biotech-qms.mjs — QMS controlled documents for the biotech
 * demo: four SOPs (two approved by the second signer's electronic signature,
 * one routed for review, one draft), a change-control record linked to
 * SOP-002, and a training acknowledgement on SOP-001. A deviation register is
 * not a QMS API capability; that is recorded as a finding, not simulated.
 */
import { must } from '../lib.mjs';
import { CHANGE, PROVENANCE, SOPS, T, findDemoByTitle, inDays, today } from './biotech-content.mjs';
import { NOT_EXECUTED_NO_SIGNER, asArray } from './biotech-shared.mjs';

async function approveAsSigner({ signer, tally }, sop, doc, d) {
  const j = must(await signer.api('POST', `/api/mdx/qms/documents/${doc.id}/approve`, {
    password: signer.password,
    meaning: 'APPROVED',
    reason: `${sop.name} reviewed against the quality manual and approved for use (demo seed, second signer).`,
    effectiveDate: today(),
  }), 200, `approve ${sop.docNumber}`);
  if (j.data?.status !== 'effective' || String(j.data?.approver_id) !== String(signer.session.user.id)) {
    throw new Error(`approve ${sop.docNumber}: not effective by the signer — ${JSON.stringify(j.data).slice(0, 200)}`);
  }
  d.status = j.data.status;
  d.approval = { approverId: j.data.approver_id, approvedAt: j.data.approved_at, signature: j.meta?.signature ?? null, auditTrail: j.meta?.auditTrail ?? null };
  tally.created('qms-approval');
}

/** Move the document to the state the story wants: effective (signed), in_review, or left draft. */
async function settleStatus(ctx, sop, doc, d) {
  const { api, run, tally, signer } = ctx;
  if (sop.target === 'effective') {
    if (doc.status !== 'draft') {
      tally.found('qms-approval');
      d.approval = { approverId: doc.approver_id, approvedAt: doc.approved_at };
    } else if (!signer) {
      d.approval = NOT_EXECUTED_NO_SIGNER;
      run.note(`QMS approval of ${sop.docNumber}: ${NOT_EXECUTED_NO_SIGNER}`);
    } else await approveAsSigner(ctx, sop, doc, d);
  } else if (sop.target === 'in_review') {
    if (doc.status !== 'draft') tally.found('qms-status-change');
    else {
      const p = must(await api('PATCH', `/api/mdx/qms/documents/${doc.id}`, { status: 'in_review' }), 200, `route ${sop.docNumber} for review`);
      d.status = p.data?.status ?? 'in_review';
      tally.created('qms-status-change');
    }
  }
}

async function ensureSop(ctx, list, sop, rec) {
  const { api, tally } = ctx;
  let doc = findDemoByTitle(list, sop.name);
  let created = false;
  if (doc) tally.found('qms-document');
  else {
    doc = must(await api('POST', '/api/mdx/qms/documents', {
      docNumber: sop.docNumber,
      title: T(sop.name),
      docType: 'sop',
      category: 'quality-system',
      templateKey: 'sop',
      nextReviewDate: inDays(365),
      metadata: { demo: 'biotech', provenance: PROVENANCE, body: sop.body },
    }), 201, `create ${sop.docNumber}`).data;
    tally.created('qms-document');
    created = true;
  }
  const d = { key: sop.key, id: doc.id, docNumber: doc.doc_number, title: doc.title, version: doc.version, status: doc.status, created, target: sop.target };
  await settleStatus(ctx, sop, doc, d);
  rec.documents.push(d);
  return `${created ? 'created' : 'found'} #${doc.id} ${doc.doc_number} → ${d.status}`;
}

async function ensureChange({ api, tally }, rec) {
  const changes = asArray(must(await api('GET', '/api/mdx/qms/changes'), 200, 'list changes'), 'data');
  let ch = changes.find((c) => (c.change_number ?? c.changeNumber) === CHANGE.changeNumber) || null;
  const sop2 = rec.documents.find((d) => d.key === 'sop-002');
  if (ch) tally.found('qms-change');
  else {
    const r = must(await api('POST', '/api/mdx/qms/changes', { ...CHANGE, title: T(CHANGE.title), targetImplementationDate: inDays(45), qmsDocumentId: sop2?.id ?? null }), 201, 'create change');
    ch = r.data ?? r;
    tally.created('qms-change');
  }
  const links = asArray(must(await api('GET', `/api/mdx/qms/changes/${ch.id}/links`), 200, 'list change links'), 'data', 'links');
  if (links.some((l) => (l.linked_ref ?? l.linkedRef) === 'C2C-SOP-002')) tally.found('qms-change-link');
  else {
    must(await api('POST', `/api/mdx/qms/changes/${ch.id}/links`, { linkType: 'sop', linkedRef: 'C2C-SOP-002', linkedLabel: T('SOP-002 Change Control'), linkedId: sop2?.id ?? null, relationship: 'references' }), [200, 201], 'link change to SOP-002');
    tally.created('qms-change-link');
  }
  rec.change = { id: ch.id, changeNumber: ch.change_number ?? ch.changeNumber, status: ch.status, classification: ch.classification };
  return `#${ch.id} ${rec.change.changeNumber} (${ch.status})`;
}

function recordNoDeviation({ run }, rec) {
  run.note('QMS deviation not created: /api/mdx/qms exposes documents, changes (with a "deviation" link TYPE by reference), nonconforming products, suppliers, internal audits, management reviews and training — there is no deviation entity to write (server/routes/mdx-qms.ts). SOP-003 Deviation Management describes the process; the register itself is not a launch QMS capability.');
  rec.deviation = 'not supported by the QMS API — see notes';
  return 'not supported by the QMS API (recorded as a finding)';
}

async function ensureTrainingAck({ api, tally }, rec) {
  const sop1 = rec.documents.find((d) => d.key === 'sop-001');
  if (!sop1 || sop1.status !== 'effective') return `skipped — SOP-001 is ${sop1?.status ?? 'missing'}, not effective`;
  const t = asArray(must(await api('GET', '/api/mdx/qms/training'), 200, 'list training'), 'data');
  const have = t.find((x) => String(x.document_id ?? x.qms_document_id) === String(sop1.id));
  if (have) {
    tally.found('qms-training-ack');
    return `found acknowledgement for v${have.document_version}`;
  }
  const r = must(await api('POST', `/api/mdx/qms/documents/${sop1.id}/training-ack`, { method: 'attestation' }), 201, 'training ack');
  tally.created('qms-training-ack');
  rec.trainingAck = { documentId: sop1.id, version: r.data?.document_version };
  return `acknowledged v${r.data?.document_version}`;
}

export async function ensureQms(ctx) {
  const { api, run } = ctx;
  const rec = { documents: [] };
  run.record('qms', rec);
  const list = asArray(must(await api('GET', '/api/mdx/qms/documents'), 200, 'list QMS documents'), 'data');
  for (const sop of SOPS) await run.step(`QMS: ${sop.name}`, () => ensureSop(ctx, list, sop, rec));
  await run.step('QMS: change-control record C2C-CC-001', () => ensureChange(ctx, rec));
  await run.step('QMS: deviation record', async () => recordNoDeviation(ctx, rec));
  await run.step('QMS: training acknowledgement on SOP-001 (attestation)', () => ensureTrainingAck(ctx, rec));
  return rec;
}
