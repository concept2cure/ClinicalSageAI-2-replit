import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Loader2 } from 'lucide-react'

export default function NLPQuery({ onFilterResults }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const submitQuery = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      // Simulate API call with mock data for demonstration
      // In a real implementation, make a fetch call to the API
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mock filtered data based on the query
      const mockFilteredData = {
        query: query,
        results: [
          { id: 1, name: 'Filtered result 1', relevance: 0.95 },
          { id: 2, name: 'Filtered result 2', relevance: 0.87 },
          { id: 3, name: 'Filtered result 3', relevance: 0.75 },
        ],
        timestamp: new Date().toISOString(),
      };

      // Pass filtered data to parent component
      onFilterResults(mockFilteredData);
    } catch (error) {
      console.error('Error processing NLP query:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Natural Language Query</CardTitle>
        <CardDescription>
          Ask questions about adverse events, patient demographics, or trends in natural language
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex space-x-2">
          <div className="flex-1">
            <Input
              placeholder="Ask a question, e.g., 'Show trends for patients over 60' or 'Compare adverse events by gender'"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && submitQuery()}
            />
          </div>
          <Button onClick={submitQuery} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Search
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
