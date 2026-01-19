import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, BookOpen, FileText, Bookmark, ExternalLink } from 'lucide-react'
import { searchCoauthorComponents } from '@/api/coauthor';

export default function RegulatorySearch({ sectionId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    setIsSearching(true);
    const searchQuery = query.trim() || `Section ${sectionId}`;

    try {
      const payload = await searchCoauthorComponents(searchQuery, { limit: 8, searchIn: 'all' });
      const items = Array.isArray(payload?.results) ? payload.results : [];
      const normalized = items.map(item => {
        const title = item.title || item.fileName || 'Untitled Component';
        const snippet = item.snippet || 'No preview available.';
        const source = item.module || item.fileName || item.type || 'CoAuthor Components';
        const queryLower = searchQuery.toLowerCase();
        const relevance =
          title.toLowerCase().includes(queryLower) || snippet.toLowerCase().includes(queryLower)
            ? 'high'
            : 'medium';

        return {
          title,
          snippet,
          source,
          relevance,
          url: item.path || '#',
        };
      });

      setResults(normalized);
    } catch (error) {
      console.error('Regulatory search failed:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
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
