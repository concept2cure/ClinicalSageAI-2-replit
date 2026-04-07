import React from 'react';
import { cn } from '@/lib/utils';

interface GlobalOperatingShellProps {
  layoutMode: string;
  activeProjectName?: string;
  activeNavId?: string;
  currentGlobalNodeLabel?: string;
  activeArtifactLabel?: string;
  onAction?: (
    action:
      | 'ri-copilot'
      | 'submission-builder'
      | 'cmc'
      | 'clinical-module5'
      | 'verify'
      | 'review'
      | 'publish'
      | 'haq'
      | 'vault'
  ) => void;
  children: React.ReactNode;
}

/**
 * Minimal shell wrapper — just a subtle breadcrumb when inside a workspace layout.
 * No navigation buttons, no badges — navigation lives in the sidebar.
 */
export function GlobalOperatingShell({
  layoutMode,
  activeProjectName,
  currentGlobalNodeLabel,
  activeArtifactLabel,
  children,
}: GlobalOperatingShellProps) {
  const showBreadcrumb = [
    'regulatory-workspace',
    'documents',
    'report-engine',
    'submissions',
    'review',
    'dossier-map',
  ].includes(layoutMode);

  const crumbs = [
    activeProjectName,
    currentGlobalNodeLabel,
    activeArtifactLabel,
  ].filter(Boolean);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#faf9f7]">
      {showBreadcrumb && crumbs.length > 0 && (
        <div className="h-7 border-b border-stone-100 px-4 flex items-center gap-1.5">
          {crumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-stone-300 text-[10px]">/</span>}
              <span className={cn(
                'text-[11px]',
                i === crumbs.length - 1 ? 'text-stone-600 font-medium' : 'text-stone-400'
              )}>
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

export default GlobalOperatingShell;
