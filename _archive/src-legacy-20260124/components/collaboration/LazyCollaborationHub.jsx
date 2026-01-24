import React, { lazy, Suspense, useState } from 'react';
import { Users, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Lazy load the actual collaboration hub to reduce initial bundle size
const ProjectCollaborationHub = lazy(() =>
  import('./ProjectCollaborationHub').then(module => ({
    default: module.default,
  }))
);

/**
 * LazyCollaborationHub Component
 *
 * This is a performance-optimized wrapper for the ProjectCollaborationHub component.
 * It uses lazy loading to defer loading the actual collaboration hub until it's needed,
 * reducing the initial bundle size and improving first render performance.
 */
const LazyCollaborationHub = ({
  projectId,
  moduleName,
  currentUser,
  onTaskSelect,
  onMilestoneComplete,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Only load the full collaboration hub when expanded
  const handleExpand = () => {
    setIsExpanded(true);
    setHasLoaded(true);
  };

  return (
    <div
      className={`border-l h-full flex flex-col ${isExpanded ? 'w-80' : 'w-12'} transition-all duration-200 ease-in-out`}
    >
      {/* Header - always shown */}
      <div className="p-3 border-b flex items-center justify-between bg-secondary/20">
        {isExpanded ? (
          <>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-sm">Project Collaboration</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setIsExpanded(false)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 mx-auto" onClick={handleExpand}>
            <Users className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Lazy loaded content */}
      {hasLoaded && (
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          }
        >
          {isExpanded && (
            <div className="flex-1 overflow-hidden">
              <ProjectCollaborationHub
                projectId={projectId}
                moduleName={moduleName}
                currentUser={currentUser}
                onTaskSelect={onTaskSelect}
                onMilestoneComplete={onMilestoneComplete}
                isExpanded={isExpanded}
                onCollapse={() => setIsExpanded(false)}
              />
            </div>
          )}
        </Suspense>
      )}
    </div>
  );
};

export default LazyCollaborationHub;
