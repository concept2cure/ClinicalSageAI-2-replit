import React from 'react';
import { CollaborationProvider } from '@/contexts/CollaborationContext';
import CollaborationSidebar from './CollaborationSidebar';

/**
 * Stability Enabled Collaboration Layout
 *
 * This component wraps the entire application with the CollaborationProvider
 * and adds the CollaborationSidebar to the layout.
 */
const StabilityEnabledCollaborationLayout = ({ children }) => {
  // In a real implementation, these values would be dynamically determined
  // based on the current project and module
  const initialProjectId = 'current-project';
  const initialModuleType = 'cer'; // or '510k', 'ind', etc.

  return (
    <CollaborationProvider
      initialProjectId={initialProjectId}
      initialModuleType={initialModuleType}
    >
      <div className="flex h-screen w-full">
        <div className="flex-1 overflow-auto">{children}</div>
        <CollaborationSidebar />
      </div>
    </CollaborationProvider>
  );
};

export default StabilityEnabledCollaborationLayout;
