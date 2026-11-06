/** Native HTTP review ceremony for the workflow import integration fixture. */
import type { Express } from 'express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { stableStringify } from '../../shared/canonical-json';
import type { WorkflowImportSource } from '../../shared/authoring/source-import';

/** One actual protocol source, with canonical machine clause lineage and no invented qualification. */
export async function nativeMachineProtocolSource(owner: Pool, organizationId: number, userId: number, source: WorkflowImportSource) {
  if (source.kind !== 'protocol') throw new Error('Native protocol fixture required');
  await owner.query('UPDATE protocol_documents SET synopsis=NULL WHERE id=$1 AND organization_id=$2', [source.documentId, organizationId]);
  const sections = (await owner.query('SELECT id,content FROM protocol_sections WHERE protocol_document_id=$1 AND organization_id=$2', [source.documentId, organizationId])).rows;
  const { enforceAuthorLineage } = await import('../../server/services/clinical-regulatory-evidence/lineage-gate');
  const { ANA_MACHINE_AUTHOR_ID } = await import('../../server/services/authoring/revision-ledger');
  for (const section of sections) await enforceAuthorLineage(owner, organizationId, { documentTable: 'protocol_sections', documentId: String(section.id) },
    section.content, String(userId), { machineDraft: { authorId: ANA_MACHINE_AUTHOR_ID } });
  return source;
}

/** The retained CSR intentionally lacks scientific table/review evidence. */
export async function nativeUnretainedCsrSource(input: { owner: Pool; organizationId: number; projectId: number; userId: number; tag: string }) {
  const { owner, organizationId, projectId, userId, tag } = input;
  const { randomUUID } = await import('node:crypto');
  const row = (await owner.query(`INSERT INTO csr_build_jobs
    (organization_id,project_id,study_id,status,progress,sections_to_generate,study_info_snapshot,requested_by)
    VALUES ($1,$2,$3,'complete',100,ARRAY['1'],$4::jsonb,$5) RETURNING id`,
  [organizationId, projectId, `${tag}-${randomUUID()}`, JSON.stringify({ title: `${tag} known machine CSR` }), userId])).rows[0];
  const content = '<p>Automated retained narrative states the trial summary supplied by the worker.</p>';
  await owner.query(`INSERT INTO csr_section_outputs
    (organization_id,project_id,job_id,section_number,content,content_hash,ai_generated,model,lineage)
    VALUES ($1,$2,$3,'1',$4,$5,true,NULL,'{}'::jsonb)`, [organizationId, projectId, row.id, content, spikeSha(content)]);
  return { kind: 'csr' as const, jobId: Number(row.id), sectionNumbers: ['1'] };
}

/** The workflow step reads current membership roles, not a stale QA token claim. */
export async function withNativeReviewerStanding<T>(input: {
  owner: Pool; organizationId: number; projectId: number; userId: number;
}, work: () => Promise<T>): Promise<T> {
  const { owner, organizationId, projectId, userId } = input;
  const role = (await owner.query('SELECT role FROM organization_users WHERE organization_id=$1 AND user_id=$2', [organizationId, userId])).rows[0].role;
  const grant = (await owner.query(`INSERT INTO project_members(organization_id,project_id,user_id,role,status,invited_by_id)
    VALUES($1,$2,$3,'edit','active',$3) RETURNING id`, [organizationId, projectId, userId])).rows[0].id;
  await owner.query("UPDATE organization_users SET role='reviewer' WHERE organization_id=$1 AND user_id=$2", [organizationId, userId]);
  try { return await work(); }
  finally {
    await owner.query('UPDATE organization_users SET role=$3 WHERE organization_id=$1 AND user_id=$2', [organizationId, userId, role]);
    await owner.query("UPDATE project_members SET status='revoked' WHERE id=$1 AND organization_id=$2", [grant, organizationId]);
  }
}

export async function replaceNativeWorkflowSections(input: {
  app: Express; token: string; sections: Array<{ id: string }>; content: string; reason: string;
}) {
  for (const section of input.sections) {
    const replacement = await request(input.app).patch(`/api/authoring/sections/${section.id}`)
      .set('Authorization', `Bearer ${input.token}`).send({ content: input.content, changeReason: input.reason });
    expect(replacement.status, JSON.stringify(replacement.body)).toBe(200);
  }
}
import {
  authoringReviewExpectedSchema, authoringReviewReadSchema, authoringReviewResponseSchema,
} from '../../shared/authoring/peer-review';

export async function captureAssignedWorkflowReview(
  app: Express, reviewer: { id: number; token: string }, documentId: string, organizationId: number,
) {
  const reading = await request(app).get(`/api/authoring/documents/${documentId}/reviews`)
    .set('Authorization', `Bearer ${reviewer.token}`);
  expect(reading.status, JSON.stringify(reading.body)).toBe(200);
  const { reviewContext } = authoringReviewReadSchema.parse(reading.body);
  expect(reviewContext).toMatchObject({
    documentId, actorId: String(reviewer.id), organizationId, canReview: true,
  });
  const expected = authoringReviewExpectedSchema.parse({
    reviewId: reviewContext.myReview?.reviewId, requestedAt: reviewContext.myReview?.requestedAt,
    snapshotHash: reviewContext.snapshotHash, bindingBasis: reviewContext.bindingBasis,
  });
  return { reviewContext, expected };
}

export function assertBoundWorkflowReviewReceipt(
  body: unknown, { reviewContext, expected }: Awaited<ReturnType<typeof captureAssignedWorkflowReview>>,
) {
  const receipt = authoringReviewResponseSchema.parse(body);
  expect(receipt.review).toMatchObject({
    id: expected.reviewId, doc_id: reviewContext.documentId, reviewer_id: reviewContext.actorId,
    tenant_id: reviewContext.organizationId, review_status: 'approved', standing: 'current',
    reviewed_snapshot_hash: expected.snapshotHash, review_binding_basis: expected.bindingBasis,
  });
  expect(receipt.review.reviewed_snapshot).toEqual(reviewContext.snapshot);
}

/** The existing native assignment/read/approval ceremony in one fixture home. */
export async function approveAssignedWorkflowReview(input: {
  app: Express; author: { token: string }; reviewer: { id: number; email: string; token: string };
  documentId: string; organizationId: number; reason: string;
}) {
  const { app, author, reviewer, documentId, organizationId, reason } = input;
  const asked = await request(app).post(`/api/authoring/documents/${documentId}/request-review`)
    .set('Authorization', `Bearer ${author.token}`).send({ reviewers: [{ id: String(reviewer.id), name: 'Native independent reviewer', email: reviewer.email }],
      reason, route: { reviewDueDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) } });
  expect(asked.status, JSON.stringify(asked.body)).toBe(200);
  const binding = await captureAssignedWorkflowReview(app, reviewer, documentId, organizationId);
  const reviewed = await request(app).post(`/api/authoring/documents/${documentId}/review`)
    .set('Authorization', `Bearer ${reviewer.token}`).send({ review_status: 'approved', review_comments: reason, expected: binding.expected });
  expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(200);
  assertBoundWorkflowReviewReceipt(reviewed.body, binding);
}

interface AnaSpikeFixture {
  owner: Pool; app: Express; organizationId: number; organizationUuid: string; projectId: number; programId: string;
  author: { id: number; email: string; token: string }; reviewer: { id: number; email: string; token: string };
  password: string; reason: string; rememberDocument(id: string): void;
}
const spikeSha = (text: string) => createHash('sha256').update(text).digest('hex');
const INITIAL_MACHINE_TEXT = '<p>The protocol specifies ZXQ measurements for the planned assessment.</p>';
const HUMAN_REPLACEMENT = '<p>Independent medical oversight established the accepted assessment procedures through documented review.</p>';

/** Real native writers and signatures; the child SDK transport is scripted, never PQ evidence. */
export function registerJoinedAnaReviewAcceptance(read: () => AnaSpikeFixture) {
  it('joins a parent draft, durable child lock refusal, saved checker, assigned human decisions, genuine rewrite and signed freeze without inventing PQ', async () => {
    const f = read();
    const { getPool } = await import('../../server/db');
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const { beginRun, endRun, stopRunControlListener } = await import('../../server/services/ana/run-control');
    const pool = getPool();
    const scoped = <T>(work: () => Promise<T>) => runWithTenantScope({ tenantId: String(f.organizationId),
      orgUuid: f.organizationUuid, accountId: f.author.id, role: 'admin', source: 'request', caller: 'native-ana-review-spike' }, work);
    const { getOrCreateThread, saveChatMessage } = await import('../../server/services/chat-thread-helpers');
    const threadId = await scoped(() => getOrCreateThread(null, f.author.id, 'native-spike', f.organizationId, f.programId));
    await scoped(() => saveChatMessage(threadId, 'user', 'Draft the selected assessment section and check it before review.'));
    const run = await scoped(() => beginRun({ pool, organizationId: f.organizationId, userId: f.author.id,
      projectId: f.programId, threadId, surface: 'ana-ri-stream', runPolicy: 'manual' }));
    try {
      const posture = await scoped(() => pool.query(`SELECT current_user AS role,r.rolsuper,r.rolbypassrls,
        current_setting('app.rls_enforce') AS enforcement FROM pg_roles r WHERE r.rolname=current_user`));
      expect(posture.rows[0]).toMatchObject({ role: 'app_service', rolsuper: false, rolbypassrls: false, enforcement: 'on' });
      const { draftAuthoringDocumentTool } = await import('../../server/services/authoring/authoring-draft-tool');
      const draft = JSON.parse(await scoped(() => draftAuthoringDocumentTool(pool, {
        title: 'Joined native AnA review spike', module: 'M2', documentType: 'clinical_overview',
        sections: [{ code: '2.5.1', title: 'Assessment procedures', content: INITIAL_MACHINE_TEXT }],
      }, { organizationId: f.organizationId, userId: f.author.id, projectRef: f.programId, threadId: run.threadId })));
      expect(draft.saved, JSON.stringify(draft)).toBe(true); f.rememberDocument(draft.authoringDocId);
      const docId = String(draft.authoringDocId);
      const child = await scoped(() => runSpikeChild(f, run.runId, docId));
      expect((await f.owner.query('SELECT id FROM frozen_documents WHERE document_id=$1', [docId])).rows).toHaveLength(0);
      const first = await requestSpikeReview(f, docId);
      expect(first.reviewContext.independentCheck).toMatchObject({ standing: 'current', semanticVerified: false });
      await decideSpikeFindings(f, docId, first, 'changes_requested');
      const refused = await freezeSpikeDocument(f, docId);
      expect(refused.status, JSON.stringify(refused.body)).toBe(409);
      expect(refused.body.code ?? refused.body.error?.code).toBe('WORKFLOW_MODEL_QUALIFICATION_REQUIRED');
      const section = (await f.owner.query('SELECT id FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2', [docId, f.organizationId])).rows[0];
      const edited = await request(f.app).patch(`/api/authoring/sections/${section.id}`).set('Authorization', `Bearer ${f.author.token}`)
        .send({ content: HUMAN_REPLACEMENT, changeReason: f.reason });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      const current = await requestSpikeReview(f, docId);
      await decideSpikeFindings(f, docId, current, 'approved');
      const signed = await request(f.app).post(`/api/authoring/docs/${docId}/e-sign`).set('Authorization', `Bearer ${f.reviewer.token}`)
        .send({ meaning: 'REVIEWER', intent: f.reason, password: f.password });
      expect(signed.status, JSON.stringify(signed.body)).toBe(200);
      const frozen = await freezeSpikeDocument(f, docId);
      expect(frozen.status, JSON.stringify(frozen.body)).toBe(200);
      await assertSpikeLedger(f, docId, run.runId, child);
    } finally { await scoped(() => endRun(pool, run.runId, 'finished', null)); stopRunControlListener(); }
  }, 120_000);
}

async function requestSpikeReview(f: AnaSpikeFixture, documentId: string) {
  const asked = await request(f.app).post(`/api/authoring/documents/${documentId}/request-review`)
    .set('Authorization', `Bearer ${f.author.token}`).send({ reviewers: [{ id: String(f.reviewer.id) }], reason: f.reason,
      route: { reviewDueDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) } });
  expect(asked.status, JSON.stringify(asked.body)).toBe(200);
  return captureAssignedWorkflowReview(f.app, f.reviewer, documentId, f.organizationId);
}

async function decideSpikeFindings(f: AnaSpikeFixture, documentId: string,
  binding: Awaited<ReturnType<typeof captureAssignedWorkflowReview>>, status: 'changes_requested' | 'approved') {
  const check = binding.reviewContext.independentCheck;
  expect(check?.standing).toBe('current');
  if (!check?.receiptId) throw new Error('Actual independent receipt unavailable');
  const dispositions = check.findings.filter(finding => finding.open).map(finding => ({ findingId: finding.findingId,
    decision: finding.current ? 'rejected' as const : 'resolved' as const, reason: f.reason }));
  expect(dispositions.length).toBeGreaterThan(0);
  const response = await request(f.app).post(`/api/authoring/documents/${documentId}/review`)
    .set('Authorization', `Bearer ${f.reviewer.token}`).send({ review_status: status, review_comments: f.reason,
      expected: binding.expected, independent_findings: { receiptId: check.receiptId, snapshotHash: check.snapshotHash, dispositions } });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
}

function freezeSpikeDocument(f: AnaSpikeFixture, documentId: string) {
  return request(f.app).post(`/api/authoring/docs/${documentId}/freeze`).set('Authorization', `Bearer ${f.author.token}`)
    .send({ meaning: 'AUTHOR', reason: f.reason, password: f.password });
}

async function runSpikeChild(f: AnaSpikeFixture, runId: string, documentId: string) {
  const { getPool } = await import('../../server/db');
  const { openRunCoordination, readCoordinationEvents, coordinationSha256 } = await import('../../server/services/ana/run-events');
  const { runSubAgent } = await import('../../server/services/ana/sub-agent');
  const { newAgentTurnCounters } = await import('../../server/services/ana/sub-agent-limits');
  const { ALL_ANA_TOOLS } = await import('../../server/services/ana/AnaToolDefinitions');
  const { getGateway } = await import('../../server/services/ai-gateway/gateway');
  const { createRunSourceAuthority, runWithSourceAuthority, captureCurrentRunSourceGate } = await import('../../server/services/ai-gateway/model-call-scope');
  const pool = getPool(), basis = [{ kind: 'source' as const, ref: documentId, sha256: spikeSha(INITIAL_MACHINE_TEXT) }];
  const host = await openRunCoordination({ pool, runId, organizationId: f.organizationId, userId: f.author.id,
    projectId: f.projectId, basis });
  const args = { command: 'freeze_document', params: { docId: documentId } };
  let calls = 0;
  const transport = vi.spyOn(getGateway(), 'route').mockImplementation(async input => {
    await input.beforeDispatch?.(); const gate = captureCurrentRunSourceGate(input);
    if (!gate) throw new Error('Actual child source authority unavailable'); await gate.recheck();
    const toolUses = calls++ === 0 ? [{ id: 'native-lock-attempt', name: 'execute_platform_command', input: args }] : [];
    return { content: 'Scripted operational fixture report; no provider or PQ was exercised.', toolUses,
      provider: 'anthropic', model: 'scripted-transport-not-qualified', requestId: `native-spike-${calls}`,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 }, latencyMs: 1, cached: false, deterministic: false };
  });
  try {
    const result = await runWithSourceAuthority(createRunSourceAuthority({ organizationId: f.organizationId,
      userId: f.author.id, projectId: f.projectId, programId: f.programId }), () => runSubAgent({ role: 'verify',
      objective: 'Check the assigned saved draft', instructions: 'Check only the assigned record.', text_to_check: INITIAL_MACHINE_TEXT },
    { organizationId: f.organizationId, userId: f.author.id, projectId: f.projectId, projectRef: f.programId, sqlClient: pool },
    { organizationId: f.organizationId, parentRunId: runId, round: 1, parentStep: 's1', task: 't1',
      governedTools: ALL_ANA_TOOLS.filter(tool => ['check_grounding', 'execute_platform_command'].includes(tool.name)),
      agents: newAgentTurnCounters(), hold: async () => 'running', expiredSignal: new AbortController().signal,
      heldMs: () => 0, emit: () => {}, coordination: async () => host }));
    const parsed = JSON.parse(result);
    expect(parsed.trace.steps.some((step: { result: string }) => /TOOL_NOT_OFFERED|SUB_AGENT_READ_ONLY/.test(step.result))).toBe(true);
    const events = await readCoordinationEvents(pool, { runId, organizationId: f.organizationId, userId: f.author.id, projectId: f.projectId });
    const refusal = events.find(event => event.operation === 'refused');
    expect(refusal?.basis).toEqual(expect.arrayContaining([{ kind: 'event', ref: 'tool:execute_platform_command', sha256: coordinationSha256(stableStringify(args)) },
      { kind: 'event', ref: 'command:freeze_document' }, ...basis]));
    const report = events.find(event => event.operation === 'report');
    if (!refusal || !report) throw new Error('Actual child denial or report receipt unavailable');
    await host.assess({ intentId: 'native-parent-rework', worker: report.worker, reportEventId: report.eventId,
      reportSha256: coordinationSha256(result), decision: 'rework', reason: 'A denied lock is not human review or model qualification.',
      basis: [...basis, { kind: 'event', ref: refusal.eventId, sha256: refusal.eventHash }] });
    return { refusalId: refusal.eventId, reportSha256: coordinationSha256(result) };
  } finally { transport.mockRestore(); }
}

async function assertSpikeLedger(f: AnaSpikeFixture, documentId: string, runId: string,
  child: { refusalId: string | undefined; reportSha256: string }) {
  const rows = (await f.owner.query('SELECT * FROM audit_logs WHERE tenant_id=$1 ORDER BY chain_seq', [f.organizationId])).rows;
  const docRows = rows.filter(row => row.new_values?.docId === documentId || row.record_id === documentId);
  for (const action of ['authoring.section.CREATE', 'authoring.section.INDEPENDENT_CHECK_RECORDED', 'authoring.section.INDEPENDENT_FINDING_REVIEW']) {
    expect(docRows.some(row => row.action === action)).toBe(true);
  }
  expect(rows.some(row => row.new_values?.eventId === child.refusalId && row.record_id === runId)).toBe(true);
  expect(rows.some(row => row.record_id === runId && row.new_values?.operation === 'disposition')).toBe(true);
  const kept = (await f.owner.query('SELECT provenance FROM authoring_documents WHERE id=$1 AND tenant_id=$2', [documentId, f.organizationId])).rows[0].provenance;
  expect(kept).toMatchObject({ source: 'ana', governedWrite: 'unverified' });
  expect(kept.model).toBeUndefined(); expect(kept.servedBy).toBeUndefined();
  const snapshot = (await f.owner.query('SELECT frozen_content,content_hash FROM frozen_documents WHERE document_id=$1 AND tenant_id=$2', [documentId, f.organizationId])).rows;
  expect(snapshot).toHaveLength(1); expect(spikeSha(snapshot[0].frozen_content)).toBe(snapshot[0].content_hash);
  expect(snapshot[0].frozen_content).toContain(HUMAN_REPLACEMENT); expect(snapshot[0].frozen_content).not.toContain(INITIAL_MACHINE_TEXT);
  expect((await f.owner.query('SELECT id FROM authoring_signatures WHERE doc_id=$1 AND tenant_id=$2', [documentId, f.organizationId])).rows).toHaveLength(2);
}
