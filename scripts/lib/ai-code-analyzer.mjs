/**
 * AI-powered code conflict analysis and resolution
 * This module provides optional AI assistance for resolving complex code conflicts
 */

/**
 * Analyze code conflict using AI (if API key available)
 */
export async function aiResolveCode(baseContent, headContent, context = {}) {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiKey) {
    return {
      resolved: false,
      confidence: 0,
      reason: 'AI analysis unavailable (no API key)',
      requiresManual: true
    };
  }
  
  try {
    // Import dynamically to avoid errors if openai package not available
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiKey });
    
    const filePath = context.filePath || 'unknown';
    const fileType = filePath.split('.').pop();
    
    const prompt = `You are a code conflict resolution assistant. Analyze the following merge conflict and provide a resolution.

File: ${filePath}
File Type: ${fileType}

Base version (main branch):
\`\`\`
${baseContent}
\`\`\`

Head version (PR branch):
\`\`\`
${headContent}
\`\`\`

Instructions:
1. Analyze both versions to understand the intent of each change
2. Determine if the changes can be merged without breaking functionality
3. If mergeable, provide the resolved code that preserves both changes
4. If not mergeable, explain why manual resolution is needed

Respond with a JSON object:
{
  "canResolve": boolean,
  "confidence": number (0-100),
  "resolution": "merged code if canResolve is true",
  "explanation": "brief explanation of the resolution or why manual review is needed",
  "preservesBoth": boolean
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: 'You are an expert software engineer specializing in merge conflict resolution.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    
    if (result.canResolve && result.confidence >= 70) {
      return {
        resolved: true,
        content: result.resolution,
        confidence: Math.min(result.confidence, 70), // Cap AI confidence at 70
        reason: `AI resolution: ${result.explanation}`,
        aiGenerated: true,
        preservesBoth: result.preservesBoth
      };
    } else {
      return {
        resolved: false,
        confidence: 0,
        reason: result.explanation,
        requiresManual: true,
        aiAnalysis: result
      };
    }
  } catch (error) {
    console.error('AI resolution error:', error.message);
    return {
      resolved: false,
      confidence: 0,
      reason: `AI analysis failed: ${error.message}`,
      requiresManual: true
    };
  }
}

/**
 * Generate a detailed conflict report for manual review
 */
export function createConflictReport(conflicts, context = {}) {
  const { prNumber, filePath } = context;
  
  let report = `## Merge Conflict Analysis Report\n\n`;
  report += `**PR #${prNumber}**\n`;
  report += `**File:** \`${filePath}\`\n\n`;
  report += `### Conflicts Detected\n\n`;
  
  conflicts.forEach((conflict, index) => {
    report += `#### Conflict ${index + 1}\n\n`;
    report += `**Location:** Lines ${conflict.startLine}-${conflict.endLine}\n\n`;
    report += `**Base Version:**\n\`\`\`\n${conflict.base}\n\`\`\`\n\n`;
    report += `**PR Version:**\n\`\`\`\n${conflict.head}\n\`\`\`\n\n`;
    
    if (conflict.aiAnalysis) {
      report += `**AI Analysis:** ${conflict.aiAnalysis}\n\n`;
    }
    
    report += `---\n\n`;
  });
  
  report += `### Recommendation\n\n`;
  report += `This conflict requires manual review and resolution. `;
  report += `Please review both versions carefully to determine the best way to merge these changes.\n`;
  
  return report;
}

export default {
  aiResolveCode,
  createConflictReport
};
