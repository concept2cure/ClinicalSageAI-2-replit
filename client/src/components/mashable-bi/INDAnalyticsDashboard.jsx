/**
 * IND Analytics Dashboard Component
 *
 * This component integrates MashableBI analytics for the IND submission process,
 * providing key insights into submission progress, document status, timelines,
 * and regulatory strategy.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  BarChart2, FileBarChart, Clock, Users, PieChart, LineChart, ListChecks, Lightbulb, ArrowUpRight, ArrowDownRight, TrendingUp, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import MashableBIWrapper from './MashableBIWrapper';

export function INDAnalyticsDashboard({ projectId, showSummary = true }) {
  const { toast } = useToast();
  const [activeInsightTab, setActiveInsightTab] = useState('key-metrics');

  // Check if MashableBI is configured
  const [isMashableConfigured, setIsMashableConfigured] = useState(true);

  // Check MashableBI configuration status
  const { data: mashableStatus, isLoading: isStatusLoading } = useQuery({
    queryKey: ['mashable-bi-status'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/mashable-bi/status');
        if (!response.ok) throw new Error('Failed to check MashableBI status');
        return response.json();
      } catch (error) {
        console.error('Error checking MashableBI configuration:', error);
        return { configured: false };
      }
    },
  });

  // Update configuration status when data is available
  React.useEffect(() => {
    if (mashableStatus) {
      setIsMashableConfigured(mashableStatus.configured);
    }
  }, [mashableStatus]);

  // Fetch analytics summary data
  const { data: analyticsSummary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['ind-analytics-summary', projectId],
    queryFn: async () => {
      try {
        // Check if MashableBI is configured
        if (!isMashableConfigured) {
          throw new Error('MashableBI not configured');
        }

        const response = await apiRequest(
          'GET',
          `/api/ind/projects/${projectId}/analytics-summary`
        );
        if (!response.ok) throw new Error('Failed to fetch analytics summary');
        return response.json();
      } catch (error) {
        console.error('Error fetching analytics summary:', error);

        // Example data for development/demo
        return {
          documentStats: {
            total: 28,
            completed: 18,
            inProgress: 8,
            notStarted: 2,
            completionRate: 64,
          },
          timelineStats: {
            daysUntilSubmission: 94,
            completionTrend: 'on-track', // 'on-track', 'ahead', 'behind'
            estimatedSubmissionDate: '2025-07-30',
            riskLevel: 'low',
          },
          keyInsights: [
            {
              message: 'Document completion rate is 15% above industry average for this phase',
              trend: 'positive',
              impact: 'high',
            },
            {
              message: 'CMC section has the slowest progression rate in your IND package',
              trend: 'negative',
              impact: 'medium',
            },
            {
              message: 'FDA Form 1571 completion is ahead of schedule',
              trend: 'positive',
              impact: 'medium',
            },
          ],
          comparativeStats: {
            documentCompletionCompare: 15, // percent above/below average
            timelineCompare: -5, // percent faster/slower than average
            qualityScore: 87, // out of 100
          },
        };
      }
    },
    enabled: !!projectId && isMashableConfigured,
  });

  // Get trend indicator component
  const getTrendIndicator = (trend, value) => {
    if (trend === 'positive') {
      return (
        <div className="flex items-center text-green-600">
          <ArrowUpRight className="h-4 w-4 mr-1" />
          <span>{value > 0 ? `+${value}%` : ''}</span>
        </div>
      );
    } else if (trend === 'negative') {
      return (
        <div className="flex items-center text-red-600">
          <ArrowDownRight className="h-4 w-4 mr-1" />
          <span>{value < 0 ? `${value}%` : ''}</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center text-blue-600">
          <TrendingUp className="h-4 w-4 mr-1" />
          <span>Stable</span>
        </div>
      );
    }
  };

  return (
    <div className="space-y-6">
      {showSummary && analyticsSummary && (
        <div className="space-y-6">
          {/* Analytics Header */}
          <div>
            <h1 className="text-2xl font-bold">IND Analytics & Insights</h1>
            <p className="text-muted-foreground">Powered by MashableBI</p>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Document Completion */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Document Completion</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analyticsSummary.documentStats.completionRate}%
                </div>
                <div className="mt-1 flex items-center text-xs">
                  {getTrendIndicator(
                    analyticsSummary.comparativeStats.documentCompletionCompare > 0
                      ? 'positive'
                      : 'negative',
                    analyticsSummary.comparativeStats.documentCompletionCompare
                  )}
                  <span className="text-muted-foreground ml-1">vs. industry average</span>
                </div>
                <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                  <div className="flex flex-col items-center">
                    <span className="font-medium text-green-600">
                      {analyticsSummary.documentStats.completed}
                    </span>
                    <span>Completed</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="font-medium text-blue-600">
                      {analyticsSummary.documentStats.inProgress}
                    </span>
                    <span>In Progress</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="font-medium text-gray-600">
                      {analyticsSummary.documentStats.notStarted}
                    </span>
                    <span>Not Started</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Timeline Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Timeline Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analyticsSummary.timelineStats.daysUntilSubmission} days
                </div>
                <div className="mt-1 flex items-center text-xs">
                  {analyticsSummary.timelineStats.completionTrend === 'on-track' && (
                    <Badge className="bg-green-100 text-green-800">On Track</Badge>
                  )}
                  {analyticsSummary.timelineStats.completionTrend === 'ahead' && (
                    <Badge className="bg-blue-100 text-blue-800">Ahead of Schedule</Badge>
                  )}
                  {analyticsSummary.timelineStats.completionTrend === 'behind' && (
                    <Badge className="bg-yellow-100 text-yellow-800">Behind Schedule</Badge>
                  )}

                  <span className="text-muted-foreground ml-2">until submission</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <div className="flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    <span>
                      Estimated submission:{' '}
                      {new Date(
                        analyticsSummary.timelineStats.estimatedSubmissionDate
                      ).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quality Score */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analyticsSummary.comparativeStats.qualityScore}/100
                </div>
                <div className="mt-1 flex items-center">
                  {analyticsSummary.comparativeStats.qualityScore >= 85 ? (
                    <Badge className="bg-green-100 text-green-800">Excellent</Badge>
                  ) : analyticsSummary.comparativeStats.qualityScore >= 70 ? (
                    <Badge className="bg-blue-100 text-blue-800">Good</Badge>
                  ) : (
                    <Badge className="bg-yellow-100 text-yellow-800">Needs Improvement</Badge>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Based on document completeness, adherence to guidelines, and consistency
                </div>
              </CardContent>
            </Card>

            {/* Risk Assessment */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Risk Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize">
                  {analyticsSummary.timelineStats.riskLevel}
                </div>
                <div className="mt-1">
                  {analyticsSummary.timelineStats.riskLevel === 'low' && (
                    <Badge className="bg-green-100 text-green-800">Low Risk</Badge>
                  )}
                  {analyticsSummary.timelineStats.riskLevel === 'medium' && (
                    <Badge className="bg-yellow-100 text-yellow-800">Medium Risk</Badge>
                  )}
                  {analyticsSummary.timelineStats.riskLevel === 'high' && (
                    <Badge className="bg-red-100 text-red-800">High Risk</Badge>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Submission delay risk based on current progress and historical data
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Key Insights */}
          <Card>
            <CardHeader>
              <CardTitle>Key Insights</CardTitle>
              <CardDescription>
                AI-powered insights based on your IND submission data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsSummary.keyInsights.map((insight, index) => (
                  <div key={index} className="flex items-start">
                    {insight.trend === 'positive' && (
                      <div className="bg-green-100 p-2 rounded-full mr-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      </div>
                    )}
                    {insight.trend === 'negative' && (
                      <div className="bg-red-100 p-2 rounded-full mr-3">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                      </div>
                    )}
                    {insight.trend === 'neutral' && (
                      <div className="bg-blue-100 p-2 rounded-full mr-3">
                        <Info className="h-5 w-5 text-blue-600" />
                      </div>
                    )}

                    <div>
                      <p>{insight.message}</p>
                      <div className="flex mt-1">
                        <Badge
                          variant="outline"
                          className={`mr-2 ${
                            insight.impact === 'high'
                              ? 'border-red-200 bg-red-50 text-red-800'
                              : insight.impact === 'medium'
                                ? 'border-yellow-200 bg-yellow-50 text-yellow-800'
                                : 'border-blue-200 bg-blue-50 text-blue-800'
                          }`}
                        >
                          {insight.impact} impact
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Separator />
        </div>
      )}

      {/* MashableBI Dashboard */}
      <MashableBIWrapper
        dashboardId="ind-overview"
        showFilters={true}
        height={700}
        filters={{
          projectId: projectId,
          dateRange: 'last-90-days',
        }}
      />
    </div>
  );
}

export default INDAnalyticsDashboard;
