// Regulatory AI Service
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null;

export async function aiRiskSummary(programData) {
  try {
    if (!openai) {
      return {
        summary: "Regulatory risk assessment unavailable - OpenAI API key not configured",
        riskLevel: "medium",
        factors: []
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "You are a regulatory affairs expert. Provide a concise risk assessment summary."
      }, {
        role: "user",
        content: `Assess regulatory risks for: ${JSON.stringify(programData)}`
      }],
      max_tokens: 500
    });

    return {
      summary: response.choices[0].message.content,
      riskLevel: "low",
      factors: []
    };
  } catch (error) {
    console.error('AI Risk Summary error:', error);
    return {
      summary: "Unable to generate risk assessment",
      riskLevel: "medium",
      factors: []
    };
  }
}

export async function aiNextActions(programData) {
  try {
    if (!openai) {
      return {
        actions: ["Review regulatory requirements", "Prepare submission documents"],
        timeline: "Standard timeline applies"
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "You are a regulatory strategist. Provide actionable next steps."
      }, {
        role: "user",
        content: `Recommend next regulatory actions for: ${JSON.stringify(programData)}`
      }],
      max_tokens: 300
    });

    return {
      actions: response.choices[0].message.content.split('\n').filter(a => a.trim()),
      timeline: "Based on regulatory requirements"
    };
  } catch (error) {
    console.error('AI Next Actions error:', error);
    return {
      actions: ["Continue with standard regulatory process"],
      timeline: "Follow standard timeline"
    };
  }
}

export async function aiGateCheckFindings(data) {
  try {
    if (!openai) {
      return {
        findings: [{
          severity: 'info',
          category: 'API',
          message: 'OpenAI API key not configured',
          recommendation: 'Configure OpenAI API key for AI-powered gate checks'
        }]
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "You are a regulatory compliance expert. Identify gate check findings."
      }, {
        role: "user",
        content: `Review for gate check findings: ${JSON.stringify(data)}`
      }],
      max_tokens: 800
    });

    return {
      findings: response.choices[0].message.content
    };
  } catch (error) {
    console.error('AI Gate Check error:', error);
    return { findings: [] };
  }
}

export async function aiClassifyChange(changeData) {
  try {
    if (!openai) {
      return {
        regions: ['FDA'],
        risk: 'medium',
        impact: 'moderate'
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "You are a regulatory Q12 expert. Classify changes by impacted regions and risk."
      }, {
        role: "user",
        content: `Classify this regulatory change: ${JSON.stringify(changeData)}`
      }],
      max_tokens: 300
    });

    return {
      regions: ['FDA', 'EMA'],
      risk: 'low',
      impact: response.choices[0].message.content
    };
  } catch (error) {
    console.error('AI Classify Change error:', error);
    return {
      regions: ['FDA'],
      risk: 'medium',
      impact: 'Standard change classification'
    };
  }
}

export async function aiExtractQuestions(normalizedText, options = {}) {
  try {
    if (!openai) {
      return [{
        text: normalizedText,
        section_suggest: null,
        due_date: options.due || null,
        severity: 'MAJOR',
        region: options.region || null
      }];
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "You are a regulatory affairs expert. Extract individual questions from agency communications. Return a JSON array of questions with fields: text, section_suggest, severity (MAJOR/MINOR), due_date."
      }, {
        role: "user",
        content: `Extract questions from this agency communication:\n\n${normalizedText}\n\nRegion: ${options.region || 'N/A'}\nDue date: ${options.due || 'N/A'}`
      }],
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result.questions || [{
      text: normalizedText,
      section_suggest: null,
      due_date: options.due || null,
      severity: 'MAJOR',
      region: options.region || null
    }];
  } catch (error) {
    console.error('AI Extract Questions error:', error);
    return [{
      text: normalizedText,
      section_suggest: null,
      due_date: options.due || null,
      severity: 'MAJOR',
      region: options.region || null
    }];
  }
}

export async function aiDraftResponse(questionText, evidence, tone = 'Neutral') {
  try {
    if (!openai) {
      return {
        md: `**Response to Question:**\n\n${questionText}\n\n*OpenAI API key not configured - please configure to enable AI-powered response drafting.*\n\n**Evidence:**\n${evidence ? '- Evidence available but not processed' : '- No evidence provided'}`,
        used: []
      };
    }

    const evidenceText = Array.isArray(evidence) 
      ? evidence.map((e, i) => `${i + 1}. ${JSON.stringify(e)}`).join('\n')
      : JSON.stringify(evidence);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: `You are a regulatory affairs expert drafting responses to agency questions. Use a ${tone} tone suitable for ${tone === 'FDA' ? 'FDA submissions' : tone === 'EMA' ? 'EMA submissions' : 'regulatory submissions'}. Provide responses in markdown format.`
      }, {
        role: "user",
        content: `Draft a response to this question:\n\n${questionText}\n\nAvailable Evidence:\n${evidenceText}`
      }],
      max_tokens: 1500
    });

    return {
      md: response.choices[0].message.content,
      used: Array.isArray(evidence) ? evidence.slice(0, 3) : []
    };
  } catch (error) {
    console.error('AI Draft Response error:', error);
    return {
      md: `**Response to Question:**\n\n${questionText}\n\n*Error generating AI response. Please draft manually.*`,
      used: []
    };
  }
}

export async function aiIRDraft(questionText, context = {}) {
  try {
    if (!openai) {
      return {
        draft: `**Information Request Response**\n\n**Question:** ${questionText}\n\n**Response:**\n\n*OpenAI API key not configured - please configure to enable AI-powered IR drafting.*`,
        sections: [],
        confidence: 'low'
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "You are a regulatory affairs expert drafting responses to information requests. Provide detailed, compliant responses in markdown format."
      }, {
        role: "user",
        content: `Draft a response to this information request:\n\nQuestion: ${questionText}\n\nContext: ${JSON.stringify(context)}`
      }],
      max_tokens: 1200
    });

    return {
      draft: response.choices[0].message.content,
      sections: [],
      confidence: 'medium'
    };
  } catch (error) {
    console.error('AI IR Draft error:', error);
    return {
      draft: `**Information Request Response**\n\n**Question:** ${questionText}\n\n**Response:**\n\n*Error generating response. Please draft manually.*`,
      sections: [],
      confidence: 'low'
    };
  }
}

// Export alias for backwards compatibility
export const aiChangeClassify = aiClassifyChange;

export default {
  aiRiskSummary,
  aiNextActions,
  aiGateCheckFindings,
  aiClassifyChange,
  aiChangeClassify,
  aiExtractQuestions,
  aiDraftResponse,
  aiIRDraft
};