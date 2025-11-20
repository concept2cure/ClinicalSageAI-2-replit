import React, { useState, useEffect } from 'react';
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Alert,
  AlertTitle,
  AlertDescription,
  Checkbox,
} from '@/components/ui';
import { XCircle, BookOpen, FileCheck, Search, PlusCircle, Lightbulb } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import LiteratureFeatureService from '@/services/LiteratureFeatureService';
import { searchPubMed } from '@/services/LiteratureAPIService';

/**
 * Literature Tab component for the 510k Equivalence Builder
 * This tab allows users to connect literature papers to device features
 * as supporting evidence for the 510k submission.
 */
const LiteratureTab = ({
  deviceFeatures = [],
  deviceName = '',
  documentId = '',
  manufacturer = '',
  onEvidenceUpdated = () => {},
}) => {
  const { toast } = useToast();
  const [papers, setPapers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [paperSelections, setPaperSelections] = useState({});
  const [featureEvidence, setFeatureEvidence] = useState({});
  const [searchFilters, setSearchFilters] = useState({
    yearFrom: new Date().getFullYear() - 5,
    yearTo: new Date().getFullYear(),
    journalType: 'Journal Article',
  });
  const [aiSuggestions, setAiSuggestions] = useState({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Initialize feature evidence from device features
  useEffect(() => {
    if (deviceFeatures && deviceFeatures.length > 0) {
      const initialFeatureEvidence = {};
      deviceFeatures.forEach(feature => {
        initialFeatureEvidence[feature.id] = feature.literatureEvidence || [];
      });
      setFeatureEvidence(initialFeatureEvidence);
    }
  }, [deviceFeatures]);

  // Load papers based on device name and manufacturer
  const loadPapers = async () => {
    if (!deviceName) return;

    setIsLoading(true);
    try {
      const query = searchQuery || deviceName;
      const result = await searchPubMed({
        query,
        manufacturer,
        limit: 50,
        filters: searchFilters,
      });

      setPapers(result.papers || []);

      if (result.papers && result.papers.length === 0) {
        toast({
          title: 'No literature found',
          description: `No matching literature found for ${query}. Try adjusting your search terms.`,
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Error loading literature:', error);
      toast({
        title: 'Error loading literature',
        description: error.message || 'Failed to load literature papers.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Analyze relevance using AI
  const analyzeRelevance = async () => {
    if (papers.length === 0 || deviceFeatures.length === 0) return;

    setIsAnalyzing(true);
    try {
      const result = await LiteratureFeatureService.analyzeLiteratureFeatureRelevance({
        features: deviceFeatures,
        literature: papers,
      });

      if (result.success && result.relevanceData && result.relevanceData.paperToFeatures) {
        setAiSuggestions(result.relevanceData.paperToFeatures);

        toast({
          title: 'AI Analysis Complete',
          description: 'Literature has been analyzed for relevance to device features.',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Error analyzing literature relevance:', error);
      toast({
        title: 'Error analyzing relevance',
        description: error.message || 'Failed to analyze literature relevance.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Open the literature connection dialog for a specific feature
  const openFeatureDialog = feature => {
    setSelectedFeature(feature);

    // Initialize paper selections from the feature's current evidence
    const selections = {};
    const currentEvidence = featureEvidence[feature.id] || [];

    papers.forEach((paper, index) => {
      selections[index] = currentEvidence.includes(paper.id);
    });

    setPaperSelections(selections);
    setOpenDialog(true);
  };

  // Save the literature connections for the selected feature
  const saveFeatureEvidence = async () => {
    if (!selectedFeature || !documentId) return;

    // Build the list of selected paper IDs
    const selectedPaperIds = Object.entries(paperSelections)
      .filter(([_, isSelected]) => isSelected)
      .map(([index]) => papers[parseInt(index)].id);

    // Update the feature evidence state
    const updatedFeatureEvidence = {
      ...featureEvidence,
      [selectedFeature.id]: selectedPaperIds,
    };

    setFeatureEvidence(updatedFeatureEvidence);

    try {
      // Save to the server
      await LiteratureFeatureService.saveLiteratureFeatureConnections({
        documentId,
        featureEvidence: updatedFeatureEvidence,
      });

      toast({
        title: 'Evidence saved',
        description: `Literature evidence for "${selectedFeature.name}" has been saved.`,
        variant: 'default',
      });

      // Notify parent component
      onEvidenceUpdated(updatedFeatureEvidence);

      // Close the dialog
      setOpenDialog(false);
    } catch (error) {
      console.error('Error saving feature evidence:', error);
      toast({
        title: 'Error saving evidence',
        description: error.message || 'Failed to save literature evidence connections.',
        variant: 'destructive',
      });
    }
  };

  // Apply AI suggestion for a feature
  const applyAiSuggestion = feature => {
    if (!feature || !aiSuggestions) return;

    // Find the paper indices related to this feature
    const relevantPaperIndices = [];

    Object.entries(aiSuggestions).forEach(([paperIndex, featureIndices]) => {
      // Find the feature's index in the deviceFeatures array
      const featureIndex = deviceFeatures.findIndex(f => f.id === feature.id);

      if (featureIndices.includes(featureIndex)) {
        relevantPaperIndices.push(parseInt(paperIndex));
      }
    });

    // Initialize paper selections
    const selections = {};
    papers.forEach((_, index) => {
      selections[index] = relevantPaperIndices.includes(index);
    });

    // Set the selected feature and paper selections
    setSelectedFeature(feature);
    setPaperSelections(selections);
    setOpenDialog(true);

    toast({
      title: 'AI suggestions applied',
      description: `${relevantPaperIndices.length} papers suggested for "${feature.name}"`,
      variant: 'default',
    });
  };

  // Render the feature cards with their evidence
  const renderFeatureCards = () => {
    if (!deviceFeatures || deviceFeatures.length === 0) {
      return (
        <Alert>
          <AlertTitle>No features available</AlertTitle>
          <AlertDescription>
            Please add device features in the Features tab before connecting literature.
          </AlertDescription>
        </Alert>
      );
    }

    return deviceFeatures.map(feature => {
      const evidenceCount = (featureEvidence[feature.id] || []).length;
      const hasSuggestions = Object.entries(aiSuggestions).some(([_, featureIndices]) => {
        const featureIndex = deviceFeatures.findIndex(f => f.id === feature.id);
        return featureIndices.includes(featureIndex);
      });

      return (
        <Card key={feature.id} className="p-4 mb-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-lg font-semibold">{feature.name}</h3>
              <p className="text-sm text-gray-500">{feature.category || 'General'}</p>
            </div>
            <div className="flex gap-2">
              {hasSuggestions && (
                <Button variant="outline" size="sm" onClick={() => applyAiSuggestion(feature)}>
                  <Lightbulb className="w-4 h-4 mr-1" />
                  Apply Suggestions
                </Button>
              )}
              <Button variant="default" size="sm" onClick={() => openFeatureDialog(feature)}>
                <PlusCircle className="w-4 h-4 mr-1" />
                {evidenceCount > 0 ? 'Manage Evidence' : 'Add Evidence'}
              </Button>
            </div>
          </div>

          <p className="text-sm mb-3">{feature.description || 'No description available.'}</p>

          {evidenceCount > 0 ? (
            <div className="bg-slate-50 p-2 rounded-md">
              <p className="text-sm font-medium mb-1 flex items-center">
                <BookOpen className="w-4 h-4 mr-1" />
                <span>
                  {evidenceCount} {evidenceCount === 1 ? 'paper' : 'papers'} connected
                </span>
              </p>
            </div>
          ) : (
            <div className="bg-slate-50 p-2 rounded-md text-sm text-gray-500">
              No literature evidence connected yet.
            </div>
          )}
        </Card>
      );
    });
  };

  // Render the paper selection dialog
  const renderPaperSelectionDialog = () => {
    if (!selectedFeature) return null;

    return (
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Connect Literature Evidence</DialogTitle>
            <DialogDescription>
              Select literature papers that provide evidence for the "{selectedFeature.name}"
              feature.
            </DialogDescription>
          </DialogHeader>

          {papers.length > 0 ? (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Select</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-32">Year</TableHead>
                    <TableHead className="w-48">Journal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {papers.map((paper, index) => {
                    const year = paper.publicationDate
                      ? new Date(paper.publicationDate).getFullYear()
                      : 'N/A';

                    return (
                      <TableRow key={index}>
                        <TableCell>
                          <Checkbox
                            checked={paperSelections[index] || false}
                            onCheckedChange={checked => {
                              setPaperSelections({
                                ...paperSelections,
                                [index]: checked,
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{paper.title}</div>
                          <div className="text-sm text-gray-500">
                            {paper.authors && paper.authors.length > 0
                              ? paper.authors.slice(0, 3).join(', ') +
                                (paper.authors.length > 3 ? ' et al.' : '')
                              : 'Unknown authors'}
                          </div>
                        </TableCell>
                        <TableCell>{year}</TableCell>
                        <TableCell>{paper.journal || 'N/A'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p>No literature papers have been loaded. Search for papers first.</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveFeatureEvidence} disabled={papers.length === 0}>
              <FileCheck className="w-4 h-4 mr-1" />
              Save Evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="w-full">
      <Tabs defaultValue="features">
        <TabsList className="mb-4">
          <TabsTrigger value="features">Feature Evidence</TabsTrigger>
          <TabsTrigger value="search">Literature Search</TabsTrigger>
        </TabsList>

        <TabsContent value="features">
          <div className="mb-4 flex justify-between items-center">
            <h2 className="text-xl font-semibold">Feature Evidence Connections</h2>
            {papers.length > 0 && deviceFeatures.length > 0 && (
              <Button onClick={analyzeRelevance} disabled={isAnalyzing} variant="outline">
                <Lightbulb className="w-4 h-4 mr-1" />
                {isAnalyzing ? 'Analyzing...' : 'Analyze Relevance'}
              </Button>
            )}
          </div>

          <div className="space-y-4">{renderFeatureCards()}</div>
        </TabsContent>

        <TabsContent value="search">
          <div className="mb-4">
            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search for literature papers..."
                  className="w-full p-2 border rounded-md"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && loadPapers()}
                />
              </div>
              <Button onClick={loadPapers} disabled={isLoading}>
                <Search className="w-4 h-4 mr-1" />
                {isLoading ? 'Searching...' : 'Search'}
              </Button>
            </div>

            {papers.length > 0 ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Search Results</h3>
                <div className="max-h-[500px] overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-32">Date</TableHead>
                        <TableHead className="w-48">Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {papers.map((paper, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="font-medium">
                              {paper.url ? (
                                <a
                                  href={paper.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  {paper.title}
                                </a>
                              ) : (
                                paper.title
                              )}
                            </div>
                            <div className="text-sm text-gray-500">
                              {paper.authors && paper.authors.length > 0
                                ? paper.authors.slice(0, 3).join(', ') +
                                  (paper.authors.length > 3 ? ' et al.' : '')
                                : 'Unknown authors'}
                            </div>
                          </TableCell>
                          <TableCell>
                            {paper.publicationDate
                              ? new Date(paper.publicationDate).toLocaleDateString()
                              : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <div>{paper.journal || paper.source || 'N/A'}</div>
                            {paper.doi && (
                              <div className="text-xs text-gray-500">DOI: {paper.doi}</div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 border rounded-md bg-gray-50">
                <BookOpen className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                <h3 className="text-lg font-medium mb-1">No Literature Papers Loaded</h3>
                <p className="text-gray-500 mb-4">
                  Search for literature papers related to the device or specific features.
                </p>
                <Button onClick={loadPapers} variant="outline">
                  <Search className="w-4 h-4 mr-1" />
                  Search Device Literature
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {renderPaperSelectionDialog()}
    </div>
  );
};

export default LiteratureTab;
