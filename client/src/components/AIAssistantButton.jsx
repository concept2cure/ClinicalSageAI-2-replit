import React, { useState } from 'react';
import { Bot, X, Send, Loader2 } from 'lucide-react'
import { useModuleIntegration } from './integration/ModuleIntegrationLayer';

const AIAssistantButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversation, setConversation] = useState([
    {
      role: 'assistant',
      content:
        "Hello! I'm your Concept2Cure AI Assistant. How can I help you with your regulatory and clinical documentation today?",
    },
  ]);

  const { addAuditEntry } = useModuleIntegration();

  const toggleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      addAuditEntry('ai_assistant_opened', { timestamp: new Date().toISOString() });
    }
  };

  const handleInputChange = e => {
    setMessage(e.target.value);
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    // Add user message to conversation
    const userMessage = {
      role: 'user',
      content: message,
    };

    setConversation(prev => [...prev, userMessage]);
    setMessage('');
    setIsProcessing(true);

    try {
      // In a real implementation, we would send a request to the AI API
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Simulate AI response
      const aiResponse = {
        role: 'assistant',
        content: getAiResponse(message),
      };

      setConversation(prev => [...prev, aiResponse]);
      addAuditEntry('ai_assistant_interaction', {
        user_message: message,
        ai_responded: true,
      });
    } catch (error) {
      console.error('AI Assistant error:', error);
      setConversation(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
        },
      ]);
      addAuditEntry('ai_assistant_error', { error: error.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Simple response generation for demonstration
  const getAiResponse = userMessage => {
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return 'Hello there! How can I assist you with your regulatory documentation today?';
    } else if (lowerMessage.includes('help')) {
      return 'I can help you with document analysis, regulatory guidance, and clinical trial documentation. What specific area do you need assistance with?';
    } else if (lowerMessage.includes('vault') || lowerMessage.includes('document')) {
      return 'C2C Vault provides secure document storage with blockchain verification. You can upload, categorize, and analyze your regulatory documents. Would you like me to guide you through using this feature?';
    } else if (lowerMessage.includes('csr') || lowerMessage.includes('clinical study report')) {
      return 'CSR Intelligence can help you generate and analyze Clinical Study Reports. It uses AI to extract insights, ensure compliance, and streamline your workflow. What specific aspect of CSR preparation do you need help with?';
    } else if (lowerMessage.includes('study') || lowerMessage.includes('protocol')) {
      return 'Study Architect provides tools for designing clinical trials, creating protocols, and managing site documentation. It includes templates based on FDA and ICH guidelines. What kind of study are you designing?';
    } else {
      return (
        "I understand you're asking about " +
        userMessage.slice(0, 30) +
        '... To better assist you, could you provide more details about your specific needs in regulatory documentation or clinical trial management?'
      );
    }
  };

  return (
    <>
      <button onClick={toggleOpen} className="ai-assistant-button">
        <Bot size={24} />
      </button>

      {isOpen && (
        <div
          className="fixed bottom-0 right-0 mb-20 mr-6 w-80 sm:w-96 bg-white rounded-md shadow-xl border border-gray-200 z-50 flex flex-col"
          style={{ height: '440px' }}
        >
          <div className="flex items-center justify-between p-3 border-b border-gray-200">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-pink-600 flex items-center justify-center">
                <Bot size={18} className="text-white" />
              </div>
              <h3 className="ml-2 font-medium">Concept2Cure AI Assistant</h3>
            </div>
            <button onClick={toggleOpen} className="text-gray-500 hover:text-gray-700">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-4">
            {conversation.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs sm:max-w-sm rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-pink-600 text-white rounded-br-none'
                      : 'bg-gray-100 text-gray-800 rounded-bl-none'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-800 rounded-lg rounded-bl-none p-3 flex items-center">
                  <Loader2 size={18} className="text-pink-600 animate-spin mr-2" />
                  Thinking...
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-gray-200">
            <div className="relative">
              <textarea
                className="w-full border border-gray-300 rounded-md py-2 pl-3 pr-10 focus:ring-2 focus:ring-pink-300 focus:border-pink-300 resize-none"
                placeholder="Type your message..."
                rows={2}
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isProcessing}
              />
              <button
                className="absolute right-2 bottom-2 p-1 rounded-full bg-pink-600 text-white disabled:bg-pink-300"
                onClick={handleSendMessage}
                disabled={!message.trim() || isProcessing}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAssistantButton;
