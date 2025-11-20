/**
 * Context-Aware Regulatory Guidance Service
 * Provides intelligent, proactive assistance based on current eCTD module/section
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// eCTD Module Context Definitions
const ECTD_MODULE_CONTEXTS = {
  module1: {
    name: 'Administrative Information',
    sections: {
      1.2: 'Cover Letter',
      1.3: 'Administrative and Prescribing Information',
      1.4: 'Information about the Experts',
      1.5: 'Specific Requirements for Different Regions',
    },
    keyGuidelines: [
      '21 CFR 312.23 - IND Content and Format',
      'FDA Form 1571 - Investigational New Drug Application',
      'ICH M4 - Organization of CTD',
    ],
  },
  module2: {
    name: 'CTD Summaries',
    sections: {
      2.2: 'Introduction',
      2.3: 'Quality Overall Summary',
      2.4: 'Nonclinical Overview',
      2.5: 'Clinical Overview',
      2.6: 'Nonclinical Written and Tabulated Summaries',
      2.7: 'Clinical Summary',
    },
    keyGuidelines: [
      'ICH M4E(R2) - Enhancement of M4',
      'FDA Guidance for Clinical Data Summary',
      'ICH E3 - Structure and Content of Clinical Study Reports',
    ],
  },
  module3: {
    name: 'Quality',
    sections: {
      '3.2.S': 'Drug Substance',
      '3.2.P': 'Drug Product',
      '3.2.A': 'Appendices',
      '3.2.R': 'Regional Information',
    },
    keyGuidelines: [
      'ICH Q6A - Specifications',
      'ICH Q7 - Good Manufacturing Practice',
      'ICH Q8 - Pharmaceutical Development',
      'ICH Q9 - Quality Risk Management',
      'ICH Q10 - Pharmaceutical Quality System',
    ],
  },
  module4: {
    name: 'Nonclinical Study Reports',
    sections: {
      '4.2.1': 'Pharmacology',
      '4.2.2': 'Pharmacokinetics',
      '4.2.3': 'Toxicology',
    },
    keyGuidelines: [
      'ICH S6 - Preclinical Safety Evaluation',
      'ICH S7A - Safety Pharmacology Studies',
      'ICH M3(R2) - Nonclinical Safety Studies',
    ],
  },
  module5: {
    name: 'Clinical Study Reports',
    sections: {
      5.2: 'Tabulated Summaries',
      5.3: 'Clinical Study Reports',
      5.4: 'Literature References',
    },
    keyGuidelines: [
      'ICH E6(R2) - Good Clinical Practice',
      'ICH E3 - Structure and Content of Clinical Study Reports',
      'ICH E9 - Statistical Principles for Clinical Trials',
    ],
  },
};

// Historical FDA Comments Database (simulated - in production would be from real database)
const FDA_HISTORICAL_COMMENTS = {
  'module2.5': [
    {
      comment:
        'The clinical overview should provide a critical analysis of the clinical data and should not merely summarize the individual studies.',
      frequency: 'High',
      context: 'Clinical Overview Section',
      recommendation:
        'Include comparative analysis across studies and discuss clinical significance of findings.',
    },
    {
      comment: 'Provide adequate justification for the starting dose in first-in-human studies.',
      frequency: 'High',
      context: 'Dose Selection',
      recommendation:
        'Include NOAEL calculations, safety margins, and allometric scaling rationale.',
    },
  ],
  'module3.2.S': [
    {
      comment:
        'Control strategy should be based on product and process understanding and should identify critical quality attributes.',
      frequency: 'High',
      context: 'Control Strategy',
      recommendation: 'Link specifications to safety and efficacy through risk assessment.',
    },
  ],
  'module4.2.3': [
    {
      comment:
        'Toxicology studies should follow current ICH guidelines and include appropriate recovery periods.',
      frequency: 'Medium',
      context: 'Toxicology Studies',
      recommendation: 'Ensure study designs align with ICH S4 duration requirements.',
    },
  ],
};

class ContextAwareGuidanceService {
  /**
   * Get context-aware guidance based on current module/section
   */
  async getContextualGuidance(moduleId, sectionId, currentContent, documentType = 'IND') {
    try {
      const context = this.buildModuleContext(moduleId, sectionId);
      const historicalComments = this.getHistoricalComments(moduleId, sectionId);
      const proactiveGuidance = await this.generateProactiveGuidance(
        context,
        currentContent,
        documentType
      );

      return {
        success: true,
        context,
        guidance: {
          regulatory_guidelines: context.guidelines,
          historical_fda_comments: historicalComments,
          proactive_suggestions: proactiveGuidance,
          inline_recommendations: await this.getInlineRecommendations(currentContent, context),
        },
      };
    } catch (error) {
      logger.error('Context-aware guidance error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Build contextual information for current module/section
   */
  buildModuleContext(moduleId, sectionId) {
    const module = ECTD_MODULE_CONTEXTS[moduleId];
    if (!module) {
      return {
        name: 'Unknown Module',
        section: 'Unknown Section',
        guidelines: [],
      };
    }

    const fullSectionId = sectionId ? `${moduleId}.${sectionId}` : moduleId;
    const sectionName = module.sections[sectionId] || 'General';

    return {
      module: module.name,
      section: sectionName,
      fullSectionId,
      guidelines: module.keyGuidelines,
      applicableRegulations: this.getApplicableRegulations(moduleId, sectionId),
    };
  }

  /**
   * Get historical FDA comments for specific section
   */
  getHistoricalComments(moduleId, sectionId) {
    const key = sectionId ? `${moduleId}.${sectionId}` : moduleId;
    return FDA_HISTORICAL_COMMENTS[key] || [];
  }

  /**
   * Generate AI-powered proactive guidance
   */
  async generateProactiveGuidance(context, currentContent, documentType) {
    const prompt = `
As an expert FDA regulatory consultant, provide proactive guidance for this eCTD section:

Module: ${context.module}
Section: ${context.section}
Document Type: ${documentType}
Current Content: ${currentContent?.substring(0, 1000) || 'No content yet'}

Provide specific, actionable guidance including:
1. Key regulatory requirements for this section
2. Common compliance issues to avoid
3. Specific content recommendations
4. Quality criteria for this section
5. Cross-references to other relevant sections

Return as JSON with structured recommendations.
    `;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert FDA regulatory affairs consultant with 20+ years of experience in eCTD submissions. Provide precise, actionable guidance.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      logger.error('Proactive guidance generation error:', error);
      return {
        requirements: ['Unable to generate AI guidance at this time'],
        recommendations: ['Please refer to relevant ICH guidelines'],
        compliance_tips: ['Ensure content meets regulatory standards'],
      };
    }
  }

  /**
   * Get inline recommendations for content improvements
   */
  async getInlineRecommendations(content, context) {
    if (!content || content.length < 50) {
      return this.getTemplateRecommendations(context);
    }

    const prompt = `
Analyze this eCTD content and provide specific inline recommendations:

Section: ${context.section}
Content: ${content}

Identify:
1. Missing required elements
2. Regulatory language improvements
3. Structure enhancements
4. Compliance gaps
5. Citation opportunities

Return JSON with specific line-by-line suggestions.
    `;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert regulatory writer. Provide specific, actionable content improvements.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      logger.error('Inline recommendations error:', error);
      return this.getTemplateRecommendations(context);
    }
  }

  /**
   * Get template recommendations when no content exists
   */
  getTemplateRecommendations(context) {
    const templates = {
      'Administrative Information': [
        'Start with a clear cover letter summarizing the IND submission',
        'Include all required administrative forms (FDA 1571, etc.)',
        'Provide investigator CVs and qualifications',
      ],
      'CTD Summaries': [
        'Provide executive summary of development program',
        'Include risk-benefit assessment',
        'Summarize key efficacy and safety findings',
      ],
      Quality: [
        'Document drug substance characterization',
        'Include manufacturing process description',
        'Provide analytical method validation',
      ],
      'Nonclinical Study Reports': [
        'Include pharmacokinetic and toxicology studies',
        'Provide safety pharmacology data',
        'Document dose rationale for human studies',
      ],
      'Clinical Study Reports': [
        'Include complete study protocols',
        'Provide statistical analysis plans',
        'Document safety monitoring procedures',
      ],
    };

    return {
      recommendations: templates[context.module] || [
        'Begin with section overview',
        'Include regulatory compliance statement',
        'Provide detailed content per ICH guidelines',
      ],
    };
  }

  /**
   * Get applicable regulations for specific module/section
   */
  getApplicableRegulations(moduleId, sectionId) {
    const commonRegulations = [
      '21 CFR 312 - Investigational New Drug Application',
      'ICH M4 - Organization of CTD',
    ];

    const moduleSpecific = {
      module1: ['21 CFR 312.23(a)(1)', 'FDA Form 1571 Instructions'],
      module2: ['ICH M4E(R2)', 'FDA Guidance on CTD Summaries'],
      module3: ['21 CFR 312.23(a)(7)', 'ICH Q series guidelines'],
      module4: ['21 CFR 312.23(a)(8)', 'ICH S series guidelines'],
      module5: ['21 CFR 312.23(a)(11)', 'ICH E6(R2)'],
    };

    return [...commonRegulations, ...(moduleSpecific[moduleId] || [])];
  }

  /**
   * Real-time content analysis as user types
   */
  async analyzeContentRealTime(content, context) {
    if (!content || content.length < 20) return null;

    // Quick analysis for real-time feedback
    const issues = [];

    // Check for common regulatory language issues
    if (!content.includes('accordance with') && context.module !== 'Administrative Information') {
      issues.push({
        type: 'language',
        message: 'Consider using regulatory language such as "in accordance with"',
        severity: 'suggestion',
      });
    }

    // Check for missing section headers in longer content
    if (content.length > 500 && !content.includes('#') && !content.includes('Section')) {
      issues.push({
        type: 'structure',
        message: 'Consider adding section headers for better organization',
        severity: 'warning',
      });
    }

    return {
      issues,
      suggestions: await this.getQuickSuggestions(content, context),
    };
  }

  /**
   * Get quick suggestions for real-time assistance
   */
  async getQuickSuggestions(content, context) {
    const suggestions = [];

    // Content-specific suggestions based on context
    if (context.section === 'Clinical Overview' && !content.toLowerCase().includes('risk')) {
      suggestions.push('Consider including risk-benefit analysis');
    }

    if (context.section === 'Drug Substance' && !content.toLowerCase().includes('specification')) {
      suggestions.push('Include drug substance specifications');
    }

    return suggestions;
  }
}

export default new ContextAwareGuidanceService();
