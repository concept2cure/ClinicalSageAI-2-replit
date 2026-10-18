/**
 * OQ-008 steps OQ-CMC-19…24: placement into the programme's own IND sequence,
 * the append-only history, the signed register states, and the deterministic
 * engines.
 */
import { step, state, stamp, FOREIGN_PROJECT_ID } from './context.mjs';
import { requireSigner } from '../../lib/credentials.mjs';
import { dataOf, errCode, postAsSigner } from './signed-acts.mjs';
import { APPROVAL_STEPS } from './steps-approval.mjs';

const leafCount = (r) => {
  const rows = dataOf(r);
  return (Array.isArray(rows) ? rows : (rows.leaves ?? [])).length;
};

await step(
  {
    id: 'OQ-CMC-19',
    urs: ['URS-CMC-011'],
    title: 'Placement writes the approved sections into the programme’s own sequence',
    action: 'place the approved Module 3 into the programme’s IND sequence; then retry with the same key',
    expected: '200 with one leaf per placed section; the retry idempotent',
    dependsOn: ['OQ-CMC-13'],
  },
  async (ctx) => {
    const { api, expect, attach, deviation } = ctx;
    const signer = state.signer ?? (await requireSigner(ctx, ctx.baseUrl));
    const submissions = await api('GET', '/api/submissions');
    const rows = dataOf(submissions);
    const own = (Array.isArray(rows) ? rows : []).find((s) => String(s.projectId ?? s.project_id) === String(state.projectId));
    if (!own) {
      deviation('not executed — the programme has no submission spine to place into; the IND filing path (OQ-SUBC) creates it.', rows);
    }
    const seq = await api('POST', `/api/submissions/${own.id}/sequences`, { region: 'fda', sequenceNumber: '0001', type: 'original' });
    expect([200, 201].includes(seq.status), `the sequence create expected 200/201, got ${seq.status}`, seq.json);
    const sequenceId = dataOf(seq).id;
    state.sequenceId = sequenceId;

    const idempotencyKey = `oq-cmc-place-${stamp}`;
    const reason = 'Placing the approved Module 3 into sequence 0001 for filing.';
    const place = await postAsSigner(ctx, signer, `/api/cmc/module3-os/place-into-submission/${state.projectId}`, {
      sequenceId, reason, idempotencyKey,
    });
    attach('placement.json', place.json ?? {});
    expect(place.status === 200, `the placement expected 200, got ${place.status}`, place.json);
    const placed = leafCount(await api('GET', `/api/submissions/sequences/${sequenceId}/leaves`));
    expect(placed > 0, 'the placement wrote no leaf', place.json);

    const retry = await postAsSigner(ctx, signer, `/api/cmc/module3-os/place-into-submission/${state.projectId}`, {
      sequenceId, reason, idempotencyKey,
    });
    const after = leafCount(await api('GET', `/api/submissions/sequences/${sequenceId}/leaves`));
    expect(after === placed, `the retry wrote further leaves: ${placed} → ${after}`, { placed, after });
    return `placed ${placed} leaf/leaves; retry ${retry.status} with ${after} leaves still`;
  },
);

await step(
  {
    id: 'OQ-CMC-20',
    urs: ['URS-CMC-011'],
    title: 'Placement requires the regulatory-author role',
    action: 'as a member without that role: place',
    expected: '403; no leaf written',
    dependsOn: ['OQ-CMC-19'],
  },
  async ({ api, expect, deviation }) => {
    if (!process.env.OQ_MEMBER_EMAIL) {
      deviation('not executed — OQ_MEMBER_EMAIL / _PASSWORD not supplied; an identity without the regulatory-author role is needed to observe the refusal.');
    }
    const r = await api('POST', `/api/cmc/module3-os/place-into-submission/${state.projectId}`, {
      sequenceId: state.sequenceId, reason: 'Attempting a placement without the role.',
    });
    expect([401, 403].includes(r.status), `expected 403, got ${r.status}`, r.json);
    return `${r.status} ${errCode(r) ?? ''}`.trim();
  },
);

await step(
  {
    id: 'OQ-CMC-21',
    urs: ['URS-CMC-012'],
    title: 'The version history and the provenance events are append-only in the database',
    action: 'as the runtime role: UPDATE and DELETE on cmc_module3_section_versions and cmc_provenance_events',
    expected: 'each refused by the database',
    dependsOn: ['OQ-CMC-13'],
  },
  async ({ expect, attach, deviation }) => {
    /* The runtime role's own connection, not the owner's: the refusal under
       test is the trigger's, and an owner session would not meet it. The
       harness exposes no SQL client, so the step needs the role the IQ run
       provisions (scripts/validation/run-iq.mjs) in DATABASE_URL_RUNTIME. */
    const connectionString = process.env.DATABASE_URL_RUNTIME;
    if (!connectionString) {
      deviation('not executed — DATABASE_URL_RUNTIME (the non-owner runtime role) not supplied; the append-only refusal cannot be observed from an owner session.');
    }
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString });
    await client.connect();
    const observed = {};
    /* `WHERE false` touches no row: what is under test is whether the role may
       issue the statement at all, not what it would have changed. */
    const statements = {
      'cmc_module3_section_versions.UPDATE': 'UPDATE cmc_module3_section_versions SET organization_id = organization_id WHERE false',
      'cmc_module3_section_versions.DELETE': 'DELETE FROM cmc_module3_section_versions WHERE false',
      'cmc_provenance_events.UPDATE': 'UPDATE cmc_provenance_events SET organization_id = organization_id WHERE false',
      'cmc_provenance_events.DELETE': 'DELETE FROM cmc_provenance_events WHERE false',
    };
    for (const [label, sql] of Object.entries(statements)) {
      try {
        await client.query(sql);
        observed[label] = 'ALLOWED';
      } catch (e) {
        observed[label] = `refused: ${e.code ?? e.message}`;
      }
    }
    await client.end();
    attach('append-only.json', observed);
    const allowed = Object.entries(observed).filter(([, v]) => v === 'ALLOWED').map(([k]) => k);
    expect(allowed.length === 0, `the runtime role may still write: ${allowed.join(', ')}`, observed);
    return Object.entries(observed).map(([k, v]) => `${k} ${v}`).join('; ');
  },
);

await step(
  {
    id: 'OQ-CMC-22',
    urs: ['URS-CMC-013'],
    title: 'A batch release rests on recorded, reviewed QC results and happens once',
    action: 'release over results that are not recorded; then create a batch already released',
    expected: '409 each time; nothing released',
    dependsOn: ['OQ-CMC-03'],
  },
  async (ctx) => {
    const { api, expect } = ctx;
    const signer = state.signer ?? (await requireSigner(ctx, ctx.baseUrl));
    const batchId = state.records?.batchRecord;
    expect(Boolean(batchId), 'the prerequisite recorded no batch', state.records);
    const noResults = await postAsSigner(ctx, signer, `/api/cmc/batch-records/${batchId}/release`, {
      reason: 'Releasing before any QC result is recorded.', meaning: 'approval',
    });
    expect(noResults.status === 409, `a release with no QC result expected 409, got ${noResults.status}`, noResults.json);
    const already = await api('POST', '/api/cmc/batch-records', {
      batchNumber: `B-PRE-${stamp}`, productName: 'Drug substance', status: 'released', projectId: state.projectId,
    });
    expect(already.status === 409, `creating a batch already released expected 409, got ${already.status}`, already.json);
    return 'release with no QC result 409; create already released 409';
  },
);

await step(
  {
    id: 'OQ-CMC-23',
    urs: ['URS-CMC-013'],
    title: 'Editing an approved specification withdraws the approval, with the reason recorded',
    action: 'approve a specification, then widen its limits without a reason, then with one',
    expected: '422 without a reason; with one, the edit lands and the approval is withdrawn',
    dependsOn: ['OQ-CMC-03'],
  },
  async (ctx) => {
    const { api, expect } = ctx;
    const signer = state.signer ?? (await requireSigner(ctx, ctx.baseUrl));
    const specId = state.records?.specification;
    expect(Boolean(specId), 'the prerequisite recorded no specification', state.records);
    const approve = await postAsSigner(ctx, signer, `/api/cmc/specifications/${specId}/approve`, {
      reason: 'Limits justified by the batch history in the development report.', meaning: 'approval',
    });
    expect(approve.status === 200, `the specification approval expected 200, got ${approve.status}`, approve.json);
    const widened = { acceptanceCriteria: { release: '90.0-110.0%' } };
    const noReason = await api('PUT', `/api/cmc/specifications/${specId}`, widened);
    expect(noReason.status === 422, `widening an approved specification with no reason expected 422, got ${noReason.status}`, noReason.json);
    const withReason = await api('PUT', `/api/cmc/specifications/${specId}`, {
      ...widened, reason: 'The upper limit was widened to match the revised method range.',
    });
    expect(withReason.status === 200, `the reasoned edit expected 200, got ${withReason.status}`, withReason.json);
    const read = await api('GET', `/api/cmc/specifications/${specId}`);
    const status = dataOf(read).approvalStatus ?? dataOf(read).approval_status;
    expect(status !== 'approved', `the edit kept the approval (${status})`, read.json);
    return `approved 200; edit with no reason 422; with a reason 200 and the approval withdrawn (${status})`;
  },
);

await step(
  {
    id: 'OQ-CMC-24',
    urs: ['URS-CMC-014'],
    title: 'The deterministic engines cite what they judged and refuse a foreign programme',
    action: 'the ICH compliance check for the programme, then for a programme of another organisation',
    expected: 'it cites the guideline revision and the records it judged; 403/404 for the foreign programme',
    dependsOn: ['OQ-CMC-03'],
  },
  async ({ api, expect, attach, deviation }) => {
    const ich = await api('POST', '/api/cmc/ich-compliance', { projectId: state.projectId });
    expect(ich.status === 200, `the ICH compliance check expected 200, got ${ich.status}`, ich.json);
    const text = JSON.stringify(ich.json ?? {});
    expect(/Q\d/.test(text), 'the compliance verdict cites no ICH guideline', text.slice(0, 300));
    attach('ich-compliance.json', ich.json ?? {});
    /* Two different claims, and only one of them this run can observe.
       A NONEXISTENT id must not be answered as though it held records — that
       is checked here. Another ORGANISATION's real programme must be 404, so
       the engine is no existence oracle; that needs a programme of a second
       tenant, which this run does not create, so it is supplied or the step
       says what it could not see.

       The first smoke run of this protocol (2026-10-18) recorded 200 for a
       nonexistent id with an empty assessment, and the route
       (POST /api/cmc/ich-compliance) performs no project-membership check at
       all — which is GA plan item 6, open, and the reason URS-CMC-014's 404
       clause is not yet met. */
      const absent = await api('POST', '/api/cmc/ich-compliance', { projectId: FOREIGN_PROJECT_ID });
    const absentText = JSON.stringify(absent.json ?? {});
    expect(
      [403, 404].includes(absent.status) || !/BX-701/.test(absentText),
      `a nonexistent programme was answered with this programme's records (${absent.status})`,
      absentText.slice(0, 300),
    );
    const foreignId = process.env.OQ_FOREIGN_PROJECT_ID;
    if (!foreignId) {
      deviation(
        'partly executed — a nonexistent programme leaks no records (observed), but OQ_FOREIGN_PROJECT_ID (a programme of a second tenant) was not supplied, ' +
          `so URS-CMC-014's 404 for another organisation's programme was not observed. A nonexistent id answered ${absent.status}.`,
        absentText.slice(0, 300),
      );
    }
    const foreign = await api('POST', '/api/cmc/ich-compliance', { projectId: foreignId });
    expect([403, 404].includes(foreign.status), `a foreign programme expected 403/404, got ${foreign.status}`, foreign.json);
    return `compliance 200 citing guidelines; a nonexistent programme ${absent.status} with no records; a foreign programme ${foreign.status}`;
  },
);

/**
 * Named so run.mjs can import this module with a `from` clause: that is how
 * `ci:validation-traceability` finds a runner's step modules (it reads the
 * runner as run.mjs plus the modules it imports `from './*.mjs'`). A bare
 * side-effect import runs the steps and leaves the gate unable to see them, so
 * every step here would read as described-but-never-executed.
 *
 * It also carries the ORDER. Sibling ES modules that use top-level await
 * interleave — the first smoke run of this protocol ran OQ-CMC-06 before the
 * prerequisite OQ-CMC-03, and eight steps recorded *prerequisite did not pass*
 * against a step that had passed. A module's dependencies are fully evaluated
 * before it begins, so each step module imports the previous one's name, which
 * both serialises them and reads out as the execution order.
 */
export const FILING_STEPS = `${APPROVAL_STEPS} \u2192 steps-filing.mjs`;
