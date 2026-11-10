/**
 * launch-demo/packs/lumen-qms.mjs — the Quality (QMS) records of the Lumen
 * demonstration, around the LMN-201 RePreve project.
 *
 * 2026-11-06: Quality showed eight draft SOPs and a change record, and every
 * other register said it was empty. Each function here writes through the
 * route the Quality register itself uses (client/src/concept2cure/quality:
 * qmsRecordData.ts, qmsCapaRegister.tsx, qmsWrites.ts, qmsReviewRoute.ts,
 * qmsApproval.ts), finds what an earlier run created by its number or exact
 * title before creating it, and fails the step with the server's answer when
 * the product refuses. Nothing is written to a table directly.
 *
 *   SOPs           LMN-SOP-201..203, text in the editing copy; approved when the
 *                  second signer is a QMS approver of this organisation
 *   Deviations     four at RePreve sites: closed, under investigation (past
 *                  target), open, pending approval
 *   Suppliers      CRO, central lab, CDMO, courier, IRT: approved, conditional, pending
 *   Nonconformances the shipment temperature excursion (awaiting disposition)
 *                  and two signed dispositions
 *   Internal audits the TMF/Vault audit with findings, one running, one late, one ahead
 *   CAPAs          raised from the deviation, the audit, the excursion and the
 *                  central lab, with actions, owners and due dates
 *   Change control LMN-CC-2026-021 linked to its SOP, deviation and CAPA
 *   Management reviews 2026-Q3 and Q2, with actions open and closed
 *   Training       people assigned to the Lumen SOPs in force
 *
 * Signed acts (closing a deviation, a disposition, a supplier's standing, an
 * approval) are the second signer's (ctx.signer, connectSigner); without one
 * they are recorded as not executed and everything else is seeded. A personal
 * training acknowledgement is never made for the reader (biotech-qms.mjs).
 * Content and its provenance are in lumen-qms-content.mjs: all synthetic.
 */
import { must, fillQmsSections } from '../lib.mjs';
import {
  AUDITS, CAPAS, CHANGE, DEVIATIONS, NONCONFORMANCES, PROVENANCE, REVIEWS, SOPS, SUPPLIERS, SUPPLIER_REASON, SYNTHETIC, T,
} from './lumen-qms-content.mjs';

const DAY = 86_400_000;
const day = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const rowsOf = (j) => (Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.rows) ? j.rows : []);
const NO_SIGNER = 'not executed — signer credential not supplied (OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD)';

/** A signed act by the second signer, through the platform's one signing ceremony (routes/governed-signed-act.ts). */
async function signed(ctx, method, path, fields, reason, what) {
  const { signer } = ctx;
  return must(await signer.api(method, path, { ...fields, password: signer.password, meaning: 'approval', reason }), [200, 201], what);
}

/** A signed step with no second signer: said in the manifest, not simulated. */
function unsigned(ctx, what) {
  ctx.run.note(`Lumen QMS: ${what}: ${NO_SIGNER}`);
  return NO_SIGNER;
}

/** A number already used by a record that is not this demo's is a refusal, never a reuse. */
function ours(row, field, want, what) {
  if (row && row[field] !== want) throw new Error(`${what} is already used by "${String(row[field]).slice(0, 120)}", which is not this demonstration's record. Nothing was written.`);
  return row;
}

/** Walk a record along `path` to `target`, one server move at a time; a move that does not land is a failure. */
async function walk(ctx, row, field, path, target, move, what) {
  for (let i = path.indexOf(row[field]); i >= 0 && i < path.indexOf(target); i = path.indexOf(row[field])) {
    const next = await move(path[i + 1], row);
    if (next === null) break; // a signed move with no signer, already noted
    if (next?.[field] !== path[i + 1]) throw new Error(`${what}: moved to ${path[i + 1]} but the server answered ${JSON.stringify(next?.[field])}`);
    row = next;
    ctx.tally.created(`${what.split(' ')[0]}-move`);
  }
  return row;
}

/* ───────────────────────── SOPs and training ───────────────────────── */

/** Send a draft for approval on a route naming the signer, then approve it as the signer (qmsReviewRoute.ts, qmsApproval.ts). */
async function settleSop(ctx, sop, doc) {
  const { api, signer, tally, run } = ctx;
  if (sop.target === 'draft' || doc.status === 'effective') return doc.status;
  if (!signer) return `${doc.status} — approval ${unsigned(ctx, `approval of ${sop.docNumber}`)}`;
  let status = doc.status;
  if (status === 'draft') {
    const listed = must(await api('GET', `/api/mdx/qms/documents/${doc.id}/route-candidates`), 200, `read who can approve ${sop.docNumber}`);
    const me = (listed.candidates ?? []).find((m) => String(m.id) === String(signer.userId));
    if (!me || me.approver) {
      const why = me?.approver?.message ?? `${signer.email} is not a member of this organisation`;
      run.note(`Lumen QMS: ${sop.docNumber} stays draft; it cannot be routed for approval: ${why}`);
      return `draft — ${why}`;
    }
    const sent = must(await api('PATCH', `/api/mdx/qms/documents/${doc.id}`, {
      status: 'in_review', reason: `Demo: send ${sop.docNumber} for approval`,
      route: { reviewers: [], approvers: [Number(signer.userId)], order: 'parallel', approvalDueDate: day(7) },
    }), 200, `send ${sop.docNumber} for approval`);
    status = sent.data?.status ?? 'in_review';
    tally.created('qms-status-change');
  }
  if (status !== 'in_review') return status;
  const j = must(await signer.api('POST', `/api/mdx/qms/documents/${doc.id}/approve`, {
    password: signer.password, meaning: 'APPROVED', effectiveDate: day(0),
    reason: `${sop.docNumber} reviewed and approved for use in the LMN-201 RePreve programme (demo seed, second signer).`,
  }), 200, `approve ${sop.docNumber}`);
  tally.created('qms-approval');
  return j.data?.status ?? 'effective';
}

async function ensureSops(ctx, program, rec, label) {
  const { api, run, tally } = ctx;
  const list = rowsOf(must(await api('GET', '/api/mdx/qms/documents'), 200, 'list QMS documents'));
  for (const sop of SOPS) {
    await run.step(`Quality: ${sop.docNumber} on ${label}`, async () => {
      let doc = ours(list.find((d) => d.doc_number === sop.docNumber) ?? null, 'title', T(sop.name), sop.docNumber);
      if (doc) tally.found('qms-document');
      else {
        doc = must(await api('POST', '/api/mdx/qms/documents', {
          docNumber: sop.docNumber, title: T(sop.name), docType: 'sop', category: 'clinical-operations', templateKey: 'sop',
          programId: program.id, nextReviewDate: day(365), reason: `Demo: create ${sop.docNumber} for the demonstration`,
        }), 201, `create ${sop.docNumber}`).data;
        tally.created('qms-document');
      }
      // The SOP's text goes into its editing copy (QMS_CONTENT_REQUIRED before review).
      if (doc.status === 'draft' && (await fillQmsSections(api, doc.id, sop.body)) > 0) tally.created('qms-document-text');
      const status = await settleSop(ctx, sop, doc);
      rec.sops[sop.key] = { id: doc.id, docNumber: sop.docNumber, title: T(sop.name), status };
      return `#${doc.id} ${status}`;
    });
  }
}

/** People assigned to train on the Lumen SOPs in force (mdx-qms-training.ts). The acknowledgement stays the reader's own. */
async function ensureTraining(ctx, rec) {
  const { api, run, tally, identity, signer } = ctx;
  await run.step('Quality: training assignments on the Lumen SOPs in force', async () => {
    const inForce = SOPS.filter((s) => rec.sops[s.key]?.status === 'effective');
    if (!inForce.length) {
      const note = 'No Lumen SOP is in force, so none can carry read-and-understood training (GET /api/mdx/qms/training/compliance lists documents in force only).';
      run.note(`Lumen QMS: ${note}`);
      rec.training = note;
      return note;
    }
    const people = [identity.userId, signer?.userId].filter(Boolean).map(Number);
    let added = 0;
    for (const s of inForce) {
      const { id } = rec.sops[s.key];
      const listing = must(await api('GET', `/api/mdx/qms/documents/${id}/training-assignments`), 200, `read who trains on ${s.docNumber}`).data ?? {};
      for (const userId of people) {
        if ((listing.assignments ?? []).some((a) => Number(a.userId) === userId)) { tally.found('training-assignment'); continue; }
        must(await api('POST', `/api/mdx/qms/documents/${id}/training-assignments`, { userId, reason: `Demo: ${s.docNumber} applies to this member's role` }), 201, `assign ${s.docNumber} training`);
        tally.created('training-assignment');
        added += 1;
      }
    }
    rec.training = { documents: inForce.map((s) => s.docNumber), people, acknowledgement: 'left to each reader (Acknowledge this revision)' };
    return `${added} assigned on ${inForce.length} SOPs; acknowledgement is each reader's own`;
  });
}

/* ───────────────────────── Deviations ───────────────────────── */

const DEV_PATH = ['open', 'under_investigation', 'pending_approval', 'closed'];

async function ensureDeviations(ctx, rec, label) {
  const { api, run, tally } = ctx;
  const list = rowsOf(must(await api('GET', '/api/mdx/qms/deviations'), 200, 'list deviations'));
  for (const d of DEVIATIONS) {
    await run.step(`Quality: deviation ${d.number} on ${label}`, async () => {
      let row = ours(list.find((r) => r.deviation_number === d.number) ?? null, 'title', T(d.title), d.number);
      if (row) tally.found('deviation');
      else {
        row = must(await api('POST', '/api/mdx/qms/deviations', {
          deviationNumber: d.number, title: T(d.title), description: d.description, deviationType: d.deviationType,
          classification: d.classification, category: d.category, detectedDate: day(d.detected), location: d.location,
          productName: d.productName, targetClosureDate: day(d.targetClose),
        }), 201, `record ${d.number}`).data;
        tally.created('deviation');
      }
      row = await walk(ctx, row, 'status', DEV_PATH, d.target, async (to, cur) => {
        if (to === 'closed') {
          if (!ctx.signer) { unsigned(ctx, `close of ${d.number}`); return null; }
          return (await signed(ctx, 'POST', `/api/mdx/qms/deviations/${cur.id}/close`, {},
            'Investigation, root cause and resolution reviewed and accepted (demo seed, second signer).', `close ${d.number}`)).data;
        }
        const body = to === 'under_investigation'
          ? { status: to, ...(d.impactLevel ? { impactLevel: d.impactLevel } : {}), ...(d.immediateActions ? { immediateActions: d.immediateActions } : {}) }
          : { status: to, rootCause: d.rootCause, resolutionDescription: d.resolution };
        return must(await api('PATCH', `/api/mdx/qms/deviations/${cur.id}`, body), 200, `move ${d.number} to ${to}`).data;
      }, `deviation ${d.number}`);
      rec.deviations[d.key] = { id: row.id, number: d.number, title: T(d.title), status: row.status };
      return `#${row.id} ${row.status}`;
    });
  }
}

/* ───────────────────────── Suppliers ───────────────────────── */

async function ensureSuppliers(ctx, rec) {
  const { api, run, tally } = ctx;
  const list = rowsOf(must(await api('GET', '/api/mdx/qms/suppliers'), 200, 'list suppliers'));
  for (const s of SUPPLIERS) {
    await run.step(`Quality: supplier ${s.code}`, async () => {
      let row = list.find((r) => r.supplier_name === T(s.name)) ?? null;
      if (row) tally.found('supplier');
      else {
        row = must(await api('POST', '/api/mdx/qms/suppliers', {
          supplierName: T(s.name), supplierCode: s.code, scope: s.scope, criticality: s.criticality, isoCertifications: s.iso,
          ...(s.lastAudit != null ? { lastAuditDate: day(s.lastAudit) } : {}), nextAuditDate: day(s.nextAudit),
        }), 201, `add supplier ${s.code}`).data;
        tally.created('supplier');
      }
      if (row.approval_status === 'pending' && s.standing !== 'pending') {
        if (!ctx.signer) unsigned(ctx, `${s.standing} standing of ${s.code}`);
        else {
          row = (await signed(ctx, 'POST', `/api/mdx/qms/suppliers/${row.id}/approval`,
            { approvalStatus: s.standing, reapprovalDate: day(s.reapproval) }, SUPPLIER_REASON[s.standing], `sign ${s.code} ${s.standing}`)).data;
          tally.created('supplier-standing');
        }
      }
      rec.suppliers[s.key] = { id: row.id, code: s.code, name: T(s.name), standing: row.approval_status };
      return `#${row.id} ${row.approval_status}`;
    });
  }
}

/* ───────────────────────── Nonconformances ───────────────────────── */

async function ensureNonconformances(ctx, program, rec, label) {
  const { api, run, tally } = ctx;
  const list = rowsOf(must(await api('GET', '/api/mdx/qms/nonconforming'), 200, 'list nonconformances'));
  for (const n of NONCONFORMANCES) {
    await run.step(`Quality: nonconformance ${n.number} on ${label}`, async () => {
      let row = ours(list.find((r) => r.nc_number === n.number) ?? null, 'description', T(n.description), n.number);
      if (row) tally.found('nonconformance');
      else {
        row = must(await api('POST', '/api/mdx/qms/nonconforming', {
          ncNumber: n.number, description: T(n.description), deviceName: n.product, lotOrSerial: n.lot, source: n.source, programId: program.id,
        }), 201, `record ${n.number}`).data;
        tally.created('nonconformance');
      }
      if (n.disposition && (!row.disposition || row.disposition === 'pending')) {
        if (!ctx.signer) unsigned(ctx, `disposition of ${n.number}`);
        else {
          row = (await signed(ctx, 'PATCH', `/api/mdx/qms/nonconforming/${row.id}/disposition`, { disposition: n.disposition }, n.rationale, `disposition ${n.number}`)).data;
          tally.created('nonconformance-disposition');
        }
      }
      rec.nonconformances[n.key] = { id: row.id, number: n.number, disposition: row.disposition ?? 'pending' };
      return `#${row.id} ${row.disposition ?? 'awaiting disposition'}`;
    });
  }
}

/* ───────────────────────── Internal audits ───────────────────────── */

async function ensureAudits(ctx, rec) {
  const { api, run, tally } = ctx;
  const list = rowsOf(must(await api('GET', '/api/mdx/qms/internal-audits'), 200, 'list internal audits'));
  for (const a of AUDITS) {
    await run.step(`Quality: internal audit ${a.number}`, async () => {
      let row = ours(list.find((r) => r.audit_number === a.number) ?? null, 'scope', T(a.scope), a.number);
      if (row) tally.found('internal-audit');
      else {
        row = must(await api('POST', '/api/mdx/qms/internal-audits', {
          auditNumber: a.number, scope: T(a.scope), auditStandard: a.standard, plannedDate: day(a.planned),
        }), 201, `plan ${a.number}`).data;
        tally.created('internal-audit');
      }
      if (row.status !== a.status && row.status === 'planned') {
        row = must(await api('PATCH', `/api/mdx/qms/internal-audits/${row.id}`, {
          status: a.status, startedAt: day(a.started), ...(a.completed != null ? { completedAt: day(a.completed) } : {}),
          majorFindings: a.major, minorFindings: a.minor, observations: a.obs,
        }), 200, `record ${a.number} as ${a.status}`).data;
        tally.created('internal-audit-update');
      }
      rec.audits[a.key] = { id: row.id, number: a.number, status: row.status };
      return `#${row.id} ${row.status}${row.status === 'planned' ? '' : ` (${row.major_findings ?? 0} major, ${row.minor_findings ?? 0} minor, ${row.observations ?? 0} obs.)`}`;
    });
  }
}

/* ───────────────────────── CAPAs ───────────────────────── */

const CAPA_PATH = ['open', 'investigation', 'action_planned', 'action_implemented', 'effectiveness_check', 'closed_effective'];
const ACTION_PATH = ['planned', 'in_progress', 'done'];
const CAPA_REASON = {
  investigation: 'Demo: problem statement agreed; root-cause analysis started.',
  action_planned: 'Demo: root cause recorded; corrective and preventive actions planned.',
  action_implemented: 'Demo: every action is done, with its evidence.',
  effectiveness_check: 'Demo: effectiveness check against the agreed criterion.',
  closed_effective: 'Demo: effectiveness verified; CAPA closed.',
};

/** The record a CAPA was raised from, as Raise CAPA records it (capaSources.ts CAPA_SOURCE_KIND). */
function sourceRef(from, rec) {
  const at = {
    deviation: () => ({ kind: 'qc_deviation', r: rec.deviations[from.key], label: (r) => r.number }),
    audit: () => ({ kind: 'qms_internal_audit', r: rec.audits[from.key], label: (r) => r.number }),
    nonconformance: () => ({ kind: 'qms_nonconforming_product', r: rec.nonconformances[from.key], label: (r) => r.number }),
    supplier: () => ({ kind: 'qms_supplier', r: rec.suppliers[from.key], label: (r) => r.code }),
  }[from.register]();
  if (!at.r?.id) throw new Error(`the ${from.register} "${from.key}" a CAPA is raised from was not seeded`);
  return { kind: at.kind, id: String(at.r.id), label: at.label(at.r) };
}

async function ensureCapaActions(ctx, capa, c) {
  const { api, tally } = ctx;
  const have = must(await api('GET', `/api/capa-mdr/capa/${capa.id}`), 200, `read ${capa.capaCode}`).actions ?? [];
  for (const a of c.actions) {
    let act = have.find((x) => x.description === a.description) ?? null;
    if (act) tally.found('capa-action');
    else {
      act = must(await api('POST', `/api/capa-mdr/capa/${capa.id}/actions`, {
        type: a.type, description: a.description, owner: a.owner, dueDate: day(a.due),
      }), 201, `add an action to ${capa.capaCode}`);
      tally.created('capa-action');
    }
    await walk(ctx, act, 'state', ACTION_PATH, a.state, async (to) => must(await api('POST', `/api/capa-mdr/capa/actions/${act.id}/transition`, {
      to, reason: to === 'done' ? 'Demo: action complete, evidence attached.' : 'Demo: action started.',
      ...(to === 'done' && a.evidence ? { evidenceRefs: [{ kind: 'reference', label: a.evidence }] } : {}),
    }), 200, `move action ${act.n} of ${capa.capaCode} to ${to}`), `capa-action ${capa.capaCode}/${act.n}`);
  }
}

async function ensureCapas(ctx, program, rec, label) {
  const { api, run, tally } = ctx;
  const list = rowsOf(must(await api('GET', `/api/capa-mdr/capa?program_id=${encodeURIComponent(program.id)}`), 200, 'list CAPAs'));
  for (const c of CAPAS) {
    await run.step(`Quality: CAPA "${c.title}" on ${label}`, async () => {
      let row = list.find((r) => r.title === T(c.title)) ?? null;
      if (row) tally.found('capa');
      else {
        row = must(await api('POST', '/api/capa-mdr/capa', {
          programId: program.id, title: T(c.title), summary: SYNTHETIC, type: c.type, source: c.source, riskLevel: c.riskLevel,
          assignedTo: c.assignedTo, targetCloseDate: day(c.targetClose), problemStatement: c.problem, sourceRefs: [sourceRef(c.from, rec)],
        }), 201, `raise CAPA "${c.title}"`);
        tally.created('capa');
      }
      const move = async (to, cur) => must(await api('POST', `/api/capa-mdr/capa/${cur.id}/transition`, {
        to, reason: CAPA_REASON[to],
        ...(to === 'closed_effective' ? { effectivenessCheckResult: { outcome: 'effective', narrative: c.effectiveness } } : {}),
      }), 200, `move ${cur.capaCode} to ${to}`);
      // Actions are planned once the root cause is known, and done before the CAPA is implemented.
      const planned = CAPA_PATH[Math.min(CAPA_PATH.indexOf(c.target), CAPA_PATH.indexOf('action_planned'))];
      row = await walk(ctx, row, 'state', CAPA_PATH, planned, move, `capa ${row.capaCode}`);
      await ensureCapaActions(ctx, row, c);
      row = await walk(ctx, row, 'state', CAPA_PATH, c.target, move, `capa ${row.capaCode}`);
      rec.capas[c.key] = { id: row.id, code: row.capaCode, title: T(c.title), state: row.state };
      return `${row.capaCode} ${row.state}, ${c.actions.length} actions`;
    });
  }
}

/* ───────────────────────── Change control ───────────────────────── */

const CHANGE_PATH = ['proposed', 'under_assessment', 'approved', 'in_implementation'];

/**
 * The approver signs the content they read. The register returns each change's content_digest and the signed route
 * requires it back as expectedContentDigest (change-approval-signature.ts, since c284f3cb4): an approval that names
 * none is refused, and one that names an edited change is refused. So the signer reads the register first, as the
 * approval dialog does (quality/qmsApproval.ts).
 */
export async function approveChangeAsRead(signer, change, number) {
  const register = rowsOf(must(await signer.api('GET', '/api/mdx/qms/changes'), 200, `read ${number} as its approver`));
  const digest = register.find((c) => c.id === change.id)?.content_digest;
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`${number}: the register gave its approver no content digest to sign. Nothing was signed.`);
  }
  return must(await signer.api('POST', `/api/mdx/qms/changes/${change.id}/approve`, {
    password: signer.password, meaning: 'APPROVED', expectedContentDigest: digest,
    reason: 'Impact assessed; change approved for implementation (demo seed, second signer).',
  }), [200, 201], `approve ${number}`).data;
}

async function ensureChange(ctx, program, rec, label) {
  const { api, run, tally } = ctx;
  await run.step(`Quality: change control ${CHANGE.changeNumber} on ${label}`, async () => {
    const sop = rec.sops.deviation;
    const list = rowsOf(must(await api('GET', '/api/mdx/qms/changes'), 200, 'list changes'));
    let ch = ours(list.find((c) => c.change_number === CHANGE.changeNumber) ?? null, 'title', T(CHANGE.title), CHANGE.changeNumber);
    if (ch) tally.found('qms-change');
    else {
      const { targetInDays, title, ...fields } = CHANGE;
      ch = must(await api('POST', '/api/mdx/qms/changes', {
        ...fields, title: T(title), targetImplementationDate: day(targetInDays), qmsDocumentId: sop.id, programId: program.id, metadata: PROVENANCE,
      }), 201, `create ${CHANGE.changeNumber}`).data;
      tally.created('qms-change');
    }
    const links = rowsOf(must(await api('GET', `/api/mdx/qms/changes/${ch.id}/links`), 200, 'list change links'));
    const dev = rec.deviations.visit;
    const capa = rec.capas.visit;
    const wanted = [
      { linkType: 'sop', linkedRef: sop.docNumber, linkedLabel: sop.title, linkedId: sop.id, relationship: 'references', note: 'The procedure this change revises.' },
      { linkType: 'deviation', linkedRef: dev.number, linkedLabel: dev.title, relationship: 'triggered_by', note: 'The deviation that raised the change.' },
      { linkType: 'capa', linkedRef: capa.code, linkedLabel: capa.title, relationship: 'addresses', note: 'The CAPA action this change implements.' },
    ];
    for (const w of wanted) {
      if (links.some((l) => (l.linked_ref ?? l.linkedRef) === w.linkedRef)) { tally.found('qms-change-link'); continue; }
      must(await api('POST', `/api/mdx/qms/changes/${ch.id}/links`, w), 201, `link ${CHANGE.changeNumber} to ${w.linkedRef}`);
      tally.created('qms-change-link');
    }
    ch = await walk(ctx, ch, 'status', CHANGE_PATH, 'in_implementation', async (to, cur) => {
      if (to !== 'approved') {
        return must(await api('POST', `/api/mdx/qms/changes/${cur.id}/transition`, { to, reason: `Demo: move ${CHANGE.changeNumber} to ${to.replace('_', ' ')}` }), 200, `move ${CHANGE.changeNumber} to ${to}`).data;
      }
      if (!ctx.signer) { unsigned(ctx, `approval of ${CHANGE.changeNumber}`); return null; }
      return approveChangeAsRead(ctx.signer, cur, CHANGE.changeNumber);
    }, `qms-change ${CHANGE.changeNumber}`);
    rec.change = { id: ch.id, changeNumber: CHANGE.changeNumber, status: ch.status, links: wanted.map((w) => w.linkedRef) };
    return `#${ch.id} ${ch.status}, linked to ${wanted.map((w) => w.linkedRef).join(', ')}`;
  });
}

/* ───────────────────────── Management reviews ───────────────────────── */

async function ensureReviews(ctx, rec) {
  const { api, run, tally } = ctx;
  const list = rowsOf(must(await api('GET', '/api/mdx/qms/management-reviews'), 200, 'list management reviews'));
  for (const r of REVIEWS) {
    await run.step(`Quality: management review ${r.period}`, async () => {
      let row = list.find((x) => x.period === r.period && x.inputs?.demoPack === PROVENANCE.demoPack) ?? null;
      if (row) tally.found('management-review');
      else {
        row = must(await api('POST', '/api/mdx/qms/management-reviews', {
          reviewDate: day(r.held), period: r.period, inputs: { summary: T(r.summary), ...PROVENANCE }, outputs: { decisions: r.decisions },
        }), 201, `record the ${r.period} review`).data;
        tally.created('management-review');
      }
      for (const a of r.actions) {
        let action = (row.outputs?.actions ?? []).find((x) => x.description === a.description);
        if (action) tally.found('review-action');
        else {
          row = must(await api('POST', `/api/mdx/qms/management-reviews/${row.id}/actions`, { description: a.description, owner: a.owner, dueDate: day(a.due) }), 201, `add an action to ${r.period}`).data;
          action = row.outputs.actions.at(-1);
          tally.created('review-action');
        }
        if (a.closeNote && action.state === 'open') {
          row = must(await api('POST', `/api/mdx/qms/management-reviews/${row.id}/actions/${action.n}/close`, { closureNote: a.closeNote }), 200, `close action ${action.n} of ${r.period}`).data;
          tally.created('review-action-close');
        }
      }
      const acts = row.outputs?.actions ?? [];
      rec.reviews[r.key] = { id: row.id, period: r.period, open: acts.filter((x) => x.state === 'open').length, closed: acts.filter((x) => x.state === 'closed').length };
      return `#${row.id}, ${rec.reviews[r.key].open} open and ${rec.reviews[r.key].closed} closed actions`;
    });
  }
}

/* ───────────────────────── Entry ───────────────────────── */

/**
 * ctx: { api, run, tally, identity, signer? }; programs: { lmn201: { id }, … }.
 * Only LMN-201 is needed: CAPAs, nonconformances, SOPs and the change belong to it.
 */
export async function ensureLumenQms(ctx, programs, label = 'LMN-201') {
  const program = programs?.lmn201;
  if (!program?.id) throw new Error('The Lumen Quality records need the LMN-201 project (programs.lmn201.id). Nothing was written.');
  const rec = { sops: {}, deviations: {}, suppliers: {}, nonconformances: {}, audits: {}, capas: {}, change: null, reviews: {}, training: null };
  ctx.run.record('lumenQms', rec);
  await ensureSops(ctx, program, rec, label);
  await ensureDeviations(ctx, rec, label);
  await ensureSuppliers(ctx, rec);
  await ensureNonconformances(ctx, program, rec, label);
  await ensureAudits(ctx, rec);
  await ensureCapas(ctx, program, rec, label);
  await ensureChange(ctx, program, rec, label);
  await ensureReviews(ctx, rec);
  await ensureTraining(ctx, rec);
  return rec;
}
