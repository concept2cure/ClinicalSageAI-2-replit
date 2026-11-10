/**
 * OQ-008 steps OQ-CMC-19…24: placement into the programme's own IND sequence,
 * the append-only history, the signed register states, and the deterministic
 * engines.
 */
import { step, state, stamp, FOREIGN_PROJECT_ID } from './context.mjs';
import { requireIdentity, requireSigner } from '../../lib/credentials.mjs';
import { approveSection, dataOf, errCode, postAsSigner } from './signed-acts.mjs';
import { isComplete, openFindings, sectionsOf } from './complete-programme.mjs';
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
    action: 'on the second programme: validate the method under signature, compile, sweep, approve every section as the signer, read the final-export gate; create the IND sequence; place into another submission, then into its own; then place again',
    expected: 'every section approved and the gate 200; another submission refused with no leaf; 200 with one leaf per section; the repeat adds no leaf',
    dependsOn: ['OQ-CMC-17'],
    note: 'v0.13: executed for the first time, on the second programme (OQ-CMC-03b). Until v0.12 the step acted on the first programme, whose sections cannot be approved, and recorded the gate\'s 409 as a deviation. The step now also observes the gate with every blocker cleared (URS-CMC-010) and the placement into another submission\'s sequence, both owed since v0.11.',
  },
  async (ctx) => {
    const { api, expect, attach } = ctx;
    const signer = state.signer ?? (await requireSigner(ctx, ctx.baseUrl));
    const { projectId, records } = state.complete;

    const validated = await postAsSigner(ctx, signer, `/api/cmc/analytical-methods/${records.analyticalMethod}/validate`, {
      reason: 'ICH Q2(R2) validation package reviewed and accepted.', meaning: 'approval',
    });
    expect(validated.status === 200, `the method validation expected 200, got ${validated.status}`, validated.json);
    // The compile follows the last write: a later write would make sections stale.
    const compile = await api('POST', `/api/cmc/module3-os/compile/${projectId}`, {});
    expect(compile.status === 200, `the compile expected 200, got ${compile.status}`, compile.json);
    const sweep = await api('POST', `/api/cmc/module3-os/contradictions/${projectId}`, {});
    expect(sweep.status === 200, `the sweep expected 200, got ${sweep.status}`, sweep.json);
    const open = await openFindings(api, projectId);
    expect(open.length === 0, `${open.length} finding(s) are open before approval`, open);
    const sections = await sectionsOf(api, projectId);
    const unready = sections.filter((x) => !isComplete(x) || x.stale).map((x) => x.sectionKey);
    expect(sections.length === 21 && unready.length === 0, `sections not complete and current: ${unready.join(', ')}`, sections.length);

    const approvals = {};
    for (const section of sections) {
      const key = section.sectionKey;
      const r = await approveSection(ctx, signer, { projectId, sectionKey: key, reason: `Section ${key} reviewed against its source records and approved for filing.` });
      approvals[key] = r.status;
      expect(r.status === 200, `the approval of ${key} expected 200, got ${r.status}`, r.json);
    }
    const gate = await api('POST', `/api/cmc/module3-os/guard/final-export/${projectId}`, {});
    attach('gate-every-blocker-cleared.json', { status: gate.status, body: gate.json ?? {}, approvals });
    expect(gate.status === 200, `the final-export gate with every section approved expected 200, got ${gate.status}`, gate.json);

    const submissions = await api('GET', '/api/submissions');
    const rows = Array.isArray(dataOf(submissions)) ? dataOf(submissions) : [];
    const programmeOf = (x) => String(x.programId ?? x.projectId ?? x.project_id);
    const own = rows.find((x) => programmeOf(x) === String(projectId));
    const other = rows.find((x) => programmeOf(x) !== String(projectId));
    expect(Boolean(own), 'the programme has no submission to place into', rows.length);
    const seq = await api('POST', `/api/submissions/${own.id}/sequences`, { region: 'fda', sequenceNumber: '0001', type: 'original' });
    expect([200, 201].includes(seq.status), `the sequence create expected 200/201, got ${seq.status}`, seq.json);
    const sequenceId = dataOf(seq).id;
    Object.assign(state.complete, { submissionId: own.id, sequenceId });
    state.sequenceId = sequenceId;
    state.submissionId = own.id;
    const leaves = async () => leafCount(await api('GET', `/api/submissions/sequences/${sequenceId}/leaves`));
    const place = `/api/cmc/module3-os/place-into-submission/${projectId}`;
    const target = { submissionId: own.id, sequenceId, reason: 'Placing the approved Module 3 into sequence 0001 for filing.' };

    expect(Boolean(other), 'the organisation has no other submission to observe the refusal with', rows.length);
    const foreign = await postAsSigner(ctx, signer, place, { ...target, submissionId: other.id });
    const afterForeign = await leaves();
    expect([400, 403, 404, 409].includes(foreign.status) && afterForeign === 0,
      `a placement naming another submission expected a refusal and no leaf, got ${foreign.status} and ${afterForeign} leaf/leaves`, foreign.json);

    const placed = await postAsSigner(ctx, signer, place, target);
    attach('placement.json', placed.json ?? {});
    expect(placed.status === 200, `the placement expected 200, got ${placed.status}`, placed.json);
    const written = await leaves();
    const placements = dataOf(placed).placements ?? [];
    expect(written === sections.length && placements.length === sections.length,
      `expected one leaf per section (${sections.length}); placements ${placements.length}, leaves ${written}`, placed.json);

    const again = await postAsSigner(ctx, signer, place, target);
    const afterRepeat = await leaves();
    const repeated = dataOf(again).placements ?? [];
    attach('placement-repeat.json', { status: again.status, leaves: afterRepeat, updatedInPlace: repeated.filter((x) => x.updatedInPlace).length,
      newFilingDocuments: repeated.filter((x, i) => x.coauthorDocumentId !== placements[i]?.coauthorDocumentId).length });
    expect(again.status === 200 && afterRepeat === written, `the repeat expected 200 and no further leaf: ${again.status}, ${written} → ${afterRepeat}`, again.json);
    return `21 sections approved; gate 200; another submission ${foreign.status} with no leaf; placed ${written} leaves, one per section; ` +
      `the repeat ${again.status} with ${afterRepeat} leaves still (each leaf updated in place)`;
  },
);

await step(
  {
    id: 'OQ-CMC-20',
    urs: ['URS-CMC-011'],
    title: 'Placement requires the regulatory-author role',
    action: 'as the viewer, who holds no regulatory-author role: place',
    expected: '403; no leaf written',
    dependsOn: ['OQ-CMC-19'],
    note: 'v0.11: the placement is the member\'s (OQ_MEMBER). Until v0.10 it was sent with the run session. v0.12: the placement is the viewer\'s (OQ_VIEWER). An organisation member holds the regulatory-author role (ORG_ROLE_FUNCTIONAL_GRANTS, server/middleware/auth.ts), so the member was the wrong identity for a refusal. v0.13: the step acts on the second programme and its sequence, where a placement would otherwise succeed; until v0.12 it acted on a programme the gate refused in any case.',
  },
  async ({ api, apiAs, expect, deviation, baseUrl }) => {
    const { projectId, submissionId, sequenceId } = state.complete;
    const viewer = await requireIdentity({ deviation, expect }, baseUrl, 'OQ_VIEWER', 'an identity without the regulatory-author role is needed to observe the refusal.');
    const before = leafCount(await api('GET', `/api/submissions/sequences/${sequenceId}/leaves`));
    const r = await apiAs(viewer.session)('POST', `/api/cmc/module3-os/place-into-submission/${projectId}`, {
      submissionId, sequenceId, reason: 'Attempting a placement without the role.',
    });
    expect([401, 403].includes(r.status), `expected 403, got ${r.status}`, r.json);
    const after = leafCount(await api('GET', `/api/submissions/sequences/${sequenceId}/leaves`));
    expect(after === before, `the refused placement wrote leaves: ${before} → ${after}`, { before, after });
    return `${r.status} ${errCode(r) ?? ''}; leaves ${before} → ${after}`.trim();
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
    /* v0.11: the release states its decision, which the route has required since before this protocol
       (batchRecordRoutes.ts, approved | rejected | conditional); v0.10 sent none and was answered 400. */
    const noResults = await postAsSigner(ctx, signer, `/api/cmc/batch-records/${batchId}/release`, {
      reason: 'Releasing before any QC result is recorded.', meaning: 'approval', decision: 'approved',
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
    action: 'as the signer, validate the specification\'s analytical method on its register; approve the specification; then widen its limits without a reason, then with one',
    expected: 'the method validated 200; the approval 200; 422 without a reason; with one, the edit lands and the approval is withdrawn',
    dependsOn: ['OQ-CMC-03'],
    note: 'v0.11: since d9060a85e2 (2026-11-08, F1) and P-110 item 1 (2026-11-09) a specification is approved only when the method it names is in the project\'s register and validated, or shown suitable, under signature; the step validates OQ-CMC-03\'s method through the register\'s signed Validate act first. Until v0.10 the approval was the first act.',
  },
  async (ctx) => {
    const { api, expect } = ctx;
    const signer = state.signer ?? (await requireSigner(ctx, ctx.baseUrl));
    const specId = state.records?.specification;
    const methodId = state.records?.analyticalMethod;
    expect(Boolean(specId && methodId), 'the prerequisite recorded no specification or method', state.records);
    const validated = await postAsSigner(ctx, signer, `/api/cmc/analytical-methods/${methodId}/validate`, {
      reason: 'ICH Q2(R2) validation package reviewed and accepted.', meaning: 'approval',
    });
    expect(validated.status === 200, `the method validation expected 200, got ${validated.status}`, validated.json);
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
    return `method validated 200; approved 200; edit with no reason 422; with a reason 200 and the approval withdrawn (${status})`;
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
