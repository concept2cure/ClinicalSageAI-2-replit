/**
 * OQ-008 steps OQ-CMC-37 … OQ-CMC-40: attribution, history, programme
 * membership, and the stability close-out.
 *
 * Split out of steps-registers.mjs on 2026-10-19 when that module passed the
 * 500-line cap: these four steps are one subject — what the register layer
 * RECORDS about an act and who may ask for one — while the steps that remain
 * there are about a register's signed state and the Q1E verdict.
 *
 * The runner finds its step modules by their `from './*.mjs'` imports
 * (ci:validation-traceability), so this module is imported by run.mjs and
 * chains its marker after steps-registers.mjs, which is the order the steps
 * must run in: OQ-CMC-37 edits records OQ-CMC-03 created.
 */
import { step, state, stamp } from './context.mjs';
import { dataOf, errDetail, signatureRowsFor } from './signed-acts.mjs';
import { REGISTER_STEPS } from './steps-registers.mjs';

/**
 * The §11.10(e) edit half (OQ-CMC-37) and the reading of it (OQ-CMC-38).
 *
 * URS-CMC-021 put the operator on every register CREATE. Every register EDIT
 * was a bare `db.update` with no audit row until 2026-10-18 — 223 register
 * rows on the development deployment carried an edit and none of those edits
 * was on the chain — and once the rows existed, no working route returned them
 * against the record they were about
 * (docs/evidence/CMC-M3-GA/2026-10-18/08-register-edit-audit/,
 * .../09-register-record-history/).
 */

/** The three registers these two steps move, one way each. */
const EDITED_REGISTERS = [
  {
    noun: 'analytical method',
    path: 'analytical-methods',
    ordinary: (s) => ({
      methodCode: `OQE-${s}`, title: 'OQ edit probe', purpose: 'Assay', analyte: 'API',
      matrix: 'Drug substance', technique: 'HPLC', status: 'development',
    }),
    /* Two fields at once: a diff that reports only the last one written, or
       only the field name without its values, passes a one-field check. */
    edit: { title: 'OQ edit probe (rev 2)', purpose: 'Assay and related substances' },
    moved: { title: ['OQ edit probe', 'OQ edit probe (rev 2)'], purpose: ['Assay', 'Assay and related substances'] },
  },
  {
    noun: 'stability study',
    path: 'stability-studies',
    ordinary: (s) => ({
      productName: `OQE-${s}`, batchNumber: 'B-1', dosageForm: 'tablet', scope: 'DP', climaticZone: 'II',
      studyType: 'long_term', storageConditions: ['25C/60%RH'], duration: 24, testParameters: ['assay'],
      timePoints: ['0', '12'], status: 'ACTIVE', startDate: '2026-01-01T00:00:00.000Z',
    }),
    edit: { status: 'PAUSED' },
    moved: { status: ['ACTIVE', 'PAUSED'] },
  },
  {
    /* uuid-keyed, and its write path is raw SQL rather than Drizzle — the two
       doors are separate implementations, so one of them passing says nothing
       about the other. */
    noun: 'comparability assessment',
    path: 'comparability-studies',
    ordinary: () => ({ title: 'OQ edit probe comparability', type: 'process', product: 'Scale' }),
    edit: { outcome: 'Comparable on every attribute against the pre-change criteria.' },
    moved: { justification: [null, 'Comparable on every attribute against the pre-change criteria.'] },
  },
];

const historyOf = async (api, register, id) => {
  const r = await api('GET', `/api/cmc/register-history/${register}/${id}`);
  const data = dataOf(r);
  return { status: r.status, entries: Array.isArray(data.entries) ? data.entries : [], note: data.note ?? null, json: r.json };
};

/**
 * Both values of every field the edit moved — the half of §11.10(e) an
 * inspector reads for a changed record. Compared as text, because the register
 * decides the stored type and this step is asking what the trail SAYS.
 */
function expectMovedFields(expect, r, recorded) {
  for (const [field, [from, to]] of Object.entries(r.moved)) {
    const move = recorded.changed[field];
    expect(move != null, `${r.noun}: the recorded edit does not name ${field}`, recorded.changed);
    expect(
      String(move.from ?? '') === String(from ?? '') && String(move.to ?? '') === String(to ?? ''),
      `${r.noun}: ${field} recorded as ${JSON.stringify(move)}, expected ${JSON.stringify({ from, to })}`,
      move,
    );
  }
}

/**
 * One register, edited once and then sent the same body again, with the
 * recorded act read back and checked field by field. Its own function because a
 * step that does this three times inline is one function with every branch of
 * all three in it.
 */
async function recordsOneEdit(ctx, r) {
  const { api, expect } = ctx;
  const made = await api('POST', `/api/cmc/${r.path}`, { projectId: state.projectId, ...r.ordinary(stamp) });
  expect(made.status === 200 || made.status === 201, `an ordinary ${r.noun} expected 200, got ${made.status}`, made.json);
  const id = dataOf(made).id;

  const edited = await api('PUT', `/api/cmc/${r.path}/${id}`, r.edit);
  expect(edited.status === 200, `editing the ${r.noun} expected 200, got ${edited.status}`, edited.json);

  const after = await historyOf(api, r.path, id);
  expect(after.status === 200, `${r.noun}: the history read expected 200, got ${after.status}`, after.json);
  const updates = after.entries.filter((e) => e.act === 'cmc.register.update');
  expect(updates.length === 1, `${r.noun}: expected one recorded edit, got ${updates.length}`, after.entries);
  const [recorded] = updates;
  expect(recorded.actorRef != null, `${r.noun}: the recorded edit names no actor`, recorded);
  expect(recorded.sealed === true, `${r.noun}: the recorded edit is not sealed into the chain`, recorded);
  expectMovedFields(expect, r, recorded);

  /* The same body again. §11.10(e) asks for changes to be recorded; a ledger
     that also holds every no-op PUT buries them. */
  const again = await api('PUT', `/api/cmc/${r.path}/${id}`, r.edit);
  expect(again.status === 200, `${r.noun}: the repeat edit expected 200, got ${again.status}`, again.json);
  const repeated = await historyOf(api, r.path, id);
  expect(
    repeated.entries.filter((e) => e.act === 'cmc.register.update').length === 1,
    `${r.noun}: a repeat body that moved nothing added an act`,
    repeated.entries,
  );
  return {
    register: r.path, id, acts: after.entries.map((e) => e.act),
    changedFields: recorded.changedFields, sealed: recorded.sealed,
  };
}

await step(
  {
    id: 'OQ-CMC-37',
    urs: ['URS-CMC-025'],
    title: 'An ordinary register edit records who changed it, and what moved',
    action:
      'edit one record in each of three registers — a serial one, a uuid one, and one moved by two fields at once — ' +
      'then send the same body again; then edit a record that does not exist; read each record’s chained history back',
    expected:
      'one act per edit that moved something, each naming the actor, the fields that moved and both values; the repeat ' +
      'body adds no act; the unknown record is a 404 that adds none; every act is sealed into the tenant chain',
    dependsOn: ['OQ-CMC-03'],
  },
  async (ctx) => {
    const { api, expect, attach } = ctx;
    const observed = [];
    for (const r of EDITED_REGISTERS) {
      observed.push(await recordsOneEdit(ctx, r));
      state.editedRegisterRecords = observed.map((o) => ({ register: o.register, id: o.id }));
    }

    /* A record that does not exist: a 404, and nothing recorded for it. */
    const ghost = await api('PUT', '/api/cmc/analytical-methods/99999999', { title: 'nothing to change' });
    expect(ghost.status === 404, `editing a record that does not exist expected 404, got ${ghost.status}`, ghost.json);
    const ghostHistory = await historyOf(api, 'analytical-methods', '99999999');
    expect(ghostHistory.status === 404, `the ghost record's history expected 404, got ${ghostHistory.status}`, ghostHistory.json);

    /* And the chain the acts are sealed into, as the ledger's own verifier
       reports it — not as this step recomputes it. */
    const ledger = await api('GET', '/api/audit-trail/ledger?limit=200');
    expect(ledger.status === 200, `the ledger read expected 200, got ${ledger.status}`, ledger.json);
    const chain = ledger.json?.meta?.chain ?? null;
    expect(chain?.ok === true, 'the tenant chain is not reported ok by the ledger', chain);
    attach('recorded-edits.json', { observed, ghost: ghost.status, chain });
    return `3 registers record an edit with both values; a repeat body records none; chain ok over ${chain?.rowsChecked ?? '?'} row(s)`;
  },
);

await step(
  {
    id: 'OQ-CMC-38',
    urs: ['URS-CMC-026'],
    title: 'A record’s change history is readable against the record it is about',
    action:
      'read the change history through the product’s own route for each edited record, then ask it for a record that ' +
      'does not exist and for a register that keeps no history; read the specifications register’s own history route',
    expected:
      'the create and each edit in order with the person, the fields and both values; 404 for the unknown record; 404 ' +
      'naming the registers that do keep one — never an empty history; the specifications route still answers 200',
    dependsOn: ['OQ-CMC-37'],
  },
  async ({ api, expect, attach, deviation }) => {
    const records = state.editedRegisterRecords ?? [];
    if (records.length === 0) {
      deviation('not executed — no record survived OQ-CMC-37 to read a history for.', { records });
      return 'not executed';
    }
    const read = [];
    for (const rec of records) {
      const h = await historyOf(api, rec.register, rec.id);
      expect(h.status === 200, `${rec.register}: the history read expected 200, got ${h.status}`, h.json);
      /* Oldest first, and the create is the first act: a history that starts
         at the edit has lost the record's beginning. */
      expect(h.entries[0]?.act === 'cmc.register.create', `${rec.register}: the history does not begin with the create`, h.entries);
      const order = h.entries.map((e) => e.at);
      expect(
        order.every((at, i) => i === 0 || at >= order[i - 1]),
        `${rec.register}: the history is not in order`,
        order,
      );
      expect(h.entries.every((e) => e.actorRef != null), `${rec.register}: an act names no account`, h.entries);
      read.push({ register: rec.register, id: rec.id, acts: h.entries.map((e) => e.label) });
    }

    /* A register that keeps no history says so, and names the ones that do —
       never an empty history, which reads as a record nobody has touched. */
    const unserved = await historyOf(api, 'qbd-elements', '3');
    expect(unserved.status === 404, `a register with no history expected 404, got ${unserved.status}`, unserved.json);
    expect(
      /analytical-methods/.test(errDetail({ json: unserved.json })),
      'the refusal does not name the registers that do keep a history',
      unserved.json,
    );

    /* The specifications register keeps its own history over its own store.
       Two routes answering one question is the duplication the repo forbids,
       so this one must not have swallowed it. The id is the specification
       OQ-CMC-03 recorded — `GET /api/cmc/specifications` is not a list route
       (the register's list is `/:projectId`), and a step that read the wrong
       path recorded a deviation saying this organisation holds no
       specification, which was not true. */
    const specId = state.records?.specification ?? null;
    let specStatus = null;
    if (specId) {
      const specHistory = await api('GET', `/api/cmc/specifications/${specId}/history`);
      specStatus = specHistory.status;
      expect(specStatus === 200, `the specifications history expected 200, got ${specStatus}`, specHistory.json);
    } else {
      deviation(
        'partly executed — every register history above was read, but OQ-CMC-03 recorded no specification for this ' +
          'run, so the specifications register’s own history route was not exercised.',
        { read },
      );
    }
    attach('histories.json', { read, unserved: unserved.status, specificationsHistory: specStatus });
    return `${read.length} record histories read in order; an unserved register names the served ones; specifications ${specStatus ?? 'not exercised'}`;
  },
);

/**
 * OQ-CMC-39: URS-CMC-027, a programme the organisation does not hold.
 *
 * Found by a route sweep on 2026-10-19: `POST /api/cmc/ich-compliance` answered
 * 200 with a complete eleven-guideline verdict and nine findings for a
 * programme that does not exist, for another organisation's programme, and for
 * the string `not-a-uuid` — and five register creates wrote the body's
 * programme id into the row with no check at all
 * (docs/evidence/CMC-M3-GA/2026-10-19/10-unverified-programme/).
 */

/** The reads and derivations, each over ONE programme. */
const PROGRAMME_READS = [
  { label: 'POST /ich-compliance', method: 'POST', at: () => '/api/cmc/ich-compliance', body: (id) => ({ projectId: id }) },
  { label: 'GET /quality/qbd/:projectId', method: 'GET', at: (id) => `/api/cmc/quality/qbd/${id}` },
  { label: 'POST /control-strategy', method: 'POST', at: () => '/api/cmc/control-strategy', body: (id) => ({ projectId: id, scope: 'both' }) },
];

/** The creates that file a record UNDER a programme. */
const PROGRAMME_CREATES = [
  {
    label: 'POST /container-closures',
    at: '/api/cmc/container-closures',
    body: (id, s) => ({ projectId: id, systemName: `OQ CCS ${s}`, containerDescription: 'HDPE bottle', closureDescription: 'CR cap', status: 'draft' }),
  },
  {
    /* Raw SQL rather than Drizzle, and it answered 500 for an unknown
       programme until the refusal reached the shared reader. */
    label: 'POST /comparability-studies',
    at: '/api/cmc/comparability-studies',
    body: (id, s) => ({ projectId: id, title: `OQ comparability ${s}`, type: 'process', product: 'Scale', status: 'draft' }),
  },
  {
    label: 'POST /material-specs',
    at: '/api/cmc/material-specs',
    body: (id, s) => ({ projectId: id, materialName: `OQ excipient ${s}`, materialRole: 'excipient', grade: 'USP' }),
  },
];

const callRead = (api, read, id) =>
  read.method === 'GET' ? api('GET', read.at(id)) : api(read.method, read.at(id), read.body(id));

await step(
  {
    id: 'OQ-CMC-39',
    urs: ['URS-CMC-027'],
    title: 'No verdict and no filing for a programme the organisation does not hold',
    action:
      'ask for an ICH compliance verdict, a QbD derivation and a control strategy, and file a container closure, a ' +
      'comparability assessment and a material specification, under programme ids the organisation does not hold; then ' +
      'the same six under the run’s own programme; and one create with no programme at all',
    expected:
      'each read 404 stating nothing was assessed and each create 409 naming the programme as not this organisation’s, ' +
      'with nothing written; the same six succeed under the run’s own programme; the create with no programme is ' +
      'accepted as an organisation-wide record',
    dependsOn: ['OQ-CMC-03'],
  },
  async ({ api, expect, attach, deviation }) => {
    /* A well-formed uuid naming no programme, and an id that is not a uuid at
       all — two different ways of being wrong, because a route that validates
       the SHAPE and not the ownership passes the first and fails the second. */
    const unheld = [
      { kind: 'a uuid naming no programme', id: '99999999-9999-4999-8999-999999999999' },
      { kind: 'an id that is not a uuid', id: 'not-a-uuid' },
    ];
    const foreign = process.env.OQ_FOREIGN_PROJECT_ID;
    if (foreign) unheld.push({ kind: "a second tenant's programme", id: foreign });
    else {
      deviation(
        'partly executed — a programme that does not exist and a malformed id were both refused by all six paths, but ' +
          'OQ_FOREIGN_PROJECT_ID (a programme of a second tenant) was not supplied, so refusal of ANOTHER ' +
          "ORGANISATION'S programme was not observed in this run.",
        { unheld: unheld.map((u) => u.kind) },
      );
    }

    const observed = [];
    for (const { kind, id } of unheld) {
      for (const read of PROGRAMME_READS) {
        const r = await callRead(api, read, id);
        expect(r.status === 404, `${read.label} for ${kind} expected 404, got ${r.status}`, r.json);
        expect(
          /nothing was assessed/i.test(errDetail(r)),
          `${read.label} for ${kind}: the refusal does not say nothing was assessed`,
          errDetail(r).slice(0, 200),
        );
        observed.push({ path: read.label, programme: kind, status: r.status });
      }
      for (const create of PROGRAMME_CREATES) {
        const r = await api('POST', create.at, create.body(id, stamp));
        expect(r.status === 409, `${create.label} for ${kind} expected 409, got ${r.status}`, r.json);
        expect(
          /not one of this organisation/i.test(errDetail(r)),
          `${create.label} for ${kind}: the refusal does not name the programme`,
          errDetail(r).slice(0, 200),
        );
        observed.push({ path: create.label, programme: kind, status: r.status });
      }
    }

    /* The control: the same six under the run's own programme still work, or
       the refusal above is a broken route rather than a guard. */
    for (const read of PROGRAMME_READS) {
      const r = await callRead(api, read, state.projectId);
      expect(r.status === 200, `${read.label} for this run's own programme expected 200, got ${r.status}`, r.json);
    }
    for (const create of PROGRAMME_CREATES) {
      const r = await api('POST', create.at, create.body(state.projectId, `${stamp}b`));
      expect(r.status === 200 || r.status === 201, `${create.label} for this run's own programme expected 200, got ${r.status}`, r.json);
      expect(String(dataOf(r).projectId ?? dataOf(r).project_id ?? '') === String(state.projectId), `${create.label}: filed under another programme`, dataOf(r));
    }

    /* And a record with no programme at all, which these registers hold
       organisation-wide: a check that refused it would break the register
       rather than guard it. */
    const orgWide = await api('POST', '/api/cmc/material-specs', {
      materialName: `OQ org-wide excipient ${stamp}`, materialRole: 'excipient', grade: 'USP',
    });
    expect(orgWide.status === 200 || orgWide.status === 201, `an org-wide record expected 200, got ${orgWide.status}`, orgWide.json);
    expect(dataOf(orgWide).projectId == null, 'an org-wide record was filed under a programme', dataOf(orgWide));

    attach('unheld-programmes.json', observed);
    return `${unheld.length} unheld programme(s) × 6 paths refused; the same 6 serve this run's own programme; an org-wide record is accepted`;
  },
);

/**
 * OQ-CMC-40: URS-CMC-028, the stability close-out under a signature.
 *
 * The shelf life §3.2.S.7.1 / §3.2.P.8.1 prints as the dossier's proposed
 * storage period, and the value the ICH Q1E rule judges a programme against,
 * was set by an ordinary PUT together with the terminal status until
 * 2026-10-19 (docs/evidence/CMC-M3-GA/2026-10-19/11-stability-close-out/).
 */
const CLOSE_OUT_REASON = 'The 24-month long-term data support a 24-month shelf life at the labelled condition.';

const stabilityForCloseOut = (projectId, s) => ({
  projectId,
  productName: `OQ-CLO-${s}`,
  batchNumber: 'B-1',
  dosageForm: 'tablet',
  scope: 'DP',
  climaticZone: 'II',
  studyType: 'long_term',
  storageConditions: ['25C/60%RH'],
  duration: 24,
  testParameters: ['assay'],
  timePoints: ['0', '12', '24'],
  status: 'ACTIVE',
  startDate: '2026-01-01T00:00:00.000Z',
});

await step(
  {
    id: 'OQ-CMC-40',
    urs: ['URS-CMC-028'],
    title: 'A stability study’s shelf life is recorded under a signature',
    action:
      'create a study already COMPLETED with a shelf life, then close an ordinary study out by PUT; then sign the ' +
      'close-out with no reason, with a reason but no re-authentication, with both but no shelf life recorded, with ' +
      'a shelf life but no results pulled, and with everything; then edit the closed-out study and close it out again',
    expected:
      'the create and the PUT are each refused 409 naming POST /api/cmc/stability-studies/:id/close-out and nothing ' +
      'is stored; then 400, then 401, then 409 naming the missing shelf life, then 409 naming the absent results, ' +
      'then 200 with COMPLETED, the signer and the date set and one electronic_signatures row; the edit after is ' +
      '409 SIGNED_RECORD and a second close-out is 409 already COMPLETED',
    dependsOn: ['OQ-CMC-03'],
  },
  async (ctx) => {
    const { api, expect, attach, deviation } = ctx;
    const observed = {};

    /* A study cannot be born closed out. */
    const born = await api('POST', '/api/cmc/stability-studies', {
      ...stabilityForCloseOut(state.projectId, stamp),
      status: 'COMPLETED',
      shelfLife: '36 months at 25C/60%RH',
    });
    expect(born.status === 409, `a study created COMPLETED expected 409, got ${born.status}`, born.json);
    expect(
      /stability-studies\/:id\/close-out/.test(errDetail(born)),
      'the create refusal does not name the governed path',
      errDetail(born).slice(0, 240),
    );
    observed.create = born.status;

    const made = await api('POST', '/api/cmc/stability-studies', stabilityForCloseOut(state.projectId, stamp));
    expect(made.status === 200 || made.status === 201, `an ordinary study expected 200, got ${made.status}`, made.json);
    const id = dataOf(made).id;

    /* Nor reached by an ordinary edit — the half that was 200 until today. */
    const byEdit = await api('PUT', `/api/cmc/stability-studies/${id}`, {
      status: 'COMPLETED',
      shelfLife: '36 months at 25C/60%RH',
    });
    expect(byEdit.status === 409, `closing out by PUT expected 409, got ${byEdit.status}`, byEdit.json);
    const after = await api('GET', `/api/cmc/register-history/stability-studies/${id}`);
    expect(
      (dataOf(after).entries ?? []).every((e) => !(e.changed ?? {}).status),
      'the refused edit moved the status anyway',
      dataOf(after).entries,
    );
    observed.byEdit = byEdit.status;

    /* The ungoverned halves of the ceremony, which need no credential. */
    const base = `/api/cmc/stability-studies/${id}/close-out`;
    const noReason = await api('POST', base, {});
    expect(noReason.status === 400, `no reason expected 400, got ${noReason.status}`, noReason.json);
    const noReauth = await api('POST', base, { reason: CLOSE_OUT_REASON, meaning: 'approval' });
    expect(noReauth.status === 401, `a reason with no re-authentication expected 401, got ${noReauth.status}`, noReauth.json);
    observed.noReason = noReason.status;
    observed.noReauth = noReauth.status;

    const password = process.env.OQ_RUN_PASSWORD;
    if (!password) {
      deviation(
        'partly executed — the create refusal, the edit refusal and both ungoverned halves were observed (409, 409, ' +
          '400, 401), but OQ_RUN_PASSWORD was not supplied, so no positive close-out signature was made. A register ' +
          'close-out needs a signing identity, not a second person.',
        observed,
      );
      attach('close-out.json', observed);
      return 'partly executed — the refusals were observed; no signature was made';
    }
    const signature = { reason: CLOSE_OUT_REASON, meaning: 'approval', reauth: { password } };

    /* The two preconditions, which fail differently: nothing to sign for, and
       nothing for the claim to rest on. */
    const noClaim = await api('POST', base, signature);
    expect(noClaim.status === 409, `signing with no shelf life expected 409, got ${noClaim.status}`, noClaim.json);
    expect(/records no shelf life/i.test(errDetail(noClaim)), 'the refusal does not name the missing shelf life', errDetail(noClaim).slice(0, 200));

    const claim = await api('PUT', `/api/cmc/stability-studies/${id}`, { shelfLife: '24 months at 25C/60%RH' });
    expect(claim.status === 200, `recording the shelf life expected 200, got ${claim.status}`, claim.json);
    const noData = await api('POST', base, signature);
    expect(noData.status === 409, `signing over no results expected 409, got ${noData.status}`, noData.json);
    expect(
      /no recorded pull-point results/i.test(errDetail(noData)),
      'the refusal does not name the absent results — a planned schedule is not data',
      errDetail(noData).slice(0, 200),
    );
    observed.noClaim = noClaim.status;
    observed.noData = noData.status;

    const results = await api('PUT', `/api/cmc/stability-studies/${id}`, {
      stabilityData: [
        { timePoint: '0', parameter: 'assay', result: '99.8' },
        { timePoint: '12', parameter: 'assay', result: '99.4' },
        { timePoint: '24', parameter: 'assay', result: '99.1' },
      ],
    });
    expect(results.status === 200, `recording the results expected 200, got ${results.status}`, results.json);

    /* The signature. */
    const signed = await api('POST', base, signature);
    expect(signed.status === 200, `the close-out expected 200, got ${signed.status}`, signed.json);
    const row = dataOf(signed);
    expect(String(row.status) === 'COMPLETED', `the study is not COMPLETED after the signature`, row);
    expect(row.shelfLifeSignedBy != null, 'the signature set no signer', row);
    expect(row.shelfLifeSignedAt != null, 'the signature set no date', row);

    const sigs = await signatureRowsFor(api, `stability_study:${id}`);
    expect(sigs.status === 200, `the signature read expected 200, got ${sigs.status}`, sigs);
    expect(sigs.rows.length === 1, `expected one electronic_signatures row, got ${sigs.rows.length}`, sigs);

    /* And afterwards: the content is closed and the act cannot be repeated. */
    const edited = await api('PUT', `/api/cmc/stability-studies/${id}`, { shelfLife: '36 months at 25C/60%RH' });
    expect(edited.status === 409, `an edit after the signature expected 409, got ${edited.status}`, edited.json);
    const again = await api('POST', base, signature);
    expect(again.status === 409, `a second close-out expected 409, got ${again.status}`, again.json);
    expect(/already COMPLETED/i.test(errDetail(again)), 'the second close-out is not refused as already COMPLETED', errDetail(again).slice(0, 160));
    observed.signed = signed.status;
    observed.signatures = sigs.rows.length;
    observed.editAfter = edited.status;
    observed.secondCloseOut = again.status;
    attach('close-out.json', observed);
    return 'the close-out is a signature: refused on the create, on the edit, with no reason, with no re-authentication, over no claim and over no data; once signed, closed and unrepeatable';
  },
);

/** @see REGISTER_STEPS — the chain that serialises these modules. */
export const ATTRIBUTION_STEPS = `${REGISTER_STEPS} → steps-attribution.mjs`;
