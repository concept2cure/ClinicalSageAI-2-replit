import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  Brain,
  Send,
  TestTube,
  Zap,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react';

export default function RegulatoryAITesting() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [testHistory, setTestHistory] = useState([]);

  // Pre-defined test queries for different regulatory domains
  const testQueries = [
    {
      category: 'FDA IND Submissions',
      query: 'What are the key requirements for CMC stability data in a Phase II IND submission?',
      icon: <FileText className="w-4 h-4" />,
    },
    {
      category: 'ICH E6(R3) Guidelines',
      query:
        'How does ICH E6(R3) change the requirements for risk-based monitoring in clinical trials?',
      icon: <AlertCircle className="w-4 h-4" />,
    },
    {
      category: 'EMA Regulations',
      query:
        'What are the specific data requirements for pediatric investigation plans under EU regulations?',
      icon: <CheckCircle className="w-4 h-4" />,
    },
    {
      category: 'Medical Device 510(k)',
      query:
        'What predicate device comparison data is required for a Class II cardiac monitoring device 510(k)?',
      icon: <Zap className="w-4 h-4" />,
    },
  ];

  const handleSubmitQuery = async () => {
    if (!query.trim()) {
      toast({
        title: 'Query Required',
        description: 'Please enter a regulatory question to test.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/lumen-cortex/ich-e6r3-guidance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken') || 'demo-token'}`,
          'X-Tenant-ID': 'demo-tenant',
        },
        body: JSON.stringify({
          query: query,
          context: {
            regulatory_framework: 'COMPREHENSIVE',
            guidance_type: 'testing',
            include_references: true,
            include_implementation_guidance: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();

      const testResult = {
        id: Date.now(),
        query: query,
        response: result,
        timestamp: new Date().toLocaleString(),
        processingTime: result.query_metadata?.processing_time_ms || 'N/A',
      };

      setResponse(testResult);
      setTestHistory(prev => [testResult, ...prev].slice(0, 10)); // Keep last 10 tests

      toast({
        title: 'AI Response Generated',
        description: 'Regulatory AI test completed successfully.',
      });
    } catch (error) {
      console.error('AI Testing Error:', error);
      toast({
        title: 'Test Failed',
        description: 'Failed to get AI response. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadTestQuery = testQuery => {
    setQuery(testQuery.query);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-3">
            <TestTube className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Regulatory AI Testing</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Test our advanced regulatory AI assistant with real regulatory questions across FDA,
            EMA, ICH guidelines, and medical device regulations.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Test Interface */}
          <div className="lg:col-span-2 space-y-6">
            {/* Query Input */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Brain className="w-5 h-5 text-blue-600" />
                  <span>AI Query Testing</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Enter your regulatory question here... (e.g., What are the ICH E6(R3) requirements for data integrity?)"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  rows={4}
                  className="resize-none"
                />

                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">{query.length}/500 characters</span>
                  <Button
                    onClick={handleSubmitQuery}
                    disabled={isLoading || !query.trim()}
                    className="flex items-center space-x-2"
                  >
                    {isLoading ? <LoadingSpinner size="sm" /> : <Send className="w-4 h-4" />}
                    <span>{isLoading ? 'Processing...' : 'Test AI'}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* AI Response */}
            {response && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>AI Response</span>
                    <Badge variant="outline" className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{response.processingTime}ms</span>
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-800 mb-2">Query:</h4>
                    <p className="text-blue-700">{response.query}</p>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-800 mb-2">AI Answer:</h4>
                    <p className="text-green-700 whitespace-pre-wrap">
                      {response.response.guidance_response?.answer || 'No response available'}
                    </p>
                  </div>

                  {response.response.guidance_response?.implementation_guidance && (
                    <div className="bg-amber-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-amber-800 mb-2">
                        Implementation Guidance:
                      </h4>
                      <ul className="list-disc list-inside text-amber-700 space-y-1">
                        {response.response.guidance_response.implementation_guidance.map(
                          (guidance, idx) => (
                            <li key={idx}>{guidance}</li>
                          )
                        )}
                      </ul>
                    </div>
                  )}

                  {response.response.guidance_response?.references && (
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-purple-800 mb-2">References:</h4>
                      <ul className="list-disc list-inside text-purple-700 space-y-1">
                        {response.response.guidance_response.references.map((ref, idx) => (
                          <li key={idx}>{ref}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Test Queries & History */}
          <div className="space-y-6">
            {/* Pre-defined Test Queries */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sample Test Queries</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {testQueries.map((testQuery, idx) => (
                  <div
                    key={idx}
                    className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => loadTestQuery(testQuery)}
                  >
                    <div className="flex items-start space-x-2">
                      {testQuery.icon}
                      <div>
                        <Badge variant="secondary" className="text-xs mb-1">
                          {testQuery.category}
                        </Badge>
                        <p className="text-sm text-gray-700">{testQuery.query}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Test History */}
            {testHistory.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Tests</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {testHistory.slice(0, 5).map(test => (
                    <div
                      key={test.id}
                      className="p-2 bg-gray-50 rounded text-sm cursor-pointer hover:bg-gray-100"
                      onClick={() => setResponse(test)}
                    >
                      <p className="font-medium truncate">{test.query}</p>
                      <p className="text-gray-500 text-xs">{test.timestamp}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
