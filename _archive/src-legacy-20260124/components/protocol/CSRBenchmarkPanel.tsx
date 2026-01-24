import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Loader2, BarChart, Info, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

interface CSRBenchmarkPanelProps {
  protocolData: any;
  onBenchmarkComplete: (data: any) => void;
}

export function CSRBenchmarkPanel({ protocolData, onBenchmarkComplete }: CSRBenchmarkPanelProps) {
  const [benchmarkData, setBenchmarkData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('similar');
  const { toast } = useToast();
  
  // Fetch benchmark data
  const benchmarkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/benchmarks/analyze-protocol', protocolData);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setBenchmarkData(data.result);
        onBenchmarkComplete(data.result);
      } else {
        // toast call replaced
  // Original: toast({
          title: "Benchmark Failed",
          description: data.message || "Failed to analyze protocol against CSR benchmarks",
          variant: "destructive",
        })
  console.log('Toast would show:', {
          title: "Benchmark Failed",
          description: data.message || "Failed to analyze protocol against CSR benchmarks",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      // toast call replaced
  // Original: toast({
        title: "Benchmark Analysis Failed",
        description: error.message || "An error occurred during benchmark analysis",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Benchmark Analysis Failed",
        description: error.message || "An error occurred during benchmark analysis",
        variant: "destructive",
      });
    },
  });

  // Run benchmark when protocol data changes
  useEffect(() => {
    if (protocolData) {
      benchmarkMutation.mutate();
    }
  }, [protocolData]);

  if (benchmarkMutation.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            CSR Benchmark Analysis
          </CardTitle>
          <CardDescription>
            Analyzing your protocol against similar clinical study reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48">
            <div className="flex flex-col items-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground mt-2">Analyzing protocol against CSR database...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!benchmarkData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            CSR Benchmark Analysis
          </CardTitle>
          <CardDescription>
            Analyzing your protocol against similar clinical study reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Search className="h-8 w-8 mb-2 text-muted-foreground" />
            <p>No benchmark data available</p>
            <p className="text-sm mt-1">Unable to find similar trials in our database</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const similarTrials = benchmarkData.similarTrials || [];
  const statistics = benchmarkData.statistics || {};
  const insights = benchmarkData.insights || [];
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          CSR Benchmark Analysis
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          {similarTrials.length > 0 ? (
            <span>Found {similarTrials.length} similar clinical study reports ({statistics.successRate?.toFixed(1)}% success rate)</span>
          ) : (
            <span>No similar clinical trials found</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Similarity Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{benchmarkData.similarityScore || 0}%</div>
              <p className="text-xs text-muted-foreground mt-1">Match with database</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Sample Size Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold">{protocolData.sample_size}</div>
                <div className="text-sm text-muted-foreground">
                  vs {statistics.avgSampleSize || 0} avg
                </div>
              </div>
              <div className="flex items-center mt-1">
                <Badge variant="outline" className={
                  protocolData.sample_size > statistics.avgSampleSize ? "bg-green-100 text-green-800 hover:bg-green-100" : 
                  protocolData.sample_size < statistics.avgSampleSize ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" :
                  "bg-blue-100 text-blue-800 hover:bg-blue-100"
                }>
                  {protocolData.sample_size > statistics.avgSampleSize ? 
                    `${((protocolData.sample_size / statistics.avgSampleSize - 1) * 100).toFixed(0)}% larger` : 
                    protocolData.sample_size < statistics.avgSampleSize ? 
                    `${((1 - protocolData.sample_size / statistics.avgSampleSize) * 100).toFixed(0)}% smaller` : 
                    'Same size'}
                </Badge>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Duration Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold">{protocolData.duration_weeks} wks</div>
                <div className="text-sm text-muted-foreground">
                  vs {statistics.avgDuration || 0} avg
                </div>
              </div>
              <div className="flex items-center mt-1">
                <Badge variant="outline" className={
                  protocolData.duration_weeks > statistics.avgDuration ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" : 
                  protocolData.duration_weeks < statistics.avgDuration ? "bg-green-100 text-green-800 hover:bg-green-100" :
                  "bg-blue-100 text-blue-800 hover:bg-blue-100"
                }>
                  {protocolData.duration_weeks > statistics.avgDuration ? 
                    `${((protocolData.duration_weeks / statistics.avgDuration - 1) * 100).toFixed(0)}% longer` : 
                    protocolData.duration_weeks < statistics.avgDuration ? 
                    `${((1 - protocolData.duration_weeks / statistics.avgDuration) * 100).toFixed(0)}% shorter` : 
                    'Same duration'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <Separator />
        
        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="similar" className="flex gap-2 items-center">
              <Database className="h-4 w-4" />
              Similar Trials
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex gap-2 items-center">
              <Info className="h-4 w-4" />
              Key Insights
            </TabsTrigger>
            <TabsTrigger value="statistics" className="flex gap-2 items-center">
              <BarChart className="h-4 w-4" />
              Statistics
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="similar">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Trial ID</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Sample Size</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Similarity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {similarTrials.length > 0 ? (
                    similarTrials.map((trial: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{trial.id || `CSR-${idx+1}`}</TableCell>
                        <TableCell>{trial.phase}</TableCell>
                        <TableCell>{trial.sampleSize}</TableCell>
                        <TableCell>{trial.duration} weeks</TableCell>
                        <TableCell>
                          <Badge 
                            variant={trial.outcome === 'success' ? 'default' : 'secondary'}
                            className={trial.outcome === 'success' ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''}
                          >
                            {trial.outcome === 'success' ? 'Success' : 'Failed'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{trial.similarity}%</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        No similar trials found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          
          <TabsContent value="insights">
            <div className="space-y-4">
              {insights.length > 0 ? (
                insights.map((insight: any, idx: number) => (
                  <Alert key={idx}>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-medium">{insight.title}</div>
                      <div className="text-sm mt-1 text-muted-foreground">{insight.description}</div>
                    </AlertDescription>
                  </Alert>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No insights available for this protocol</p>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="statistics">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-3">Trial Statistics</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Average Sample Size</div>
                      <div className="text-lg font-semibold">{statistics.avgSampleSize || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Average Duration (weeks)</div>
                      <div className="text-lg font-semibold">{statistics.avgDuration || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Success Rate</div>
                      <div className="text-lg font-semibold">{statistics.successRate?.toFixed(1) || 0}%</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Dropout Rate</div>
                      <div className="text-lg font-semibold">{(statistics.dropoutRate * 100)?.toFixed(1) || 0}%</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="text-sm font-medium mb-3">Endpoint Frequency</h3>
                <div className="space-y-2">
                  {(statistics.endpointFrequency || []).slice(0, 5).map((endpoint: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center">
                      <div className="text-sm">{endpoint.name}</div>
                      <div className="text-sm font-medium">{endpoint.frequency}%</div>
                    </div>
                  ))}
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="text-sm font-medium mb-3">Critical Success Factors</h3>
                <div className="space-y-2">
                  {(statistics.successFactors || []).slice(0, 3).map((factor: any, idx: number) => (
                    <div key={idx}>
                      <div className="font-medium">{factor.factor}</div>
                      <div className="text-xs text-muted-foreground">{factor.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}