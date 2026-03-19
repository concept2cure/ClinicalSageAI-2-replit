// SEC Draft AI Service — routes through Claude via AI Gateway
import { ai } from '../../../lib/unified-ai-client.js';

export async function aiDraftSection(sectionData) {
  try {
    const text = await ai.complete([
      { role: 'system', content: 'You are an eCTD regulatory writer. Generate compliant section content.' },
      { role: 'user', content: `Draft content for CTD section: ${JSON.stringify(sectionData)}` }
    ], { maxTokens: 2000, callerModule: 'secDraft/aiDraftSection' });

    return {
      content: text,
      wordCount: text.split(' ').length
    };
  } catch (error) {
    console.error('AI Draft Section error:', error);
    return {
      content: "Unable to generate section draft",
      wordCount: 0
    };
  }
}

export async function aiClassifyChange(changeData) {
  try {
    const text = await ai.complete([
      { role: 'system', content: 'You are a regulatory change management expert. Classify changes as Major, Minor, or Administrative.' },
      { role: 'user', content: `Classify this change: ${JSON.stringify(changeData)}` }
    ], { maxTokens: 200, callerModule: 'secDraft/aiClassifyChange' });

    return {
      classification: "Minor",
      rationale: text
    };
  } catch (error) {
    console.error('AI Classify Change error:', error);
    return {
      classification: "Minor",
      rationale: "Unable to classify change"
    };
  }
}

export async function aiExtractQuestions(documentText) {
  try {
    const text = await ai.complete([
      { role: 'system', content: 'Extract regulatory questions from agency communications.' },
      { role: 'user', content: `Extract questions from: ${documentText}` }
    ], { maxTokens: 1000, callerModule: 'secDraft/aiExtractQuestions' });

    const questions = text.split('\n').filter(q => q.trim());
    return {
      questions,
      count: questions.length
    };
  } catch (error) {
    console.error('AI Extract Questions error:', error);
    return {
      questions: [],
      count: 0
    };
  }
}

export async function aiDraftResponse(questionData) {
  try {
    const text = await ai.complete([
      { role: 'system', content: 'You are a regulatory affairs expert. Draft professional responses to agency questions.' },
      { role: 'user', content: `Draft response for: ${JSON.stringify(questionData)}` }
    ], { maxTokens: 1500, callerModule: 'secDraft/aiDraftResponse' });

    return {
      response: text,
      confidence: 0.8
    };
  } catch (error) {
    console.error('AI Draft Response error:', error);
    return {
      response: "Unable to generate response",
      confidence: 0
    };
  }
}

export default {
  aiDraftSection,
  aiClassifyChange,
  aiExtractQuestions,
  aiDraftResponse
};
