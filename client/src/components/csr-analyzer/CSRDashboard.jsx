import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  BarChart, LineChart, PieChart, TrendingUp, CheckSquare, AlertTriangle, FileSearch, Users, ArrowUpRight, Download } from 'lucide-react'

// Sample data for recent CSRs
const recentReports = [
  {
    id: 'CSR-2023-A109',
    title: 'Phase 2b Efficacy Study in Metabolic Disease',
    date: '2023-11-15',
    status: 'complete',
    score: 89,
    indication: 'Type 2 Diabetes',
    sponsor: 'PharmaCorp, Inc.',
  },
  {
    id: 'CSR-2023-B241',
    title: 'Phase 1 PK/PD Study in Healthy Volunteers',
    date: '2023-10-22',
    status: 'complete',
    score: 92,
    indication: 'Hypertension',
    sponsor: 'BioScience Labs',
  },
  {
    id: 'CSR-2023-C187',
    title: 'Phase 3 Pivotal Trial for Oncology Indication',
    date: '2023-09-05',
    status: 'complete',
    score: 84,
    indication: 'Non-small Cell Lung Cancer',
    sponsor: 'Oncovita Therapeutics',
  },
  {
    id: 'CSR-2023-D023',
    title: 'Phase 2a Dose-Finding Study in CNS Disorder',
    date: '2023-08-17',
    status: 'complete',
    score: 78,
    indication: 'Major Depressive Disorder',
    sponsor: 'NeuroCure Pharmaceuticals',
  },
  {
    id: 'CSR-2023-E305',
    title: 'Phase 1b Safety Extension Study',
    date: '2023-07-29',
    status: 'complete',
    score: 95,
    indication: 'Rheumatoid Arthritis',
    sponsor: 'ImmunoGene Therapies',
  },
];

// Sample data for insights trends
const insightsData = [
  {
    category: 'Study Design',
    count: 321,
    trend: 'up',
    recommendation: 'Consider adaptive designs for faster patient accrual',
    confidence: 92,
  },
  {
    category: 'Endpoint Selection',
    count: 187,
    trend: 'up',
    recommendation: 'Combine PRO measures with traditional endpoints',
    confidence: 88,
  },
  {
    category: 'Sample Size',
    count: 253,
    trend: 'down',
    recommendation: 'Current sample sizes may be over-powered based on recent effect sizes',
    confidence: 78,
  },
  {
    category: 'Statistical Methods',
    count: 145,
    trend: 'neutral',
    recommendation: 'Consider Bayesian approaches for rare disease indications',
    confidence: 84,
  },
  {
    category: 'Safety Reporting',
    count: 298,
    trend: 'up',
    recommendation: 'Enhanced visual presentations improve reviewer comprehension',
    confidence: 96,
  },
];

// Therapeutic area distribution
const taDistribution = [
  { name: 'Oncology', count: 87, percentage: 26.5 },
  { name: 'Cardiology', count: 56, percentage: 17.1 },
  { name: 'Neurology', count: 42, percentage: 12.8 },
  { name: 'Infectious Disease', count: 38, percentage: 11.6 },
  { name: 'Metabolic Disorders', count: 35, percentage: 10.7 },
  { name: 'Other', count: 70, percentage: 21.3 },
];

const CSRDashboard = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-3 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle>CSR Intelligence Overview</CardTitle>
            <CardDescription>Recent CSRs analyzed across therapeutic areas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80 flex items-center justify-center bg-gray-50 rounded-md">
              <div className="text-center">
                <BarChart className="h-16 w-16 text-indigo-500 mx-auto mb-4" />
                <p className="text-sm text-gray-500">Intelligence visualization dashboard</p>
                <p className="text-xs text-gray-400 max-w-md mx-auto mt-1">
                  Displays CSR analysis trends, therapeutic area coverage, endpoint commonality, and
                  regulatory submission patterns
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle>Key Metrics</CardTitle>
            <CardDescription>Summary statistics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>CSRs Analyzed</span>
                <span className="font-medium">328</span>
              </div>
              <Progress value={82} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">82% of target</p>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Semantic Coverage</span>
                <span className="font-medium">94%</span>
              </div>
              <Progress value={94} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">High semantic density</p>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Intelligence Insights</span>
                <span className="font-medium">1,832</span>
              </div>
              <Progress value={76} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">76% confidence threshold</p>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Therapeutic Areas</span>
                <span className="font-medium">32</span>
              </div>
              <Progress value={68} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">68% of all TAs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent CSRs */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle>Recent CSRs</CardTitle>
            <Button variant="ghost" size="sm" className="h-8 gap-1">
              <FileSearch className="h-4 w-4" />
              View All
            </Button>
          </div>
          <CardDescription>Recently analyzed clinical study reports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 font-medium">ID</th>
                  <th className="text-left py-3 font-medium">Title</th>
                  <th className="text-left py-3 font-medium">Indication</th>
                  <th className="text-left py-3 font-medium">Sponsor</th>
                  <th className="text-left py-3 font-medium">Date</th>
                  <th className="text-left py-3 font-medium">Status</th>
                  <th className="text-left py-3 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map(report => (
                  <tr key={report.id} className="border-b">
                    <td className="py-3">{report.id}</td>
                    <td className="py-3 max-w-xs truncate">{report.title}</td>
                    <td className="py-3">{report.indication}</td>
                    <td className="py-3">{report.sponsor}</td>
                    <td className="py-3">{report.date}</td>
                    <td className="py-3">
                      <Badge variant={report.status === 'complete' ? 'success' : 'secondary'}>
                        {report.status}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-medium ${
                            report.score >= 90
                              ? 'text-emerald-600'
                              : report.score >= 80
                                ? 'text-blue-600'
                                : report.score >= 70
                                  ? 'text-amber-600'
                                  : 'text-red-600'
                          }`}
                        >
                          {report.score}
                        </span>
                        <Progress value={report.score} className="h-1.5 w-10" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle>Intelligence Insights</CardTitle>
              <Button variant="ghost" size="sm" className="h-8 gap-1">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
            <CardDescription>Top intelligence insights from CSR analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {insightsData.map((insight, i) => (
                <div key={i} className="border-b pb-3 last:border-0">
                  <div className="flex justify-between mb-1">
                    <div className="font-medium">{insight.category}</div>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <span>{insight.count}</span>
                      {insight.trend === 'up' && (
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                      )}
                      {insight.trend === 'down' && (
                        <TrendingUp className="h-3 w-3 text-red-500 rotate-180" />
                      )}
                      {insight.trend === 'neutral' && (
                        <span className="h-3 w-3 block border-t border-gray-400" />
                      )}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">{insight.recommendation}</p>
                  <div className="flex items-center mt-1">
                    <span className="text-xs text-gray-500 mr-2">Confidence:</span>
                    <Progress value={insight.confidence} className="h-1.5 flex-grow" />
                    <span className="text-xs font-medium ml-2">{insight.confidence}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle>Therapeutic Areas</CardTitle>
            <CardDescription>Distribution of analyzed CSRs by therapeutic area</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 h-48 flex items-center justify-center bg-gray-50 rounded-md">
              <div className="text-center">
                <PieChart className="h-16 w-16 text-indigo-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Therapeutic Area Distribution</p>
              </div>
            </div>
            <div className="space-y-3">
              {taDistribution.map((area, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full bg-indigo-500`}></div>
                    <span>{area.name}</span>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">{area.count}</span>
                    <span className="text-gray-500 ml-1">({area.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CSRDashboard;
