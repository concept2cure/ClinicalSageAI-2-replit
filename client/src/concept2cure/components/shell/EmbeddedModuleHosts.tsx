import React, { Suspense } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ZenChat } from '../chat/ZenChat';
import { ErrorBoundary } from '../ErrorBoundary';

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
  EmbeddedCERV2Page: React.ComponentType<any>;
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
  EmbeddedCERV2Page,
  ModuleLoadingFallback,
  onBackToProject,
}) => (
  <>
    <div className={cn('flex-1 flex flex-col min-h-0 overflow-hidden', moduleAssistantOpen && 'mr-0')}>
      <ErrorBoundary>
        <Suspense fallback={<ModuleLoadingFallback />}>
          <EmbeddedCERV2Page embedded={true} projectId={projectId} onBackToProject={onBackToProject} />
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
  EmbeddedPMAWorkspace: React.ComponentType<any>;
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
  EmbeddedCERV2Page: React.ComponentType<any>;
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
  if (!open) {
    return (
      <button
        onClick={onOpen}
        className="flex-shrink-0 w-10 flex flex-col items-center justify-center gap-1 bg-stone-50 hover:bg-stone-100 border-l border-stone-200 transition-colors"
        title="Open AI Assistant"
        data-testid={toggleTestId}
      >
        <MessageSquare className="w-4 h-4 text-stone-500" />
        <span className="text-[10px] text-stone-400 writing-mode-vertical" style={{ writingMode: 'vertical-rl' }}>
          Assistant
        </span>
      </button>
    );
  }

  return (
    <div className="flex-shrink-0 w-[380px] flex flex-col border-l border-stone-200 bg-white" data-testid={panelTestId}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100 bg-stone-50">
        <span className="text-sm font-medium text-stone-700">AI Assistant</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-stone-200 text-stone-400 hover:text-stone-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ZenChat
          projectId={projectId}
          projectName={projectName}
          submissionType={submissionType}
          threadId={activeThreadId}
          greeting={{ text: greeting }}
          onNavigate={onNavigate}
          onNewProject={onNewProject}
          onThreadChange={onThreadChange}
        />
      </div>
    </div>
  );
};
