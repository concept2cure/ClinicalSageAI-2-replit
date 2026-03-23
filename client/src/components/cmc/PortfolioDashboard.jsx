import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3,
  Target,
  AlertTriangle,
  TrendingUp,
  Globe,
  Calendar,
  Activity,
  FileText,
  CheckCircle,
  Clock,
  Users,
  DollarSign,
  Package,
  Shield,
  Zap,
  Award,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function PortfolioDashboard() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [activePortfolioTab, setActivePortfolioTab] = useState('overview');
  const [portfolioMetrics, setPortfolioMetrics] = useState({
    totalSubmissions: 0, activePrograms: 0, averageRPI: 0, criticalIssues: 0,
    totalValue: 0, complianceScore: 0, onTimeDelivery: 0, agencyMeetings: 0,
  });
  const [multiProgramAnalytics, setMultiProgramAnalytics] = useState([]);
  const [crossSubmissionInsights, setCrossSubmissionInsights] = useState([]);
  const { toast } = useToast();

  async function load() {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('token');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [overviewRes, metricsRes, programsRes, insightsRes] = await Promise.allSettled([
        fetch('/api/cmc/blueprint/portfolio/overview', { headers, credentials: 'include' }),
        fetch('/api/cmc/blueprint/portfolio/metrics', { headers, credentials: 'include' }),
        fetch('/api/cmc/blueprint/portfolio/programs', { headers, credentials: 'include' }),
        fetch('/api/cmc/blueprint/portfolio/insights', { headers, credentials: 'include' }),
      ]);

      if (overviewRes.status === 'fulfilled' && overviewRes.value.ok) {
        const data = await overviewRes.value.json();
        setRows(Array.isArray(data) ? data : data.data || []);
      }
      if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
        const data = await metricsRes.value.json();
        if (data && typeof data === 'object') setPortfolioMetrics(prev => ({ ...prev, ...data }));
      }
      if (programsRes.status === 'fulfilled' && programsRes.value.ok) {
        const data = await programsRes.value.json();
        setMultiProgramAnalytics(Array.isArray(data) ? data : data.data || []);
      }
      if (insightsRes.status === 'fulfilled' && insightsRes.value.ok) {
        const data = await insightsRes.value.json();
        setCrossSubmissionInsights(Array.isArray(data) ? data : data.data || []);
      }
    } catch (error) {
      console.error('Failed to load portfolio data:', error);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function snapshot() {
    setBusy(true);
    try {
      const response = await fetch('/api/cmc/blueprint/portfolio/snapshot/save', { method: 'POST', credentials: 'include' });
      if (response.ok) {
        toast({ title: 'Portfolio Snapshot', description: 'RPI snapshots saved successfully.' });
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      toast({ title: 'Snapshot Failed', description: 'Could not save portfolio snapshot.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  const generatePortfolioReport = async () => {
    try {
      const response = await fetch('/api/cmc/blueprint/portfolio/report', { method: 'POST', credentials: 'include' });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `portfolio_report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast({ title: 'Report Generated', description: 'Portfolio report downloaded.' });
      } else {
        throw new Error('Generation failed');
      }
    } catch (error) {
      toast({ title: 'Report Failed', description: 'Could not generate portfolio report.', variant: 'destructive' });
    }
  };

  const optimizeResourceAllocation = async () => {
    try {
      const response = await fetch('/api/cmc/blueprint/portfolio/optimize', { method: 'POST', credentials: 'include' });
      if (response.ok) {
        const result = await response.json();
        toast({ title: 'Optimization Complete', description: result.message || 'Resource allocation optimized.' });
      } else {
        throw new Error('Optimization failed');
      }
    } catch (error) {
      toast({ title: 'Optimization Failed', description: 'Could not run resource optimization.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Command Center Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white rounded-lg p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Multi-Program Portfolio Command Center</h2>
            <p className="text-purple-100 mt-1">
              Enterprise regulatory portfolio analytics and cross-submission intelligence
            </p>
          </div>
          <div className="flex space-x-6 text-right">
            <div>
              <div className="text-2xl font-bold">{portfolioMetrics.totalSubmissions}</div>
              <div className="text-purple-200 text-sm">Active Submissions</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{portfolioMetrics.averageRPI}%</div>
              <div className="text-purple-200 text-sm">Avg RPI Score</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                ${(portfolioMetrics.totalValue / 1000000).toFixed(1)}M
              </div>
              <div className="text-purple-200 text-sm">Portfolio Value</div>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activePortfolioTab} onValueChange={setActivePortfolioTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">📊 Overview</TabsTrigger>
          <TabsTrigger value="programs">🎯 Programs</TabsTrigger>
          <TabsTrigger value="analytics">📈 Analytics</TabsTrigger>
          <TabsTrigger value="cross-sub">🔄 Cross-Sub</TabsTrigger>
          <TabsTrigger value="resources">👥 Resources</TabsTrigger>
          <TabsTrigger value="insights">🧠 Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Target className="w-5 h-5 mr-2 text-blue-500" />
                  Portfolio Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {portfolioMetrics.complianceScore}%
                </div>
                <Progress value={portfolioMetrics.complianceScore} className="h-2 mt-2" />
                <p className="text-sm text-gray-600 mt-1">Regulatory compliance</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />
                  Critical Issues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">
                  {portfolioMetrics.criticalIssues}
                </div>
                <p className="text-sm text-gray-600 mt-1">Require immediate attention</p>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => setActivePortfolioTab('analytics')}
                >
                  Investigate
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Clock className="w-5 h-5 mr-2 text-orange-500" />
                  On-Time Delivery
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-600">
                  {portfolioMetrics.onTimeDelivery}%
                </div>
                <Progress value={portfolioMetrics.onTimeDelivery} className="h-2 mt-2" />
                <p className="text-sm text-gray-600 mt-1">Milestone achievement</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Users className="w-5 h-5 mr-2 text-purple-500" />
                  Agency Meetings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">
                  {portfolioMetrics.agencyMeetings}
                </div>
                <p className="text-sm text-gray-600 mt-1">This quarter</p>
                <Button size="sm" variant="outline" className="mt-2">
                  Schedule Next
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Traditional Portfolio Table Enhanced */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Cross-Submission Portfolio Matrix</CardTitle>
                  <CardDescription>
                    Real-time regulatory performance indicators across all submissions
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={snapshot} disabled={busy}>
                    {busy ? 'Saving…' : 'Save RPI Snapshots'}
                  </Button>
                  <Button variant="outline" onClick={generatePortfolioReport}>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Generate Report
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto border rounded">
                <table className="min-w-[1200px] text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="p-3 text-left font-medium">Submission</th>
                      <th className="p-3 text-left font-medium">Region</th>
                      <th className="p-3 text-right font-medium">RPI</th>
                      <th className="p-3 text-right font-medium">IR (open/overdue)</th>
                      <th className="p-3 text-right font-medium">Oblig (open/overdue)</th>
                      <th className="p-3 text-right font-medium">P.8 months</th>
                      <th className="p-3 text-right font-medium">M3 missing</th>
                      <th className="p-3 text-right font-medium">Preflight CRIT</th>
                      <th className="p-3 text-right font-medium">QC alerts</th>
                      <th className="p-3 text-right font-medium">Playbook open</th>
                      <th className="p-3 text-center font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.sub_id} className="border-t hover:bg-gray-50">
                        <td className="p-3 font-medium">{r.product_id}</td>
                        <td className="p-3">
                          <Badge variant="outline">{r.region}</Badge>
                        </td>
                        <td className="p-3 text-right">
                          <span
                            className={`font-medium ${r.rpi >= 95 ? 'text-green-600' : r.rpi >= 90 ? 'text-yellow-600' : 'text-red-600'}`}
                          >
                            {r.rpi}%
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {r.ir_open}/{r.ir_overdue}
                        </td>
                        <td className="p-3 text-right">
                          {r.obligations_open}/{r.obligations_overdue}
                        </td>
                        <td className="p-3 text-right">{r.stability_cov_m}</td>
                        <td className="p-3 text-right">{r.m3_missing}</td>
                        <td className="p-3 text-right">
                          <span
                            className={`font-medium ${r.preflight_critical > 0 ? 'text-red-600' : 'text-green-600'}`}
                          >
                            {r.preflight_critical}
                          </span>
                        </td>
                        <td className="p-3 text-right">{r.qc_alerts}</td>
                        <td className="p-3 text-right">{r.playbook_open}</td>
                        <td className="p-3 text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              toast({
                                title: 'Submission Details',
                                description: `Opening detailed view for ${r.product_id}`,
                              });
                            }}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td className="p-6 text-center text-slate-600" colSpan={11}>
                          No submissions found. Connect your regulatory programs to begin portfolio
                          analytics.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="programs" className="mt-6">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Multi-Program Analytics</h3>
              <Button onClick={optimizeResourceAllocation}>
                <Zap className="w-4 h-4 mr-2" />
                Optimize Resources
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {multiProgramAnalytics.map((program, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{program.program}</CardTitle>
                        <CardDescription>
                          {program.products.length} products across {program.regions.join(', ')}
                        </CardDescription>
                      </div>
                      <div className="flex space-x-2">
                        <Badge variant={program.status === 'Active' ? 'default' : 'secondary'}>
                          {program.status}
                        </Badge>
                        <Badge
                          variant={
                            program.riskLevel === 'High'
                              ? 'destructive'
                              : program.riskLevel === 'Medium'
                                ? 'default'
                                : 'secondary'
                          }
                        >
                          {program.riskLevel} Risk
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <div className="space-y-1">
                        <div className="text-sm text-gray-600">RPI Score</div>
                        <div className="text-2xl font-bold text-blue-600">{program.rpi}%</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm text-gray-600">Critical Path</div>
                        <div className="text-sm font-medium">{program.criticalPath}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm text-gray-600">Next Milestone</div>
                        <div className="text-sm font-medium">{program.nextMilestone}</div>
                        <div className="text-xs text-gray-500">{program.daysToMilestone} days</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm text-gray-600">Program Value</div>
                        <div className="text-lg font-bold text-green-600">
                          ${(program.totalValue / 1000).toFixed(0)}K
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 text-sm">
                      <div className="flex items-center space-x-1">
                        <Package className="w-4 h-4 text-gray-500" />
                        <span>Products: {program.products.join(', ')}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Globe className="w-4 h-4 text-gray-500" />
                        <span>Regions: {program.regions.join(', ')}</span>
                      </div>
                    </div>

                    <div className="flex space-x-2 mt-4">
                      <Button
                        size="sm"
                        onClick={() => {
                          toast({
                            title: 'Program Dashboard',
                            description: `Opening ${program.program} management dashboard.`,
                          });
                        }}
                      >
                        <Activity className="w-3 h-3 mr-1" />
                        Dashboard
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          toast({
                            title: 'Critical Path',
                            description: `Analyzing critical path for ${program.program}.`,
                          });
                        }}
                      >
                        <Target className="w-3 h-3 mr-1" />
                        Critical Path
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          toast({
                            title: 'Risk Analysis',
                            description: `Opening risk assessment for ${program.program}.`,
                          });
                        }}
                      >
                        <Shield className="w-3 h-3 mr-1" />
                        Risk Analysis
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cross-sub" className="mt-6">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Cross-Submission Intelligence</h3>
              <Button variant="outline">
                <FileText className="w-4 h-4 mr-2" />
                Export Analysis
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {crossSubmissionInsights.map((insight, index) => (
                <Card key={index}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {insight.category}
                      <Badge variant="outline">
                        {Math.round((insight.completed / insight.totalSections) * 100)}% Complete
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {insight.completed || insight.fulfilled || insight.responded}
                        </div>
                        <div className="text-sm text-gray-600">Completed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{insight.inProgress}</div>
                        <div className="text-sm text-gray-600">In Progress</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">
                          {insight.pending || insight.overdue}
                        </div>
                        <div className="text-sm text-gray-600">Pending/Overdue</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-600">
                          {insight.totalSections || insight.totalCommitments || insight.totalIRs}
                        </div>
                        <div className="text-sm text-gray-600">Total</div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Progress</span>
                        <span className="text-sm">
                          {Math.round(
                            ((insight.completed || insight.fulfilled || insight.responded) /
                              (insight.totalSections ||
                                insight.totalCommitments ||
                                insight.totalIRs)) *
                              100
                          )}
                          %
                        </span>
                      </div>
                      <Progress
                        value={
                          ((insight.completed || insight.fulfilled || insight.responded) /
                            (insight.totalSections ||
                              insight.totalCommitments ||
                              insight.totalIRs)) *
                          100
                        }
                        className="h-2"
                      />
                    </div>

                    <div>
                      <div className="text-sm font-medium mb-2">Common Gaps Across Programs:</div>
                      <div className="flex flex-wrap gap-2">
                        {insight.commonGaps.map((gap, gapIndex) => (
                          <Badge key={gapIndex} variant="outline" className="text-xs">
                            {gap}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex space-x-2 mt-4">
                      <Button
                        size="sm"
                        onClick={() => {
                          toast({
                            title: 'Detailed Analysis',
                            description: `Opening detailed analysis for ${insight.category}.`,
                          });
                        }}
                      >
                        <BarChart3 className="w-3 h-3 mr-1" />
                        Analyze
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          toast({
                            title: 'Action Plan',
                            description: `Generating action plan for ${insight.category} gaps.`,
                          });
                        }}
                      >
                        <Target className="w-3 h-3 mr-1" />
                        Action Plan
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Portfolio Performance Trends</CardTitle>
                <CardDescription>RPI and compliance metrics over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-200 rounded">
                  <div className="text-center">
                    <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <div className="text-sm text-gray-600">Interactive analytics chart</div>
                    <div className="text-xs text-gray-500">
                      Real-time portfolio performance visualization
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resource Utilization</CardTitle>
                <CardDescription>Cross-program resource allocation and efficiency</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-200 rounded">
                  <div className="text-center">
                    <Users className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <div className="text-sm text-gray-600">Resource optimization dashboard</div>
                    <div className="text-xs text-gray-500">
                      AI-powered allocation recommendations
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="resources" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Resource Management</CardTitle>
              <CardDescription>
                Cross-program resource allocation and capacity planning
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <div className="text-lg font-medium text-gray-600 mb-2">
                  Resource Management Dashboard
                </div>
                <div className="text-sm text-gray-500 mb-4">
                  Track and optimize resource allocation across regulatory programs
                </div>
                <Button
                  onClick={() => {
                    toast({
                      title: 'Resource Dashboard',
                      description: 'Opening comprehensive resource management interface.',
                    });
                  }}
                >
                  Launch Resource Center
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>AI-Powered Portfolio Insights</CardTitle>
              <CardDescription>
                Intelligent recommendations and predictive analytics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Award className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <div className="text-lg font-medium text-gray-600 mb-2">
                  Portfolio Intelligence Engine
                </div>
                <div className="text-sm text-gray-500 mb-4">
                  AI-driven insights for portfolio optimization and risk management
                </div>
                <Button
                  onClick={() => {
                    toast({
                      title: 'AI Insights',
                      description:
                        'Generating AI-powered portfolio recommendations and risk analysis.',
                    });
                  }}
                >
                  Generate Insights
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
