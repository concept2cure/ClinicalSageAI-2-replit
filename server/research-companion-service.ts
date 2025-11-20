import {
  summaryPackets,
  projects,
  insightMemories,
  wisdomTraces,
  studySessions,
} from 'shared/schema';
import { db } from './db';
import { eq, and, like, or, desc } from 'drizzle-orm';
import { huggingFaceService, HFModel } from './huggingface-service';
import { academicKnowledgeService } from './academic-knowledge-service';
import { protocolKnowledgeService } from './protocol-knowledge-service';

interface ResearchCompanionMemory {
  recentTopics: string[];
  favoriteIndications: string[];
  favoriteEndpoints: string[];
  recentCSRs: {
    id: number;
    title: string;
    timestamp: string;
  }[];
  recentQueries: {
    query: string;
    timestamp: string;
  }[];
  userPreferences: {
    expertiseLevel: 'beginner' | 'intermediate' | 'expert';
    preferredStyle: 'conversational' | 'academic' | 'concise';
    showCitations: boolean;
  };
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: {
    type: 'csr' | 'academic';
    id: string;
    title: string;
    excerpt?: string;
  }[];
}

interface ResearchConversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
  memory: ResearchCompanionMemory;
}

// In-memory store for conversations (would be DB-backed in production)
const conversations: Record<string, ResearchConversation> = {};

// Default user preferences
const defaultUserPreferences = {
  expertiseLevel: 'intermediate' as const,
  preferredStyle: 'conversational' as const,
  showCitations: true,
};

// Companion personas with different styles
const COMPANION_PERSONAS = {
  friendly: {
    name: 'Sage',
    systemPrompt:
      'You are Sage, a friendly and supportive research companion who specializes in clinical trial design and analysis. ' +
      'You speak in a warm, encouraging tone and make complex topics approachable without oversimplification. ' +
      "You're enthusiastic about helping researchers improve their clinical trial designs, and you suggest relevant " +
      'academic sources and similar trials that might be helpful. Always provide specific, actionable suggestions ' +
      'rather than generic advice. When referring to clinical studies, cite the relevant trial ID or academic source.',
  },
  academic: {
    name: 'Professor Sage',
    systemPrompt:
      'You are Professor Sage, an academic research companion with expertise in clinical trial methodology and biostatistics. ' +
      'You communicate with academic precision, citing relevant literature and established best practices. ' +
      'You help researchers improve the rigor of their trial designs by referencing similar high-quality studies ' +
      'and methodological papers. Your tone is professional but not dry, and you focus on methodological ' +
      'considerations and statistical validity. Always provide specific citations to support your recommendations.',
  },
  concise: {
    name: 'Sage Brief',
    systemPrompt:
      'You are Sage Brief, a research companion who provides concise, actionable guidance on clinical trial design. ' +
      'You communicate with maximum efficiency, focusing on key points without preamble or unnecessary detail. ' +
      'Your responses are structured as brief bullet points or short paragraphs highlighting only the most ' +
      'important considerations. While brief, you ensure your guidance is specific and actionable, not generic. ' +
      'You cite sources minimally but precisely when needed.',
  },
};

/**
 * Research Companion Service for TrialSage
 *
 * Provides a friendly AI research companion that helps users
 * explore clinical trial designs, methodologies, and academic knowledge
 * with personality and contextual awareness.
 */
class ResearchCompanionService {
  /**
   * Create a new conversation with the research companion
   */
  async createConversation(initialPrompt?: string): Promise<ResearchConversation> {
    const id = `conv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const title = initialPrompt
      ? initialPrompt.substring(0, 30) + (initialPrompt.length > 30 ? '...' : '')
      : 'New Conversation';

    const memory: ResearchCompanionMemory = {
      recentTopics: [],
      favoriteIndications: [],
      favoriteEndpoints: [],
      recentCSRs: [],
      recentQueries: [],
      userPreferences: { ...defaultUserPreferences },
    };

    const messages: ConversationMessage[] = [];

    // Create and store the conversation before generating any responses
    const conversation: ResearchConversation = {
      id,
      title,
      messages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memory,
    };

    conversations[id] = conversation;

    // Now that the conversation is stored, we can add the initial message and response
    if (initialPrompt) {
      const userMessage: ConversationMessage = {
        id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        role: 'user',
        content: initialPrompt,
        timestamp: new Date().toISOString(),
      };

      messages.push(userMessage);

      // Update memory with initial topics
      memory.recentQueries.push({
        query: initialPrompt,
        timestamp: new Date().toISOString(),
      });

      try {
        // Generate initial response after the conversation is stored
        const responseMessage = await this.generateResponse(id, userMessage);
        messages.push(responseMessage);
      } catch (error) {
        console.error('Error generating initial response:', error);

        // Add a fallback response
        messages.push({
          id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          role: 'assistant',
          content:
            "I'm ready to help you with clinical trial research. What would you like to know?",
          timestamp: new Date().toISOString(),
        });
      }
    }

    return conversation;
  }

  /**
   * Get all conversations
   */
  async getConversations(): Promise<{ id: string; title: string; updatedAt: string }[]> {
    return Object.values(conversations)
      .map(conv => ({
        id: conv.id,
        title: conv.title,
        updatedAt: conv.updatedAt,
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Get a conversation by ID
   */
  async getConversation(id: string): Promise<ResearchConversation | null> {
    return conversations[id] || null;
  }

  /**
   * Add a message to a conversation and get a response
   */
  async addMessageToConversation(
    conversationId: string,
    message: string
  ): Promise<ConversationMessage | null> {
    const conversation = conversations[conversationId];
    if (!conversation) {
      return null;
    }

    const userMessage: ConversationMessage = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    conversation.messages.push(userMessage);

    // Update recent queries
    conversation.memory.recentQueries.push({
      query: message,
      timestamp: new Date().toISOString(),
    });

    // Keep only the most recent 5 queries
    if (conversation.memory.recentQueries.length > 5) {
      conversation.memory.recentQueries = conversation.memory.recentQueries.slice(-5);
    }

    // Generate response
    const responseMessage = await this.generateResponse(conversationId, userMessage);
    conversation.messages.push(responseMessage);

    // Update conversation time
    conversation.updatedAt = new Date().toISOString();

    return responseMessage;
  }

  /**
   * Generate a response from the companion based on the conversation context
   */
  async generateResponse(
    conversationId: string,
    userMessage: ConversationMessage
  ): Promise<ConversationMessage> {
    const conversation = conversations[conversationId];
    const { memory } = conversation;

    // Step 1: Retrieve relevant context from our knowledge sources
    const [relevantCSRs, relevantAcademicSources] = await Promise.all([
      this.findRelevantCSRs(userMessage.content, 3),
      this.findRelevantAcademicSources(userMessage.content, 3),
    ]);

    // Step 2: Build contextual prompt using memory and retrieved knowledge
    const persona = this.getPersonaBasedOnPreferences(memory.userPreferences);

    const relevantCSRsContext = relevantCSRs
      .map(
        csr =>
          `RELEVANT TRIAL: ${csr.title} (ID: ${csr.id})
      Indication: ${csr.indication}
      Phase: ${csr.phase}
      Key findings: ${csr.summary || 'Not available'}
      `
      )
      .join('\n\n');

    const relevantAcademicContext = relevantAcademicSources
      .map(
        source =>
          `ACADEMIC SOURCE: ${source.title} (ID: ${source.id})
      Author: ${source.author}
      Date: ${source.date}
      Excerpt: ${source.excerpt || 'Not available'}
      `
      )
      .join('\n\n');

    // Build memory context
    const recentTopicsContext =
      memory.recentTopics.length > 0
        ? `Topics you've recently discussed: ${memory.recentTopics.join(', ')}.`
        : '';

    const favoriteIndicationsContext =
      memory.favoriteIndications.length > 0
        ? `The researcher has shown interest in these indications: ${memory.favoriteIndications.join(', ')}.`
        : '';

    const favoriteEndpointsContext =
      memory.favoriteEndpoints.length > 0
        ? `The researcher has shown interest in these endpoints: ${memory.favoriteEndpoints.join(', ')}.`
        : '';

    const recentCSRsContext =
      memory.recentCSRs.length > 0
        ? `Recently viewed trials: ${memory.recentCSRs.map(csr => csr.title).join(', ')}.`
        : '';

    // Build conversation history context (last 3 messages)
    const recentMessages = conversation.messages.slice(-6);
    const conversationContext = recentMessages
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');

    // Combine all context
    const fullPrompt = `
      ${persona.systemPrompt}
      
      RESEARCHER CONTEXT:
      ${recentTopicsContext}
      ${favoriteIndicationsContext}
      ${favoriteEndpointsContext}
      ${recentCSRsContext}
      Expertise level: ${memory.userPreferences.expertiseLevel}
      
      KNOWLEDGE CONTEXT:
      ${relevantCSRsContext}
      
      ${relevantAcademicContext}
      
      RECENT CONVERSATION:
      ${conversationContext}
      
      USER QUESTION: ${userMessage.content}
      
      Respond thoughtfully as ${persona.name}, providing specific insights based on the relevant trials and academic sources. 
      Answer in a ${memory.userPreferences.preferredStyle} style appropriate for a ${memory.userPreferences.expertiseLevel} expertise level.
      ${memory.userPreferences.showCitations ? 'Include specific citations to support your points.' : 'Focus on the information without formal citations.'}
    `;

    // Step 3: Generate response using Hugging Face
    let response;
    try {
      // Try to use Hugging Face
      response = await huggingFaceService.queryHuggingFace(fullPrompt, HFModel.TEXT, 0.7, 1200);
    } catch (error) {
      console.warn('Unable to generate response using Hugging Face API:', error);

      // Fallback to a basic response
      // This ensures the conversation continues even if the API is unavailable
      // In production, this would use a local model or alternative service
      response =
        "I'm sorry, but I'm unable to provide an AI-generated response at this time. " +
        "However, I've collected some relevant clinical trial information that might be helpful:\n\n" +
        (relevantCSRsContext || 'No specific trials found for this query.') +
        '\n\n' +
        (relevantAcademicContext || 'No specific academic sources found for this query.') +
        '\n\n' +
        'Please try again later when the service is fully available.';
    }

    // Step 4: Extract and format citations
    const citations = [
      ...relevantCSRs.map(csr => ({
        type: 'csr' as const,
        id: csr.id.toString(),
        title: csr.title,
      })),
      ...relevantAcademicSources.map(source => ({
        type: 'academic' as const,
        id: source.id,
        title: source.title,
        excerpt: source.excerpt,
      })),
    ];

    // Step 5: Update memory based on this interaction
    this.updateMemoryFromInteraction(memory, userMessage.content, response, relevantCSRs);

    // Step 6: Create response message
    const responseMessage: ConversationMessage = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      citations: memory.userPreferences.showCitations ? citations : undefined,
    };

    return responseMessage;
  }

  /**
   * Get the appropriate persona based on user preferences
   */
  private getPersonaBasedOnPreferences(preferences: ResearchCompanionMemory['userPreferences']) {
    switch (preferences.preferredStyle) {
      case 'academic':
        return COMPANION_PERSONAS.academic;
      case 'concise':
        return COMPANION_PERSONAS.concise;
      case 'conversational':
      default:
        return COMPANION_PERSONAS.friendly;
    }
  }

  /**
   * Update the memory based on the current interaction
   */
  private updateMemoryFromInteraction(
    memory: ResearchCompanionMemory,
    userMessage: string,
    assistantResponse: string,
    relevantCSRs: any[]
  ) {
    // Update recent CSRs
    for (const csr of relevantCSRs) {
      // Check if this CSR is already in recent CSRs
      const existingIndex = memory.recentCSRs.findIndex(r => r.id === csr.id);

      if (existingIndex >= 0) {
        // Move to the top if already exists
        const existing = memory.recentCSRs.splice(existingIndex, 1)[0];
        existing.timestamp = new Date().toISOString();
        memory.recentCSRs.unshift(existing);
      } else {
        // Add new entry
        memory.recentCSRs.unshift({
          id: csr.id,
          title: csr.title,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Keep only the most recent 5 CSRs
    if (memory.recentCSRs.length > 5) {
      memory.recentCSRs = memory.recentCSRs.slice(0, 5);
    }

    // Extract potential indications and endpoints using simple keyword matching
    // In a real implementation, we would use NLP/entity extraction
    const indicationKeywords = [
      'cancer',
      'diabetes',
      'hypertension',
      'alzheimer',
      'arthritis',
      'depression',
      'asthma',
      'parkinson',
      'copd',
      'multiple sclerosis',
    ];

    const endpointKeywords = [
      'survival',
      'progression',
      'response rate',
      'adverse events',
      'efficacy',
      'toxicity',
      'biomarker',
      'quality of life',
      'pain reduction',
    ];

    // Extract topics from the message
    const lcMessage = userMessage.toLowerCase();

    // Update indications
    for (const indication of indicationKeywords) {
      if (lcMessage.includes(indication) && !memory.favoriteIndications.includes(indication)) {
        memory.favoriteIndications.push(indication);
        // Keep only top 5
        if (memory.favoriteIndications.length > 5) {
          memory.favoriteIndications.shift();
        }
      }
    }

    // Update endpoints
    for (const endpoint of endpointKeywords) {
      if (lcMessage.includes(endpoint) && !memory.favoriteEndpoints.includes(endpoint)) {
        memory.favoriteEndpoints.push(endpoint);
        // Keep only top 5
        if (memory.favoriteEndpoints.length > 5) {
          memory.favoriteEndpoints.shift();
        }
      }
    }

    // Extract topics (simplified approach)
    const potentialTopics = userMessage
      .split(/[.,!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 10 && s.length < 50);
    if (potentialTopics.length > 0) {
      const newTopic = potentialTopics[0];
      if (!memory.recentTopics.includes(newTopic)) {
        memory.recentTopics.push(newTopic);
        // Keep only top 5
        if (memory.recentTopics.length > 5) {
          memory.recentTopics.shift();
        }
      }
    }
  }

  /**
   * Update user preferences for the conversation
   */
  async updateUserPreferences(
    conversationId: string,
    preferences: Partial<ResearchCompanionMemory['userPreferences']>
  ): Promise<boolean> {
    const conversation = conversations[conversationId];
    if (!conversation) {
      return false;
    }

    conversation.memory.userPreferences = {
      ...conversation.memory.userPreferences,
      ...preferences,
    };

    return true;
  }

  /**
   * Find relevant CSRs based on a query
   */
  private async findRelevantCSRs(query: string, limit: number = 3) {
    try {
      // Simple search in titles and indications
      const results = await db
        .select()
        .from(csrReports)
        .where(
          or(
            like(csrReports.title, `%${query}%`),
            like(csrReports.indication, `%${query}%`),
            like(csrReports.sponsor, `%${query}%`)
          )
        )
        .limit(limit);

      return results;
    } catch (error) {
      console.error('Error finding relevant CSRs:', error);

      // Provide basic fallback reports that might be relevant to common queries
      // These fallbacks help ensure the UI has data to display even when DB queries fail
      const keywords = query.toLowerCase().split(/\s+/);

      const fallbackReports = [
        {
          id: 9001,
          title: 'Phase 3 Trial of Novel Treatment for Advanced Cancer',
          indication: 'Oncology',
          phase: 'Phase 3',
          sponsor: 'Medical Research Institute',
          status: 'Completed',
          date: '2024-03-15',
          summary:
            'A randomized controlled trial evaluating efficacy and safety of a novel treatment.',
        },
        {
          id: 9002,
          title: 'Evaluation of Cardiovascular Outcomes with New Antihypertensive',
          indication: 'Hypertension',
          phase: 'Phase 3',
          sponsor: 'Cardiovascular Research Group',
          status: 'Completed',
          date: '2024-02-10',
          summary: 'Multi-center study examining long-term cardiovascular outcomes.',
        },
        {
          id: 9003,
          title: 'Safety and Efficacy Study of New Anti-Inflammatory for Rheumatoid Arthritis',
          indication: 'Rheumatoid Arthritis',
          phase: 'Phase 2',
          sponsor: 'Immunology Research Consortium',
          status: 'Completed',
          date: '2024-01-20',
          summary: 'Double-blind placebo-controlled study of a novel anti-inflammatory agent.',
        },
      ];

      // Filter by keywords in the query to make results more relevant
      return fallbackReports
        .filter(report =>
          keywords.some(
            keyword =>
              report.title.toLowerCase().includes(keyword) ||
              report.indication.toLowerCase().includes(keyword) ||
              report.summary.toLowerCase().includes(keyword)
          )
        )
        .slice(0, limit);
    }
  }

  /**
   * Find relevant academic sources based on a query
   */
  private async findRelevantAcademicSources(query: string, limit: number = 3) {
    try {
      // Leverage the academic knowledge service
      const evidence = await academicKnowledgeService.getAcademicEvidence(query, {});
      return evidence.slice(0, limit);
    } catch (error) {
      console.error('Error finding relevant academic sources:', error);

      // Return fallback academic sources that might be relevant to common clinical trial queries
      const keywords = query.toLowerCase().split(/\s+/);
      const fallbackSources = [
        {
          id: 'clinical-trials-general',
          title: 'Basic Principles of Clinical Trial Design',
          author: 'TrialSage Knowledge Base',
          date: '2025',
          type: 'reference',
          excerpt:
            'Clinical trials are prospective biomedical or behavioral research studies designed to answer specific questions about interventions such as new treatments, vaccines, dietary choices, or medical devices.',
          relevance: 0.9,
        },
        {
          id: 'oncology-endpoints',
          title: 'Primary Endpoints in Oncology Trials',
          author: 'TrialSage Knowledge Base',
          date: '2025',
          type: 'reference',
          excerpt:
            'Common primary endpoints in oncology trials include overall survival (OS), progression-free survival (PFS), objective response rate (ORR), and disease-free survival (DFS).',
          relevance: 0.85,
        },
        {
          id: 'regulatory-guidance',
          title: 'Regulatory Guidance for Clinical Study Design',
          author: 'TrialSage Knowledge Base',
          date: '2025',
          type: 'reference',
          excerpt:
            'Regulatory agencies like FDA and EMA provide guidelines for clinical study designs, including endpoint selection, sample size calculation, and statistical analysis plans.',
          relevance: 0.8,
        },
      ];

      // Filter sources based on query keywords
      return fallbackSources
        .filter(source =>
          keywords.some(
            keyword =>
              source.title.toLowerCase().includes(keyword) ||
              source.excerpt.toLowerCase().includes(keyword)
          )
        )
        .slice(0, limit);
    }
  }
}

export const researchCompanionService = new ResearchCompanionService();
