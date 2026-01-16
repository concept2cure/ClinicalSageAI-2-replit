import React, { useState, useEffect, useRef } from 'react';
import { searchPubMed, searchLiterature, generateCitations, summarizePaper, generateLiteratureReview, analyzePaperPDF, } from '@/services/LiteratureAPIService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import {
  AlertCircle, BookOpen, BookOpenCheck, BookmarkCheck, Check, Download, FileCheck, FileText, FileUp, Loader2, Plus, Search, Sparkles, Upload, Zap } from 'lucide-react'

/**
 * Literature Search Panel Component for CER Generator
 *
 * Provides functionality to search PubMed and Google Scholar for literature related to a medical device,
 * select relevant papers, generate summaries, and create citations for integration into the CER.
 */
const LiteratureSearchPanel = ({ cerTitle, onAddToCER, deviceName = '', manufacturer = '' }) => {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  // Search state
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    yearFrom: new Date().getFullYear() - 10, // Default to last 10 years for medical devices
    yearTo: new Date().getFullYear(),
    journalType: '',
    relevanceFilter: 'high', // high, medium, all
  });
  const [searchSources, setSearchSources] = useState(['pubmed', 'googleScholar', 'clinicalTrials']);
  const [activeTab, setActiveTab] = useState('search'); // search, upload, review, generate

  // Results and selection state
  const [results, setResults] = useState([]);
  const [selectedPapers, setSelectedPapers] = useState([]);
  const [citations, setCitations] = useState('');
  const [generatedReview, setGeneratedReview] = useState(null);
  const [reviewOptions, setReviewOptions] = useState({
    format: 'comprehensive', // comprehensive, concise
    citationStyle: 'vancouverStyle',
    includeEvidenceGrading: true,
    conformToMeddev: true,
    standard: 'MEDDEV 2.7/1 Rev 4',
  });

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [generatingReview, setGeneratingReview] = useState(false);

  // UI states
  const [error, setError] = useState(null);
  const [searchMetadata, setSearchMetadata] = useState(null);
  const [paperSummaries, setPaperSummaries] = useState({});
  const [activePaper, setActivePaper] = useState(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  // Default to using the CER title as the query if no query is entered
  const effectiveQuery = query || cerTitle;

  // Auto-suggest a search query based on the CER title when component loads
  useEffect(() => {
    if (cerTitle && !query) {
      // Extract device/product name from title if it follows a pattern like "Clinical Evaluation Report: Device Name"
      const titleParts = cerTitle.split(':');
      if (titleParts.length > 1) {
        const deviceName = titleParts[1].trim();
        setQuery(deviceName);
      }
    }
  }, [cerTitle]);

  // Handle source selection toggle
  const toggleSource = source => {
    if (searchSources.includes(source)) {
      // Don't allow deselecting all sources
      if (searchSources.length > 1) {
        setSearchSources(searchSources.filter(s => s !== source));
      }
    } else {
      setSearchSources([...searchSources, source]);
    }
  };

  // Get summary for a paper
  const getSummary = async paper => {
    // If we already have the summary, no need to fetch again
    if (paperSummaries[paper.id]) {
      setActivePaper(paper.id);
      return;
    }

    try {
      setSummaryLoading(true);
      setActivePaper(paper.id);

      const data = await summarizePaper({
        text: paper.abstract,
        context: cerTitle || 'Clinical Evaluation Report',
      });

      setPaperSummaries(prev => ({
        ...prev,
        [paper.id]: data.summary,
      }));
    } catch (err) {
      console.error('Paper summarization failed:', err);
      setPaperSummaries(prev => ({
        ...prev,
        [paper.id]: 'Error generating summary. Please try again.',
      }));
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSearch = async e => {
    e.preventDefault();

    if (!effectiveQuery) {
      setError('Please enter a search query or specify a CER title');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setResults([]);
      setPaperSummaries({});
      setActivePaper(null);
      setSearchMetadata(null);

      const data = await searchLiterature({
        query: effectiveQuery,
        filters,
        sources: searchSources,
        limit: 20,
      });

      setResults(data.results || []);
      setSearchMetadata(data.metadata || null);

      if (data.results?.length === 0) {
        setError('No results found. Try broadening your search.');
      }
    } catch (err) {
      setError(`Search failed: ${err.message}`);
      console.error('Literature search failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPaper = paper => {
    // Check if already selected
    if (selectedPapers.some(p => p.id === paper.id)) {
      setSelectedPapers(selectedPapers.filter(p => p.id !== paper.id));
    } else {
      setSelectedPapers([...selectedPapers, paper]);
    }
  };

  const handleGenerateCitations = async () => {
    if (selectedPapers.length === 0) {
      setError('Please select at least one paper');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const data = await generateCitations({
        papers: selectedPapers,
        format: 'vancouverStyle',
      });

      setCitations(data.citations || '');
    } catch (err) {
      setError(`Citation generation failed: ${err.message}`);
      console.error('Citation generation failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Generate a literature review and add it to the CER
  const handleAddToCER = () => {
    if (!citations) {
      setError('Please generate citations first');
      return;
    }

    // Format the literature section with selected papers and citations using AI summaries when available
    const literatureSection = {
      type: 'Literature Review',
      content: `
## Literature Review

${selectedPapers
  .map(paper => {
    const summary = paperSummaries[paper.id] || paper.abstract;
    return `### ${paper.title}
${paper.authors.join(', ')}
${paper.journal}, ${paper.publicationDate}

${summary}
`;
  })
  .join('\n\n')}

## References

${citations}
`,
    };

    onAddToCER(literatureSection);
  };

  // Handle file upload
  const handleFileUpload = async e => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if file is PDF
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      toast({
        title: 'Invalid File Type',
        description: 'Only PDF files are supported',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUploadLoading(true);
      setError(null);

      // Use the analyzePaperPDF function to extract data
      const data = await analyzePaperPDF({
        file,
        context: {
          cerTitle,
          deviceName: deviceName || cerTitle,
          standard: 'MEDDEV 2.7/1 Rev 4',
        },
      });

      // Create a paper object from the PDF data
      const paperObj = {
        id: `pdf-${Date.now()}`,
        title: data.title || 'Uploaded PDF',
        authors: data.authors || ['Unknown Author'],
        journal: data.journal || 'Unknown Source',
        publicationDate: data.publicationDate || new Date().getFullYear().toString(),
        abstract: data.abstract || '',
        fullText: data.fullText || '',
        source: 'PDF Upload',
        url: '#',
      };

      // Add to results and select it
      setResults(prev => [paperObj, ...prev]);
      setSelectedPapers(prev => [...prev, paperObj]);
      setActivePaper(paperObj.id);

      // Add summary
      setPaperSummaries(prev => ({
        ...prev,
        [paperObj.id]: data.summary || 'No summary available.',
      }));

      toast({
        title: 'PDF Successfully Analyzed',
        description: `Extracted ${data.title || 'document'} data and created summary`,
      });

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('PDF analysis failed:', err);
      setError(`Failed to analyze PDF: ${err.message}`);
      toast({
        title: 'PDF Analysis Failed',
        description: err.message || 'Please try another file',
        variant: 'destructive',
      });
    } finally {
      setUploadLoading(false);
    }
  };

  // Generate MEDDEV 2.7/1 Rev 4 compliant literature review
  const handleGenerateMeddevReview = async () => {
    if (selectedPapers.length === 0) {
      setError('Please select at least one paper');
      toast({
        title: 'No Papers Selected',
        description: 'Select at least one paper to generate a review',
        variant: 'destructive',
      });
      return;
    }

    try {
      setGeneratingReview(true);
      setError(null);

      // Prepare papers with summaries
      const papersWithSummaries = selectedPapers.map(paper => ({
        ...paper,
        summary: paperSummaries[paper.id] || paper.abstract,
      }));

      // Generate MEDDEV 2.7/1 Rev 4 compliant literature review
      const data = await generateLiteratureReview({
        papers: papersWithSummaries,
        context: {
          cerTitle,
          deviceName: deviceName || cerTitle?.split(':')[1]?.trim() || 'Medical Device',
          manufacturer: manufacturer || 'Device Manufacturer',
          standard: reviewOptions.standard,
        },
        options: reviewOptions,
      });

      setGeneratedReview(data.review);
      setCitations(data.citations || '');
      setShowReviewDialog(true);

      toast({
        title: 'Literature Review Generated',
        description: `MEDDEV 2.7/1 Rev 4 compliant review created with ${selectedPapers.length} references`,
      });
    } catch (err) {
      console.error('Literature review generation failed:', err);
      setError(`Review generation failed: ${err.message}`);
      toast({
        title: 'Review Generation Failed',
        description: err.message || 'Please try again with different papers',
        variant: 'destructive',
      });
    } finally {
      setGeneratingReview(false);
    }
  };

  // Add generated MEDDEV-compliant review to CER
  const addGeneratedReviewToCER = () => {
    if (!generatedReview) return;

    const literatureSection = {
      type: 'Literature Review',
      content: generatedReview,
      metadata: {
        standard: reviewOptions.standard,
        paperCount: selectedPapers.length,
        generatedAt: new Date().toISOString(),
      },
    };

    onAddToCER(literatureSection);
    setShowReviewDialog(false);

    toast({
      title: 'Added to CER',
      description: 'MEDDEV-compliant literature review added to your report',
    });
  };

  return (
    <div className="space-y-6 p-4 border rounded-md bg-white">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Proxima CRO Literature AI</h2>
          <p className="text-sm text-gray-500">
            Generate MEDDEV 2.7/1 Rev 4 compliant literature reviews for your Clinical Evaluation
            Report
          </p>
        </div>
        <Badge variant="outline" className="px-2 py-1 border-blue-200 bg-blue-50 text-blue-700">
          MEDDEV 2.7/1 Rev 4
        </Badge>
      </div>

      <Tabs defaultValue="search" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="search" className="flex items-center gap-1">
            <Search className="h-4 w-4" /> Search Literature
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center gap-1">
            <Upload className="h-4 w-4" /> Upload Papers
          </TabsTrigger>
          <TabsTrigger value="review" className="flex items-center gap-1">
            <FileCheck className="h-4 w-4" /> Generate Review
          </TabsTrigger>
        </TabsList>

      {error && (
        <div className="p-3 text-sm bg-red-50 border border-red-200 text-red-600 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSearch} className="space-y-5 p-4 border rounded-lg bg-gray-50">
        <div>
          <label className="block text-sm font-medium mb-1">Search Query</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={cerTitle || 'Enter search terms'}
              className="flex-1 p-2 border rounded"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Search
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Search Sources</label>
            <div className="flex gap-2">
              <Badge
                onClick={() => toggleSource('pubmed')}
                className={`cursor-pointer ${searchSources.includes('pubmed') ? 'bg-blue-600' : 'bg-gray-200 text-gray-800'}`}
              >
                PubMed
              </Badge>
              <Badge
                onClick={() => toggleSource('googleScholar')}
                className={`cursor-pointer ${searchSources.includes('googleScholar') ? 'bg-blue-600' : 'bg-gray-200 text-gray-800'}`}
              >
                Google Scholar
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 w-full">
            <div>
              <label className="block text-sm font-medium mb-1">Year From</label>
              <input
                type="number"
                value={filters.yearFrom}
                onChange={e => setFilters({ ...filters, yearFrom: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Year To</label>
              <input
                type="number"
                value={filters.yearTo}
                onChange={e => setFilters({ ...filters, yearTo: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Journal Type</label>
              <select
                value={filters.journalType}
                onChange={e => setFilters({ ...filters, journalType: e.target.value })}
                className="w-full p-2 border rounded"
              >
                <option value="">All Journal Types</option>
                <option value="Clinical Trial">Clinical Trial</option>
                <option value="Review">Review</option>
                <option value="Meta-Analysis">Meta-Analysis</option>
                <option value="Randomized Controlled Trial">RCT</option>
                <option value="Case Report">Case Report</option>
              </select>
            </div>
          </div>
        </div>
      </form>

      {searchMetadata && (
        <div className="text-sm text-gray-500 flex flex-wrap gap-3">
          <span>Total results: {searchMetadata.totalResults || 0}</span>
          {searchMetadata.pubmedCount > 0 && <span>PubMed: {searchMetadata.pubmedCount}</span>}
          {searchMetadata.scholarCount > 0 && (
            <span>Google Scholar: {searchMetadata.scholarCount}</span>
          )}
          {searchMetadata.duplicatesRemoved > 0 && (
            <span>Duplicates removed: {searchMetadata.duplicatesRemoved}</span>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Search Results ({results.length})</h3>
            <div className="border rounded max-h-[600px] overflow-y-auto">
              {results.map(paper => (
                <div
                  key={paper.id}
                  className={`p-4 border-b hover:bg-gray-50 cursor-pointer ${
                    selectedPapers.some(p => p.id === paper.id) ? 'bg-blue-50' : ''
                  } ${activePaper === paper.id ? 'ring-2 ring-blue-500' : ''}`}
                  onClick={() => getSummary(paper)}
                >
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-medium text-blue-800">{paper.title}</h4>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleSelectPaper(paper);
                      }}
                      className={`shrink-0 p-1 rounded ${
                        selectedPapers.some(p => p.id === paper.id)
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : 'bg-gray-100 text-gray-800 border border-gray-300'
                      }`}
                    >
                      {selectedPapers.some(p => p.id === paper.id) ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-600">
                    <Badge
                      variant="outline"
                      className={`${paper.source === 'PubMed' ? 'border-blue-300 bg-blue-50' : 'border-emerald-300 bg-emerald-50'}`}
                    >
                      {paper.source}
                    </Badge>

                    <span>{paper.journal}</span>
                    <span>·</span>
                    <span>{paper.publicationDate}</span>

                    {paper.citationCount && (
                      <>
                        <span>·</span>
                        <span>Citations: {paper.citationCount}</span>
                      </>
                    )}
                  </div>

                  <p className="text-xs text-gray-800 mt-2 line-clamp-2">
                    {paper.authors.slice(0, 3).join(', ')}
                    {paper.authors.length > 3 ? ` and ${paper.authors.length - 3} more` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            {activePaper ? (
              <div className="border rounded p-4 h-full">
                <h3 className="text-lg font-semibold">
                  Paper Summary
                  {summaryLoading && <Loader2 className="ml-2 h-4 w-4 inline animate-spin" />}
                </h3>

                {activePaper && results.find(p => p.id === activePaper) && (
                  <div className="mt-2">
                    <h4 className="font-medium text-blue-800">
                      {results.find(p => p.id === activePaper)?.title}
                    </h4>

                    <div className="mt-4 space-y-4">
                      {paperSummaries[activePaper] ? (
                        <div className="prose prose-sm max-w-none">
                          <h5 className="text-sm font-medium">AI Summary</h5>
                          <p className="whitespace-pre-line text-sm">
                            {paperSummaries[activePaper]}
                          </p>
                        </div>
                      ) : summaryLoading ? (
                        <div className="flex items-center justify-center p-8">
                          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        </div>
                      ) : (
                        <div className="prose prose-sm max-w-none">
                          <h5 className="text-sm font-medium">Abstract</h5>
                          <p className="text-sm">
                            {results.find(p => p.id === activePaper)?.abstract ||
                              'No abstract available'}
                          </p>
                        </div>
                      )}

                      <div className="pt-4 border-t flex justify-between">
                        <a
                          href={results.find(p => p.id === activePaper)?.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 text-sm hover:underline flex items-center gap-1"
                          onClick={e => e.stopPropagation()}
                        >
                          <BookOpen className="h-4 w-4" />
                          View Full Paper
                        </a>

                        <button
                          onClick={e => {
                            e.stopPropagation();
                            const paper = results.find(p => p.id === activePaper);
                            if (paper) handleSelectPaper(paper);
                          }}
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {selectedPapers.some(p => p.id === activePaper) ? (
                            <>
                              <Check className="h-4 w-4" />
                              Selected
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4" />
                              Select for CER
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="border rounded p-6 h-full flex flex-col items-center justify-center text-center text-gray-500">
                <FileText className="h-12 w-12 mb-4 text-gray-400" />
                <p>Select a paper to view its AI-generated summary</p>
                <p className="text-sm mt-2">
                  Summaries are tailored for your Clinical Evaluation Report
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <TabsContent value="search" className="mt-4">
        {/* Existing search results display logic */}
        {results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Search Results ({results.length})</h3>
              <div className="border rounded max-h-[600px] overflow-y-auto">
                {results.map(paper => (
                  <div
                    key={paper.id}
                    className={`p-4 border-b hover:bg-gray-50 cursor-pointer ${
                      selectedPapers.some(p => p.id === paper.id) ? 'bg-blue-50' : ''
                    } ${activePaper === paper.id ? 'ring-2 ring-blue-500' : ''}`}
                    onClick={() => getSummary(paper)}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="font-medium text-blue-800">{paper.title}</h4>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleSelectPaper(paper);
                        }}
                        className={`shrink-0 p-1 rounded ${
                          selectedPapers.some(p => p.id === paper.id)
                            ? 'bg-green-100 text-green-800 border border-green-300'
                            : 'bg-gray-100 text-gray-800 border border-gray-300'
                        }`}
                      >
                        {selectedPapers.some(p => p.id === paper.id) ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-600">
                      <Badge
                        variant="outline"
                        className={`${paper.source === 'PubMed' ? 'border-blue-300 bg-blue-50' : paper.source === 'PDF Upload' ? 'border-purple-300 bg-purple-50' : 'border-emerald-300 bg-emerald-50'}`}
                      >
                        {paper.source}
                      </Badge>

                      <span>{paper.journal}</span>
                      <span>·</span>
                      <span>{paper.publicationDate}</span>

                      {paper.citationCount && (
                        <>
                          <span>·</span>
                          <span>Citations: {paper.citationCount}</span>
                        </>
                      )}
                    </div>

                    <p className="text-xs text-gray-800 mt-2 line-clamp-2">
                      {paper.authors.slice(0, 3).join(', ')}
                      {paper.authors.length > 3 ? ` and ${paper.authors.length - 3} more` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              {activePaper ? (
                <div className="border rounded p-4 h-full">
                  <h3 className="text-lg font-semibold">
                    Paper Summary
                    {summaryLoading && <Loader2 className="ml-2 h-4 w-4 inline animate-spin" />}
                  </h3>

                  {activePaper && results.find(p => p.id === activePaper) && (
                    <div className="mt-2">
                      <h4 className="font-medium text-blue-800">
                        {results.find(p => p.id === activePaper)?.title}
                      </h4>

                      <div className="mt-4 space-y-4">
                        {paperSummaries[activePaper] ? (
                          <div className="prose prose-sm max-w-none">
                            <h5 className="text-sm font-medium">AI Summary</h5>
                            <p className="whitespace-pre-line text-sm">
                              {paperSummaries[activePaper]}
                            </p>
                          </div>
                        ) : summaryLoading ? (
                          <div className="flex items-center justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                          </div>
                        ) : (
                          <div className="prose prose-sm max-w-none">
                            <h5 className="text-sm font-medium">Abstract</h5>
                            <p className="text-sm">
                              {results.find(p => p.id === activePaper)?.abstract ||
                                'No abstract available'}
                            </p>
                          </div>
                        )}

                        <div className="pt-4 border-t flex justify-between">
                          <a
                            href={results.find(p => p.id === activePaper)?.url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 text-sm hover:underline flex items-center gap-1"
                            onClick={e => e.stopPropagation()}
                          >
                            <BookOpen className="h-4 w-4" />
                            View Full Paper
                          </a>

                          <button
                            onClick={e => {
                              e.stopPropagation();
                              const paper = results.find(p => p.id === activePaper);
                              if (paper) handleSelectPaper(paper);
                            }}
                            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {selectedPapers.some(p => p.id === activePaper) ? (
                              <>
                                <Check className="h-4 w-4" />
                                Selected
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4" />
                                Select for CER
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border rounded p-6 h-full flex flex-col items-center justify-center text-center text-gray-500">
                  <FileText className="h-12 w-12 mb-4 text-gray-400" />
                  <p>Select a paper to view its AI-generated summary</p>
                  <p className="text-sm mt-2">
                    Summaries are tailored for your Clinical Evaluation Report
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="upload" className="mt-4">
        <div className="p-6 border rounded bg-gray-50">
          <div className="text-center mb-8">
            <Upload className="h-12 w-12 mx-auto mb-3 text-blue-500" />
            <h3 className="text-lg font-semibold">Upload Research Papers</h3>
            <p className="text-sm text-gray-600 max-w-md mx-auto mt-1">
              Upload PDF papers or research articles to analyze and include in your MEDDEV 2.7/1 Rev
              4 compliant literature review
            </p>
          </div>

          <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-12 bg-white">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".pdf"
              onChange={handleFileUpload}
              ref={fileInputRef}
              disabled={uploadLoading}
            />

            {uploadLoading ? (
              <div className="flex flex-col items-center">
                <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-4" />
                <p className="text-sm text-gray-600">Analyzing PDF content...</p>
                <p className="text-xs text-gray-500 mt-1">This may take a moment</p>
              </div>
            ) : (
              <>
                <FileUp className="h-10 w-10 text-gray-400 mb-4" />
                <p className="text-sm text-gray-600">Drag & drop PDFs here or</p>
                <label
                  htmlFor="file-upload"
                  className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 cursor-pointer"
                >
                  Browse Files
                </label>
                <p className="text-xs text-gray-500 mt-6">Supported formats: PDF</p>
              </>
            )}
          </div>

          <div className="mt-6 text-sm text-gray-600">
            <p className="flex items-center">
              <BookOpenCheck className="h-4 w-4 text-green-600 mr-2" />
              AI analyzes PDFs and automatically extracts key information
            </p>
            <p className="flex items-center mt-2">
              <BookmarkCheck className="h-4 w-4 text-green-600 mr-2" />
              Creates MEDDEV 2.7/1 Rev 4 compliant literature reviews
            </p>
            <p className="flex items-center mt-2">
              <Zap className="h-4 w-4 text-green-600 mr-2" />
              Built-in relevance scoring and evidence grading
            </p>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="review" className="mt-4">
        <div className="p-6 border rounded bg-gray-50">
          <div className="mb-6">
            <h3 className="text-lg font-semibold">Generate MEDDEV Compliant Literature Review</h3>
            <p className="text-sm text-gray-600 mt-1">
              Create a comprehensive literature review that meets MEDDEV 2.7/1 Rev 4 regulatory
              requirements
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-4 p-4 border rounded bg-white">
              <h4 className="font-medium text-gray-800">Review Options</h4>

              <div>
                <Label htmlFor="format" className="text-sm font-medium">
                  Review Format
                </Label>
                <select
                  id="format"
                  value={reviewOptions.format}
                  onChange={e => setReviewOptions({ ...reviewOptions, format: e.target.value })}
                  className="w-full p-2 mt-1 border rounded text-sm"
                >
                  <option value="comprehensive">Comprehensive (Detailed analysis)</option>
                  <option value="concise">Concise (Summary format)</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="evidence-grading"
                  checked={reviewOptions.includeEvidenceGrading}
                  onChange={e =>
                    setReviewOptions({ ...reviewOptions, includeEvidenceGrading: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="evidence-grading" className="text-sm cursor-pointer">
                  Include evidence grading
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="conform-meddev"
                  checked={reviewOptions.conformToMeddev}
                  onChange={e =>
                    setReviewOptions({ ...reviewOptions, conformToMeddev: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="conform-meddev" className="text-sm cursor-pointer">
                  Conform to MEDDEV 2.7/1 Rev 4
                </Label>
              </div>
            </div>

            <div className="space-y-4 p-4 border rounded bg-white">
              <h4 className="font-medium text-gray-800">Selected Literature</h4>
              <p className="text-sm text-gray-600">
                {selectedPapers.length === 0
                  ? 'No papers selected yet. Search or upload papers to include them in your review.'
                  : `${selectedPapers.length} papers selected for inclusion in your literature review.`}
              </p>

              {selectedPapers.length > 0 && (
                <div className="mt-2">
                  <Badge className="bg-blue-100 text-blue-800 border border-blue-200">
                    {selectedPapers.filter(p => p.source === 'PubMed').length} PubMed
                  </Badge>
                  <Badge className="bg-green-100 text-green-800 border border-green-200 ml-2">
                    {selectedPapers.filter(p => p.source === 'Google Scholar').length} Google
                    Scholar
                  </Badge>
                  <Badge className="bg-purple-100 text-purple-800 border border-purple-200 ml-2">
                    {selectedPapers.filter(p => p.source === 'PDF Upload').length} Uploaded PDFs
                  </Badge>
                </div>
              )}

              <div className="pt-4 border-t border-gray-100">
                <Button
                  onClick={handleGenerateMeddevReview}
                  disabled={selectedPapers.length === 0 || generatingReview}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {generatingReview ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating Review...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate MEDDEV-Compliant Review
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {selectedPapers.length > 0 && (
            <div className="p-4 border rounded bg-white">
              <h4 className="font-medium text-gray-800 mb-3">
                Selected Papers ({selectedPapers.length})
              </h4>
              <div className="max-h-[250px] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {selectedPapers.map(paper => (
                    <div key={paper.id} className="border border-gray-200 rounded p-3 text-sm">
                      <div className="flex justify-between items-start">
                        <h5 className="font-medium line-clamp-2 text-blue-700">{paper.title}</h5>
                        <button
                          onClick={() => handleSelectPaper(paper)}
                          className="text-red-500 hover:text-red-700 text-xs flex-shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-1">
                        {paper.authors.join(', ')}
                      </p>
                      <p className="text-xs mt-1 flex items-center">
                        <Badge variant="outline" className="mr-1 text-[10px] px-1 py-0">
                          {paper.source}
                        </Badge>
                        {paper.journal}, {paper.publicationDate}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>MEDDEV 2.7/1 Rev 4 Compliant Literature Review</DialogTitle>
            <DialogDescription>
              Review and add this literature analysis to your Clinical Evaluation Report
            </DialogDescription>
          </DialogHeader>

          {generatedReview ? (
            <div className="mt-2 space-y-4">
              <div className="p-4 border rounded bg-gray-50 whitespace-pre-line">
                {generatedReview}
              </div>

              <div className="flex justify-end space-x-3">
                <Button variant="outline" onClick={() => setShowReviewDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={addGeneratedReviewToCER}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Add to CER
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-4" />
              <p className="text-gray-600">Generating MEDDEV-compliant review...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selectedPapers.length > 0 && activeTab === 'search' && (
        <div className="mt-4 p-4 border rounded-lg bg-gray-50">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Selected Papers ({selectedPapers.length})</h3>
            <div className="flex gap-2">
              <button
                onClick={handleGenerateCitations}
                disabled={isLoading}
                className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>Generate Citations</>
                )}
              </button>

              <button
                onClick={() => setActiveTab('review')}
                className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Create MEDDEV Review
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {selectedPapers.map(paper => (
              <div key={paper.id} className="border bg-white rounded p-3 text-sm">
                <div className="flex justify-between items-start">
                  <h4 className="font-medium line-clamp-2">{paper.title}</h4>
                  <button
                    onClick={() => handleSelectPaper(paper)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Remove
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1 line-clamp-1">
                  {paper.authors.join(', ')}
                </p>
                <p className="text-xs mt-1">
                  {paper.journal}, {paper.publicationDate}
                </p>
              </div>
            ))}
          </div>

          {citations && (
            <div className="mt-6 p-4 border rounded bg-white">
              <h4 className="font-medium mb-3">Generated Citations</h4>
              <div className="text-sm whitespace-pre-line border-l-4 border-gray-200 pl-4 py-2">
                {citations}
              </div>
              <button
                onClick={handleAddToCER}
                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Add Literature Review to CER
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LiteratureSearchPanel;
