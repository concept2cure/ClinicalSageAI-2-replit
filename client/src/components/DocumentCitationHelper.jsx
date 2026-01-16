// Document Citation Helper - Integrates Document Data Center with any Editor
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, } from '@/components/ui/command';
import {
  Popover, PopoverContent, PopoverTrigger, } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import {
  FileText, Search, Copy, Link2, ChevronRight, Database, FileSearch, Check, Plus, X } from 'lucide-react'

/**
 * Citation Helper Component
 * This can be embedded in any document editor to provide quick access to Document Data Center files
 * and generate citations automatically.
 * 
 * Usage:
 * <DocumentCitationHelper 
 *   onCitationInsert={(citation) => insertIntoEditor(citation)}
 *   editorContext={currentSection}
 * />
 */
export default function DocumentCitationHelper({ 
  onCitationInsert, 
  editorContext = null,
  compact = false 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [recentCitations, setRecentCitations] = useState([]);
  const { toast } = useToast();

  // Get organization ID from localStorage or fall back to default
  const organizationId = localStorage.getItem('currentOrganizationId') || localStorage.getItem('organizationId') || '7';

  // Load recent citations from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('recentCitations');
    if (stored) {
      setRecentCitations(JSON.parse(stored));
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        performSearch();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const performSearch = async () => {
    setIsSearching(true);
    try {
      const response = await fetch('/api/device-data-center/search/deep', {
        method: 'POST',
        headers: {
          'X-Organization-Id': organizationId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
          filters: {
            // If we have editor context, prioritize relevant categories
            categories: editorContext?.suggestedCategories || [],
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const generateCitation = async (documentIds) => {
    try {
      const response = await fetch('/api/device-data-center/citations', {
        method: 'POST',
        headers: {
          'X-Organization-Id': organizationId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentIds }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.citations;
      }
    } catch (error) {
      toast({
        title: 'Citation Error',
        description: 'Failed to generate citations',
        variant: 'destructive',
      });
    }
    return [];
  };

  const insertCitations = async () => {
    if (selectedDocuments.length === 0) {
      toast({
        title: 'No Documents Selected',
        description: 'Please select documents to cite',
        variant: 'destructive',
      });
      return;
    }

    const citations = await generateCitation(selectedDocuments.map(doc => doc.id));
    
    if (citations.length > 0) {
      // Format citations for insertion
      const formattedCitations = citations.map(cite => ({
        text: cite.citationText,
        reference: cite.reference,
        url: cite.url,
        metadata: {
          documentId: cite.id,
          category: cite.category,
          standards: cite.standards,
        },
      }));

      // Call parent callback
      if (onCitationInsert) {
        onCitationInsert(formattedCitations);
      }

      // Update recent citations
      const newRecent = [...formattedCitations, ...recentCitations].slice(0, 10);
      setRecentCitations(newRecent);
      localStorage.setItem('recentCitations', JSON.stringify(newRecent));

      toast({
        title: 'Citations Added',
        description: `${citations.length} citation(s) inserted into document`,
      });

      // Clear selection
      setSelectedDocuments([]);
      setShowDialog(false);
    }
  };

  const toggleDocumentSelection = (doc) => {
    setSelectedDocuments(prev => {
      const isSelected = prev.some(d => d.id === doc.id);
      if (isSelected) {
        return prev.filter(d => d.id !== doc.id);
      } else {
        return [...prev, doc];
      }
    });
  };

  const QuickCitationButton = () => (
    <Button
      variant="outline"
      size={compact ? 'sm' : 'default'}
      onClick={() => setShowDialog(true)}
      data-testid="citation-helper-button"
    >
      <Link2 className="h-4 w-4 mr-2" />
      Add Citation
    </Button>
  );

  const DocumentItem = ({ doc, isSelected }) => (
    <div
      className={`p-3 border rounded-lg cursor-pointer transition-all ${
        isSelected ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
      }`}
      onClick={() => toggleDocumentSelection(doc)}
      data-testid={`citation-doc-${doc.id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-medium text-sm">{doc.fileName}</h4>
          <p className="text-xs text-muted-foreground mt-1">
            {doc.deviceName} • {doc.category}
          </p>
          {doc.testStandards?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {doc.testStandards.slice(0, 2).map(std => (
                <Badge key={std} variant="outline" className="text-xs">
                  {std}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="ml-2">
          {isSelected ? (
            <Check className="h-5 w-5 text-primary" />
          ) : (
            <Plus className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  );

  if (compact) {
    return (
      <>
        <QuickCitationButton />
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Add Document Citations</DialogTitle>
              <DialogDescription>
                Search and select documents from the Document Data Center to cite
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="citation-search-input"
                />
              </div>

              {/* Selected count */}
              {selectedDocuments.length > 0 && (
                <div className="flex items-center justify-between p-2 bg-primary/5 rounded">
                  <span className="text-sm font-medium">
                    {selectedDocuments.length} document(s) selected
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDocuments([])}
                  >
                    Clear All
                  </Button>
                </div>
              )}

              {/* Results */}
              <ScrollArea className="h-[400px]">
                {isSearching ? (
                  <div className="flex justify-center py-8">
                    <FileSearch className="h-8 w-8 animate-pulse text-muted-foreground" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-8">
                    <Database className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? 'No documents found' : 'Search for documents to cite'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 pr-4">
                    {searchResults.map(doc => (
                      <DocumentItem
                        key={doc.id}
                        doc={doc}
                        isSelected={selectedDocuments.some(d => d.id === doc.id)}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Recent Citations */}
              {recentCitations.length > 0 && !searchQuery && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Recent Citations</h4>
                  <div className="space-y-1">
                    {recentCitations.slice(0, 3).map((cite, idx) => (
                      <div
                        key={idx}
                        className="p-2 border rounded text-xs hover:bg-accent cursor-pointer"
                        onClick={() => onCitationInsert && onCitationInsert([cite])}
                      >
                        {cite.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={insertCitations}
                disabled={selectedDocuments.length === 0}
                data-testid="insert-citations-button"
              >
                Insert {selectedDocuments.length} Citation(s)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Full component (non-compact) mode
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center">
          <FileText className="h-5 w-5 mr-2" />
          Document Citations
        </CardTitle>
        <CardDescription>
          Search and cite documents from the Document Data Center
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Selected Documents */}
        {selectedDocuments.length > 0 && (
          <div className="p-3 bg-primary/5 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                Selected Documents ({selectedDocuments.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDocuments([])}
              >
                Clear
              </Button>
            </div>
            <div className="space-y-1">
              {selectedDocuments.map(doc => (
                <div key={doc.id} className="flex items-center justify-between text-sm">
                  <span>{doc.fileName}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleDocumentSelection(doc)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search Results */}
        <ScrollArea className="h-[300px]">
          {isSearching ? (
            <div className="flex justify-center py-8">
              <FileSearch className="h-8 w-8 animate-pulse text-muted-foreground" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-8">
              <Database className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'No documents found' : 'Search for documents'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {searchResults.map(doc => (
                <DocumentItem
                  key={doc.id}
                  doc={doc}
                  isSelected={selectedDocuments.some(d => d.id === doc.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Action Button */}
        <Button
          className="w-full"
          onClick={insertCitations}
          disabled={selectedDocuments.length === 0}
        >
          <Link2 className="h-4 w-4 mr-2" />
          Insert {selectedDocuments.length} Citation(s)
        </Button>
      </CardContent>
    </Card>
  );
}