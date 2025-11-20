import { createContext, useContext, useState } from 'react';

// Create context
const DocumentContext = createContext(undefined);

// Provider component
export function DocumentContextProvider({ children, value }) {
  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>;
}

// Hook for consuming the context
export function useDocumentContext() {
  const context = useContext(DocumentContext);
  if (context === undefined) {
    throw new Error('useDocumentContext must be used within a DocumentContextProvider');
  }
  return context;
}
