import React from 'react';
import { useCollaboration } from '@/contexts/CollaborationContext';
import ProjectCollaborationHub from '@/components/collaboration/ProjectCollaborationHub';

/**
 * Collaboration Sidebar Component
 *
 * This component provides a sidebar that integrates the ProjectCollaborationHub
 * into the main application layout.
 */
const CollaborationSidebar = () => {
  // Get collaboration context values
  const { projectId, moduleType, currentUser, refreshAll } = useCollaboration();

  // Handle task selection from the collaboration hub
  const handleTaskSelect = task => {
    // In a real implementation, this would navigate to the relevant task or show a task detail modal
    console.log('Task selected:', task);
  };

  // Handle milestone completion from the collaboration hub
  const handleMilestoneComplete = milestone => {
    // In a real implementation, this would update the milestone status and refresh related data
    console.log('Milestone completed:', milestone);
    refreshAll();
  };

  return (
    <ProjectCollaborationHub
      projectId={projectId}
      moduleName={moduleType}
      currentUser={currentUser}
      onTaskSelect={handleTaskSelect}
      onMilestoneComplete={handleMilestoneComplete}
    />
  );
};

export default CollaborationSidebar;
