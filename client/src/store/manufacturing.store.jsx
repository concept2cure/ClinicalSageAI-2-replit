import React from 'react';

// Lightweight context store; replace with Zustand/Redux later if desired.
const Ctx = React.createContext(null);

export function ManufacturingProvider({ children }) {
  const [selectedEntity, setSelectedEntity] = React.useState(null);
  const [selectedSection, setSelectedSection] = React.useState(null);

  const value = React.useMemo(() => ({
    selectedEntity,        // e.g., 'cpp:Tmix', 'mat:API-123', 'batch:2025-09-01-01'
    setSelectedEntity,
    selectedSection,       // e.g., 'materials-bom', 'cpp-cqa', 'validation'
    setSelectedSection,
    clearSelection: () => { setSelectedEntity(null); setSelectedSection(null); }
  }), [selectedEntity, selectedSection]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useManufacturingStore() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useManufacturingStore must be used within <ManufacturingProvider>');
  return ctx;
}