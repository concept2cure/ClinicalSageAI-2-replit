import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  Clock,
  BookOpen,
  MessageSquare,
  TrendingUp,
  FileText,
  Sparkles,
  Target,
} from 'lucide-react';

export const ContextualGuidancePanel = ({
  moduleId,
  sectionId,
  guidance,
  realtimeAnalysis,
  loading,
  onApplySuggestion,
}) => {
  const [activeTab, setActiveTab] = useState('guidance');
  const [historicalComments, setHistoricalComments] = useState([]);

  useEffect(() => {
    if (moduleId) {
      fetchHistoricalComments();
    }
  }, [moduleId, sectionId]);

  const fetchHistoricalComments = async () => {
    try {
      const url = sectionId
        ? `/api/contextual-guidance/historical-comments/${moduleId}/${sectionId}`
        : `/api/contextual-guidance/historical-comments/${moduleId}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setHistoricalComments(data.comments);
      }
    } catch (error) {
      console.error('Failed to fetch historical comments:', error);
    }
  };

  const getSeverityIcon = severity => {
    switch (severity) {
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'suggestion':
        return <Lightbulb className="h-4 w-4 text-blue-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  const getFrequencyBadge = frequency => {
    const colors = {
      High: 'bg-red-100 text-red-800',
      Medium: 'bg-yellow-100 text-yellow-800',
      Low: 'bg-green-100 text-green-800',
    };

    return <Badge className={colors[frequency] || 'bg-gray-100 text-gray-800'}>{frequency}</Badge>;
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Loading Guidance...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          Context-Aware Guidance
        </CardTitle>
        {guidance?.context && (
          <p className="text-sm text-gray-600">
            {guidance.context.module} → {guidance.context.section}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="guidance">Guidelines</TabsTrigger>
            <TabsTrigger value="suggestions">AI Suggestions</TabsTrigger>
            <TabsTrigger value="comments">FDA History</TabsTrigger>
            <TabsTrigger value="realtime">Live Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="guidance" className="space-y-4">
            <ScrollArea className="h-96">
              {guidance?.regulatory_guidelines?.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Key Regulatory Guidelines
                  </h4>
                  {guidance.regulatory_guidelines.map((guideline, index) => (
                    <Alert key={index}>
                      <FileText className="h-4 w-4" />
                      <AlertDescription className="font-medium">{guideline}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No specific guidelines available for this section.</p>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="suggestions" className="space-y-4">
            <ScrollArea className="h-96">
              {guidance?.proactive_suggestions ? (
                <div className="space-y-4">
                  {guidance.proactive_suggestions.requirements && (
                    <div>
                      <h4 className="font-medium flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4" />
                        Key Requirements
                      </h4>
                      <ul className="space-y-2">
                        {guidance.proactive_suggestions.requirements.map((req, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {guidance.proactive_suggestions.recommendations && (
                    <div>
                      <Separator />
                      <h4 className="font-medium flex items-center gap-2 mb-2">
                        <Lightbulb className="h-4 w-4" />
                        Content Recommendations
                      </h4>
                      <ul className="space-y-2">
                        {guidance.proactive_suggestions.recommendations.map((rec, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <Lightbulb className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <span className="text-sm">{rec}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="ml-2"
                                onClick={() => onApplySuggestion?.(rec)}
                              >
                                Apply
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">No AI suggestions available.</p>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="comments" className="space-y-4">
            <ScrollArea className="h-96">
              {historicalComments.length > 0 ? (
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Historical FDA Comments ({historicalComments.length})
                  </h4>
                  {historicalComments.map((comment, index) => (
                    <Card key={index} className="border-l-4 border-l-orange-400">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-sm font-medium text-orange-700">
                            {comment.context}
                          </span>
                          {getFrequencyBadge(comment.frequency)}
                        </div>
                        <p className="text-sm text-gray-700 mb-2">"{comment.comment}"</p>
                        <div className="bg-blue-50 p-3 rounded">
                          <p className="text-sm text-blue-800">
                            <strong>Recommendation:</strong> {comment.recommendation}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">
                  No historical FDA comments available for this section.
                </p>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="realtime" className="space-y-4">
            <ScrollArea className="h-96">
              {realtimeAnalysis ? (
                <div className="space-y-4">
                  {realtimeAnalysis.issues?.length > 0 && (
                    <div>
                      <h4 className="font-medium flex items-center gap-2 mb-2">
                        <TrendingUp className="h-4 w-4" />
                        Real-time Analysis
                      </h4>
                      {realtimeAnalysis.issues.map((issue, index) => (
                        <Alert key={index} className="mb-2">
                          <div className="flex items-start gap-2">
                            {getSeverityIcon(issue.severity)}
                            <AlertDescription>
                              <span className="font-medium capitalize">{issue.type}:</span>{' '}
                              {issue.message}
                            </AlertDescription>
                          </div>
                        </Alert>
                      ))}
                    </div>
                  )}

                  {realtimeAnalysis.suggestions?.length > 0 && (
                    <div>
                      <Separator />
                      <h4 className="font-medium flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4" />
                        Quick Suggestions
                      </h4>
                      <ul className="space-y-2">
                        {realtimeAnalysis.suggestions.map((suggestion, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <Lightbulb className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">Start typing to see real-time analysis</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ContextualGuidancePanel;
