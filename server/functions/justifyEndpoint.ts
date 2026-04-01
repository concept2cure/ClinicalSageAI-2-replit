import { db } from '../db';
import { csrReports, csrDetails } from '../../shared/schema';
import { eq, and, like, or } from 'drizzle-orm';
import { openai } from '../services/openai-service';

interface EndpointJustificationInput {
  endpoint: string;
  indication: string;
  phase?: string;
}

interface EndpointEvidence {
  csrId: number;
  trialTitle: string;
  sponsor: string;
  endpoint: string;
  outcome?: string;
  successMetric?: string;
}

interface EndpointJustification {
  endpoint: string;
  indication: string;
  summary: string;
  regulatoryConsiderations: string;
  statisticalConsiderations: string;
  successRate: string;
  evidence: EndpointEvidence[];
  recommendations: string[];
}

export async function justifyEndpointChoice(
  input: EndpointJustificationInput
): Promise<EndpointJustification> {
  // Search for CSRs with similar endpoints
  let query = db
    .select()
    .from(csrReports)
    .innerJoin(csrDetails, eq(csrReports.id, csrDetails.reportId))
    .where(
      and(
        like(csrReports.indication, `%${input.indication}%`),
        or(
          like(csrDetails.primaryEndpoint, `%${input.endpoint}%`),
          like(csrDetails.secondaryEndpoints, `%${input.endpoint}%`)
        ),
        eq(csrReports.deletedAt, null)
      )
    );

  // Add phase filter if provided
  if (input.phase) {
    query = query.where(eq(csrReports.phase, input.phase));
  }

  // Execute query with limit
  const relevantCSRs = await query.limit(10).execute();

  // If no relevant CSRs found, return error
  if (relevantCSRs.length === 0) {
    throw new Error(
      `No relevant CSRs found for endpoint: ${input.endpoint} in indication: ${input.indication}`
    );
  }

  // Extract endpoint evidence from CSRs
  const evidence: EndpointEvidence[] = relevantCSRs.map(csr => {
    // Determine if the endpoint was primary or secondary
    const isPrimary = csr.csrDetails.primaryEndpoint
      ?.toLowerCase()
      .includes(input.endpoint.toLowerCase());
    const endpointText = isPrimary
      ? csr.csrDetails.primaryEndpoint
      : csr.csrDetails.secondaryEndpoints;

    // Try to extract outcome information from efficacy results
    const outcomeRegex = new RegExp(`${input.endpoint}.*?results?[:\\s]+(.*?)(?=\\.|$)`, 'i');
    const outcomeMatch = csr.csrDetails.efficacyResults?.match(outcomeRegex);

    return {
      csrId: csr.csrReports.id,
      trialTitle: csr.csrReports.title,
      sponsor: csr.csrReports.sponsor,
      endpoint: endpointText || input.endpoint,
      outcome: outcomeMatch ? outcomeMatch[1].trim() : undefined,
      successMetric: isPrimary ? 'Primary endpoint' : 'Secondary endpoint',
    };
  });

  // Construct prompt for the model
  const systemPrompt = `
    You are an expert in clinical endpoint selection with extensive knowledge of regulatory requirements.
    Based on the provided clinical study report evidence for the endpoint "${input.endpoint}" in ${input.indication} trials,
    generate a comprehensive justification for using this endpoint.
    
    Your response should include:
    
    1. A summary of the endpoint usage in previous trials
    2. Regulatory considerations for this endpoint
    3. Statistical considerations for measuring this endpoint
    4. Success rate for trials using this endpoint
    5. Clear recommendations for endpoint implementation
    
    Each point should be evidence-based with clear citations to the CSRs provided.
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
          content: `Provide a justification for using "${input.endpoint}" as an endpoint in ${input.indication} based on these previous CSRs: ${JSON.stringify(evidence, null, 2)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 2500,
    });

    // Extract and parse response
    const justificationText = aiResult.content;

    // Simple extraction of sections
    const summaryMatch = justificationText.match(/## Summary([\s\S]*?)(?=## |$)/);
    const regulatoryMatch = justificationText.match(
      /## Regulatory Considerations([\s\S]*?)(?=## |$)/
    );
    const statisticalMatch = justificationText.match(
      /## Statistical Considerations([\s\S]*?)(?=## |$)/
    );
    const successRateMatch = justificationText.match(/## Success Rate([\s\S]*?)(?=## |$)/);
    const recommendationsMatch = justificationText.match(/## Recommendations([\s\S]*?)(?=## |$)/);

    // Extract recommendations list
    const recommendationsList: string[] = [];
    const recListContent = recommendationsMatch ? recommendationsMatch[1] : '';
    const recItems = recListContent.match(/\d+\.\s+(.*?)(?=\d+\.|$)/g);

    if (recItems) {
      recItems.forEach((item: any) => {
        const cleaned = item.replace(/^\d+\.\s+/, '').trim();
        if (cleaned) recommendationsList.push(cleaned);
      });
    }

    // Construct the complete justification object
    const endpointJustification: EndpointJustification = {
      endpoint: input.endpoint,
      indication: input.indication,
      summary: summaryMatch
        ? summaryMatch[1].trim()
        : 'Summary based on evidence from similar trials.',
      regulatoryConsiderations: regulatoryMatch
        ? regulatoryMatch[1].trim()
        : 'No specific regulatory considerations found.',
      statisticalConsiderations: statisticalMatch
        ? statisticalMatch[1].trim()
        : 'No specific statistical considerations found.',
      successRate: successRateMatch
        ? successRateMatch[1].trim()
        : 'Success rate not determined from available evidence.',
      evidence: evidence,
      recommendations:
        recommendationsList.length > 0
          ? recommendationsList
          : ['Consider reviewing more recent regulatory guidance for this endpoint.'],
    };

    return endpointJustification;
  } catch (error) {
    console.error('Error generating endpoint justification:', error);
    throw new Error('Failed to justify endpoint: ' + (error as Error).message);
  }
}
