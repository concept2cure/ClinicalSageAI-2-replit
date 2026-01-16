import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import {
  Calendar, BookOpen, FileText, ChevronDown, ChevronUp, Eye, ExternalLink, Bookmark, Check, BarChart2 } from 'lucide-react'
import { literatureAPIService } from '@/services/LiteratureAPIService';

/**
 * Literature Visualization Panel for 510(k) Submissions
 *
 * This component displays academic literature search results with various
 * visualization options to help users analyze and select relevant papers.
 */
const LiteratureVisualizationPanel = ({
  literatureData = [],
  selectedItems = [],
  onSelectItem,
  deviceProfile = {},
}) => {
  // State management
  const [visualizationMode, setVisualizationMode] = useState('list');
  const [sortField, setSortField] = useState('relevanceScore');
  const [sortDirection, setSortDirection] = useState('desc');
  const [openPaper, setOpenPaper] = useState(null);
  const [groupedData, setGroupedData] = useState({});
  const [isGeneratingEvidenceSummary, setIsGeneratingEvidenceSummary] = useState(false);
  const [evidenceSummary, setEvidenceSummary] = useState('');

  // Process and group literature data for visualizations
  useEffect(() => {
    if (!literatureData || literatureData.length === 0) return;

    // Group data by publication year
    const byYear = literatureData.reduce((acc, paper) => {
      const year = new Date(paper.publicationDate || Date.now()).getFullYear();
      if (!acc[year]) acc[year] = [];
      acc[year].push(paper);
      return acc;
    }, {});

    // Group data by relevance score ranges
    const byRelevance = literatureData.reduce((acc, paper) => {
      let range = 'low';
      if (paper.relevanceScore >= 0.8) range = 'high';
      else if (paper.relevanceScore >= 0.5) range = 'medium';

      if (!acc[range]) acc[range] = [];
      acc[range].push(paper);
      return acc;
    }, {});

    // Group data by study type
    const byStudyType = literatureData.reduce((acc, paper) => {
      const type = paper.studyType || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(paper);
      return acc;
    }, {});

    setGroupedData({
      byYear,
      byRelevance,
      byStudyType,
    });
  }, [literatureData]);

  // Toggle sort direction or change sort field
  const handleSort = field => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Generate sorted literature list based on current sort settings
  const getSortedLiterature = () => {
    if (!literatureData || literatureData.length === 0) return [];

    return [...literatureData].sort((a, b) => {
      let valueA = a[sortField] || 0;
      let valueB = b[sortField] || 0;

      // Handle special cases for date fields
      if (sortField === 'publicationDate') {
        valueA = new Date(valueA || 0).getTime();
        valueB = new Date(valueB || 0).getTime();
      }

      // Apply sort direction
      return sortDirection === 'asc' ? valueA - valueB : valueB - valueA;
    });
  };

  // Generate a summary of evidence from selected literature
  const generateEvidenceSummary = async () => {
    if (selectedItems.length === 0) return;

    setIsGeneratingEvidenceSummary(true);

    try {
      const context = {
        deviceName: deviceProfile?.deviceName || '',
        indication: deviceProfile?.indication || '',
        deviceType: deviceProfile?.deviceType || '',
      };

      const response = await literatureAPIService.generateLiteratureReview({
        papers: selectedItems,
        context,
        options: {
          focus: 'both', // both safety and efficacy
          format: 'concise',
        },
      });

      setEvidenceSummary(response.reviewText || 'No summary could be generated at this time.');
    } catch (error) {
      console.error('Error generating evidence summary:', error);
      setEvidenceSummary('Error generating summary. Please try again.');
    } finally {
      setIsGeneratingEvidenceSummary(false);
    }
  };

  // Render literature list view
  const renderListView = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={sortField === 'relevanceScore' ? 'secondary' : 'outline'}
            onClick={() => handleSort('relevanceScore')}
          >
            Relevance{' '}
            {sortField === 'relevanceScore' &&
              (sortDirection === 'asc' ? (
                <ChevronUp className="h-4 w-4 ml-1" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              ))}
          </Button>
          <Button
            size="sm"
            variant={sortField === 'publicationDate' ? 'secondary' : 'outline'}
            onClick={() => handleSort('publicationDate')}
          >
            Date{' '}
            {sortField === 'publicationDate' &&
              (sortDirection === 'asc' ? (
                <ChevronUp className="h-4 w-4 ml-1" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              ))}
          </Button>
          <Button
            size="sm"
            variant={sortField === 'journalImpactFactor' ? 'secondary' : 'outline'}
            onClick={() => handleSort('journalImpactFactor')}
          >
            Impact{' '}
            {sortField === 'journalImpactFactor' &&
              (sortDirection === 'asc' ? (
                <ChevronUp className="h-4 w-4 ml-1" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              ))}
          </Button>
        </div>
        <div>
          <span className="text-sm mr-2">
            {selectedItems.length} of {literatureData.length} selected
          </span>
        </div>
      </div>

      <ScrollArea className="h-[400px] rounded-md border">
        {getSortedLiterature().map(item => {
          const isSelected = selectedItems.some(selected => selected.id === item.id);
          const relevanceColor =
            item.relevanceScore >= 0.8
              ? 'bg-green-100 text-green-800'
              : item.relevanceScore >= 0.5
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-gray-100 text-gray-800';

          return (
            <div
              key={item.id}
              className={`p-4 border-b hover:bg-muted/40 ${isSelected ? 'bg-muted/60' : ''}`}
            >
              <div className="flex justify-between">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onSelectItem(item)}
                    id={`check-${item.id}`}
                  />
                  <div className="space-y-1">
                    <div className="font-medium">{item.title}</div>

                    <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(item.publicationDate).getFullYear() || 'N/A'}
                      </span>
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {item.journal || 'Unknown Journal'}
                      </span>
                      {item.journalImpactFactor && (
                        <span className="flex items-center gap-1">
                          <BarChart2 className="h-3 w-3" />
                          IF: {parseFloat(item.journalImpactFactor).toFixed(1)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {item.studyType || 'Study'}
                      </span>
                    </div>

                    {item.authors && (
                      <div className="text-sm text-muted-foreground truncate max-w-lg">
                        {item.authors.split(',').slice(0, 3).join(', ')}
                        {item.authors.split(',').length > 3 ? ', et al.' : ''}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="outline" className={relevanceColor}>
                        {Math.round(item.relevanceScore * 100)}% Relevant
                      </Badge>

                      {item.keyFindings && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline">Key Findings</Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <p>{item.keyFindings}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setOpenPaper(item)}>
                    <Eye className="h-4 w-4" />
                  </Button>

                  {item.doi && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(`https://doi.org/${item.doi}`, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );

  // Render visualization by year
  const renderChartView = () => (
    <Card>
      <CardHeader>
        <CardTitle>Literature Visualization</CardTitle>
        <CardDescription>
          Distribution of academic literature by year, relevance, and study type.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="byRelevance">
          <TabsList className="mb-4">
            <TabsTrigger value="byRelevance">By Relevance</TabsTrigger>
            <TabsTrigger value="byYear">By Year</TabsTrigger>
            <TabsTrigger value="byStudyType">By Study Type</TabsTrigger>
          </TabsList>

          <TabsContent value="byRelevance">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['high', 'medium', 'low'].map(relevance => {
                const papers = groupedData.byRelevance?.[relevance] || [];
                const title =
                  relevance === 'high'
                    ? 'Highly Relevant (80%+)'
                    : relevance === 'medium'
                      ? 'Moderately Relevant (50-79%)'
                      : 'Low Relevance (<50%)';

                return (
                  <Card
                    key={relevance}
                    className={
                      relevance === 'high'
                        ? 'border-green-300'
                        : relevance === 'medium'
                          ? 'border-yellow-300'
                          : 'border-gray-300'
                    }
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{title}</CardTitle>
                      <CardDescription>{papers.length} papers</CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <ScrollArea className="h-[200px]">
                        {papers.map(paper => (
                          <div key={paper.id} className="py-2 border-b last:border-b-0">
                            <div className="flex gap-3">
                              <Checkbox
                                checked={selectedItems.some(item => item.id === paper.id)}
                                onCheckedChange={() => onSelectItem(paper)}
                                id={`relevance-check-${paper.id}`}
                              />
                              <div>
                                <div className="font-medium text-sm">{paper.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(paper.publicationDate).getFullYear() || 'N/A'} -{' '}
                                  {paper.journal || 'Unknown'}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="byYear">
            <div className="space-y-4">
              {Object.keys(groupedData.byYear || {})
                .sort((a, b) => b - a) // Sort years in descending order (newest first)
                .map(year => {
                  const papers = groupedData.byYear[year];
                  return (
                    <Card key={year}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{year}</CardTitle>
                        <CardDescription>{papers.length} papers</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {papers.map(paper => (
                            <div
                              key={paper.id}
                              className="flex gap-3 items-start border rounded-md p-3"
                            >
                              <Checkbox
                                checked={selectedItems.some(item => item.id === paper.id)}
                                onCheckedChange={() => onSelectItem(paper)}
                                id={`year-check-${paper.id}`}
                              />
                              <div>
                                <div className="font-medium text-sm">{paper.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  {paper.journal || 'Unknown'} - Relevance:{' '}
                                  {Math.round(paper.relevanceScore * 100)}%
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </TabsContent>

          <TabsContent value="byStudyType">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(groupedData.byStudyType || {}).map(studyType => {
                const papers = groupedData.byStudyType[studyType];
                return (
                  <Card key={studyType}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{studyType}</CardTitle>
                      <CardDescription>{papers.length} papers</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[240px]">
                        {papers.map(paper => (
                          <div key={paper.id} className="py-2 border-b last:border-b-0">
                            <div className="flex gap-3">
                              <Checkbox
                                checked={selectedItems.some(item => item.id === paper.id)}
                                onCheckedChange={() => onSelectItem(paper)}
                                id={`type-check-${paper.id}`}
                              />
                              <div>
                                <div className="font-medium text-sm">{paper.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(paper.publicationDate).getFullYear() || 'N/A'} -
                                  Relevance: {Math.round(paper.relevanceScore * 100)}%
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );

  // Dialog for showing paper details
  const renderPaperDetailsDialog = () => (
    <Dialog open={openPaper !== null} onOpenChange={open => !open && setOpenPaper(null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{openPaper?.title}</DialogTitle>
          <DialogDescription>{openPaper?.authors}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {openPaper?.publicationDate &&
                new Date(openPaper.publicationDate).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" />
              {openPaper?.journal}
            </span>
            {openPaper?.doi && (
              <a
                href={`https://doi.org/${openPaper.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                DOI: {openPaper.doi}
              </a>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-1">Abstract</h3>
            <div className="text-sm border rounded-md p-3 bg-muted/20">
              {openPaper?.abstract || 'No abstract available'}
            </div>
          </div>

          {openPaper?.keyFindings && (
            <div>
              <h3 className="font-semibold mb-1">Key Findings</h3>
              <div className="text-sm border rounded-md p-3 bg-muted/20">
                {openPaper.keyFindings}
              </div>
            </div>
          )}

          {openPaper?.relevanceScore && (
            <div className="flex items-center gap-2">
              <span className="font-semibold">Relevance to your device:</span>
              <Badge
                variant="outline"
                className={
                  openPaper.relevanceScore >= 0.8
                    ? 'bg-green-100 text-green-800'
                    : openPaper.relevanceScore >= 0.5
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
                }
              >
                {Math.round(openPaper.relevanceScore * 100)}%
              </Badge>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => onSelectItem(openPaper)}
            variant={selectedItems.some(item => item.id === openPaper?.id) ? 'default' : 'outline'}
          >
            {selectedItems.some(item => item.id === openPaper?.id) ? (
              <>
                <Check className="mr-2 h-4 w-4" /> Selected
              </>
            ) : (
              <>
                <Bookmark className="mr-2 h-4 w-4" /> Select for 510(k)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Render evidence summary dialog
  const renderEvidenceSummaryDialog = () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={selectedItems.length === 0 || isGeneratingEvidenceSummary}
          onClick={
            selectedItems.length > 0 && !evidenceSummary ? generateEvidenceSummary : undefined
          }
        >
          {isGeneratingEvidenceSummary ? (
            <>Generating Summary...</>
          ) : (
            <>Generate Evidence Summary</>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Literature Evidence Summary</DialogTitle>
          <DialogDescription>
            Based on {selectedItems.length} selected academic papers
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {evidenceSummary ? (
            <div className="whitespace-pre-wrap">{evidenceSummary}</div>
          ) : (
            <div className="flex items-center justify-center p-8">
              <Button onClick={generateEvidenceSummary} disabled={isGeneratingEvidenceSummary}>
                {isGeneratingEvidenceSummary ? 'Generating...' : 'Generate Summary'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Supporting Academic Literature</CardTitle>
            <CardDescription>
              Select relevant academic literature to include in your 510(k) submission for enhanced
              evidence
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={visualizationMode === 'list' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setVisualizationMode('list')}
            >
              List View
            </Button>
            <Button
              variant={visualizationMode === 'chart' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setVisualizationMode('chart')}
            >
              Visualizations
            </Button>
            {renderEvidenceSummaryDialog()}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {literatureData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No literature results available. Complete predicate device search to find relevant
            academic literature.
          </div>
        ) : visualizationMode === 'list' ? (
          renderListView()
        ) : (
          renderChartView()
        )}
      </CardContent>
      <CardFooter className="justify-between border-t pt-4">
        <div className="text-sm text-muted-foreground">
          {selectedItems.length} items selected from {literatureData.length} academic references
        </div>
      </CardFooter>

      {renderPaperDetailsDialog()}
    </Card>
  );
};

export default LiteratureVisualizationPanel;
