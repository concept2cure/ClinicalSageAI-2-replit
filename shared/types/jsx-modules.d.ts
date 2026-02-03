/**
 * Type declarations for JSX modules without explicit TypeScript definitions
 * This file provides ambient module declarations to satisfy TypeScript's type checker
 * while allowing JSX components to be imported from .jsx files
 */

// ============================================================================
// Core Application Modules
// ============================================================================
declare module '*.jsx' {
  import { ComponentType } from 'react';
  const component: ComponentType<any>;
  export default component;
  export const App: ComponentType<any>;
}

declare module '@/App' {
  import { ComponentType } from 'react';
  const App: ComponentType<any>;
  export default App;
}

declare module '../App' {
  import { ComponentType } from 'react';
  const App: ComponentType<any>;
  export default App;
}

declare module './App' {
  import { ComponentType } from 'react';
  const App: ComponentType<any>;
  export default App;
}

declare module '@/ErrorBoundary' {
  import { ComponentType, ReactNode } from 'react';
  interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
  }
  const ErrorBoundary: ComponentType<ErrorBoundaryProps>;
  export default ErrorBoundary;
}

declare module './ErrorBoundary' {
  import { ComponentType, ReactNode } from 'react';
  interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
  }
  const ErrorBoundary: ComponentType<ErrorBoundaryProps>;
  export default ErrorBoundary;
}

// ============================================================================
// Context Modules
// ============================================================================
declare module '@/contexts/FileContext' {
  import { ComponentType, ReactNode, Context } from 'react';
  export interface FileContextValue {
    files: any[];
    uploadFile: (file: File) => Promise<void>;
    deleteFile: (id: string) => Promise<void>;
    refreshFiles: () => Promise<void>;
  }
  export const FileContext: Context<FileContextValue>;
  export const FileProvider: ComponentType<{ children: ReactNode }>;
  export const useFileContext: () => FileContextValue;
}

declare module './contexts/FileContext' {
  export * from '@/contexts/FileContext';
}

declare module '../contexts/FileContext' {
  export * from '@/contexts/FileContext';
}

// ============================================================================
// Component Modules - 510k
// ============================================================================
declare module '@/components/510k/SubmissionTimeline' {
  import { ComponentType } from 'react';
  const SubmissionTimeline: ComponentType<any>;
  export default SubmissionTimeline;
}

declare module '../components/510k/SubmissionTimeline' {
  import { ComponentType } from 'react';
  const SubmissionTimeline: ComponentType<any>;
  export default SubmissionTimeline;
}

declare module '@/components/510k/WorkflowPanel' {
  import { ComponentType } from 'react';
  const WorkflowPanel: ComponentType<any>;
  export default WorkflowPanel;
}

declare module '../components/510k/WorkflowPanel' {
  import { ComponentType } from 'react';
  const WorkflowPanel: ComponentType<any>;
  export default WorkflowPanel;
}

// ============================================================================
// Component Modules - CMC
// ============================================================================
declare module '@/components/cmc/SmartWorkflowsInterface' {
  import { ComponentType } from 'react';
  const SmartWorkflowsInterface: ComponentType<any>;
  export default SmartWorkflowsInterface;
}

declare module '../components/cmc/SmartWorkflowsInterface' {
  import { ComponentType } from 'react';
  const SmartWorkflowsInterface: ComponentType<any>;
  export default SmartWorkflowsInterface;
}

// ============================================================================
// Component Modules - CoAuthor
// ============================================================================
declare module '@/components/coauthor/WorkflowTimeline' {
  import { ComponentType } from 'react';
  const WorkflowTimeline: ComponentType<any>;
  export default WorkflowTimeline;
}

declare module '../components/coauthor/WorkflowTimeline' {
  import { ComponentType } from 'react';
  const WorkflowTimeline: ComponentType<any>;
  export default WorkflowTimeline;
}

// ============================================================================
// Component Modules - General
// ============================================================================
declare module '@/components/VaultMetadataPanel' {
  import { ComponentType } from 'react';
  const VaultMetadataPanel: ComponentType<any>;
  export default VaultMetadataPanel;
}

declare module './VaultMetadataPanel' {
  import { ComponentType } from 'react';
  const VaultMetadataPanel: ComponentType<any>;
  export default VaultMetadataPanel;
}

declare module '@/components/BenchmarksModal' {
  import { ComponentType } from 'react';
  const BenchmarksModal: ComponentType<any>;
  export default BenchmarksModal;
}

declare module './BenchmarksModal' {
  import { ComponentType } from 'react';
  const BenchmarksModal: ComponentType<any>;
  export default BenchmarksModal;
}

declare module '@/components/InsightsModal' {
  import { ComponentType } from 'react';
  const InsightsModal: ComponentType<any>;
  export default InsightsModal;
}

declare module './InsightsModal' {
  import { ComponentType } from 'react';
  const InsightsModal: ComponentType<any>;
  export default InsightsModal;
}

declare module '@/components/StudyDesignAssistant' {
  import { ComponentType } from 'react';
  const StudyDesignAssistant: ComponentType<any>;
  export default StudyDesignAssistant;
}

declare module './StudyDesignAssistant' {
  import { ComponentType } from 'react';
  const StudyDesignAssistant: ComponentType<any>;
  export default StudyDesignAssistant;
}

declare module '@/components/ConversationalAssistant' {
  import { ComponentType } from 'react';
  const ConversationalAssistant: ComponentType<any>;
  export default ConversationalAssistant;
}

declare module './ConversationalAssistant' {
  import { ComponentType } from 'react';
  const ConversationalAssistant: ComponentType<any>;
  export default ConversationalAssistant;
}

declare module '../components/ConversationalAssistant' {
  import { ComponentType } from 'react';
  const ConversationalAssistant: ComponentType<any>;
  export default ConversationalAssistant;
}

declare module '@/components/KnowledgeBasePanel' {
  import { ComponentType } from 'react';
  const KnowledgeBasePanel: ComponentType<any>;
  export default KnowledgeBasePanel;
}

declare module './KnowledgeBasePanel' {
  import { ComponentType } from 'react';
  const KnowledgeBasePanel: ComponentType<any>;
  export default KnowledgeBasePanel;
}

declare module '@/components/ChatPanel' {
  import { ComponentType } from 'react';
  const ChatPanel: ComponentType<any>;
  export default ChatPanel;
}

declare module './ChatPanel' {
  import { ComponentType } from 'react';
  const ChatPanel: ComponentType<any>;
  export default ChatPanel;
}

declare module '../components/ChatPanel' {
  import { ComponentType } from 'react';
  const ChatPanel: ComponentType<any>;
  export default ChatPanel;
}

declare module '@/components/TopNavigation' {
  import { ComponentType } from 'react';
  const TopNavigation: ComponentType<any>;
  export default TopNavigation;
}

declare module './TopNavigation' {
  import { ComponentType } from 'react';
  const TopNavigation: ComponentType<any>;
  export default TopNavigation;
}

declare module '../components/TopNavigation' {
  import { ComponentType } from 'react';
  const TopNavigation: ComponentType<any>;
  export default TopNavigation;
}

// ============================================================================
// Component Modules - ForesightAI
// ============================================================================
declare module '@/components/ForesightAI/PhaseJourneyNavigator' {
  import { ComponentType } from 'react';
  const PhaseJourneyNavigator: ComponentType<any>;
  export default PhaseJourneyNavigator;
}

// ============================================================================
// Component Modules - Protocol
// ============================================================================
declare module '@/components/ProtocolImprovementPanel' {
  import { ComponentType } from 'react';
  const ProtocolImprovementPanel: ComponentType<any>;
  export default ProtocolImprovementPanel;
}

declare module '@/components/EnhancedProtocolIntelligencePanel' {
  import { ComponentType } from 'react';
  const EnhancedProtocolIntelligencePanel: ComponentType<any>;
  export default EnhancedProtocolIntelligencePanel;
}

declare module '@/components/AcademicInsightsPanel' {
  import { ComponentType } from 'react';
  const AcademicInsightsPanel: ComponentType<any>;
  export default AcademicInsightsPanel;
}

declare module '@/components/FormattedProtocolRecommendations' {
  import { ComponentType } from 'react';
  const FormattedProtocolRecommendations: ComponentType<any>;
  export default FormattedProtocolRecommendations;
}
