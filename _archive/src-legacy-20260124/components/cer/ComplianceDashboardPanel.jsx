import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getComplianceMetrics, getDashboardMetrics } from '@/services/CerComplianceService';

/**
 * ComplianceDashboardPanel
 *
 * Displays compliance metrics for objectives and sections, showing completion percentages
 * and status breakdowns for the CER2V module.
 */
const ComplianceDashboardPanel = ({ documentId = 'current', framework = 'mdr' }) => {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState(null);
  const [qmpMetrics, setQmpMetrics] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('objectives');

  useEffect(() => {
    fetchMetrics();
  }, [documentId, framework]);

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      // Fetch compliance metrics
      const complianceData = await getComplianceMetrics(documentId, framework);
      setMetrics(complianceData);

      // Fetch QMP dashboard metrics
      const qmpData = await getDashboardMetrics();
      setQmpMetrics(qmpData);
    } catch (error) {
      console.error('Error fetching metrics:', error);
      toast({
        title: 'Error Loading Metrics',
        description: error.message || 'Failed to load compliance metrics',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchMetrics();
    toast({
      title: 'Refreshing Data',
      description: 'Updating compliance metrics...',
      variant: 'default',
    });
  };

  // Helper to format dates
  const formatDate = dateString => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading && !metrics) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Compliance Dashboard
          </CardTitle>
          <CardDescription>Loading compliance metrics...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Fetching metrics...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Compliance Dashboard
          </CardTitle>
          <CardDescription>Compliance metrics unavailable</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <p className="mt-2 text-sm text-muted-foreground">Could not load compliance metrics</p>
            <Button className="mt-4" variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Compliance Dashboard
            </CardTitle>
            <CardDescription>Last updated: {formatDate(metrics.timestamp)}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Overall Score Panel */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium">Overall Compliance Score</h3>
            <Badge
              variant={
                !metrics.overallComplianceScore
                  ? 'outline'
                  : metrics.overallComplianceScore >= 90
                    ? 'success'
                    : metrics.overallComplianceScore >= 75
                      ? 'default'
                      : metrics.overallComplianceScore >= 60
                        ? 'warning'
                        : 'destructive'
              }
            >
              {metrics.overallComplianceScore
                ? `${metrics.overallComplianceScore}%`
                : 'Not Evaluated'}
            </Badge>
          </div>
          <Progress
            value={metrics.overallComplianceScore || 0}
            className="h-2"
            indicatorClassName={
              !metrics.overallComplianceScore
                ? 'bg-gray-400'
                : metrics.overallComplianceScore >= 90
                  ? 'bg-green-500'
                  : metrics.overallComplianceScore >= 75
                    ? 'bg-blue-500'
                    : metrics.overallComplianceScore >= 60
                      ? 'bg-amber-500'
                      : 'bg-red-500'
            }
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted-foreground">
              {metrics.evaluatedObjectives} of {metrics.totalObjectives} objectives evaluated
            </span>
            <span className="text-xs font-medium">Framework: {metrics.framework}</span>
          </div>
        </div>

        {/* Tabs for different metric views */}
        <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="objectives">Objectives</TabsTrigger>
            <TabsTrigger value="sections">Sections</TabsTrigger>
          </TabsList>

          {/* Objectives Tab Content */}
          <TabsContent value="objectives" className="space-y-4">
            {/* QMP Objective Completion Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-background rounded-lg border p-3">
                <h3 className="text-sm font-medium mb-2">QMP Objective Completion</h3>
                {qmpMetrics && (
                  <>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-muted-foreground">Overall completion</span>
                      <Badge variant="outline">{qmpMetrics.completionPercentage || 0}%</Badge>
                    </div>
                    <Progress value={qmpMetrics.completionPercentage || 0} className="h-2" />

                    <div className="grid grid-cols-2 gap-2 mt-4">
                      <div className="flex flex-col items-center p-2 bg-muted/50 rounded">
                        <span className="text-xs text-muted-foreground">Completed</span>
                        <span className="text-lg font-semibold">
                          {qmpMetrics.objectivesBreakdown?.complete || 0}
                        </span>
                      </div>
                      <div className="flex flex-col items-center p-2 bg-muted/50 rounded">
                        <span className="text-xs text-muted-foreground">In Progress</span>
                        <span className="text-lg font-semibold">
                          {qmpMetrics.objectivesBreakdown?.inProgress || 0}
                        </span>
                      </div>
                      <div className="flex flex-col items-center p-2 bg-muted/50 rounded">
                        <span className="text-xs text-muted-foreground">Planned</span>
                        <span className="text-lg font-semibold">
                          {qmpMetrics.objectivesBreakdown?.planned || 0}
                        </span>
                      </div>
                      <div className="flex flex-col items-center p-2 bg-muted/50 rounded">
                        <span className="text-xs text-muted-foreground">Blocked</span>
                        <span className="text-lg font-semibold">
                          {qmpMetrics.objectivesBreakdown?.blocked || 0}
                        </span>
                      </div>
                    </div>
                  </>
                )}
                {!qmpMetrics && (
                  <div className="flex flex-col items-center justify-center py-4">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    <p className="mt-1 text-xs text-muted-foreground">QMP metrics unavailable</p>
                  </div>
                )}
              </div>

              {/* Compliance Status Breakdown */}
              <div className="bg-background rounded-lg border p-3">
                <h3 className="text-sm font-medium mb-2">Compliance Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                      <span className="text-sm">Excellent</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold">
                        {metrics.complianceBreakdown?.excellent || 0}
                      </span>
                      <span className="text-xs text-muted-foreground">objectives</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 text-blue-500 mr-2" />
                      <span className="text-sm">Good</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold">
                        {metrics.complianceBreakdown?.good || 0}
                      </span>
                      <span className="text-xs text-muted-foreground">objectives</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mr-2" />
                      <span className="text-sm">Needs Improvement</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold">
                        {metrics.complianceBreakdown?.needsImprovement || 0}
                      </span>
                      <span className="text-xs text-muted-foreground">objectives</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <XCircle className="h-4 w-4 text-red-500 mr-2" />
                      <span className="text-sm">Critical Issues</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold">
                        {metrics.complianceBreakdown?.criticalIssues || 0}
                      </span>
                      <span className="text-xs text-muted-foreground">objectives</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <AlertCircle className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-sm">Not Evaluated</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold">
                        {metrics.complianceBreakdown?.notEvaluated || 0}
                      </span>
                      <span className="text-xs text-muted-foreground">objectives</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Sections Tab Content */}
          <TabsContent value="sections" className="space-y-4">
            <div className="bg-background rounded-lg border p-3">
              <h3 className="text-sm font-medium mb-3">Section Coverage & Compliance</h3>

              {qmpMetrics && qmpMetrics.cerSectionCoverage && (
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-muted-foreground">CER Section Coverage</span>
                    <Badge variant="outline">
                      {qmpMetrics.cerSectionCoverage.percentage || 0}%
                    </Badge>
                  </div>
                  <Progress value={qmpMetrics.cerSectionCoverage.percentage || 0} className="h-2" />
                </div>
              )}

              {/* Section Compliance Table */}
              <div className="mt-4">
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                          Section
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">
                          Score
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">
                          Objectives
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {metrics.sectionComplianceScores &&
                      Object.entries(metrics.sectionComplianceScores).length > 0 ? (
                        Object.entries(metrics.sectionComplianceScores).map(([section, data]) => (
                          <tr
                            key={section}
                            className="bg-background hover:bg-muted/20 transition-colors"
                          >
                            <td className="px-4 py-2 text-sm">{section}</td>
                            <td className="px-4 py-2 text-center">
                              <Badge
                                variant={
                                  !data.averageScore
                                    ? 'outline'
                                    : data.averageScore >= 90
                                      ? 'success'
                                      : data.averageScore >= 75
                                        ? 'default'
                                        : data.averageScore >= 60
                                          ? 'warning'
                                          : 'destructive'
                                }
                              >
                                {data.averageScore !== null ? `${data.averageScore}%` : 'N/A'}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-center text-sm">{data.objectiveCount}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-8 text-center text-sm text-muted-foreground"
                          >
                            No section compliance data available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Uncovered Critical Sections Warning */}
              {qmpMetrics &&
                qmpMetrics.cerSectionCoverage &&
                qmpMetrics.cerSectionCoverage.uncoveredCriticalSections &&
                qmpMetrics.cerSectionCoverage.uncoveredCriticalSections.length > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="flex items-start">
                      <AlertTriangle className="h-5 w-5 text-amber-500 mr-2 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-medium text-amber-800">
                          Uncovered Critical Sections
                        </h4>
                        <p className="text-xs text-amber-700 mt-1">
                          The following critical sections are not covered by any quality objectives:
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {qmpMetrics.cerSectionCoverage.uncoveredCriticalSections.map(section => (
                            <Badge
                              key={section}
                              variant="outline"
                              className="bg-amber-100 text-amber-800 border-amber-200"
                            >
                              {section}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="pt-0">
        <p className="text-xs text-muted-foreground w-full text-center">
          The compliance engine evaluates {metrics.evaluatedObjectives} objectives across{' '}
          {Object.keys(metrics.sectionComplianceScores || {}).length} sections.
        </p>
      </CardFooter>
    </Card>
  );
};

export default ComplianceDashboardPanel;
