import React, { Suspense, useMemo } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ZenChat } from '../chat/ZenChat';
import { ErrorBoundary } from '../ErrorBoundary';
import type { ActionCardDef } from '../chat/ActionCard';

const DEVICE_SUGGESTED_ACTIONS: Record<string, ActionCardDef[]> = {
  '510K': [
    { id: 'sa-predicate', label: 'Find predicate devices', intent: 'chat.new', description: 'Search FDA database for comparable 510(k) cleared devices' },
    { id: 'sa-se', label: 'Draft SE comparison', intent: 'chat.new', description: 'Build substantial equivalence comparison table' },
    { id: 'sa-compliance', label: 'Check compliance', intent: 'chat.new', description: 'Run compliance checks against FDA 510(k) requirements' },
    { id: 'sa-estar', label: 'Prepare eSTAR package', intent: 'chat.new', description: 'Assemble eSTAR submission package for FDA gateway' },
  ],
  PMA: [
    { id: 'sa-pma-strategy', label: 'Plan PMA strategy', intent: 'chat.new', description: 'Define PMA submission strategy and timeline' },
    { id: 'sa-pma-clinical', label: 'Clinical evidence plan', intent: 'chat.new', description: 'Plan clinical investigation and IDE requirements' },
    { id: 'sa-pma-ssed', label: 'Draft SSED outline', intent: 'chat.new', description: 'Outline the Summary of Safety and Effectiveness Data' },
    { id: 'sa-pma-risk', label: 'Risk management review', intent: 'chat.new', description: 'Review ISO 14971 risk management file completeness' },
  ],
  CER: [
    { id: 'sa-cer-faers', label: 'Pull FAERS data', intent: 'chat.new', description: 'Retrieve FDA adverse event data for clinical evaluation' },
    { id: 'sa-cer-literature', label: 'Literature search', intent: 'chat.new', description: 'Search PubMed for relevant clinical evidence' },
    { id: 'sa-cer-draft', label: 'Draft CER section', intent: 'chat.new', description: 'AI-assisted CER narrative drafting per MEDDEV 2.7/1' },
    { id: 'sa-cer-export', label: 'Export CER report', intent: 'chat.new', description: 'Generate governed PDF/Word export of the CER' },
  ],
  DE_NOVO: [
    { id: 'sa-denovo-classify', label: 'De Novo classification', intent: 'chat.new', description: 'Verify De Novo eligibility and risk-based classification' },
    { id: 'sa-denovo-predicate', label: 'Search similar devices', intent: 'chat.new', description: 'Find comparable legally marketed devices' },
    { id: 'sa-denovo-risk', label: 'Risk analysis (ISO 14971)', intent: 'chat.new', description: 'Review risk management file for De Novo submission' },
    { id: 'sa-denovo-summary', label: 'Draft De Novo summary', intent: 'chat.new', description: 'Draft the De Novo request summary for FDA submission' },
  ],
  IVDR: [
    { id: 'sa-ivdr-cer', label: 'Start IVDR clinical evaluation', intent: 'chat.new', description: 'Begin clinical evaluation per EU IVDR requirements' },
    { id: 'sa-ivdr-perf', label: 'Performance evaluation plan', intent: 'chat.new', description: 'Design analytical and clinical performance studies' },
    { id: 'sa-ivdr-literature', label: 'Literature search', intent: 'chat.new', description: 'Search for clinical evidence supporting device claims' },
    { id: 'sa-ivdr-class', label: 'IVDR classification', intent: 'chat.new', description: 'Verify device classification under EU IVDR Annex VIII' },
  ],
};

interface EmbeddedModulePageProps {
  embedded?: boolean;
  projectId?: string;
  projectName?: string;
  onBackToProject?: () => void;
  initialDocumentType?: string;
}

interface BaseEmbeddedHostProps {
  moduleAssistantOpen: boolean;
  setModuleAssistantOpen: (open: boolean) => void;
  activeProjectId?: string;
  projectId: string;
  projectName?: string;
  activeThreadId?: string;
  onNavigate: (path: string) => void;
  onNewProject: () => void;
  onThreadChange: (threadId?: string) => void;
}

interface Embedded510kHostProps extends BaseEmbeddedHostProps {
  FDA510kWorkspacePage: React.ComponentType<EmbeddedModulePageProps>;
  ModuleLoadingFallback: React.ComponentType;
  onBackToProject: () => void;
}

export const Embedded510kHost: React.FC<Embedded510kHostProps> = ({
  moduleAssistantOpen,
  setModuleAssistantOpen,
  activeProjectId,
  projectId,
  projectName,
  activeThreadId,
  onNavigate,
  onNewProject,
  onThreadChange,
  FDA510kWorkspacePage,
  ModuleLoadingFallback,
  onBackToProject,
}) => (
  <>
    <div className={cn('flex-1 flex flex-col min-h-0 overflow-hidden', moduleAssistantOpen && 'mr-0')}>
      <ErrorBoundary>
        <Suspense fallback={<ModuleLoadingFallback />}>
          <FDA510kWorkspacePage embedded={true} projectId={projectId} projectName={projectName} onBackToProject={onBackToProject} />
        </Suspense>
      </ErrorBoundary>
    </div>
    <EmbeddedAssistantRail
      open={moduleAssistantOpen}
      onOpen={() => setModuleAssistantOpen(true)}
      onClose={() => setModuleAssistantOpen(false)}
      projectId={activeProjectId || projectId}
      projectName={projectName}
      submissionType="510K"
      activeThreadId={activeThreadId}
      onNavigate={onNavigate}
      onNewProject={onNewProject}
      onThreadChange={onThreadChange}
      greeting="How can I help with your 510(k) submission?"
      toggleTestId="module-assistant-toggle"
      panelTestId="module-assistant-panel"
    />
  </>
);

interface EmbeddedPMAHostProps extends BaseEmbeddedHostProps {
  EmbeddedPMAWorkspace: React.ComponentType<EmbeddedModulePageProps>;
  ModuleLoadingFallback: React.ComponentType;
  onBackToProject: () => void;
}

export const EmbeddedPMAHost: React.FC<EmbeddedPMAHostProps> = props => (
  <>
    <div className={cn('flex-1 flex flex-col min-h-0 overflow-hidden', props.moduleAssistantOpen && 'mr-0')}>
      <ErrorBoundary>
        <Suspense fallback={<props.ModuleLoadingFallback />}>
          <props.EmbeddedPMAWorkspace
            embedded={true}
            projectId={props.projectId}
            projectName={props.projectName}
            onBackToProject={props.onBackToProject}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
    <EmbeddedAssistantRail
      open={props.moduleAssistantOpen}
      onOpen={() => props.setModuleAssistantOpen(true)}
      onClose={() => props.setModuleAssistantOpen(false)}
      projectId={props.activeProjectId || props.projectId}
      projectName={props.projectName}
      submissionType="PMA"
      activeThreadId={props.activeThreadId}
      onNavigate={props.onNavigate}
      onNewProject={props.onNewProject}
      onThreadChange={props.onThreadChange}
      greeting="How can I help with your PMA submission?"
    />
  </>
);

interface EmbeddedCERHostProps extends BaseEmbeddedHostProps {
  EmbeddedCERV2Page: React.ComponentType<EmbeddedModulePageProps>;
  ModuleLoadingFallback: React.ComponentType;
  onBackToProject: () => void;
}

export const EmbeddedCERHost: React.FC<EmbeddedCERHostProps> = props => (
  <>
    <div className={cn('flex-1 flex flex-col min-h-0 overflow-hidden', props.moduleAssistantOpen && 'mr-0')}>
      <ErrorBoundary>
        <Suspense fallback={<props.ModuleLoadingFallback />}>
          <props.EmbeddedCERV2Page
            embedded={true}
            initialDocumentType="cerv2_cer"
            projectId={props.projectId}
            onBackToProject={props.onBackToProject}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
    <EmbeddedAssistantRail
      open={props.moduleAssistantOpen}
      onOpen={() => props.setModuleAssistantOpen(true)}
      onClose={() => props.setModuleAssistantOpen(false)}
      projectId={props.activeProjectId || props.projectId}
      projectName={props.projectName}
      submissionType="CER"
      activeThreadId={props.activeThreadId}
      onNavigate={props.onNavigate}
      onNewProject={props.onNewProject}
      onThreadChange={props.onThreadChange}
      greeting="How can I help with your Clinical Evaluation Report?"
      toggleTestId="module-assistant-toggle-cer"
      panelTestId="module-assistant-panel-cer"
    />
  </>
);

interface EmbeddedAssistantRailProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
  submissionType: string;
  activeThreadId?: string;
  onNavigate: (path: string) => void;
  onNewProject: () => void;
  onThreadChange: (threadId?: string) => void;
  greeting: string;
  toggleTestId?: string;
  panelTestId?: string;
}

const EmbeddedAssistantRail: React.FC<EmbeddedAssistantRailProps> = ({
  open,
  onOpen,
  onClose,
  projectId,
  projectName,
  submissionType,
  activeThreadId,
  onNavigate,
  onNewProject,
  onThreadChange,
  greeting,
  toggleTestId,
  panelTestId,
}) => {
  const suggestedActions = useMemo(
    () => DEVICE_SUGGESTED_ACTIONS[submissionType] || [],
    [submissionType]
  );
  if (!open) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpen}
        className="flex-shrink-0 w-10 h-full rounded-none flex flex-col items-center justify-center gap-1 bg-stone-50 hover:bg-stone-100 border-l border-stone-200 transition-colors"
        aria-label="Open AI Assistant"
        aria-expanded={false}
        aria-controls={panelTestId}
        data-testid={toggleTestId}
      >
        <MessageSquare className="w-4 h-4 text-stone-500" />
        <span className="text-[10px] text-stone-400 writing-mode-vertical" style={{ writingMode: 'vertical-rl' }}>
          Assistant
        </span>
      </Button>
    );
  }

  return (
    <div className="flex-shrink-0 w-[380px] flex flex-col border-l border-stone-200 bg-white" role="complementary" aria-label="AI Assistant" data-testid={panelTestId}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100 bg-stone-50">
        <span className="text-sm font-medium text-stone-700">AI Assistant</span>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7" aria-label="Close AI Assistant">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ZenChat
          projectId={projectId}
          projectName={projectName}
          submissionType={submissionType}
          threadId={activeThreadId}
          greeting={{ text: greeting }}
          suggestedActions={suggestedActions}
          onNavigate={onNavigate}
          onNewProject={onNewProject}
          onThreadChange={onThreadChange}
        />
      </div>
    </div>
  );
};
