import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  Save,
  MapPin,
  Sidebar as SidebarIcon,
  Maximize2,
  Sparkles,
  PanelRightOpen,
  RefreshCw,
  Eye,
  LayoutGrid,
  FilePlus2,
  BadgeCheck,
} from 'lucide-react';
import Breadcrumbs from '@/components/navigation/Breadcrumbs';
import DocumentTemplates from '@/pages/DocumentTemplates';
import DocumentStructure from './DocumentStructure';
import EditorCanvas from './EditorCanvas';
import StudyDataPanel, { DEMO_DATASET_ID, DEMO_DATASET_LABEL } from './RightRail/StudyDataPanel';
import AIAssistantPanel from './RightRail/AIAssistantPanel';
import CompareVersionsModal from './Modals/CompareVersionsModal';
import SignApproveModal from './Modals/SignApproveModal';
import InsertStructuredBlockModal from './Modals/InsertStructuredBlockModal';
import ImpactAnalysisModal from './Modals/ImpactAnalysisModal';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ValidationDashboard from './RightRail/ValidationDashboard';
import type { Editor } from '@tiptap/react';
import { updateTableData } from '@/components/editor/commands/updateTableData';
import { DEMO_DATASET_ID, DEMO_DATASET_LABEL } from './RightRail/StudyDataPanel';
import { DependencyProvider, useDependencyContext } from '@/context/DependencyContext';
import { DATASET_FOCUS_EVENT } from '@/utils/events/RightRailEvents';

type EditorWindow = Window & {
  __indEditor?: Editor;
};

const UPDATED_DEMOGRAPHICS = [
  { Subject: 'SUBJ-001', Age: 55, Sex: 'F', Group: 'Treatment A' },
  { Subject: 'SUBJ-002', Age: 61, Sex: 'M', Group: 'Treatment A' },
  { Subject: 'SUBJ-003', Age: 60, Sex: 'F', Group: 'Placebo' },
  { Subject: 'SUBJ-004', Age: 64, Sex: 'M', Group: 'Placebo' },
  { Subject: 'SUBJ-005', Age: 59, Sex: 'F', Group: 'Treatment B' },
];

interface Document {
  id: string;
  title: string;
  productName: string;
  region: 'FDA' | 'EMA' | 'PMDA' | 'WHO';
  locale: string;
  status: 'draft' | 'review' | 'approved';
  lastModified: string;
  version: string;
}

export default function EditorPage() {
  return (
    <DependencyProvider>
      <EditorPageContent />
    </DependencyProvider>
  );
}

interface ImpactState {
  open: boolean;
  datasetId: string | null;
  datasetName: string;
  impact: {
    tables: number;
    chips: number;
  };
}

function EditorPageContent() {
  const [, params] = useRoute('/authoring/documents/:docId/editor');
  const { docId } = params || {};
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ai' | 'data' | 'check'>(() => {
    const saved = localStorage.getItem('editor-active-tab');
    return (saved as 'ai' | 'data' | 'check') || 'ai';
  });
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showStructuredModal, setShowStructuredModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<'FDA' | 'EMA' | 'PMDA' | 'WHO'>('FDA');
  const [leftOpen, setLeftOpen] = useState(() => {
    const saved = localStorage.getItem('editor-left-rail');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [rightOpen, setRightOpen] = useState(() => {
    const saved = localStorage.getItem('editor-right-rail');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isLinkedTable, setIsLinkedTable] = useState(false);
  const [linkedSourceLabel, setLinkedSourceLabel] = useState<string | null>(null);
  const [linkedDatasetId, setLinkedDatasetId] = useState<string | null>(null);
  const [linkedLastUpdated, setLinkedLastUpdated] = useState<string | null>(null);
  const { toast } = useToast();
  const dependency = useDependencyContext();
  const [impactState, setImpactState] = useState<ImpactState>({
    open: false,
    datasetId: null,
    datasetName: '',
    impact: { tables: 0, chips: 0 },
  });

  const toggleZenMode = () => {
    if (!leftOpen && !rightOpen) {
      setLeftOpen(true);
      setRightOpen(true);
    } else {
      setLeftOpen(false);
      setRightOpen(false);
    }
  };

  const focusEditor = useCallback(() => {
    const editor = (window as EditorWindow).__indEditor;
    editor?.commands.focus('end');
  }, []);

  useEffect(() => {
    localStorage.setItem('editor-left-rail', JSON.stringify(leftOpen));
  }, [leftOpen]);

  useEffect(() => {
    localStorage.setItem('editor-right-rail', JSON.stringify(rightOpen));
  }, [rightOpen]);

  useEffect(() => {
    localStorage.setItem('editor-active-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        toggleZenMode();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
        event.preventDefault();
        setLeftOpen(prev => !prev);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault();
        setRightOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [toggleZenMode]);

  const zenActive = !leftOpen && !rightOpen;

  const breadcrumbItems = useMemo(
    () => [
      { label: 'Workspace', to: '/authoring' },
      { label: document?.productName ?? 'Regulatory Program' },
      { label: document?.title ?? 'Draft Document' },
    ],
    [document?.productName, document?.title],
  );

  const documentTitle = document?.title ?? 'Module 3.2.P';
  const statusLabel = (document?.status ?? 'draft').toUpperCase();

  const pendingDatasetId = impactState.datasetId;
  const pendingDatasetName = impactState.datasetName;
  const pendingImpact = impactState.impact;

  const handleDatasetRefreshRequest = useCallback(
    (datasetId: string, datasetName: string) => {
      if (!datasetId) {
        return;
      }

      setRightOpen(true);
      setActiveTab('data');

      const impact = dependency.getImpactReport(datasetId);
      setImpactState({
        open: true,
        datasetId,
        datasetName,
        impact,
      });
    },
    [dependency],
  );

  const handleImpactCancel = useCallback(() => {
    setImpactState(prev => ({ ...prev, open: false }));
  }, []);

  const handleImpactConfirm = useCallback(() => {
    if (!pendingDatasetId) {
      return;
    }

    const editor = (window as EditorWindow).__indEditor ?? null;
    let updateSuccess = true;

    if (pendingDatasetId === DEMO_DATASET_ID) {
      updateSuccess = updateTableData(
        editor,
        DEMO_DATASET_ID,
        UPDATED_DEMOGRAPHICS,
        linkedSourceLabel ?? DEMO_DATASET_LABEL,
      );
    }

    dependency.markDatasetUpdate(pendingDatasetId);

    toast({
      title: updateSuccess ? 'Dataset refreshed' : 'Refresh failed',
      description: updateSuccess
        ? `${pendingDatasetName || pendingDatasetId} update flagged ${pendingImpact.chips} data points for review.`
        : 'Unable to refresh dataset. Please try again.',
      variant: updateSuccess ? 'default' : 'destructive',
    });

    setImpactState({
      open: false,
      datasetId: null,
      datasetName: '',
      impact: { tables: 0, chips: 0 },
    });
  }, [dependency, linkedSourceLabel, pendingDatasetId, pendingDatasetName, pendingImpact, toast]);

  useEffect(() => {
    const loadDocument = async () => {
      if (!docId) return;

      try {
        setLoading(true);
        // In production, this would be a real API call
        const mockDoc: Document = {
          id: docId,
          title: 'Module 3.2.P - Drug Product',
          productName: 'TrialSage-01',
          region: 'FDA',
          locale: 'en-US',
          status: 'draft',
          lastModified: new Date().toISOString(),
          version: '1.2.3',
        };

        setDocument(mockDoc);
        setSelectedRegion(mockDoc.region);
      } catch (error) {
        toast({
          title: 'Error loading document',
          description: 'Failed to load document. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [docId, toast]);

  useEffect(() => {
    const handleDatasetFocus = () => {
      setRightOpen(true);
      setActiveTab('data');
    };

    const listener = (_event: Event) => {
      handleDatasetFocus();
    };

    window.addEventListener(DATASET_FOCUS_EVENT, listener);

    return () => {
      window.removeEventListener(DATASET_FOCUS_EVENT, listener);
    };
  }, []);

  useEffect(() => {
    const handleSmartTableContext = (event: Event) => {
      const customEvent = event as CustomEvent<{
        isLinked: boolean;
        attributes?: { sourceLabel?: string; sourceId?: string; lastUpdated?: string };
      }>;

      const detail = customEvent.detail;
      if (!detail) {
        setIsLinkedTable(false);
        setLinkedSourceLabel(null);
        setLinkedDatasetId(null);
        setLinkedLastUpdated(null);
        return;
      }

      const { isLinked, attributes } = detail;
      setIsLinkedTable(Boolean(isLinked && attributes?.sourceId));
      if (isLinked && attributes) {
        setLinkedSourceLabel(attributes.sourceLabel ?? attributes.sourceId ?? null);
        setLinkedDatasetId(attributes.sourceId ?? null);
        setLinkedLastUpdated(attributes.lastUpdated ?? null);
      } else {
        setLinkedSourceLabel(null);
        setLinkedDatasetId(null);
        setLinkedLastUpdated(null);
      }
    };

    window.addEventListener('smart-table-context', handleSmartTableContext as EventListener);

    return () => {
      window.removeEventListener('smart-table-context', handleSmartTableContext as EventListener);
    };
  }, []);

  const handleRefreshTable = () => {
    if (!linkedDatasetId) {
      toast({
        title: 'No linked table selected',
        description: 'Place your cursor inside a live table to refresh it.',
        variant: 'destructive',
      });
      return;
    }

    setRightOpen(true);
    setActiveTab('data');
    handleDatasetRefreshRequest(linkedDatasetId, linkedSourceLabel ?? linkedDatasetId);
  };

  const handleSave = async () => {
    try {
      // API call to save document
      await fetch(`/api/documents/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editorContent }),
      });

      toast({
        title: 'Document saved',
        description: 'Your changes have been saved successfully.',
      });
    } catch (error) {
      toast({
        title: 'Save failed',
        description: 'Failed to save document. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRegionChange = (region: 'FDA' | 'EMA' | 'PMDA' | 'WHO') => {
    setSelectedRegion(region);
    // Trigger re-validation and terminology updates
    toast({
      title: 'Region updated',
      description: `Switched to ${region} regulatory requirements.`,
    });
  };

  if (loading || !document) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F5F5F7]">
        <div className="text-center text-gray-500">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400" />
          <p className="text-xs uppercase tracking-[0.3em]">Preparing your document studio…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="flex h-screen w-full bg-[#F5F5F7] overflow-hidden font-sans text-gray-900"
        data-testid="editor-page"
      >
        <aside
          className={`flex-shrink-0 bg-[#FAFAFA] border-r border-gray-200 z-30 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            leftOpen ? 'w-[280px] opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-4 overflow-hidden'
          }`}
        >
          <div className="h-full overflow-y-auto">
            <DocumentStructure documentId={docId} region={selectedRegion} />
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col bg-[#F5F5F7]">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200 bg-white/80 px-4 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setLeftOpen(prev => !prev)}
                className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100"
                aria-label="Toggle navigation"
              >
                <SidebarIcon size={18} />
              </button>
              <Breadcrumbs items={breadcrumbItems} />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs font-medium"
                onClick={() => handleRegionChange(selectedRegion === 'FDA' ? 'EMA' : 'FDA')}
                data-testid="region-toggle"
              >
                <MapPin className="mr-1 h-3.5 w-3.5" />
                {selectedRegion}
              </Button>
            </div>

            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2">
              <span className="text-sm font-semibold text-gray-700" data-testid="document-title">
                {documentTitle}
              </span>
              <span className="rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                {statusLabel}
              </span>
            </div>

            <TooltipProvider delayDuration={100}>
              <div className="flex items-center gap-2">
                {isLinkedTable ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleRefreshTable}
                        className="flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-100"
                      >
                        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                        <span className="max-w-[120px] truncate">
                          {linkedSourceLabel ?? 'Live dataset'}
                        </span>
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Refresh linked dataset
                        {linkedLastUpdated ? ` • Last sync ${linkedLastUpdated}` : ''}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ) : null}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={toggleZenMode}
                      className={`rounded-md p-2 transition-all duration-300 ${
                        zenActive
                          ? 'bg-gray-900 text-white shadow-lg scale-110'
                          : 'text-gray-500 hover:bg-gray-100 hover:scale-105'
                      }`}
                      data-testid="button-focus-mode"
                      aria-pressed={zenActive}
                    >
                      <Maximize2 size={18} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Focus mode <kbd className="ml-1 text-[10px] opacity-60">⌘K</kbd>
                  </TooltipContent>
                </Tooltip>

                <div className="mx-1 h-4 w-px bg-gray-300" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setRightOpen(true);
                        setActiveTab('ai');
                      }}
                      className={`rounded-md p-2 transition-colors ${
                        activeTab === 'ai' && rightOpen
                          ? 'bg-purple-50 text-purple-600'
                          : 'text-gray-500 hover:bg-gray-100'
                      }`}
                      aria-pressed={activeTab === 'ai' && rightOpen}
                    >
                      <Sparkles size={18} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Open AI Copilot</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setRightOpen(prev => !prev)}
                      className={`rounded-md p-2 transition-colors ${
                        rightOpen
                          ? 'text-gray-700 hover:bg-gray-100'
                          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                      }`}
                      aria-pressed={rightOpen}
                    >
                      <PanelRightOpen size={18} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{rightOpen ? 'Hide side rail' : 'Show side rail'}</TooltipContent>
                </Tooltip>

                <div className="mx-1 h-4 w-px bg-gray-300" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowCompareModal(true)}
                      className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100"
                      data-testid="button-compare"
                    >
                      <Eye size={18} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Compare versions</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowTemplateModal(true)}
                      className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100"
                    >
                      <LayoutGrid size={18} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Open templates</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowStructuredModal(true)}
                      className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100"
                      data-testid="button-insert-block"
                    >
                      <FilePlus2 size={18} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Insert structured block</TooltipContent>
                </Tooltip>

                <Button
                  onClick={handleSave}
                  size="sm"
                  className="h-8 px-3 text-xs font-semibold tracking-wide"
                  data-testid="button-save"
                >
                  <Save className="mr-1 h-3.5 w-3.5" />
                  Save
                </Button>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowSignModal(true)}
                      className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100"
                      data-testid="button-sign"
                    >
                      <BadgeCheck size={18} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Sign &amp; approve</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </header>

          <div
            className="relative flex flex-1 cursor-text justify-center overflow-y-auto p-0"
            onClick={focusEditor}
          >
            <div className={`mx-auto my-12 w-full max-w-[816px] min-h-[1100px] border border-gray-200 bg-white px-[96px] py-[96px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all duration-700 ease-out ${
              zenActive ? 'scale-[1.02] shadow-[0_8px_30px_-6px_rgba(0,0,0,0.12)]' : 'scale-100'
            }`}>
              <EditorCanvas
                content={editorContent}
                onChange={setEditorContent}
                region={selectedRegion}
                documentId={docId}
                productName={document.productName}
                data-testid="editor-canvas"
              />
            </div>
          </div>
        </main>

        <aside
          className={`flex-shrink-0 border-l border-gray-200 bg-white z-30 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            rightOpen ? 'w-[320px] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-4 overflow-hidden'
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex gap-1 border-b border-gray-100 px-2 pt-2">
              {(['ai', 'data', 'check'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setRightOpen(true);
                  }}
                  className={`flex-1 border-b-2 pb-2 text-xs font-medium uppercase tracking-wider transition-all ${
                    activeTab === tab && rightOpen
                      ? 'border-purple-500 text-purple-600'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {tab === 'ai' && 'AI Copilot'}
                  {tab === 'data' && 'Study Data'}
                  {tab === 'check' && 'Verify'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-50/30">
              {activeTab === 'ai' && (
                <AIAssistantPanel
                  documentId={document.id}
                  productName={document.productName}
                  region={selectedRegion}
                  section="3.2.P Conclusion"
                />
              )}
              {activeTab === 'data' && (
                <StudyDataPanel
                  documentId={docId}
                  productName={document.productName}
                  onDatasetRefresh={handleDatasetRefreshRequest}
                />
              )}
              {activeTab === 'check' && <ValidationDashboard documentId={docId} />}
            </div>
          </div>
        </aside>
      </div>

      <CompareVersionsModal
        open={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        documentId={docId}
      />

      <SignApproveModal
        open={showSignModal}
        onClose={() => setShowSignModal(false)}
        document={document}
      />

      <InsertStructuredBlockModal
        open={showStructuredModal}
        onClose={() => setShowStructuredModal(false)}
        onInsert={(blockType: string) => {
          toast({
            title: 'Block inserted',
            description: `${blockType} block added to document.`,
          });
          setShowStructuredModal(false);
        }}
      />

      <ImpactAnalysisModal
        open={impactState.open}
        datasetName={pendingDatasetName || 'Dataset'}
        impact={pendingImpact}
        onCancel={handleImpactCancel}
        onConfirm={handleImpactConfirm}
      />

      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document Templates</DialogTitle>
          </DialogHeader>
          <DocumentTemplates />
        </DialogContent>
      </Dialog>
    </>
  );
}
