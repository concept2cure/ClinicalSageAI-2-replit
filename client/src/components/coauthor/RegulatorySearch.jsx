import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, BookOpen, FileText, Bookmark, ExternalLink } from 'lucide-react'

// Mock regulatory search results
const mockResults = {
  2.7: [
    {
      title:
        'ICH M4E(R2) - Common Technical Document for the Registration of Pharmaceuticals for Human Use - Efficacy',
      snippet: 'Section 2.7 should provide a detailed summary of all clinical studies conducted...',
      source: 'ICH Guidelines',
      relevance: 'high',
      url: '#',
    },
    {
      title: 'FDA Guidance: Clinical Study Reports',
      snippet:
        'When preparing Section 2.7, sponsors should ensure that all clinical efficacy and safety data are presented in a balanced manner...',
      source: 'FDA Guidance Documents',
      relevance: 'medium',
      url: '#',
    },
  ],
  3.2: [
    {
      title: 'ICH M4Q(R1) - CTD Quality Guidelines',
      snippet:
        'Section 3.2 should contain detailed information on the product manufacturing process...',
      source: 'ICH Guidelines',
      relevance: 'high',
      url: '#',
    },
    {
      title: 'FDA Guidance: Quality Considerations in Demonstrating Bioequivalence',
      snippet:
        'The Quality section should include comprehensive information on analytical procedures used...',
      source: 'FDA Guidance Documents',
      relevance: 'medium',
      url: '#',
    },
  ],
};

// Default results for sections without specific mock data
const defaultResults = [
  {
    title:
      'ICH M4 - Organization of the Common Technical Document for the Registration of Pharmaceuticals for Human Use',
    snippet:
      'This guideline describes the recommended format and organization for the Common Technical Document (CTD)...',
    source: 'ICH Guidelines',
    relevance: 'medium',
    url: '#',
  },
  {
    title: 'FDA Guidance: Submitting Marketing Applications According to the ICH-CTD Format',
    snippet:
      'This guidance document provides recommendations for preparing and submitting applications in the CTD format...',
    source: 'FDA Guidance Documents',
    relevance: 'medium',
    url: '#',
  },
];

export default function RegulatorySearch({ sectionId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = () => {
    setIsSearching(true);

    // Simulate API delay
    setTimeout(() => {
      // Get section-specific results or default results
      const sectionResults = mockResults[sectionId] || defaultResults;

      // Filter results based on query if provided
      const filteredResults = query.trim()
        ? sectionResults.filter(
            r =>
              r.title.toLowerCase().includes(query.toLowerCase()) ||
              r.snippet.toLowerCase().includes(query.toLowerCase())
          )
        : sectionResults;

      setResults(filteredResults);
      setIsSearching(false);
      setHasSearched(true);
    }, 800);
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center">
          <BookOpen className="h-4 w-4 mr-2" />
          Regulatory Guidance Search
        </CardTitle>
        <CardDescription>Find applicable regulations for Section {sectionId}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex space-x-2">
          <Input
            placeholder="Search regulatory requirements..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button size="sm" onClick={handleSearch} disabled={isSearching}>
            {isSearching ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {!hasSearched && !isSearching && (
          <p className="text-sm text-center text-muted-foreground py-2">
            Search for regulations relevant to Section {sectionId}
          </p>
        )}

        {hasSearched && results.length === 0 && (
          <p className="text-sm text-center text-muted-foreground py-2">
            No results found. Try a different search term.
          </p>
        )}

        <div className="space-y-3">
          {results.map((result, index) => (
            <div key={index} className="border rounded-md p-3 text-sm space-y-2">
              <div className="flex justify-between items-start">
                <h4 className="font-medium">{result.title}</h4>
                <Badge variant={result.relevance === 'high' ? 'default' : 'outline'}>
                  {result.relevance === 'high' ? 'High Relevance' : 'Medium Relevance'}
                </Badge>
              </div>
              <p className="text-muted-foreground">{result.snippet}</p>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground flex items-center">
                  <FileText className="h-3 w-3 mr-1" /> {result.source}
                </span>
                <div className="flex space-x-2">
                  <Button variant="ghost" size="sm" className="h-6 px-2">
                    <Bookmark className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 px-2">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
