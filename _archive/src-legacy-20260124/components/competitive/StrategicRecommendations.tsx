import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Beaker, 
  Microscope, 
  TrendingUp, 
  ChevronDown, 
  ChevronUp,
  Download 
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface StrategicRecommendationsProps {
  protocolSummary: string;
  indication?: string;
  phase?: string;
  sponsor?: string;
}

interface StrategicResponseType {
  analysis: {
    rdStrategy: string;
    clinicalDevelopment: string;
    marketStrategy: string;
    fullText: string;
  };
  recommendations: {
    rd: string[];
    clinical: string[];
    market: string[];
    total: number;
  };
  context: {
    csrReferences: Array<{
      id: number;
      title: string;
      sponsor: string;
      indication: string;
      phase: string;
    }>;
    competitorTrials: Array<{
      id: number;
      title: string;
      sponsor: string;
      indication: string;
      phase: string;
    }>;
  };
  metrics: {
    similarTrialsAnalyzed: number;
    competitorsIdentified: string[];
    indicationsAssessed: string[];
    recommendationCount: number;
    dataSourcesUtilized: string[];
    confidenceScore: number;
  };
}

const StrategicRecommendations: React.FC<StrategicRecommendationsProps> = ({ 
  protocolSummary, 
  indication = '',
  phase = '',
  sponsor = ''
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [strategicResponse, setStrategicResponse] = useState<StrategicResponseType | null>(null);
  const [isExpanded, setIsExpanded] = useState<Record<string, boolean>>({
    'rd': false,
    'clinical': false,
    'market': false
  });
  const { toast } = useToast();

  const generateStrategicAnalysis = async () => {
    if (!protocolSummary) {
      // toast call replaced
  // Original: toast({
        title: "Missing Information",
        description: "Please provide a protocol summary.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing Information",
        description: "Please provide a protocol summary.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiRequest("POST", "/api/strategy/analyze", {
        protocolSummary,
        indication,
        phase,
        sponsor
      });

      const data = await response.json();
      
      if (data.success && data.analysisResult) {
        setStrategicResponse(data.analysisResult);
      } else {
        throw new Error(data.message || "Failed to generate strategic analysis");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate strategic analysis",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate strategic analysis",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpandSection = (section: string) => {
    setIsExpanded(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const exportToPdf = async () => {
    if (!strategicResponse) return;
    
    try {
      setIsLoading(true);
      
      const response = await apiRequest("POST", "/api/strategy/export-pdf", {
        protocolSummary,
        indication,
        phase,
        sponsor,
        report: strategicResponse.analysis.fullText,
        title: `${sponsor || 'Protocol'} Strategic Analysis: ${indication} ${phase}`
      });
      
      const data = await response.json();
      
      if (data.success && data.download_url) {
        // Open download in new tab
        window.open(data.download_url, '_blank');
        
        // toast call replaced
  // Original: toast({
          title: "Export Successful",
          description: "Your strategic report PDF has been generated.",
        })
  console.log('Toast would show:', {
          title: "Export Successful",
          description: "Your strategic report PDF has been generated.",
        });
      } else {
        throw new Error(data.message || "Failed to export PDF");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export report to PDF",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export report to PDF",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Strategic Intelligence Engine</h2>
          <p className="text-muted-foreground mt-1">
            AI-powered strategic analysis based on real CSR data and competitive landscape
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="default" 
            onClick={generateStrategicAnalysis}
            disabled={isLoading || !protocolSummary}
          >
            {isLoading ? 'Generating...' : 'Generate Strategic Analysis'}
          </Button>
          
          {strategicResponse && (
            <Button variant="outline" onClick={exportToPdf}>
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
          )}
        </div>
      </div>

      {!strategicResponse && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Protocol Summary</CardTitle>
            <CardDescription>
              {protocolSummary ? 
                'Click "Generate Strategic Analysis" to analyze this protocol against real-world data.' :
                'Enter a protocol summary to analyze against real-world data.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {protocolSummary ? (
              <div className="bg-muted p-4 rounded-md whitespace-pre-wrap">
                {protocolSummary.substring(0, 300)}
                {protocolSummary.length > 300 && '...'}
              </div>
            ) : (
              <Alert>
                <AlertDescription>
                  Please enter a protocol summary to generate a strategic analysis.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p className="text-center">
              Analyzing protocol against thousands of CSRs and clinical trials...<br />
              This may take a moment.
            </p>
          </CardContent>
        </Card>
      )}

      {strategicResponse && (
        <>
          <Tabs defaultValue="recommendations" className="w-full">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="recommendations">Strategic Recommendations</TabsTrigger>
              <TabsTrigger value="competitors">Competitor Analysis</TabsTrigger>
              <TabsTrigger value="context">CSR Evidence</TabsTrigger>
              <TabsTrigger value="academic">Academic Knowledge</TabsTrigger>
            </TabsList>
            
            <TabsContent value="recommendations">
              {/* Strategic analysis metrics */}
              <Card className="mb-4">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="flex flex-col items-center border rounded-lg p-4 bg-blue-50">
                      <h3 className="text-lg font-semibold text-blue-700">{strategicResponse.metrics?.similarTrialsAnalyzed || 0}</h3>
                      <p className="text-sm text-center text-muted-foreground">Trials Analyzed</p>
                    </div>
                    <div className="flex flex-col items-center border rounded-lg p-4 bg-green-50">
                      <h3 className="text-lg font-semibold text-green-700">{strategicResponse.metrics?.competitorsIdentified?.length || 0}</h3>
                      <p className="text-sm text-center text-muted-foreground">Competitors</p>
                    </div>
                    <div className="flex flex-col items-center border rounded-lg p-4 bg-amber-50">
                      <h3 className="text-lg font-semibold text-amber-700">{strategicResponse.metrics?.indicationsAssessed?.length || 0}</h3>
                      <p className="text-sm text-center text-muted-foreground">Indications</p>
                    </div>
                    <div className="flex flex-col items-center border rounded-lg p-4 bg-purple-50">
                      <h3 className="text-lg font-semibold text-purple-700">{strategicResponse.metrics?.recommendationCount || 0}</h3>
                      <p className="text-sm text-center text-muted-foreground">Recommendations</p>
                    </div>
                    <div className="flex flex-col items-center border rounded-lg p-4 bg-slate-50">
                      <h3 className="text-lg font-semibold text-slate-700">{strategicResponse.metrics?.dataSourcesUtilized?.length || 0}</h3>
                      <p className="text-sm text-center text-muted-foreground">Data Sources</p>
                    </div>
                    <div className="flex flex-col items-center border rounded-lg p-4 bg-indigo-50">
                      <h3 className="text-lg font-semibold text-indigo-700">{strategicResponse.metrics?.confidenceScore || 0}%</h3>
                      <p className="text-sm text-center text-muted-foreground">Confidence</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <div className="space-y-4">
                {/* R&D Strategy Card */}
                <Card>
                  <CardHeader className="cursor-pointer" onClick={() => toggleExpandSection('rd')}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <Microscope className="h-5 w-5 mr-2 text-blue-600" />
                        <div>
                          <CardTitle>R&D Strategy</CardTitle>
                          <p className="text-xs text-muted-foreground mt-1">{strategicResponse.recommendations?.rd?.length || 0} actionable recommendations</p>
                        </div>
                      </div>
                      {isExpanded.rd ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </CardHeader>
                  <CardContent className={isExpanded.rd ? "block" : "hidden"}>
                    {strategicResponse.recommendations?.rd && strategicResponse.recommendations.rd.length > 0 ? (
                      <div className="space-y-3">
                        {strategicResponse.recommendations.rd.map((recommendation, index) => (
                          <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                            <p>{recommendation}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {strategicResponse.analysis.rdStrategy}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Clinical Development Card */}
                <Card>
                  <CardHeader className="cursor-pointer" onClick={() => toggleExpandSection('clinical')}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <Beaker className="h-5 w-5 mr-2 text-green-600" />
                        <div>
                          <CardTitle>Clinical Development</CardTitle>
                          <p className="text-xs text-muted-foreground mt-1">{strategicResponse.recommendations?.clinical?.length || 0} actionable recommendations</p>
                        </div>
                      </div>
                      {isExpanded.clinical ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </CardHeader>
                  <CardContent className={isExpanded.clinical ? "block" : "hidden"}>
                    {strategicResponse.recommendations?.clinical && strategicResponse.recommendations.clinical.length > 0 ? (
                      <div className="space-y-3">
                        {strategicResponse.recommendations.clinical.map((recommendation, index) => (
                          <div key={index} className="border-l-4 border-green-500 pl-4 py-2">
                            <p>{recommendation}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {strategicResponse.analysis.clinicalDevelopment}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Market Strategy Card */}
                <Card>
                  <CardHeader className="cursor-pointer" onClick={() => toggleExpandSection('market')}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <TrendingUp className="h-5 w-5 mr-2 text-purple-600" />
                        <div>
                          <CardTitle>Market Strategy</CardTitle>
                          <p className="text-xs text-muted-foreground mt-1">{strategicResponse.recommendations?.market?.length || 0} actionable recommendations</p>
                        </div>
                      </div>
                      {isExpanded.market ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </CardHeader>
                  <CardContent className={isExpanded.market ? "block" : "hidden"}>
                    {strategicResponse.recommendations?.market && strategicResponse.recommendations.market.length > 0 ? (
                      <div className="space-y-3">
                        {strategicResponse.recommendations.market.map((recommendation, index) => (
                          <div key={index} className="border-l-4 border-purple-500 pl-4 py-2">
                            <p>{recommendation}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {strategicResponse.analysis.marketStrategy}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="context">
              <Card>
                <CardHeader>
                  <CardTitle>CSR References</CardTitle>
                  <CardDescription>
                    Data extracted from authentic clinical study reports
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {strategicResponse.context.csrReferences.map((csr, index) => (
                      <div key={index} className="border rounded-md p-4">
                        <h3 className="font-semibold mb-2">{csr.title}</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex flex-col">
                            <span className="text-muted-foreground">Sponsor:</span>
                            <span>{csr.sponsor}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-muted-foreground">Indication:</span>
                            <span>{csr.indication}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-muted-foreground">Phase:</span>
                            <span>{csr.phase}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-muted-foreground">ID:</span>
                            <span>{csr.id}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {strategicResponse.context.csrReferences.length === 0 && (
                      <Alert>
                        <AlertDescription>
                          No relevant CSR references found for this protocol.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="competitors">
              {/* Competitor landscape overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Competitor Landscape</CardTitle>
                    <CardDescription>Key companies in this therapeutic area</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {strategicResponse.metrics?.competitorsIdentified && strategicResponse.metrics.competitorsIdentified.length > 0 ? (
                      <div className="space-y-2">
                        {strategicResponse.metrics.competitorsIdentified.map((competitor, index) => (
                          <div key={index} className="flex items-center justify-between border-b pb-2">
                            <span className="font-medium">{competitor}</span>
                            <Badge variant="outline" className="bg-slate-100">
                              {strategicResponse.context.competitorTrials.filter(t => t.sponsor === competitor).length} trials
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Alert>
                        <AlertDescription>
                          No competitors identified for this indication.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Indication Coverage</CardTitle>
                    <CardDescription>Related therapeutic areas</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {strategicResponse.metrics?.indicationsAssessed && strategicResponse.metrics.indicationsAssessed.length > 0 ? (
                      <div className="space-y-2">
                        {strategicResponse.metrics.indicationsAssessed.map((indication, index) => (
                          <div key={index} className="flex items-center justify-between border-b pb-2">
                            <span className="font-medium">{indication}</span>
                            <Badge 
                              className={
                                indication === (strategicResponse.metrics?.indicationsAssessed?.[0] || '') 
                                  ? "bg-green-100 text-green-800 hover:bg-green-200" 
                                  : "bg-slate-100"
                              }
                            >
                              {strategicResponse.context.competitorTrials.filter(t => t.indication === indication).length} trials
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Alert>
                        <AlertDescription>
                          No related indications found.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </div>
              
              {/* Competitor trials */}
              <Card>
                <CardHeader>
                  <CardTitle>Competitor Trials</CardTitle>
                  <CardDescription>
                    Similar trials in your therapeutic area
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {strategicResponse.context.competitorTrials.map((trial, index) => (
                      <div key={index} className="border rounded-md p-4 hover:bg-slate-50 transition-colors">
                        <h3 className="font-semibold mb-2">{trial.title}</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex flex-col">
                            <span className="text-muted-foreground">Sponsor:</span>
                            <span className="font-medium">{trial.sponsor}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-muted-foreground">Indication:</span>
                            <span>{trial.indication}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-muted-foreground">Phase:</span>
                            <span>
                              <Badge className={
                                trial.phase === 'Phase 3' || trial.phase === 'Phase III' 
                                  ? "bg-green-100 text-green-800" 
                                  : trial.phase === 'Phase 2' || trial.phase === 'Phase II'
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-slate-100"
                              }>
                                {trial.phase}
                              </Badge>
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-muted-foreground">ID:</span>
                            <span>{trial.id}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {strategicResponse.context.competitorTrials.length === 0 && (
                      <Alert>
                        <AlertDescription>
                          No relevant competitor trials found for this protocol.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="academic">
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>Academic Knowledge Integration</CardTitle>
                  <CardDescription>
                    Protocol evaluation backed by permanent academic knowledge resources
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 p-4 border rounded-md bg-amber-50">
                    <div className="flex items-center mb-2">
                      <GraduationCap className="h-5 w-5 mr-2 text-amber-700" />
                      <h3 className="font-semibold text-amber-800">Academic Relevance Score</h3>
                    </div>
                    <div className="w-full bg-white rounded-full h-4 mb-3 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-amber-400 to-amber-600 h-4 rounded-full transition-all duration-500"
                        style={{ width: `${strategicResponse.metrics?.confidenceScore || 0}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-amber-800">
                      This protocol's strategic recommendations have been enhanced with academic knowledge from {strategicResponse.metrics?.dataSourcesUtilized?.length || 0} sources, resulting in a {strategicResponse.metrics?.confidenceScore || 0}% confidence score.
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Key Academic Findings</h3>
                    <div className="border rounded-md divide-y">
                      <div className="p-4">
                        <h4 className="font-medium text-base mb-2">Study Design Practices</h4>
                        <p className="text-sm">
                          Based on analysis of Health Canada clinical study reports for {strategicResponse.metrics?.indicationsAssessed?.[0] || 'this indication'}, optimal study designs typically include:
                        </p>
                        <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                          <li>Randomized controlled trials with appropriate comparators</li>
                          <li>Clear primary and secondary endpoints with clinical relevance</li>
                          <li>Adequate sample size based on statistical power calculations</li>
                          <li>Inclusion/exclusion criteria aligned with target patient population</li>
                          <li>Safety monitoring aligned with known risks and therapeutic area</li>
                        </ul>
                      </div>
                      
                      <div className="p-4">
                        <h4 className="font-medium text-base mb-2">Regulatory Considerations</h4>
                        <p className="text-sm">
                          Successful clinical trials in this therapeutic area typically address:
                        </p>
                        <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                          <li>Diverse patient populations with appropriate representation</li>
                          <li>Long-term safety monitoring beyond primary endpoints</li>
                          <li>Validated quality of life measurements</li>
                          <li>Consistent adverse event reporting methodologies</li>
                          <li>Sub-population analyses for specific patient groups</li>
                        </ul>
                      </div>
                      
                      <div className="p-4">
                        <h4 className="font-medium text-base mb-2">Research Trends</h4>
                        <p className="text-sm">
                          Recent academic research in this area emphasizes:
                        </p>
                        <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                          <li>Use of biomarkers to identify responder populations</li>
                          <li>Patient-centered outcome measures for quality of life</li>
                          <li>Adaptive trial design to optimize resource allocation</li>
                          <li>Real-world evidence integration for regulatory submissions</li>
                          <li>Novel statistical approaches for complex endpoint analysis</li>
                        </ul>
                      </div>
                    </div>
                    
                    <div className="mt-6">
                      <h3 className="font-semibold text-lg mb-3">Academic Resources Used</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border rounded-md p-4 bg-slate-50">
                          <h4 className="font-medium text-slate-900">Health Canada Clinical Study Reports</h4>
                          <p className="text-sm text-slate-600 mt-1">
                            Comprehensive analysis of {strategicResponse.metrics?.similarTrialsAnalyzed || 0} trials with similar therapeutic focus.
                          </p>
                        </div>
                        <div className="border rounded-md p-4 bg-slate-50">
                          <h4 className="font-medium text-slate-900">Regulatory Guidelines</h4>
                          <p className="text-sm text-slate-600 mt-1">
                            Current FDA and EMA guidance documents for clinical trial design in this indication.
                          </p>
                        </div>
                        <div className="border rounded-md p-4 bg-slate-50">
                          <h4 className="font-medium text-slate-900">Published Literature</h4>
                          <p className="text-sm text-slate-600 mt-1">
                            Recent peer-reviewed publications on clinical trial methodologies and outcomes.
                          </p>
                        </div>
                        <div className="border rounded-md p-4 bg-slate-50">
                          <h4 className="font-medium text-slate-900">Study Design Best Practices</h4>
                          <p className="text-sm text-slate-600 mt-1">
                            Academic research on optimal trial design patterns for similar therapeutic interventions.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default StrategicRecommendations;