// QC Coach AI Service - Provides intelligent quality control guidance
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null;

/**
 * AI QC Coach - Provides intelligent guidance for quality control decisions
 * @param {Object} ctx - Context object with QC data
 * @returns {Promise<string>} AI-generated coaching advice
 */
export async function aiQCCoach(ctx) {
  const prompt = `You are an expert Quality Control Coach for pharmaceutical manufacturing. 

Context:
${JSON.stringify(ctx, null, 2)}

Provide actionable, specific coaching advice for the QC team. Focus on:
1. Critical quality issues requiring immediate attention
2. Trending patterns that may indicate process drift
3. Recommended preventive actions
4. Regulatory compliance considerations

Keep response concise (max 300 words), professional, and actionable.`;

  try {
    if (!openai) {
      // Fallback when OpenAI not configured
      return `Based on current QC data:
• Review all out-of-specification (OOS) results immediately
• Verify system suitability test (SST) compliance
• Check trending data for early warning signs
• Ensure all deviations are properly documented
• Consult with QA before release decisions`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.3,
    });
    
    const aiResponse = completion.choices[0]?.message?.content;
    return aiResponse || 'QC Coach AI analysis in progress. Review current data trends and specification compliance.';
  } catch (error) {
    console.error('AI QC Coach error:', error);
    // Fallback response for production reliability
    return `Based on current QC data:
• Review all out-of-specification (OOS) results immediately
• Verify system suitability test (SST) compliance
• Check trending data for early warning signs
• Ensure all deviations are properly documented
• Consult with QA before release decisions`;
  }
}

/**
 * AI Explain Hold - Explains why a batch is on hold with detailed reasoning
 * @param {Object} summary - Batch summary with test results and issues
 * @returns {Promise<string>} AI-generated explanation for hold decision
 */
export async function aiExplainHold(summary) {
  const prompt = `You are a pharmaceutical quality expert explaining why a batch is on HOLD.

Batch Summary:
${JSON.stringify(summary, null, 2)}

Provide a clear, professional explanation for the HOLD decision that:
1. Identifies specific test failures or specification deviations
2. Explains the regulatory and quality impact
3. Outlines required corrective actions before release
4. References relevant regulatory requirements (21 CFR, ICH guidelines)

Keep response clear and concise (max 250 words), suitable for QA review.`;

  try {
    if (!openai) {
      // Fallback when OpenAI not configured
      const issues = summary?.issues || [];
      const failedTests = issues.filter(i => i.status === 'FAIL').map(i => i.test_name).join(', ');
      
      return `BATCH HOLD REASON:
This batch cannot be released due to quality control failures.

Failed Tests: ${failedTests || 'Multiple specification deviations detected'}

Required Actions:
1. Complete investigation per deviation procedure
2. Document root cause analysis
3. Implement corrective and preventive actions (CAPA)
4. Obtain QA approval before retest or disposition

Regulatory Basis: 21 CFR 211.165 - Testing and release for distribution
ICH Q7 - Good Manufacturing Practice Guide for Active Pharmaceutical Ingredients`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.2,
    });
    
    const aiResponse = completion.choices[0]?.message?.content;
    return aiResponse || 'Batch on HOLD due to specification non-conformance. QA review required before release.';
  } catch (error) {
    console.error('AI Explain Hold error:', error);
    // Fallback response ensuring critical information is communicated
    const issues = summary?.issues || [];
    const failedTests = issues.filter(i => i.status === 'FAIL').map(i => i.test_name).join(', ');
    
    return `BATCH HOLD REASON:
This batch cannot be released due to quality control failures.

Failed Tests: ${failedTests || 'Multiple specification deviations detected'}

Required Actions:
1. Complete investigation per deviation procedure
2. Document root cause analysis
3. Implement corrective and preventive actions (CAPA)
4. Obtain QA approval before retest or disposition

Regulatory Basis: 21 CFR 211.165 - Testing and release for distribution
ICH Q7 - Good Manufacturing Practice Guide for Active Pharmaceutical Ingredients`;
  }
}
