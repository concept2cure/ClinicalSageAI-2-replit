import React, { createContext, useContext, useState, useCallback } from 'react';

// Create the context
const AnAAssistantContext = createContext();

// Custom hook to use the context
export const useAnAAssistant = () => {
  const context = useContext(AnAAssistantContext);
  if (!context) {
    throw new Error('useAnAAssistant must be used within a AnAAssistantProvider');
  }
  return context;
};

// Provider component
export const AnAAssistantProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hello! I'm AnA, your RI Co-pilot for Regulatory Affairs and Medical Writing. I can help you with FDA submissions, clinical documentation, regulatory compliance, medical device protocols, and pharmaceutical submissions. How can I assist you today?",
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
          "Hello! I'm AnA, your RI Co-pilot for Regulatory Affairs and Medical Writing. I can help you with FDA submissions, clinical documentation, regulatory compliance, medical device protocols, and pharmaceutical submissions. How can I assist you today?",
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
    <AnAAssistantContext.Provider value={value}>{children}</AnAAssistantContext.Provider>
  );
};

export default AnAAssistantContext;
