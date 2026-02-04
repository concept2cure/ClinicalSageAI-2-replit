import {
  generateStructuredResponse,
  analyzeText,
  createThread,
  addMessageToThread,
  runAssistant,
  getRunStatus,
  listMessages,
  createAssistant,
} from '../../server/services/openai-service';
import fs from 'fs';
import path from 'path';

// Check for OpenAI API key
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not defined in the environment variables');
}

/**
 * Initialize the Concept2Cure assistant
 */
export async function initializeAssistant() {
  try {
    // Load assistant profile from JSON
    const profilePath = path.join(__dirname, 'assistant-profile.json');
    const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    // Check if assistant already exists (using a file-based approach for simplicity)
    const assistantIdPath = path.join(__dirname, '.assistant-id');
    if (fs.existsSync(assistantIdPath)) {
      const assistantId = fs.readFileSync(assistantIdPath, 'utf8');
      console.log(`Using existing assistant ID: ${assistantId}`);
      return assistantId;
    }

    // Create new assistant using the centralized OpenAI service
    const assistant = await createAssistant(
      profileData.assistant.name,
      profileData.assistant.instructions,
      profileData.assistant.tools
    );
    const assistantId = assistant.id;

    // Save assistant ID for future use
    fs.writeFileSync(assistantIdPath, assistantId);
    console.log(`Created new assistant with ID: ${assistantId}`);
    return assistantId;
  } catch (error) {
    console.error('Error initializing assistant:', error);
    throw error;
  }
}

/**
 * Create a conversation with the Concept2Cure assistant
 */
export async function createAssistantThread(): Promise<string> {
  try {
    const thread = await createThread();
    return thread.id;
  } catch (error) {
    console.error('Error creating assistant thread:', error);
    throw error;
  }
}

/**
 * Get a response from the Concept2Cure assistant
 */
export async function getAssistantResponse(threadId: string, userMessage: string) {
  try {
    // Get the assistant ID
    const assistantIdPath = path.join(__dirname, '.assistant-id');
    if (!fs.existsSync(assistantIdPath)) {
      throw new Error('Assistant ID not found. Please initialize the assistant first.');
    }
    const assistantId = fs.readFileSync(assistantIdPath, 'utf8');

    // Add the user message to the thread
    await addMessageToThread(threadId, userMessage);

    // Run the assistant on the thread
    const run = await runAssistant(threadId, assistantId);

    // Poll for the run completion
    let runStatus = await getRunStatus(threadId, run.id);
    while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
      runStatus = await getRunStatus(threadId, run.id);
    }

    if (runStatus.status === 'failed') {
      throw new Error(`Assistant run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
    }

    // Get the assistant's response
    const messages = await listMessages(threadId);
    const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
    if (assistantMessages.length === 0) {
      throw new Error('No assistant response found');
    }

    const latestMessage = assistantMessages[0];
    return latestMessage.content[0].text.value;
  } catch (error) {
    console.error('Error getting assistant response:', error);
    throw error;
  }
}

/**
 * Generate a protocol based on evidence from similar clinical trials
 * Also generates IND Module 2.5 and regulatory risk analysis
 *
 * @param indication The disease or condition being studied
 * @param phase The clinical trial phase (e.g., Phase I, II, III, IV)
 * @param primaryEndpoint Optional. The primary endpoint for the trial
 * @param thread_id Optional. Thread ID for maintaining conversation context
 * @returns Object containing recommendation, citations, IND module 2.5, and risk summary
 */
export async function generateProtocolFromEvidence(
  indication: string,
  phase: string = 'Phase II',
  primaryEndpoint?: string,
  thread_id?: string
): Promise<{
  recommendation: string;
  citations: string[];
  ind_module_2_5?: { section: string; content: string };
  risk_summary?: string;
  thread_id?: string;
}> {
  console.log(
    `Generating protocol for ${indication} (${phase}) with thread_id: ${thread_id || 'new'}`
  );

  // Enhanced system prompt for more evidence-based, regulatory-compliant protocol design
  const systemPrompt = `
    You are Concept2Cure, an expert AI specialized in clinical trial protocol design with deep knowledge of regulatory requirements, 
    scientific literature, and evidence-based medicine. Generate a detailed clinical trial protocol for the given indication and phase 
    that would be suitable for submission to regulatory agencies.
    
    Guidelines:
    - Use the most current evidence-based approaches for the specific indication
    - Incorporate appropriate sample size calculations based on statistical power considerations
    - Include detailed eligibility criteria that account for specific disease characteristics
    - Provide comprehensive safety monitoring plans with appropriate stopping rules
    - Suggest optimal endpoints that are clinically meaningful and regulatory-acceptable
    
    Your response should be a JSON object with these fields:
    1. recommendation - A comprehensive protocol outline with these sections:
       - Title and Overview
       - Study Design (type, duration, arms)
       - Eligibility (inclusion/exclusion criteria)
       - Endpoints (primary and secondary)
       - Treatment Plan with specific dosing
       - Safety Assessments
       - Statistical Considerations
    2. citations - An array of real clinical study reports (CSRs) that informed this protocol
    
    Base your protocol on evidence from similar clinical trials. Be specific, practical, and focused on regulatory success.
  `;

  // Enhanced user prompt with more specific requirements
  const userPrompt = `
    Please develop a comprehensive, evidence-based clinical trial protocol for a ${phase} trial investigating treatments for ${indication}.
    ${primaryEndpoint ? `The primary endpoint should be: ${primaryEndpoint}` : ''}
    
    Include detailed specifics on:
    1. Study design (randomization strategy, blinding approach, control group details)
    2. Precise eligibility criteria with clear inclusion/exclusion parameters
    3. Detailed primary and secondary endpoints with justification
    4. Dosing regimen with specific amounts, frequency, and administration route
    5. Visit schedule with exact timing and procedures per visit
    6. Statistical analysis plan including sample size calculation and handling of missing data
    7. Safety monitoring approach with DSMB criteria
    
    Use the most recent evidence and guidelines available for ${indication}.
  `;

  let recommendation = '';
  let citations: string[] = [];

  try {
    // Use thread-based conversation if thread_id is provided
    if (thread_id) {
      console.log(`Using existing thread: ${thread_id}`);

      // Add the protocol generation request to the existing thread
      const threadResponse = await getAssistantResponse(
        thread_id,
        `Please generate a clinical trial protocol for ${indication} (${phase})
        ${primaryEndpoint ? `with primary endpoint: ${primaryEndpoint}` : ''}
        
        Include all key sections:
        - Study design details
        - Patient eligibility
        - Endpoints
        - Treatment plan
        - Safety monitoring
        - Statistical approach
        
        Format the response with clear sections and cite evidence sources.`
      );

      // Extract core content and citations from the response
      const processedResponse = processAssistantResponse(threadResponse);
      recommendation = processedResponse.content;
      citations = processedResponse.citations;
    } else {
      // Standard approach for new protocol generation
      console.log('Generating new protocol with OpenAI structured response');

      // Generate structured response for the protocol
      const protocolData = await generateStructuredResponse<{
        recommendation: string;
        citations: string[];
      }>(userPrompt, systemPrompt);

      recommendation = protocolData.recommendation;
      citations = protocolData.citations || [];

      // Create a new thread for this protocol
      thread_id = await createAssistantThread();
      console.log(`Created new thread: ${thread_id}`);

      // Initialize the thread with the protocol context
      await getAssistantResponse(
        thread_id,
        `This thread is for a clinical trial protocol on ${indication} (${phase}).
        The generated protocol is: 
        
        ${recommendation}
        
        Please maintain this context for future questions about this protocol.`
      );
    }
  } catch (error) {
    console.error('Error generating protocol from evidence:', error);
    // Improved fallback approach with more specific prompting
    const textResponse = await analyzeText(
      `Generate a detailed clinical trial protocol for ${phase} ${indication} trial.
      Include all standard sections of a protocol including eligibility, endpoints, treatment plan, and statistics.
      After the protocol, list real clinical trials that inform this protocol design.`,
      'You are an expert in clinical trial design. Provide a detailed protocol outline followed by citations.'
    );

    // More robust citation extraction
    const citationSection = textResponse.match(/(?:Citations|References|Evidence Base):([\s\S]*)/i);
    if (citationSection) {
      citations = citationSection[1]
        .split(/\n/)
        .filter(line => line.trim().length > 0)
        .map(line => line.replace(/^[•\-*\d\.]\s*/, '').trim());

      recommendation = textResponse
        .replace(/(?:Citations|References|Evidence Base):[\s\S]*/i, '')
        .trim();
    } else {
      recommendation = textResponse;
      citations = [];
    }

    // Create a new thread if we don't have one yet
    if (!thread_id) {
      try {
        thread_id = await createAssistantThread();
        await getAssistantResponse(
          thread_id,
          `This thread is for a clinical trial protocol on ${indication} (${phase}).
          The generated protocol is: 
          
          ${recommendation}
          
          Please maintain this context for future questions about this protocol.`
        );
      } catch (threadError) {
        console.error('Error creating assistant thread:', threadError);
        // Generate a temporary thread ID if needed
        thread_id = `backup-${Date.now()}`;
      }
    }
  }

  // Enhanced IND Module 2.5 (Clinical Overview) with more regulatory focus
  const ind25SystemPrompt = `
    You are Concept2Cure, an expert AI specializing in IND (Investigational New Drug) application preparation.
    Generate comprehensive content for IND Module 2.5 (Clinical Overview) based on the provided protocol information.
    
    Your response should follow FDA guidance for Module 2.5 with these key sections:
    - Overview of Clinical Pharmacology
    - Overview of Clinical Efficacy
    - Overview of Clinical Safety
    - Benefit-Risk Conclusions
    
    Use precise regulatory language and focus on supporting the rationale for the proposed investigation.
  `;

  const ind25UserPrompt = `
    Please generate a detailed IND Module 2.5 (Clinical Overview) for a drug investigation in ${indication} 
    based on this protocol:
    
    ${recommendation}
    
    Structure the response according to ICH M4E guidelines with appropriate headings and subheadings.
    Focus on the scientific rationale, risk-benefit assessment, and dose selection justification.
    Format as a submission-ready document that will satisfy regulatory reviewers.
  `;

  // Enhanced Regulatory Risk Analysis with mitigation strategies
  const riskSystemPrompt = `
    You are Concept2Cure, an expert AI regulatory consultant specialized in clinical trial risk assessment.
    Based on the provided protocol information, identify potential regulatory concerns or reviewer questions
    that might arise during FDA/IRB review.
    
    Your response should follow this structure:
    1. Executive Summary of Risks
    2. Identified Risks (categorized as High/Medium/Low)
    3. Specific Mitigation Strategies for each risk
    4. Recommended Protocol Modifications
    
    Focus on specific aspects of the protocol that might raise concerns with clear rationale and solutions.
  `;

  const riskUserPrompt = `
    Conduct a thorough regulatory risk assessment for this ${phase} protocol in ${indication}:
    
    ${recommendation}
    
    Identify specific risks related to:
    - Patient safety concerns
    - Endpoint selection and justification
    - Statistical approach and sample size
    - Inclusion/exclusion criteria appropriateness
    - Procedural or ethical considerations
    
    For each risk, provide a practical mitigation strategy that could be implemented.
  `;

  try {
    // Run both additional analyses in parallel for efficiency
    const [ind25Response, riskResponse] = await Promise.all([
      analyzeText(ind25UserPrompt, ind25SystemPrompt),
      analyzeText(riskUserPrompt, riskSystemPrompt),
    ]);

    // Return the complete package with thread ID for continuity
    return {
      recommendation,
      citations,
      ind_module_2_5: {
        section: '2.5',
        content: ind25Response,
      },
      risk_summary: riskResponse,
      thread_id,
    };
  } catch (error) {
    console.error('Error generating extended protocol information:', error);

    // Return what we have even if extended analyses fail, but still include thread_id
    return {
      recommendation,
      citations,
      thread_id,
    };
  }
}

/**
 * Helper function to process assistant responses into structured data
 * Extracts content and citations from the assistant's text response
 */
function processAssistantResponse(response: string): { content: string; citations: string[] } {
  // Check if the response has a dedicated citations section
  const citationsMatch = response.match(
    /(?:Citations|References|Evidence Base|Sources):([\s\S]*)/i
  );

  if (citationsMatch) {
    // Extract citations as an array
    const citations = citationsMatch[1]
      .split(/\n/)
      .filter(line => line.trim().length > 0)
      .map(line => line.replace(/^[•\-*\d\.]\s*/, '').trim());

    // Extract the main content without the citations section
    const content = response
      .replace(/(?:Citations|References|Evidence Base|Sources):[\s\S]*/i, '')
      .trim();

    return { content, citations };
  }

  // Look for inline citations in brackets or parentheses if no explicit section
  const inlineCitations: string[] = [];
  const citationRegex = /\[([^\]]+)\]|\(([^)]+(?:\([^)]*\)[^)]*)*)\)/g;
  let match;

  while ((match = citationRegex.exec(response)) !== null) {
    const citation = match[1] || match[2];
    if (citation && !citation.match(/^\d+$/)) {
      // Avoid capturing just numbers in brackets
      inlineCitations.push(citation);
    }
  }

  return {
    content: response,
    citations: [...new Set(inlineCitations)], // Remove duplicates
  };
}

/**
 * Justify endpoint choice with evidence from clinical trials
 */
export async function justifyEndpointChoice(
  endpoint: string,
  indication: string,
  phase?: string
): Promise<{ justification: string; evidence: any[] }> {
  const systemPrompt = `
    You are Concept2Cure, an expert AI assisting with clinical trial endpoint selection.
    Provide a detailed justification for the chosen endpoint for the given indication.
    
    Your response should be a JSON object with these fields:
    1. justification - A detailed explanation of why this endpoint is appropriate
    2. evidence - An array of evidence items that support this endpoint choice
       Each evidence item should contain: source, description, and relevance
    
    Base your justification on regulatory precedent, clinical relevance, statistical 
    considerations, and historical usage.
  `;

  const userPrompt = `
    Justify the choice of "${endpoint}" as an endpoint for clinical trials in ${indication}
    ${phase ? `for ${phase} studies` : ''}.
    
    Explain the regulatory precedent, clinical relevance, and historical usage of this endpoint.
    Provide specific examples of trials that successfully used this endpoint.
  `;

  try {
    // Generate structured response
    const justificationData = await generateStructuredResponse<{
      justification: string;
      evidence: any[];
    }>(userPrompt, systemPrompt);

    return {
      justification: justificationData.justification,
      evidence: justificationData.evidence || [],
    };
  } catch (error) {
    console.error('Error justifying endpoint choice:', error);
    // Fallback to direct text generation
    const textResponse = await analyzeText(
      userPrompt,
      `${systemPrompt}\nRespond in plain text with the justification followed by evidence items.`
    );

    // Simplified extraction
    return {
      justification: textResponse,
      evidence: [],
    };
  }
}

/**
 * Build an IND module draft
 */
export async function buildINDModuleDraft(
  section: string,
  indication: string,
  drugMechanism?: string,
  relevantTrials?: string[]
): Promise<{ content: string; references: any[] }> {
  const systemPrompt = `
    You are Concept2Cure, an expert AI assisting with IND (Investigational New Drug) application preparation.
    Generate content for the specified section of an IND application.
    
    Your response should be a JSON object with these fields:
    1. content - The detailed content for the specified IND section
    2. references - An array of reference items that support this content
    
    Structure the content according to FDA guidance for IND applications.
  `;

  const userPrompt = `
    Generate content for the "${section}" section of an IND application for a drug to treat ${indication}
    ${drugMechanism ? `with the following mechanism of action: ${drugMechanism}` : ''}.
    ${relevantTrials && relevantTrials.length ? `These trials may be relevant: ${relevantTrials.join(', ')}` : ''}
    
    Make the content specific, detailed, and aligned with FDA expectations.
    Include appropriate regulatory references and scientific citations.
  `;

  try {
    // Generate structured response
    const moduleData = await generateStructuredResponse<{
      content: string;
      references: any[];
    }>(userPrompt, systemPrompt);

    return {
      content: moduleData.content,
      references: moduleData.references || [],
    };
  } catch (error) {
    console.error('Error building IND module draft:', error);
    // Fallback to direct text generation
    const textResponse = await analyzeText(
      userPrompt,
      `${systemPrompt}\nRespond in plain text with the module content followed by references.`
    );

    // Simplified extraction
    return {
      content: textResponse,
      references: [],
    };
  }
}

/**
 * Generate weekly intelligence brief
 */
export async function generateWeeklyIntelligenceBrief(
  therapeuticAreas: string[] = [],
  maxTrials: number = 5
): Promise<{ brief: string; highlights: any[] }> {
  const systemPrompt = `
    You are Concept2Cure, an expert AI providing intelligence on clinical trial developments.
    Generate a weekly intelligence brief summarizing recent developments in clinical trials.
    
    Your response should be a JSON object with these fields:
    1. brief - A comprehensive intelligence summary with executive overview and detailed updates
    2. highlights - An array of key highlights, each containing: area, finding, and implication
    
    Focus on emerging trends, regulatory insights, and competitive analysis.
  `;

  const areasText = therapeuticAreas.length
    ? `focusing on these therapeutic areas: ${therapeuticAreas.join(', ')}`
    : 'covering major therapeutic areas';

  const userPrompt = `
    Generate a weekly intelligence brief ${areasText}.
    Include up to ${maxTrials} significant trial updates.
    
    The brief should summarize key trial updates, emerging trends, regulatory insights,
    and competitive analysis. Conclude with strategic recommendations.
  `;

  try {
    // Generate structured response
    const briefData = await generateStructuredResponse<{
      brief: string;
      highlights: any[];
    }>(userPrompt, systemPrompt);

    return {
      brief: briefData.brief,
      highlights: briefData.highlights || [],
    };
  } catch (error) {
    console.error('Error generating weekly intelligence brief:', error);
    // Fallback to direct text generation
    const textResponse = await analyzeText(
      userPrompt,
      `${systemPrompt}\nRespond in plain text with the intelligence brief.`
    );

    // Simplified extraction
    return {
      brief: textResponse,
      highlights: [],
    };
  }
}

/**
 * Compare two clinical study protocols
 */
export async function compareProtocols(
  studyIds: string[],
  studySummaries: string[]
): Promise<{
  comparison: string;
  strengths: { [key: string]: string[] };
  weaknesses: { [key: string]: string[] };
  recommendations: string[];
}> {
  if (studyIds.length !== 2 || studySummaries.length !== 2) {
    throw new Error('Exactly two study IDs and summaries are required for comparison');
  }

  const systemPrompt = `
    You are Concept2Cure, an expert AI assisting with clinical trial protocol analysis.
    Compare two clinical trial protocols and provide detailed analysis of their differences,
    strengths, weaknesses, and recommendations for improvement.
    
    Your response should be a JSON object with these fields:
    1. comparison - A comprehensive comparison highlighting key differences
    2. strengths - An object with study IDs as keys and arrays of strengths as values
    3. weaknesses - An object with study IDs as keys and arrays of weaknesses as values
    4. recommendations - An array of recommendations to improve the protocols
  `;

  const userPrompt = `
    Compare these two clinical trial protocols:
    
    Protocol 1 (${studyIds[0]}):
    ${studySummaries[0]}
    
    Protocol 2 (${studyIds[1]}):
    ${studySummaries[1]}
    
    Focus on study design, endpoints, inclusion/exclusion criteria, statistical approaches,
    and other critical elements. Provide specific, actionable recommendations for improvement.
  `;

  try {
    // Generate structured response
    const comparisonData = await generateStructuredResponse<{
      comparison: string;
      strengths: { [key: string]: string[] };
      weaknesses: { [key: string]: string[] };
      recommendations: string[];
    }>(userPrompt, systemPrompt);

    return {
      comparison: comparisonData.comparison,
      strengths: comparisonData.strengths || { [studyIds[0]]: [], [studyIds[1]]: [] },
      weaknesses: comparisonData.weaknesses || { [studyIds[0]]: [], [studyIds[1]]: [] },
      recommendations: comparisonData.recommendations || [],
    };
  } catch (error) {
    console.error('Error comparing protocols:', error);
    // Fallback to direct text generation
    const textResponse = await analyzeText(
      userPrompt,
      `${systemPrompt}\nRespond in plain text with the protocol comparison.`
    );

    // Simplified extraction
    return {
      comparison: textResponse,
      strengths: { [studyIds[0]]: [], [studyIds[1]]: [] },
      weaknesses: { [studyIds[0]]: [], [studyIds[1]]: [] },
      recommendations: [],
    };
  }
}

/**
 * Answer protocol design questions using AI
 */
export async function answerProtocolQuestion(
  question: string,
  relatedStudies: string[] = []
): Promise<string> {
  const systemPrompt = `
    You are Concept2Cure, an expert AI assisting with clinical trial protocol design and regulatory questions.
    Provide detailed, evidence-based answers to questions about clinical trial design, methodology, 
    regulatory considerations, and best practices.
    
    Base your answers on regulatory guidelines, scientific literature, and established best practices.
    Be specific, practical, and actionable in your responses.
  `;

  const studiesContext = relatedStudies.length
    ? `Related studies for context: ${relatedStudies.join(', ')}`
    : '';

  const userPrompt = `
    Question about clinical trial protocols:
    ${question}
    
    ${studiesContext}
    
    Please provide a comprehensive answer with specific recommendations where applicable.
  `;

  try {
    // Use text analysis for natural Q&A format
    const answer = await analyzeText(userPrompt, systemPrompt);
    return answer;
  } catch (error) {
    console.error('Error answering protocol question:', error);
    throw error;
  }
}

/**
 * Generate an IND section using an existing thread for context
 */
export async function generateIndSection(
  studyId: string,
  section: string,
  context: string = '',
  threadId?: string
): Promise<{ section: string; content: string }> {
  // Create new thread if one isn't provided
  let activeThreadId: string;
  if (!threadId) {
    activeThreadId = await createAssistantThread();
  } else {
    activeThreadId = threadId;
  }

  const prompt = `
    Generate content for IND module section "${section}" for study ${studyId}.
    
    Additional context: ${context}
    
    Ensure the content aligns with FDA guidance for this IND section.
    Include appropriate level of detail, regulatory references, and justifications.
  `;

  try {
    // Use the assistant's thread persistence capability
    const response = await getAssistantResponse(activeThreadId, prompt);

    return {
      section,
      content: response,
    };
  } catch (error) {
    console.error(`Error generating IND section ${section}:`, error);

    // Fallback to direct generation if thread-based approach fails
    const fallbackResponse = await buildINDModuleDraft(section, studyId);

    return {
      section,
      content: fallbackResponse.content,
    };
  }
}
