/**
 * Citation Manager Component
 *
 * This component provides an interface for managing literature citations
 * within 510(k) documents, including viewing, organizing, and removing citations.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/components/ui/toaster';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Trash,
  ExternalLink,
  Calendar,
  Loader2,
  BookOpen,
  Share,
  Tag,
  List,
  X,
  Copy,
  ClipboardEdit,
  Info,
} from 'lucide-react';

import { useContext } from 'react';
import { useTenant } from '../../contexts/TenantContext.tsx';

// Helper to format citation
const formatCitation = citation => {
  if (!citation.literature) return 'Unknown citation';

  const lit = citation.literature;
  const authors = lit.authors ? lit.authors.join(', ') : 'Unknown';
  const year = lit.publication_date ? new Date(lit.publication_date).getFullYear() : 'n.d.';
  const title = lit.title || 'Untitled';
  const journal = lit.journal || 'Unknown source';

  return `${authors} (${year}). ${title}. ${journal}.`;
};

// Citation Item Component - Single citation display
const CitationItem = ({ citation, onRemove, onEdit }) => {
  const formattedDate = citation.created_at
    ? new Date(citation.created_at).toLocaleDateString()
    : 'Unknown date';

  return (
    <Card
      className="mb-4 border-l-4"
      style={{ borderLeftColor: getSourceColor(citation.literature?.source_name) }}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex gap-2 mb-2">
              <Badge variant="outline" className="bg-slate-100">
                {citation.literature?.source_name || 'Unknown source'}
              </Badge>
              <Badge variant="outline" className="bg-blue-50">
                {citation.section_name || 'General'}
              </Badge>
            </div>
            <CardTitle className="text-lg">
              {citation.literature?.title || 'Unknown Title'}
            </CardTitle>
          </div>
        </div>
        <div className="flex items-center text-sm text-muted-foreground">
          <Calendar className="mr-1 h-3 w-3" />
          {formattedDate}

          {citation.literature?.journal && (
            <>
              <span className="mx-1">•</span>
              <BookOpen className="mr-1 h-3 w-3" />
              {citation.literature.journal}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="border-l-2 border-gray-200 pl-3 py-1 bg-gray-50 rounded">
          <p className="text-sm italic">{citation.citation_text || formatCitation(citation)}</p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between pt-1">
        <div>
          <Button variant="ghost" size="sm" onClick={() => onEdit(citation)}>
            <ClipboardEdit className="mr-2 h-4 w-4" /> Edit Citation
          </Button>
        </div>
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500"
            onClick={() => onRemove(citation.id)}
          >
            <Trash className="mr-2 h-4 w-4" /> Remove
          </Button>
          {citation.literature?.url && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(citation.literature.url, '_blank')}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> View Source
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};

// Helper to get color based on source
const getSourceColor = source => {
  const colors = {
    PubMed: '#5585b3',
    FDA: '#6a9bcc',
    'ClinicalTrials.gov': '#788c5d',
    'Previously Imported': '#6a9bcc',
  };

  return colors[source] || '#8a8880';
};

// Citation Manager main component
const CitationManager = ({ documentId, documentType }) => {
  const [citations, setCitations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editCitationText, setEditCitationText] = useState('');
  const [filter, setFilter] = useState('all');
  const [sections, setSections] = useState([]);

  const { toast } = useToast();
  const { organizationId } = useContext(TenantContext);

  useEffect(() => {
    if (documentId) {
      fetchCitations();
    }
  }, [documentId]);

  const fetchCitations = async () => {
    if (!documentId) return;

    setIsLoading(true);
    try {
      const response = await axios.get(`/api/510k/literature/citations`, {
        params: {
          documentId,
          documentType: documentType || '510k',
          organizationId: organizationId || 'default-org',
        },
      });

      setCitations(response.data.citations);

      // Extract unique sections for filtering
      const uniqueSections = Array.from(
        new Set(response.data.citations.map(c => c.section_name))
      ).filter(Boolean);
      setSections(uniqueSections);
    } catch (error) {
      console.error('Error fetching citations:', error);
      toast({
        title: 'Failed to load citations',
        description: error.response?.data?.error || 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveCitation = async citationId => {
    try {
      await axios.delete(`/api/510k/literature/citations/${citationId}`, {
        params: {
          organizationId: organizationId || 'default-org',
        },
      });

      // Update local state
      setCitations(citations.filter(c => c.id !== citationId));

      toast({
        title: 'Citation removed',
        description: 'The citation has been removed from your document',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error removing citation:', error);
      toast({
        title: 'Failed to remove citation',
        description: error.response?.data?.error || 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleEditCitation = citation => {
    setSelectedCitation(citation);
    setEditCitationText(citation.citation_text || formatCitation(citation));
    setEditMode(true);
  };

  const saveCitationEdit = async () => {
    if (!selectedCitation) return;

    try {
      // This endpoint might need to be implemented on the backend
      await axios.patch(`/api/510k/literature/citations/${selectedCitation.id}`, {
        citation_text: editCitationText,
        organizationId: organizationId || 'default-org',
      });

      // Update local state
      setCitations(
        citations.map(c =>
          c.id === selectedCitation.id ? { ...c, citation_text: editCitationText } : c
        )
      );

      setEditMode(false);
      setSelectedCitation(null);

      toast({
        title: 'Citation updated',
        description: 'The citation text has been updated',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating citation:', error);
      toast({
        title: 'Failed to update citation',
        description: error.response?.data?.error || 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  };

  const getFilteredCitations = () => {
    if (filter === 'all') return citations;
    return citations.filter(c => c.section_name === filter);
  };

  // Group citations by section for the organized view
  const getCitationsBySection = () => {
    const sectionMap = {};

    citations.forEach(citation => {
      const sectionName = citation.section_name || 'Uncategorized';
      if (!sectionMap[sectionName]) {
        sectionMap[sectionName] = [];
      }
      sectionMap[sectionName].push(citation);
    });

    return sectionMap;
  };

  // Generate export text with all citations
  const generateExportText = () => {
    return citations
      .map(citation => {
        return formatCitation(citation);
      })
      .join('\n\n');
  };

  // Handle copy to clipboard
  const copyToClipboard = () => {
    const text = generateExportText();
    navigator.clipboard.writeText(text).then(
      () => {
        toast({
          title: 'Copied to clipboard',
          description: 'All citations have been copied to your clipboard',
          variant: 'default',
        });
      },
      err => {
        console.error('Could not copy text: ', err);
        toast({
          title: 'Failed to copy',
          description: 'Could not copy citations to clipboard',
          variant: 'destructive',
        });
      }
    );
  };

  return (
    <div className="citation-manager">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl">Citation Manager</CardTitle>
              <CardDescription>
                Manage and organize literature citations in your 510(k) document
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchCitations}>
                Refresh
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={citations.length === 0}>
                    <Share className="mr-2 h-4 w-4" /> Export
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Export Citations</DialogTitle>
                    <DialogDescription>
                      Copy all citations to use in your document or reference management software
                    </DialogDescription>
                  </DialogHeader>
                  <div className="my-4">
                    <ScrollArea className="h-[300px] border rounded-md p-4">
                      <pre className="text-sm whitespace-pre-wrap">{generateExportText()}</pre>
                    </ScrollArea>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={copyToClipboard}>
                      <Copy className="mr-2 h-4 w-4" /> Copy to Clipboard
                    </Button>
                    <DialogClose asChild>
                      <Button>Done</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!documentId ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>No Document Selected</AlertTitle>
              <AlertDescription>
                Please select a document to view and manage its citations
              </AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading citations...</span>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <Tabs defaultValue="list">
                  <div className="flex justify-between items-center mb-4">
                    <TabsList>
                      <TabsTrigger value="list">
                        <List className="h-4 w-4 mr-2" /> List View
                      </TabsTrigger>
                      <TabsTrigger value="organized">
                        <Tag className="h-4 w-4 mr-2" /> By Section
                      </TabsTrigger>
                    </TabsList>

                    {sections.length > 0 && (
                      <div className="flex items-center">
                        <Label htmlFor="filter" className="mr-2">
                          Filter:
                        </Label>
                        <select
                          id="filter"
                          value={filter}
                          onChange={e => setFilter(e.target.value)}
                          className="p-2 border rounded-md text-sm"
                        >
                          <option value="all">All Sections</option>
                          {sections.map(section => (
                            <option key={section} value={section}>
                              {section}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <TabsContent value="list">
                    {citations.length === 0 ? (
                      <Alert className="bg-yellow-50">
                        <Info className="h-4 w-4" />
                        <AlertTitle>No Citations Yet</AlertTitle>
                        <AlertDescription>
                          Use the Literature Search feature to find and cite relevant sources for
                          your 510(k) submission
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <ScrollArea className="max-h-[500px]">
                        {getFilteredCitations().map(citation => (
                          <CitationItem
                            key={citation.id}
                            citation={citation}
                            onRemove={handleRemoveCitation}
                            onEdit={handleEditCitation}
                          />
                        ))}
                      </ScrollArea>
                    )}
                  </TabsContent>

                  <TabsContent value="organized">
                    {citations.length === 0 ? (
                      <Alert className="bg-yellow-50">
                        <Info className="h-4 w-4" />
                        <AlertTitle>No Citations Yet</AlertTitle>
                        <AlertDescription>
                          Use the Literature Search feature to find and cite relevant sources for
                          your 510(k) submission
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <ScrollArea className="max-h-[500px]">
                        {Object.entries(getCitationsBySection()).map(
                          ([section, sectionCitations]) => (
                            <div key={section} className="mb-6">
                              <h3 className="text-md font-semibold mb-2 flex items-center">
                                <Tag className="h-4 w-4 mr-2" />
                                {section}
                                <Badge className="ml-2" variant="outline">
                                  {sectionCitations.length}
                                </Badge>
                              </h3>
                              <Separator className="mb-3" />
                              <div className="pl-1">
                                {sectionCitations.map(citation => (
                                  <CitationItem
                                    key={citation.id}
                                    citation={citation}
                                    onRemove={handleRemoveCitation}
                                    onEdit={handleEditCitation}
                                  />
                                ))}
                              </div>
                            </div>
                          )
                        )}
                      </ScrollArea>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Citation Dialog */}
      <Dialog
        open={editMode}
        onOpenChange={open => {
          if (!open) {
            setEditMode(false);
            setSelectedCitation(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Citation</DialogTitle>
            <DialogDescription>
              Modify the citation text to match your preferred format
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <Label htmlFor="citation-text" className="mb-2 block">
              Citation Text
            </Label>
            <textarea
              id="citation-text"
              value={editCitationText}
              onChange={e => setEditCitationText(e.target.value)}
              className="w-full p-2 border rounded-md h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditMode(false);
                setSelectedCitation(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveCitationEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CitationManager;
