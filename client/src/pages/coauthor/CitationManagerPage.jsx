import React, { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Search, Trash, Copy, BookOpen } from 'lucide-react';

/**
 * Citation Manager Page - Search, manage, and format publication citations
 */
const CitationManagerPage = () => {
  // PubMed search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCitations, setSelectedCitations] = useState([]);
  const [citationDetails, setCitationDetails] = useState({});
  const [searching, setSearching] = useState(false);
  const [citationFormat, setCitationFormat] = useState('vancouver'); // vancouver, apa, mla
  const [activeTab, setActiveTab] = useState('search');

  // Copy message state
  const [copyMessage, setCopyMessage] = useState('');

  // Search PubMed
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const response = await apiRequest('GET', `/api/citation/search?query=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Error searching publications:', error);
    } finally {
      setSearching(false);
    }
  };

  // Add citation to selected list
  const addCitation = citation => {
    if (!selectedCitations.some(c => c.pmid === citation.pmid)) {
      setSelectedCitations(prev => [...prev, citation]);
      fetchCitationDetails(citation.pmid);
    }
  };

  // Remove citation from selected list
  const removeCitation = pmid => {
    setSelectedCitations(prev => prev.filter(c => c.pmid !== pmid));
  };

  // Fetch detailed citation information
  const fetchCitationDetails = async pmid => {
    if (citationDetails[pmid]) return;

    try {
      const response = await apiRequest('GET', `/api/citation/details/${pmid}`);
      const data = await response.json();
      setCitationDetails(prev => ({
        ...prev,
        [pmid]: data,
      }));
    } catch (error) {
      console.error('Error fetching citation details:', error);
    }
  };

  // Format selected citations based on selected format
  const getFormattedCitations = () => {
    return selectedCitations.map(citation => {
      const details = citationDetails[citation.pmid];
      if (!details) return 'Loading citation...';

      switch (citationFormat) {
        case 'vancouver':
          return `${details.authors}. ${details.title}. ${details.journal}. ${details.year};${details.volume}(${details.issue}):${details.pages}. PMID: ${citation.pmid}.`;

        case 'apa':
          return `${details.authors} (${details.year}). ${details.title}. ${details.journal}, ${details.volume}(${details.issue}), ${details.pages}. https://doi.org/${details.doi || '[DOI not available]'}`;

        case 'mla':
          return `${details.authors}. "${details.title}." ${details.journal}, vol. ${details.volume}, no. ${details.issue}, ${details.year}, pp. ${details.pages}.`;

        default:
          return `${details.authors}. ${details.title}. ${details.journal}. ${details.year};${details.volume}(${details.issue}):${details.pages}.`;
      }
    });
  };

  // Copy formatted citations to clipboard
  const copyToClipboard = () => {
    const text = getFormattedCitations().join('\n\n');
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopyMessage('Citations copied to clipboard!');
        setTimeout(() => setCopyMessage(''), 3000);
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
        setCopyMessage('Failed to copy. Please try again.');
      });
  };

  // Move citation up in the list
  const moveCitationUp = index => {
    if (index <= 0) return;

    const newList = [...selectedCitations];
    const temp = newList[index];
    newList[index] = newList[index - 1];
    newList[index - 1] = temp;

    setSelectedCitations(newList);
  };

  // Move citation down in the list
  const moveCitationDown = index => {
    if (index >= selectedCitations.length - 1) return;

    const newList = [...selectedCitations];
    const temp = newList[index];
    newList[index] = newList[index + 1];
    newList[index + 1] = temp;

    setSelectedCitations(newList);
  };

  return (
    <div className="citation-manager-container p-4">
      <h1 className="text-2xl font-bold mb-6">Citation Manager</h1>

      <Tabs defaultValue="search" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="search">
            <Search className="h-4 w-4 mr-2" />
            Search Publications
          </TabsTrigger>
          <TabsTrigger value="bibliography">
            <BookOpen className="h-4 w-4 mr-2" />
            Bibliography
          </TabsTrigger>
        </TabsList>

        {/* Search Tab */}
        <TabsContent value="search">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Search PubMed</CardTitle>
                <CardDescription>Find publications to cite</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex">
                    <input
                      type="text"
                      className="w-full p-2 border rounded-l"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="e.g., clinical trial methodology"
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    />
                    <Button
                      onClick={handleSearch}
                      disabled={searching || !searchQuery.trim()}
                      className="rounded-l-none"
                    >
                      {searching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="border rounded overflow-auto max-h-96">
                    {searchResults.length > 0 ? (
                      <div className="divide-y">
                        {searchResults.map(result => (
                          <div key={result.pmid} className="p-3 hover:bg-slate-50">
                            <div className="flex justify-between">
                              <div>
                                <h3 className="font-medium">{result.title}</h3>
                                <div className="text-sm text-gray-500 mt-1">{result.authors}</div>
                                <div className="text-xs mt-1">
                                  <span className="font-medium">{result.journal}</span>
                                  {result.year && <span> ({result.year})</span>}
                                  <span className="ml-2">PMID: {result.pmid}</span>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => addCitation(result)}
                                disabled={selectedCitations.some(c => c.pmid === result.pmid)}
                              >
                                {selectedCitations.some(c => c.pmid === result.pmid)
                                  ? 'Added'
                                  : 'Add'}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : searching ? (
                      <div className="flex justify-center items-center h-24">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                      </div>
                    ) : (
                      <div className="p-4 text-center text-gray-500">
                        {searchQuery
                          ? 'No results found. Try different keywords.'
                          : 'Enter keywords to search for publications'}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Selected Citations</CardTitle>
                <CardDescription>Citations you've added to your bibliography</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded overflow-auto max-h-96">
                  {selectedCitations.length > 0 ? (
                    <div className="divide-y">
                      {selectedCitations.map((citation, index) => (
                        <div key={citation.pmid} className="p-3">
                          <div className="flex justify-between">
                            <div className="flex-grow pr-2">
                              <div className="flex items-start">
                                <span className="bg-gray-100 text-gray-700 rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2 flex-shrink-0 mt-0.5">
                                  {index + 1}
                                </span>
                                <div>
                                  <h3 className="font-medium">{citation.title}</h3>
                                  <div className="text-xs text-gray-500 mt-1">
                                    PMID: {citation.pmid}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-start space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => removeCitation(citation.pmid)}
                              >
                                <Trash className="h-3 w-3" />
                                <span className="sr-only">Remove</span>
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-gray-500">
                      No citations selected. Add publications from search results.
                    </div>
                  )}
                </div>

                {selectedCitations.length > 0 && (
                  <div className="mt-4 flex justify-end">
                    <Button onClick={() => setActiveTab('bibliography')}>View Bibliography</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Bibliography Tab */}
        <TabsContent value="bibliography">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Citation Order</CardTitle>
                  <CardDescription>Arrange your bibliography</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border rounded overflow-auto max-h-96">
                      {selectedCitations.length > 0 ? (
                        <div className="divide-y">
                          {selectedCitations.map((citation, index) => (
                            <div key={citation.pmid} className="p-3">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center">
                                  <span className="bg-gray-100 text-gray-700 rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2">
                                    {index + 1}
                                  </span>
                                  <div className="truncate">
                                    <span className="font-medium">{citation.title}</span>
                                  </div>
                                </div>
                                <div className="flex space-x-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => moveCitationUp(index)}
                                    disabled={index === 0}
                                  >
                                    <span className="sr-only">Move up</span>↑
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => moveCitationDown(index)}
                                    disabled={index === selectedCitations.length - 1}
                                  >
                                    <span className="sr-only">Move down</span>↓
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => removeCitation(citation.pmid)}
                                  >
                                    <Trash className="h-3 w-3" />
                                    <span className="sr-only">Remove</span>
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-gray-500">
                          No citations selected. Add publications from search.
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block mb-1 font-medium">Citation Format</label>
                      <select
                        className="w-full p-2 border rounded"
                        value={citationFormat}
                        onChange={e => setCitationFormat(e.target.value)}
                      >
                        <option value="vancouver">Vancouver</option>
                        <option value="apa">APA</option>
                        <option value="mla">MLA</option>
                      </select>
                    </div>

                    <div className="pt-4 flex justify-between items-center">
                      <Button variant="outline" onClick={() => setActiveTab('search')}>
                        Back to Search
                      </Button>
                      {selectedCitations.length > 0 && (
                        <Button onClick={copyToClipboard} className="flex items-center">
                          <Copy className="h-4 w-4 mr-2" />
                          Copy All
                        </Button>
                      )}
                    </div>

                    {copyMessage && (
                      <div className="mt-2 p-2 text-center text-sm bg-green-100 text-green-800 rounded">
                        {copyMessage}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Formatted Bibliography</CardTitle>
                  <CardDescription>
                    {citationFormat === 'vancouver'
                      ? 'Vancouver Style'
                      : citationFormat === 'apa'
                        ? 'APA Style'
                        : 'MLA Style'}
                    ({selectedCitations.length}{' '}
                    {selectedCitations.length === 1 ? 'citation' : 'citations'})
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded p-4 bg-white overflow-auto max-h-96">
                    {selectedCitations.length > 0 ? (
                      <ol className="list-decimal pl-5 space-y-4">
                        {getFormattedCitations().map((citation, index) => (
                          <li key={index} className="pl-1">
                            <div className="prose prose-sm max-w-none">{citation}</div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="text-center text-gray-500">
                        <p>Your bibliography will appear here</p>
                        <p className="text-sm mt-1">Add publications from the search tab</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CitationManagerPage;
