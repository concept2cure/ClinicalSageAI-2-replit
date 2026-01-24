import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { debounce } from 'lodash';

const CodeAnalysisPanel = () => {
  const [code, setCode] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [analysisHistory, setAnalysisHistory] = useState([]);

  // Debounced analysis function
  const debouncedAnalyze = useCallback(
    debounce(async codeToAnalyze => {
      if (!codeToAnalyze.trim() || codeToAnalyze.length < 50) return;

      setIsAnalyzing(true);
      try {
        const response = await fetch('/api/ai/analyze-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: codeToAnalyze,
            analysisType: 'comprehensive',
          }),
        });

        const result = await response.json();
        setAnalysis(result);

        // Add to history
        setAnalysisHistory(prev => [
          {
            id: Date.now(),
            timestamp: new Date(),
            codePreview: codeToAnalyze.substring(0, 100) + '...',
            issues: result.issues?.length || 0,
            recommendations: result.recommendations?.length || 0,
          },
          ...prev.slice(0, 9), // Keep last 10
        ]);
      } catch (error) {
        console.error('Analysis failed:', error);
      } finally {
        setIsAnalyzing(false);
      }
    }, 2000),
    []
  );

  useEffect(() => {
    if (autoAnalyze && code) {
      debouncedAnalyze(code);
    }
  }, [code, autoAnalyze, debouncedAnalyze]);

  const manualAnalyze = () => {
    if (code.trim()) {
      debouncedAnalyze(code);
    }
  };

  const getSeverityColor = severity => {
    switch (severity?.toLowerCase()) {
      case 'high':
      case 'critical':
        return 'destructive';
      case 'medium':
        return 'warning';
      case 'low':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getIssueIcon = type => {
    switch (type?.toLowerCase()) {
      case 'bug':
      case 'issue':
        return '🐛';
      case 'security':
      case 'vulnerability':
        return '🔒';
      case 'performance':
        return '⚡';
      case 'style':
      case 'formatting':
        return '🎨';
      default:
        return '⚠️';
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Code Input */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">🔍 Code Analysis</CardTitle>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoAnalyze}
                  onChange={e => setAutoAnalyze(e.target.checked)}
                  className="rounded"
                />
                Auto-analyze
              </label>
              <Button onClick={manualAnalyze} disabled={isAnalyzing || !code.trim()} size="sm">
                {isAnalyzing ? 'Analyzing...' : 'Analyze'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Paste your code here for real-time analysis..."
            className="font-mono text-sm min-h-[200px]"
          />
          {code && (
            <div className="text-xs text-gray-500 mt-2">
              {code.length} characters • {code.split('\n').length} lines
              {isAnalyzing && <span className="ml-2 text-blue-600">🔄 Analyzing...</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {analysis && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Analysis Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {analysis.issues?.length || 0}
                </div>
                <div className="text-sm text-gray-600">Issues Found</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {analysis.recommendations?.length || 0}
                </div>
                <div className="text-sm text-gray-600">Recommendations</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {analysis.issues?.filter(i => i.severity === 'low').length || 0}
                </div>
                <div className="text-sm text-gray-600">Minor Issues</div>
              </div>
            </div>

            {/* Issues */}
            {analysis.issues && analysis.issues.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">🐛 Issues Detected</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {analysis.issues.map((issue, index) => (
                    <Alert key={index} variant={getSeverityColor(issue.severity)}>
                      <AlertDescription>
                        <div className="flex items-start gap-2">
                          <span>{getIssueIcon(issue.type)}</span>
                          <div className="flex-1">
                            <div className="font-medium">{issue.description}</div>
                            {issue.line && (
                              <div className="text-xs opacity-70">Line {issue.line}</div>
                            )}
                          </div>
                          <Badge variant={getSeverityColor(issue.severity)}>
                            {issue.severity || 'medium'}
                          </Badge>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {analysis.recommendations && analysis.recommendations.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">💡 Recommendations</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {analysis.recommendations.map((rec, index) => (
                    <Alert key={index} variant="default">
                      <AlertDescription>
                        <div className="flex items-start gap-2">
                          <span>💡</span>
                          <div className="flex-1">
                            <div>{rec.description}</div>
                          </div>
                          <Badge variant="outline">{rec.priority || 'medium'}</Badge>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}

            {/* Full Analysis */}
            {analysis.analysis && (
              <div>
                <h4 className="font-medium mb-2">📋 Detailed Analysis</h4>
                <div className="bg-gray-50 p-3 rounded text-sm max-h-48 overflow-y-auto">
                  <pre className="whitespace-pre-wrap">{analysis.analysis}</pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Analysis History */}
      {analysisHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">📚 Recent Analyses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {analysisHistory.map(item => (
                <div key={item.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex-1">
                    <div className="text-sm font-mono truncate">{item.codePreview}</div>
                    <div className="text-xs text-gray-500">
                      {item.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="destructive">{item.issues} issues</Badge>
                    <Badge variant="default">{item.recommendations} recs</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CodeAnalysisPanel;
