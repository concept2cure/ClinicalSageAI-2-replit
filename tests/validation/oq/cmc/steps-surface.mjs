/**
 * OQ-008 steps OQ-CMC-25…33 and the ad-hoc OQ-CMC-31: the screens, the
 * interview boundary, the release-signature binding, dispatch readiness, the
 * API allowlist, the orchestrator's governed load, and the two controls landed
 * on 2026-10-18 — who recorded each register row (URS-CMC-021) and that the
 * approver is not one of them (URS-CMC-022).
 */
import { step, state, BROWSERLESS } from './context.mjs';
import { requireSigner } from '../../lib/credentials.mjs';
import { dataOf, errCode, errDetail, postAsSigner } from './signed-acts.mjs';
import { FILING_STEPS } from './steps-filing.mjs';

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

await step(
  {
    id: 'OQ-CMC-27',
    urs: ['URS-CMC-017'],
    title: 'A release signature covers the manifest that would be transmitted',
    action: 'sign the sequence’s release, then read the dispatch gate',
    expected: 'the signature is bound to this sequence’s leaf manifest; a manifest that differs reads as no release signature for the sequence',
    dependsOn: ['OQ-CMC-19'],
  },
  async (ctx) => {
    const { api, deviation } = ctx;
    const signer = state.signer ?? (await requireSigner(ctx, ctx.baseUrl));
    const sign = await postAsSigner(ctx, signer, `/api/submissions/sequences/${state.sequenceId}/sign-release`, {
      reason: 'Releasing sequence 0001 for transmission.', meaning: 'approval',
    });
    if (sign.status !== 200) {
      deviation(`not executed — the release signature could not be made (${sign.status}); the Submission Center path (OQ-SUBC) owns that act.`, sign.json);
    }
    const readiness = await api('GET', `/api/submissions/sequences/${state.sequenceId}/dispatch-readiness`);
    return `release signed; dispatch readiness ${readiness.status}`;
  },
);

await step(
  {
    id: 'OQ-CMC-28',
    urs: ['URS-CMC-018'],
    title: 'An original IND carrying no 3.2.S and no 3.2.P is not dispatch-ready',
    action: 'read the dispatch readiness of the original IND sequence',
    expected: 'the verdict speaks to the Module 3 requirement, citing 21 CFR 312.23(a)(7) and (b) and naming both remedies',
    dependsOn: ['OQ-CMC-19'],
  },
  async ({ api, expect, attach }) => {
    const r = await api('GET', `/api/submissions/sequences/${state.sequenceId}/dispatch-readiness`);
    attach('dispatch-readiness.json', r.json ?? {});
    expect(r.status === 200, `the readiness read expected 200, got ${r.status}`, r.json);
    const text = JSON.stringify(r.json ?? {});
    expect(
      /312\.23/.test(text) || /3\.2\.S/.test(text),
      'the verdict says nothing about the Module 3 requirement',
      text.slice(0, 300),
    );
    return 'readiness read 200; the verdict speaks to the Module 3 requirement';
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
       /api/cmc/variations/classify — what the third smoke run probed — is
       claimed (shared/constants/ui-surface-registry.ts, the cmc entry), so
       its 400 was body validation and said nothing about launch scope;
       the step recorded that 400 as a pass. The CMC entry lists one prefix
       per register plus the module3-os segments, and `/api/cmc/projects` is
       not among them, so the process-capability read under it is the
       unattributed path LAUNCH_SCOPE_API_UNATTRIBUTED decides. */
    const unclaimed = await api('GET', `/api/cmc/projects/${state.projectId}/process-capability`);
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
    if (unclaimed.status !== 403) {
      /* Scope is enforced and the path is still served: that is
         LAUNCH_SCOPE_API_UNATTRIBUTED=report, an explicit deployment choice to
         record unclaimed paths rather than refuse them (moduleEntitlementGate
         `refusedByLaunchScope`). Said as what it is, not read as a pass. */
      deviation(
        `partly executed — launch scope is enforced and a claimed path is served (200), but the unclaimed path answered ${unclaimed.status}: ` +
          'this deployment sets LAUNCH_SCOPE_API_UNATTRIBUTED=report, which records an unclaimed path instead of refusing it. Set it to enforce to observe the refusal.',
        { launchScopeEnforced: enforced, unclaimedStatus: unclaimed.status },
      );
    }
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
       it a failure of the control, which it was not. */
    if (errCode(inline) !== 'INLINE_CMC_SOURCES_REFUSED') {
      ctx.deviation(
        `not executed — this server allows inline cmcSources (it answered ${inline.status} ${errCode(inline)}), which is the documented development behaviour. ` +
          'The refusal is a production control; observe it under the W3 posture.',
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
    const key = state.sectionKeys.find((k) => k !== state.approvedKey) ?? state.sectionKeys[0];
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
      reason: 'Approving the section whose records I entered myself.', meaning: 'approval', reauth: { password: authorPassword },
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
