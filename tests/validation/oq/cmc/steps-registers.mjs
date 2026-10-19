/**
 * OQ-008 steps OQ-CMC-34 and OQ-CMC-35: URS-CMC-023, the signed state of a
 * register.
 *
 * Four registers carried their two signature columns and no signature until
 * 2026-10-18 — the status word, the signer and the date were all request-body
 * fields, and the Module 3 composer, the ICH engines, the contradiction sweep
 * and the batch-release gate read the result as a completed governance act
 * (docs/evidence/CMC-M3-GA/2026-10-18/05-ungoverned-signed-states/). These two
 * steps are the create door and the ceremony behind it.
 */
import { step, state, stamp } from './context.mjs';
import { dataOf, errCode, errDetail, signatureRowsFor } from './signed-acts.mjs';
import { SURFACE_STEPS } from './steps-surface.mjs';

/**
 * The three registers whose signed word is a status, with the field names the
 * body uses and the path the refusal must name. QC testing is the fourth
 * register in the finding and is shaped differently — its signed state is
 * `reviewed_by` being set at all — so it is probed separately below.
 */
const SIGNED_REGISTERS = [
  {
    noun: 'analytical method',
    path: 'analytical-methods',
    sign: 'validate',
    signed: 'validated',
    signer: 'validatedBy',
    date: 'validationDate',
    /* An ordinary record of each, and the field the signature's precondition
       requires — recorded separately, by an ordinary edit, so the step can
       observe the refusal before it is there and the signature after. */
    ordinary: (s) => ({
      methodCode: `OQ-${s}`, title: 'OQ probe assay', purpose: 'Assay', analyte: 'API',
      matrix: 'Drug substance', technique: 'HPLC', status: 'development',
    }),
    basis: { ichQ2Parameters: { characteristics: ['Specificity', 'Accuracy', 'Precision'], summary: 'All criteria met.' } },
    missing: /ICH Q2 validation parameters/i,
  },
  {
    noun: 'process validation record',
    path: 'process-validation',
    sign: 'approve',
    signed: 'approved',
    signer: 'approvedBy',
    date: 'approvalDate',
    ordinary: () => ({ processName: 'OQ probe PPQ', stage: 'qualification', status: 'planning' }),
    basis: { validationReport: 'OQ-PV-RPT-001', validationProtocol: 'OQ-PV-PROT-001' },
    missing: /no validation report/i,
  },
  {
    noun: 'comparability assessment',
    path: 'comparability-studies',
    sign: 'approve',
    signed: 'approved',
    /* The handler aliases reviewed_by to `owner`; approved_at has no alias. */
    signer: 'owner',
    date: null,
    ordinary: () => ({ title: 'OQ probe comparability', type: 'process', product: 'Scale' }),
    basis: { outcome: 'Comparable on every attribute against the pre-change criteria.' },
    missing: /no justification/i,
  },
];

await step(
  {
    id: 'OQ-CMC-34',
    urs: ['URS-CMC-023'],
    title: 'A register record cannot be born, or edited, into its signed state',
    action: 'on each of analytical methods, process validation and comparability: create with the register’s signed word (and its signer and date) in the body, then edit an ordinary record into it; then create a QC result already carrying reviewedBy',
    expected: 'each refused 409 naming the governed path that does record it; nothing written, and no signer or date set',
    dependsOn: ['OQ-CMC-03'],
  },
  async ({ api, expect, attach }) => {
    const observed = [];
    for (const r of SIGNED_REGISTERS) {
      const stamp = `${Date.now()}`.slice(-6);
      /* The create, claiming the signed state outright — with the signer and
         the date, which is the write that filed an approval nobody made. */
      const born = await api('POST', `/api/cmc/${r.path}`, {
        projectId: state.projectId, ...r.ordinary(stamp),
        status: r.signed, [r.signer]: 1, ...(r.date ? { [r.date]: '2026-01-01' } : {}),
      });
      expect(born.status === 409, `a ${r.noun} created as ${r.signed} expected 409, got ${born.status}`, born.json);
      const says = errDetail(born);
      expect(
        new RegExp(`${r.path}/:id/${r.sign}`).test(says),
        `the refusal does not name POST /api/cmc/${r.path}/:id/${r.sign}`,
        says.slice(0, 300),
      );

      /* ...and the same word reached by an ordinary edit of a record that is
         already there, which is the other half of the same hole. */
      const ok = await api('POST', `/api/cmc/${r.path}`, { projectId: state.projectId, ...r.ordinary(stamp) });
      expect(ok.status === 200 || ok.status === 201, `an ordinary ${r.noun} expected 200, got ${ok.status}`, ok.json);
      const id = dataOf(ok).id;
      const edited = await api('PUT', `/api/cmc/${r.path}/${id}`, { status: r.signed });
      expect(edited.status === 409, `an edit into ${r.signed} expected 409, got ${edited.status}`, edited.json);

      /* Nothing was set by either attempt. */
      const after = await api('GET', `/api/cmc/${r.path}/${id}`);
      const row = after.status === 200 ? dataOf(after) : dataOf(ok);
      expect(
        String(row.status ?? '').toLowerCase() !== r.signed,
        `the ${r.noun} is stored as ${r.signed} after two refusals`,
        row,
      );
      observed.push({ register: r.path, create: born.status, edit: edited.status, storedStatus: row.status ?? null, id });
    }

    /* QC testing: the signed state is that reviewed_by is set at all, and the
       batch-release gate reads it as the §3.2.S.4.4 second-person review. */
    const qc = await api('POST', '/api/cmc/qc-testing', {
      projectId: state.projectId, sampleId: `OQ-QC-${`${Date.now()}`.slice(-6)}`,
      sampleType: 'finished-product', testMethod: 'HPLC assay', passFailStatus: 'pass',
      testDate: '2026-01-01', reviewedBy: 1, releaseDate: '2026-01-02',
    });
    expect(qc.status === 409, `a pre-reviewed QC result expected 409, got ${qc.status}`, qc.json);
    expect(
      errCode(qc) === 'REVIEW_IS_A_SECOND_PERSON',
      `a pre-reviewed QC result expected REVIEW_IS_A_SECOND_PERSON, got ${errCode(qc)}`,
      qc.json,
    );
    observed.push({ register: 'qc-testing', create: qc.status, code: errCode(qc) });
    attach('refusals.json', observed);
    state.signedRegisterRecords = observed.filter((o) => o.id).map((o) => ({ register: o.register, id: o.id }));
    return `4 registers refuse the signed state on create; 3 refuse it on an edit; each names its own governed path`;
  },
);

await step(
  {
    id: 'OQ-CMC-35',
    urs: ['URS-CMC-023'],
    title: 'The signature the refusal names records the signer, and closes the record',
    action: 'sign each of the three through the path its refusal named: with no reason, with a reason but no re-authentication, with both but without the thing the signature accepts, then with everything; then edit the signed record',
    expected: 'the signature records the status, the signer and the date, writes one electronic_signatures row bound to the chained audit row, and the edit after it is refused',
    dependsOn: ['OQ-CMC-34'],
  },
  async (ctx) => {
    const { api, expect, attach, deviation } = ctx;
    const records = state.signedRegisterRecords ?? [];
    const observed = [];

    /* The ungoverned halves first: they need no credential, so they are
       observed on every run rather than deferred with the signature. */
    for (const r of SIGNED_REGISTERS) {
      const rec = records.find((x) => x.register === r.path);
      if (!rec) continue;
      const base = `/api/cmc/${r.path}/${rec.id}/${r.sign}`;
      const noReason = await api('POST', base, {});
      expect(noReason.status === 400, `${r.noun}: no reason expected 400, got ${noReason.status}`, noReason.json);
      const noReauth = await api('POST', base, { reason: `OQ-008 ${r.sign} of the probe record.`, meaning: 'approval' });
      expect(
        noReauth.status === 401,
        `${r.noun}: a reason with no re-authentication expected 401, got ${noReauth.status}`,
        noReauth.json,
      );
      observed.push({ register: r.path, noReason: noReason.status, noReauth: noReauth.status, reauthCode: errCode(noReauth) });
    }
    attach('ungoverned-halves.json', observed);

    /* A register qualification is NOT a two-person act: the five ceremonies
       that predate these three have no independence check either, because the
       person who recorded a method's Q2 package is ordinarily the person who
       signs its validation. (The four-eyes rule is on the Module 3 SECTION
       approval — URS-CMC-022, OQ-CMC-33 — where the signer must not be an
       author of the records the section cites.) So this step re-authenticates
       as the run identity with OQ_RUN_PASSWORD rather than calling
       `requireSigner`, which deviates when the signer IS the author. */
    const ownPassword = process.env.OQ_RUN_PASSWORD;
    if (!ownPassword) {
      deviation(
        'partly executed — every ungoverned half was observed (400 with no reason, 401 with no re-authentication), but ' +
          'OQ_RUN_PASSWORD was not supplied, so the run identity could not re-authenticate and no positive signature was made. ' +
          'A register signature needs only a signing identity, not a second person.',
        { ungoverned: observed },
      );
    }
    const signer = { session: null, password: ownPassword };
    const signed = [];
    for (const r of SIGNED_REGISTERS) {
      const rec = records.find((x) => x.register === r.path);
      if (!rec) continue;
      const base = `/api/cmc/${r.path}/${rec.id}/${r.sign}`;
      const reason = `OQ-008: the ${r.noun} is ${r.signed} on the evidence recorded against it.`;

      /* The precondition, before the basis is recorded: a signature over
         nothing accepts nothing. */
      const bare = await api('POST', base, { reason, meaning: 'approval', reauth: { password: signer.password } });
      expect(bare.status === 409, `${r.noun}: signing with no basis expected 409, got ${bare.status}`, bare.json);
      expect(r.missing.test(errDetail(bare)), `${r.noun}: the refusal does not name what is missing`, errDetail(bare).slice(0, 250));

      const basis = await api('PUT', `/api/cmc/${r.path}/${rec.id}`, r.basis);
      expect(basis.status === 200, `${r.noun}: recording the basis expected 200, got ${basis.status}`, basis.json);

      const act = await api('POST', base, { reason, meaning: 'approval', reauth: { password: signer.password } });
      expect(act.status === 200, `${r.noun}: the signature expected 200, got ${act.status}`, act.json);
      const row = dataOf(act);
      expect(String(row.status ?? '').toLowerCase() === r.signed, `${r.noun} is not ${r.signed} after the signature`, row);
      expect(row[r.signer] != null, `${r.noun}: the signature set no ${r.signer}`, row);
      if (r.date) expect(row[r.date] != null, `${r.noun}: the signature set no ${r.date}`, row);

      /* The §11.50 row, and that it is bound to the chained ledger. */
      const target = `${r.path.replace(/-/g, '_').replace(/ies$/, 'y').replace(/s$/, '')}:${rec.id}`;
      /* signatureRowsFor takes the api function, not the context, and returns
         { status, rows } — the read is through the product's own Part 11 route,
         because what an inspector sees is the row, not the act's response. */
      const sigs = await signatureRowsFor(api, target);
      expect(sigs.status === 200, `${r.noun}: the signature read expected 200, got ${sigs.status}`, sigs);
      expect(sigs.rows.length >= 1, `${r.noun}: no electronic_signatures row for ${target}`, { target, ...sigs });

      /* ...and the record is now closed to ordinary edits. */
      const after = await api('PUT', `/api/cmc/${r.path}/${rec.id}`, { status: 'draft' });
      expect(after.status === 409, `${r.noun}: an edit after signing expected 409, got ${after.status}`, after.json);
      signed.push({ register: r.path, status: row.status, signer: row[r.signer], signatures: sigs.rows.length, editAfter: after.status });
    }
    attach('signatures.json', signed);
    if (signed.length === 0) {
      deviation('not executed — no probe record survived OQ-CMC-34 to sign.', { records });
    }
    return `${signed.length} registers signed through the path their refusal named; each records the signer and refuses the edit after`;
  },
);

/**
 * The four stability programmes OQ-CMC-36 reads a Q1E verdict for. Each differs
 * from the first in exactly one way, so a verdict is never confounded with some
 * other difference: the coverage, the accelerated study, or the claim's text.
 */
const Q1E_CASES = [
  { label: 'within', claim: '24 months at 25C/60%RH', duration: 24, points: ['0', '3', '6', '12', '24'], accelerated: true, expect: 'pass', rule: 'Q1E_CLAIM_WITHIN_DATA' },
  { label: 'beyond', claim: '36 months at 25C/60%RH', duration: 12, points: ['0', '3', '6', '12'], accelerated: true, expect: 'warning', rule: 'Q1E_CLAIM_BEYOND_DATA' },
  { label: 'noaccel', claim: '24 months at 25C/60%RH', duration: 12, points: ['0', '3', '6', '12'], accelerated: false, expect: 'warning', rule: 'Q1E_EXTRAPOLATION_WITHOUT_ACCELERATED' },
  /* "to be determined" states no period. A parser that took the first integer
     it saw would read the storage condition's 25 as 25 months, so this case
     must come back `not_evaluated` and never `pass`. */
  { label: 'unreadable', claim: 'to be determined', duration: 12, points: ['0', '3', '6', '12'], accelerated: true, expect: 'not_evaluated', rule: 'Q1E_CLAIM_NOT_READABLE' },
  /* A study registered with a 24-month schedule and nothing pulled yet. Its
     plan is not its data: the first version read the planned duration as
     coverage and reported a 24-month claim as `pass` against no results at
     all. */
  { label: 'planned', claim: '24 months at 25C/60%RH', duration: 24, points: ['0', '3', '6', '12', '24'], accelerated: true, unpulled: true, expect: 'warning', rule: 'Q1E_CLAIM_BEYOND_DATA' },
];

/**
 * The RECORDED pull points, which is what the rule measures a claim against.
 * A study carrying only its planned schedule has produced no data, and the rule
 * reports a claim over it rather than reading the plan as coverage — so a step
 * that wants to exercise the pass path has to record results.
 */
const resultsTo = (months) =>
  [0, 3, 6, 9, 12, 18, 24, 36]
    .filter((t) => t <= Number(months))
    .map((t) => ({ timePoint: String(t), parameter: 'assay', result: '99.6' }));

const stabilityBody = (projectId, c, type) => ({
  projectId,
  productName: `Q1E-${c.label}`,
  batchNumber: 'B-1',
  dosageForm: 'tablet',
  scope: 'DP',
  climaticZone: 'II',
  studyType: type,
  storageConditions: [type === 'accelerated' ? '40C/75%RH' : '25C/60%RH'],
  duration: type === 'accelerated' ? 6 : c.duration,
  testParameters: ['assay'],
  timePoints: type === 'accelerated' ? ['0', '3', '6'] : c.points,
  shelfLife: type === 'accelerated' ? '' : c.claim,
  status: 'ACTIVE',
  startDate: '2026-01-01T00:00:00.000Z',
  stabilityData: c.unpulled && type !== 'accelerated' ? null : resultsTo(type === 'accelerated' ? 6 : c.duration),
});

await step(
  {
    id: 'OQ-CMC-36',
    urs: ['URS-CMC-024'],
    title: 'A shelf-life claim is judged against the data the studies cover',
    action: 'record four programmes: a shelf-life claim within the long-term coverage, one beyond it, one beyond it with no accelerated study, and one whose claim is free text that states no period; read the ICH compliance verdict for each',
    expected: 'Q1E pass, then a finding naming the months claimed and the months covered, then a second finding that Q1E admits extrapolation only on accelerated data, then not_evaluated quoting the text it could not read — never a pass',
  },
  async ({ api, expect, attach }) => {
    const observed = [];
    for (const c of Q1E_CASES) {
      const project = await api('POST', '/api/c2c/projects', {
        name: `OQ-008 Q1E ${c.label} ${stamp}`,
        productName: `Q1E-${c.label}`,
        programType: 'ind',
        productType: 'drug',
        applicationNumber: `77${String(stamp).slice(-4)}${c.label.length}`,
        primaryAgency: 'FDA',
        priority: 'high',
        indication: 'Q1E verdict',
      });
      expect(project.status === 201 || project.status === 200, `the ${c.label} programme expected 201, got ${project.status}`, project.json);
      const projectId = dataOf(project).id;
      const lt = await api('POST', '/api/cmc/stability-studies', stabilityBody(projectId, c, 'long_term'));
      expect(lt.status === 200 || lt.status === 201, `the ${c.label} long-term study expected 200, got ${lt.status}`, lt.json);
      if (c.accelerated) await api('POST', '/api/cmc/stability-studies', stabilityBody(projectId, c, 'accelerated'));

      const report = await api('POST', '/api/cmc/ich-compliance', { projectId });
      expect(report.status === 200, `the ${c.label} compliance read expected 200, got ${report.status}`, report.json);
      const data = dataOf(report);
      const verdict = data.guidelineStatus?.['Q1E'];
      const q1e = (Array.isArray(data.findings) ? data.findings : []).filter((f) => f.guideline === 'Q1E');
      expect(verdict === c.expect, `the ${c.label} case expected Q1E ${c.expect}, got ${verdict}`, { verdict, q1e });
      expect(
        q1e.some((f) => f.ruleId === c.rule),
        `the ${c.label} case does not report ${c.rule}`,
        q1e.map((f) => f.ruleId),
      );
      /* The numbers the finding states are the register's, and the message
         carries them: a verdict with no figures cannot be checked by a reader. */
      if (c.expect === 'warning') {
        const named = q1e.find((f) => f.ruleId === c.rule);
        expect(/\d+\s*month/.test(String(named?.message ?? '')), `the ${c.label} finding names no period`, named);
      }
      observed.push({ case: c.label, verdict, rules: q1e.map((f) => f.ruleId), citations: q1e.map((f) => f.citation) });
    }
    attach('q1e-verdicts.json', observed);
    return `4 stability programmes judged: ${observed.map((o) => `${o.case}=${o.verdict}`).join(', ')}`;
  },
);


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

/** @see SURFACE_STEPS — the chain that serialises these modules. */
export const REGISTER_STEPS = `${SURFACE_STEPS} → steps-registers.mjs`;
