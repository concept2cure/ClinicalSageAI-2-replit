import React, { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from 'react-resizable-panels';
import { Save, Settings, Eye, Share2, Clock, MapPin } from 'lucide-react';
import DossierTree from './DossierTree';
import EditorCanvas from './EditorCanvas';
import GuidancePanel from './RightRail/GuidancePanel';
import DataPanel from './RightRail/DataPanel';
import CitationsPanel from './RightRail/CitationsPanel';
import HistoryPanel from './RightRail/HistoryPanel';
import CompareVersionsModal from './Modals/CompareVersionsModal';
import SignApproveModal from './Modals/SignApproveModal';
import InsertStructuredBlockModal from './Modals/InsertStructuredBlockModal';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  const [match, params] = useRoute('/authoring/documents/:docId/editor');
  const { docId } = params || {};
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('guidance');
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showStructuredModal, setShowStructuredModal] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<'FDA' | 'EMA' | 'PMDA' | 'WHO'>('FDA');
  const { toast } = useToast();

  useEffect(() => {
    const loadDocument = async () => {
      if (!docId) return;

      try {
        setLoading(true);
        // In production, this would be a real API call
        const mockDoc: Document = {
          id: docId,
          title: 'Module 3.2.P - Drug Product',
          productName: 'C2C-01',
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
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background" data-testid="editor-page">
      {/* Header */}
      <header className="border-b bg-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-lg font-semibold" data-testid="document-title">
              {document.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {document.productName} • Version {document.version} • {document.status}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRegionChange(selectedRegion === 'FDA' ? 'EMA' : 'FDA')}
              data-testid="region-toggle"
            >
              <MapPin className="h-4 w-4 mr-1" />
              {selectedRegion}
            </Button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCompareModal(true)}
            data-testid="button-compare"
          >
            <Eye className="h-4 w-4 mr-1" />
            Compare
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowStructuredModal(true)}
            data-testid="button-insert-block"
          >
            <Settings className="h-4 w-4 mr-1" />
            Insert Block
          </Button>

          <Button onClick={handleSave} size="sm" data-testid="button-save">
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSignModal(true)}
            data-testid="button-sign"
          >
            Sign & Approve
          </Button>
        </div>
      </header>

      {/* Main Editor Layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left Rail - Dossier Tree */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <div className="h-full border-r bg-muted/30">
            <DossierTree documentId={docId} region={selectedRegion} data-testid="dossier-tree" />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Center - Editor Canvas */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <div className="h-full">
            <EditorCanvas
              content={editorContent}
              onChange={setEditorContent}
              region={selectedRegion}
              documentId={docId}
              productName={document.productName}
              data-testid="editor-canvas"
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Rail - Context Panels */}
        <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
          <div className="h-full border-l bg-muted/30">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <div className="px-4 py-2 border-b">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="guidance" data-testid="tab-guidance">
                    Guide
                  </TabsTrigger>
                  <TabsTrigger value="data" data-testid="tab-data">
                    Data
                  </TabsTrigger>
                  <TabsTrigger value="citations" data-testid="tab-citations">
                    Refs
                  </TabsTrigger>
                  <TabsTrigger value="history" data-testid="tab-history">
                    History
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="guidance" className="h-full m-0">
                  <GuidancePanel
                    region={selectedRegion}
                    section="3.2.P"
                    data-testid="guidance-panel"
                  />
                </TabsContent>

                <TabsContent value="data" className="h-full m-0">
                  <DataPanel
                    documentId={docId}
                    productName={document.productName}
                    data-testid="data-panel"
                  />
                </TabsContent>

                <TabsContent value="citations" className="h-full m-0">
                  <CitationsPanel documentId={docId} data-testid="citations-panel" />
                </TabsContent>

                <TabsContent value="history" className="h-full m-0">
                  <HistoryPanel documentId={docId} data-testid="history-panel" />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Modals */}
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
          // Handle structured block insertion
          toast({
            title: 'Block inserted',
            description: `${blockType} block added to document.`,
          });
          setShowStructuredModal(false);
        }}
      />
    </div>
  );
}
