import React, { createContext, useContext, useState } from 'react';
import LumenAssistant from './LumenAssistant';

// Create context for the assistant
const LumenAssistantContext = createContext({
  isAssistantOpen: false,
  setIsAssistantOpen: () => {},
});

export function useLumenAssistant() {
  const context = useContext(LumenAssistantContext);
  if (context === undefined) {
    throw new Error('useLumenAssistant must be used within a LumenAssistantProvider');
  }
  return context;
}

export function LumenAssistantProvider({ children }) {
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  return (
    <LumenAssistantContext.Provider
      value={{
        isAssistantOpen,
        setIsAssistantOpen,
      }}
    >
      {children}
      <LumenAssistant />
    </LumenAssistantContext.Provider>
  );
}
