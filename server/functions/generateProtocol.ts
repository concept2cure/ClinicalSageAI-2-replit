import { db } from '../db';
import { csrReports, csrDetails } from '../../shared/schema';
import { eq, and, like } from 'drizzle-orm';
import { openai } from '../services/openai-service';

interface ProtocolGenerationInput {
  indication: string;
  phase: string;
  primaryEndpoint?: string;
}

interface ProtocolSection {
  title: string;
  content: string;
  references?: string[];
}

interface GeneratedProtocol {
  title: string;
  indication: string;
  phase: string;
  summary: string;
  sections: ProtocolSection[];
  evidenceBase: {
    csrCount: number;
    csrIds: string[];
    similarTrials: any[];
  };
}

export async function generateProtocolFromEvidence(
  input: ProtocolGenerationInput
): Promise<GeneratedProtocol> {
  // Find relevant CSRs based on indication and phase
  const relevantCSRs = await db
    .select()
    .from(csrReports)
    .innerJoin(csrDetails, eq(csrReports.id, csrDetails.reportId))
    .where(
      and(
        like(csrReports.indication, `%${input.indication}%`),
        eq(csrReports.phase, input.phase),
        eq(csrReports.deletedAt, null)
      )
    )
    .limit(10)
    .execute();

  // If we have an endpoint criteria, get trials with similar endpoints
  let endpointFiltered = relevantCSRs;
  if (input.primaryEndpoint) {
    endpointFiltered = relevantCSRs.filter(csr =>
      csr.csrDetails.primaryEndpoint?.toLowerCase().includes(input.primaryEndpoint.toLowerCase())
    );

    // If no matches found with endpoint filter, fall back to original results
    if (endpointFiltered.length === 0) {
      endpointFiltered = relevantCSRs;
    }
  }

  // Prepare CSR data to send to GPT model
  const csrSummaries = endpointFiltered.map(csr => ({
    id: csr.csrReports.id,
    title: csr.csrReports.title,
    sponsor: csr.csrReports.sponsor,
    indication: csr.csrReports.indication,
    phase: csr.csrReports.phase,
    primaryEndpoint: csr.csrDetails.primaryEndpoint,
    secondaryEndpoints: csr.csrDetails.secondaryEndpoints,
    inclusionCriteria: csr.csrDetails.inclusionCriteria,
    exclusionCriteria: csr.csrDetails.exclusionCriteria,
    sampleSize: csr.csrDetails.sampleSize,
    statisticalMethods: csr.csrDetails.statisticalMethods,
    studyDesign: csr.csrDetails.studyDesign,
    efficacyResults: csr.csrDetails.efficacyResults,
    safetyResults: csr.csrDetails.safetyResults,
  }));

  // If no relevant CSRs found, return error
  if (csrSummaries.length === 0) {
    throw new Error(
      `No relevant CSRs found for indication: ${input.indication} and phase: ${input.phase}`
    );
  }

  // Construct prompt for the model
  const systemPrompt = `
    You are an expert in clinical trial protocol design with extensive knowledge of regulatory requirements.
    Based on the provided clinical study reports (CSRs) for ${input.indication} ${input.phase} trials,
    generate a comprehensive clinical trial protocol.
    
    Your protocol should include the following sections:
    1. Study Overview and Objectives
    2. Study Population (inclusion/exclusion criteria)
    3. Study Design and Endpoints
    4. Statistical Methodology
    5. Safety Monitoring
    6. Expected Outcomes
    
    Each section should be evidence-based with clear citations to the CSRs provided.
    Format your response as a structured protocol document with clear section headers.
    Include a brief rationale for each major design decision, citing specific CSRs that inform that choice.
  `;

  try {
    // Call GPT-4 with the prepared CSR data
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Generate a protocol for a ${input.phase} clinical trial in ${input.indication}${
            input.primaryEndpoint
              ? ` with primary endpoint focusing on ${input.primaryEndpoint}`
              : ''
          } based on these previous CSRs: ${JSON.stringify(csrSummaries, null, 2)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    });

    // Extract and parse response to construct the protocol
    const protocolText = completion.choices[0].message.content;

    // Basic parsing of the output into sections
    const sectionRegex = /## ([^\n]+)\n([\s\S]*?)(?=## |$)/g;
    const sections: ProtocolSection[] = [];
    let match;

    while ((match = sectionRegex.exec(protocolText)) !== null) {
      const title = match[1].trim();
      const content = match[2].trim();

      // Extract references to CSRs
      const refRegex = /\(CSR ID: (\d+)\)/g;
      const references: string[] = [];
      let refMatch;

      while ((refMatch = refRegex.exec(content)) !== null) {
        references.push(refMatch[1]);
      }

      sections.push({
        title,
        content,
        references: references.length > 0 ? references : undefined,
      });
    }

    // Construct the complete protocol object
    const generatedProtocol: GeneratedProtocol = {
      title: `${input.phase} Clinical Trial Protocol for ${input.indication}${
        input.primaryEndpoint ? ` Focusing on ${input.primaryEndpoint}` : ''
      }`,
      indication: input.indication,
      phase: input.phase,
      summary: sections[0]?.content || 'Protocol generated based on evidence from similar trials.',
      sections: sections,
      evidenceBase: {
        csrCount: csrSummaries.length,
        csrIds: csrSummaries.map(csr => csr.id.toString()),
        similarTrials: csrSummaries.map(csr => ({
          id: csr.id,
          title: csr.title,
          sponsor: csr.sponsor,
        })),
      },
    };

    return generatedProtocol;
  } catch (error) {
    console.error('Error generating protocol from evidence:', error);
    throw new Error('Failed to generate protocol: ' + (error as Error).message);
  }
}
