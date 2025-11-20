import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
// import { Spinner } from '@/components/ui/spinner';
import { BarChart, LineChart, XAxis, YAxis, Tooltip, Legend, Bar, Line, ResponsiveContainer, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis } from 'recharts';
import { Loader2, FileText, Brain, Database, Activity, Search, TrendingUp, ChevronDown, ChevronRight, ArrowRightCircle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

interface DeepLearningPanelProps {
  csrs?: any[];
  onAnalysisComplete?: (result: any) => void;
}

export function DeepLearningPanel({ csrs = [], onAnalysisComplete }: DeepLearningPanelProps) {
  const [activeTab, setActiveTab] = useState('clusters');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndication, setSelectedIndication] = useState('');
  const [selectedCsrs, setSelectedCsrs] = useState<string[]>([]);
  const [progressValue, setProgressValue] = useState(0);
  const { toast } = useToast();
  
  // States for pattern discovery
  const [patternLimit, setPatternLimit] = useState<number>(50);
  
  // States for cluster analysis
  const [clusterLimit, setClusterLimit] = useState<number>(100);
  
  // States for insight mining
  const [insightLimit, setInsightLimit] = useState<number>(100);
  
  // States for strategic intelligence
  const [insightQuery, setInsightQuery] = useState<string>('');

  const indications = csrs.reduce((acc: string[], csr: any) => {
    if (csr.indication && !acc.includes(csr.indication)) {
      acc.push(csr.indication);
    }
    return acc;
  }, []);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setProgressValue(prev => {
          const increment = Math.random() * 15;
          return Math.min(prev + increment, 95); // Cap at 95% until complete
        });
      }, 1000);
      
      return () => clearInterval(interval);
    } else {
      setProgressValue(0);
    }
  }, [isLoading]);

  const runClusterAnalysis = async () => {
    if (clusterLimit <= 0) {
      // toast call replaced
  // Original: toast({
        title: "Input Error",
        description: "Please enter a positive number for CSR limit",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Input Error",
        description: "Please enter a positive number for CSR limit",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    setProgressValue(0);
    
    try {
      const response = await fetch('/api/deep-learning/identify-clusters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          limit: clusterLimit
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const result = await response.json();
      setAnalysisResult(result);
      
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
      
      // toast call replaced
  // Original: toast({
        title: "Analysis Complete",
        description: "CSR clusters identified successfully",
      })
  console.log('Toast would show:', {
        title: "Analysis Complete",
        description: "CSR clusters identified successfully",
      });
      setProgressValue(100);
    } catch (error) {
      console.error('Error identifying CSR clusters:', error);
      // toast call replaced
  // Original: toast({
        title: "Analysis Failed",
        description: "Failed to identify CSR clusters. See console for details.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Analysis Failed",
        description: "Failed to identify CSR clusters. See console for details.",
        variant: "destructive",
      });
      setProgressValue(0);
    } finally {
      setIsLoading(false);
    }
  };

  const runPatternDiscovery = async () => {
    if (patternLimit <= 0) {
      // toast call replaced
  // Original: toast({
        title: "Input Error",
        description: "Please enter a positive number for CSR limit",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Input Error",
        description: "Please enter a positive number for CSR limit",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    setProgressValue(0);
    
    try {
      const response = await fetch('/api/deep-learning/discover-patterns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          limit: patternLimit
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const result = await response.json();
      setAnalysisResult(result);
      
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
      
      // toast call replaced
  // Original: toast({
        title: "Analysis Complete",
        description: "CSR patterns discovered successfully",
      })
  console.log('Toast would show:', {
        title: "Analysis Complete",
        description: "CSR patterns discovered successfully",
      });
      setProgressValue(100);
    } catch (error) {
      console.error('Error discovering CSR patterns:', error);
      // toast call replaced
  // Original: toast({
        title: "Analysis Failed",
        description: "Failed to discover CSR patterns. See console for details.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Analysis Failed",
        description: "Failed to discover CSR patterns. See console for details.",
        variant: "destructive",
      });
      setProgressValue(0);
    } finally {
      setIsLoading(false);
    }
  };

  const runInsightMining = async () => {
    if (insightLimit <= 0) {
      // toast call replaced
  // Original: toast({
        title: "Input Error",
        description: "Please enter a positive number for CSR limit",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Input Error",
        description: "Please enter a positive number for CSR limit",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    setProgressValue(0);
    
    try {
      const response = await fetch('/api/deep-learning/mine-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          limit: insightLimit
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const result = await response.json();
      setAnalysisResult(result);
      
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
      
      // toast call replaced
  // Original: toast({
        title: "Analysis Complete",
        description: "Clinical insights mined successfully",
      })
  console.log('Toast would show:', {
        title: "Analysis Complete",
        description: "Clinical insights mined successfully",
      });
      setProgressValue(100);
    } catch (error) {
      console.error('Error mining clinical insights:', error);
      // toast call replaced
  // Original: toast({
        title: "Analysis Failed",
        description: "Failed to mine clinical insights. See console for details.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Analysis Failed",
        description: "Failed to mine clinical insights. See console for details.",
        variant: "destructive",
      });
      setProgressValue(0);
    } finally {
      setIsLoading(false);
    }
  };

  const generateStrategicIntelligence = async () => {
    if (!selectedIndication) {
      // toast call replaced
  // Original: toast({
        title: "Selection Error",
        description: "Please select an indication for strategic analysis",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Selection Error",
        description: "Please select an indication for strategic analysis",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    setProgressValue(0);
    
    try {
      const response = await fetch('/api/deep-learning/strategic-intelligence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          indication: selectedIndication
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const result = await response.json();
      setAnalysisResult(result);
      
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
      
      // toast call replaced
  // Original: toast({
        title: "Analysis Complete",
        description: `Strategic intelligence generated for ${selectedIndication}`,
      })
  console.log('Toast would show:', {
        title: "Analysis Complete",
        description: `Strategic intelligence generated for ${selectedIndication}`,
      });
      setProgressValue(100);
    } catch (error) {
      console.error('Error generating strategic intelligence:', error);
      // toast call replaced
  // Original: toast({
        title: "Analysis Failed",
        description: "Failed to generate strategic intelligence. See console for details.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Analysis Failed",
        description: "Failed to generate strategic intelligence. See console for details.",
        variant: "destructive",
      });
      setProgressValue(0);
    } finally {
      setIsLoading(false);
    }
  };

  const renderAnalysisResult = () => {
    if (!analysisResult) return null;
    
    switch (activeTab) {
      case 'clusters':
        return renderClusterResult();
      case 'patterns':
        return renderPatternResult();
      case 'insights':
        return renderInsightResult();
      case 'strategic':
        return renderStrategicResult();
      default:
        return (
          <div className="p-4">
            <pre className="bg-gray-100 p-4 rounded-md overflow-auto">
              {JSON.stringify(analysisResult, null, 2)}
            </pre>
          </div>
        );
    }
  };

  const renderClusterResult = () => {
    if (!analysisResult?.cluster_results) {
      if (analysisResult?.visualization) {
        return (
          <div className="flex justify-center">
            <img 
              src={analysisResult.visualization} 
              alt="CSR Cluster Visualization" 
              className="max-w-full rounded-lg border border-gray-200 shadow-md"
            />
          </div>
        );
      }
      return null;
    }
    
    const { kmeans, dbscan, visualization } = analysisResult.cluster_results;
    
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>K-Means Clustering</CardTitle>
              <CardDescription>
                Identified {kmeans.n_clusters} distinct clusters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold mb-2">Cluster Distribution</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={kmeans.cluster_sizes.map((size: number, i: number) => ({ name: `Cluster ${i+1}`, size }))}>
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="size" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>DBSCAN Clustering</CardTitle>
              <CardDescription>
                Identified {dbscan.n_clusters} natural clusters with {dbscan.noise_points} noise points
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold mb-2">Cluster Distribution</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={[
                          ...dbscan.cluster_sizes.map((size: number, i: number) => ({ name: `Cluster ${i+1}`, value: size })),
                          { name: 'Noise Points', value: dbscan.noise_points }
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {[...dbscan.cluster_sizes.map((_: number, i: number) => i), -1].map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {visualization?.tsne_coordinates && (
          <Card>
            <CardHeader>
              <CardTitle>2D Visualization of CSR Embeddings</CardTitle>
              <CardDescription>
                t-SNE projection of high-dimensional embeddings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <XAxis type="number" dataKey="x" name="t-SNE 1" />
                    <YAxis type="number" dataKey="y" name="t-SNE 2" />
                    <ZAxis range={[60, 60]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                    <Legend />
                    <Scatter
                      name="CSR Embeddings"
                      data={visualization.tsne_coordinates.map((coord: number[], i: number) => ({
                        x: coord[0],
                        y: coord[1],
                        cluster: kmeans.labels[i],
                      }))}
                      fill="#8884d8"
                      className="fill-blue-500"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
        
        {analysisResult?.visualization && (
          <div className="flex justify-center mt-4">
            <img 
              src={analysisResult.visualization} 
              alt="CSR Cluster Visualization" 
              className="max-w-full rounded-lg border border-gray-200 shadow-md"
            />
          </div>
        )}
      </div>
    );
  };

  const renderPatternResult = () => {
    if (!analysisResult?.patterns) return null;
    
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Discovered CSR Data Patterns</CardTitle>
            <CardDescription>
              {analysisResult.patterns.length} significant patterns identified
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {analysisResult.patterns.map((pattern: any, index: number) => (
                <AccordionItem key={index} value={`pattern-${index}`}>
                  <AccordionTrigger className="hover:bg-gray-50 px-4">
                    <div className="flex items-center">
                      <div className="w-4 h-4 mr-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                      <span className="font-medium">{pattern.description}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        (Explains {(pattern.variance_explained * 100).toFixed(1)}% of variance)
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pt-2">
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Top Examples</h4>
                          <ul className="text-sm space-y-1">
                            {pattern.top_examples.map((id: number, i: number) => {
                              const csr = csrs.find(c => c.id === id);
                              return (
                                <li key={i} className="flex items-center">
                                  <ArrowRightCircle size={14} className="mr-1 text-blue-500" />
                                  {csr ? `${csr.title} (${csr.sponsor})` : `CSR #${id}`}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Opposite Examples</h4>
                          <ul className="text-sm space-y-1">
                            {pattern.bottom_examples.map((id: number, i: number) => {
                              const csr = csrs.find(c => c.id === id);
                              return (
                                <li key={i} className="flex items-center">
                                  <ArrowRightCircle size={14} className="mr-1 text-red-500" />
                                  {csr ? `${csr.title} (${csr.sponsor})` : `CSR #${id}`}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderInsightResult = () => {
    if (!analysisResult?.insights) return null;
    
    const insights = analysisResult.insights;
    
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Indication Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={Object.entries(insights.indications_summary || {})
                    .map(([indication, count]) => ({ name: indication, count }))}
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                >
                  <XAxis 
                    dataKey="name" 
                    angle={-45} 
                    textAnchor="end" 
                    interval={0} 
                    height={100}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Phase Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={Object.entries(insights.phase_summary || {})
                      .map(([phase, count], index) => ({ name: phase, value: count }))}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {Object.keys(insights.phase_summary || {}).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Study Design Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Most Common Study Designs</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={Object.entries(insights.study_design_patterns || {})
                      .sort((a, b) => (b[1] as number) - (a[1] as number))
                      .slice(0, 8)
                      .map(([design, count]) => ({ name: design, count }))}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      interval={0} 
                      height={100}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#00C49F" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Most Common Endpoints</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={Object.entries(insights.endpoint_frequency || {})
                      .sort((a, b) => (b[1] as number) - (a[1] as number))
                      .slice(0, 8)
                      .map(([endpoint, count]) => ({ name: endpoint, count }))}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      interval={0} 
                      height={100}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#FF8042" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {insights.temporal_trends && Object.keys(insights.temporal_trends).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Temporal Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={Object.entries(insights.temporal_trends)
                    .map(([year, data]: [string, any]) => ({ year, count: data.count }))}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#8884d8" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderStrategicResult = () => {
    if (!analysisResult?.report) return null;
    
    const report = analysisResult.report;
    
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Strategic Intelligence Report for {report.indication}</CardTitle>
            <CardDescription>Generated on {report.report_date}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-lg font-bold mb-1">
                      {report.summary.total_csrs}
                    </h3>
                    <p className="text-sm text-muted-foreground">Total CSRs Analyzed</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-lg font-bold mb-1">
                      {Object.keys(report.summary.top_sponsors || {}).length}
                    </h3>
                    <p className="text-sm text-muted-foreground">Sponsors Active in This Area</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-lg font-bold mb-1">
                      {Object.keys(report.summary.top_designs || {}).length}
                    </h3>
                    <p className="text-sm text-muted-foreground">Common Study Designs</p>
                  </CardContent>
                </Card>
              </div>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="recommendations">
                  <AccordionTrigger>
                    <div className="flex items-center">
                      <TrendingUp className="w-5 h-5 mr-2 text-blue-500" />
                      <span>Strategic Recommendations</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      {report.strategic_recommendations && report.strategic_recommendations.map((rec: any, i: number) => (
                        <div key={i} className="bg-gray-50 p-4 rounded-md">
                          <h4 className="font-semibold text-md mb-1">{rec.recommendation}</h4>
                          <p className="text-sm mb-2">{rec.rationale}</p>
                          <div className="text-sm text-blue-600">
                            <span className="font-semibold">Potential Impact:</span> {rec.potential_impact}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="competitive">
                  <AccordionTrigger>
                    <div className="flex items-center">
                      <Database className="w-5 h-5 mr-2 text-green-500" />
                      <span>Competitive Landscape</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      <Card>
                        <CardContent className="pt-6">
                          <h4 className="text-sm font-semibold mb-2">Market Concentration</h4>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <div className="text-md font-semibold">
                                {(report.competitive_landscape?.market_concentration?.top_3_share * 100).toFixed(1)}%
                              </div>
                              <div className="text-xs text-muted-foreground">Top 3 Share</div>
                            </div>
                            <div>
                              <div className="text-md font-semibold">
                                {(report.competitive_landscape?.market_concentration?.top_5_share * 100).toFixed(1)}%
                              </div>
                              <div className="text-xs text-muted-foreground">Top 5 Share</div>
                            </div>
                            <div>
                              <div className="text-md font-semibold">
                                {report.competitive_landscape?.market_concentration?.total_sponsors}
                              </div>
                              <div className="text-xs text-muted-foreground">Total Sponsors</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold mb-3">Top Sponsors Market Share</h4>
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie
                              data={Object.entries(report.competitive_landscape?.top_sponsors || {})
                                .map(([sponsor, count], index) => ({ name: sponsor, value: count }))}
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => 
                                `${name.length > 12 ? name.substring(0, 10) + '...' : name}: ${(percent * 100).toFixed(1)}%`
                              }
                            >
                              {Object.keys(report.competitive_landscape?.top_sponsors || {})
                                .map((_, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="success-factors">
                  <AccordionTrigger>
                    <div className="flex items-center">
                      <Activity className="w-5 h-5 mr-2 text-purple-500" />
                      <span>Critical Success Factors</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      {report.critical_success_factors && report.critical_success_factors.map((factor: any, i: number) => (
                        <div key={i} className="bg-gray-50 p-4 rounded-md">
                          <div className="flex justify-between items-center mb-2">
                            <div>
                              <span className="font-semibold">{factor.factor}:</span> {factor.value}
                            </div>
                            <div className={`px-2 py-0.5 rounded text-xs font-medium ${
                              factor.impact === 'High' ? 'bg-green-100 text-green-800' :
                              factor.impact === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {factor.impact} Impact
                            </div>
                          </div>
                          <div className="flex items-center">
                            <div className="text-sm mr-2">Success Rate:</div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                              <div
                                className="bg-blue-600 h-2.5 rounded-full"
                                style={{ width: `${factor.success_rate * 100}%` }}
                              ></div>
                            </div>
                            <div className="text-sm ml-2">{(factor.success_rate * 100).toFixed(1)}%</div>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Based on {factor.trials_count} trials
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center">
              <Brain className="w-6 h-6 mr-2 text-blue-500" />
              CSR Deep Learning Analysis
            </div>
          </CardTitle>
          <CardDescription>
            Discover deep insights from clinical study reports using advanced AI algorithms
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="clusters" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 mb-4">
              <TabsTrigger value="clusters">
                <div className="flex items-center">
                  <Database className="w-4 h-4 mr-2" />
                  <span>Cluster Analysis</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="patterns">
                <div className="flex items-center">
                  <Activity className="w-4 h-4 mr-2" />
                  <span>Pattern Discovery</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="insights">
                <div className="flex items-center">
                  <Search className="w-4 h-4 mr-2" />
                  <span>Insight Mining</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="strategic">
                <div className="flex items-center">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  <span>Strategic Intelligence</span>
                </div>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="clusters" className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="clusterLimit">Number of CSRs to Analyze</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input 
                      id="clusterLimit"
                      type="number"
                      value={clusterLimit} 
                      onChange={(e) => setClusterLimit(parseInt(e.target.value) || 0)} 
                      className="w-24"
                      min={1}
                      max={5000}
                    />
                    <span className="text-sm text-gray-500">
                      (Max available: {csrs.length})
                    </span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Identify natural clusters in your CSR database using advanced AI analysis
                  </p>
                  <Button onClick={runClusterAnalysis} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      'Identify Clusters'
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="patterns" className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="patternLimit">Number of CSRs to Analyze</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input 
                      id="patternLimit"
                      type="number"
                      value={patternLimit} 
                      onChange={(e) => setPatternLimit(parseInt(e.target.value) || 0)} 
                      className="w-24"
                      min={1}
                      max={5000}
                    />
                    <span className="text-sm text-gray-500">
                      (Max available: {csrs.length})
                    </span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Discover hidden patterns and relationships in clinical study data
                  </p>
                  <Button onClick={runPatternDiscovery} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Discovering...
                      </>
                    ) : (
                      'Discover Patterns'
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="insights" className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="insightLimit">Number of CSRs to Analyze</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input 
                      id="insightLimit"
                      type="number"
                      value={insightLimit} 
                      onChange={(e) => setInsightLimit(parseInt(e.target.value) || 0)} 
                      className="w-24"
                      min={1}
                      max={5000}
                    />
                    <span className="text-sm text-gray-500">
                      (Max available: {csrs.length})
                    </span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Extract valuable insights and knowledge from clinical study reports
                  </p>
                  <Button onClick={runInsightMining} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Mining Insights...
                      </>
                    ) : (
                      'Mine Insights'
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="strategic" className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="selectedIndication">Select Indication for Analysis</Label>
                  <Select value={selectedIndication} onValueChange={setSelectedIndication}>
                    <SelectTrigger id="selectedIndication" className="w-full">
                      <SelectValue placeholder="Select an indication" />
                    </SelectTrigger>
                    <SelectContent>
                      {indications.map((indication, i) => (
                        <SelectItem key={i} value={indication}>{indication}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Generate comprehensive strategic intelligence for a specific indication
                  </p>
                  <Button onClick={generateStrategicIntelligence} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      'Generate Strategic Intelligence'
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          
          {isLoading && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-1">
                <span>Processing CSR data...</span>
                <span>{progressValue.toFixed(0)}%</span>
              </div>
              <Progress value={progressValue} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                This may take several minutes depending on the number of CSRs being analyzed
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {analysisResult && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Results</CardTitle>
          </CardHeader>
          <CardContent>
            {renderAnalysisResult()}
          </CardContent>
          <CardFooter className="justify-end">
            <Button variant="outline" onClick={() => setAnalysisResult(null)}>
              Clear Results
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}