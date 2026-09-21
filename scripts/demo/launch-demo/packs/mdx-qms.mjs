/**
 * packs/mdx-qms.mjs — QMS controlled documents for the MDX pack: four SOPs,
 * two approved by the second signer as electronic signatures (password +
 * meaning APPROVED + reason + effective date, server/routes/mdx-qms.ts), one in
 * review, one draft, a training acknowledgement and a change-control record.
 * Called from mdx.mjs; nothing here runs on its own.
 */
import { must } from '../lib.mjs';
import { PROVENANCE, MANUFACTURER, today, inDays, SOPS } from './mdx-content.mjs';
import { PACK, T, SIGNER_ABSENT, CHANGE_NUMBER, finding } from './mdx-shared.mjs';

// ─── 6. QMS ──────────────────────────────────────────────────────────────────

export const qmsDocs = async (api) => must(await api('GET', '/api/mdx/qms/documents'), 200, 'list QMS documents').data ?? [];

async function ensureSop({ api, run }, sop) {
  let doc = (await qmsDocs(api)).find((d) => d.doc_number === sop.docNumber) || null;
  const created = !doc;
  if (!doc) {
    doc = must(await api('POST', '/api/mdx/qms/documents', {
      docNumber: sop.docNumber, title: T(sop.name), docType: 'sop', category: sop.category, nextReviewDate: inDays(365), sections: sop.sections,
      metadata: { provenance: PROVENANCE, manufacturer: MANUFACTURER, family: 'sop', demoPack: PACK },
    }), 201, `create ${sop.docNumber}`).data;
  }
  const rec = { id: doc.id, docNumber: doc.doc_number, title: doc.title, status: doc.status, version: doc.version, created };
  run.record(`qms.${sop.key}`, rec);
  return rec;
}

async function approveSop({ api, run }, key, doc, signer) {
  const current = (await qmsDocs(api)).find((d) => d.id === doc.id) || {};
  if (current.status === 'effective') {
    run.record(`qms.${key}`, { ...doc, status: 'effective', approverId: current.approver_id, approvedAt: current.approved_at, effectiveDate: current.effective_date });
    return `already effective (approver ${current.approver_id})`;
  }
  if (!signer) {
    run.record(`qms.${key}.approval`, { executed: false, note: SIGNER_ABSENT });
    run.note(`QMS approval of ${doc.docNumber}: ${SIGNER_ABSENT}`);
    return SIGNER_ABSENT;
  }
  const body = must(await signer.api('POST', `/api/mdx/qms/documents/${doc.id}/approve`, {
    password: signer.password, meaning: 'APPROVED', effectiveDate: today(),
    reason: `${doc.docNumber} reviewed against 21 CFR 820 and ISO 13485; approved for release as v${doc.version} effective ${today()}.`,
  }), 200, `approve ${doc.docNumber}`);
  const d = body.data || {};
  if (d.status !== 'effective') throw new Error(`approval did not make ${doc.docNumber} effective: ${d.status}`);
  const meta = body.meta || {};
  run.record(`qms.${key}`, { ...doc, status: d.status, approverId: d.approver_id, approvedAt: d.approved_at, effectiveDate: d.effective_date });
  run.record(`qms.${key}.approval`, { executed: true, signature: meta.signature, auditTrail: meta.auditTrail, contentDigest: d.metadata?.approval?.contentDigest });
  return `effective; signature ${meta.signature?.id} (${meta.signature?.meaning}) by ${signer.email}`;
}

async function ensureChangeControl({ api, run }, sops, vaultDocs) {
  let change = (must(await api('GET', '/api/mdx/qms/changes'), 200, 'list changes').data ?? []).find((c) => c.change_number === CHANGE_NUMBER) || null;
  const created = !change;
  if (!change) {
    change = must(await api('POST', '/api/mdx/qms/changes', {
      changeNumber: CHANGE_NUMBER,
      title: T('NP-100 software v2.3.0 — parechovirus channel mapping and thermal profile'),
      description: 'Release of NP-100 Analyzer software v2.3.0 introducing the redesigned human-parechovirus assay channel mapping and the updated 68-minute thermal profile used in the analytical and clinical studies.',
      changeType: 'computer_system', classification: 'major', riskLevel: 'medium',
      reason: 'Design output change after design freeze; affects result calling (IEC 62304 class C item) and therefore requires impact analysis under SOP-104.',
      impactAssessment: 'Risk file: hazards H-031 (false negative parechovirus) and H-044 (thermal drift) re-evaluated; residual risk unchanged. Threat model: no new interface. SBOM: unchanged. Regulatory: change included in the original 510(k); no separate submission decision required. Verification: full regression (1,912 unit tests) and 240-run system validation.',
      implementationPlan: 'Release candidate built from tag v2.3.0; verification evidence attached to the DHF; deployment to study analyzers under controlled update; production release gated on Quality and Regulatory approval.',
      targetImplementationDate: inDays(30), qmsDocumentId: sops.sop104.id, metadata: { provenance: PROVENANCE, demoPack: PACK },
    }), 201, 'create change').data;
  }
  const links = must(await api('GET', `/api/mdx/qms/changes/${change.id}/links`), 200, 'list links').data ?? [];
  const wanted = [
    { linkType: 'sop', linkedRef: sops.sop104.docNumber, linkedLabel: sops.sop104.title, linkedId: sops.sop104.id, relationship: 'references', note: 'Governing procedure for software change control.' },
    { linkType: 'risk', linkedRef: vaultDocs.risk.id, linkedLabel: vaultDocs.risk.title, relationship: 'impacts', note: 'Risk file hazards re-evaluated for this change.' },
    { linkType: 'document', linkedRef: vaultDocs.software.id, linkedLabel: vaultDocs.software.title, relationship: 'references', note: 'Software description revised for v2.3.0.' },
  ];
  let linked = 0;
  for (const w of wanted) {
    if (links.some((l) => l.linked_ref === w.linkedRef)) continue;
    must(await api('POST', `/api/mdx/qms/changes/${change.id}/links`, w), 201, `link ${w.linkType}`);
    linked += 1;
  }
  if (change.status === 'proposed') change = must(await api('POST', `/api/mdx/qms/changes/${change.id}/transition`, { to: 'under_assessment' }), 200, 'transition change').data ?? change;
  const listed = (must(await api('GET', '/api/mdx/qms/changes'), 200, 'list changes').data ?? []).find((c) => c.id === change.id) || {};
  if (!Array.isArray(listed.links) && links.length + linked > 0) {
    finding(run, `QMS: GET /api/mdx/qms/changes returns rows without their cross-references (no "links" field) while GET /api/mdx/qms/changes/:id carries ${links.length + linked}; the Change control log (client/src/concept2cure/quality/ChangeControl.tsx linkCount = c.links?.length ?? 0) therefore shows 0 links for ${CHANGE_NUMBER} until the row is expanded.`);
  }
  run.record('qms.change', { id: change.id, changeNumber: CHANGE_NUMBER, status: change.status, classification: change.classification, created, links: links.length + linked });
  return `${change.id} ${CHANGE_NUMBER} ${change.status} (${created ? 'created' : 'existing'}, ${links.length + linked} links)`;
}

export async function seedQms(ctx, signer, vaultDocs, identity) {
  const { api, run } = ctx;
  const sops = {};
  for (const sop of SOPS) {
    await run.step(`QMS: ${sop.name}`, async () => {
      sops[sop.key] = await ensureSop(ctx, sop);
      return `${sops[sop.key].id} ${sop.docNumber} ${sops[sop.key].status} v${sops[sop.key].version} (${sops[sop.key].created ? 'created' : 'existing'})`;
    });
  }
  for (const key of ['sop101', 'sop102']) {
    await run.step(`QMS: approve ${sops[key].docNumber} as the second signer (e-signature)`, () => approveSop(ctx, key, sops[key], signer));
  }
  await run.step('QMS: SOP-103 into review; SOP-104 stays draft', async () => {
    const rows = await qmsDocs(api);
    const statusOf = (id) => (rows.find((d) => d.id === id) || {}).status;
    if (statusOf(sops.sop103.id) === 'draft') {
      must(await api('PATCH', `/api/mdx/qms/documents/${sops.sop103.id}`, { status: 'in_review' }), 200, 'SOP-103 → in_review');
      sops.sop103.status = 'in_review';
    } else sops.sop103.status = statusOf(sops.sop103.id);
    sops.sop104.status = statusOf(sops.sop104.id);
    run.record('qms.sop103', sops.sop103);
    run.record('qms.sop104', sops.sop104);
    return `SOP-103 ${sops.sop103.status}; SOP-104 ${sops.sop104.status}`;
  });
  await run.step('QMS: training acknowledgement of SOP-101 by the seed identity', async () => {
    const mine = (must(await api('GET', '/api/mdx/qms/training'), 200, 'list training').data ?? [])
      .find((x) => Number(x.document_id) === Number(sops.sop101.id) && String(x.user_id) === String(identity.userId));
    if (mine) {
      run.record('qms.training', { existing: true, id: mine.id, documentVersion: mine.document_version });
      return `already acknowledged (record ${mine.id})`;
    }
    const r = must(await api('POST', `/api/mdx/qms/documents/${sops.sop101.id}/training-ack`, { method: 'attestation' }), 201, 'training-ack');
    run.record('qms.training', { existing: false, id: r.data?.id, documentVersion: r.data?.document_version });
    return `record ${r.data?.id} for v${r.data?.document_version}`;
  });
  await run.step('QMS: change-control record for the NP-100 software release', async () => {
    const s = await ensureChangeControl(ctx, sops, vaultDocs);
    finding(run, 'QMS: the launch QMS API has no CAPA create route — CAPA records are read-only through GET /api/mdx/postmarket (capa_records) and can only be referenced from a change-control link (linkType "capa"). No CAPA record was seeded.');
    return s;
  });
  return sops;
}
