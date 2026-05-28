/**
 * ProjectDetailRoute — entry point for the project detail surface.
 * Mirrors PdevRoute / BiopharmaRoute: thin wrapper that imports CSS
 * and re-exports the app component.
 *
 * @module client/src/concept2cure/projects/ProjectDetailRoute
 */

import * as React from 'react';
import { ProjectDetail } from './ProjectDetail';
import './project.css';

interface ProjectDetailRouteProps {
  projectId: string;
  onBack?: () => void;
  onOpenDraft?: (draft: { id: number; document_id: string; section_key: string; label: string | null; status: string; draft_source: string | null; owner_id: number | null; updated_at: string | null; doc_type: string | null; document_title: string | null }) => void;
  onOpenWorkstream?: (module: string) => void;
}

export default function ProjectDetailRoute(props: ProjectDetailRouteProps) {
  return <ProjectDetail {...props} />;
}
