/**
 * ProjectHomeDashboard — Claude.ai-style project landing header.
 *
 * Shows: ← All projects back link, project name as hero, description.
 * Everything else is in the conversation (AnaPersistentPanel below).
 */

import React from 'react';
import { ChevronLeft } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectHomeDashboardProps {
  project: {
    id: number;
    name: string;
    type: string;
    description?: string | null;
    sponsor?: string | null;
    product?: string | null;
    region?: string | null;
  };
  onNavigate: (mode: string, sectionCode?: string) => void;
  onOpenConfig?: () => void;
  onSuggestedPrompt?: (prompt: string) => void;
  onOpenSearch?: () => void;
  onOpenArtifact?: (artifactId: string) => void;
  onBackToProjects?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ProjectHomeDashboard: React.FC<ProjectHomeDashboardProps> = ({
  project,
  onBackToProjects,
}) => {
  return (
    <div className="flex-shrink-0 bg-white" data-testid="project-context-strip">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-4">
        {/* Back link */}
        <button
          onClick={onBackToProjects}
          className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700 transition-colors mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          All projects
        </button>

        {/* Project title */}
        <h1 className="text-xl font-semibold text-stone-900">{project.name}</h1>

        {/* Description */}
        {project.description && (
          <p className="text-sm text-stone-500 mt-1 leading-relaxed">{project.description}</p>
        )}
      </div>
    </div>
  );
};

export default ProjectHomeDashboard;
