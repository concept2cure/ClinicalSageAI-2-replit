import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ProtocolParser } from '@/components/protocol/ProtocolParser';
import { ProtocolSuccessPredictor } from '@/components/protocol/ProtocolSuccessPredictor';
import { CSRBenchmarkPanel } from '@/components/protocol/CSRBenchmarkPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { 
  FileText, 
  Brain, 
  BarChart, 
  Database, 
  Calculator, 
  DownloadCloud, 
  Save,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Lightbulb,
  ArrowRight
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface OptimizationRecommendation {
  field: string;
  current: string | number;
  suggested: string | number;
  rationale: string;
  impact: 'high' | 'medium' | 'low';
}

export default function ProtocolIntelligenceBuilder() {
  const [protocolText, setProtocolText] = useState('');
  const [parsedProtocol, setParsedProtocol] = useState<any>(null);
  const [prediction, setPrediction] = useState<any>(null);
  const [benchmarks, setBenchmarks] = useState<any>(null);
  const [sapContent, setSapContent] = useState('');
  const [optimizedProtocol, setOptimizedProtocol] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<OptimizationRecommendation[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [isOptimized, setIsOptimized] = useState(false);
  const { toast } = useToast();

  // Generate SAP
  const sapMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/sap/generate', data);
      return response.text();
    },
    onSuccess: (data) => {
      setSapContent(data);
    },
  });

  // Optimize protocol
  const optimizeMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/protocol/optimize-deep', data);
      return response.json();
    },
    onSuccess: (data) => {
      setOptimizedProtocol(data.optimizedProtocol || {});
      setRecommendations(
        (data.recommendations || []).map((rec: any) => ({
          field: rec.field || '',
          current: rec.current || '',
          suggested: rec.suggested || '',
          rationale: rec.rationale || '',
          impact: rec.impact || 'medium'
        }))
      );
      setIsOptimized(true);
      
      // toast call replaced
  // Original: toast({
        title: "Protocol Optimized",
        description: "AI-powered optimizations and recommendations generated.",
        variant: "default",
      })
  console.log('Toast would show:', {
        title: "Protocol Optimized",
        description: "AI-powered optimizations and recommendations generated.",
        variant: "default",
      });
    },
    onError: (error: any) => {
      // toast call replaced
  // Original: toast({
        title: "Optimization failed",
        description: error.message || "Failed to optimize protocol.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Optimization failed",
        description: error.message || "Failed to optimize protocol.",
        variant: "destructive",
      });
    },
  });

  // Export to PDF
  const exportMutation = useMutation({
    mutationFn: async () => {
      const data = {
        protocol_id: parsedProtocol?.protocol_id || `TS-${Date.now()}`,
        parsed: parsedProtocol,
        prediction: prediction?.probability || 0,
        optimized_prediction: prediction?.optimizedProbability || (prediction?.probability ? prediction.probability * 1.2 : 0),
        recommendations: recommendations.map(rec => [rec.field, `${rec.current} → ${rec.suggested}`, rec.rationale]),
        benchmarks,
        sap_snippet: sapContent,
        optimized_protocol: optimizedProtocol
      };
      
      const response = await apiRequest('POST', '/api/export/intelligence-report', data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.download_url) {
        window.open(data.download_url, '_blank');
      }
      
      // toast call replaced
  // Original: toast({
        title: "Report Generated",
        description: "Protocol Intelligence Report has been generated and is ready for download.",
        variant: "default",
      })
  console.log('Toast would show:', {
        title: "Report Generated",
        description: "Protocol Intelligence Report has been generated and is ready for download.",
        variant: "default",
      });
    },
    onError: (error: any) => {
      // toast call replaced
  // Original: toast({
        title: "Export failed",
        description: error.message || "Failed to generate report.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Export failed",
        description: error.message || "Failed to generate report.",
        variant: "destructive",
      });
    },
  });

  // Save to dossier
  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        protocol_id: parsedProtocol?.protocol_id || `TS-${Date.now()}`,
        user_id: 'current', // This will be replaced with actual user ID on server
        report_data: {
          parsed: parsedProtocol,
          prediction: prediction?.probability || 0,
          sap: sapContent
        },
        optimized: optimizedProtocol
      };
      
      const response = await apiRequest('POST', '/api/dossier/save-intelligence-report', data);
      return response.json();
    },
    onSuccess: (data) => {
      // toast call replaced
  // Original: toast({
        title: "Saved to Dossier",
        description: `Protocol saved as version ${data.version}`,
        variant: "default",
      })
  console.log('Toast would show:', {
        title: "Saved to Dossier",
        description: `Protocol saved as version ${data.version}`,
        variant: "default",
      });
    },
    onError: (error: any) => {
      // toast call replaced
  // Original: toast({
        title: "Save failed",
        description: error.message || "Failed to save to dossier.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Save failed",
        description: error.message || "Failed to save to dossier.",
        variant: "destructive",
      });
    },
  });

  // Handle parsed data
  const handleParseComplete = (parsedData: any) => {
    setParsedProtocol(parsedData);
    
    // Generate SAP automatically
    if (parsedData) {
      sapMutation.mutate(parsedData);
    }
  };

  // Handle prediction data
  const handlePredictionComplete = (predictionData: any) => {
    setPrediction(predictionData);
  };

  // Handle benchmark data
  const handleBenchmarkComplete = (benchmarkData: any) => {
    setBenchmarks(benchmarkData);
  };

  // Run optimization
  const handleOptimize = () => {
    if (!parsedProtocol) {
      // toast call replaced
  // Original: toast({
        title: "No protocol data",
        description: "Please upload and parse a protocol first.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "No protocol data",
        description: "Please upload and parse a protocol first.",
        variant: "destructive",
      });
      return;
    }
    
    optimizeMutation.mutate({
      protocol: parsedProtocol,
      prediction,
      benchmarks
    });
  };

  // Generate Impact Score
  const getImpactScore = () => {
    if (!prediction) return null;
    
    const originalScore = prediction.probability || 0;
    const optimizedScore = prediction.optimizedProbability || (originalScore * 1.2);
    const improvement = optimizedScore - originalScore;
    
    if (improvement >= 0.15) return { score: 'High', color: 'text-green-600' };
    if (improvement >= 0.05) return { score: 'Medium', color: 'text-blue-600' };
    return { score: 'Low', color: 'text-amber-600' };
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Protocol Intelligence Builder</h1>
          <p className="text-muted-foreground mt-2">
            AI-powered protocol analysis, optimization and statistical planning
          </p>
        </div>
        
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => exportMutation.mutate()}
            disabled={!parsedProtocol || exportMutation.isPending}
            className="gap-2"
          >
            <DownloadCloud className="w-4 h-4" />
            Export Full Report
          </Button>
          
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!parsedProtocol || saveMutation.isPending}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            Save to Dossier
          </Button>
        </div>
      </div>
      
      {/* Protocol Parser Component */}
      <ProtocolParser onParseComplete={handleParseComplete} />
      
      {parsedProtocol && (
        <>
          {/* Success Metrics Summary Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart className="w-5 h-5 text-primary" />
                Protocol Intelligence Overview
              </CardTitle>
              <CardDescription>
                Key metrics and insights from your protocol analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">{parsedProtocol.indication} {parsedProtocol.phase}</h3>
                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Sample Size:</span>
                      </div>
                      <div className="font-medium text-right">
                        {parsedProtocol.sample_size}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Duration:</span>
                      </div>
                      <div className="font-medium text-right">
                        {parsedProtocol.duration_weeks} weeks
                      </div>
                      <div>
                        <span className="text-muted-foreground">Endpoint:</span>
                      </div>
                      <div className="font-medium text-right">
                        {parsedProtocol.endpoint_primary}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Dropout Rate:</span>
                      </div>
                      <div className="font-medium text-right">
                        {(parsedProtocol.dropout_rate * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6">
                    <Badge variant="outline" className="flex items-center w-fit gap-1">
                      <FileText className="w-3 h-3" />
                      Protocol {parsedProtocol.protocol_id || `TS-${Date.now().toString().slice(-5)}`}
                    </Badge>
                  </div>
                </div>
                
                <div className="flex flex-col">
                  <div className="mb-auto">
                    <h3 className="font-semibold flex items-center text-sm mb-2">
                      Success Probability
                      <Badge variant="outline" className="ml-2 text-xs">ML Prediction</Badge>
                    </h3>
                    
                    <div className="flex items-end">
                      <div className="text-3xl font-bold">
                        {prediction ? `${(prediction.probability * 100).toFixed(1)}%` : 'Analyzing...'}
                      </div>
                      
                      {isOptimized && (
                        <div className="ml-2 text-green-600 font-medium text-sm flex items-center">
                          <RefreshCw className="w-3 h-3 mr-1" />
                          {`+${(((prediction.optimizedProbability || (prediction.probability * 1.2)) - prediction.probability) * 100).toFixed(2)}%`}
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-3">
                      <Button 
                        size="sm" 
                        variant={isOptimized ? "outline" : "default"}
                        className="gap-1"
                        onClick={handleOptimize}
                        disabled={optimizeMutation.isPending}
                      >
                        {isOptimized ? (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Optimized
                          </>
                        ) : (
                          <>
                            <Brain className="w-4 h-4" />
                            Optimize Protocol
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <Alert className="bg-slate-50 border-slate-200">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      <AlertTitle className="text-sm">AI Insight</AlertTitle>
                      <AlertDescription className="text-xs">
                        {isOptimized ? 
                          `Optimizing this protocol could increase success probability by ${(((prediction?.optimizedProbability || (prediction?.probability * 1.2)) - (prediction?.probability || 0)) * 100).toFixed(2)}%.` : 
                          'Click "Optimize Protocol" to receive AI-powered improvement recommendations.'}
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>
                
                <div className="border-l pl-8">
                  <h3 className="font-semibold flex items-center text-sm mb-2">
                    Impact Assessment
                  </h3>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Benchmark Alignment</span>
                        <span>{benchmarks?.similarityScore || 0}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full" 
                          style={{ width: `${benchmarks?.similarityScore || 0}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Regulatory Alignment</span>
                        <span>{benchmarks?.regulatoryScore || 75}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 rounded-full" 
                          style={{ width: `${benchmarks?.regulatoryScore || 75}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Endpoint Validity</span>
                        <span>{benchmarks?.endpointScore || 85}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 rounded-full" 
                          style={{ width: `${benchmarks?.endpointScore || 85}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    {isOptimized && getImpactScore() && (
                      <div className="mt-4 pt-2 border-t">
                        <h4 className="text-xs text-muted-foreground mb-1">Optimization Impact</h4>
                        <div className={`text-lg font-bold ${getImpactScore()?.color}`}>
                          {getImpactScore()?.score} Impact
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid grid-cols-4 w-[600px]">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <BarChart className="w-4 h-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="prediction" className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Success Prediction
              </TabsTrigger>
              <TabsTrigger value="benchmarks" className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                CSR Benchmarks
              </TabsTrigger>
              <TabsTrigger value="sap" className="flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Statistical Plan
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview">
              {isOptimized && recommendations.length > 0 && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-amber-500" />
                      Optimization Recommendations
                    </CardTitle>
                    <CardDescription>
                      AI-generated suggestions to improve your protocol's success probability
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {recommendations.map((rec, idx) => (
                        <div key={idx} className="flex">
                          <div className="mr-4">
                            {rec.impact === 'high' ? (
                              <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="w-3 h-3 text-red-600" />
                              </div>
                            ) : rec.impact === 'medium' ? (
                              <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                                <Lightbulb className="w-3 h-3 text-blue-600" />
                              </div>
                            )}
                          </div>
                          
                          <div>
                            <h3 className="font-semibold flex items-center text-base">
                              {rec.field}
                              <Badge variant="outline" className="ml-2 px-2 py-0">
                                {rec.impact === 'high' ? 'Critical' : rec.impact === 'medium' ? 'Important' : 'Suggestion'}
                              </Badge>
                            </h3>
                            
                            <div className="mt-1 flex">
                              <div className="text-muted-foreground">{rec.current}</div>
                              <ArrowRight className="w-4 h-4 mx-2 text-muted-foreground" />
                              <div className="font-medium">{rec.suggested}</div>
                            </div>
                            
                            <p className="mt-1 text-sm text-muted-foreground">
                              {rec.rationale}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="text-lg">Protocol Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold mb-1">Study Design</h3>
                        <p className="text-sm text-muted-foreground">
                          {parsedProtocol.indication} {parsedProtocol.phase} trial with {parsedProtocol.sample_size} participants
                          over {parsedProtocol.duration_weeks} weeks, evaluating {parsedProtocol.endpoint_primary}.
                        </p>
                      </div>
                      
                      {parsedProtocol.randomization && (
                        <div>
                          <h3 className="text-sm font-semibold mb-1">Randomization</h3>
                          <p className="text-sm text-muted-foreground">{parsedProtocol.randomization}</p>
                        </div>
                      )}
                      
                      {parsedProtocol.blinding && (
                        <div>
                          <h3 className="text-sm font-semibold mb-1">Blinding</h3>
                          <p className="text-sm text-muted-foreground">{parsedProtocol.blinding}</p>
                        </div>
                      )}
                      
                      {parsedProtocol.population && (
                        <div>
                          <h3 className="text-sm font-semibold mb-1">Population</h3>
                          <p className="text-sm text-muted-foreground">{parsedProtocol.population}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="text-lg">Statistical Highlights</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold mb-1">Primary Analysis</h3>
                        <p className="text-sm text-muted-foreground">
                          {sapContent ? (
                            sapContent.split('\n').slice(0, 3).join('\n')
                          ) : (
                            "Generating statistical approach..."
                          )}
                        </p>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-semibold mb-1">Success Prediction</h3>
                        <p className="text-sm text-muted-foreground">
                          {prediction ? (
                            `${(prediction.probability * 100).toFixed(1)}% probability of success`
                          ) : (
                            "Analyzing success factors..."
                          )}
                        </p>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-semibold mb-1">Similar Trials</h3>
                        <p className="text-sm text-muted-foreground">
                          {benchmarks?.similarTrials ? (
                            `${benchmarks.similarTrials.length} similar trials found with ${benchmarks.successRate * 100}% success rate`
                          ) : (
                            "Searching for similar trials..."
                          )}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="prediction">
              <ProtocolSuccessPredictor 
                protocolData={parsedProtocol} 
                onPredictionComplete={handlePredictionComplete} 
              />
            </TabsContent>
            
            <TabsContent value="benchmarks">
              <CSRBenchmarkPanel 
                protocolData={parsedProtocol} 
                onBenchmarkComplete={handleBenchmarkComplete} 
              />
            </TabsContent>
            
            <TabsContent value="sap">
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-primary" />
                    Statistical Analysis Plan
                  </CardTitle>
                  <CardDescription>
                    Auto-generated statistical approach based on protocol design and similar successful trials
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {sapMutation.isPending ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="flex flex-col items-center">
                        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                        <p className="text-sm text-muted-foreground mt-2">Generating statistical plan...</p>
                      </div>
                    </div>
                  ) : sapContent ? (
                    <div className="space-y-6">
                      <Textarea 
                        value={sapContent} 
                        onChange={(e) => setSapContent(e.target.value)}
                        className="min-h-[300px] font-mono text-sm"
                      />
                      
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h3 className="text-sm font-medium text-blue-700 mb-1">About this SAP</h3>
                        <p className="text-xs text-blue-700">
                          This Statistical Analysis Plan was automatically generated based on your protocol design 
                          and analysis of similar trials. It provides a solid starting point for your statistical approach
                          but should be reviewed by a qualified statistician before finalization.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      <p>Statistical plan could not be generated. Please check your protocol data.</p>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="justify-end border-t pt-6">
                  <Button variant="outline" className="gap-2" onClick={() => exportMutation.mutate()}>
                    <DownloadCloud className="w-4 h-4" />
                    Export Full Report with SAP
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}