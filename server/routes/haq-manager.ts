/**
 * HAQ Response Manager — Health Authority Question Response System
 *
 * Closes Weave.bio Gap #1: Dedicated HAQ Manager that:
 *  1. Extracts questions from FDA IR/EMA D120/PMDA query letters
 *  2. Tracks question-by-question with assignees and deadlines
 *  3. AI-drafts responses using prior submissions and knowledge base
 *  4. Cross-functional review workflow with approval gates
 *
 * Data persisted in projectMemoryEntries with category 'haq_question'.
 */

import { Router, Request, Response } from 'express';
import { createFeatureStore } from '../utils/feature-persistence';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('haq-manager');
const store = createFeatureStore('haq_question');

function getOrgId(req: Request): number {
  return (
    (req as any).tenantContext?.organizationId ||
    (req as any).tenantId ||
    (req as any).organizationId ||
    (req as any).user?.organizationId ||
    1
  );
}

/**
 * GET /rounds — the v2 HaqManager display contract: authority letters as
 * "rounds" plus their questions grouped by round, shaped to exactly the keys
 * the surface renders (id/disc/tone/status/q/draft/cites/commitments). The
 * surface adopts this via liveGet and falls back to its codebase fixture when
 * the store is empty, so it never renders a blank workbench.
 *
 * An unprovisioned store (42P01) still degrades to `{ data: null,
 * pendingStore: true }` — that is a deployment state, not a fault. Every OTHER
 * error is now a 500. Previously any exception produced the same 200, so a
 * failed read of an authority's outstanding questions was indistinguishable
 * from "this org has no open HAQs" — the reading that lets a response deadline
 * pass unnoticed.
 */
router.get('/rounds', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const letters = await store.query(orgId, 'letter');
    if (letters.length === 0) {
      return res.json({ data: null, meta: { count: 0 } });
    }
    const questions = await store.query(orgId, 'question');

    const rounds = letters.map((l: any) => ({
      id: l.letterId,
      agency: l.agency,
      flag: l.flag,
      authority: l.authority,
      submission: l.submission,
      type: l.type,
      received: l.received,
      due: l.due,
      clockDays: l.clockDays,
      clockTotal: l.clockTotal,
      note: l.note,
    }));

    const byRound: Record<string, any[]> = {};
    for (const r of rounds) byRound[r.id] = [];
    for (const q of questions) {
      const rid = q.letterId;
      if (!byRound[rid]) continue;
      byRound[rid].push({
        id: q.qid,
        // The numeric feature-store row id — REQUIRED by the /review, /approve,
        // /assign and /ai-draft endpoints (which key on store.getById, not the
        // display qid). Without this the client cannot construct those URLs.
        dbId: q.id,
        disc: q.disc,
        tone: q.tone,
        status: q.status,
        owner: q.owner,
        q: q.q,
        analysis: q.analysis,
        draft: q.draft,
        cites: Array.isArray(q.cites) ? q.cites : [],
        commitments: Array.isArray(q.commitments) ? q.commitments : [],
        precedentNote: q.precedentNote,
        roundId: rid,
      });
    }

    res.json({ data: { rounds, questions: byRound }, meta: { count: rounds.length } });
  } catch (err) {
    if ((err as { code?: string } | null)?.code === '42P01') {
      return res.json({ data: null, meta: { count: 0, pendingStore: true } });
    }
    console.error(
      '[haq-manager] GET /rounds failed:',
      err instanceof Error ? err.message : String(err),
    );
    return res.status(500).json({
      error: { code: 'INTERNAL', message: 'Failed to read HAQ rounds.' },
    });
  }
});

/**
 * POST /questions — WRITE-BACK for the v2 HaqManager "Log question" form.
 *
 * Persists a plain question row into the feature store (category 'haq_question',
 * subcategory 'question') keyed to its round via `letterId`, so the next
 * GET /rounds surfaces it under that round. The stored payload uses exactly the
 * keys the GET /rounds mapper reads, and the response echoes the question mapped
 * exactly as GET /rounds maps questions, so the client can adopt it verbatim.
 *
 * Honesty: this is a plain persisted create, not an audited ledger entry — the
 * HAQ store carries no signature/reason-for-change trail, so nothing here claims
 * governance it lacks. On any store/db error we return 500 and the client keeps
 * its local copy rather than pretend the write happened.
 */
router.post('/questions', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const { roundId, qid, disc, tone, q, owner, status } = req.body || {};

  if (!roundId || !q) {
    return res
      .status(400)
      .json({ error: 'roundId and q are required to log a question' });
  }

  const questionId = (qid && String(qid).trim()) || `IR-${Date.now()}`;
  const payload = {
    qid: questionId,
    letterId: roundId,
    disc: disc || 'Regulatory',
    tone: tone || 'warn',
    status: status || 'draft',
    owner: owner || '',
    q,
    analysis: '',
    draft: '',
    cites: [] as any[],
    commitments: [] as any[],
    precedentNote:
      'Run a precedent compare to see how prior submissions answered this.',
  };

  try {
    await store.insert(orgId, 'question', questionId, payload);

    // Map exactly as GET /rounds maps questions so the client adopts it verbatim.
    const data = {
      id: payload.qid,
      disc: payload.disc,
      tone: payload.tone,
      status: payload.status,
      owner: payload.owner,
      q: payload.q,
      analysis: payload.analysis,
      draft: payload.draft,
      cites: Array.isArray(payload.cites) ? payload.cites : [],
      commitments: Array.isArray(payload.commitments) ? payload.commitments : [],
      precedentNote: payload.precedentNote,
      roundId,
    };

    return res.status(201).json({ data, meta: { created: true } });
  } catch (err: any) {
    return serverError(res, logger, 'saving questions', err);
  }
});

router.get('/letters', async (_req: Request, res: Response) => {
  try {
    const orgId = getOrgId(_req);
    const letters = await store.query(orgId, 'letter');
    const questions = await store.query(orgId, 'question');

    const enriched = letters.map((l: any) => {
      const lQuestions = questions.filter((q: any) => q.letterId === l.letterId);
      return {
        ...l,
        questions: undefined,
        summary: {
          total: lQuestions.length,
          new: lQuestions.filter((q: any) => q.status === 'new').length,
          drafting: lQuestions.filter(
            (q: any) => q.status === 'drafting' || q.status === 'assigned',
          ).length,
          inReview: lQuestions.filter((q: any) => q.status === 'in_review').length,
          approved: lQuestions.filter((q: any) => q.status === 'approved').length,
          submitted: lQuestions.filter((q: any) => q.status === 'submitted').length,
        },
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err: any) {
    return serverError(res, logger, 'loading letters', err);
  }
});

router.get('/letters/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const letterId = req.params.id;

    const letters = await store.query(orgId, 'letter', (l: any) => l.letterId === letterId);
    if (letters.length === 0)
      return res.status(404).json({ success: false, error: 'Letter not found' });

    const questions = await store.query(
      orgId,
      'question',
      (q: any) => q.letterId === letterId,
    );

    const letter = letters[0];
    res.json({ success: true, data: { ...letter, questions } });
  } catch (err: any) {
    return serverError(res, logger, 'loading letters', err);
  }
});

router.get('/letters/:id/questions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const letterId = req.params.id;

    const letters = await store.query(orgId, 'letter', (l: any) => l.letterId === letterId);
    if (letters.length === 0)
      return res.status(404).json({ success: false, error: 'Letter not found' });

    const questions = await store.query(
      orgId,
      'question',
      (q: any) => q.letterId === letterId,
    );

    res.json({ success: true, data: questions });
  } catch (err: any) {
    return serverError(res, logger, 'loading questions', err);
  }
});

router.post('/letters/:id/questions/:qid/assign', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const questionDbId = parseInt(String(req.params.qid), 10);

    const question = await store.getById(questionDbId, orgId);
    if (!question)
      return res.status(404).json({ success: false, error: 'Question not found' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = question;
    const updated = {
      ...data,
      assignee: req.body.assignee,
      assigneeDepartment: req.body.department,
      status: 'assigned',
    };

    const result = await store.update(questionDbId, orgId, updated);
    res.json({ success: true, data: result });
  } catch (err: any) {
    return serverError(res, logger, 'assigning questions', err);
  }
});

router.post('/letters/:id/questions/:qid/ai-draft', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const questionDbId = parseInt(String(req.params.qid), 10);

    const question = await store.getById(questionDbId, orgId);
    if (!question)
      return res.status(404).json({ success: false, error: 'Question not found' });

    const aiDraft = await generateAIDraft(question);
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = question;
    const updated = {
      ...data,
      draftResponse: aiDraft.response,
      aiConfidence: aiDraft.confidence,
      sourceReferences: aiDraft.sources,
      status: 'drafting',
    };

    const result = await store.update(questionDbId, orgId, updated);
    res.json({ success: true, data: result });
  } catch (err: any) {
    return serverError(res, logger, 'saving AI draft', err);
  }
});

router.post('/letters/:id/questions/:qid/review', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const questionDbId = parseInt(String(req.params.qid), 10);

    const question = await store.getById(questionDbId, orgId);
    if (!question)
      return res.status(404).json({ success: false, error: 'Question not found' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = question;
    const reviewComments = data.reviewComments || [];
    if (req.body.comment) {
      reviewComments.push({
        reviewer: req.body.reviewer || 'Reviewer',
        comment: req.body.comment,
        timestamp: new Date().toISOString(),
      });
    }

    const updated = { ...data, status: 'in_review', reviewComments };
    const result = await store.update(questionDbId, orgId, updated);
    res.json({ success: true, data: result });
  } catch (err: any) {
    return serverError(res, logger, 'saving review', err);
  }
});

router.post('/letters/:id/questions/:qid/approve', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const questionDbId = parseInt(String(req.params.qid), 10);

    const question = await store.getById(questionDbId, orgId);
    if (!question)
      return res.status(404).json({ success: false, error: 'Question not found' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = question;
    const updated = { ...data, status: 'approved' };
    const result = await store.update(questionDbId, orgId, updated);

    res.json({ success: true, data: result });
  } catch (err: any) {
    return serverError(res, logger, 'approving questions', err);
  }
});

/**
 * POST /letters/:id/assemble — the response package the whole workbench builds
 * toward.
 *
 * The surface's "Assemble response package" button had NO onClick at all: a
 * user approved every question in a round, clicked the primary action, and
 * nothing happened. This is the thing it names.
 *
 * The package is assembled from the round's OWN approved responses — the
 * question text, the approved response, its citations and its commitments, in
 * question order. Nothing is drafted here and nothing is inferred: a question
 * whose response is empty is reported as empty rather than filled in.
 *
 * Fails closed. If any question in the round is not approved the package is
 * refused with the list of what is outstanding — an agency response package
 * that silently omits an unapproved answer, or ships a draft as if it were
 * approved, is the failure mode this exists to prevent.
 */
router.post('/letters/:id/assemble', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const letterId = String(req.params.id);

    const letters = await store.query(orgId, 'letter');
    const letter = letters.find((l: any) => String(l.letterId) === letterId);
    if (!letter) {
      return res.status(404).json({ success: false, error: 'Round not found in this organization.' });
    }

    const all = await store.query(orgId, 'question');
    const qs = all.filter((q: any) => String(q.letterId) === letterId);
    if (qs.length === 0) {
      return res.status(409).json({
        success: false,
        error: 'This round has no questions recorded, so there is no response package to assemble.',
      });
    }

    const outstanding = qs
      .filter((q: any) => String(q.status) !== 'approved')
      .map((q: any) => ({ id: q.qid, status: q.status ?? 'unknown' }));
    if (outstanding.length > 0) {
      return res.status(409).json({
        success: false,
        error:
          `${outstanding.length} of ${qs.length} responses are not approved, so the package was not assembled: ` +
          outstanding.map((o) => `${o.id} (${o.status})`).join(', ') + '.',
        outstanding,
      });
    }

    // Deterministic question order — the display id, numerically where it ends
    // in a number so Q10 follows Q9 rather than Q1.
    const ordered = [...qs].sort((a: any, b: any) => {
      const na = parseInt(String(a.qid).replace(/\D+/g, ''), 10);
      const nb = parseInt(String(b.qid).replace(/\D+/g, ''), 10);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return String(a.qid).localeCompare(String(b.qid));
    });

    const missingResponses: string[] = [];
    const sections = ordered.map((q: any) => {
      const draft = typeof q.draft === 'string' ? q.draft.trim() : '';
      if (!draft) missingResponses.push(String(q.qid));
      const cites = Array.isArray(q.cites) ? q.cites : [];
      const commitments = Array.isArray(q.commitments) ? q.commitments : [];
      const parts = [
        `## ${q.qid}${q.disc ? ' — ' + q.disc : ''}`,
        '',
        '**Question**',
        '',
        String(q.q ?? '').trim() || '_(no question text recorded)_',
        '',
        '**Response**',
        '',
        draft || '_(no approved response text is recorded for this question)_',
      ];
      if (cites.length) {
        parts.push('', '**Supporting references**', '', ...cites.map((c: unknown) => `- ${String(c)}`));
      }
      if (commitments.length) {
        parts.push('', '**Commitments**', '', ...commitments.map((c: unknown) => `- ${String(c)}`));
      }
      return parts.join('\n');
    });

    const header = [
      `# Response to ${letter.authority ?? letter.agency ?? 'health authority'} ${letter.type ?? 'questions'}`,
      '',
      ...[
        letter.submission ? `**Submission:** ${letter.submission}` : null,
        letter.agency ? `**Agency:** ${letter.agency}` : null,
        letter.received ? `**Letter received:** ${letter.received}` : null,
        letter.due ? `**Response due:** ${letter.due}` : null,
        `**Questions in this round:** ${ordered.length}`,
      ].filter(Boolean) as string[],
      '',
      '---',
    ].join('\n');

    return res.json({
      success: true,
      data: {
        letterId,
        questionCount: ordered.length,
        markdown: [header, ...sections].join('\n\n'),
        // Named honestly rather than silently: an approved question that
        // carries no response text still assembles, but the caller is told.
        questionsWithNoResponseText: missingResponses,
        title: `Response package — ${letter.submission ?? letter.authority ?? letterId}`,
      },
    });
  } catch (err: any) {
    if (err?.code === '42P01') {
      return res.status(503).json({ success: false, error: 'The HAQ store is not provisioned in this deployment.' });
    }
    console.error('[haq-manager] assemble failed:', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ success: false, error: 'Failed to assemble the response package.' });
  }
});

router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const orgId = getOrgId(_req);
    const letters = await store.query(orgId, 'letter');
    const allQuestions = await store.query(orgId, 'question');

    const overdue = allQuestions.filter(
      (q: any) => q.daysRemaining <= 0 && q.status !== 'submitted' && q.status !== 'approved',
    );
    const urgent = allQuestions.filter(
      (q: any) => q.daysRemaining <= 3 && q.daysRemaining > 0,
    );

    res.json({
      success: true,
      data: {
        activeLetters: letters.filter((l: any) => l.status === 'active').length,
        totalQuestions: allQuestions.length,
        unanswered: allQuestions.filter(
          (q: any) => q.status === 'new' || q.status === 'assigned',
        ).length,
        inDrafting: allQuestions.filter((q: any) => q.status === 'drafting').length,
        inReview: allQuestions.filter((q: any) => q.status === 'in_review').length,
        approved: allQuestions.filter((q: any) => q.status === 'approved').length,
        overdue: overdue.length,
        urgent: urgent.length,
        byAgency: {
          fda: allQuestions.filter((q: any) => q.agency === 'fda').length,
          ema: allQuestions.filter((q: any) => q.agency === 'ema').length,
          pmda: allQuestions.filter((q: any) => q.agency === 'pmda').length,
          hc: allQuestions.filter((q: any) => q.agency === 'hc').length,
        },
        byPriority: {
          critical: allQuestions.filter((q: any) => q.priority === 'critical').length,
          major: allQuestions.filter((q: any) => q.priority === 'major').length,
          minor: allQuestions.filter((q: any) => q.priority === 'minor').length,
        },
      },
    });
  } catch (err: any) {
    return serverError(res, logger, 'loading dashboard', err);
  }
});

/**
 * Draft a Health Authority Question response using the AI gateway.
 *
 * History: the prior implementation was a 3-entry static lookup table of
 * canned regulatory paragraphs keyed by module, with a Math.random()
 * "confidence" and a synthesized source citation — fabrication dressed as
 * an AI draft. It now routes through the AI gateway with the real question
 * context.
 *
 * Honesty constraints:
 *   - No invented confidence score. The gateway returns no calibrated
 *     confidence, so `confidence` is null (the caller persists it as-is).
 *     A real confidence would require a scored retrieval pipeline.
 *   - No synthesized source citations. Sources is empty until a real
 *     knowledge-base retrieval is wired — fabricating `SRC-xxx` doc ids
 *     was part of the original liability.
 *   - The draft is explicitly a starting point for human review (HAQ
 *     responses are always reviewed + approved before submission via the
 *     /review and /approve handlers in this router).
 */
async function generateAIDraft(question: any): Promise<{
  response: string;
  confidence: number | null;
  sources: { docId: string; section: string; excerpt: string }[];
}> {
  const { getGateway } = await import('../services/ai-gateway');
  const gateway = getGateway();

  const result = await gateway.route({
    taskType: 'regulatory_review',
    messages: [
      {
        role: 'system',
        content:
          'You are a regulatory affairs writer drafting a response to a Health Authority ' +
          'Question (FDA Information Request, EMA Day-120, PMDA query). Write a precise, ' +
          'professional draft response grounded only in what the question states and ' +
          'standard regulatory practice. Do NOT invent study results, numeric data, or ' +
          'citations to specific documents — where supporting data is required, indicate ' +
          'with a clear placeholder what the submitter must attach. The draft will be ' +
          'reviewed and edited by a human before submission. Return plain prose only.',
      },
      {
        role: 'user',
        content: `Draft a response to the following Health Authority Question.

Question metadata:
${JSON.stringify(
  {
    module: question.module,
    section: question.section,
    questionNumber: question.questionNumber,
    questionText: question.questionText ?? question.text ?? question.question,
    agency: question.agency,
  },
  null,
  2
)}`,
      },
    ],
    maxTokens: 1500,
    temperature: 0.3,
    strategy: 'quality_optimized',
    callerModule: 'haq-manager/ai-draft',
  });

  return {
    response:
      result.content?.trim() ||
      "A detailed response addressing the agency's inquiry should be drafted here.",
    confidence: null,
    sources: [],
  };
}

export default router;
