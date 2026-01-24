import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  BarChart3,
  TrendingUp,
  Target,
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Award,
  FileText,
  Zap,
  Eye,
  Download,
  Calendar,
  ArrowUp,
  ArrowDown,
  Filter,
  Settings,
  RefreshCcw,
  Gauge,
} from 'lucide-react';

const CMCAnalyticsEngine = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, setTimeRange] = useState('30d');
  const [isLoading, setIsLoading] = useState(false);

  // Advanced Analytics Data
  const analyticsData = {
    overview: {
      totalProjects: 47,
      completedSubmissions: 23,
      approvalRate: 94.7,
      averageTimeToSubmission: 147, // days
      totalCosts: 12400000, // USD
      costsVsBudget: -8.3, // % under budget
      qualityScore: 96.2,
      riskScore: 15.8, // lower is better
      teamEfficiency: 87.4,
      regulatoryCompliance: 99.1,
    },
    kpis: [
      {
        name: 'Submission Success Rate',
        value: 94.7,
        unit: '%',
        trend: 'up',
        change: 3.2,
        target: 95,
        category: 'Quality',
      },
      {
        name: 'Time to Market',
        value: 147,
        unit: 'days',
        trend: 'down',
        change: -12,
        target: 140,
        category: 'Efficiency',
      },
      {
        name: 'Cost Efficiency',
        value: 91.7,
        unit: '%',
        trend: 'up',
        change: 4.8,
        target: 90,
        category: 'Financial',
      },
      {
        name: 'Quality Score',
        value: 96.2,
        unit: '%',
        trend: 'up',
        change: 2.1,
        target: 95,
        category: 'Quality',
      },
    ],
    trends: {
      submissions: [
        { month: 'Jan', submissions: 3, approvals: 3, rejections: 0 },
        { month: 'Feb', submissions: 4, approvals: 3, rejections: 1 },
        { month: 'Mar', submissions: 2, approvals: 2, rejections: 0 },
        { month: 'Apr', submissions: 5, approvals: 5, rejections: 0 },
        { month: 'May', submissions: 3, approvals: 3, rejections: 0 },
        { month: 'Jun', submissions: 4, approvals: 4, rejections: 0 },
        { month: 'Jul', submissions: 6, approvals: 5, rejections: 1 },
        { month: 'Aug', submissions: 4, approvals: 4, rejections: 0 },
      ],
      costs: [
        { month: 'Jan', planned: 1200000, actual: 1150000 },
        { month: 'Feb', planned: 1350000, actual: 1320000 },
        { month: 'Mar', planned: 1100000, actual: 1080000 },
        { month: 'Apr', planned: 1500000, actual: 1420000 },
        { month: 'May', planned: 1300000, actual: 1250000 },
        { month: 'Jun', planned: 1400000, actual: 1380000 },
        { month: 'Jul', planned: 1600000, actual: 1520000 },
        { month: 'Aug', planned: 1450000, actual: 1400000 },
      ],
    },
    predictiveAnalytics: {
      approvalProbability: 89.3,
      timelineRisk: 'Medium',
      costOverrunRisk: 'Low',
      qualityRisk: 'Very Low',
      nextMilestone: '2025-09-15',
      suggestedActions: [
        'Accelerate analytical method validation for Project CMC-045',
        'Review stability study protocols for temperature excursions',
        'Schedule regulatory consultation for impurity qualification',
        'Optimize manufacturing process parameters for batch consistency',
      ],
    },
    benchmarking: {
      industryAverage: {
        approvalRate: 82.4,
        timeToMarket: 165,
        costPerSubmission: 540000,
      },
      topQuartile: {
        approvalRate: 93.8,
        timeToMarket: 132,
        costPerSubmission: 420000,
      },
      ourPerformance: {
        approvalRate: 94.7,
        timeToMarket: 147,
        costPerSubmission: 465000,
      },
    },
    riskIndicators: [
      {
        area: 'Manufacturing Scale-up',
        risk: 'High',
        probability: 0.72,
        impact: 'Severe',
        actions: 3,
      },
      {
        area: 'Regulatory Compliance',
        risk: 'Low',
        probability: 0.15,
        impact: 'Moderate',
        actions: 1,
      },
      { area: 'Supply Chain', risk: 'Medium', probability: 0.38, impact: 'Moderate', actions: 2 },
      { area: 'Quality Control', risk: 'Low', probability: 0.22, impact: 'Minor', actions: 1 },
    ],
  };

  const getRiskColor = risk => {
    const colors = {
      High: 'text-red-600 bg-red-100',
      Medium: 'text-yellow-600 bg-yellow-100',
      Low: 'text-green-600 bg-green-100',
      'Very Low': 'text-green-700 bg-green-50',
    };
    return colors[risk] || 'text-gray-600 bg-gray-100';
  };

  const getTrendIcon = trend => {
    return trend === 'up' ? (
      <ArrowUp className="h-4 w-4 text-green-600" />
    ) : (
      <ArrowDown className="h-4 w-4 text-red-600" />
    );
  };

  const formatCurrency = amount => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Analytics Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">CMC Analytics Intelligence</h2>
          <p className="text-gray-600 mt-1">
            Advanced analytics, predictive insights, and performance optimization
          </p>
        </div>
        <div className="flex space-x-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refresh Data
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Executive Dashboard KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            <FileText className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.overview.totalProjects}</div>
            <p className="text-xs text-green-600 flex items-center mt-1">
              <ArrowUp className="h-3 w-3 mr-1" />
              12% from last month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {analyticsData.overview.approvalRate}%
            </div>
            <p className="text-xs text-green-600 flex items-center mt-1">
              <ArrowUp className="h-3 w-3 mr-1" />
              Industry leading
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Time to Market</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {analyticsData.overview.averageTimeToSubmission}d
            </div>
            <p className="text-xs text-green-600 flex items-center mt-1">
              <ArrowDown className="h-3 w-3 mr-1" />
              8% improvement
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
            <Award className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {analyticsData.overview.qualityScore}
            </div>
            <p className="text-xs text-green-600 flex items-center mt-1">
              <ArrowUp className="h-3 w-3 mr-1" />
              Excellent rating
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost Efficiency</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">91.7%</div>
            <p className="text-xs text-green-600 flex items-center mt-1">
              <ArrowUp className="h-3 w-3 mr-1" />
              Under budget
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="predictive">Predictive Analytics</TabsTrigger>
          <TabsTrigger value="benchmarking">Benchmarking</TabsTrigger>
          <TabsTrigger value="insights">AI Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Submission Success Trends</CardTitle>
                <CardDescription>Monthly submission and approval tracking</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="h-48 flex items-end justify-between space-x-2">
                    {analyticsData.trends.submissions.map(month => (
                      <div key={month.month} className="flex flex-col items-center space-y-1">
                        <div className="flex flex-col space-y-1">
                          <div
                            className="w-8 bg-green-500 rounded-t"
                            style={{ height: `${month.approvals * 12}px` }}
                            title={`${month.approvals} approvals`}
                          ></div>
                          <div
                            className="w-8 bg-red-400 rounded-b"
                            style={{ height: `${month.rejections * 12}px` }}
                            title={`${month.rejections} rejections`}
                          ></div>
                        </div>
                        <div className="text-xs text-gray-600">{month.month}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center space-x-4 text-sm">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-green-500 rounded mr-2"></div>
                      Approvals
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-red-400 rounded mr-2"></div>
                      Rejections
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost vs Budget Analysis</CardTitle>
                <CardDescription>Planned vs actual spending by month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="h-48 flex items-end justify-between space-x-1">
                    {analyticsData.trends.costs.map(month => (
                      <div key={month.month} className="flex flex-col items-center space-y-1">
                        <div className="flex space-x-1">
                          <div
                            className="w-4 bg-blue-400 rounded-t"
                            style={{ height: `${month.planned / 20000}px` }}
                            title={`Planned: ${formatCurrency(month.planned)}`}
                          ></div>
                          <div
                            className="w-4 bg-green-500 rounded-t"
                            style={{ height: `${month.actual / 20000}px` }}
                            title={`Actual: ${formatCurrency(month.actual)}`}
                          ></div>
                        </div>
                        <div className="text-xs text-gray-600">{month.month}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center space-x-4 text-sm">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-blue-400 rounded mr-2"></div>
                      Planned
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-green-500 rounded mr-2"></div>
                      Actual
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Key Performance Indicators</CardTitle>
                <CardDescription>Real-time KPI tracking with targets and trends</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analyticsData.kpis.map((kpi, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{kpi.name}</span>
                          <div className="flex items-center space-x-2">
                            {getTrendIcon(kpi.trend)}
                            <span
                              className={`text-sm font-medium ${kpi.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}
                            >
                              {kpi.change > 0 ? '+' : ''}
                              {kpi.change}
                              {kpi.unit === '%' ? 'pp' : kpi.unit}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold">
                            {kpi.value}
                            {kpi.unit}
                          </span>
                          <Badge variant="outline">
                            Target: {kpi.target}
                            {kpi.unit}
                          </Badge>
                        </div>
                        <Progress
                          value={kpi.unit === '%' ? kpi.value : (kpi.value / kpi.target) * 100}
                          className="mt-2 h-2"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Risk Indicators</CardTitle>
                <CardDescription>Real-time risk monitoring across key areas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analyticsData.riskIndicators.map((indicator, index) => (
                    <div key={index} className="p-3 border rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium">{indicator.area}</span>
                        <Badge className={getRiskColor(indicator.risk)}>
                          {indicator.risk} Risk
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Probability:</span>
                          <div className="font-medium">
                            {Math.round(indicator.probability * 100)}%
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-600">Impact:</span>
                          <div className="font-medium">{indicator.impact}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Actions:</span>
                          <div className="font-medium">{indicator.actions}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="predictive">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Gauge className="h-5 w-5 mr-2 text-blue-600" />
                  Predictive Success Metrics
                </CardTitle>
                <CardDescription>AI-powered predictions for upcoming submissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-green-600 mb-2">
                      {analyticsData.predictiveAnalytics.approvalProbability}%
                    </div>
                    <p className="text-gray-600">Predicted Approval Probability</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Based on historical data and current quality metrics
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 border rounded">
                      <div className="text-lg font-bold text-yellow-600">Medium</div>
                      <div className="text-sm text-gray-600">Timeline Risk</div>
                    </div>
                    <div className="text-center p-3 border rounded">
                      <div className="text-lg font-bold text-green-600">Low</div>
                      <div className="text-sm text-gray-600">Cost Risk</div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Next Key Milestone</h4>
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 text-blue-600 mr-2" />
                      <span>{analyticsData.predictiveAnalytics.nextMilestone}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-orange-600" />
                  AI-Suggested Actions
                </CardTitle>
                <CardDescription>Recommended actions to optimize outcomes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analyticsData.predictiveAnalytics.suggestedActions.map((action, index) => (
                    <div
                      key={index}
                      className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg"
                    >
                      <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-800">{action}</p>
                      </div>
                      <Button variant="outline" size="sm">
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="benchmarking">
          <Card>
            <CardHeader>
              <CardTitle>Industry Benchmarking</CardTitle>
              <CardDescription>Compare performance against industry standards</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-lg">Approval Rate</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Our Performance</span>
                      <span className="font-bold text-green-600">
                        {analyticsData.benchmarking.ourPerformance.approvalRate}%
                      </span>
                    </div>
                    <Progress
                      value={analyticsData.benchmarking.ourPerformance.approvalRate}
                      className="h-2"
                    />

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Top Quartile</span>
                      <span className="font-medium">
                        {analyticsData.benchmarking.topQuartile.approvalRate}%
                      </span>
                    </div>
                    <Progress
                      value={analyticsData.benchmarking.topQuartile.approvalRate}
                      className="h-2"
                    />

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Industry Average</span>
                      <span className="font-medium">
                        {analyticsData.benchmarking.industryAverage.approvalRate}%
                      </span>
                    </div>
                    <Progress
                      value={analyticsData.benchmarking.industryAverage.approvalRate}
                      className="h-2"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-lg">Time to Market</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Our Performance</span>
                      <span className="font-bold text-orange-600">
                        {analyticsData.benchmarking.ourPerformance.timeToMarket}d
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Top Quartile</span>
                      <span className="font-medium">
                        {analyticsData.benchmarking.topQuartile.timeToMarket}d
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Industry Average</span>
                      <span className="font-medium">
                        {analyticsData.benchmarking.industryAverage.timeToMarket}d
                      </span>
                    </div>

                    <Badge className="bg-yellow-100 text-yellow-800">Room for improvement</Badge>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-lg">Cost Per Submission</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Our Performance</span>
                      <span className="font-bold text-green-600">
                        {formatCurrency(
                          analyticsData.benchmarking.ourPerformance.costPerSubmission
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Top Quartile</span>
                      <span className="font-medium">
                        {formatCurrency(analyticsData.benchmarking.topQuartile.costPerSubmission)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Industry Average</span>
                      <span className="font-medium">
                        {formatCurrency(
                          analyticsData.benchmarking.industryAverage.costPerSubmission
                        )}
                      </span>
                    </div>

                    <Badge className="bg-green-100 text-green-800">Above average efficiency</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2 text-purple-600" />
                  AI-Generated Insights
                </CardTitle>
                <CardDescription>Automated insights from data analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-green-800">Strong Performance Trend</h4>
                        <p className="text-sm text-green-700 mt-1">
                          Your approval rate has increased 12% over the past quarter, significantly
                          outperforming industry benchmarks.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-yellow-800">Optimization Opportunity</h4>
                        <p className="text-sm text-yellow-700 mt-1">
                          Manufacturing scale-up timelines could be reduced by 15% with earlier
                          process validation.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <Target className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-800">Predictive Recommendation</h4>
                        <p className="text-sm text-blue-700 mt-1">
                          Based on current trends, consider increasing analytical method development
                          resources by 20% for Q4.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Scorecard</CardTitle>
                <CardDescription>Overall CMC program health assessment</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="text-5xl font-bold text-green-600 mb-2">A+</div>
                    <p className="text-gray-600">Overall Program Grade</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Quality Excellence</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: '96%' }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">96%</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Timeline Performance</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-yellow-500 h-2 rounded-full"
                            style={{ width: '78%' }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">78%</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Cost Management</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: '92%' }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">92%</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Risk Management</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: '85%' }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">85%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CMCAnalyticsEngine;
