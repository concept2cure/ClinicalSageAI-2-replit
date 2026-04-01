/**
 * Connected Project Switcher
 * 
 * Wraps ProjectSwitcher with data from useProjects hook.
 * Provides real-time project management with API persistence.
 * 
 * @module concept2cure/components/projects/ConnectedProjectSwitcher
 * @version 3.0.0
 */

import React, { useMemo } from 'react';
import { ProjectSwitcher } from './ProjectSwitcher';
import { useProjects } from '../../hooks/useProjects';
import type { SubmissionType } from '../../types';

interface ConnectedProjectSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  activeProjectId?: string;
  onSelectProject: (id: string) => void;
  onOpenNewProjectModal: () => void;
}

/**
 * Connected Project Switcher with real data
 */
export const ConnectedProjectSwitcher: React.FC<ConnectedProjectSwitcherProps> = ({
  isOpen,
  onClose,
  activeProjectId,
  onSelectProject,
  onOpenNewProjectModal,
}) => {
  const {
    projects: rawProjects,
    isLoading,
    updateProject,
    deleteProject,
  } = useProjects();

  // Transform projects to the format expected by ProjectSwitcher
  const projects = useMemo(() => {
    return rawProjects.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.submissionType as '510K' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'DE_NOVO' | 'EUA',
      description: p.description,
      starred: p.starred ?? false,
      archived: p.archived ?? false,
      lastUpdated: p.updatedAt,
      conversationCount: p.conversations?.length ?? 0,
      teamMembers: 1, // Default for now
    }));
  }, [rawProjects]);

  // Handle star toggle
  const handleToggleStar = async (id: string) => {
    const project = rawProjects.find((p) => p.id === id);
    if (project) {
      await updateProject({
        ...project,
        starred: !project.starred,
      });
    }
  };

  // Handle archive
  const handleArchive = async (id: string) => {
    const project = rawProjects.find((p) => p.id === id);
    if (project) {
      await updateProject({
        ...project,
        archived: !project.archived,
      });
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    await deleteProject(id);
  };

  if (!isOpen) return null;

  return (
    <ProjectSwitcher
      isOpen={isOpen}
      onClose={onClose}
      projects={projects}
      isLoading={isLoading}
      activeProjectId={activeProjectId}
      onSelectProject={onSelectProject}
      onCreateProject={onOpenNewProjectModal}
      onArchiveProject={handleArchive}
      onDeleteProject={handleDelete}
      onToggleStar={handleToggleStar}
    />
  );
};

export default ConnectedProjectSwitcher;
