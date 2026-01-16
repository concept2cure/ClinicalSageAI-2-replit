import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const AnalystAgent = {
  /**
   * Performs a "Deep Dive" with Project ID tracking.
   * Input Context Format: "[ID: 123] Project Name (Description)"
   */
  async analyzeImpact(insight: string, source: string, activeContext: string[] = []) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a Senior Regulatory Consultant for a MedTech company. 
            
            TASK: Analyze this regulatory finding.
            CONTEXT: ${activeContext.join('; ') || 'No active projects.'}
            
            OUTPUT JSON ONLY:
            {
              "summary": "Executive summary (1 sentence)",
              "impact_assessment": "Detailed regulatory analysis.",
              "project_conflicts": [
                {
                  "project_name": "Name from context",
                  "project_id": "ID extracted from context (e.g. 123)",
                  "risk_rationale": "Why this specific project is at risk"
                }
              ],
              "action_items": ["Action 1", "Action 2"],
              "related_regulations": ["Regulation 1", "Regulation 2"],
              "risk_level": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
            }`,
          },
          { role: 'user', content: `Source: ${source}\nFinding: ${insight}` },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      console.error('[Analyst] Analysis Failed:', error);
      return null;
    }
  },
};
