/**
 * Protocol Service for TrialSage
 *
 * This service analyzes clinical trial data and generates protocol templates,
 * design validations, and competitive benchmarks.
 */

import { db } from './db';
import { csrReports, csrDetails } from '../shared/schema';
import { eq, like, and, isNull, desc, inArray } from 'drizzle-orm';
import { queryHuggingFace, HFModel } from './huggingface-service';
import { protocolKnowledgeService } from './protocol-knowledge-service';

// Define protocol section types
export type ProtocolSection = {
  sectionName: string;
  content: string;
  recommendations?: string[];
  validationIssues?: ValidationIssue[];
  competitiveBenchmark?: string;
  examples?: Array<{
    trial: string;
    text: string;
  }>;
};

export type ValidationIssue = {
  severity: 'critical' | 'high' | 'medium' | 'warning' | 'low';
  message: string;
  recommendation?: string;
};

export type ProtocolTemplate = {
  title: string;
  indication: string;
  phase: string;
  createdAt: Date;
  sections: ProtocolSection[];
  validationSummary: {
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    warningIssues: number;
    lowIssues: number;
  };
  similarTrials: Array<{
    id: number;
    title: string;
    sponsor: string;
    phase: string;
    similarity: number;
  }>;
};

/**
 * Generate a protocol template based on indication and phase
 */
export async function generateProtocolTemplate(
  indication: string,
  phase: string,
  population: string = 'appropriate population',
  endpoints: { primary: string[]; secondary: string[] } = { primary: [], secondary: [] },
  additionalContext: string = '',
  includeExamples: boolean = true
): Promise<ProtocolTemplate> {
  // Get similar trials based on indication and phase
  const similarTrials = await db
    .select()
    .from(csrReports)
    .where(
      and(
        like(csrReports.indication, `%${indication}%`),
        like(csrReports.phase, `%${phase}%`),
        isNull(csrReports.deletedAt)
      )
    )
    .limit(10);

  // Get trial details for similar trials
  const trialIds = similarTrials.map(trial => trial.id);

  const trialDetails =
    trialIds.length > 0
      ? await db.select().from(csrDetails).where(inArray(csrDetails.reportId, trialIds))
      : [];

  // Create mapping between trials and their details
  const trialDetailMap = new Map();
  for (const detail of trialDetails) {
    trialDetailMap.set(detail.reportId, detail);
  }

  // Generate protocol sections based on historical data
  const protocolSections = await generateProtocolSections(
    similarTrials,
    trialDetailMap,
    indication,
    phase,
    population,
    endpoints,
    additionalContext,
    includeExamples
  );

  // Validate the generated protocol
  const validatedSections = await validateProtocolSections(
    protocolSections,
    indication,
    phase,
    population
  );

  // Generate validation summary
  const validationSummary = {
    criticalIssues: 0,
    highIssues: 0,
    mediumIssues: 0,
    warningIssues: 0,
    lowIssues: 0,
  };

  // Count validation issues
  for (const section of validatedSections) {
    if (section.validationIssues) {
      for (const issue of section.validationIssues) {
        validationSummary[`${issue.severity}Issues`]++;
      }
    }
  }

  return {
    title: `${indication} Phase ${phase} Clinical Trial Protocol`,
    indication,
    phase,
    createdAt: new Date(),
    sections: validatedSections,
    validationSummary,
    similarTrials: similarTrials.map((trial, index) => ({
      id: trial.id,
      title: trial.title,
      sponsor: trial.sponsor,
      phase: trial.phase,
      similarity: 100 - index * 8, // Mock similarity score
    })),
  };
}

/**
 * Generate protocol sections based on indication and phase
 */
async function generateProtocolSections(
  similarTrials: any[],
  trialDetailMap: Map<number, any>,
  indication: string,
  phase: string,
  population: string = 'appropriate population',
  endpoints: { primary: string[]; secondary: string[] } = { primary: [], secondary: [] },
  additionalContext: string = '',
  includeExamples: boolean = true
): Promise<ProtocolSection[]> {
  // Default protocol sections
  const sections: ProtocolSection[] = [
    {
      sectionName: 'Study Design',
      content: 'This is a multi-center, randomized, double-blind, placebo-controlled study.',
    },
    {
      sectionName: 'Study Objectives',
      content:
        'The primary objective is to evaluate the efficacy and safety of the investigational product.',
    },
    {
      sectionName: 'Inclusion Criteria',
      content:
        '1. Adult patients aged 18 years or older\n2. Confirmed diagnosis of the target condition\n3. Ability to provide informed consent',
    },
    {
      sectionName: 'Exclusion Criteria',
      content:
        '1. History of hypersensitivity to the study drug\n2. Participation in another clinical trial within 30 days\n3. Presence of significant comorbidities',
    },
    {
      sectionName: 'Endpoints',
      content: 'Primary Endpoint: Change from baseline in disease activity score at Week 12.',
    },
    {
      sectionName: 'Statistical Analysis',
      content:
        'The primary analysis will be conducted on the Intent-to-Treat (ITT) population using a mixed-model for repeated measures (MMRM).',
    },
    {
      sectionName: 'Safety Monitoring',
      content:
        'Adverse events will be monitored throughout the study and for 30 days after the last dose.',
    },
  ];

  // If we have similar trials, enhance the protocol with real data
  if (similarTrials.length > 0) {
    try {
      // For each protocol section, enhance with information from similar trials
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];

        // Generate content based on the trial data using Hugging Face
        const enhancedContent = await enhanceSectionWithAI(
          section.sectionName,
          indication,
          phase,
          similarTrials,
          trialDetailMap,
          population,
          endpoints,
          additionalContext
        );

        if (enhancedContent) {
          sections[i].content = enhancedContent;
        }

        // Add example content from similar trials if requested
        if (includeExamples) {
          const examples = [];
          for (const trial of similarTrials.slice(0, 3)) {
            const trialDetail = trialDetailMap.get(trial.id);
            if (trialDetail) {
              let exampleText = '';

              switch (section.sectionName) {
                case 'Study Design':
                  exampleText = trialDetail.studyDesign || '';
                  break;
                case 'Study Objectives':
                  exampleText = trialDetail.primaryObjective || '';
                  break;
                case 'Inclusion Criteria':
                  exampleText = trialDetail.inclusionCriteria || '';
                  break;
                case 'Exclusion Criteria':
                  exampleText = trialDetail.exclusionCriteria || '';
                  break;
                case 'Endpoints':
                  exampleText = trialDetail.endpointText || '';
                  break;
                case 'Statistical Analysis':
                  exampleText = trialDetail.statisticalMethods || '';
                  break;
                case 'Safety Monitoring':
                  exampleText = trialDetail.safetyMonitoring || '';
                  break;
              }

              if (exampleText) {
                examples.push({
                  trial: trial.title,
                  text: exampleText.substring(0, 300) + (exampleText.length > 300 ? '...' : ''),
                });
              }
            }
          }

          if (examples.length > 0) {
            sections[i].examples = examples;
          }
        }
      }
    } catch (error) {
      console.error('Error enhancing protocol sections:', error);
    }
  }

  return sections;
}

/**
 * Enhance a protocol section with AI-generated content
 */
async function enhanceSectionWithAI(
  sectionName: string,
  indication: string,
  phase: string,
  similarTrials: any[],
  trialDetailMap: Map<number, any>,
  population: string = 'appropriate population',
  endpoints: { primary: string[]; secondary: string[] } = { primary: [], secondary: [] },
  additionalContext: string = ''
): Promise<string> {
  try {
    // Create a context for the AI model from similar trials
    let context = `Generate a ${sectionName} section for a Phase ${phase} clinical trial protocol for ${indication} with a target population of ${population}. `;

    // Add endpoints to context if provided
    if (endpoints.primary.length > 0 || endpoints.secondary.length > 0) {
      context += 'The protocol includes the following endpoints: ';

      if (endpoints.primary.length > 0) {
        context += `Primary endpoints: ${endpoints.primary.join(', ')}. `;
      }

      if (endpoints.secondary.length > 0) {
        context += `Secondary endpoints: ${endpoints.secondary.join(', ')}. `;
      }
    }

    // Add additional context if provided
    if (additionalContext) {
      context += `Additional context: ${additionalContext}. `;
    }

    // Get academic evidence and recommendations
    const objectives = [...(endpoints.primary || []), ...(endpoints.secondary || [])];
    const academicData = await protocolKnowledgeService.getRecommendations({
      indication,
      phase,
      objectives,
      endpoints: [...(endpoints.primary || []), ...(endpoints.secondary || [])],
    });

    // Add evidence-based recommendations to the context
    if (academicData.recommendations.length > 0) {
      // Find recommendations relevant to the current section
      const sectionRecommendations = academicData.recommendations.filter(rec => {
        switch (sectionName) {
          case 'Study Design':
            return rec.type === 'studyDesign';
          case 'Inclusion Criteria':
            return rec.type === 'inclusionCriteria';
          case 'Exclusion Criteria':
            return rec.type === 'exclusionCriteria';
          case 'Endpoints':
            return rec.type === 'endpoints';
          case 'Statistical Analysis':
            return rec.type === 'sampleSize';
          default:
            return false;
        }
      });

      if (sectionRecommendations.length > 0) {
        context += '\n\nEVIDENCE-BASED RECOMMENDATIONS:\n';
        sectionRecommendations.forEach(rec => {
          context += `- ${rec.description}\n`;
          if (rec.citations) {
            context += `  [Citations: ${rec.citations}]\n`;
          }
        });
      }
    }

    // Add academic citations to the context
    if (academicData.citations.length > 0) {
      context += '\n\nRELEVANT ACADEMIC SOURCES:\n';
      academicData.citations.slice(0, 5).forEach(citation => {
        context += `${citation.citationKey} ${citation.title} (${citation.sponsor}, ${citation.date || 'N/A'}) - Phase ${citation.phase}, Indication: ${citation.indication}\n`;
      });
    }

    // Add context from similar trials if available
    if (similarTrials.length > 0) {
      context += `\nBase it on these similar trials: ${similarTrials.map(t => t.title).join(', ')}. `;

      // Add specific context based on section type
      switch (sectionName) {
        case 'Study Design':
          context +=
            'Include details about study type, randomization, blinding, duration, and consider the specific population characteristics.';
          break;
        case 'Study Objectives':
          context +=
            'Include primary and secondary objectives that are specific, measurable, and clinically relevant for the target population.';
          break;
        case 'Inclusion Criteria':
          context += `List 5-7 key inclusion criteria specifically for ${population}, including age range, confirmation of disease, and any required lab values or scores.`;
          break;
        case 'Exclusion Criteria':
          context += `List 5-7 key exclusion criteria tailored for ${population}, including contraindications, comorbidities, and previous treatments.`;
          break;
        case 'Endpoints':
          // Use provided endpoints if available
          if (endpoints.primary.length > 0 || endpoints.secondary.length > 0) {
            context +=
              'Use the endpoints specified earlier and add detailed measurement timepoints and methods.';
          } else {
            context +=
              'Specify primary and secondary endpoints with clear measurement timepoints that are appropriate for the target population.';
          }
          break;
        case 'Statistical Analysis':
          context +=
            'Describe analysis population, statistical methods, and sample size justification, accounting for the specified endpoints and population characteristics.';
          break;
        case 'Safety Monitoring':
          context +=
            'Include adverse event monitoring, data safety monitoring board, and stopping rules appropriate for the study population and indication.';
          break;
      }
    }

    // Add instruction to cite academic sources
    context +=
      '\n\nIMPORTANT: When referencing evidence, include citation keys like [CSR-12345] from the academic sources provided to you.';

    // Use Hugging Face to generate enhanced content
    const enhancedContent = await queryHuggingFace(
      context,
      HFModel.TEXT, // Use TEXT model which maps to Mixtral
      0.4, // Temperature - lowered for more factual output
      1000 // Increased max tokens to allow for citations
    );

    return enhancedContent;
  } catch (error) {
    console.error(`Error enhancing ${sectionName} with AI:`, error);
    return '';
  }
}

/**
 * Validate protocol sections against regulatory standards and best practices
 */
async function validateProtocolSections(
  sections: ProtocolSection[],
  indication: string,
  phase: string,
  population: string = 'appropriate population'
): Promise<ProtocolSection[]> {
  try {
    const validatedSections = [...sections];

    // Get academic evidence and recommendations for validation
    const academicData = await protocolKnowledgeService.getRecommendations({
      indication,
      phase,
      endpoints: [],
    });

    // Validate each section
    for (let i = 0; i < validatedSections.length; i++) {
      const section = validatedSections[i];
      const validationIssues: ValidationIssue[] = [];

      // Find academic evidence relevant to this section
      const relevantCitations = academicData.citations
        .slice(0, 3)
        .map(
          citation =>
            `${citation.citationKey} ${citation.title} (${citation.sponsor}, ${citation.phase})`
        )
        .join('\n');

      // Use AI to identify potential issues with academic evidence
      const validationPrompt = `
        Review this ${section.sectionName} for a Phase ${phase} ${indication} clinical trial protocol targeting ${population}:
        "${section.content}"
        
        Consider these relevant academic citations from similar trials:
        ${relevantCitations}
        
        Identify any potential regulatory issues, scientific problems, or improvements, especially those related to the target population.
        Format your response as a JSON array of issues, where each issue has:
        - severity: one of "critical", "high", "medium", "warning", or "low"
        - message: a clear explanation of the issue
        - recommendation: how to fix the issue
        - citation: (optional) a reference to a specific citation if relevant
      `;

      try {
        const validationResponse = await queryHuggingFace(
          validationPrompt,
          HFModel.TEXT,
          0.4,
          1000
        );

        // Parse validation response (assuming it returns valid JSON)
        try {
          // Extract JSON from the response (it might be wrapped in text)
          const jsonMatch = validationResponse.match(/\[.*\]/s);
          if (jsonMatch) {
            const issues = JSON.parse(jsonMatch[0]);

            // Add validated issues
            for (const issue of issues) {
              if (issue.severity && issue.message) {
                validationIssues.push({
                  severity: issue.severity,
                  message: issue.message,
                  recommendation:
                    issue.recommendation ||
                    `Consider revising the ${section.sectionName.toLowerCase()} to address this issue.`,
                });
              }
            }
          } else {
            // If not valid JSON, try to extract structured info from text
            const lines = validationResponse.split('\n');
            for (const line of lines) {
              if (
                line.includes('critical') ||
                line.includes('high') ||
                line.includes('medium') ||
                line.includes('warning') ||
                line.includes('low')
              ) {
                // Simple parsing of severity and message from text
                const severityMatch = line.match(/(critical|high|medium|warning|low)/i);
                const severity = severityMatch ? severityMatch[0].toLowerCase() : 'medium';
                const message = line.replace(/^[^:]*:\s*/, '').trim();

                if (message) {
                  validationIssues.push({
                    severity: severity as 'critical' | 'high' | 'medium' | 'warning' | 'low',
                    message: message,
                  });
                }
              }
            }
          }
        } catch (jsonError) {
          console.error('Error parsing validation response:', jsonError);
        }
      } catch (aiError) {
        console.error(`Error validating ${section.sectionName}:`, aiError);
      }

      // Add recommendations where missing
      for (const issue of validationIssues) {
        if (!issue.recommendation) {
          issue.recommendation = `Consider revising the ${section.sectionName.toLowerCase()} to address this issue.`;
        }
      }

      validatedSections[i].validationIssues = validationIssues;

      // Generate competitive benchmark with academic evidence
      try {
        // Find the most relevant recommendations for this section
        const sectionType = section.sectionName.toLowerCase();
        const relevantRecommendations = academicData.recommendations
          .filter(rec => {
            if (sectionType.includes('design') && rec.type === 'studyDesign') return true;
            if (sectionType.includes('inclusion') && rec.type === 'inclusionCriteria') return true;
            if (sectionType.includes('exclusion') && rec.type === 'exclusionCriteria') return true;
            if (sectionType.includes('endpoint') && rec.type === 'endpoints') return true;
            if (sectionType.includes('statistic') && rec.type === 'sampleSize') return true;
            return false;
          })
          .map(rec => rec.description)
          .join('\n');

        const benchmarkPrompt = `
          Analyze this ${section.sectionName} for a Phase ${phase} ${indication} trial targeting ${population}:
          "${section.content}"
          
          Consider these evidence-based recommendations from similar trials:
          ${relevantRecommendations || 'No specific recommendations available for this section type.'}
          
          Provide a detailed competitive analysis (3-4 sentences) on how this section compares to evidence-based best practices and industry standards. 
          Include specific references to current trial design approaches in your analysis.
        `;

        const benchmarkResponse = await queryHuggingFace(benchmarkPrompt, HFModel.TEXT, 0.4, 500);

        // Add academic citations to benchmark when available
        let enhancedBenchmark = benchmarkResponse;
        if (academicData.citations.length > 0) {
          const citationInfo = academicData.citations[0].formatted;
          enhancedBenchmark += `\n\nReference: ${citationInfo}`;
        }

        validatedSections[i].competitiveBenchmark = enhancedBenchmark;
      } catch (benchError) {
        console.error(`Error generating benchmark for ${section.sectionName}:`, benchError);
      }
    }

    return validatedSections;
  } catch (error) {
    console.error('Error validating protocol sections:', error);
    return sections;
  }
}

/**
 * Get statistical approaches for a particular indication and phase
 */
export async function getStatisticalApproaches(
  indication: string,
  phase: string
): Promise<Array<{ name: string; description: string; frequency: number }>> {
  // Define common statistical approaches with descriptions
  const statisticalApproaches = {
    'Logistic Regression': 'Used for binary outcomes, modeling probability of an event.',
    'Cox Proportional Hazards': 'Survival analysis model for time-to-event data.',
    'Kaplan-Meier': 'Non-parametric survival analysis for estimating survival curves.',
    'Log-rank Test': 'Comparing survival curves between groups.',
    ANOVA: 'Analysis of variance for comparing means across multiple groups.',
    'Chi-square Test': 'Analyzing categorical data and proportions.',
    "Fisher's Exact Test": 'Alternative to chi-square for small sample sizes.',
    'T-test': 'Comparing means between two groups.',
    'Wilcoxon Rank-Sum Test': 'Non-parametric alternative to t-test.',
    'Mixed Effects Model': 'For modeling repeated measures with random and fixed effects.',
  };

  // Get similar trials for the indication and phase
  const similarTrials = await db
    .select()
    .from(csrReports)
    .where(
      and(
        like(csrReports.indication, `%${indication}%`),
        like(csrReports.phase, `%${phase}%`),
        isNull(csrReports.deletedAt)
      )
    )
    .limit(20);

  // Get trial details for similar trials
  const trialIds = similarTrials.map(trial => trial.id);

  const trialDetails =
    trialIds.length > 0
      ? await db.select().from(csrDetails).where(inArray(csrDetails.reportId, trialIds))
      : [];

  // Use AI to analyze statistical approaches from the detail texts
  let approaches = [];

  try {
    // Compile text from trial details
    const detailTexts = trialDetails
      .map(detail => {
        return [
          detail.statisticalMethods || '',
          detail.results ? JSON.stringify(detail.results) : '',
          detail.studyDesign || '',
        ].join(' ');
      })
      .join('\n\n')
      .substring(0, 10000); // Limit context size

    // Query Hugging Face to extract statistical approaches
    const prompt = `
      Analyze the following clinical trial details for ${indication} Phase ${phase} studies and
      identify which statistical approaches were used. For each approach that was used, assign a frequency
      (number between 1-10, with 10 being most common).
      
      Trial details:
      ${detailTexts}
      
      Return your answer as a JSON object mapping approach names to frequencies.
      Example: {"Logistic Regression": 8, "Chi-square Test": 6}
    `;

    const response = await queryHuggingFace(prompt, HFModel.TEXT, 0.3, 512);

    // Parse the response to extract approaches and frequencies
    try {
      // Find JSON in the response
      const jsonMatch = response.match(/\{[^{]*\}/s);
      let frequencies = {};

      if (jsonMatch) {
        frequencies = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback to basic parsing if JSON not found
        const lines = response.split('\n');
        for (const line of lines) {
          const match = line.match(/["']?([\w\s'-]+)["']?\s*[:=]\s*(\d+)/);
          if (match && match[1] && match[2]) {
            const approach = match[1].trim();
            const frequency = parseInt(match[2]);
            frequencies[approach] = frequency;
          }
        }
      }

      // Convert to expected output format
      for (const [approach, frequency] of Object.entries(frequencies)) {
        approaches.push({
          name: approach,
          description:
            statisticalApproaches[approach] || 'Statistical approach for analyzing trial data.',
          frequency: frequency as number,
        });
      }

      // If no approaches were found, provide common ones for the phase
      if (approaches.length === 0) {
        // Different defaults based on phase
        if (phase.includes('1')) {
          approaches = [
            {
              name: 'Descriptive Statistics',
              description: 'Summarizing data using mean, median, range etc.',
              frequency: 10,
            },
            {
              name: 'Dose Escalation Models',
              description: 'Models for determining maximum tolerated dose.',
              frequency: 8,
            },
            {
              name: 'Kaplan-Meier',
              description: statisticalApproaches['Kaplan-Meier'],
              frequency: 6,
            },
          ];
        } else if (phase.includes('2')) {
          approaches = [
            {
              name: 'Logistic Regression',
              description: statisticalApproaches['Logistic Regression'],
              frequency: 8,
            },
            { name: 'ANOVA', description: statisticalApproaches['ANOVA'], frequency: 7 },
            {
              name: 'Chi-square Test',
              description: statisticalApproaches['Chi-square Test'],
              frequency: 7,
            },
          ];
        } else if (phase.includes('3')) {
          approaches = [
            {
              name: 'Cox Proportional Hazards',
              description: statisticalApproaches['Cox Proportional Hazards'],
              frequency: 9,
            },
            {
              name: 'Mixed Effects Model',
              description: statisticalApproaches['Mixed Effects Model'],
              frequency: 8,
            },
            {
              name: 'Logistic Regression',
              description: statisticalApproaches['Logistic Regression'],
              frequency: 7,
            },
          ];
        } else {
          approaches = [
            {
              name: 'Chi-square Test',
              description: statisticalApproaches['Chi-square Test'],
              frequency: 7,
            },
            { name: 'T-test', description: statisticalApproaches['T-test'], frequency: 7 },
            {
              name: 'Logistic Regression',
              description: statisticalApproaches['Logistic Regression'],
              frequency: 6,
            },
          ];
        }
      }
    } catch (parseError) {
      console.error('Error parsing statistical approaches:', parseError);

      // Fallback approaches
      approaches = [
        {
          name: 'Chi-square Test',
          description: statisticalApproaches['Chi-square Test'],
          frequency: 7,
        },
        { name: 'T-test', description: statisticalApproaches['T-test'], frequency: 7 },
        { name: 'ANOVA', description: statisticalApproaches['ANOVA'], frequency: 6 },
      ];
    }
  } catch (error) {
    console.error('Error getting statistical approaches:', error);

    // Default approaches on error
    approaches = [
      {
        name: 'Logistic Regression',
        description: statisticalApproaches['Logistic Regression'],
        frequency: 7,
      },
      {
        name: 'Chi-square Test',
        description: statisticalApproaches['Chi-square Test'],
        frequency: 6,
      },
      { name: 'Kaplan-Meier', description: statisticalApproaches['Kaplan-Meier'], frequency: 5 },
    ];
  }

  // Sort by frequency
  return approaches.sort((a, b) => b.frequency - a.frequency);
}
