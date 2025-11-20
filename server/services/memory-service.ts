/**
 * Class representing a conversation message
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

/**
 * Conversation thread with a unique identifier
 */
export interface ConversationThread {
  id: string;
  messages: ChatMessage[];
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    indication?: string;
    phase?: string;
    title?: string;
    lastQueryEmbedding?: number[];
  };
}

/**
 * Service to manage AI conversation memory
 */
export class MemoryService {
  private conversations: Record<string, ConversationThread> = {};
  private dbBackedUp: boolean = false;

  /**
   * Initialize a new conversation thread
   */
  createConversation(
    id: string,
    initialSystemMessage?: string,
    metadata?: Record<string, any>
  ): string {
    const now = new Date();
    const conversationId = id || `conv_${Date.now()}`;

    this.conversations[conversationId] = {
      id: conversationId,
      messages: [],
      metadata: {
        createdAt: now,
        updatedAt: now,
        ...metadata,
      },
    };

    // Add initial system message if provided
    if (initialSystemMessage) {
      this.addMessage(conversationId, {
        role: 'system',
        content: initialSystemMessage,
        timestamp: now,
      });
    }

    return conversationId;
  }

  /**
   * Add a message to a conversation
   */
  addMessage(conversationId: string, message: ChatMessage): void {
    if (!this.conversations[conversationId]) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    this.conversations[conversationId].messages.push(message);
    this.conversations[conversationId].metadata.updatedAt = new Date();
  }

  /**
   * Get a conversation by ID
   */
  getConversation(conversationId: string): ConversationThread | null {
    return this.conversations[conversationId] || null;
  }

  /**
   * Get all conversations
   */
  getAllConversations(): ConversationThread[] {
    return Object.values(this.conversations);
  }

  /**
   * Delete a conversation
   */
  deleteConversation(conversationId: string): boolean {
    if (!this.conversations[conversationId]) {
      return false;
    }

    delete this.conversations[conversationId];
    return true;
  }

  /**
   * Format the chat history for a conversation into a prompt format
   */
  formatChatHistory(conversationId: string, maxMessages: number = 10): string {
    const conversation = this.getConversation(conversationId);
    if (!conversation) {
      return '';
    }

    // Take the most recent messages up to maxMessages
    const recentMessages = conversation.messages.slice(-maxMessages);

    // Format the history
    let formattedHistory = '';
    recentMessages.forEach(message => {
      if (message.role === 'system') {
        formattedHistory += `<system>\n${message.content}\n</system>\n\n`;
      } else if (message.role === 'user') {
        formattedHistory += `<human>\n${message.content}\n</human>\n\n`;
      } else if (message.role === 'assistant') {
        formattedHistory += `<assistant>\n${message.content}\n</assistant>\n\n`;
      }
    });

    return formattedHistory;
  }

  /**
   * Update conversation metadata
   */
  updateMetadata(conversationId: string, metadata: Record<string, any>): void {
    if (!this.conversations[conversationId]) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    this.conversations[conversationId].metadata = {
      ...this.conversations[conversationId].metadata,
      ...metadata,
      updatedAt: new Date(),
    };
  }

  /**
   * Generate a summary of the conversation
   */
  generateSummary(conversationId: string): string {
    const conversation = this.getConversation(conversationId);
    if (!conversation || conversation.messages.length === 0) {
      return 'No conversation data available.';
    }

    const userMessages = conversation.messages.filter(msg => msg.role === 'user');
    const assistantMessages = conversation.messages.filter(msg => msg.role === 'assistant');

    let summary = `Conversation Summary:\n`;
    summary += `- Started: ${conversation.metadata.createdAt.toLocaleString()}\n`;
    summary += `- Last updated: ${conversation.metadata.updatedAt.toLocaleString()}\n`;
    summary += `- Total messages: ${conversation.messages.length}\n`;
    summary += `- User queries: ${userMessages.length}\n`;
    summary += `- Assistant responses: ${assistantMessages.length}\n\n`;

    // Add topics if any metadata exists
    if (conversation.metadata.indication) {
      summary += `- Topic: ${conversation.metadata.indication}\n`;
    }
    if (conversation.metadata.phase) {
      summary += `- Phase: ${conversation.metadata.phase}\n`;
    }

    // Last few exchanges
    if (conversation.messages.length > 0) {
      summary += `\nRecent exchanges:\n`;
      const recentMessages = conversation.messages.slice(-6); // Last 3 exchanges

      for (let i = 0; i < recentMessages.length; i++) {
        const msg = recentMessages[i];
        if (msg.role === 'user') {
          summary += `- User: "${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}"\n`;
        } else if (msg.role === 'assistant') {
          summary += `- AI: "${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}"\n`;
        }
      }
    }

    return summary;
  }
}

// Export a singleton instance for convenience
export const memoryService = new MemoryService();
