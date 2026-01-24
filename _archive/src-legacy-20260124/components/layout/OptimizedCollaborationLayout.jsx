import React, { lazy, Suspense } from 'react';

// Lazy load the collaboration hub
const LazyCollaborationHub = lazy(() => import('../collaboration/LazyCollaborationHub'));

/**
 * OptimizedCollaborationLayout
 *
 * A performance-optimized layout component that lazily loads the collaboration features
 * only when needed. This prevents the collaboration features from negatively impacting
 * initial page load performance, especially important for large pages like CERV2.
 */
const OptimizedCollaborationLayout = ({ children }) => {
  // Mock data for demonstration - in a real implementation, this would come from authentication
  const currentUser = {
    id: '0',
    name: 'Current User',
    avatar: '/avatars/user.jpg',
    role: 'Regulatory Affairs Specialist',
  };

  // Get current project info - in a real implementation this would come from context or URL
  const projectId = 'current-project';
  const moduleName = 'cer'; // or '510k', 'ind', etc.

  return (
    <div className="flex h-screen w-full">
      <div className="flex-1 overflow-auto">{children}</div>
      <Suspense
        fallback={
          <div className="w-12 border-l h-full">{/* Minimal placeholder while loading */}</div>
        }
      >
        <LazyCollaborationHub
          projectId={projectId}
          moduleName={moduleName}
          currentUser={currentUser}
          onTaskSelect={task => {
            console.log('Task selected:', task);
            // In a real implementation, this would navigate to the task or open a detail panel
          }}
          onMilestoneComplete={milestone => {
            console.log('Milestone completed:', milestone);
            // In a real implementation, this would update the milestone status
          }}
        />
      </Suspense>
    </div>
  );
};

export default OptimizedCollaborationLayout;
