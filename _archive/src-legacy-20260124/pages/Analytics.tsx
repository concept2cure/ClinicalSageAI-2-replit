
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  BarChart3, PieChart as PieChartIcon, LineChart, Microscope, Pill, Activity, 
  Beaker, Dna, TrendingUp, Search, BrainCircuit, ArrowUpDown, 
  Lightbulb, Users, Flag, FileSymlink, ChevronUp, ChevronDown,
  CheckCircle, AlertCircle, BarChart2, FlaskConical, Brain, Database
} from "lucide-react";
import { DeepLearningPanel } from "@/components/analytics/DeepLearningPanel";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { CsrReport } from "@/lib/types";

// Trial comparison card component
function TrialComparisonCard({ isLoading = false }) {
  const [trial1, setTrial1] = useState("");
  const [trial2, setTrial2] = useState("");
  
  const { data: reports } = useQuery({
    queryKey: ['/api/reports'],
  });
  
  const { data: comparison, isLoading: isLoadingComparison } = useQuery({
    queryKey: ['/api/analytics/compare', { trial1, trial2 }],
    enabled: !!trial1 && !!trial2,
  });
  
  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <ArrowUpDown className="h-5 w-5 text-indigo-600 mr-2" />
          Trial Comparison
        </CardTitle>
        <CardDescription>
          Compare efficacy, safety, and outcomes between two clinical trials
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              First Trial
            </label>
            <Select value={trial1} onValueChange={setTrial1}>
              <SelectTrigger>
                <SelectValue placeholder="Select trial" />
              </SelectTrigger>
              <SelectContent>
                {reports?.map((report: CsrReport) => (
                  <SelectItem key={report.id} value={report.id.toString()}>
                    {report.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Second Trial
            </label>
            <Select value={trial2} onValueChange={setTrial2}>
              <SelectTrigger>
                <SelectValue placeholder="Select trial" />
              </SelectTrigger>
              <SelectContent>
                {reports?.map((report: CsrReport) => (
                  <SelectItem key={report.id} value={report.id.toString()}>
                    {report.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <Button 
          onClick={() => {}} 
          className="w-full mb-4" 
          disabled={!trial1 || !trial2 || trial1 === trial2}
        >
          Compare Trials
        </Button>
        
        {isLoadingComparison ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : comparison ? (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-md">
              <h4 className="font-medium mb-2">Primary Endpoint Comparison</h4>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-slate-500">Endpoint:</span>
                  <p className="font-medium">{comparison.primaryEndpoint.name}</p>
                </div>
                <div>
                  <span className="text-slate-500">Difference:</span>
                  <p className="font-medium">{comparison.primaryEndpoint.difference}%</p>
                </div>
                <div>
                  <span className="text-slate-500">Significance:</span>
                  <p className="font-medium">{comparison.primaryEndpoint.significance}</p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 rounded-md">
              <h4 className="font-medium mb-2">Safety Profile Comparison</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Adverse Events:</span>
                  <p className="font-medium">Difference: {comparison.safetyComparison.adverseEvents.difference}%</p>
                </div>
                <div>
                  <span className="text-slate-500">Serious Events:</span>
                  <p className="font-medium">Difference: {comparison.safetyComparison.seriousEvents.difference}%</p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-purple-50 rounded-md">
              <h4 className="font-medium mb-2">AI Summary</h4>
              <p className="text-sm">{comparison.conclusionSummary}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-slate-500">Select two trials to compare their outcomes and safety profiles</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Predictive Analysis card component
function PredictiveAnalysisCard({ isLoading = false }) {
  const [indication, setIndication] = useState("");
  
  const { data: reports } = useQuery({
    queryKey: ['/api/reports'],
  });
  
  const indications = reports ? Array.from(new Set(reports.map((r: CsrReport) => r.indication))) : [];
  
  const { data: predictive, isLoading: isLoadingPredictive } = useQuery({
    queryKey: ['/api/analytics/predictive', { indication }],
    enabled: !!indication,
  });
  
  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <BrainCircuit className="h-5 w-5 text-indigo-600 mr-2" />
          Predictive Analytics
        </CardTitle>
        <CardDescription>
          AI-powered predictions and insights for clinical trial design
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Therapeutic Area
          </label>
          <Select value={indication} onValueChange={setIndication}>
            <SelectTrigger>
              <SelectValue placeholder="Select indication" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All indications</SelectItem>
              {indications.map((ind: string) => (
                <SelectItem key={ind} value={ind}>
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <Button 
          onClick={() => {}} 
          className="w-full mb-4"
        >
          Generate Predictive Analysis
        </Button>
        
        {isLoadingPredictive ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : predictive ? (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-md">
              <h4 className="font-medium mb-2">Predicted Endpoints</h4>
              <div className="space-y-2">
                {predictive.predictedEndpoints.map((endpoint, idx) => (
                  <div key={idx} className="text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{endpoint.endpointName}</span>
                      <Badge variant={endpoint.reliability === 'High' ? 'default' : endpoint.reliability === 'Moderate' ? 'secondary' : 'outline'}>
                        {endpoint.reliability}
                      </Badge>
                    </div>
                    <div className="mt-1">
                      <span className="text-slate-500">Predicted effect size: {endpoint.predictedEffectSize}%</span>
                      <div className="text-xs text-slate-400">(CI: {endpoint.confidenceInterval[0]}% - {endpoint.confidenceInterval[1]}%)</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 rounded-md">
              <h4 className="font-medium mb-2">Trial Design Recommendations</h4>
              <div className="space-y-2">
                {predictive.trialDesignRecommendations.map((rec, idx) => (
                  <div key={idx} className="text-sm flex items-start">
                    <Badge variant={rec.impactLevel === 'High' ? 'destructive' : rec.impactLevel === 'Medium' ? 'secondary' : 'outline'} className="mt-0.5 mr-2">
                      {rec.impactLevel}
                    </Badge>
                    <div>
                      <span className="font-medium">{rec.factor}:</span> {rec.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 rounded-md">
              <h4 className="font-medium mb-2">Market & Competitive Trends</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h5 className="text-sm font-medium mb-1">Indication Trends</h5>
                  <div className="space-y-1 text-sm">
                    {predictive.marketTrends.map((trend, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{trend.indication}</span>
                        <span className={
                          trend.trend === 'Increasing' ? 'text-green-600' : 
                          trend.trend === 'Decreasing' ? 'text-red-600' : 
                          'text-amber-600'
                        }>
                          {trend.trend} ({trend.numberOfTrials})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h5 className="text-sm font-medium mb-1">Competitive Insights</h5>
                  <div className="space-y-1 text-sm">
                    {predictive.competitiveInsights.map((insight, idx) => (
                      <div key={idx}>
                        <span className="font-medium">{insight.sponsor}:</span> {insight.trend} ({insight.significance})
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-slate-500">Select an indication to see AI-powered predictions</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Analytics summary card component  
function AnalyticsSummaryCard({ isLoading = false }) {
  const { data: summary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['/api/analytics/summary'],
  });
  
  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <BarChart2 className="h-5 w-5 text-indigo-600 mr-2" />
          Analytics Summary
        </CardTitle>
        <CardDescription>
          Comprehensive overview of your clinical trial portfolio
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingSummary ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : summary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-blue-50 rounded-md text-center">
                <div className="text-xl font-bold text-blue-700">{summary.totalReports}</div>
                <div className="text-xs text-blue-600">Total Reports</div>
              </div>
              <div className="p-3 bg-green-50 rounded-md text-center">
                <div className="text-xl font-bold text-green-700">{summary.averageEndpoints}</div>
                <div className="text-xs text-green-600">Avg. Endpoints</div>
              </div>
              <div className="p-3 bg-purple-50 rounded-md text-center">
                <div className="text-xl font-bold text-purple-700">{Math.round(summary.processingStats.successRate)}%</div>
                <div className="text-xs text-purple-600">Success Rate</div>
              </div>
              <div className="p-3 bg-amber-50 rounded-md text-center">
                <div className="text-xl font-bold text-amber-700">{(summary.processingStats.averageProcessingTime / 1000).toFixed(1)}s</div>
                <div className="text-xs text-amber-600">Avg. Processing</div>
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 rounded-md">
              <h4 className="font-medium mb-2">Reports by Indication</h4>
              <div className="space-y-1">
                {Object.entries(summary.reportsByIndication).map(([indication, count]) => (
                  <div key={indication} className="flex justify-between text-sm">
                    <span>{indication}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 rounded-md">
              <h4 className="font-medium mb-2">Reports by Phase</h4>
              <div className="space-y-1">
                {Object.entries(summary.reportsByPhase).map(([phase, count]) => (
                  <div key={phase} className="flex justify-between text-sm">
                    <span>Phase {phase}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 rounded-md">
              <h4 className="font-medium mb-2">Common Endpoints</h4>
              <div className="flex flex-wrap gap-2">
                {summary.mostCommonEndpoints.map((endpoint, idx) => (
                  <Badge key={idx} variant="secondary">
                    {endpoint}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-slate-500">No analytics data available yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell
} from 'recharts';

// Virtual trial simulation card component
function VirtualTrialSimulationCard() {
  const [isLoading, setIsLoading] = useState(false);
  const [indication, setIndication] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [sampleSize, setSampleSize] = useState("");
  const [duration, setDuration] = useState("");
  const [dropoutRate, setDropoutRate] = useState("");
  const [simulation, setSimulation] = useState<any>(null);
  
  // Additional population characteristics
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 65]);
  const [gender, setGender] = useState<string>("both");
  const [priorTreatment, setPriorTreatment] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const { toast } = useToast();
  const { data: reports } = useQuery({
    queryKey: ['/api/reports'],
  });
  
  const indications = reports ? Array.from(new Set(reports.map((r: CsrReport) => r.indication))) : [];
  
  const handleSimulate = async () => {
    if (!indication) {
      // toast call replaced
  // Original: toast({
        title: "Missing Information",
        description: "Please select an indication/therapeutic area.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing Information",
        description: "Please select an indication/therapeutic area.",
        variant: "destructive"
      });
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/analytics/virtual-trial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          indication,
          endpoint,
          sampleSize: sampleSize || undefined,
          duration: duration || undefined,
          dropoutRate: dropoutRate || undefined,
          populationCharacteristics: {
            ageRange: ageRange,
            gender: gender,
            priorTreatment: priorTreatment || undefined,
          }
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to simulate virtual trial');
      }
      
      const data = await response.json();
      if (data.success) {
        setSimulation(data.simulation);
        // toast call replaced
  // Original: toast({
          title: "Simulation Complete",
          description: "Virtual trial simulation results are ready to view.",
        })
  console.log('Toast would show:', {
          title: "Simulation Complete",
          description: "Virtual trial simulation results are ready to view.",
        });
      } else {
        // toast call replaced
  // Original: toast({
          title: "Simulation Error",
          description: data.message || "Failed to run simulation. Please try again.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "Simulation Error",
          description: data.message || "Failed to run simulation. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error simulating virtual trial:', error);
      // toast call replaced
  // Original: toast({
        title: "Simulation Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Simulation Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Function to download simulation results
  const downloadSimulationResults = (format: 'csv' | 'json' | 'pdf') => {
    if (!simulation) {
      // toast call replaced
  // Original: toast({
        title: "No Simulation Data",
        description: "Please run a simulation first before downloading results.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "No Simulation Data",
        description: "Please run a simulation first before downloading results.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      let content: string;
      let fileName: string;
      let mimeType: string;
      
      if (format === 'csv') {
        // Create CSV content from simulation data
        content = 'Parameter,Value\n';
        content += `Indication,${indication}\n`;
        content += `Primary Endpoint,${endpoint || 'Not specified'}\n`;
        content += `Sample Size,${sampleSize || simulation.simulationParameters?.sampleSize || 'N/A'}\n`;
        content += `Duration (months),${duration || simulation.timeToCompletion || 'N/A'}\n`;
        content += `Dropout Rate,${dropoutRate || (simulation.simulationParameters?.dropoutRate * 100).toFixed(1) + '%' || 'N/A'}\n\n`;
        
        // Add population characteristics
        content += 'Population Characteristics,Value\n';
        content += `Age Range,${ageRange[0]}-${ageRange[1]}\n`;
        content += `Gender Distribution,${gender}\n`;
        content += `Prior Treatment,${priorTreatment || 'Not specified'}\n\n`;
        
        content += 'Results,Value\n';
        content += `Effect Size,${simulation.predictedOutcome.effectSize}\n`;
        content += `95% CI Lower,${simulation.confidenceInterval[0]}\n`;
        content += `95% CI Upper,${simulation.confidenceInterval[1]}\n`;
        content += `P-Value,${simulation.predictedOutcome.pValue}\n`;
        content += `Power,${simulation.predictedOutcome.powerEstimate}\n`;
        content += `Success Probability,${simulation.successProbability}\n`;
        content += `Estimated Cost,$${(simulation.costEstimate / 1000000).toFixed(1)}M\n\n`;
        
        content += 'Risk Factor,Level,Impact\n';
        simulation.riskFactors.forEach((factor: any) => {
          content += `${factor.factor},${factor.risk},${factor.impact}\n`;
        });
        
        // Add mitigation strategies section
        content += '\nMitigation Strategies,Description\n';
        simulation.riskFactors.filter((f: any) => f.risk === 'High' || f.risk === 'Medium').forEach((factor: any) => {
          let strategy = '';
          if (factor.factor.includes('Sample Size')) {
            strategy = 'Consider increasing sample size or using adaptive design with interim analyses to optimize enrollment.';
          } else if (factor.factor.includes('Effect Size')) {
            strategy = 'Consider enrichment strategies to select patients more likely to respond to treatment.';
          } else if (factor.factor.includes('Dropout')) {
            strategy = 'Implement patient retention strategies, reduce visit burden, provide transportation assistance.';
          } else if (factor.factor.includes('Endpoint')) {
            strategy = 'Consider composite endpoints or validated surrogate markers with less variability.';
          } else {
            strategy = 'Review historical trials to identify strategies for addressing this risk factor.';
          }
          content += `${factor.factor},"${strategy}"\n`;
        });
        
        fileName = `virtual_trial_simulation_${indication.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      } else if (format === 'json') {
        // Create JSON content with simulation parameters and results
        const exportData = {
          parameters: {
            indication,
            endpoint,
            sampleSize: sampleSize || simulation.simulationParameters?.sampleSize || 'N/A',
            duration: duration || simulation.timeToCompletion || 'N/A',
            dropoutRate: dropoutRate || simulation.simulationParameters?.dropoutRate || 'N/A',
            population: {
              ageRange,
              gender,
              priorTreatment: priorTreatment || 'N/A'
            }
          },
          results: {
            simulationParameters: simulation.simulationParameters,
            predictedOutcome: simulation.predictedOutcome,
            confidenceInterval: simulation.confidenceInterval,
            successProbability: simulation.successProbability,
            timeToCompletion: simulation.timeToCompletion,
            costEstimate: simulation.costEstimate,
            riskFactors: simulation.riskFactors,
            recommendations: simulation.recommendations,
            generatedDate: new Date().toISOString()
          },
          mitigationStrategies: simulation.riskFactors.filter((f: any) => f.risk === 'High' || f.risk === 'Medium').map((factor: any) => {
            let strategy = '';
            if (factor.factor.includes('Sample Size')) {
              strategy = 'Consider increasing sample size or using adaptive design with interim analyses to optimize enrollment.';
            } else if (factor.factor.includes('Effect Size')) {
              strategy = 'Consider enrichment strategies to select patients more likely to respond to treatment.';
            } else if (factor.factor.includes('Dropout')) {
              strategy = 'Implement patient retention strategies, reduce visit burden, provide transportation assistance.';
            } else if (factor.factor.includes('Endpoint')) {
              strategy = 'Consider composite endpoints or validated surrogate markers with less variability.';
            } else {
              strategy = 'Review historical trials to identify strategies for addressing this risk factor.';
            }
            return {
              factor: factor.factor,
              riskLevel: factor.risk,
              impact: factor.impact,
              mitigationStrategy: strategy
            };
          })
        };
        
        content = JSON.stringify(exportData, null, 2);
        fileName = `virtual_trial_simulation_${indication.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      } else {
        // PDF generation (in real implementation, this would use a PDF library)
        // toast call replaced
  // Original: toast({
          title: "PDF Generation",
          description: "PDF download is not fully implemented in this version. Please use CSV or JSON format.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "PDF Generation",
          description: "PDF download is not fully implemented in this version. Please use CSV or JSON format.",
          variant: "destructive"
        });
        return;
      }
      
      // Create a blob and download link
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      // toast call replaced
  // Original: toast({
        title: "Download Complete",
        description: `Simulation results have been downloaded as ${format.toUpperCase()
  console.log('Toast would show:', {
        title: "Download Complete",
        description: `Simulation results have been downloaded as ${format.toUpperCase()} format.`,
      });
    } catch (error) {
      console.error('Error downloading simulation results:', error);
      // toast call replaced
  // Original: toast({
        title: "Download Failed",
        description: "There was an error downloading the simulation results. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Download Failed",
        description: "There was an error downloading the simulation results. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  // Prepare chart data from simulation results
  const prepareBarChartData = () => {
    if (!simulation) return [];
    
    return [
      {
        name: 'Effect Size',
        value: simulation.predictedOutcome.effectSize,
        lowerCI: simulation.confidenceInterval[0],
        upperCI: simulation.confidenceInterval[1],
        fill: '#10b981' // green
      },
      {
        name: 'Success Prob.',
        value: simulation.successProbability,
        fill: '#3b82f6' // blue
      },
      {
        name: 'Power',
        value: simulation.predictedOutcome.powerEstimate,
        fill: '#8b5cf6' // purple
      }
    ];
  };
  
  const preparePieChartData = () => {
    if (!simulation) return [];
    
    return [
      {
        name: 'Success Probability',
        value: simulation.successProbability,
        fill: '#3b82f6' // blue
      },
      {
        name: 'Failure Probability',
        value: 1 - simulation.successProbability,
        fill: '#f43f5e' // rose
      }
    ];
  };
  
  const prepareRiskFactorsData = () => {
    if (!simulation) return [];
    
    return simulation.riskFactors.map((factor: any) => ({
      name: factor.factor,
      risk: factor.risk === 'High' ? 0.9 : factor.risk === 'Medium' ? 0.5 : 0.2,
      riskLabel: factor.risk,
      impact: factor.impact,
      fill: factor.risk === 'High' ? '#ef4444' : factor.risk === 'Medium' ? '#f59e0b' : '#94a3b8'
    }));
  };
  
  const RISK_COLORS = {
    High: '#ef4444',
    Medium: '#f59e0b',
    Low: '#94a3b8'
  };
  
  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <Microscope className="h-5 w-5 text-indigo-600 mr-2" />
          Virtual Trial Simulation
        </CardTitle>
        <CardDescription>
          Predict outcomes, costs, and risks before running an actual clinical trial
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Therapeutic Area
              </label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-blue-500 cursor-help text-sm">
                      <Search className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>The medical condition or disease being targeted in the clinical trial. Choose from historical indications in the database.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select value={indication} onValueChange={setIndication}>
              <SelectTrigger>
                <SelectValue placeholder="Select indication" />
              </SelectTrigger>
              <SelectContent>
                {indications.map((ind: string) => (
                  <SelectItem key={ind} value={ind}>
                    {ind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Primary Endpoint
              </label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-blue-500 cursor-help text-sm">
                      <Search className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>The main outcome measure that determines trial success. Examples: "Change in HbA1c from baseline", "ADAS-Cog score at Week 24", "Progression-free survival".</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input 
              placeholder="e.g., Change in ADAS-Cog at Week 24" 
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Sample Size
              </label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-blue-500 cursor-help text-sm">
                      <Search className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Total number of participants across all trial arms. Larger sample sizes increase statistical power but also increase costs and recruitment challenges.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input 
              type="number"
              placeholder="e.g., 300" 
              value={sampleSize}
              onChange={(e) => setSampleSize(e.target.value)}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Duration (months)
              </label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-blue-500 cursor-help text-sm">
                      <Search className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Total treatment duration in months. This affects the ability to detect treatment effects that develop over time, but also increases costs and dropout rates.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input 
              type="number"
              placeholder="e.g., 18" 
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Dropout Rate
              </label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-blue-500 cursor-help text-sm">
                      <Search className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Expected percentage (0-100%) of participants who will not complete the trial. Higher dropout rates reduce statistical power and may introduce bias.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input 
              type="number"
              placeholder="e.g., 15" 
              value={dropoutRate}
              onChange={(e) => setDropoutRate(e.target.value)}
              step="1"
              min="0"
              max="100"
            />
          </div>
        </div>
        
        <div className="mb-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Parameters
            {showAdvanced ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
          </Button>
        </div>
        
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-3 bg-slate-50 rounded-md">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Age Range
                </label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-blue-500 cursor-help text-sm">
                        <Search className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Min and max age of trial participants. Age restrictions can affect recruitment rate and generalizability of results.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center space-x-2">
                <Input 
                  type="number"
                  min="0"
                  max="100"
                  value={ageRange[0]}
                  onChange={(e) => setAgeRange([parseInt(e.target.value), ageRange[1]])}
                  className="w-1/2"
                />
                <span>to</span>
                <Input 
                  type="number"
                  min="0"
                  max="100"
                  value={ageRange[1]}
                  onChange={(e) => setAgeRange([ageRange[0], parseInt(e.target.value)])}
                  className="w-1/2"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Gender Distribution
                </label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-blue-500 cursor-help text-sm">
                        <Search className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Gender enrollment requirements. Some conditions exhibit different characteristics based on gender.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender distribution" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">All genders</SelectItem>
                  <SelectItem value="male">Male only</SelectItem>
                  <SelectItem value="female">Female only</SelectItem>
                  <SelectItem value="equal">Equal distribution</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Prior Treatment
                </label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-blue-500 cursor-help text-sm">
                        <Search className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Previous treatments required or excluded. This affects the patient population and potential treatment effect size.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input 
                placeholder="e.g., Failed 1L therapy" 
                value={priorTreatment}
                onChange={(e) => setPriorTreatment(e.target.value)}
              />
            </div>
          </div>
        )}
        
        <Button 
          onClick={handleSimulate} 
          className="w-full mb-4"
          disabled={!indication || isLoading}
        >
          {isLoading ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              Simulating Trial...
            </>
          ) : (
            <>
              <FlaskConical className="mr-2 h-4 w-4" />
              Run Virtual Trial Simulation
            </>
          )}
        </Button>
        
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
          </div>
        ) : simulation ? (
          <div className="space-y-6">
            <div className="p-4 bg-blue-50 rounded-md">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium mb-2">Simulation Summary</h4>
                  <p className="text-sm text-slate-700">{simulation.description}</p>
                </div>
                <div className="flex space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => downloadSimulationResults('csv')}
                    className="flex items-center"
                  >
                    <FileSymlink className="mr-1 h-4 w-4" />
                    CSV
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => downloadSimulationResults('json')}
                    className="flex items-center"
                  >
                    <FileSymlink className="mr-1 h-4 w-4" />
                    JSON
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => downloadSimulationResults('pdf')}
                    className="flex items-center"
                  >
                    <FileSymlink className="mr-1 h-4 w-4" />
                    PDF
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Results Visualization */}
            <div className="bg-white p-4 rounded-md shadow-sm border">
              <h4 className="font-medium mb-4 text-center">Key Outcome Metrics</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={prepareBarChartData()} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 1]} tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
                  <RechartsTooltip 
                    formatter={(value: any) => [`${(value * 100).toFixed(1)}%`, 'Value']}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Bar dataKey="value" name="Value">
                    {prepareBarChartData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 bg-green-50 rounded-md hover:shadow-md transition-shadow">
                <div className="text-sm text-green-600 mb-1 font-medium flex items-center">
                  <TrendingUp className="h-4 w-4 mr-1" /> Effect Size
                </div>
                <div className="text-xl font-bold text-green-700">{simulation.predictedOutcome.effectSize}</div>
                <div className="text-xs text-green-600 mt-1">
                  95% CI: {simulation.confidenceInterval[0]} - {simulation.confidenceInterval[1]}
                </div>
                <div className="w-full h-2 bg-green-200 mt-2 rounded-full">
                  <div 
                    className="h-2 bg-green-600 rounded-full"
                    style={{ width: `${Math.min(100, simulation.predictedOutcome.effectSize * 100)}%` }}
                  ></div>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Shows the magnitude of the treatment effect. Higher is generally better, but must be interpreted in context of the specific endpoint.
                </div>
              </div>
              <div className="p-3 bg-blue-50 rounded-md hover:shadow-md transition-shadow">
                <div className="text-sm text-blue-600 mb-1 font-medium flex items-center">
                  <PieChartIcon className="h-4 w-4 mr-1" /> Success Probability
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xl font-bold text-blue-700">{Math.round(simulation.successProbability * 100)}%</div>
                  <div className="h-12 w-12">
                    <RechartsPieChart width={48} height={48}>
                      <Pie
                        data={preparePieChartData()}
                        cx="50%"
                        cy="50%"
                        innerRadius={14}
                        outerRadius={24}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                      >
                        {preparePieChartData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                    </RechartsPieChart>
                  </div>
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  Statistical Power: {Math.round(simulation.predictedOutcome.powerEstimate * 100)}%
                </div>
                <div className="text-xs text-slate-500 mt-2 flex items-center">
                  <Badge variant={simulation.successProbability > 0.7 ? "success" : simulation.successProbability > 0.5 ? "secondary" : "outline"} className="mr-1">
                    {simulation.successProbability > 0.7 ? "High" : simulation.successProbability > 0.5 ? "Moderate" : "Low"}
                  </Badge>
                  <span>chance of achieving statistical significance</span>
                </div>
              </div>
              <div className="p-3 bg-purple-50 rounded-md hover:shadow-md transition-shadow">
                <div className="text-sm text-purple-600 mb-1 font-medium flex items-center">
                  <Activity className="h-4 w-4 mr-1" /> Statistical Significance
                </div>
                <div className="text-xl font-bold text-purple-700">p = {simulation.predictedOutcome.pValue}</div>
                <div className="text-xs flex items-center mt-1">
                  <Badge variant={simulation.predictedOutcome.pValue < 0.01 ? "success" : simulation.predictedOutcome.pValue < 0.05 ? "secondary" : "destructive"}>
                    {simulation.predictedOutcome.pValue < 0.01 ? 'Highly Significant' : simulation.predictedOutcome.pValue < 0.05 ? 'Significant' : 'Not Significant'}
                  </Badge>
                </div>
                <div className="mt-2 w-full h-2 bg-purple-200 rounded-full">
                  <div 
                    className="h-2 bg-purple-600 rounded-full"
                    style={{ width: `${Math.min(100, 100 - (simulation.predictedOutcome.pValue * 100))}%` }}
                  ></div>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Predicted p-value based on effect size and sample size. Values below 0.05 generally indicate statistical significance.
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-amber-50 rounded-md">
                <div className="text-sm text-amber-600 mb-1 font-medium">Time to Completion</div>
                <div className="text-xl font-bold text-amber-700">{simulation.timeToCompletion} months</div>
                <div className="grid grid-cols-5 gap-1 mt-3">
                  {[...Array(Math.round(simulation.timeToCompletion))].slice(0, 10).map((_, i) => (
                    <div 
                      key={i} 
                      className="h-1.5 bg-amber-400 rounded-full"
                      style={{ opacity: 0.3 + (i * 0.7 / Math.min(10, Math.round(simulation.timeToCompletion))) }}
                    ></div>
                  ))}
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Estimated time from trial start to database lock, including enrollment period.
                </div>
              </div>
              <div className="p-3 bg-rose-50 rounded-md">
                <div className="text-sm text-rose-600 mb-1 font-medium">Estimated Cost</div>
                <div className="text-xl font-bold text-rose-700">${(simulation.costEstimate / 1000000).toFixed(1)}M</div>
                <div className="flex items-center mt-1.5">
                  <div className="text-xs text-rose-600">
                    ~${Math.round(simulation.costEstimate / (parseInt(sampleSize) || simulation.predictedOutcome.sampleSize)).toLocaleString()} per patient
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Total estimated cost including startup, per-patient, and closeout costs.
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 rounded-md">
              <h4 className="font-medium mb-4 text-center">Risk Factor Analysis</h4>
              
              <ResponsiveContainer width="100%" height={230}>
                <BarChart
                  layout="vertical"
                  data={prepareRiskFactorsData()}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <XAxis type="number" domain={[0, 1]} tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
                  <YAxis type="category" dataKey="name" width={150} />
                  <RechartsTooltip 
                    formatter={(value: any, name: any, props: any) => {
                      return [props.payload.riskLabel + ' Risk', props.payload.name];
                    }}
                    labelFormatter={() => ''}
                  />
                  <Bar dataKey="risk" name="Risk Level">
                    {prepareRiskFactorsData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              
              <div className="space-y-2 mt-4">
                {simulation.riskFactors.map((factor: any, idx: number) => (
                  <div key={idx} className="text-sm">
                    <div className="flex items-start">
                      <Badge 
                        variant={
                          factor.risk === 'High' ? 'destructive' : 
                          factor.risk === 'Medium' ? 'secondary' : 
                          'outline'
                        } 
                        className="mt-0.5 mr-2"
                      >
                        {factor.risk}
                      </Badge>
                      <div>
                        <span className="font-medium">{factor.factor}:</span> {factor.impact}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Mitigation Strategies - New Section */}
            <div className="p-4 bg-indigo-50 rounded-md">
              <h4 className="font-medium mb-2">Potential Mitigation Strategies</h4>
              <div className="space-y-2">
                {simulation.riskFactors.filter((f: any) => f.risk === 'High' || f.risk === 'Medium').map((factor: any, idx: number) => (
                  <div key={idx} className="text-sm">
                    <div className="font-medium text-indigo-700">{factor.factor}:</div>
                    <div className="ml-4 text-slate-700">
                      {factor.factor.includes('Sample Size') && 
                        "Consider increasing sample size or using adaptive design with interim analyses to optimize enrollment."
                      }
                      {factor.factor.includes('Effect Size') && 
                        "Consider enrichment strategies to select patients more likely to respond to treatment."
                      }
                      {factor.factor.includes('Dropout') && 
                        "Implement patient retention strategies, reduce visit burden, provide transportation assistance."
                      }
                      {factor.factor.includes('Endpoint') && 
                        "Consider composite endpoints or validated surrogate markers with less variability."
                      }
                      {!factor.factor.includes('Sample Size') && 
                       !factor.factor.includes('Effect Size') && 
                       !factor.factor.includes('Dropout') && 
                       !factor.factor.includes('Endpoint') && 
                        "Review historical trials to identify strategies for addressing this risk factor."
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-slate-500">
              Select an indication and configure parameters to simulate a virtual clinical trial
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Study Design Agent component
function StudyDesignAgentCard() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const handleSubmit = () => {
    setIsLoading(true);
    // In a real implementation, this would call an API to get the response
    setTimeout(() => {
      setResponse(
        "Based on your CSR database analysis, for this Alzheimer's Phase 2 trial, I recommend:\n\n" +
        "1. Primary endpoint: Change in ADAS-Cog score at 18 months (not 12)\n" +
        "2. Key secondary endpoints: CDR-SB, hippocampal volume\n" +
        "3. Inclusion of APOE4 stratification (69% of successful trials used this)\n" +
        "4. Higher dose arms compared to similar compounds\n" +
        "5. Extended screening period to reduce placebo effect\n\n" +
        "This design incorporates patterns from the 7 most successful trials in your database while avoiding common pitfalls seen in failed studies."
      );
      setIsLoading(false);
    }, 2000);
  };
  
  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <Lightbulb className="h-5 w-5 text-amber-500 mr-2" />
          AI Study Design Agent
        </CardTitle>
        <CardDescription>
          Get trial design advice based on patterns from successful clinical trials
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              What would you like advice on?
            </label>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Example: What endpoint should I use for my Alzheimer's Phase 2 trial?"
              className="w-full rounded-md border border-slate-300 py-2 px-3 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          
          <Button 
            onClick={handleSubmit} 
            className="w-full"
            disabled={!prompt.trim() || isLoading}
          >
            {isLoading ? 'Analyzing CSR Database...' : 'Get Design Advice'}
          </Button>
          
          {response && (
            <div className="p-4 mt-4 bg-blue-50 rounded-md border border-blue-200">
              <h4 className="font-medium mb-2 text-blue-900">AI Study Design Recommendation</h4>
              <div className="text-sm whitespace-pre-line text-blue-800">
                {response}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  // Function to download analytics data
  const downloadAnalyticsData = async (format: 'csv' | 'json' | 'pdf', type: 'summary' | 'predictive' | 'competitors' = 'summary', extraParams?: Record<string, string>) => {
    try {
      const { toast } = useToast();
      
      // Build query parameters
      let queryParams = `format=${format}&type=${type}`;
      if (extraParams) {
        Object.entries(extraParams).forEach(([key, value]) => {
          if (value) {
            queryParams += `&${key}=${encodeURIComponent(value)}`;
          }
        });
      }
      
      // Call the API endpoint
      const response = await fetch(`/api/analytics/export?${queryParams}`);
      
      if (!response.ok) {
        throw new Error(`Failed to export analytics data as ${format}`);
      }
      
      let fileName = `trialsage_analytics_${type}_${new Date().toISOString().split('T')[0]}`;
      
      if (extraParams?.indication) {
        fileName += `_${extraParams.indication.replace(/\s+/g, '_')}`;
      }
      
      if (extraParams?.sponsor) {
        fileName += `_${extraParams.sponsor.replace(/\s+/g, '_')}`;
      }
      
      if (format === 'csv') {
        const text = await response.text();
        const blob = new Blob([text], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.csv`;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      } else if (format === 'json') {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.json`;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      } else {
        // PDF generation (in real implementation, this would use a PDF library)
        // toast call replaced
  // Original: toast({
          title: "PDF Generation",
          description: "PDF download is not fully implemented in this version. Please use CSV or JSON format.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "PDF Generation",
          description: "PDF download is not fully implemented in this version. Please use CSV or JSON format.",
          variant: "destructive"
        });
        return;
      }
      
      // toast call replaced
  // Original: toast({
        title: "Download Complete",
        description: `Analytics data has been downloaded as ${format.toUpperCase()
  console.log('Toast would show:', {
        title: "Download Complete",
        description: `Analytics data has been downloaded as ${format.toUpperCase()} format.`,
      });
    } catch (error) {
      console.error('Error downloading analytics data:', error);
      const { toast } = useToast();
      // toast call replaced
  // Original: toast({
        title: "Download Failed",
        description: "There was an error downloading the analytics data. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Download Failed",
        description: "There was an error downloading the analytics data. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="bg-gradient-to-r from-primary/20 to-blue-600/10 rounded-xl shadow-md p-8 border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2">Advanced Analytics & Modeling</h2>
            <p className="text-slate-600 max-w-2xl">
              Leverage powerful statistical models, predictive analytics, and AI-powered insights to optimize trial design and accelerate drug development.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex-shrink-0">
              <BarChart3 className="h-16 w-16 text-primary/70" />
            </div>
            <div className="flex space-x-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="flex items-center"
                  >
                    <FileSymlink className="mr-1 h-4 w-4" />
                    Export Data
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuItem onClick={() => downloadAnalyticsData('csv')}>
                    Summary Report (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => downloadAnalyticsData('json')}>
                    Summary Report (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => downloadAnalyticsData('csv', 'predictive', { indication: indication || '' })}>
                    Predictive Analytics (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => downloadAnalyticsData('json', 'predictive', { indication: indication || '' })}>
                    Predictive Analytics (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => downloadAnalyticsData('csv', 'competitors', { sponsor: 'Pfizer' })}>
                    Competitor Analysis (CSV)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-4 mb-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-medium mb-3 flex items-center">
          <Search className="h-5 w-5 mr-2 text-slate-500" />
          Advanced Data Filters
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Therapeutic Area
            </label>
            <Select defaultValue="">
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="All areas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All areas</SelectItem>
                <SelectItem value="oncology">Oncology</SelectItem>
                <SelectItem value="neurology">Neurology</SelectItem>
                <SelectItem value="cardiology">Cardiology</SelectItem>
                <SelectItem value="immunology">Immunology</SelectItem>
                <SelectItem value="infectious">Infectious Diseases</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Trial Phase
            </label>
            <Select defaultValue="">
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="All phases" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All phases</SelectItem>
                <SelectItem value="1">Phase 1</SelectItem>
                <SelectItem value="2">Phase 2</SelectItem>
                <SelectItem value="3">Phase 3</SelectItem>
                <SelectItem value="4">Phase 4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Sponsor
            </label>
            <Select defaultValue="">
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="All sponsors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All sponsors</SelectItem>
                <SelectItem value="pfizer">Pfizer</SelectItem>
                <SelectItem value="novartis">Novartis</SelectItem>
                <SelectItem value="roche">Roche</SelectItem>
                <SelectItem value="merck">Merck</SelectItem>
                <SelectItem value="astrazeneca">AstraZeneca</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date Range
            </label>
            <Select defaultValue="all">
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="All time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="1year">Last 1 year</SelectItem>
                <SelectItem value="3years">Last 3 years</SelectItem>
                <SelectItem value="5years">Last 5 years</SelectItem>
                <SelectItem value="10years">Last 10 years</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge className="px-3 py-1 bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer">
            Success Rate <span className="ml-1 opacity-75">×</span>
          </Badge>
          <Badge className="px-3 py-1 bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer">
            Sample Size &gt; 100 <span className="ml-1 opacity-75">×</span>
          </Badge>
          <Badge className="px-3 py-1 bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer">
            Primary Endpoint Met <span className="ml-1 opacity-75">×</span>
          </Badge>
          <Button variant="ghost" size="sm" className="h-6 text-xs">
            + Add More Filters
          </Button>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="text-sm text-slate-500">
            <strong>215</strong> trials match your criteria
          </div>
          <div className="space-x-2">
            <Button variant="outline" size="sm">Reset</Button>
            <Button size="sm">Apply Filters</Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid grid-cols-3 md:grid-cols-7 w-full bg-slate-100 p-1 rounded-lg">
          <TabsTrigger value="overview" className="rounded-md">Overview</TabsTrigger>
          <TabsTrigger value="predictive" className="rounded-md">Predictive Analysis</TabsTrigger>
          <TabsTrigger value="compare" className="rounded-md">Trial Comparison</TabsTrigger>
          <TabsTrigger value="virtual" className="rounded-md">Virtual Trial</TabsTrigger>
          <TabsTrigger value="design" className="rounded-md">Study Design</TabsTrigger>
          <TabsTrigger value="modeling" className="rounded-md">Statistical Modeling</TabsTrigger>
          <TabsTrigger value="deep-learning" className="rounded-md">Deep Learning</TabsTrigger>
          <TabsTrigger value="competitors" className="rounded-md">Competitor Analysis</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <AnalyticsSummaryCard />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <BarChart3 className="h-5 w-5 text-indigo-600 mr-2" />
                  Endpoint Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'Change in ADAS-Cog', count: 42, category: 'Cognitive' },
                        { name: 'RECIST Criteria', count: 36, category: 'Oncology' },
                        { name: 'HbA1c Reduction', count: 28, category: 'Metabolic' },
                        { name: 'Blood Pressure', count: 24, category: 'Cardiovascular' },
                        { name: 'HAM-D Score', count: 18, category: 'Psychiatric' },
                        { name: 'FEV1', count: 15, category: 'Respiratory' },
                        { name: 'ACR20', count: 13, category: 'Immunology' }
                      ]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="name" 
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={70}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis />
                      <RechartsTooltip
                        formatter={(value, name, props) => {
                          return [`${value} trials`, props.payload.category];
                        }}
                        labelFormatter={(value) => `Endpoint: ${value}`}
                      />
                      <Legend />
                      <Bar dataKey="count" name="Number of Trials" fill="#8884d8">
                        {[
                          { category: 'Cognitive', fill: '#6366f1' },
                          { category: 'Oncology', fill: '#ec4899' },
                          { category: 'Metabolic', fill: '#10b981' },
                          { category: 'Cardiovascular', fill: '#ef4444' },
                          { category: 'Psychiatric', fill: '#eab308' },
                          { category: 'Respiratory', fill: '#0ea5e9' },
                          { category: 'Immunology', fill: '#8b5cf6' }
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <PieChartIcon className="h-5 w-5 text-indigo-600 mr-2" />
                  Trial Success by Phase
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'Phase 1', success: 0.85, failure: 0.15 },
                        { name: 'Phase 2', success: 0.55, failure: 0.45 },
                        { name: 'Phase 3', success: 0.35, failure: 0.65 },
                        { name: 'Phase 4', success: 0.90, failure: 0.10 }
                      ]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 1]} tickFormatter={(value) => `${value * 100}%`} />
                      <YAxis type="category" dataKey="name" width={80} />
                      <RechartsTooltip 
                        formatter={(value, name) => [`${(value * 100).toFixed(1)}%`, name === 'success' ? 'Success Rate' : 'Failure Rate']}
                      />
                      <Legend />
                      <Bar dataKey="success" name="Success" stackId="a" fill="#4ade80" />
                      <Bar dataKey="failure" name="Failure" stackId="a" fill="#f87171" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="pt-2 text-center">
                  <div className="text-xs text-slate-500">
                    <span className="inline-block w-3 h-3 bg-green-400 rounded-full mr-1"></span>
                    Success: Primary endpoint met with statistical significance (p&lt;0.05)
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    <span className="inline-block w-3 h-3 bg-red-400 rounded-full mr-1"></span>
                    Failure: Primary endpoint not met or study terminated
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <TrendingUp className="h-5 w-5 text-indigo-600 mr-2" />
                Biomarker Performance Analysis
              </CardTitle>
              <CardDescription>
                Compare how different biomarkers correlate with clinical outcomes across therapeutic areas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-4 mb-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Therapeutic Area
                  </label>
                  <Select defaultValue="all">
                    <SelectTrigger>
                      <SelectValue placeholder="Select area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Areas</SelectItem>
                      <SelectItem value="oncology">Oncology</SelectItem>
                      <SelectItem value="neurology">Neurology</SelectItem>
                      <SelectItem value="cardiology">Cardiology</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    View By
                  </label>
                  <Select defaultValue="prediction">
                    <SelectTrigger>
                      <SelectValue placeholder="Select view" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prediction">Predictive Value</SelectItem>
                      <SelectItem value="adoption">Adoption Rate</SelectItem>
                      <SelectItem value="reliability">Reliability</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Chart Type
                  </label>
                  <Select defaultValue="bar">
                    <SelectTrigger>
                      <SelectValue placeholder="Select chart" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">Bar Chart</SelectItem>
                      <SelectItem value="radar">Radar Chart</SelectItem>
                      <SelectItem value="scatter">Scatter Plot</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'PD-L1 Expression', value: 0.78, trials: 42, category: 'Oncology' },
                      { name: 'EGFR Mutation', value: 0.82, trials: 36, category: 'Oncology' },
                      { name: 'Amyloid PET', value: 0.65, trials: 28, category: 'Neurology' },
                      { name: 'Tau/Aβ Ratio', value: 0.71, trials: 24, category: 'Neurology' },
                      { name: 'NT-proBNP', value: 0.76, trials: 18, category: 'Cardiology' },
                      { name: 'CRP', value: 0.59, trials: 15, category: 'Cardiology' },
                      { name: 'IL-6', value: 0.68, trials: 14, category: 'Immunology' }
                    ]}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis domain={[0, 1]} tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
                    <RechartsTooltip
                      formatter={(value, name, props) => [
                        `${(value * 100).toFixed(1)}%`,
                        'Predictive Value'
                      ]}
                      labelFormatter={(value) => `Biomarker: ${value}`}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-3 border rounded shadow-sm">
                              <p className="font-medium">{label}</p>
                              <p className="text-sm">
                                Predictive Value: <span className="text-indigo-600 font-medium">{(payload[0].value * 100).toFixed(1)}%</span>
                              </p>
                              <p className="text-sm">
                                Used in <span className="font-medium">{payload[0].payload.trials}</span> trials
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                Category: {payload[0].payload.category}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="value" name="Predictive Value">
                      {[
                        { category: 'Oncology', fill: '#ec4899' },
                        { category: 'Oncology', fill: '#ec4899' },
                        { category: 'Neurology', fill: '#6366f1' },
                        { category: 'Neurology', fill: '#6366f1' },
                        { category: 'Cardiology', fill: '#ef4444' },
                        { category: 'Cardiology', fill: '#ef4444' },
                        { category: 'Immunology', fill: '#8b5cf6' }
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="predictive" className="space-y-4">
          <PredictiveAnalysisCard />
          
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Historical Efficacy Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full bg-slate-50 rounded-md flex items-center justify-center">
                <span className="text-slate-400">Trend visualization coming soon</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="compare" className="space-y-4">
          <TrialComparisonCard />
          
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Efficacy Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full bg-slate-50 rounded-md flex items-center justify-center">
                <span className="text-slate-400">Comparative efficacy visualization coming soon</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="virtual" className="space-y-4">
          <VirtualTrialSimulationCard />
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Historical Data Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full bg-slate-50 rounded-md flex items-center justify-center">
                <span className="text-slate-400">Historical data visualization coming soon</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="design" className="space-y-4">
          <StudyDesignAgentCard />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Design Elements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {['Sample Size Calculation', 'Stratification Factors', 'Randomization Ratio', 'Endpoint Selection', 'Visit Schedule'].map((elem, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <span>{elem}</span>
                      <Button size="sm" variant="outline">Generate</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Reference Design Templates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { name: 'Standard Phase 1 FIH', score: 95 },
                    { name: 'Adaptive Dose Escalation', score: 87 },
                    { name: 'Biomarker-Driven Phase 2', score: 83 },
                    { name: 'Basket Trial Design', score: 79 },
                    { name: 'Pragmatic Phase 4', score: 76 }
                  ].map((template, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <span>{template.name}</span>
                      <Badge variant="outline">{template.score}% match</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="competitors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Users className="h-5 w-5 text-indigo-600 mr-2" />
                Competitive Intelligence Dashboard
              </CardTitle>
              <CardDescription>
                Analyze competitor trials, identify market trends, and benchmark your clinical development program
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Select Sponsor for Analysis
                </label>
                <div className="flex space-x-2">
                  <Select defaultValue="pfizer">
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select sponsor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pfizer">Pfizer</SelectItem>
                      <SelectItem value="novartis">Novartis</SelectItem>
                      <SelectItem value="roche">Roche</SelectItem>
                      <SelectItem value="merck">Merck</SelectItem>
                      <SelectItem value="astrazeneca">AstraZeneca</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button>Analyze Competitors</Button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-4 rounded-md border border-slate-200">
                  <h4 className="text-md font-medium mb-3">Therapeutic Area Focus</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={[
                            { name: 'Oncology', value: 35, fill: '#ec4899' },
                            { name: 'Neurology', value: 20, fill: '#6366f1' },
                            { name: 'Cardiology', value: 15, fill: '#ef4444' },
                            { name: 'Immunology', value: 12, fill: '#8b5cf6' },
                            { name: 'Infectious', value: 10, fill: '#10b981' },
                            { name: 'Other', value: 8, fill: '#94a3b8' }
                          ]}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        />
                        <Legend verticalAlign="bottom" height={36} />
                        <Tooltip formatter={(value) => `${value} trials`} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="bg-white p-4 rounded-md border border-slate-200">
                  <h4 className="text-md font-medium mb-3">Trial Phase Distribution</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={[
                          { phase: 'Phase 1', count: 28, fill: '#94a3b8' },
                          { phase: 'Phase 2', count: 35, fill: '#6366f1' },
                          { phase: 'Phase 3', count: 22, fill: '#8b5cf6' },
                          { phase: 'Phase 4', count: 15, fill: '#10b981' }
                        ]}
                        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="phase" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`${value} trials`, 'Count']} />
                        <Bar dataKey="count" name="Number of Trials">
                          {[
                            { phase: 'Phase 1', fill: '#94a3b8' },
                            { phase: 'Phase 2', fill: '#6366f1' },
                            { phase: 'Phase 3', fill: '#8b5cf6' },
                            { phase: 'Phase 4', fill: '#10b981' }
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-4 rounded-md border border-slate-200 mb-6">
                <h4 className="text-md font-medium mb-3">Top Competitors by Clinical Trial Activity</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    layout="vertical"
                    data={[
                      { name: 'Pfizer', trials: 85, fillColor: '#6366f1' },
                      { name: 'Novartis', trials: 73, fillColor: '#8b5cf6' },
                      { name: 'Roche', trials: 65, fillColor: '#ec4899' },
                      { name: 'Merck', trials: 58, fillColor: '#10b981' },
                      { name: 'AstraZeneca', trials: 52, fillColor: '#ef4444' },
                      { name: 'Johnson & Johnson', trials: 45, fillColor: '#f59e0b' },
                      { name: 'Sanofi', trials: 40, fillColor: '#06b6d4' }
                    ]}
                    margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" label={{ value: 'Number of Trials', position: 'bottom', offset: 0 }} />
                    <YAxis type="category" dataKey="name" />
                    <Tooltip formatter={(value) => [`${value} trials`, 'Trial Count']} />
                    <Bar dataKey="trials" name="Active Trials">
                      {[
                        { name: 'Pfizer', fillColor: '#6366f1' },
                        { name: 'Novartis', fillColor: '#8b5cf6' },
                        { name: 'Roche', fillColor: '#ec4899' },
                        { name: 'Merck', fillColor: '#10b981' },
                        { name: 'AstraZeneca', fillColor: '#ef4444' },
                        { name: 'Johnson & Johnson', fillColor: '#f59e0b' },
                        { name: 'Sanofi', fillColor: '#06b6d4' }
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fillColor} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-md border border-slate-200">
                  <h4 className="text-md font-medium mb-3">Success Rate Comparison</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={[
                        { name: 'Pfizer', success: 0.45, industry: 0.38 },
                        { name: 'Novartis', success: 0.48, industry: 0.38 },
                        { name: 'Roche', success: 0.42, industry: 0.38 },
                        { name: 'Merck', success: 0.50, industry: 0.38 },
                        { name: 'AstraZeneca', success: 0.41, industry: 0.38 }
                      ]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} />
                      <YAxis tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} domain={[0, 0.6]} />
                      <Tooltip formatter={(value) => `${(value * 100).toFixed(1)}%`} />
                      <Bar dataKey="success" name="Company Success Rate" fill="#6366f1" />
                      <Bar dataKey="industry" name="Industry Average" fill="#94a3b8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="bg-white p-4 rounded-md border border-slate-200">
                  <h4 className="text-md font-medium mb-3">Recent Competitive Activity</h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                    {[
                      { company: 'Pfizer', date: '2024-03-15', title: 'Phase 3 trial for EGFR-positive NSCLC', indication: 'Oncology' },
                      { company: 'Novartis', date: '2024-03-10', title: 'New Phase 2 trial in relapsed multiple myeloma', indication: 'Oncology' },
                      { company: 'Merck', date: '2024-03-05', title: 'Interim analysis results for Phase 3 trial in AD', indication: 'Neurology' },
                      { company: 'Roche', date: '2024-02-28', title: 'New biomarker-driven Phase 2 in breast cancer', indication: 'Oncology' },
                      { company: 'AstraZeneca', date: '2024-02-20', title: 'Fast-track designation for respiratory drug', indication: 'Respiratory' },
                      { company: 'Johnson & Johnson', date: '2024-02-15', title: 'Completed enrollment for Phase 3 vaccine trial', indication: 'Infectious' },
                      { company: 'Sanofi', date: '2024-02-10', title: 'Initiated Phase 1 for novel MOA in psoriasis', indication: 'Immunology' }
                    ].map((item, idx) => (
                      <div key={idx} className="p-2 bg-slate-50 rounded-md">
                        <div className="flex justify-between items-start">
                          <div className="font-medium text-sm">{item.company}</div>
                          <div className="text-xs text-slate-500">{item.date}</div>
                        </div>
                        <div className="text-sm mt-1">{item.title}</div>
                        <Badge variant="outline" className="mt-1">{item.indication}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex justify-between">
                <Button 
                  variant="outline" 
                  className="flex items-center" 
                  onClick={() => downloadAnalyticsData('csv')}
                >
                  <FileSymlink className="mr-2 h-4 w-4" />
                  Export Competitor Analysis
                </Button>
                <Button>Generate Detailed Report</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="deep-learning" className="space-y-4">
          <DeepLearningPanel csrs={reports} onAnalysisComplete={(result) => {
            // Handle analysis result if needed
            console.log("Deep Learning Analysis completed:", result);
          }} />
        </TabsContent>
        
        <TabsContent value="modeling" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center text-lg">
                  <TrendingUp className="h-5 w-5 text-green-600 mr-2" />
                  Statistical Models
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {['Survival Analysis', 'Mixed Effects', 'Repeated Measures', 'Bayesian Analysis', 'Adaptive Design'].map((model, idx) => (
                    <div key={idx} className="p-2 bg-slate-50 rounded flex items-center">
                      <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                      <span>{model}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center text-lg">
                  <AlertCircle className="h-5 w-5 text-amber-600 mr-2" />
                  Risk Factors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { factor: 'Inadequate Sample Size', risk: 'High' },
                    { factor: 'Incomplete Safety Data', risk: 'Medium' },
                    { factor: 'Endpoint Reliability', risk: 'Medium' },
                    { factor: 'Population Heterogeneity', risk: 'High' },
                    { factor: 'Dosing Frequency', risk: 'Low' }
                  ].map((item, idx) => (
                    <div key={idx} className="p-2 bg-slate-50 rounded flex justify-between">
                      <span>{item.factor}</span>
                      <Badge variant={
                        item.risk === 'High' ? 'destructive' : 
                        item.risk === 'Medium' ? 'secondary' : 
                        'outline'
                      }>
                        {item.risk} Risk
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center text-lg">
                  <Beaker className="h-5 w-5 text-purple-600 mr-2" />
                  Virtual Trial Simulator
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Simulate trial outcomes using historical data and statistical models
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Sample Size
                      </label>
                      <Input type="number" placeholder="100" min="10" max="1000" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Effect Size
                      </label>
                      <Input type="number" placeholder="0.25" min="0.05" max="1.0" step="0.05" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Dropout Rate
                      </label>
                      <Input type="number" placeholder="15%" min="0" max="50" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Arms
                      </label>
                      <Input type="number" placeholder="2" min="1" max="6" />
                    </div>
                  </div>
                  <Button className="w-full" size="sm">Run Simulation</Button>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">
                Open-Source Statistical Modeling Engine
              </CardTitle>
              <CardDescription>
                Power your trials with advanced statistical capabilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="p-4 bg-blue-50 rounded-md">
                  <h4 className="font-medium mb-2 flex items-center">
                    <FileSymlink className="h-4 w-4 mr-1" />
                    Forecasting Tools
                  </h4>
                  <ul className="text-sm space-y-1">
                    <li>• Parametric survival models</li>
                    <li>• Dropout prediction</li>
                    <li>• Event rate forecasting</li>
                    <li>• Recruitment modeling</li>
                  </ul>
                </div>
                
                <div className="p-4 bg-green-50 rounded-md">
                  <h4 className="font-medium mb-2 flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    Patient Population Tools
                  </h4>
                  <ul className="text-sm space-y-1">
                    <li>• Enrichment strategy modeling</li>
                    <li>• Responder analysis</li>
                    <li>• Subgroup identification</li>
                    <li>• Biomarker stratification</li>
                  </ul>
                </div>
                
                <div className="p-4 bg-purple-50 rounded-md">
                  <h4 className="font-medium mb-2 flex items-center">
                    <Flag className="h-4 w-4 mr-1" />
                    Trial Success Factors
                  </h4>
                  <ul className="text-sm space-y-1">
                    <li>• Power calculation tools</li>
                    <li>• Sample size optimization</li>
                    <li>• Protocol deviation impact</li>
                    <li>• Endpoint sensitivity</li>
                  </ul>
                </div>
              </div>
              
              <div className="text-center">
                <p className="text-slate-500 text-sm mb-2">Ready to use our Statistical Modeling API in your workflows?</p>
                <div className="inline-flex space-x-2">
                  <Button variant="outline" size="sm">View Documentation</Button>
                  <Button size="sm">Request API Access</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
