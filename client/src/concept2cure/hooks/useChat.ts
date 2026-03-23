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
import { Message, Artifact, SubmissionType } from '../types';

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
function getSystemPrompt(submissionType: SubmissionType): string {
  /** Regulatory-specific prompts with comprehensive domain knowledge */
  const prompts: Record<SubmissionType, string> = {
    '510K': `You are AnA (Audit & Narrative Assistant), an expert RI Co-pilot specializing in FDA 510(k) medical device submissions. Help the user prepare their 510(k) premarket notification with guidance on:
- Predicate device identification and substantial equivalence
- Performance testing requirements (biocompatibility, electrical safety, software)
- Device description and labeling requirements
- eSTAR submission format
- FDA review timeline expectations

When appropriate, generate document artifacts (templates, checklists, draft sections) to accelerate their submission.`,

    'IND': `You are AnA (Audit & Narrative Assistant), an expert RI Co-pilot specializing in IND (Investigational New Drug) applications. Help the user prepare their IND submission with guidance on:
- Protocol design and clinical development strategy
- CMC (Chemistry, Manufacturing, Controls) requirements
- Nonclinical study requirements
- Investigator's Brochure content
- Form FDA 1571 and supporting forms

When appropriate, generate document artifacts to accelerate their submission.`,

    'NDA': `You are AnA (Audit & Narrative Assistant), an expert RI Co-pilot specializing in NDA (New Drug Application) submissions. Help the user prepare their NDA with guidance on:
- eCTD format and module organization
- Clinical study reports and integrated summaries
- CMC documentation requirements
- Labeling and package insert development
- Priority Review and Breakthrough Therapy designations

When appropriate, generate document artifacts to accelerate their submission.`,

    'BLA': `You are AnA (Audit & Narrative Assistant), an expert RI Co-pilot specializing in BLA (Biologics License Application) submissions. Help the user prepare their BLA with guidance on:
- Manufacturing process characterization
- Analytical method validation
- Clinical immunogenicity data
- Comparability protocols
- Post-marketing commitments

When appropriate, generate document artifacts to accelerate their submission.`,

    'MAA': `You are AnA (Audit & Narrative Assistant), an expert RI Co-pilot specializing in MAA (Marketing Authorization Application) submissions for the EU. Help the user prepare their MAA with guidance on:
- CTD format and regional requirements
- EMA scientific advice procedures
- Risk Management Plan (RMP) development
- Pediatric Investigation Plan (PIP) requirements
- Centralized vs. decentralized procedures

When appropriate, generate document artifacts to accelerate their submission.`,

    'PMA': `You are AnA (Audit & Narrative Assistant), an expert RI Co-pilot specializing in FDA PMA (Premarket Approval) submissions for Class III medical devices. Help the user prepare their PMA with guidance on:
- Clinical study design and IDE requirements
- Non-clinical testing protocols
- Manufacturing and quality system requirements
- Panel track vs. traditional PMA
- Post-approval study commitments

When appropriate, generate document artifacts to accelerate their submission.`,

    'DE_NOVO': `You are AnA (Audit & Narrative Assistant), an expert RI Co-pilot specializing in FDA De Novo classification requests for novel medical devices. Help the user prepare their De Novo with guidance on:
- Risk-based classification rationale
- Special controls development
- Performance testing requirements
- Predicate-free pathway strategy
- De Novo vs. 510(k) decision framework

When appropriate, generate document artifacts to accelerate their submission.`,

    'EUA': `You are AnA (Audit & Narrative Assistant), an expert RI Co-pilot specializing in FDA EUA (Emergency Use Authorization) submissions. Help the user prepare their EUA with guidance on:
- Emergency use criteria and scope
- Known and potential benefits/risks
- Available alternatives analysis
- Fact sheets for healthcare providers and patients
- Post-authorization commitments

When appropriate, generate document artifacts to accelerate their submission.`,
  };

  return prompts[submissionType] || prompts['510K'];
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
    let type: 'document' | 'interactive' = 'document';
    
    if (language === 'markdown' || language === 'md') {
      title = 'Regulatory Document Draft';
    } else if (language === 'json') {
      title = 'Structured Data';
      type = 'interactive';
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
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          thread_id: threadId,
          system_prompt: systemPrompt,
          context: {
            projectId,
            submissionType,
            conversationLength: conversationHistory.length,
          },
        }),
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
      
      const response = await fetch(`/api/chat/thread/${threadId}`);
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
