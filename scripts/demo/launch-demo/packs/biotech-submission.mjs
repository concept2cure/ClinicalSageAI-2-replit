/**
 * launch-demo/packs/biotech-submission.mjs — Submission Center and Submission
 * Readiness for the biotech demo: the program's canonical IND submission,
 * sequence 0000 (original), the six vault documents placed as eCTD leaves, the
 * sequence moved to "assembling" (and to "validated" only when the structural
 * check is clean), then the deterministic readiness reads: dispatch-readiness,
 * Shadow Review, dispatch QC and the readiness-review orchestration. Freeze
 * and dispatch are deliberately NOT performed — the founder demonstrates the
 * governed action.
 */
import { must } from '../lib.mjs';
import { asArray, previousManifest } from './biotech-shared.mjs';

async function ensureCanonicalSubmission({ api, run, tally }, program, rec) {
  let sub;
  if (program.spineSubmissionId != null) {
    sub = must(await api('GET', `/api/submissions/${program.spineSubmissionId}`), 200, 'read spine submission');
  } else {
    // The program ↔ submission identity convention (server/services/cmc/submission-spine.ts):
    // the submission's product_name or title equals the program's product_name / name / code.
    const list = asArray(must(await api('GET', '/api/submissions'), 200, 'list submissions'), 'data');
    const keys = [program.productName, program.title, program.code].filter(Boolean).map((s) => s.toLowerCase());
    sub = list.find((s) => keys.includes(String(s.productName ?? '').toLowerCase()) || keys.includes(String(s.title ?? '').toLowerCase())) || null;
  }
  if (!sub) throw new Error('no canonical submission for the program: intake reported none and no submission matches the program identity');
  tally.found('submission');
  rec.submission = { id: sub.id, title: sub.title, productName: sub.productName, applicationType: sub.applicationType, primaryRegion: sub.primaryRegion, status: sub.status };
  run.note('The submission is the program\'s canonical spine created by intake (title = program name, productName = program product). There is no PATCH /api/submissions/:id, so the story\'s label "IND 0000 — Original IND" is carried by the sequence (number 0000, type original), not by a renamed submission.');
  return `#${sub.id} "${sub.title}" (${sub.applicationType}/${sub.primaryRegion})`;
}

async function ensureSequence({ api, tally }, rec) {
  const list = asArray(must(await api('GET', `/api/submissions/${rec.submission.id}/sequences`), 200, 'list sequences'), 'data');
  let seq = list.find((s) => String(s.sequenceNumber ?? s.sequence_number) === '0000') || null;
  if (seq) tally.found('sequence');
  else {
    seq = must(await api('POST', `/api/submissions/${rec.submission.id}/sequences`, { region: 'fda', sequenceNumber: '0000', type: 'original' }), 201, 'create sequence 0000');
    tally.created('sequence');
  }
  rec.sequence = { id: seq.id, sequenceNumber: seq.sequenceNumber ?? seq.sequence_number, status: seq.status, region: seq.region };
  return `#${seq.id} status ${seq.status}`;
}

const readLeaves = async (api, seqId) => asArray(must(await api('GET', `/api/submissions/sequences/${seqId}/leaves`), 200, 'list leaves'), 'data', 'leaves');
const leafRef = (l) => ({ id: l.id, sectionCode: l.sectionCode ?? l.section_code, title: l.title, documentUuid: l.documentUuid ?? l.document_uuid ?? null });

async function ensureLeaves({ api, tally }, rec, vaultDocs) {
  const leaves = (await readLeaves(api, rec.sequence.id)).map(leafRef);
  let added = 0;
  for (const d of vaultDocs) {
    if (leaves.some((l) => l.sectionCode === d.sectionCode && String(l.documentUuid) === String(d.id))) {
      tally.found('leaf');
      continue;
    }
    must(await api('PUT', `/api/submissions/sequences/${rec.sequence.id}/leaves`, {
      sectionCode: d.sectionCode,
      title: d.leafTitle,
      documentTable: 'vault_documents',
      documentUuid: d.id,
      lifecycleOp: 'new',
      reason: 'Placed by the launch demo pack',
    }), 200, `place leaf ${d.sectionCode} ${d.key}`);
    tally.created('leaf');
    added += 1;
  }
  rec.leaves = (await readLeaves(api, rec.sequence.id)).map(leafRef);
  return `${rec.leaves.length} leaves (${added} placed)`;
}

async function transition({ api, tally }, rec, from, to) {
  if (rec.sequence.status !== from) {
    tally.found('sequence-transition');
    return `already ${rec.sequence.status}`;
  }
  const r = must(await api('POST', `/api/submissions/sequences/${rec.sequence.id}/transition`, { status: to }), 200, `transition ${to}`);
  rec.sequence.status = r.status ?? to;
  tally.created('sequence-transition');
  return to;
}

const UNRESOLVED_NOTE =
  'Submission Readiness reports UNRESOLVED_DOCUMENT errors for leaves placed from the Vault by UUID (PUT /api/submissions/sequences/:id/leaves {documentTable:"vault_documents", documentUuid}). The leaves are stored with document_uuid, but server/services/ectd/dispatch-readiness.ts documentPointerFindings tests `!leaf.documentId` and server/services/ectd/assess-dispatch-readiness.ts passes only documentId into it, so every vault-placed leaf is a permanent dispatch blocker. Product defect recorded, not fixed by the seed.';

async function readReadiness({ api, run }, rec) {
  const j = must(await api('GET', `/api/submissions/sequences/${rec.sequence.id}/dispatch-readiness`), 200, 'dispatch-readiness');
  rec.readiness = {
    gate: j.gate,
    freezeGate: j.freezeGate ?? null,
    validationErrors: j.validationErrors,
    unacknowledgedShadowCriticals: j.unacknowledgedShadowCriticals,
    releaseSignature: j.releaseSignature ?? null,
    readiness: j.readiness ?? null,
    leafCount: j.leafCount ?? null,
  };
  const unresolved = (j.readiness?.findings ?? []).filter((f) => f.code === 'UNRESOLVED_DOCUMENT');
  if (unresolved.length > 0) run.note(`${unresolved.length} × ${UNRESOLVED_NOTE}`);
  return `gate.cleared=${j.gate?.cleared}; validationErrors=${j.validationErrors}; shadowCriticals=${j.unacknowledgedShadowCriticals}; blockers=${(j.gate?.blockers ?? []).length}`;
}

async function validateIfClean(ctx, rec) {
  if (rec.sequence.status !== 'assembling') return rec.sequence.status === 'validated' ? 'already validated' : `left as ${rec.sequence.status}`;
  if ((rec.readiness.validationErrors ?? 1) > 0) {
    ctx.run.note(`Sequence 0000 left in "assembling": the structural validation reports ${rec.readiness.validationErrors} error-severity finding(s), so it was not moved to "validated".`);
    return `left assembling (${rec.readiness.validationErrors} validation errors)`;
  }
  await transition(ctx, rec, 'assembling', 'validated');
  return 'validated — one step before the governed freeze, which is left for the founder to perform';
}

async function ensureShadowReview({ api, run, tally }, rec) {
  const runs = asArray(must(await api('GET', `/api/submissions/sequences/${rec.sequence.id}/shadow-review`), 200, 'list shadow reviews'), 'data', 'runs');
  const completed = runs.filter((x) => x.status === 'completed');
  if (completed.length > 0) {
    tally.found('shadow-review');
    rec.shadowReview = { status: 'found', runs: runs.length, latest: completed[0] };
    return `found ${completed.length} completed run(s)`;
  }
  if (runs.length > 0) {
    // A previous attempt left a run in a terminal non-completed state (no AI
    // provider → the model step failed). Not re-attempted: each attempt writes
    // another failed run row, and the verdict would be the same.
    rec.shadowReview = { status: 'not executed', reason: `existing run(s) did not complete (latest status "${runs[0].status}", model ${runs[0].model ?? 'none'})`, runs: runs.length, latest: runs[0] };
    run.note(`Shadow Review not executed: ${runs.length} run(s) exist for sequence 0000 and none completed (latest status "${runs[0].status}"); no AI provider is configured.`);
    return `not executed — ${runs.length} prior run(s), none completed (${runs[0].status})`;
  }
  const r = await api('POST', `/api/submissions/sequences/${rec.sequence.id}/shadow-review`, { lens: 'fda_filing' });
  if (r.status >= 200 && r.status < 300) {
    tally.created('shadow-review');
    rec.shadowReview = { status: 'executed', result: r.json };
    return `executed: ${JSON.stringify(r.json).slice(0, 120)}`;
  }
  rec.shadowReview = { status: 'not executed', httpStatus: r.status, body: r.json ?? String(r.text).slice(0, 300) };
  run.note(`Shadow Review not executed: POST /api/submissions/sequences/${rec.sequence.id}/shadow-review answered HTTP ${r.status} ${JSON.stringify(r.json ?? r.text).slice(0, 200)}`);
  return `not executed — HTTP ${r.status}`;
}

async function runDispatchQc({ api }, rec) {
  // Same body OQ-005 step 03 sends: the route requires the two counts, and the
  // server verdict ignores them (verdictSource = assess-dispatch-readiness).
  const j = must(await api('POST', `/api/submissions/${rec.submission.id}/dispatch-qc`, {
    region: 'fda',
    sequenceId: rec.sequence.id,
    validationErrors: 0,
    unresolvedShadowCriticals: 0,
    leaves: rec.leaves.map((l) => ({ sectionCode: l.sectionCode, operation: 'new' })),
  }), 200, 'dispatch-qc');
  rec.dispatchQc = {
    clearedToDispatch: j.clearedToDispatch,
    verdictSource: j.verdictSource,
    blockers: j.blockers,
    warnings: j.warnings,
    checklist: (j.checklist ?? []).length,
    narrative: j.narrative,
    narrativeUnavailable: j.narrativeUnavailable ?? null,
  };
  if (typeof j.clearedToDispatch !== 'boolean' || j.verdictSource !== 'assess-dispatch-readiness') throw new Error(`dispatch-qc verdict shape unexpected: ${JSON.stringify(j).slice(0, 200)}`);
  return `clearedToDispatch=${j.clearedToDispatch} (${j.verdictSource}); blockers ${j.blockers.length}; narrative ${j.narrative === null ? `null (${j.narrativeUnavailable?.code})` : 'present'}`;
}

const executionIdOf = (e) => e.executionId ?? e.execution?.executionId ?? e.id ?? e.execution?.id ?? null;
const executionStatusOf = (s) => s?.status ?? s?.execution?.status ?? null;

/** The execution recorded by the previous manifest, when the server still has it. */
async function previousExecution({ api, tally }, rec) {
  const prev = previousManifest()?.records?.submission?.orchestration?.executionId ?? null;
  if (!prev) return null;
  const g = await api('GET', `/api/orchestration/executions/${prev}`);
  if (g.status !== 200) return null;
  tally.found('orchestration-execution');
  rec.orchestration = { executionId: prev, status: executionStatusOf(g.json), reused: true };
  return `found execution ${prev}`;
}

async function ensureOrchestration(ctx, program, rec) {
  const found = await previousExecution(ctx, rec);
  if (found) return found;
  const { api, tally } = ctx;
  const e = must(await api('POST', '/api/orchestration/execute', { templateId: 'submission_readiness_review', projectId: program.id, module: 'ind' }), [200, 201, 202], 'orchestration execute');
  const id = executionIdOf(e);
  if (!id) throw new Error(`orchestration execute returned no execution id: ${JSON.stringify(e).slice(0, 200)}`);
  await new Promise((r) => setTimeout(r, 1500));
  const s = must(await api('GET', `/api/orchestration/executions/${id}`), 200, 'orchestration execution read');
  tally.created('orchestration-execution');
  rec.orchestration = { executionId: id, status: executionStatusOf(s), steps: (s.steps ?? s.execution?.steps ?? []).length, reused: false };
  return `execution ${id} (${rec.orchestration.status})`;
}

export async function ensureSubmission(ctx, program, vaultDocs) {
  const { run } = ctx;
  const rec = {};
  run.record('submission', rec);
  await run.step("Submission Center: the program's canonical submission (IND)", () => ensureCanonicalSubmission(ctx, program, rec));
  await run.step('Submission Center: sequence 0000 (original)', () => ensureSequence(ctx, rec));
  await run.step('Submission Center: place the vault documents as eCTD leaves', () => ensureLeaves(ctx, rec, vaultDocs));
  await run.step('Submission Center: sequence moves draft → assembling', () => transition(ctx, rec, 'draft', 'assembling'));
  await run.step('Submission Readiness: deterministic structural validation (GET dispatch-readiness)', () => readReadiness(ctx, rec));
  await run.step('Submission Center: sequence moves assembling → validated when the structural check is clean', () => validateIfClean(ctx, rec));
  await run.step('Submission Readiness: Shadow Review (agency-lens readiness assessment)', () => ensureShadowReview(ctx, rec));
  await run.step('Submission Readiness: dispatch QC (deterministic verdict; narrative only from a provider)', () => runDispatchQc(ctx, rec));
  await run.step('Submission Readiness: readiness review orchestration (deterministic template)', () => ensureOrchestration(ctx, program, rec));
  return rec;
}
