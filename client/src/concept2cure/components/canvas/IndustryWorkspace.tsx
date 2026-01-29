/**
 * @fileoverview Industry Workspace - Dynamic Industry-Specific Workspaces
 * @module concept2cure/components/canvas/IndustryWorkspace
 * @version 1.0.0
 *
 * @description
 * Polymorphic workspace component that adapts to industry context.
 * Renders appropriate tools and interfaces based on user's industry.
 */

import React, { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

// Lazy load industry-specific components
const MedTechWorkspace = lazy(() => import('./workspaces/MedTechWorkspace'));
const PharmaWorkspace = lazy(() => import('./workspaces/PharmaWorkspace'));
const BiotechWorkspace = lazy(() => import('./workspaces/BiotechWorkspace'));
const CROWorkspace = lazy(() => import('./workspaces/CROWorkspace'));
const RegulatoryWorkspace = lazy(() => import('./workspaces/RegulatoryWorkspace'));
const MedicalWritingWorkspace = lazy(() => import('./workspaces/MedicalWritingWorkspace'));

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type IndustryType = 
  | 'MEDTECH'
  | 'PHARMA'
  | 'BIOTECH'
  | 'CRO'
  | 'REGULATORY'
  | 'MEDICAL_WRITING';

export interface IndustryWorkspaceProps {
  industry: IndustryType;
  projectId?: string;
  userId: string;
  onNavigate?: (destination: string) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING FALLBACK
// ═══════════════════════════════════════════════════════════════════════════════

const WorkspaceLoading: React.FC = () => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <Loader2 className="w-10 h-10 animate-spin text-zinc-400 mx-auto mb-4" />
      <p className="text-zinc-500">Loading workspace...</p>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const IndustryWorkspace: React.FC<IndustryWorkspaceProps> = ({
  industry,
  projectId,
  userId,
  onNavigate,
  className,
}) => {
  const renderWorkspace = () => {
    const commonProps = { projectId, userId, onNavigate };

    switch (industry) {
      case 'MEDTECH':
        return <MedTechWorkspace {...commonProps} />;
      case 'PHARMA':
        return <PharmaWorkspace {...commonProps} />;
      case 'BIOTECH':
        return <BiotechWorkspace {...commonProps} />;
      case 'CRO':
        return <CROWorkspace {...commonProps} />;
      case 'REGULATORY':
        return <RegulatoryWorkspace {...commonProps} />;
      case 'MEDICAL_WRITING':
        return <MedicalWritingWorkspace {...commonProps} />;
      default:
        return (
          <div className="flex items-center justify-center h-full text-zinc-500">
            Unknown industry type: {industry}
          </div>
        );
    }
  };

  return (
    <div className={cn("h-full", className)}>
      <Suspense fallback={<WorkspaceLoading />}>
        {renderWorkspace()}
      </Suspense>
    </div>
  );
};

export default IndustryWorkspace;
