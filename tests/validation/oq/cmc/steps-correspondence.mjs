/**
 * OQ-008 step OQ-CMC-42: URS-CMC-030, agency questions on Module 3 are the
 * letter's record (2026-10-19; decisions P-38 and P-39 item 1).
 *
 * CMC kept its own agency-question file (reg_questions, /api/cmc/agency-questions)
 * in which a question was logged, triaged and CLOSED by a status update, with
 * no signature and no reason. The questions have one home, the letter they
 * came in, where a response is approved by a Part 11 signature; CMC reads
 * them from there and writes nothing about them
 * (docs/evidence/D2-CMC-QUESTIONS-ONTO-INBOX/2026-10-19/).
 *
 * The runner finds its step modules by their `from './*.mjs'` imports
 * (ci:validation-traceability), so this module is imported by run.mjs and
 * chains its marker after steps-attribution.mjs, the order the steps run in.
 */
import { step, state } from './context.mjs';
import { dataOf, errCode } from './signed-acts.mjs';
import { ATTRIBUTION_STEPS } from './steps-attribution.mjs';

const REASON = 'OQ-CMC-42: recording the information request as the agency worded it.';

/**
 * The database half, on the runtime role's own connection: the refusal under
 * test is the grant's and the trigger's, and an owner session would meet only
 * the trigger. `WHERE false` reaches no row: what is under test is whether the
 * role may issue the statement at all.
 */
async function runtimeRoleRefusals(connectionString) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString });
  await client.connect();
  const observed = {};
  /* Each probe runs in a transaction that is rolled back, so a role that WAS
     allowed (the failure this step exists to catch) changes nothing. DELETE
     and TRUNCATE are probed too: URS-CMC-030 says the file refuses every
     write (review of 2026-10-19). */
  for (const [label, sql] of Object.entries({
    'reg_questions.INSERT': `INSERT INTO reg_questions (organization_id, question_text, status) VALUES (0, 'OQ probe.', 'OPEN')`,
    'reg_questions.UPDATE': 'UPDATE reg_questions SET status = status WHERE false',
    'reg_questions.DELETE': 'DELETE FROM reg_questions WHERE false',
    'reg_questions.TRUNCATE': 'TRUNCATE reg_questions CASCADE',
  })) {
    await client.query('BEGIN');
    try {
      await client.query(sql);
      observed[label] = 'ALLOWED';
    } catch (e) {
      observed[label] = `refused: ${e.code ?? e.message}`;
    } finally {
      await client.query('ROLLBACK').catch(() => {});
    }
  }
  await client.end();
  return observed;
}

await step(
  {
    id: 'OQ-CMC-42',
    urs: ['URS-CMC-030'],
    title: 'Agency questions on Module 3 are the letter\'s record; the earlier CMC file is read-only',
    action:
      'POST and PATCH /api/cmc/agency-questions; as the runtime role, INSERT, UPDATE, DELETE and TRUNCATE on reg_questions (each rolled back); ' +
      'log a response-required letter on the programme and record a question on it at §3.2.P.7; set its owner to a member of the ' +
      'organisation with a reason; read the programme\'s Module 3 questions',
    expected:
      '410 CMC_QUESTION_FILE_READ_ONLY twice with the earlier file unchanged; the runtime role refused by the database; ' +
      '201 for the question; 200 for the owner; the Module 3 read lists it at §3.2.P.7 from the question, unanswered, not overdue, ' +
      'with that owner',
    dependsOn: ['OQ-CMC-03'],
  },
  async ({ api, expect, attach, deviation }) => {
    const before = await api('GET', '/api/cmc/agency-questions');
    expect(before.status === 200, `the earlier file's read expected 200, got ${before.status}`, before.json);
    const post = await api('POST', '/api/cmc/agency-questions', { questionText: 'OQ probe question.', sectionReference: '3.2.P.7' });
    const patch = await api('PATCH', '/api/cmc/agency-questions/1', { status: 'CLOSED' });
    expect(post.status === 410 && errCode(post) === 'CMC_QUESTION_FILE_READ_ONLY', `the legacy POST expected 410, got ${post.status}`, post.json);
    expect(patch.status === 410 && errCode(patch) === 'CMC_QUESTION_FILE_READ_ONLY', `the legacy PATCH expected 410, got ${patch.status}`, patch.json);
    const after = await api('GET', '/api/cmc/agency-questions');
    expect(
      JSON.stringify(after.json?.meta ?? null) === JSON.stringify(before.json?.meta ?? null),
      'the earlier file changed across the refused writes',
      { before: before.json?.meta, after: after.json?.meta },
    );

    const projectId = state.projectId;
    const letters = `/api/concept2cure/projects/${encodeURIComponent(projectId)}/agency-communications`;
    const logged = await api('POST', letters, {
      sourceType: 'uploaded_official_correspondence',
      communicationType: 'OQ-CMC-42 information request',
      sourceChannel: 'esg',
      urgency: 'high',
      responseRequired: true,
      dueDate: '2099-12-31T00:00:00.000Z',
      visibilityTier: 'shared_client_c2c',
    });
    expect(logged.status === 200, `the letter expected 200, got ${logged.status}`, logged.json);
    const letterId = dataOf(logged).id;
    const recorded = await api('POST', `${letters}/${encodeURIComponent(letterId)}/questions`, {
      questionRef: 'Q1',
      questionText: 'Provide the container closure integrity data for the 100-count bottle.',
      discipline: 'CMC',
      ctdSection: '3.2.P.7',
      reason: REASON,
    });
    expect(recorded.status === 201, `the question expected 201, got ${recorded.status}`, recorded.json);
    const questionId = dataOf(recorded).id;

    /* Who owns the response is set on the letter, with a reason (it replaces
       the free-text assignment CMC kept on its read-only file). */
    const team = await api('GET', `/api/concept2cure/projects/${encodeURIComponent(projectId)}/team`);
    expect(team.status === 200 && (dataOf(team) ?? []).length > 0, `the organisation's members expected, got ${team.status}`, team.json);
    const ownerUserId = Number(dataOf(team)[0].userId);
    const owned = await api('PATCH', `${letters}/${encodeURIComponent(letterId)}/questions/${questionId}/owner`, { ownerUserId, reason: REASON });
    expect(owned.status === 200 && dataOf(owned).ownerUserId === ownerUserId, `the owner expected 200, got ${owned.status}`, owned.json);

    const view = await api('GET', `/api/concept2cure/projects/${encodeURIComponent(projectId)}/agency-questions?ctdModule=3`);
    expect(view.status === 200, `the Module 3 read expected 200, got ${view.status}`, view.json);
    const listed = (dataOf(view).questions ?? []).find((q) => q.id === questionId);
    expect(Boolean(listed), 'the recorded question is not in the Module 3 read', dataOf(view));
    expect(
      listed.section === '3.2.P.7' && listed.sectionSource === 'question' && listed.state === 'unanswered' && listed.overdue === false
        && listed.owner?.userId === ownerUserId,
      'the Module 3 read does not show the question at §3.2.P.7, unanswered, not overdue, with its owner',
      listed,
    );
    attach('module3-read.json', { listed, summary: dataOf(view).summary, withheld: dataOf(view).withheld });

    const connectionString = process.env.DATABASE_URL_RUNTIME;
    if (!connectionString) {
      deviation('not executed in full — DATABASE_URL_RUNTIME (the non-owner runtime role) not supplied; the database refusal of reg_questions writes cannot be observed from an owner session. The route half above passed.');
    }
    const observed = await runtimeRoleRefusals(connectionString);
    attach('read-only.json', observed);
    const allowed = Object.entries(observed).filter(([, v]) => v === 'ALLOWED').map(([k]) => k);
    expect(allowed.length === 0, `the runtime role may still write the earlier file: ${allowed.join(', ')}`, observed);
    return `legacy POST ${post.status}, PATCH ${patch.status}; ${Object.entries(observed).map(([k, v]) => `${k} ${v}`).join('; ')}; question ${questionId} listed at §3.2.P.7, unanswered`;
  },
);

/** @see ATTRIBUTION_STEPS — the chain that serialises these modules. */
export const CORRESPONDENCE_STEPS = `${ATTRIBUTION_STEPS} → steps-correspondence.mjs`;
