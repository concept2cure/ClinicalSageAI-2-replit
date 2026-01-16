/**
 * eCTD Data Center Integration Component
 * Provides eCTD-specific document management plus an embedded Data Browser.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Copy, Database, FileText, GitBranch, GitCommit, History, Package, RefreshCw, Search } from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { DataRoomPanel } from '@/components/authoring/DataRoomPanel';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

const ECTD_MODULES = {
  module1: {
    name: 'Module 1: Administrative Information',
    sections: ['1.0 Cover Letter', '1.1 Application Form', '1.2 Administrative Information'],
  },
  module2: {
    name: 'Module 2: CTD Summaries',
    sections: [
      '2.1 Introduction',
      '2.2 CTD Table of Contents',
      '2.3 Quality Overall Summary',
      '2.4 Nonclinical Overview',
      '2.5 Clinical Overview',
      '2.6 Nonclinical Written and Tabulated Summaries',
      '2.7 Clinical Summary',
    ],
  },
  module3: {
    name: 'Module 3: Quality',
    sections: ['3.1 Drug Substance', '3.2 Drug Product', '3.3 Appendices'],
  },
  module4: {
    name: 'Module 4: Nonclinical Study Reports',
    sections: ['4.1 Pharmacology', '4.2 Pharmacokinetics', '4.3 Toxicology'],
  },
  module5: {
    name: 'Module 5: Clinical Study Reports',
    sections: [
      '5.1 Tabular Listing of All Clinical Studies',
      '5.2 Clinical Study Reports',
      '5.3 Literature References',
      '5.4 Other Clinical Study Reports',
    ],
  },
};

const DOCUMENT_STATUS = {
  draft: { label: 'Draft', color: 'bg-gray-500' },
  review: { label: 'In Review', color: 'bg-yellow-500' },
  approved: { label: 'Approved', color: 'bg-blue-500' },
  finalized: { label: 'Finalized', color: 'bg-green-500' },
  locked: { label: 'Locked', color: 'bg-red-500' },
};

function toArrayDocuments(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.documents)) return data.documents;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

export default function ECTDDataCenterIntegration({ onDocumentSelect, projectId }) {
  const { toast } = useToast();

  const [activePane, setActivePane] = useState('documents');
  const [viewMode, setViewMode] = useState('modules');
  const [selectedModule, setSelectedModule] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [contentReuseMode, setContentReuseMode] = useState(false);
  const [assemblyMode, setAssemblyMode] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState([]);

  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showLineageView, setShowLineageView] = useState(false);

  const organizationId = localStorage.getItem('currentOrganizationId') || '7';

  const {
    data: documentsData,
    isLoading: documentsLoading,
    error: documentsError,
    refetch: refetchDocuments,
  } = useQuery({
    queryKey: ['/api/ectd-documents', { projectId, organizationId }],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (projectId) query.set('projectId', String(projectId));
      if (organizationId) query.set('organizationId', String(organizationId));
      return apiRequest(`/api/ectd-documents?${query.toString()}`);
    },
  });

  const documents = useMemo(() => toArrayDocuments(documentsData), [documentsData]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = (searchQuery || '').trim().toLowerCase();

    return documents.filter((doc) => {
      const matchesModule = selectedModule === 'all' || !selectedModule || doc.module === selectedModule;
      const matchesSearch =
        !normalizedQuery ||
        (doc.title || '').toLowerCase().includes(normalizedQuery) ||
        (doc.description || '').toLowerCase().includes(normalizedQuery) ||
        (doc.section || '').toLowerCase().includes(normalizedQuery);
      return matchesModule && matchesSearch;
    });
  }, [documents, searchQuery, selectedModule]);

  const groupedDocuments = useMemo(() => {
    return filteredDocuments.reduce((acc, doc) => {
      const moduleKey = doc.module || 'unassigned';
      const sectionKey = doc.section || 'general';
      acc[moduleKey] ||= {};
      acc[moduleKey][sectionKey] ||= [];
      acc[moduleKey][sectionKey].push(doc);
      return acc;
    }, {});
  }, [filteredDocuments]);

  const hasDocuments = documents.length > 0;
  const hasFilteredDocuments = filteredDocuments.length > 0;

  const versionsQuery = useQuery({
    queryKey: ['/api/ectd-documents/versions', selectedDocument?.id],
    enabled: !!selectedDocument?.id && showVersionHistory,
    queryFn: async () => apiRequest(`/api/ectd-documents/${selectedDocument.id}/versions`),
  });

  const lineageQuery = useQuery({
    queryKey: ['/api/ectd-documents/lineage', selectedDocument?.id],
    enabled: !!selectedDocument?.id && showLineageView,
    queryFn: async () => apiRequest(`/api/ectd-documents/${selectedDocument.id}/lineage`),
  });

  const createVersionMutation = useMutation({
    mutationFn: async ({ documentId, versionData }) =>
      apiRequest(`/api/ectd-documents/${documentId}/versions`, {
        method: 'POST',
        data: versionData,
      }),
    onSuccess: () => {
      toast({ title: 'Version Created', description: 'New document version created' });
      queryClient.invalidateQueries({ queryKey: ['/api/ectd-documents/versions'] });
    },
    onError: (e) => {
      toast({
        title: 'Version Create Failed',
        description: e?.message || 'Could not create version',
        variant: 'destructive',
      });
    },
  });

  const extractContentMutation = useMutation({
    mutationFn: async ({ documentId, sectionPath }) =>
      apiRequest(`/api/ectd-documents/${documentId}/extract`, {
        method: 'POST',
        data: { sectionPath },
      }),
    onSuccess: () => {
      toast({ title: 'Content Extracted', description: 'Content extracted and ready for reuse' });
    },
    onError: (e) => {
      toast({
        title: 'Extract Failed',
        description: e?.message || 'Could not extract content',
        variant: 'destructive',
      });
    },
  });

  const handleAssembleDocument = () => {
    if (selectedDocuments.length === 0) {
      toast({
        title: 'No Documents Selected',
        description: 'Select at least one document to assemble',
        variant: 'destructive',
      });
      return;
    }

    const params = new URLSearchParams({
      action: 'assemble',
      documents: selectedDocuments.map((d) => d.id).join(','),
    });

    window.location.href = `/ectd-coauthor?${params.toString()}`;
  };

  const handleCreateVersion = () => {
    if (!selectedDocument) return;
    const nextVersionNumber = Number(selectedDocument.version || 1) + 1;
    createVersionMutation.mutate({
      documentId: selectedDocument.id,
      versionData: {
        versionNumber: nextVersionNumber,
        changeDescription: 'New version created from Data Center',
        author: 'Current User',
      },
    });
  };

  const renderDocumentCard = (doc, section) => (
    <Card
      key={doc.id}
      className={`cursor-pointer hover:bg-accent transition-colors ${
        assemblyMode && selectedDocuments.some((d) => d.id === doc.id) ? 'ring-2 ring-primary' : ''
      }`}
      onClick={() => {
        if (assemblyMode) {
          setSelectedDocuments((prev) =>
            prev.some((d) => d.id === doc.id) ? prev.filter((d) => d.id !== doc.id) : [...prev, doc]
          );
          return;
        }

        if (contentReuseMode) {
          extractContentMutation.mutate({ documentId: doc.id, sectionPath: section || doc.section || '' });
          return;
        }

        setSelectedDocument(doc);
        onDocumentSelect?.(doc);
      }}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="font-medium truncate">{doc.title || 'Untitled'}</span>
              {Number(doc.version || 1) > 1 && (
                <Badge variant="outline" className="text-xs">
                  v{doc.version}
                </Badge>
              )}
            </div>
            {doc.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{doc.description}</p>}
            <div className="flex items-center gap-2 mt-2">
              <Badge className={DOCUMENT_STATUS[doc.status]?.color} variant="secondary">
                {DOCUMENT_STATUS[doc.status]?.label || doc.status || 'unknown'}
              </Badge>
              {doc.updatedAt && (
                <span className="text-xs text-muted-foreground">Modified: {new Date(doc.updatedAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>

          <div className="flex gap-1">
            {!!doc.hasLineage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDocument(doc);
                  setShowLineageView(true);
                  setViewMode('relationships');
                }}
                title="View lineage"
              >
                <GitBranch className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedDocument(doc);
                setShowVersionHistory(true);
              }}
              title="Version history"
            >
              <History className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Database className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">eCTD Data Center</h2>
            <p className="text-sm text-muted-foreground">Manage eCTD documents with version control and content reuse</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={contentReuseMode ? 'default' : 'outline'} size="sm" onClick={() => setContentReuseMode((v) => !v)}>
            <Copy className="h-4 w-4 mr-2" />
            Content Reuse
          </Button>
          <Button
            variant={assemblyMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setAssemblyMode((v) => !v);
              setSelectedDocuments([]);
            }}
          >
            <Package className="h-4 w-4 mr-2" />
            Assembly Mode
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetchDocuments()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search eCTD documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-ectd"
            />
          </div>
        </div>
        <Select value={selectedModule} onValueChange={setSelectedModule}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filter by module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {Object.entries(ECTD_MODULES).map(([key, module]) => (
              <SelectItem key={key} value={key}>
                {module.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activePane} onValueChange={setActivePane}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="data-browser">Data Browser</TabsTrigger>
        </TabsList>

        <TabsContent value="data-browser" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Clinical Data Browser
              </CardTitle>
              <CardDescription>
                Browse source tables/values and drag evidence into drafts. This is the same Data Browser used inside the editor right-rail.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[520px] border rounded-md overflow-hidden">
                <DataRoomPanel />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Tabs value={viewMode} onValueChange={setViewMode}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="modules">By Module</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="relationships">Relationships</TabsTrigger>
            </TabsList>

            <TabsContent value="modules" className="mt-4">
              <div className="space-y-3">
                {documentsError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Failed to load documents</AlertTitle>
                    <AlertDescription>{documentsError.message || 'An error occurred'}</AlertDescription>
                  </Alert>
                )}

                {!documentsLoading && !hasDocuments && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>No documents returned</AlertTitle>
                    <AlertDescription>
                      The Data Center expects `/api/ectd-documents` to return documents. If you’re running the backend, check the server logs for “eCTD Documents routes loaded”.
                    </AlertDescription>
                  </Alert>
                )}

                {!documentsLoading && hasDocuments && !hasFilteredDocuments && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>No matches</AlertTitle>
                    <AlertDescription>Adjust search/module filters to see documents.</AlertDescription>
                  </Alert>
                )}

                <ScrollArea className="h-[520px]">
                  <Accordion type="single" collapsible className="w-full">
                    {Object.entries(groupedDocuments).map(([moduleKey, sections]) => (
                      <AccordionItem key={moduleKey} value={moduleKey}>
                        <AccordionTrigger>
                          <div className="flex items-center justify-between w-full pr-4">
                            <span className="font-medium">{ECTD_MODULES[moduleKey]?.name || 'Unassigned'}</span>
                            <Badge variant="secondary">{Object.values(sections).flat().length} documents</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 p-2">
                            {Object.entries(sections).map(([section, docs]) => (
                              <div key={section} className="space-y-2">
                                <div className="text-sm font-medium text-muted-foreground pl-2">{section}</div>
                                <div className="space-y-2">{docs.map((doc) => renderDocumentCard(doc, section))}</div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <ScrollArea className="h-[520px]">
                <div className="space-y-3 p-2">
                  {filteredDocuments
                    .slice()
                    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
                    .map((doc) => renderDocumentCard(doc, doc.section))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="relationships" className="mt-4">
              <Alert>
                <GitBranch className="h-4 w-4" />
                <AlertTitle>Document Relationships</AlertTitle>
                <AlertDescription>
                  View relationships between documents (lineage, cross-references, and dependencies). If the lineage endpoint isn’t implemented yet, this will show an empty state.
                </AlertDescription>
              </Alert>

              <div className="mt-4 space-y-3">
                {!selectedDocument && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Select a document</CardTitle>
                      <CardDescription>Pick a document to view its lineage.</CardDescription>
                    </CardHeader>
                  </Card>
                )}

                {selectedDocument && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Lineage: {selectedDocument.title || 'Untitled'}</CardTitle>
                      <CardDescription>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => setShowLineageView(true)} disabled={lineageQuery.isLoading}>
                            {lineageQuery.isLoading ? 'Loading…' : 'Refresh lineage'}
                          </Button>
                        </div>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {lineageQuery.isLoading && <div className="text-sm text-muted-foreground">Loading lineage…</div>}

                      {lineageQuery.error && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Lineage unavailable</AlertTitle>
                          <AlertDescription>{lineageQuery.error.message || 'Could not load lineage'}</AlertDescription>
                        </Alert>
                      )}

                      {!lineageQuery.isLoading && !lineageQuery.error && (
                        <div className="space-y-4">
                          <div>
                            <Label>Parents</Label>
                            <div className="mt-2 text-sm text-muted-foreground">
                              {(lineageQuery.data?.parents || []).length === 0 ? 'No parent links found.' : null}
                            </div>
                            <div className="mt-2 space-y-2">
                              {(lineageQuery.data?.parents || []).map((p) => (
                                <div key={p.id} className="flex items-center gap-2">
                                  <GitBranch className="h-4 w-4" />
                                  <span className="text-sm">{p.title}</span>
                                  {p.relationship && (
                                    <Badge variant="outline" className="text-xs">
                                      {p.relationship}
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <Label>Children</Label>
                            <div className="mt-2 text-sm text-muted-foreground">
                              {(lineageQuery.data?.children || []).length === 0 ? 'No child links found.' : null}
                            </div>
                            <div className="mt-2 space-y-2">
                              {(lineageQuery.data?.children || []).map((c) => (
                                <div key={c.id} className="flex items-center gap-2">
                                  <GitBranch className="h-4 w-4" />
                                  <span className="text-sm">{c.title}</span>
                                  {c.relationship && (
                                    <Badge variant="outline" className="text-xs">
                                      {c.relationship}
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {assemblyMode && selectedDocuments.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">{selectedDocuments.length} documents selected</span>
                <Button size="sm" onClick={handleAssembleDocument}>
                  <Package className="h-4 w-4 mr-2" />
                  Assemble into eCTD
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedDocuments([])}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={showVersionHistory} onOpenChange={setShowVersionHistory}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Version History: {selectedDocument?.title || 'Untitled'}</DialogTitle>
            <DialogDescription>View and manage document versions</DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[400px] mt-4">
            <div className="space-y-3">
              {versionsQuery.isLoading && <div className="text-sm text-muted-foreground">Loading versions…</div>}
              {versionsQuery.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Versions unavailable</AlertTitle>
                  <AlertDescription>{versionsQuery.error.message || 'Could not load versions'}</AlertDescription>
                </Alert>
              )}

              {!versionsQuery.isLoading &&
                !versionsQuery.error &&
                (Array.isArray(versionsQuery.data) ? versionsQuery.data : versionsQuery.data?.versions || []).map((version) => (
                  <Card key={version.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <GitCommit className="h-4 w-4" />
                            <span className="font-medium">Version {version.versionNumber}</span>
                            {version.isCurrent && (
                              <Badge variant="default" className="text-xs">
                                Current
                              </Badge>
                            )}
                          </div>
                          {version.changeDescription && <p className="text-sm text-muted-foreground mt-1">{version.changeDescription}</p>}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            {version.author && <span>By: {version.author}</span>}
                            {version.createdAt && <span>{new Date(version.createdAt).toLocaleString()}</span>}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button onClick={handleCreateVersion} disabled={createVersionMutation.isPending}>
              {createVersionMutation.isPending ? 'Creating…' : 'Create New Version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}