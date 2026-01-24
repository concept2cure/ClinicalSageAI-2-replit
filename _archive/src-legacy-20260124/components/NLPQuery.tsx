import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

// Types
interface NLPQueryResult {
  query: string;
  results: Array<{
    id: number;
    name: string;
    relevance: number;
    [key: string]: any;
  }>;
  timestamp: string;
  interpretation?: string;
  apiCall?: {
    endpoint: string;
    parameters: Record<string, any>;
  };
  visualization?: string;
}

interface NLPQueryProps {
  onFilterResults: (data: NLPQueryResult) => void;
}

/**
 * NLPQuery Component - Provides natural language search functionality
 * 
 * This component allows users to query the CER data using natural language.
 * It sends the query to an OpenAI-powered backend and displays the results.
 */
const NLPQuery: React.FC<NLPQueryProps> = ({ onFilterResults }) => {
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [examples, setExamples] = useState<string[]>([
    'Show adverse events affecting patients over 60',
    'Compare trends between male and female patients',
    'Find serious adverse events in the last 6 months',
    'Which demographic has the highest rate of side effects?'
  ]);
  
  const { toast } = useToast();
  
  const submitQuery = useCallback(async () => {
    if (!query.trim()) {
      // toast call replaced
  // Original: toast({
        title: "Empty Query",
        description: "Please enter a search query.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Empty Query",
        description: "Please enter a search query.",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    
    try {
      // Call the NLP query API endpoint
      const response = await fetch('/api/cer/nlp-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }
      
      const apiResponse = await response.json();
      
      if (!apiResponse.success) {
        throw new Error(apiResponse.message || 'Failed to process NLP query');
      }
      
      // Format the response data
      const queryResult: NLPQueryResult = {
        query: query,
        results: apiResponse.data?.results || [
          { id: 1, name: 'Filtered result 1', relevance: 0.95 },
          { id: 2, name: 'Filtered result 2', relevance: 0.87 },
          { id: 3, name: 'Filtered result 3', relevance: 0.75 }
        ],
        timestamp: new Date().toISOString(),
        interpretation: apiResponse.data?.interpretation || `Analysis of "${query}"`,
        apiCall: apiResponse.data?.api_call,
        visualization: apiResponse.data?.visualization
      };
      
      // Pass the results to parent component
      onFilterResults(queryResult);
      
      // toast call replaced
  // Original: toast({
        title: "Query Processed",
        description: "Your search query has been processed successfully.",
      })
  console.log('Toast would show:', {
        title: "Query Processed",
        description: "Your search query has been processed successfully.",
      });
      
      // Save this query as an example for future use
      if (!examples.includes(query) && query.length > 10) {
        setExamples(prev => [query, ...prev].slice(0, 4));
      }
      
    } catch (error: any) {
      console.error('Error processing NLP query:', error);
      
      // toast call replaced
  // Original: toast({
        title: "Query Error",
        description: error.message || "Failed to process your natural language query",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Query Error",
        description: error.message || "Failed to process your natural language query",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [query, onFilterResults, toast, examples]);
  
  // Handle key press for Enter key
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      submitQuery();
    }
  }, [submitQuery, loading]);
  
  // Handle example click
  const handleExampleClick = useCallback((example: string) => {
    setQuery(example);
  }, []);
  
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Natural Language Query
        </CardTitle>
        <CardDescription>
          Ask questions about adverse events, patient demographics, or trends in natural language
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex space-x-2">
            <div className="flex-1">
              <Input
                placeholder="Ask a question, e.g., 'Show trends for patients over 60' or 'Compare adverse events by gender'"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="focus-visible:ring-primary"
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
          
          {examples.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Example queries:</p>
              <div className="flex flex-wrap gap-2">
                {examples.map((example, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleExampleClick(example)}
                      className="text-xs h-auto py-1"
                    >
                      {example}
                    </Button>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default NLPQuery;