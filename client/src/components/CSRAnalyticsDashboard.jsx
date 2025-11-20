import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  Activity,
  Users,
  Target,
  BarChart3,
  PieChart,
  LineChart,
  Database,
  Clock,
  CheckCircle,
  AlertTriangle,
  Calendar,
} from 'lucide-react';

const CSRAnalyticsDashboard = ({ metrics }) => {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate analytics data processing
    const processAnalytics = () => {
      const data = {
        performanceMetrics: {
          searchAccuracy: 94.8,
          processingSpeed: 'sub-second',
          uptime: 99.9,
          dataQuality: 96.2,
        },
        therapeuticAreaBreakdown: [
          { area: 'Oncology', count: 245, percentage: 31.4, trend: '+12%' },
          { area: 'Cardiology', count: 178, percentage: 22.8, trend: '+8%' },
          { area: 'Neurology', count: 142, percentage: 18.2, trend: '+15%' },
          { area: 'Immunology', count: 98, percentage: 12.6, trend: '+22%' },
          { area: 'Endocrinology', count: 116, percentage: 14.9, trend: '+5%' },
        ],
        phaseDistribution: [
          { phase: 'Phase III', count: 312, percentage: 40.1, success_rate: 67 },
          { phase: 'Phase II', count: 267, percentage: 34.3, success_rate: 45 },
          { phase: 'Phase I', count: 156, percentage: 20.0, success_rate: 78 },
          { phase: 'Phase IV', count: 44, percentage: 5.6, success_rate: 89 },
        ],
        temporalTrends: {
          last30Days: { searches: 1247, uploads: 23, insights: 89 },
          last7Days: { searches: 342, uploads: 8, insights: 24 },
          today: { searches: 67, uploads: 2, insights: 7 },
        },
        qualityMetrics: {
          completenessScore: 92.4,
          consistencyScore: 89.7,
          accuracyScore: 94.1,
          recentUpdates: 28,
        },
      };
      setAnalyticsData(data);
      setLoading(false);
    };

    processAnalytics();
  }, [metrics]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Performance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Search Accuracy</p>
                <p className="text-2xl font-bold text-green-600">
                  {analyticsData.performanceMetrics.searchAccuracy}%
                </p>
              </div>
              <Target className="h-8 w-8 text-green-500" />
            </div>
            <Progress value={analyticsData.performanceMetrics.searchAccuracy} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Processing Speed</p>
                <p className="text-2xl font-bold text-blue-600">
                  {analyticsData.performanceMetrics.processingSpeed}
                </p>
              </div>
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
            <div className="mt-2 text-xs text-gray-500">Average query response time</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">System Uptime</p>
                <p className="text-2xl font-bold text-purple-600">
                  {analyticsData.performanceMetrics.uptime}%
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-purple-500" />
            </div>
            <div className="mt-2 text-xs text-green-600">All systems operational</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Data Quality</p>
                <p className="text-2xl font-bold text-orange-600">
                  {analyticsData.performanceMetrics.dataQuality}%
                </p>
              </div>
              <Database className="h-8 w-8 text-orange-500" />
            </div>
            <Progress value={analyticsData.performanceMetrics.dataQuality} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs defaultValue="therapeutic" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="therapeutic">Therapeutic Areas</TabsTrigger>
          <TabsTrigger value="phases">Study Phases</TabsTrigger>
          <TabsTrigger value="activity">Activity Trends</TabsTrigger>
          <TabsTrigger value="quality">Quality Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="therapeutic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <PieChart className="mr-2 h-5 w-5" />
                Therapeutic Area Distribution
              </CardTitle>
              <CardDescription>
                Analysis of {metrics?.totalCsrs || 0} CSRs across therapeutic areas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsData.therapeuticAreaBreakdown.map((area, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                      <div>
                        <p className="font-medium">{area.area}</p>
                        <p className="text-sm text-gray-600">{area.count} studies</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{area.percentage}%</p>
                      <Badge variant="outline" className="text-xs">
                        {area.trend}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="phases" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="mr-2 h-5 w-5" />
                Study Phase Analysis
              </CardTitle>
              <CardDescription>
                Phase distribution and success rates across {metrics?.totalCsrs || 0} studies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsData.phaseDistribution.map((phase, idx) => (
                  <div key={idx} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{phase.phase}</h4>
                      <Badge variant="outline">{phase.count} studies</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Distribution</p>
                        <Progress value={phase.percentage} className="mt-1" />
                        <p className="text-xs text-gray-500 mt-1">{phase.percentage}% of total</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Success Rate</p>
                        <Progress value={phase.success_rate} className="mt-1" />
                        <p className="text-xs text-gray-500 mt-1">{phase.success_rate}% success</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <LineChart className="mr-2 h-5 w-5" />
                Activity Trends
              </CardTitle>
              <CardDescription>Platform usage and engagement metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <Calendar className="mx-auto h-8 w-8 text-blue-500 mb-2" />
                  <p className="text-sm font-medium text-gray-600">Last 30 Days</p>
                  <div className="mt-2 space-y-1">
                    <p className="text-lg font-bold">
                      {analyticsData.temporalTrends.last30Days.searches}
                    </p>
                    <p className="text-xs text-gray-500">searches performed</p>
                  </div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <Activity className="mx-auto h-8 w-8 text-green-500 mb-2" />
                  <p className="text-sm font-medium text-gray-600">Last 7 Days</p>
                  <div className="mt-2 space-y-1">
                    <p className="text-lg font-bold">
                      {analyticsData.temporalTrends.last7Days.searches}
                    </p>
                    <p className="text-xs text-gray-500">searches performed</p>
                  </div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <Clock className="mx-auto h-8 w-8 text-purple-500 mb-2" />
                  <p className="text-sm font-medium text-gray-600">Today</p>
                  <div className="mt-2 space-y-1">
                    <p className="text-lg font-bold">
                      {analyticsData.temporalTrends.today.searches}
                    </p>
                    <p className="text-xs text-gray-500">searches performed</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quality" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="mr-2 h-5 w-5" />
                Data Quality Metrics
              </CardTitle>
              <CardDescription>
                Assessment of data completeness, consistency, and accuracy
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Completeness Score</span>
                    <span className="text-lg font-bold text-green-600">
                      {analyticsData.qualityMetrics.completenessScore}%
                    </span>
                  </div>
                  <Progress
                    value={analyticsData.qualityMetrics.completenessScore}
                    className="h-2"
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Consistency Score</span>
                    <span className="text-lg font-bold text-blue-600">
                      {analyticsData.qualityMetrics.consistencyScore}%
                    </span>
                  </div>
                  <Progress value={analyticsData.qualityMetrics.consistencyScore} className="h-2" />

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Accuracy Score</span>
                    <span className="text-lg font-bold text-purple-600">
                      {analyticsData.qualityMetrics.accuracyScore}%
                    </span>
                  </div>
                  <Progress value={analyticsData.qualityMetrics.accuracyScore} className="h-2" />
                </div>

                <div className="flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600 mb-2">
                      {analyticsData.qualityMetrics.recentUpdates}
                    </div>
                    <p className="text-sm text-gray-600">Recent data updates</p>
                    <p className="text-xs text-gray-500 mt-1">in the last 24 hours</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CSRAnalyticsDashboard;
