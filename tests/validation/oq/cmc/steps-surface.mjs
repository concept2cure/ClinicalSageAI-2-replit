/**
 * OQ-008 steps OQ-CMC-25…33 and the ad-hoc OQ-CMC-31: the screens, the
 * interview boundary, the release-signature binding, dispatch readiness, the
 * API allowlist, the orchestrator's governed load, and the two controls landed
 * on 2026-10-18 — who recorded each register row (URS-CMC-021) and that the
 * approver is not one of them (URS-CMC-022).
 */
import { step, state, BROWSERLESS } from './context.mjs';
import { requireSigner } from '../../lib/credentials.mjs';
import { serverIsDevelopment } from '../../lib/harness.mjs';
import { approveSection, completeUnapprovedKey, dataOf, errCode, errDetail, postAsSigner, runReauth } from './signed-acts.mjs';
import { FILING_STEPS } from './steps-filing.mjs';
import {
  everySectionUnchanged, gateNamesStaleSections, module3RequirementFindings, releaseClears, sectionsOwingApproval,
} from './complete-programme.mjs';

await step(
  {
    id: 'OQ-CMC-25',
    urs: ['URS-CMC-015'],
    kind: 'unscripted',
    title: 'The Overview and Module 3 build screens tell the truth about their own state',
    action: 'load the CMC screens for the programme, and for a programme with nothing recorded',
    expected: 'the approvals, portfolio, build state and the gate’s own readiness verdict are shown; an uncomputed figure says so; a never-swept programme is not reported as swept and clear',
    dependsOn: ['OQ-CMC-06'],
  },
  async (ctx) => {
    if (BROWSERLESS) {
      ctx.deviation('not executed — this run has no browser (VALIDATION_NO_BROWSER=1); the screens cannot be read, so nothing is observed about what they claim.');
    }
    await ctx.newPage(null);
    await ctx.goto('/concept2cure/cmc');
    await ctx.screenshot('overview');
    await ctx.goto(`/concept2cure/cmc/module3?project=${state.emptyProjectId ?? ''}`);
    await ctx.screenshot('empty-programme');
    return 'screens captured for the recorded and the empty programme; the reviewer reads the screenshots';
  },
);

await step(
  {
    id: 'OQ-CMC-26',
    urs: ['URS-CMC-016'],
    title: 'Only the interview that commits is offered',
    action: 'read the deployment posture, then start the CMC interview and an interview of a kind that reaches no record',
    expected: 'the CMC interview starts; the other interview is refused LAUNCH_SCOPE, naming where its answers would have gone',
  },
  async (ctx) => {
    const { api, attach, deviation } = ctx;
    /* The interview is an AnA tool (`start_intelligence_flow`,
       services/ana/AnaToolDefinitions.ts) and its refusal is the tool
       dispatcher's launch-scope rule (AnaToolExecutor `preHandlerRefusal`,
       rule L). NEITHER IS AN HTTP ROUTE: there is no POST
       /api/ana/tools/<name> anywhere in server/, and no screen calls one —
       the only way to either is an AnA conversation turn. So the step reads
       the two preconditions a turn needs instead of pretending to drive one.

       The third smoke run of this protocol posted to
       /api/ana/tools/start_intelligence_flow, read the 404 that any
       nonexistent route answers, and recorded `cmc 404; protocol 404` as a
       PASS of URS-CMC-016 — a 404 from a route that does not exist observes
       nothing about the control, and the assertion (`proto.status >= 400`)
       was satisfied by that same 404. */
    const ready = await api('GET', '/readyz');
    const ana = ready.json?.dependencies?.ana ?? 'unknown';
    const catalog = await api('GET', '/api/module-subscriptions/catalog');
    const enforced = catalog.json?.launchScope?.enforced === true;
    attach('posture.json', { anaDependency: ana, anaDetail: ready.json?.anaDetail ?? null, launchScopeEnforced: enforced });
    if (ana !== 'ok' || !enforced) {
      const why = [
        ana !== 'ok' ? `no AI provider is configured (/readyz reports ana ${ana}), so every AnA turn answers 503 GATEWAY_UNAVAILABLE and no interview starts` : null,
        enforced ? null : 'LAUNCH_SCOPE_ENFORCE is off, so the dispatcher does not refuse a tool outside the release',
      ].filter(Boolean).join('; and ');
      deviation(
        `not executed — the interview and its refusal are both reachable only through an AnA turn, and ${why}. ` +
          'Observe this under the W3 posture with a provider configured.',
        { anaDependency: ana, launchScopeEnforced: enforced },
      );
    }
    return `ana ${ana}; launch scope enforced ${enforced}`;
  },
);

/**
 * The product's shelf life changes (OQ-CMC-27): approved sections that cite the study go stale and the gate refuses;
 * after the compile, what lost its approval is approved again and the gate passes. Returns the gate's answer while
 * the sections were stale, and the sections re-approved.
 */
async function changeShelfLifeAndReapprove(ctx, signer, { projectId, records }) {
  const { api, expect } = ctx;
  const gate = () => api('POST', `/api/cmc/module3-os/guard/final-export/${projectId}`, {});
  const edit = await api('PUT', `/api/cmc/stability-studies/${records.stabilityDrugProduct}`, {
    shelfLife: '18 months when stored at or below 25 C', reason: 'Shelf life shortened after the 18-month time point.',
  });
  expect(edit.status === 200, `the shelf-life edit expected 200, got ${edit.status}`, edit.json);
  const staleGate = await gate();
  expect(gateNamesStaleSections(staleGate), `the gate with approved sections made stale expected 409 naming them, got ${staleGate.status}`, staleGate.json);
  const compile = await api('POST', `/api/cmc/module3-os/compile/${projectId}`, {});
  expect(compile.status === 200, `the compile expected 200, got ${compile.status}`, compile.json);
  const owed = await sectionsOwingApproval(api, projectId);
  expect(owed.length >= 1, 'the edit left every section approved after the compile', owed);
  const unapproved = await gate();
  expect(unapproved.status === 409, `the gate with ${owed.length} section(s) to re-approve expected 409, got ${unapproved.status}`, unapproved.json);
  for (const key of owed) {
    const r = await approveSection(ctx, signer, { projectId, sectionKey: key, reason: `Section ${key} re-approved after the shelf life changed.` });
    expect(r.status === 200, `the re-approval of ${key} expected 200, got ${r.status}`, r.json);
  }
  const clear = await gate();
  expect(clear.status === 200, `the gate after re-approval expected 200, got ${clear.status}`, clear.json);
  const d = staleGate.json.data;
  return { owed, staleGate: { status: staleGate.status, error: staleGate.json.error, staleSections: d.staleSections, driftedApprovedSections: d.driftedApprovedSections } };
}

await step(
  {
    id: 'OQ-CMC-27',
    urs: ['URS-CMC-017'],
    title: 'A release signature covers the manifest that would be transmitted',
    action: 'as the signer, sign the second programme’s sequence for dispatch; place Module 3 again unchanged; then change the product’s shelf life, read the gate, compile, re-approve what lost its approval, and place; read the release verdict at each point',
    expected: 'signed and bound to the current leaf manifest; an unchanged placement leaves it clearing; the edit makes approved sections stale and the gate refuses until they are re-approved; once the changed section is placed the signature no longer clears the sequence, and the verdict says to sign the current content',
    dependsOn: ['OQ-CMC-19'],
    note: 'v0.13: executed for the first time; until v0.12 the step posted to /api/submissions/sequences/:id/sign-release, which is no route (a release is a governed signature, POST /api/c2c/actions/sign, intent `dispatch`). v0.14: the content is changed the way a programme changes it. In v0.13 the step placed the same Module 3 again, which then rewrote every filing document; since the 2026-11-11 repair an unchanged placement writes nothing, and the step asserts that too. The gate\'s answer with approved sections made stale is attached (URS-CMC-010\'s stale case).',
  },
  async (ctx) => {
    const { api, expect, attach } = ctx;
    const signer = state.signer ?? (await requireSigner(ctx, ctx.baseUrl));
    const { projectId, submissionId, sequenceId } = state.complete;
    const release = async () => (await api('GET', `/api/submissions/sequences/${sequenceId}/dispatch-readiness`)).json.releaseSignature;
    const place = (reason) => postAsSigner(ctx, signer, `/api/cmc/module3-os/place-into-submission/${projectId}`, { submissionId, sequenceId, reason });

    const unsigned = await release();
    expect(unsigned.cleared === false, 'the sequence read as released before anyone signed it', unsigned);
    const sign = await postAsSigner(ctx, signer, '/api/c2c/actions/sign', {
      target: `ectd-sequence:${sequenceId}`, reason: 'Releasing sequence 0001 for transmission.', payload: { intent: 'dispatch', meaning: 'approval' },
    });
    expect(sign.status === 200, `the release signature expected 200, got ${sign.status}`, sign.json);
    const signed = await release();
    expect(releaseClears(signed), `the signed sequence expected a clearing release, got ${signed.verdict}`, signed);

    // The same Module 3 placed again: nothing is written, so the signature still covers the sequence.
    const same = await place('Placing Module 3 again; nothing has changed.');
    expect(everySectionUnchanged(same), 'an unchanged placement was not reported unchanged for every section', same.json);
    const afterSame = await release();
    expect(releaseClears(afterSame), `an unchanged placement stopped the signature clearing the sequence (${afterSame.verdict})`, afterSame);
    expect(afterSame.signatureId === signed.signatureId, 'the release rests on another signature after an unchanged placement', afterSame);

    // A real change, re-approved, then placed: the signed manifest is no longer the sequence's.
    const { owed, staleGate } = await changeShelfLifeAndReapprove(ctx, signer, state.complete);
    const placed = await place('Placing the revised Module 3 after the shelf life changed.');
    expect(placed.status === 200, `the placement of changed content expected 200, got ${placed.status}`, placed.json);
    const rows = dataOf(placed).placements;
    const refiled = rows.filter((x) => x.updatedInPlace).map((x) => x.sectionKey);
    expect(refiled.length >= 1, 'the placement of changed content filed no section again', placed.json);
    const after = await release();
    attach('release-signature.json', {
      unsigned, signed, afterUnchangedPlacement: afterSame, afterChangedPlacement: after, refiled,
      unchanged: rows.filter((x) => x.unchanged).length, gateWithStaleSections: staleGate, reapproved: owed,
    });
    expect(!releaseClears(after), `the signature still clears the sequence after its content changed (${after.verdict})`, after);
    expect(/sign/i.test(String(after.detail)), 'the verdict does not say to sign the current content', after);
    return `signed and bound to the current leaf manifest (signature ${signed.signatureId}); an unchanged placement left it clearing; the shelf-life edit made ` +
      `${staleGate.staleSections} approved section(s) stale and the gate 409; ${owed.join(', ')} re-approved, gate 200; ${refiled.join(', ')} filed again; ` +
      `then: ${after.verdict}, not cleared — ${after.detail}`;
  },
);

await step(
  {
    id: 'OQ-CMC-28',
    urs: ['URS-CMC-018'],
    title: 'An original IND carrying no 3.2.S and no 3.2.P is not dispatch-ready',
    action: 'read the dispatch verdict of the first programme’s original IND sequence, which carries no Module 3; then of the second programme’s, where Module 3 is placed',
    expected: 'blocked for 3.2.S and for 3.2.P, citing 21 CFR 312.23(a)(7) and (b) and naming both remedies; no such finding once Module 3 is placed',
    dependsOn: ['OQ-CMC-19'],
    note: 'v0.13: executed for the first time, on two live sequences. The third case the row names, clearance by a cross-referenced Drug Master File with its Letter of Authorization, is not executed and is owed.',
  },
  async ({ api, expect, attach }) => {
    const submissions = await api('GET', '/api/submissions');
    const rows = Array.isArray(dataOf(submissions)) ? dataOf(submissions) : [];
    const own = rows.find((x) => String(x.programId ?? x.projectId ?? x.project_id) === String(state.projectId));
    expect(Boolean(own), 'the first programme has no submission', rows.length);
    const seq = await api('POST', `/api/submissions/${own.id}/sequences`, { region: 'fda', sequenceNumber: '0001', type: 'original' });
    expect([200, 201].includes(seq.status), `the sequence create expected 200/201, got ${seq.status}`, seq.json);
    const read = async (sequenceId) => {
      const r = await api('GET', `/api/submissions/sequences/${sequenceId}/dispatch-readiness`);
      expect(r.status === 200, `the readiness read expected 200, got ${r.status}`, r.json);
      return r.json ?? {};
    };
    const without = await read(dataOf(seq).id);
    const required = module3RequirementFindings(without);
    const withModule3 = await read(state.complete.sequenceId);
    const stillRequired = module3RequirementFindings(withModule3);
    attach('dispatch-readiness.json', { withoutModule3: { gate: without.gate, findings: required }, withModule3: { gate: withModule3.gate, findings: stillRequired } });
    const headings = required.map((f) => f.sectionCode).sort();
    expect(headings.join(',') === '3.2.P,3.2.S', `expected a blocking finding for 3.2.S and for 3.2.P, got ${headings.join(',') || 'none'}`, required);
    for (const f of required) {
      const m = String(f.message ?? '');
      expect(f.severity === 'error' && /312\.23\(a\)\(7\)/.test(m) && /312\.23\(b\)/.test(m), `the ${f.sectionCode} finding does not cite 21 CFR 312.23(a)(7) and (b)`, f);
      expect(/place Module 3/i.test(m) && /Letter of Authorization/i.test(m), `the ${f.sectionCode} finding does not name both remedies`, f);
    }
    expect(without.gate?.cleared === false, 'the sequence with no Module 3 read dispatch-clear', without.gate);
    expect(stillRequired.length === 0, 'the sequence that carries Module 3 is still asked for it', stillRequired);
    return 'with no Module 3: blocked for 3.2.S and 3.2.P, each citing 21 CFR 312.23(a)(7) and (b) and naming both remedies; with Module 3 placed: no such finding';
  },
);

await step(
  {
    id: 'OQ-CMC-29',
    urs: ['URS-CMC-019'],
    title: 'The surface claims only the paths its screens call',
    action: 'with launch scope enforced: a path the CMC screens call, and a path under /api/cmc that no screen claims',
    expected: 'the called path served; the unclaimed path 403 LAUNCH_SCOPE',
    dependsOn: ['OQ-CMC-03'],
  },
  async (ctx) => {
    const { api, expect, attach, deviation } = ctx;
    const called = await api('GET', `/api/cmc/drug-substances?projectId=${state.projectId}`);
    expect(called.status === 200, `a claimed path expected 200, got ${called.status}`, called.json);
    /* The probe has to be a path NO entry of the surface registry claims.
       /api/cmc/variations/classify (the third smoke run's probe) and
       /api/cmc/projects/:id/process-capability (the probe until v0.11) are
       both claimed today, so each was served and said nothing about launch
       scope. At 97a0fec5cf every route the core CMC router registers is
       claimed (launchScopeApiVerdict, services/entitlements/launch-scope-api.ts:
       66 of 66 `launch`), so no served route is left to probe. The surface
       does not claim the root: /api/cmc/unclaimed-probe names no register, the
       verdict for it is `unmapped`, and the gate answers before routing. */
    const unclaimed = await api('GET', '/api/cmc/unclaimed-probe');
    const catalog = await api('GET', '/api/module-subscriptions/catalog');
    const enforced = catalog.json?.launchScope?.enforced === true;
    attach('launch-scope.json', { launchScopeEnforced: enforced, unclaimedStatus: unclaimed.status, unclaimedBody: unclaimed.json ?? null });
    if (!enforced) {
      deviation(
        `partly executed — a claimed path is served (200), but LAUNCH_SCOPE_ENFORCE is off on this deployment, so the unclaimed path was served too ` +
          `(${unclaimed.status}) instead of refused. The refusal is a production control; observe it under the W3 posture.`,
        { launchScopeEnforced: enforced, unclaimedStatus: unclaimed.status },
      );
    }
    /* v0.12: no deviation here. Until v0.11 a served probe was recorded as "this deployment sets
       LAUNCH_SCOPE_API_UNATTRIBUTED=report", a posture the step never read: on 2026-11-10 the server ran
       enforce and the probe was served because it was claimed. An unclaimed path that is not refused under
       enforced launch scope is a failure, with what was answered. */
    expect(
      unclaimed.status === 403 && errCode(unclaimed) === 'LAUNCH_SCOPE',
      `an unclaimed path expected 403 LAUNCH_SCOPE, got ${unclaimed.status} ${errCode(unclaimed) ?? ''}`.trim(),
      unclaimed.json,
    );
    return `claimed 200; unclaimed 403 LAUNCH_SCOPE`;
  },
);

await step(
  {
    id: 'OQ-CMC-30',
    urs: ['URS-CMC-020'],
    title: 'A submission package carries Module 3 only when the gate is open',
    action: 'an orchestrator run carrying inline CMC data, then a run over the programme',
    expected: 'inline data 400 INLINE_CMC_SOURCES_REFUSED; the run composes no Module 3 and says the gate refused it',
    dependsOn: ['OQ-CMC-06'],
  },
  async (ctx) => {
    const { api, expect } = ctx;
    const inline = await api('POST', '/api/submission-orchestrator/runs', {
      cmcSources: [{ sourceType: 'drug_substance', sourcePayload: { substanceName: 'INLINE' } }],
    });
    /* `refusedInlineCmcSources` returns false on a development server
       (server/routes/submission-orchestrator.ts): inline sources are a
       development affordance by design, and the refusal is a production
       control. A run outside the W3 posture therefore cannot observe it, and
       says so rather than reporting the development behaviour as a pass — the
       first smoke run of this protocol read `invalid_request` here and called
       it a failure of the control, which it was not. Since v0.11 the deviation
       is recorded only on a server that says it is a development build
       (serverIsDevelopment); anywhere else a missing refusal is a failure. */
    if (errCode(inline) !== 'INLINE_CMC_SOURCES_REFUSED' && (await serverIsDevelopment(ctx.baseUrl))) {
      ctx.deviation(
        `not executed — this is a development server (its CSP is report-only), which allows inline cmcSources (it answered ${inline.status} ${errCode(inline)}), the documented development behaviour. ` +
          'The refusal is a production control; observe it on a production build.',
        inline.json,
      );
    }
    expect(inline.status === 400, `an inline-CMC run expected 400, got ${inline.status}`, inline.json);
    const run = await api('POST', '/api/submission-orchestrator/runs', { projectId: state.projectId });
    const text = JSON.stringify(run.json ?? {});
    const named = /m3Refusal|cmcExportGate/.test(text) ? ' naming the gate refusal' : '';
    return `inline 400 INLINE_CMC_SOURCES_REFUSED; run ${run.status}${named}`;
  },
);

await step(
  {
    id: 'OQ-CMC-32',
    urs: ['URS-CMC-021'],
    title: 'Every register create names the person who recorded it',
    action: 'read the chained audit ledger after the prerequisite\u2019s writes',
    expected: 'one row per recorded row, naming the operator and the record; none anonymous; the chain verifies',
    dependsOn: ['OQ-CMC-03'],
  },
  async ({ api, expect, attach }) => {
    /* Read through the product's own ledger, not the database: what an
       inspector can actually see is what this asserts.

       GET /api/audit-trail/ledger (routes/audit-trail-ledger.routes.ts) is the
       route that serves the hash-chained `audit_logs` store, projected as
       { event, target, actor, actorRef, hash, prevHash, seq } with the chain's
       own verification in meta.chain. It is NOT /api/audit/logs, which reads
       the separate `audit_events` table and carries no register create — the
       first smoke run of this protocol read that one and reported a gap that
       does not exist. */
    const ledger = await api('GET', '/api/audit-trail/ledger?limit=1000');
    expect(ledger.status === 200, `the ledger read expected 200, got ${ledger.status}`, ledger.json);
    const body = ledger.json ?? {};
    const rows = Array.isArray(body.data) ? body.data : [];
    const creates = rows.filter((r) => /register\s*create/i.test(String(r.event ?? '')));
    attach('register-create-ledger.json', { chain: body.meta?.chain, sources: body.sources, creates: creates.slice(0, 60) });
    expect(creates.length > 0, 'the ledger shows no register create at all', rows.slice(0, 5));

    /* Every record the prerequisite created must appear, by its own id, and
       every such row must name who recorded it. */
    const created = Object.entries(state.records ?? {});
    const missing = [];
    for (const [register, id] of created) {
      const row = creates.find((r) => String(r.target ?? '').endsWith(`:${id}`));
      if (!row) missing.push(`${register} (${id})`);
    }
    expect(missing.length === 0, `no register-create row names: ${missing.join(', ')}`, { created, found: creates.length });
    const anonymous = creates.filter((r) => !r.actorRef && !r.actor);
    expect(anonymous.length === 0, `${anonymous.length} register create(s) name no operator`, anonymous.slice(0, 5));

    /* The tamper-evidence half of URS-CMC-021: the chain the rows joined
       verifies, over every row the ledger walked. */
    const chain = body.meta?.chain ?? {};
    expect(chain.ok === true, `the audit chain did not verify (${JSON.stringify(chain).slice(0, 200)})`, chain);
    return `${created.length}/${created.length} records named by a register-create row; ${creates.length} rows, none anonymous; chain ok over ${chain.rowsChecked} row(s) of ${chain.store}`;
  },
);

await step(
  {
    id: 'OQ-CMC-33',
    urs: ['URS-CMC-022'],
    title: 'The approver is not one of the people who entered the records',
    action: 'as the author who recorded the registers: approve a section; then with the meaning authorship',
    expected: '403 SEPARATION_OF_DUTIES naming why; then 400 APPROVAL_IS_NOT_AUTHORSHIP; nothing signed either time',
    dependsOn: ['OQ-CMC-06'],
  },
  async (ctx) => {
    const { api, expect, deviation } = ctx;
    const key = completeUnapprovedKey(state.sections, state.approvedKey);
    if (!key) deviation('not executed — the compile left no complete section beside the approved one, so a self-approval would meet the completeness refusal first.', state.sectionKeys);
    const path = `/api/cmc/module3-os/sections/${state.projectId}/${encodeURIComponent(key)}/approve`;

    /* The authorship-meaning refusal comes FIRST in the route, before the
       password is asked for, so it is observable with no credential. */
    const authorship = await api('POST', path, {
      reason: 'Signing as the author of the records.', meaning: 'authorship', reauth: { password: 'not-reached' },
    });
    expect(authorship.status === 400, `an authorship meaning expected 400, got ${authorship.status}`, authorship.json);
    expect(
      errCode(authorship) === 'APPROVAL_IS_NOT_AUTHORSHIP',
      `expected APPROVAL_IS_NOT_AUTHORSHIP, got ${errCode(authorship)}`,
      authorship.json,
    );

    /* The independence check runs inside the approval transaction, which is
       AFTER re-authentication — identity, then authority, then independence.
       So a wrong password answers 401 and the separation-of-duties refusal is
       never reached: the first smoke run of this protocol read that 401 and
       called the control broken, which it was not. Observing the 403 needs the
       author's OWN password (OQ_RUN_PASSWORD, tests/validation/lib/credentials.mjs). */
    const authorPassword = process.env.OQ_RUN_PASSWORD;
    if (!authorPassword) {
      deviation(
        'partly executed — the authorship-meaning refusal was observed (400 APPROVAL_IS_NOT_AUTHORSHIP), but OQ_RUN_PASSWORD was not supplied, ' +
          'so the run identity could not re-authenticate and the separation-of-duties refusal (which the route reaches only after re-authentication) was not observed.',
        { authorshipRefusal: errCode(authorship) },
      );
    }
    /* The run identity recorded every register row in OQ-CMC-03, so its own
       approval is exactly the self-approval the control refuses. */
    const self = await api('POST', path, {
      reason: 'Approving the section whose records I entered myself.', meaning: 'approval', reauth: await runReauth(),
    });
    expect(self.status === 403, `a self-approval expected 403, got ${self.status}`, self.json);
    expect(errCode(self) === 'SEPARATION_OF_DUTIES', `expected SEPARATION_OF_DUTIES, got ${errCode(self)}`, self.json);
    expect(/author of this record/i.test(String(errDetail(self))), 'the refusal does not say why', errDetail(self));

    const read = await api('GET', `/api/cmc/module3-os/sections/${state.projectId}/${encodeURIComponent(key)}`);
    expect(dataOf(read).approvalState !== 'approved', 'a refused approval still approved the section', read.json);
    return `self-approval 403 SEPARATION_OF_DUTIES; authorship meaning 400 APPROVAL_IS_NOT_AUTHORSHIP; §${key} still ${dataOf(read).approvalState}`;
  },
);

await step(
  {
    id: 'OQ-CMC-31',
    urs: ['URS-CMC-001', 'URS-CMC-022'],
    kind: 'ad-hoc',
    title: 'Anything the tester observed that no step above covers',
    action: 'the tester records it here',
    expected: 'reviewer judgment',
  },
  async ({ attach }) => {
    attach('run-state.json', {
      projectId: state.projectId ?? null,
      emptyProjectId: state.emptyProjectId ?? null,
      biologicProjectId: state.biologicProjectId ?? null,
      sequenceId: state.sequenceId ?? null,
      sectionKeys: state.sectionKeys ?? [],
      approvedKey: state.approvedKey ?? null,
      records: state.records ?? {},
    });
    return 'the run’s own identifiers are attached for the reviewer; the runner records no further observation';
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
export const SURFACE_STEPS = `${FILING_STEPS} \u2192 steps-surface.mjs`;
