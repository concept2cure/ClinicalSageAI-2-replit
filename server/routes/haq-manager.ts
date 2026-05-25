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

const router = Router();
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
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch letters' });
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
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch letter' });
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
    res
      .status(500)
      .json({ success: false, error: err.message || 'Failed to fetch questions' });
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
    res.status(500).json({ success: false, error: err.message || 'Failed to assign question' });
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
    res.status(500).json({ success: false, error: err.message || 'Failed to generate draft' });
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
    res
      .status(500)
      .json({ success: false, error: err.message || 'Failed to submit for review' });
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
    res.status(500).json({ success: false, error: err.message || 'Failed to approve' });
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
    res
      .status(500)
      .json({ success: false, error: err.message || 'Failed to compute dashboard' });
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
