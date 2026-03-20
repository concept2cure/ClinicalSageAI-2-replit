import { db } from '../db';
import { csrReports, csrDetails } from '../../shared/schema';
import { eq, and, like, or, in as drizzleIn } from 'drizzle-orm';
import { openai } from '../services/openai-service';

interface INDModuleInput {
  section: string; // e.g., "2.5", "2.7.1", etc.
  indication: string;
  drugMechanism?: string;
  relevantTrials?: string[];
}

interface ReferenceSource {
  id: number;
  title: string;
  sponsor: string;
  type: string;
  relevantFindings: string;
}

interface INDModuleOutput {
  title: string;
  section: string;
  content: string;
  subsections: {
    title: string;
    content: string;
  }[];
  references: ReferenceSource[];
  suggestions: string[];
}

export async function buildINDModuleDraft(input: INDModuleInput): Promise<INDModuleOutput> {
  // First, gather all relevant trials either from provided list or search
  let relevantCSRs: any[] = [];

  if (input.relevantTrials && input.relevantTrials.length > 0) {
    // Convert string ids to numbers
    const idList = input.relevantTrials.map(id => parseInt(id)).filter(id => !isNaN(id));

    // Fetch the specific CSRs requested
    relevantCSRs = await db
      .select()
      .from(csrReports)
      .innerJoin(csrDetails, eq(csrReports.id, csrDetails.reportId))
      .where(and(drizzleIn(csrReports.id, idList), eq(csrReports.deletedAt, null)))
      .execute();
  } else {
    // Search for relevant CSRs based on indication
    relevantCSRs = await db
      .select()
      .from(csrReports)
      .innerJoin(csrDetails, eq(csrReports.id, csrDetails.reportId))
      .where(
        and(like(csrReports.indication, `%${input.indication}%`), eq(csrReports.deletedAt, null))
      )
      .limit(15)
      .execute();
  }

  // If no relevant CSRs found, return error
  if (relevantCSRs.length === 0) {
    throw new Error(`No relevant CSRs found for indication: ${input.indication}`);
  }

  // Prepare source references for the IND module
  const references: ReferenceSource[] = relevantCSRs.map(csr => {
    // Extract relevant findings based on section
    let relevantFindings = '';

    switch (input.section) {
      case '2.5': // Clinical Overview
        relevantFindings = [
          csr.csrDetails.studyDesign,
          csr.csrDetails.efficacyResults,
          csr.csrDetails.safetyResults,
        ]
          .filter(Boolean)
          .join(' ');
        break;

      case '2.7.1': // Biopharmaceutic Studies
        relevantFindings = [csr.csrDetails.studyDesign, csr.csrDetails.statisticalMethods]
          .filter(Boolean)
          .join(' ');
        break;

      case '2.7.2': // Clinical Pharmacology Studies
        relevantFindings = [csr.csrDetails.studyDesign, csr.csrDetails.statisticalMethods]
          .filter(Boolean)
          .join(' ');
        break;

      case '2.7.3': // Clinical Efficacy
        relevantFindings = [
          csr.csrDetails.primaryObjective,
          csr.csrDetails.secondaryObjective,
          csr.csrDetails.primaryEndpoint,
          csr.csrDetails.secondaryEndpoints,
          csr.csrDetails.efficacyResults,
        ]
          .filter(Boolean)
          .join(' ');
        break;

      case '2.7.4': // Clinical Safety
        relevantFindings = [
          csr.csrDetails.safetyResults,
          csr.csrDetails.adverseEvents,
          csr.csrDetails.seriousEvents,
          csr.csrDetails.dropoutRate,
        ]
          .filter(Boolean)
          .join(' ');
        break;

      default:
        relevantFindings = [
          csr.csrDetails.studyDesign,
          csr.csrDetails.efficacyResults,
          csr.csrDetails.safetyResults,
        ]
          .filter(Boolean)
          .join(' ');
    }

    return {
      id: csr.csrReports.id,
      title: csr.csrReports.title,
      sponsor: csr.csrReports.sponsor,
      type: `${csr.csrReports.phase} Clinical Study Report`,
      relevantFindings:
        relevantFindings.substring(0, 500) + (relevantFindings.length > 500 ? '...' : ''),
    };
  });

  // Get the title and guidelines for the requested IND module section
  const sectionInfo = getINDSectionInfo(input.section);

  // Construct prompt for the model
  const systemPrompt = `
    You are an expert in regulatory documentation with extensive experience creating IND submissions.
    Based on the provided clinical study reports for ${input.indication}, draft Module ${input.section}: ${sectionInfo.title}.
    
    ${sectionInfo.guidelines}
    
    Your draft should:
    1. Follow ICH and FDA guidelines for IND submissions
    2. Be comprehensive yet concise (3-4 pages when formatted)
    3. Include proper citations to the CSRs provided using the format (CSR-ID: X)
    4. Be formatted in clear sections with appropriate headers
    5. Be scientifically accurate and persuasive for regulatory review
    
    Drug Mechanism: ${input.drugMechanism || 'Not specified - use your judgment based on the indication.'}
    
    Format your response as a structured document with clear section headers.
  `;

  try {
    // Call GPT-4 with the prepared evidence
    const aiResult = await ai.chat({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Draft IND Module ${input.section} for ${input.indication} based on these clinical study reports: ${JSON.stringify(references, null, 2)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    });

    // Extract and parse response
    const moduleText = aiResult.content;

    // Extract subsections (assuming markdown H2 for subsections)
    const subsectionRegex = /## ([^\n]+)\n([\s\S]*?)(?=## |$)/g;
    const subsections = [];
    let match;

    while ((match = subsectionRegex.exec(moduleText)) !== null) {
      subsections.push({
        title: match[1].trim(),
        content: match[2].trim(),
      });
    }

    // Generate suggestions for module improvement
    const improvementPrompt = `
      Review the following IND module draft and provide 3-5 specific suggestions for improvement.
      Focus on regulatory concerns, data gaps, or areas that need strengthening.
      For each suggestion, provide a brief justification.
      
      Module draft:
      ${moduleText.substring(0, 3000)}
    `;

    const improvementCompletion = await ai.chat({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'user',
          content: improvementPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    // Extract suggestions
    const suggestionsText = improvementCompletion.choices[0].message.content;
    const suggestionsList = suggestionsText
      .split(/\d+\.\s+/)
      .slice(1)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Construct the complete IND module object
    const indModule: INDModuleOutput = {
      title: `Module ${input.section}: ${sectionInfo.title}`,
      section: input.section,
      content: moduleText,
      subsections: subsections,
      references: references,
      suggestions: suggestionsList,
    };

    return indModule;
  } catch (error) {
    console.error('Error building IND module draft:', error);
    throw new Error('Failed to build IND module: ' + (error as Error).message);
  }
}

// Helper function to get information about different IND sections
function getINDSectionInfo(section: string): { title: string; guidelines: string } {
  switch (section) {
    case '2.5':
      return {
        title: 'Clinical Overview',
        guidelines: `
          The Clinical Overview is a critical document that provides a comprehensive and critical analysis of all clinical data.
          It should present the benefits and risks assessment of the medicinal product, and discuss how the study findings support
          the proposed indication and prescribing information. This section should integrate clinical findings with relevant 
          non-clinical findings and quality aspects of the drug product.
        `,
      };

    case '2.7.1':
      return {
        title: 'Summary of Biopharmaceutic Studies and Associated Analytical Methods',
        guidelines: `
          This section should present summaries of in vitro and in vivo studies that characterize the drug's bioavailability,
          comparative BA/BE studies, and the BA/BE studies using different dosage forms. Include a summary of analytical methods
          used for biological samples and how they were validated.
        `,
      };

    case '2.7.2':
      return {
        title: 'Summary of Clinical Pharmacology Studies',
        guidelines: `
          This section should present the clinical pharmacology studies that characterize the drug's PK/PD properties.
          Include summaries of studies on healthy subjects and patients, intrinsic/extrinsic factor effects on PK,
          PK interactions, and population PK analyses that support dosing recommendations.
        `,
      };

    case '2.7.3':
      return {
        title: 'Summary of Clinical Efficacy',
        guidelines: `
          This section should present detailed summaries of clinical efficacy findings for the proposed indication.
          Organize by study, population, and endpoint. Include comparison to placebo/active controls, dose relationships,
          onset/duration of efficacy, efficacy in subgroups, and persistence of efficacy over time.
        `,
      };

    case '2.7.4':
      return {
        title: 'Summary of Clinical Safety',
        guidelines: `
          This section should present detailed summaries of safety findings. Include patient exposure data,
          adverse events, lab findings, vital signs, ECGs, special safety studies, and safety in special groups.
          Focus on presenting a comprehensive overview of the drug's safety profile.
        `,
      };

    default:
      return {
        title: 'Clinical Section',
        guidelines:
          'Provide a comprehensive and critical analysis of the clinical data relevant to this section.',
      };
  }
}
