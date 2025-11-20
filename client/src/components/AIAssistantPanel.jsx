/**
 * AI Assistant Panel
 *
 * This component provides an interactive AI assistant interface for the Concept2Cure platform.
 * It serves as the user interface for the RegulatoryIntelligenceCore.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Send,
  RefreshCw,
  Clipboard,
  Download,
  Bot,
  User,
  Database,
  BookOpen,
  Wand2,
  AlertCircle,
} from 'lucide-react';
import regulatoryIntelligenceCore from '../services/RegulatoryIntelligenceCore';
import { useModuleIntegration } from './integration/ModuleIntegrationLayer';

// Message types
const MESSAGE_TYPES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  ERROR: 'error',
};

// AI Assistant panel
const AIAssistantPanel = ({ isOpen, onClose, activeModule }) => {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      type: MESSAGE_TYPES.ASSISTANT,
      content: "Hello! I'm your Concept2Cure AI Assistant. How can I help you today?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { sharedContext } = useModuleIntegration();

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [isOpen]);

  // Add context-aware welcome message when module changes
  useEffect(() => {
    if (activeModule && isOpen) {
      let moduleMessage = '';

      switch (activeModule) {
        case 'ind-wizard':
          moduleMessage =
            "I see you're using the IND Wizard module. I can help with IND preparation, form filling, and submission strategies.";
          break;
        case 'trial-vault':
          moduleMessage =
            "I see you're in the Trial Vault module. I can help with document management, search, and verification.";
          break;
        case 'csr-intelligence':
          moduleMessage =
            "I see you're working in CSR Intelligence. I can help with CSR structure, content generation, and data analysis.";
          break;
        case 'study-architect':
          moduleMessage =
            "I see you're in the Study Architect module. I can help with protocol design, study planning, and CRF creation.";
          break;
        default:
          return; // Don't add a message if not in a specific module
      }

      setMessages(prev => [
        ...prev,
        {
          id: `module-context-${Date.now()}`,
          type: MESSAGE_TYPES.SYSTEM,
          content: moduleMessage,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [activeModule, isOpen]);

  // Handle input change
  const handleInputChange = e => {
    setInputValue(e.target.value);
  };

  // Handle form submission
  const handleSubmit = async e => {
    e.preventDefault();

    if (!inputValue.trim() || isProcessing) {
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      type: MESSAGE_TYPES.USER,
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsProcessing(true);

    try {
      // Collect context for AI
      const contextData = {
        activeModule,
        previousMessages: messages.slice(-5).map(msg => ({
          type: msg.type,
          content: msg.content,
        })),
        ...getRelevantContext(),
      };

      // Get response from AI
      const response = await regulatoryIntelligenceCore.getChatResponse(
        userMessage.content,
        contextData
      );

      // Add assistant response
      setMessages(prev => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          type: MESSAGE_TYPES.ASSISTANT,
          content: response,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error('Error getting AI response:', error);

      // Add error message
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          type: MESSAGE_TYPES.ERROR,
          content: `I'm sorry, I encountered an error: ${error.message}. Please try again later.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Get relevant context from shared context
  const getRelevantContext = () => {
    if (!sharedContext) {
      return {};
    }

    const relevantContext = {};

    // Extract only the most recent context items of each type
    Object.keys(sharedContext).forEach(contextType => {
      if (contextType === 'activeModule' || contextType === 'lastModuleSwitch') {
        relevantContext[contextType] = sharedContext[contextType];
        return;
      }

      if (typeof sharedContext[contextType] === 'object') {
        const contextItems = Object.values(sharedContext[contextType]);

        if (contextItems.length > 0) {
          // Sort by updatedAt and get most recent
          const sortedItems = [...contextItems].sort(
            (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
          );

          relevantContext[contextType] = sortedItems[0];
        }
      }
    });

    return relevantContext;
  };

  // Copy message to clipboard
  const copyToClipboard = content => {
    navigator.clipboard.writeText(content).then(
      () => {
        // Add system message about copy
        setMessages(prev => [
          ...prev,
          {
            id: `system-${Date.now()}`,
            type: MESSAGE_TYPES.SYSTEM,
            content: 'Message copied to clipboard',
            timestamp: new Date().toISOString(),
          },
        ]);
      },
      err => {
        console.error('Could not copy text: ', err);
      }
    );
  };

  // Clear chat history
  const clearChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        type: MESSAGE_TYPES.ASSISTANT,
        content: 'Chat history cleared. How can I help you today?',
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  // Export chat history
  const exportChat = () => {
    const chatHistory = messages
      .map(
        msg =>
          `[${new Date(msg.timestamp).toLocaleString()}] ${msg.type.toUpperCase()}: ${msg.content}`
      )
      .join('\n\n');

    const blob = new Blob([chatHistory], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trialsage-chat-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Render individual message
  const renderMessage = message => {
    let icon;
    let className;

    switch (message.type) {
      case MESSAGE_TYPES.USER:
        icon = <User size={20} />;
        className = 'bg-blue-50 border-blue-200';
        break;
      case MESSAGE_TYPES.ASSISTANT:
        icon = <Bot size={20} />;
        className = 'bg-purple-50 border-purple-200';
        break;
      case MESSAGE_TYPES.SYSTEM:
        icon = <Database size={20} />;
        className = 'bg-gray-50 border-gray-200 text-gray-700';
        break;
      case MESSAGE_TYPES.ERROR:
        icon = <AlertCircle size={20} />;
        className = 'bg-red-50 border-red-200 text-red-700';
        break;
      default:
        icon = <BookOpen size={20} />;
        className = 'bg-gray-50 border-gray-200';
    }

    return (
      <div key={message.id} className={`p-4 mb-4 border rounded-lg ${className} relative group`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">{icon}</div>
          <div className="flex-1">
            <div className="whitespace-pre-wrap">{message.content}</div>
            <div className="text-xs text-gray-500 mt-2">
              {new Date(message.timestamp).toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Action buttons that appear on hover */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => copyToClipboard(message.content)}
            className="p-1 text-gray-500 hover:text-gray-700 focus:outline-none"
            aria-label="Copy to clipboard"
          >
            <Clipboard size={16} />
          </button>
        </div>
      </div>
    );
  };

  // Panel animation variants
  const panelVariants = {
    open: {
      x: 0,
      opacity: 1,
      transition: { type: 'spring', stiffness: 300, damping: 30 },
    },
    closed: {
      x: '100%',
      opacity: 0,
      transition: { type: 'spring', stiffness: 300, damping: 30 },
    },
  };

  if (!isOpen) {
    return null;
  }

  return (
    <motion.div
      initial="closed"
      animate="open"
      exit="closed"
      variants={panelVariants}
      className="fixed top-0 right-0 bottom-0 z-40 w-full sm:w-96 bg-white shadow-xl border-l flex flex-col"
    >
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center">
          <Bot size={24} className="text-primary mr-2" />
          <h2 className="text-lg font-semibold">TrialSage AI Assistant</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={clearChat}
            className="p-2 text-gray-500 hover:text-gray-700 focus:outline-none"
            aria-label="Clear chat"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={exportChat}
            className="p-2 text-gray-500 hover:text-gray-700 focus:outline-none"
            aria-label="Export chat"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />

        {/* Loading indicator */}
        {isProcessing && (
          <div className="flex items-center gap-2 text-gray-500 italic p-4">
            <div className="animate-spin">
              <RefreshCw size={16} />
            </div>
            <span>Processing...</span>
          </div>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder="Ask me anything..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            disabled={isProcessing}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isProcessing}
            className="p-2 bg-primary text-white rounded-lg hover:bg-opacity-90 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send size={20} />
          </button>
        </div>

        {/* Context indicator */}
        {activeModule && (
          <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
            <Wand2 size={12} />
            <span>Personalized for {activeModule}</span>
          </div>
        )}
      </form>
    </motion.div>
  );
};

export default AIAssistantPanel;
