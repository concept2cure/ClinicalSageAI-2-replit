import React, { createContext, useContext, useState } from 'react';
import AnAQuickAssistant from './AnAQuickAssistant';

// Create context for the assistant
const AnAQuickAssistantContext = createContext({
  isAssistantOpen: false,
  setIsAssistantOpen: () => {},
});

export function useAnAQuickAssistant() {
  const context = useContext(AnAQuickAssistantContext);
  if (context === undefined) {
    throw new Error('useAnAQuickAssistant must be used within a AnAQuickAssistantProvider');
  }
  return context;
}

export function AnAQuickAssistantProvider({ children }) {
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const toggleAssistant = () => setIsAssistantOpen(prev => !prev);

  return (
    <AnAQuickAssistantContext.Provider
      value={{
        isAssistantOpen,
        setIsAssistantOpen,
        toggleAssistant,
      }}
    >
      {children}
      <AnAQuickAssistant />
    </AnAQuickAssistantContext.Provider>
  );
}
