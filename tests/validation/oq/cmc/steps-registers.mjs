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

/** @see SURFACE_STEPS — the chain that serialises these modules. */
export const REGISTER_STEPS = `${SURFACE_STEPS} → steps-registers.mjs`;
