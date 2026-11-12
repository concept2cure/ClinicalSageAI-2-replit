/**
 * Hops 4–5 of the founder-path lineage walk, on the path a person can take
 * today: the person rewrites AnA's draft in their own words and cites the Data
 * Room source, the independent check is run, the reviewer decides its findings
 * and signs, and the document is frozen and approved. Support for
 * tests/lineage/founder-path-lineage.pglite.test.ts — not a test file; read
 * that file's header first ("The person's path").
 *
 * Split out of founder-path-lineage.hops-authoring.ts (2026-11-10).
 */
import { expect } from 'vitest';
import request from 'supertest';
import {
  Hop, ORG_A, PASSWORD, REVIEWER, QUOTE, SHA256_X, HEX64, sha256, json, asPrincipal, type World,
} from './founder-path-lineage.world';

type Actor = 'author' | 'reviewer';

/** One finding of the independent check, as the review context serves it (shared/authoring/peer-review.ts). */
interface CheckFinding { findingId: string; category: string; hard: boolean; open: boolean; current: boolean; sectionId?: string | null }
export interface CheckContext { standing: string; receiptId: string | null; snapshotHash: string; hardBlockCount: number; findings: CheckFinding[] }
interface ReviewContext {
  snapshotHash: string;
  bindingBasis: string;
  myReview: { reviewId: string; requestedAt: string } | null;
  independentCheck?: CheckContext;
}

/** The review routes run on the request's pinned connection, which the walk attaches from its principal headers. */
const as = (w: World, who: Actor) => (r: request.Test) =>
  who === 'author' ? w.asAuthor(asPrincipal(ORG_A, 3)(r)) : w.asReviewer(asPrincipal(ORG_A, Number(REVIEWER.id))(r));

/** GET /documents/:id/reviews: the saved snapshot a review act is bound to, and the independent check's standing. */
async function reviewContext(w: World, who: Actor): Promise<ReviewContext> {
  const res = await as(w, who)(request(w.app).get(`/api/authoring/documents/${w.k.docId}/reviews`));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.reviewContext;
}

/**
 * POST /documents/:id/review, action run_independent_checks (authoring.router.ts:3255;
 * peer-review.ts runAuthoringIndependentCheck): the saved-record checks, run
 * with no model and recorded for the snapshot the person is looking at.
 */
export async function runIndependentCheck(w: World, who: Actor): Promise<CheckContext> {
  const { snapshotHash } = await reviewContext(w, who);
  const res = await as(w, who)(request(w.app).post(`/api/authoring/documents/${w.k.docId}/review`))
    .send({ action: 'run_independent_checks', expectedSnapshotHash: snapshotHash });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.independentCheck;
}

/** The person's own words for 2.5.1. No sentence of AnA's is kept. */
const OWN_RATIONALE = '<p>The sponsor is developing C2C-101, a selective inhibitor, for patients whose disease is moderate to severe.</p>';
/**
 * The person's own words for 2.5.2: the figure of the source, restated, with
 * the editor's citation inside its sentence. The label is the source's name as
 * the editor's catalogue lists it (citationNode.ts insertCitation).
 */
const ownBiopharmaceutics = (sourceId: number, sourceName: string) =>
  '<p>Two oral formulations were studied in the biopharmaceutics programme.</p>'
  + `<p>Both formulations tested gave an oral bioavailability of 62% for C2C-101 <a data-cite="${sourceId}">${sourceName}</a>.</p>`;

interface SectionRow { id: string; code: string; updated_at: Date }
interface Rewrite { section: SectionRow; content: string; res: request.Response }

/** PATCH /api/authoring/sections/:id (authoring.router.ts:1598): the section save, with the person's reason. */
async function saveSection(w: World, section: SectionRow, content: string, changeReason: string): Promise<Rewrite> {
  const res = await w.asAuthor(request(w.app).patch(`/api/authoring/sections/${section.id}`)).send({
    content, changeReason, expectedUpdatedAt: new Date(section.updated_at).toISOString(),
  });
  return { section, content, res };
}

/**
 * The person's edit, the way the editor makes it. Cite first: the editor
 * registers the source to the section (DocumentWorkbench.tsx citeSource →
 * POST /sections/:id/cite-source) and only then puts the citation into the
 * text; the save follows. The name comes from the project's source list, the
 * editor's catalogue (GET /api/c2c/projects/:id/sources).
 */
async function rewriteInOwnWords(w: World): Promise<{ cited: request.Response; rewrites: Rewrite[] }> {
  const { k, q } = w;
  const sections = await q<SectionRow>(
    'SELECT id, code, updated_at FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index', [k.docId, ORG_A]);
  const rationale = sections.find((s) => s.code === '2.5.1')!;
  const biopharm = sections.find((s) => s.code === '2.5.2')!;
  const catalogue = await asPrincipal(ORG_A, 3)(request(w.app).get(`/api/c2c/projects/${k.programId}/sources`));
  const sourceName = String((catalogue.body.sources ?? []).find((s: { id: number }) => s.id === k.sourceId)?.title ?? '');
  expect(sourceName, 'the editor’s catalogue names the source').not.toBe('');
  const cited = await w.asAuthor(request(w.app).post(`/api/authoring/sections/${biopharm.id}/cite-source`)).send({ source_id: k.sourceId });
  const rewrites = [
    await saveSection(w, rationale, OWN_RATIONALE, 'Rewrote the development rationale in my own words.'),
    await saveSection(w, biopharm, ownBiopharmaceutics(k.sourceId!, sourceName),
      'Restated the bioavailability finding in my own words and cited the study report synopsis it comes from.'),
  ];
  return { cited, rewrites };
}

/**
 * 4 · the person's rewrite. AnA's text cannot be released today (no model has
 * passed PQ: workflow-import-governance.ts assertOrdinaryMachineRelease), so
 * the person replaces every clause AnA wrote, in both sections, and states the
 * source's figure in their own sentence, cited to the Data Room source.
 * POST /sections/:id/cite-source (authoring.router.ts:2850), then
 * PATCH /sections/:id ×2 (:1598; the lineage gate, the revision, the chained UPDATE row).
 */
export async function hopEditSave(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('edit-save');
  const genesis = await q<{ id: string; section_id: string; chain_sha256: string }>(
    'SELECT id, section_id, chain_sha256 FROM doc_revisions WHERE section_id = ANY($1)', [k.sectionIds]);
  const { cited, rewrites } = await rewriteInOwnWords(w);
  const biopharm = rewrites[1].section;

  await hop.check('save-accepted', 'both saves are accepted', async (observe) => {
    observe(rewrites.map(({ res }) => ({ status: res.status, code: res.body?.error?.code ?? null })));
    for (const { res } of rewrites) expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
  await hop.check('citation-registered', 'the editor’s Cite registered the source to the figure’s section at its checksum, and the saved sentence carries it', async (observe) => {
    const rows = await q<{ source: string; reference_id: string; payload_sha256: string }>(
      'SELECT source, reference_id, payload_sha256 FROM authoring_citations WHERE section_id = $1 AND tenant_id = $2', [biopharm.id, ORG_A]);
    const [saved] = await q<{ content: string }>('SELECT content FROM authoring_sections WHERE id = $1', [biopharm.id]);
    observe({ status: cited.status, citations: rows.length });
    expect(cited.status, JSON.stringify(cited.body)).toBe(201);
    expect(rows).toEqual([{ source: 'cre_evidence_source', reference_id: String(k.sourceId), payload_sha256: SHA256_X }]);
    expect(saved.content).toMatch(new RegExp(`62% for C2C-101 <a data-cite="${k.sourceId}">[^<]+</a>\\.</p>$`));
  });
  await hop.check('revision-chained', 'doc_revisions grows by each edit, chained to the section’s genesis row and hashing the saved text', async (observe) => {
    const revs = await q<{ id: string; section_id: string }>(
      'SELECT id, section_id, origin, content_sha256, prev_chain_sha256 FROM doc_revisions WHERE section_id = ANY($1)', [k.sectionIds]);
    observe(revs.length);
    expect(revs).toHaveLength(4);
    for (const { section, content } of rewrites) {
      const first = genesis.find((g) => g.section_id === section.id)!;
      expect(revs.find((r) => r.section_id === section.id && r.id !== first.id))
        .toMatchObject({ origin: 'human-edit', prev_chain_sha256: first.chain_sha256, content_sha256: sha256(content) });
    }
  });
  /* What the release reads at the seal (governed-machine-claims.ts
     ordinaryMachineGenesisMayRelease): no clause AnA wrote and no live machine
     span is left, and each section's text is the after-text of a chained
     UPDATE row a person made. */
  await hop.check('machine-text-replaced', 'no machine span is live on either section, AnA’s quoted sentence is gone, and each section’s text is the after-text of the person’s chained UPDATE row', async (observe) => {
    const live = await q(
      `SELECT 1 FROM document_span_lineage WHERE organization_id = $1 AND document_table = 'authoring_sections'
          AND document_id = ANY($2) AND provenance_kind IN ('machine_draft', 'accepted_machine_draft') AND deleted_at IS NULL`,
      [ORG_A, k.sectionIds]);
    const recorded = await q<{ section_id: string; actor_id: string; chained: boolean }>(
      `SELECT t.section_id::text, t.actor_id, a.sha256_chain IS NOT NULL AS chained
         FROM authoring_audit_trail t
         JOIN authoring_sections s ON s.id = t.section_id AND s.content = t.after_content
         LEFT JOIN audit_logs a ON a.new_values->>'trailId' = t.id::text AND a.tenant_id = t.tenant_id
        WHERE t.doc_id = $1 AND t.operation_type = 'UPDATE'`, [k.docId]);
    const texts = await q<{ content: string }>('SELECT content FROM authoring_sections WHERE doc_id = $1', [k.docId]);
    observe({ liveMachineSpans: live.length, humanUpdates: recorded.length, quoteKept: texts.some((t) => t.content.includes(QUOTE)) });
    expect(live).toHaveLength(0);
    expect(texts.some((t) => t.content.includes(QUOTE))).toBe(false);
    expect(recorded.map((r) => r.section_id).sort()).toEqual([...k.sectionIds!].sort());
    for (const r of recorded) expect(r).toMatchObject({ actor_id: '3', chained: true });
  });
  await hop.check('source-span-survives', 'after the edit, a cre_evidence_source span still cites the source', async (observe) => {
    const [n] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM document_span_lineage
        WHERE organization_id = $1 AND document_table = 'authoring_sections' AND document_id = $2
          AND provenance_kind = 'cre_evidence_source' AND reference_id = $3 AND deleted_at IS NULL`,
      [ORG_A, biopharm.id, String(k.sourceId)]);
    observe(n.n);
    expect(n.n).toBeGreaterThanOrEqual(1);
  });
  await hop.check('spans-bound-to-revision', 'the section’s live spans name the doc_revisions row they describe', async (observe) => {
    const spans = await q<{ document_version: string | null }>(
      `SELECT document_version FROM document_span_lineage WHERE document_table = 'authoring_sections' AND document_id = $1 AND deleted_at IS NULL`, [biopharm.id]);
    const revIds = (await q<{ id: string }>('SELECT id FROM doc_revisions WHERE section_id = $1', [biopharm.id])).map((r) => r.id);
    observe([...new Set(spans.map((s) => s.document_version))].sort());
    expect(spans.length).toBeGreaterThan(0);
    for (const s of spans) expect(revIds).toContain(s.document_version);
  });
  hop.verdict();
}

const DUE = () => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

/**
 * The review an approval follows (P-95, 2026-11-09). The author runs the
 * independent check, then sends the document to the QA reviewer
 * (POST /documents/:id/request-review opens its RR5 route and runs the check
 * again). The reviewer reads the check, marks resolved each earlier hard
 * finding the current check no longer reports, approves, and signs the review.
 */
async function reviewOnRoute(w: World): Promise<{ checked: CheckContext; decided: string[] }> {
  const { k } = w;
  const checked = await runIndependentCheck(w, 'author');
  const sent = await as(w, 'author')(request(w.app).post(`/api/authoring/documents/${k.docId}/request-review`)).send({
    reviewers: [{ id: Number(REVIEWER.id), name: REVIEWER.name, email: REVIEWER.email }],
    route: { reviewDueDate: DUE() },
    reason: 'Send the C2C-101 IND section for QA review before approval.',
  });
  expect(sent.status, JSON.stringify(sent.body)).toBeLessThan(300);
  const context = await reviewContext(w, 'reviewer');
  const check = context.independentCheck!;
  // Only what the reviewer may decide: a hard finding the latest check still reports cannot be marked resolved.
  const toDecide = check.findings.filter((f) => f.hard && f.open && !f.current);
  const verdict = await as(w, 'reviewer')(request(w.app).post(`/api/authoring/documents/${k.docId}/review`)).send({
    review_status: 'approved',
    expected: { reviewId: context.myReview?.reviewId, requestedAt: context.myReview?.requestedAt, snapshotHash: context.snapshotHash, bindingBasis: context.bindingBasis },
    ...(toDecide.length ? {
      independent_findings: {
        receiptId: check.receiptId, snapshotHash: check.snapshotHash,
        dispositions: toDecide.map((f) => ({
          findingId: f.findingId, decision: 'resolved',
          reason: 'Read the rewritten section: the figure is restated by the author and cited to the study report synopsis.',
        })),
      },
    } : {}),
  });
  expect(verdict.status, JSON.stringify(verdict.body)).toBe(200);
  const reviewed = await w.asReviewer(request(w.app).post(`/api/authoring/docs/${k.docId}/e-sign`)).send({
    password: PASSWORD, meaning: 'REVIEWER', intent: 'Reviewed for the C2C-101 IND original sequence',
  });
  expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(200);
  return { checked, decided: toDecide.map((f) => f.findingId) };
}

/**
 * 5 · the independent check and the review (reviewOnRoute), then
 * POST /docs/:id/freeze (authoring.router.ts:5392) and POST /docs/:id/e-sign
 * (:5675), each behind assertWorkflowImportRelease.
 */
export async function hopSeal(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('seal');
  const { checked, decided } = await reviewOnRoute(w);
  // DP-35 (2026-10-01): the freeze is signed — its meaning and the author's re-verified password.
  const fr = await w.asAuthor(request(w.app).post(`/api/authoring/docs/${k.docId}/freeze`)).send({
    reason: 'Sealed for the C2C-101 IND original sequence.', meaning: 'AUTHOR', password: PASSWORD,
  });
  expect(fr.status, JSON.stringify(fr.body)).toBe(200);
  k.freezeHash = String(fr.body.contentHash);
  const es = await w.asApprover(request(w.app).post(`/api/authoring/docs/${k.docId}/e-sign`)).send({
    password: PASSWORD, meaning: 'APPROVER', intent: 'Approved for the C2C-101 IND original sequence',
  });
  expect(es.status, JSON.stringify(es.body)).toBe(200);

  await hop.check('check-current-and-findings-decided', 'the independent check’s receipt is for the saved text, it reports no hard finding, and the reviewer’s decision on the earlier one is on the document’s trail', async (observe) => {
    const stillReported = checked.findings.filter((f) => f.hard && f.current);
    const decisions = await q<{ actor_id: string; metadata: unknown }>(
      `SELECT actor_id, metadata FROM authoring_audit_trail WHERE doc_id = $1 AND operation_type = 'INDEPENDENT_FINDING_REVIEW'`, [k.docId]);
    const recorded = decisions.flatMap((d) =>
      ((json(d.metadata).independentCheck as { dispositions?: Array<{ findingId: string; decision: string }> })?.dispositions ?? []));
    observe({ standing: checked.standing, hardStillReported: stillReported.length, decided: decided.length, decisionRows: decisions.length });
    expect(checked.standing).toBe('current');
    expect(stillReported).toEqual([]);
    expect(decided.length).toBeGreaterThanOrEqual(1);
    expect(decisions.map((d) => d.actor_id)).toEqual([REVIEWER.id]);
    expect(recorded).toEqual(decided.map((findingId) => expect.objectContaining({ findingId, decision: 'resolved' })));
  });
  await hop.check('seal-hash-verifies', 'frozen_documents holds the freeze and the approval seal, each hashing its own content', async (observe) => {
    const seals = await q<{ version: string; content_hash: string; frozen_content: string }>(
      'SELECT version, content_hash, frozen_content FROM frozen_documents WHERE document_id = $1 AND tenant_id = $2', [k.docId, ORG_A]);
    observe(seals.map((s) => s.version).sort());
    const freeze = seals.find((s) => s.version === 'v1.0.frozen');
    const approved = seals.find((s) => s.version === 'approved');
    expect(freeze?.content_hash).toBe(k.freezeHash);
    for (const s of [freeze, approved]) expect(s && sha256(s.frozen_content)).toBe(s?.content_hash);
    k.approvedSealHash = approved?.content_hash;
    expect((await q<{ status: string }>('SELECT status FROM authoring_documents WHERE id = $1', [k.docId]))[0].status).toBe('APPROVED');
  });
  // Since a056eb9ea (QA 2026-10-08, j4) the approval writes its own sealed
  // snapshot BEFORE the signature and the signature is bound to it: the approval
  // attests to the snapshot it sealed, not to the earlier freeze.
  await hop.check('signature-binds-seal', 'the APPROVER signature names the snapshot its approval sealed, by version and content hash', async (observe) => {
    const [sig] = await q('SELECT meaning, covered_freeze_version, covered_content_hash, signature_digest FROM authoring_signatures WHERE id = $1', [es.body.signatureId]);
    observe(sig?.covered_freeze_version);
    expect(sig).toMatchObject({ meaning: 'APPROVER', covered_freeze_version: 'approved', covered_content_hash: k.approvedSealHash });
    expect(String(sig.signature_digest)).toMatch(HEX64);
  });
  await hop.check('seal-binds-revision-and-lineage', 'the seal names each section’s doc_revisions head, and each head carries a lineage digest', async (observe) => {
    const [approved] = await q<{ frozen_content: string }>(`SELECT frozen_content FROM frozen_documents WHERE document_id = $1 AND version = 'approved'`, [k.docId]);
    const heads = await q<{ id: string; chain_sha256: string; inputs: unknown }>(
      `SELECT r.id, r.chain_sha256, r.inputs FROM doc_revisions r
        WHERE r.section_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM doc_revisions n WHERE n.prev_chain_sha256 = r.chain_sha256)`, [k.sectionIds]);
    const bound = heads.filter((r) => approved.frozen_content.includes(r.chain_sha256) || approved.frozen_content.includes(r.id));
    const digests = heads.filter((r) => typeof (json(r.inputs).lineage as { digest?: unknown } | undefined)?.digest === 'string');
    observe({ heads: heads.length, bound: bound.length, lineageDigests: digests.length });
    expect(heads).toHaveLength(k.sectionIds!.length);
    expect(bound).toHaveLength(heads.length);
    expect(digests).toHaveLength(heads.length);
  });
  hop.verdict();
}
