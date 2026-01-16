import React, { useState, useCallback } from 'react';
import { Search, ArrowRight, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import debounce from 'lodash/debounce';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const PRESET_QUERIES = [
  "Efficacy endpoints in Parkinson's studies",
  'Placebo response rates in pain studies',
  'Most common adverse events in oncology trials',
  'Statistical methods for multiplicity in Phase 3',
  'Exclusion criteria for hepatic impairment',
];

export default function CSRSearchBar() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useCallback(
    debounce((searchTerm: string) => {
      if (searchTerm.trim().length === 0) return;

      setSearching(true);

      // Simulate API call
      setTimeout(() => {
        setSearchHistory(prev => {
          // Only add search if it doesn't already exist in history
          if (!prev.includes(searchTerm)) {
            // Keep only the most recent 5 searches
            const newHistory = [...prev, searchTerm];
            return newHistory.slice(-5);
          }
          return prev;
        });
        setSearching(false);
      }, 800);
    }, 500),
    []
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length === 0) return;
    debouncedSearch(query);
  };

  const handlePresetQuery = (presetQuery: string) => {
    setQuery(presetQuery);
    debouncedSearch(presetQuery);
  };

  const handleHistoryClick = (historyItem: string) => {
    setQuery(historyItem);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Search className="mr-2 h-5 w-5" />
          CSR Cross-Study Search
        </CardTitle>
        <CardDescription>Search across all Clinical Study Reports for insights</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <Input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search across CSR documents..."
              className="pl-10 pr-20"
            />
            {query.length > 0 && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <Button type="submit" variant="ghost" size="sm" className="h-8 px-2 text-blue-600">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-2">Suggested searches:</div>
            <div className="flex flex-wrap gap-2">
              {PRESET_QUERIES.map((presetQuery, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                  onClick={() => handlePresetQuery(presetQuery)}
                >
                  {presetQuery}
                </Badge>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center justify-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Generate AI Analysis Report
            </Button>
          </div>

          {searchHistory.length > 0 && (
            <div className="pt-3 border-t">
              <div className="text-sm text-gray-500 mb-2">Recent searches:</div>
              <div className="flex flex-wrap gap-2">
                {searchHistory.map((item, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleHistoryClick(item)}
                  >
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
