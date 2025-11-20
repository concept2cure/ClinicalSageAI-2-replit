import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import axios from 'axios';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Loader2, TrendingUp, Activity, FileText, Users, Award, PieChart as PieChartIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from '@/components/ui/button';

export default function AnalyticsPage() {
  const { toast } = useToast();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [timeFrame, setTimeFrame] = useState('all');
  const [filterIndication, setFilterIndication] = useState('all');
  const [filterPhase, setFilterPhase] = useState('all');
  const [indications, setIndications] = useState([]);
  const [phases, setPhases] = useState([]);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

  useEffect(() => {
    fetchAnalytics();
  }, [timeFrame, filterIndication, filterPhase]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const params = {
        timeFrame,
        indication: filterIndication !== 'all' ? filterIndication : undefined,
        phase: filterPhase !== 'all' ? filterPhase : undefined
      };
      
      const response = await axios.get('/api/analytics/dashboard', { params });
      setAnalytics(response.data);
      
      // Extract unique indications and phases for filters
      if (response.data.filters) {
        setIndications(response.data.filters.indications || []);
        setPhases(response.data.filters.phases || []);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      // toast call replaced
  // Original: toast({
        title: "Failed to load analytics",
        description: "Please try again or contact support if the issue persists.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Failed to load analytics",
        description: "Please try again or contact support if the issue persists.",
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  const handleExportReport = async () => {
    try {
      setDownloadingReport(true);
      const response = await axios.get('/api/analytics/export', {
        params: {
          timeFrame,
          indication: filterIndication !== 'all' ? filterIndication : undefined,
          phase: filterPhase !== 'all' ? filterPhase : undefined,
          format: 'pdf'
        },
        responseType: 'blob'
      });
      
      // Create a URL for the blob and trigger download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `lumen_analytics_report_${new Date().toISOString().slice(0,10)}.pdf`);
      document.body.appendChild(link);
      link.click();
      
      // toast call replaced
  // Original: toast({
        title: "Report Downloaded",
        description: "Your analytics report has been downloaded successfully.",
      })
  console.log('Toast would show:', {
        title: "Report Downloaded",
        description: "Your analytics report has been downloaded successfully.",
      });
      setDownloadingReport(false);
    } catch (error) {
      console.error('Error exporting report:', error);
      // toast call replaced
  // Original: toast({
        title: "Export Failed",
        description: "Failed to generate and download the report. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Export Failed",
        description: "Failed to generate and download the report. Please try again.",
        variant: "destructive"
      });
      setDownloadingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <h3 className="text-xl font-semibold">Loading Analytics Dashboard</h3>
        <p className="text-muted-foreground">Analyzing trial data and preparing insights...</p>
      </div>
    );
  }

  // Format data for charts
  const formatDataForBarChart = (data) => {
    if (!data || !data.reportsByIndication) return [];
    return Object.entries(data.reportsByIndication).map(([key, value]) => ({
      name: key,
      count: value
    })).sort((a, b) => b.count - a.count).slice(0, 10);
  };

  const formatDataForPieChart = (data) => {
    if (!data || !data.reportsByPhase) return [];
    return Object.entries(data.reportsByPhase).map(([key, value]) => ({
      name: key || 'Unknown',
      value
    }));
  };

  const formatMonthlyTrends = (data) => {
    if (!data || !data.monthlyTrends) return [];
    return data.monthlyTrends.map(item => ({
      name: item.month,
      count: item.count
    }));
  };

  const formatEndpointData = (data) => {
    if (!data || !data.mostCommonEndpoints) return [];
    return data.mostCommonEndpoints.map(endpoint => ({
      name: endpoint.name,
      count: endpoint.count,
      successRate: endpoint.successRate * 100
    })).slice(0, 8);
  };

  const formatCompletionRates = (data) => {
    if (!data || !data.completionRates) return [];
    return data.completionRates.map(item => ({
      name: item.phase || 'Unknown',
      rate: item.rate * 100
    }));
  };

  const formatPredictiveInsights = (data) => {
    if (!data || !data.predictiveInsights) return [];
    return data.predictiveInsights.map(item => ({
      name: item.indication.substring(0, 20) + (item.indication.length > 20 ? '...' : ''),
      successProb: item.successProbability * 100,
      enrollment: item.projectedEnrollment
    })).slice(0, 6);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">Trial Analytics Intelligence</h1>
          <p className="text-muted-foreground">
            Comprehensive analytics and insights from {analytics?.totalReports || 0} clinical study reports
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <Select value={timeFrame} onValueChange={setTimeFrame}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Time Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="year">Past Year</SelectItem>
              <SelectItem value="quarter">Past Quarter</SelectItem>
              <SelectItem value="month">Past Month</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={filterIndication} onValueChange={setFilterIndication}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Indication" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Indications</SelectItem>
              {indications.map(ind => (
                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={filterPhase} onValueChange={setFilterPhase}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Phase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Phases</SelectItem>
              {phases.map(phase => (
                <SelectItem key={phase} value={phase}>{phase || 'Unknown'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            variant="default" 
            className="ml-auto" 
            onClick={handleExportReport}
            disabled={downloadingReport}
          >
            {downloadingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Export Report
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 grid grid-cols-2 lg:grid-cols-5 max-w-4xl mx-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trials">Trial Distribution</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoint Analysis</TabsTrigger>
          <TabsTrigger value="outcomes">Outcome Metrics</TabsTrigger>
          <TabsTrigger value="predictive">Predictive Insights</TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total CSR Reports</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics?.totalReports || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {analytics?.recentAdditions || 0} added in the last 30 days
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unique Indications</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics?.uniqueIndications || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Across {analytics?.totalReports || 0} reports
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg. Endpoints</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics?.averageEndpoints?.toFixed(1) || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Per clinical study
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg. Completion Rate</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics?.averageCompletionRate ? (analytics.averageCompletionRate * 100).toFixed(1) + '%' : '0%'}</div>
                <p className="text-xs text-muted-foreground">
                  Across all phases
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle>Reports by Indication</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={formatDataForBarChart(analytics)}
                      margin={{ top: 5, right: 30, left: 20, bottom: 70 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#4f46e5" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle>Reports by Phase</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80 flex justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={formatDataForPieChart(analytics)}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {formatDataForPieChart(analytics).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Monthly Report Submissions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={formatMonthlyTrends(analytics)}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke="#4f46e5" activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Trial Distribution Tab */}
        <TabsContent value="trials">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <Card className="md:col-span-2 lg:col-span-2">
              <CardHeader>
                <CardTitle>Distribution by Sponsor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics?.sponsorDistribution?.map(s => ({ name: s.name, count: s.count })).slice(0, 15) || []}
                      margin={{ top: 5, right: 30, left: 20, bottom: 70 }}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={120} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="#4338ca" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Study Duration Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics?.durationDistribution?.map(d => ({ 
                          name: d.range + " months", 
                          value: d.count 
                        })) || []}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {(analytics?.durationDistribution || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Sample Size Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics?.sampleSizeDistribution?.map(s => ({ 
                        name: s.range, 
                        count: s.count 
                      })) || []}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="#0ea5e9" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Study Design Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics?.designDistribution?.map(d => ({ 
                          name: d.design, 
                          value: d.count 
                        })) || []}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {(analytics?.designDistribution || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Endpoint Analysis Tab */}
        <TabsContent value="endpoints">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Most Common Endpoints</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={formatEndpointData(analytics)}
                      margin={{ top: 5, right: 30, left: 20, bottom: 70 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} />
                      <YAxis yAxisId="left" orientation="left" stroke="#4f46e5" />
                      <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="count" name="Frequency" fill="#4f46e5" />
                      <Bar yAxisId="right" dataKey="successRate" name="Success Rate (%)" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Endpoint Types Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics?.endpointTypeDistribution?.map(e => ({ 
                          name: e.type, 
                          value: e.count 
                        })) || []}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {(analytics?.endpointTypeDistribution || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Endpoint Success Rates by Phase</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics?.endpointSuccessByPhase?.map(e => ({ 
                        name: e.phase || 'Unknown', 
                        primary: e.primaryRate * 100, 
                        secondary: e.secondaryRate * 100 
                      })) || []}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis label={{ value: 'Success Rate (%)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="primary" name="Primary Endpoints" fill="#4f46e5" />
                      <Bar dataKey="secondary" name="Secondary Endpoints" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Outcome Metrics Tab */}
        <TabsContent value="outcomes">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card>
              <CardHeader>
                <CardTitle>Trial Completion Rates by Phase</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={formatCompletionRates(analytics)}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis label={{ value: 'Completion Rate (%)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="rate" name="Completion Rate" fill="#4f46e5" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Outcome Success Rates by Indication</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics?.outcomesByIndication?.map(o => ({ 
                        name: o.indication.substring(0, 15) + (o.indication.length > 15 ? '...' : ''), 
                        rate: o.successRate * 100 
                      })).slice(0, 8) || []}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 100]} />
                      <YAxis type="category" dataKey="name" width={120} />
                      <Tooltip formatter={(value) => [value.toFixed(1) + '%', 'Success Rate']} />
                      <Legend />
                      <Bar dataKey="rate" name="Success Rate (%)" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Average Study Duration by Outcome</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics?.durationByOutcome?.map(d => ({ 
                        name: d.outcome, 
                        duration: d.averageDuration 
                      })) || []}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis label={{ value: 'Duration (months)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="duration" name="Avg. Duration (months)" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Early Termination Reasons</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics?.terminationReasons?.map(t => ({ 
                          name: t.reason, 
                          value: t.count 
                        })) || []}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {(analytics?.terminationReasons || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Predictive Insights Tab */}
        <TabsContent value="predictive">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Predicted Success Probability by Indication</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={formatPredictiveInsights(analytics)}
                      margin={{ top: 5, right: 30, left: 20, bottom: 70 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} />
                      <YAxis yAxisId="left" orientation="left" stroke="#4f46e5" />
                      <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="successProb" name="Success Probability (%)" fill="#4f46e5" />
                      <Bar yAxisId="right" dataKey="enrollment" name="Projected Enrollment" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Model Confidence Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics?.modelConfidenceDistribution?.map(c => ({ 
                          name: c.range + "%", 
                          value: c.count 
                        })) || []}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {(analytics?.modelConfidenceDistribution || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Key Success Factors by Weight</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics?.successFactors?.map(f => ({ 
                        name: f.factor, 
                        weight: f.weight * 100 
                      })).sort((a, b) => b.weight - a.weight).slice(0, 10) || []}
                      margin={{ top: 5, right: 30, left: 20, bottom: 70 }}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={150} />
                      <Tooltip formatter={(value) => [value.toFixed(1) + '%', 'Weight']}/>
                      <Legend />
                      <Bar dataKey="weight" name="Factor Importance (%)" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}