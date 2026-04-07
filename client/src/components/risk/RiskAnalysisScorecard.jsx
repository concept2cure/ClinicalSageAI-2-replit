import React from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  BarChart2,
  FileText,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * RiskAnalysisScorecard Component
 *
 * Displays a visual scorecard of document risk analysis including
 * overall risk score, trend, and key metrics.
 */
const RiskAnalysisScorecard = ({ analysis, isLoading, onRunAnalysis }) => {
  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Document Risk Analysis</CardTitle>
          <CardDescription>Loading risk analysis data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6">
            <div className="h-32 w-32 rounded-full border-4 border-t-primary border-opacity-20 border-t-opacity-100 animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">
              Please wait while we load the risk analysis
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Document Risk Analysis</CardTitle>
          <CardDescription>No risk analysis data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6">
            <FileText className="h-16 w-16 text-gray-300" />
            <p className="mt-4 text-sm text-gray-500">
              No risk analysis has been run on this document
            </p>
            <Button onClick={onRunAnalysis} className="mt-4">
              Run Analysis
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate risk score percentage (0-100)
  const riskScorePercentage = Math.round(analysis.overallRiskScore * 100);

  // Determine if risk trend is improving or worsening
  const riskTrends = analysis.riskTrends || [];
  const hasTrends = riskTrends.length >= 2;
  const firstTrend = riskTrends[0]?.score || 0;
  const latestTrend = riskTrends[riskTrends.length - 1]?.score || 0;
  const trendDirection = hasTrends
    ? latestTrend < firstTrend
      ? 'improving'
      : 'worsening'
    : 'neutral';

  // Calculate percentage change for trend
  const trendChange = hasTrends
    ? Math.abs(Math.round(((latestTrend - firstTrend) / firstTrend) * 100))
    : 0;

  // Get risk colors and icons based on category
  const getRiskColorClasses = category => {
    switch (category) {
      case 'low':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'moderate':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getRiskIcon = category => {
    switch (category) {
      case 'low':
        return <ShieldCheck className="h-5 w-5 text-green-600" />;
      case 'moderate':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'high':
        return <ShieldAlert className="h-5 w-5 text-red-600" />;
      default:
        return <BarChart2 className="h-5 w-5 text-gray-600" />;
    }
  };

  // Count risks by status
  const openRisks = analysis.risks?.filter(r => r.mitigationStatus === 'open')?.length || 0;
  const inProgressRisks =
    analysis.risks?.filter(r => r.mitigationStatus === 'in_progress')?.length || 0;
  const resolvedRisks = analysis.risks?.filter(r => r.mitigationStatus === 'resolved')?.length || 0;
  const totalRisks = analysis.risks?.length || 0;

  // Format last updated date
  const lastUpdated = analysis.lastUpdated
    ? new Date(analysis.lastUpdated).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Unknown';

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">Document Risk Analysis</CardTitle>
            <CardDescription>
              {analysis.documentType} • Last updated: {lastUpdated}
            </CardDescription>
          </div>

          <Button size="sm" variant="outline" onClick={onRunAnalysis}>
            Refresh Analysis
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col md:flex-row gap-6">
          {/* Risk score gauge */}
          <div className="flex-1">
            <div className="flex flex-col items-center">
              <div className="relative h-40 w-40">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  {/* Background circle */}
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#e6e6e6" strokeWidth="10" />

                  {/* Progress arc */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke={
                      analysis.riskCategory === 'high'
                        ? '#ef4444'
                        : analysis.riskCategory === 'moderate'
                          ? '#f59e0b'
                          : '#92a87a'
                    }
                    strokeWidth="10"
                    strokeDasharray={`${2 * Math.PI * 40 * (riskScorePercentage / 100)} ${2 * Math.PI * 40}`}
                    transform="rotate(-90 50 50)"
                  />

                  {/* Risk icon in center */}
                  <foreignObject x="35" y="35" width="30" height="30">
                    <div className="w-full h-full flex items-center justify-center">
                      {getRiskIcon(analysis.riskCategory)}
                    </div>
                  </foreignObject>
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-3xl font-bold">{riskScorePercentage}</div>
                  <div className="text-xs text-gray-500">Risk Score</div>
                </div>
              </div>

              <Badge
                className={`mt-2 capitalize px-3 py-1 ${getRiskColorClasses(analysis.riskCategory)}`}
              >
                {analysis.riskCategory} Risk
              </Badge>

              {hasTrends && (
                <div className="mt-2 flex items-center text-sm">
                  {trendDirection === 'improving' ? (
                    <>
                      <TrendingDown className="h-4 w-4 text-green-600 mr-1" />
                      <span className="text-green-600">{trendChange}% improvement</span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-4 w-4 text-red-600 mr-1" />
                      <span className="text-red-600">{trendChange}% increase in risk</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Risk metrics */}
          <div className="flex-1 space-y-3">
            <h3 className="font-medium">Risk Summary</h3>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Open Issues</span>
                <span>
                  {openRisks}/{totalRisks}
                </span>
              </div>
              <Progress value={(openRisks / totalRisks) * 100} className="h-2 bg-gray-100">
                <div className="h-full bg-red-500 rounded-full"></div>
              </Progress>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>In Progress</span>
                <span>
                  {inProgressRisks}/{totalRisks}
                </span>
              </div>
              <Progress value={(inProgressRisks / totalRisks) * 100} className="h-2 bg-gray-100">
                <div className="h-full bg-yellow-500 rounded-full"></div>
              </Progress>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Resolved</span>
                <span>
                  {resolvedRisks}/{totalRisks}
                </span>
              </div>
              <Progress value={(resolvedRisks / totalRisks) * 100} className="h-2 bg-gray-100">
                <div className="h-full bg-green-500 rounded-full"></div>
              </Progress>
            </div>

            <div className="pt-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-sm text-gray-500 italic border-l-2 border-gray-300 pl-2 mt-2">
                      {analysis.aiSummary?.substring(0, 120)}...
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    <p>{analysis.aiSummary}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RiskAnalysisScorecard;
