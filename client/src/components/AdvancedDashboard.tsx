import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Loader2, Download, ChevronDown, FileText, 
  BarChart, PieChart, LineChart, Users, Calendar, 
  TrendingUp, AlertTriangle, Info, Search
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart as RechartsBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  LineChart as RechartsLineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell
} from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

// Types for dashboard data
interface DashboardData {
  adverseEventsByAgeBracket: Array<{
    age: string;
    count: number;
    percent: number;
  }>;
  adverseEventsBySeverity: Array<{
    severity: string;
    count: number;
    percent: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    count: number;
  }>;
  topReportedEvents: Array<{
    event: string;
    count: number;
    percent: number;
  }>;
  [key: string]: any;
}

// Default mock data - will be replaced with API data
const DEFAULT_DASHBOARD_DATA: DashboardData = {
  adverseEventsByAgeBracket: [
    { age: "0-17", count: 25, percent: 5 },
    { age: "18-29", count: 87, percent: 17.4 },
    { age: "30-49", count: 142, percent: 28.4 },
    { age: "50-64", count: 156, percent: 31.2 },
    { age: "65+", count: 90, percent: 18 }
  ],
  adverseEventsBySeverity: [
    { severity: "Mild", count: 187, percent: 37.4 },
    { severity: "Moderate", count: 223, percent: 44.6 },
    { severity: "Severe", count: 71, percent: 14.2 },
    { severity: "Life-threatening", count: 19, percent: 3.8 }
  ],
  monthlyTrends: Array.from({ length: 12 }, (_, i) => ({
    month: new Date(2024, i, 1).toLocaleString('default', { month: 'short' }),
    count: Math.floor(Math.random() * 50) + 20
  })),
  topReportedEvents: [
    { event: "Headache", count: 87, percent: 17.4 },
    { event: "Nausea", count: 76, percent: 15.2 },
    { event: "Fatigue", count: 59, percent: 11.8 },
    { event: "Dizziness", count: 47, percent: 9.4 },
    { event: "Rash", count: 33, percent: 6.6 }
  ]
};

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { 
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { 
    y: 0, 
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

// Props type
interface AdvancedDashboardProps {
  filteredData?: {
    query: string;
    results: Array<any>;
    timestamp: string;
    interpretation?: string;
    [key: string]: any;
  } | null;
}

/**
 * ChartCard Component - Wrapper for visualization cards
 */
interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, description, children }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

/**
 * SimplePieChart Component - Renders a horizontal bar-style pie chart
 */
interface SimplePieChartProps {
  data: Array<Record<string, any>>;
  labelKey: string;
  valueKey: string;
}

const SimplePieChart: React.FC<SimplePieChartProps> = ({ data, labelKey, valueKey }) => {
  const total = useMemo(() => data.reduce((sum, item) => sum + item[valueKey], 0), [data, valueKey]);
  
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A569BD', '#8884d8'];
  
  return (
    <div className="space-y-3">
      {data.map((item, i) => {
        const percentage = Math.round((item[valueKey] / total) * 100);
        return (
          <div key={i} className="flex items-center">
            <div className={`w-3 h-3 bg-[${COLORS[i % COLORS.length]}] rounded-full mr-2`}></div>
            <div className="flex-1">
              <div className="text-sm font-medium">{item[labelKey]}</div>
              <div className="h-2 bg-muted rounded-full mt-1">
                <div 
                  className="h-2 rounded-full"
                  style={{ 
                    width: `${percentage}%`, 
                    backgroundColor: COLORS[i % COLORS.length] 
                  }}
                ></div>
              </div>
            </div>
            <div className="ml-2 text-sm text-muted-foreground">
              {percentage}%
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * AdvancedDashboard Component - Main dashboard with various visualizations
 */
const AdvancedDashboard: React.FC<AdvancedDashboardProps> = ({ filteredData }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  
  const { toast } = useToast();

  // Fetch dashboard data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // In a real implementation, we would fetch from the API
        // await new Promise(resolve => setTimeout(resolve, 1000));
        
        // For now, use the default data
        setDashboardData(DEFAULT_DASHBOARD_DATA);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        
        // toast call replaced
  // Original: toast({
          title: "Loading Error",
          description: "Failed to load dashboard data. Please try again.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "Loading Error",
          description: "Failed to load dashboard data. Please try again.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [toast]);

  // Prepare display data - use filtered data or original data
  const displayData = useMemo(() => {
    if (filteredData?.results?.length) {
      // This is a simplified implementation
      // In a real application, we would map the filtered results to the dashboard data format
      return dashboardData;
    }
    return dashboardData;
  }, [filteredData, dashboardData]);

  // Export PDF handler
  const handleExportPDF = useCallback(() => {
    // In a real implementation, this would trigger a PDF export
    // toast call replaced
  // Original: toast({
      title: "PDF Export",
      description: "This feature would export the current dashboard view as a PDF.",
    })
  console.log('Toast would show:', {
      title: "PDF Export",
      description: "This feature would export the current dashboard view as a PDF.",
    });
  }, [toast]);

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span className="text-lg">Loading dashboard data...</span>
      </div>
    );
  }

  // No data state
  if (!displayData) {
    return (
      <div className="text-center p-12">
        <Info className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
        <p className="text-muted-foreground">No data available to display.</p>
        <p className="text-xs text-muted-foreground mt-2">
          Try selecting a different time period or check your connection.
        </p>
      </div>
    );
  }

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-6"
    >
      <motion.div variants={itemVariants} className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Advanced Data Visualization</h2>
        <Button onClick={handleExportPDF} className="flex items-center">
          <Download className="mr-2 h-4 w-4" />
          Export PDF
        </Button>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 mb-6">
          <TabsTrigger value="overview" className="flex items-center">
            <BarChart className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="demographics" className="flex items-center">
            <Users className="mr-2 h-4 w-4" />
            Demographics
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center">
            <TrendingUp className="mr-2 h-4 w-4" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center">
            <FileText className="mr-2 h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            <ChartCard 
              title="Adverse Events by Age" 
              description="Distribution across age brackets"
            >
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart 
                    data={displayData.adverseEventsByAgeBracket}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="age" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => [`${value} events`, 'Count']}
                      labelFormatter={(label) => `Age group: ${label}`}
                    />
                    <Bar dataKey="count" fill="#8884d8" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard 
              title="Events by Severity" 
              description="Classification of reported adverse events"
            >
              <SimplePieChart 
                data={displayData.adverseEventsBySeverity} 
                labelKey="severity" 
                valueKey="count" 
              />
            </ChartCard>
          </motion.div>

          <motion.div variants={itemVariants}>
            <ChartCard 
              title="Monthly Reporting Trends" 
              description="Number of adverse events reported by month"
            >
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart
                    data={displayData.monthlyTrends}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#8884d8"
                      activeDot={{ r: 8 }}
                      strokeWidth={2}
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </motion.div>
        </TabsContent>

        <TabsContent value="demographics" className="space-y-4">
          <motion.div variants={itemVariants}>
            <ChartCard title="Patient Demographics" description="Detailed breakdown of patient data">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium mb-2">Age Distribution</h4>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={displayData.adverseEventsByAgeBracket}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {displayData.adverseEventsByAgeBracket.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={`hsl(${index * 45}, 70%, 60%)`} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => [`${value} events`, 'Count']} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="text-sm font-medium mb-2">Demographics Summary</h4>
                  <div className="space-y-2">
                    <div className="bg-muted/30 p-3 rounded-md">
                      <div className="text-sm font-medium">Total Reports</div>
                      <div className="text-2xl font-bold mt-1">500</div>
                      <div className="text-xs text-muted-foreground mt-1">From all sources</div>
                    </div>
                    
                    <div className="bg-muted/30 p-3 rounded-md">
                      <div className="text-sm font-medium">Age Range</div>
                      <div className="text-2xl font-bold mt-1">0-85+</div>
                      <div className="text-xs text-muted-foreground mt-1">Years old</div>
                    </div>
                    
                    <div className="bg-muted/30 p-3 rounded-md">
                      <div className="text-sm font-medium">Most Affected</div>
                      <div className="text-2xl font-bold mt-1">50-64</div>
                      <div className="text-xs text-muted-foreground mt-1">Age group with highest incidents</div>
                    </div>
                  </div>
                </div>
              </div>
            </ChartCard>
          </motion.div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <motion.div variants={itemVariants}>
            <ChartCard title="Longitudinal Analysis" description="Trends over time by quarter and year">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart
                    data={displayData.monthlyTrends}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Event Count"
                      stroke="#8884d8"
                      activeDot={{ r: 8 }}
                      strokeWidth={2}
                    />
                    {/* Add additional lines here in a real implementation */}
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-6 flex flex-wrap gap-4 justify-center">
                <Button variant="outline" size="sm">
                  <Calendar className="mr-2 h-4 w-4" />
                  Last 12 Months
                </Button>
                <Button variant="outline" size="sm">
                  <Calendar className="mr-2 h-4 w-4" />
                  Year-over-Year
                </Button>
                <Button variant="outline" size="sm">
                  <Calendar className="mr-2 h-4 w-4" />
                  Quarterly
                </Button>
              </div>
            </ChartCard>
          </motion.div>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <motion.div variants={itemVariants}>
            <ChartCard title="Top Reported Events" description="Most common adverse events">
              <div className="space-y-4">
                <div className="overflow-auto max-h-[350px]">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left pb-2 font-medium">Event</th>
                        <th className="text-right pb-2 font-medium">Count</th>
                        <th className="text-right pb-2 font-medium">Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayData.topReportedEvents.map((event, i) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-3">{event.event}</td>
                          <td className="py-3 text-right">{event.count}</td>
                          <td className="py-3 text-right">{event.percent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="text-center pt-4">
                  <Button variant="outline">
                    View All Reports
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </ChartCard>
          </motion.div>
        </TabsContent>
      </Tabs>

      {filteredData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="bg-muted/30 border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Info className="h-4 w-4 mr-2" />
                Query Results
              </CardTitle>
              <CardDescription>
                Results filtered by your natural language query
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-3 bg-accent/30 rounded-lg">
                  <p className="font-medium">Query: {filteredData.query}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Timestamp: {new Date(filteredData.timestamp).toLocaleString()}
                  </p>
                  {filteredData.interpretation && (
                    <p className="text-sm mt-2 pt-2 border-t border-muted">
                      {filteredData.interpretation}
                    </p>
                  )}
                </div>
                
                <div className="p-4">
                  <h4 className="font-semibold mb-2">Matched Results:</h4>
                  <ul className="space-y-2">
                    {filteredData.results.map((result, i) => (
                      <li key={i} className="flex justify-between border-b pb-2">
                        <span>{result.name}</span>
                        <span className="text-sm text-muted-foreground">
                          Relevance: {Math.round(result.relevance * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
};

export default AdvancedDashboard;