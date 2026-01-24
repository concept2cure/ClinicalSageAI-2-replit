import React, { createContext, useContext, useState, useCallback } from 'react';

// Create the context
const LumenAiAssistantContext = createContext();

// Custom hook to use the context
export const useLumenAiAssistant = () => {
  const context = useContext(LumenAiAssistantContext);
  if (!context) {
    throw new Error('useLumenAiAssistant must be used within a LumenAiAssistantProvider');
  }
  return context;
};

// Provider component
export const LumenAiAssistantProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hello! I'm Lumen, your Regulatory Affairs AI Expert and Medical Writing Specialist. I can help you with FDA submissions, clinical documentation, regulatory compliance, medical device protocols, and pharmaceutical submissions. How can I assist you today?",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [moduleContext, setModuleContext] = useState({});

  const openAssistant = useCallback((module = 'general', context = {}) => {
    setModuleContext({ module, context });
    setIsOpen(true);
  }, []);

  const closeAssistant = useCallback(() => {
    setIsOpen(false);
  }, []);

  const addMessage = useCallback(message => {
    setMessages(prev => [
      ...prev,
      {
        ...message,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([
      {
        role: 'assistant',
        content:
          "Hello! I'm Lumen, your Regulatory Affairs AI Expert and Medical Writing Specialist. I can help you with FDA submissions, clinical documentation, regulatory compliance, medical device protocols, and pharmaceutical submissions. How can I assist you today?",
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  }, []);

  const value = {
    isOpen,
    messages,
    moduleContext,
    openAssistant,
    closeAssistant,
    addMessage,
    clearMessages,
    setModuleContext,
  };

  return (
    <LumenAiAssistantContext.Provider value={value}>{children}</LumenAiAssistantContext.Provider>
  );
};

export default LumenAiAssistantContext;
