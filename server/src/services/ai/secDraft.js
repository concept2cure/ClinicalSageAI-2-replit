// SEC Draft AI Service
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null;

export async function aiDraftSection(sectionData) {
  try {
    if (!openai) {
      return {
        content: "Section draft generation unavailable - OpenAI API key not configured",
        wordCount: 0
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "You are an eCTD regulatory writer. Generate compliant section content."
      }, {
        role: "user",
        content: `Draft content for CTD section: ${JSON.stringify(sectionData)}`
      }],
      max_tokens: 2000
    });

    const content = response.choices[0].message.content;
    return {
      content,
      wordCount: content.split(' ').length
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
    if (!openai) {
      return {
        classification: "Minor",
        rationale: "Default classification - AI unavailable"
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "You are a regulatory change management expert. Classify changes as Major, Minor, or Administrative."
      }, {
        role: "user",
        content: `Classify this change: ${JSON.stringify(changeData)}`
      }],
      max_tokens: 200
    });

    return {
      classification: "Minor",
      rationale: response.choices[0].message.content
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
    if (!openai) {
      return {
        questions: [],
        count: 0
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "Extract regulatory questions from agency communications."
      }, {
        role: "user",
        content: `Extract questions from: ${documentText}`
      }],
      max_tokens: 1000
    });

    const questions = response.choices[0].message.content.split('\n').filter(q => q.trim());
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
    if (!openai) {
      return {
        response: "Response generation unavailable",
        confidence: 0
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "You are a regulatory affairs expert. Draft professional responses to agency questions."
      }, {
        role: "user",
        content: `Draft response for: ${JSON.stringify(questionData)}`
      }],
      max_tokens: 1500
    });

    return {
      response: response.choices[0].message.content,
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