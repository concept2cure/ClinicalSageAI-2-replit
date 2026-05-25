/**
 * @fileoverview Concept2Cure Chat Hook
 * @module concept2cure/hooks/useChat
 * @version 2.0.0
 * 
 * @description
 * Connects to AnA 1.0 RI API for AI-powered regulatory guidance.
 * Handles message streaming, conversation history, and artifact generation.
 * 
 * @compliance
 * - FDA 21 CFR Part 11: All chat interactions logged server-side
 * - Submission-type-specific system prompts ensure domain expertise
 * 
 * @architecture
 * Uses React Query for state management with the following flow:
 * 1. User sends message
 * 2. System prompt injected based on submission type
 * 3. Response parsed for potential document artifacts
 * 4. Artifacts extracted and returned separately
 * 
 * @see {@link https://www.fda.gov/regulatory-information}
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Message, Artifact, ArtifactType, SubmissionType } from '../types';

/**
 * Response structure from the AnA 1.0 RI API
 * @interface ChatResponse
 */
interface ChatResponse {
  /** The AI-generated response text */
  answer: string;
  /** Unique thread identifier for conversation continuity */
  thread_id: string;
  /** Token usage statistics for monitoring */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** Model identifier (e.g., 'gpt-4', 'claude-3') */
  model?: string;
  /** Parsed document artifacts from the response */
  artifacts?: Artifact[];
}

/**
 * Parameters for sending a message
 * @interface SendMessageParams
 */
interface SendMessageParams {
  /** User's input message */
  message: string;
  /** Existing thread ID for continuation */
  threadId?: string;
  /** Associated project ID */
  projectId: string;
  /** Regulatory submission type for context */
  submissionType: SubmissionType;
  /** Previous messages for context window */
  conversationHistory?: Message[];
}

/**
 * Generates a submission-type-specific system prompt for the AI
 * 
 * @description
 * Each regulatory submission type has unique requirements and terminology.
 * The system prompt ensures the AI provides contextually relevant guidance.
 * 
 * @param submissionType - The type of regulatory submission
 * @returns Formatted system prompt for the AI model
 * @private
 */
/** Core AnA identity — shared across all submission types */
const ANA_CORE = `You are AnA — the regulatory intelligence co-pilot at the heart of Concept2Cure. You are not a chatbot. You are a named, trusted partner with the combined instincts of a 30-year FDA reviewer, a CHMP rapporteur, and a global regulatory affairs VP who has launched products across 40 markets.

You speak with warmth, confidence, and precision. You lead with the answer, cite specific guidance by section number, and always suggest the next step. When asked to draft — you produce real regulatory prose, not outlines. When something is wrong — you say so with empathy and offer an alternative. You make complex regulatory work feel manageable.

Generate document artifacts (complete sections, comparison tables, checklists) whenever they would accelerate the submission.`;

function getSystemPrompt(submissionType: SubmissionType): string {
  const contexts: Record<SubmissionType, string> = {
    '510K': `\n\nYou're currently helping with a **510(k) medical device submission**. You know predicate device strategy, substantial equivalence arguments, eSTAR format, performance testing (biocompatibility per ISO 10993, electrical safety per IEC 60601, software per IEC 62304), device description, labeling, and CDRH review timelines inside and out.`,

    'IND': `\n\nYou're currently helping with an **IND application**. You know 21 CFR 312.23(a), Form FDA 1571, protocol design per ICH E6(R2)/E8(R1), CMC modules 3.2.S and 3.2.P, nonclinical packages per ICH M3(R2), Investigator's Brochure structure, and clinical development strategy across phases.`,

    'NDA': `\n\nYou're currently helping with an **NDA submission**. You know eCTD modules 1-5, ISS/ISE structure, Clinical Overview (2.5) and Clinical Summary (2.7), CMC documentation per ICH Q-series, labeling per PLR format, and the full review timeline from filing through action date.`,

    'BLA': `\n\nYou're currently helping with a **BLA submission**. You know biologics manufacturing characterization, analytical validation per ICH Q2(R2)/Q6B, cell substrate characterization per ICH Q5A/Q5B/Q5D, comparability per ICH Q5E, clinical immunogenicity data, and post-marketing commitments.`,

    'MAA': `\n\nYou're currently helping with an **EU MAA**. You know centralised/decentralised/MRP procedures, EMA scientific advice, Risk Management Plans per GVP Module V, Pediatric Investigation Plans, and CHMP rapporteur expectations.`,

    'PMA': `\n\nYou're currently helping with a **Class III PMA**. You know IDE clinical study requirements, PMA modules, the SSED, panel track vs. traditional pathways, post-approval study commitments, and Advisory Panel preparation.`,

    'DE_NOVO': `\n\nYou're currently helping with a **De Novo classification request**. You know risk-based classification rationale, special controls development, performance testing for novel devices, and the strategic framework between De Novo vs. 510(k).`,

    'EUA': `\n\nYou're currently helping with an **EUA submission**. You know emergency use criteria, benefits/risks analysis, alternatives assessment, fact sheet requirements for HCPs and patients, and post-authorization commitments.`,

    'IVDR': `\n\nYou're currently helping with an **EU IVDR submission**. You know IVDR (2017/746) classification rules, performance evaluation reports, scientific validity and analytical/clinical performance, the Common Specifications, technical documentation per Annexes II and III, and notified body conformity assessment.`,
  };

  return ANA_CORE + (contexts[submissionType] || contexts['510K']);
}

/**
 * Extracts document artifacts from AI response
 * 
 * @description
 * Parses the AI response for substantial code blocks that represent
 * regulatory documents, templates, or structured data. Small code
 * blocks (< 200 chars) are ignored as they're likely examples.
 * 
 * @param response - Raw AI response text
 * @param projectId - Associated project ID for artifact linking
 * @returns Array of extracted artifacts
 * @private
 */
function parseArtifacts(response: string, projectId: string): Artifact[] {
  const artifacts: Artifact[] = [];
  
  // Look for code blocks that could be documents
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;
  let index = 0;
  
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const language = match[1] || 'text';
    const content = match[2].trim();
    
    // Skip small code blocks (likely examples, not documents)
    if (content.length < 200) continue;
    
    // Determine artifact type based on content
    let title = 'Generated Document';
    let type: ArtifactType = 'document';

    if (language === 'markdown' || language === 'md') {
      title = 'Regulatory Document Draft';
    } else if (language === 'json') {
      title = 'Structured Data';
      type = 'table';
    } else if (content.includes('## ') || content.includes('### ')) {
      title = 'Document Section';
    }
    
    artifacts.push({
      id: `artifact_${Date.now()}_${index}`,
      projectId,
      title,
      type,
      content,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    index++;
  }
  
  return artifacts;
}

/**
 * React Query hook for AI chat interactions
 * 
 * @description
 * Provides mutation functions for sending messages to AnA 1.0 RI AI
 * with automatic artifact extraction and error handling.
 * 
 * @example
 * ```tsx
 * const { sendMessageAsync, isLoading } = useChat();
 * 
 * const response = await sendMessageAsync({
 *   message: 'What tests are required for 510(k)?',
 *   projectId: 'proj_123',
 *   submissionType: '510K',
 * });
 * ```
 * 
 * @returns {Object} Chat operations and state
 */
export function useChat() {
  /**
   * Mutation for sending messages to the AI
   * Includes automatic artifact parsing from responses
   */
  const sendMessage = useMutation({
    mutationFn: async ({
      message,
      threadId,
      projectId,
      submissionType,
      conversationHistory = [],
    }: SendMessageParams): Promise<ChatResponse> => {
      const systemPrompt = getSystemPrompt(submissionType);
      
      const response = await apiRequest('POST', '/api/chat', {
          message,
          thread_id: threadId,
          system_prompt: systemPrompt,
          context: {
            projectId,
            submissionType,
            conversationLength: conversationHistory.length,
          },
        });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error?.message || error?.message || 'Failed to send message');
      }

      const payload = await response.json().catch(() => ({}));
      if (payload?.success === false) {
        throw new Error(payload?.error?.message || payload?.error || 'Failed to send message');
      }
      const data = payload?.data ?? payload;
      
      // Parse response for artifacts
      const artifacts = parseArtifacts(data.answer, projectId);
      
      return {
        ...data,
        artifacts,
      };
    },
  });

  return {
    sendMessage: sendMessage.mutate,
    sendMessageAsync: sendMessage.mutateAsync,
    isLoading: sendMessage.isPending,
    error: sendMessage.error,
  };
}

/**
 * React Query hook for fetching conversation thread history
 * 
 * @description
 * Retrieves full thread history from the server for conversation
 * continuity and context restoration.
 * 
 * @param threadId - The thread ID to fetch (null to disable)
 * @returns Query result with thread data
 * 
 * @example
 * ```tsx
 * const { data: thread } = useThread('thread_abc123');
 * ```
 */
export function useThread(threadId: string | null) {
  return useQuery({
    queryKey: ['chat-thread', threadId],
    queryFn: async () => {
      if (!threadId) return null;
      
      const response = await apiRequest('GET', `/api/chat/thread/${threadId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch thread');
      }
      const payload = await response.json().catch(() => ({}));
      if (payload?.success === false) {
        throw new Error(payload?.error?.message || payload?.error || 'Failed to fetch thread');
      }
      return payload?.data ?? payload;
    },
    enabled: !!threadId,
  });
}
