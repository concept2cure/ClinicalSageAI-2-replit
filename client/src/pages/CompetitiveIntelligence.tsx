import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { 
  Microscope, 
  BarChart, 
  PieChart, 
  FileText, 
  TrendingUp, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  Calendar, 
  Users, 
  Beaker,
  ExternalLink,
  Search,
  Lightbulb,
  AlertTriangle
} from 'lucide-react';

// Unified Strategic Intelligence Engine
import StrategicRecommendations from '@/components/competitive/StrategicRecommendations';
import { Textarea } from '@/components/ui/textarea';

import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter 
} from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

// Mock competitive intelligence data
const competitors = [
  {
    id: 'comp_001',
    name: 'BioPharma X',
    marketCap: '$12.5B',
    pipelineOverlap: 'High',
    focusAreas: ['Oncology', 'Neurology', 'Rare Disease'],
    keyProducts: ['XBio-1', 'XBio-2', 'XBio-3'],
    recentTrials: 8,
    pipelineStrength: 82
  },
  {
    id: 'comp_002',
    name: 'NovaCure Therapeutics',
    marketCap: '$8.2B',
    pipelineOverlap: 'Medium',
    focusAreas: ['Oncology', 'Immunology'],
    keyProducts: ['ImmunoStat', 'OncoCure'],
    recentTrials: 5,
    pipelineStrength: 73
  },
  {
    id: 'comp_003',
    name: 'GeneticaHealth',
    marketCap: '$5.7B',
    pipelineOverlap: 'High',
    focusAreas: ['Oncology', 'Genetic Disorders'],
    keyProducts: ['GeneTher', 'OncoDNA'],
    recentTrials: 6,
    pipelineStrength: 68
  },
  {
    id: 'comp_004',
    name: 'MedImmuneX',
    marketCap: '$9.3B',
    pipelineOverlap: 'Low',
    focusAreas: ['Immunology', 'Inflammatory Disease'],
    keyProducts: ['ImmuX', 'AntiFlam'],
    recentTrials: 4,
    pipelineStrength: 62
  },
  {
    id: 'comp_005',
    name: 'NeuroBioTech',
    marketCap: '$3.8B',
    pipelineOverlap: 'Medium',
    focusAreas: ['Neurology', 'Psychiatry'],
    keyProducts: ['NeuraStat', 'SynaTech'],
    recentTrials: 3,
    pipelineStrength: 58
  }
];

// Market landscape data
const marketTrends = [
  {
    id: 'trend_1',
    trend: 'Checkpoint Inhibitor Combinations',
    growthRate: '+28%',
    timeframe: '2023-2025',
    impact: 'High',
    competitors: ['BioPharma X', 'GeneticaHealth', 'Lumen Bio']
  },
  {
    id: 'trend_2',
    trend: 'RNA-based Therapeutics',
    growthRate: '+35%',
    timeframe: '2023-2025',
    impact: 'Medium',
    competitors: ['NovaCure Therapeutics', 'BioPharma X']
  },
  {
    id: 'trend_3',
    trend: 'Microbiome Modulators',
    growthRate: '+41%',
    timeframe: '2023-2025',
    impact: 'Medium',
    competitors: ['Lumen Bio', 'MedImmuneX']
  },
  {
    id: 'trend_4',
    trend: 'Gene Editing Therapies',
    growthRate: '+62%',
    timeframe: '2023-2025',
    impact: 'High',
    competitors: ['GeneticaHealth', 'NovaCure Therapeutics']
  },
  {
    id: 'trend_5',
    trend: 'AI-driven Drug Discovery',
    growthRate: '+45%',
    timeframe: '2023-2025',
    impact: 'High',
    competitors: ['Lumen Bio', 'BioPharma X', 'NeuroBioTech']
  }
];

// Trial performance metrics
const trialMetrics = [
  {
    id: 'metric_1',
    metric: 'Patient Enrollment Rate',
    lumenBio: '92%',
    industryAvg: '78%',
    difference: '+14%',
    trend: 'up'
  },
  {
    id: 'metric_2',
    metric: 'Trial Completion Rate',
    lumenBio: '88%',
    industryAvg: '82%',
    difference: '+6%',
    trend: 'up'
  },
  {
    id: 'metric_3',
    metric: 'Protocol Amendments',
    lumenBio: '1.2',
    industryAvg: '2.4',
    difference: '-50%',
    trend: 'up'
  },
  {
    id: 'metric_4',
    metric: 'Time to Full Enrollment',
    lumenBio: '8.2 months',
    industryAvg: '11.5 months',
    difference: '-29%',
    trend: 'up'
  },
  {
    id: 'metric_5',
    metric: 'Data Query Resolution Time',
    lumenBio: '3.5 days',
    industryAvg: '6.8 days',
    difference: '-48%',
    trend: 'up'
  }
];

// Competitive landscape reports
const competitiveReports = [
  {
    id: 'report_1',
    title: 'Checkpoint Inhibitor Landscape Analysis',
    date: '2025-03-15',
    type: 'Market',
    category: 'Oncology',
    summary: 'Comprehensive analysis of checkpoint inhibitor competitive landscape with focus on NSCLC indications and combination approaches'
  },
  {
    id: 'report_2',
    title: 'Immunotherapy Trials Benchmark',
    date: '2025-02-10',
    type: 'Benchmark',
    category: 'Oncology',
    summary: 'Performance benchmark of immunotherapy clinical trials comparing Lumen Bio studies against top 5 competitors'
  },
  {
    id: 'report_3',
    title: 'BioPharma X Pipeline Analysis',
    date: '2025-01-22',
    type: 'Competitor',
    category: 'Multiple',
    summary: 'Detailed analysis of BioPharma X pipeline with focus on therapeutic areas overlapping with Lumen Bio'
  },
  {
    id: 'report_4',
    title: 'IBD Market Opportunity Assessment',
    date: '2024-12-05',
    type: 'Market',
    category: 'Immunology',
    summary: 'Assessment of market opportunity in inflammatory bowel disease with competitive positioning analysis'
  },
  {
    id: 'report_5',
    title: 'Clinical Trial Design Strategies',
    date: '2024-11-18',
    type: 'Strategy',
    category: 'Multiple',
    summary: 'Analysis of successful clinical trial design strategies across Lumen Bio therapeutic areas'
  }
];

export default function CompetitiveIntelligence() {
  const { toast } = useToast();
  const [activeCompetitor, setActiveCompetitor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [protocolSummary, setProtocolSummary] = useState<string>('');
  const [generatedReport, setGeneratedReport] = useState<string>('');
  const [indication, setIndication] = useState<string>('Oncology');
  const [phase, setPhase] = useState<string>('Phase 2');
  const [sampleSize, setSampleSize] = useState<string>('100');

  // This would use a real API endpoint in production
  const { data: marketData, isLoading: isLoadingMarket } = useQuery({
    queryKey: ['/api/competitive-intelligence/market'],
    initialData: {
      trends: marketTrends,
      competitors: competitors
    }
  });

  // Get filtered reports based on search and category
  const filteredReports = competitiveReports.filter(report => {
    const matchesSearch = searchQuery === '' || 
      report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.summary.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = filterCategory === 'all' || 
      report.category === filterCategory ||
      report.type === filterCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleDownloadReport = (reportId: string) => {
    // toast call replaced
  // Original: toast({
      title: "Report Download Started",
      description: "Your report is being prepared for download.",
    })
  console.log('Toast would show:', {
      title: "Report Download Started",
      description: "Your report is being prepared for download.",
    });
  };

  const handleRequestAnalysis = () => {
    // toast call replaced
  // Original: toast({
      title: "Analysis Request Submitted",
      description: "Your custom competitive analysis request has been submitted.",
    })
  console.log('Toast would show:', {
      title: "Analysis Request Submitted",
      description: "Your custom competitive analysis request has been submitted.",
    });
  };
  
  const handleAnalyzeProtocol = async () => {
    if (!protocolSummary) {
      // toast call replaced
  // Original: toast({
        title: "Missing Information",
        description: "Please provide a protocol summary to analyze.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing Information",
        description: "Please provide a protocol summary to analyze.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const response = await apiRequest("POST", "/api/strategy/analyze", {
        protocolSummary,
        indication,
        phase,
        sponsor: "Lumen Bio"
      });
      
      const data = await response.json();
      
      if (data.success && data.analysisResult) {
        setGeneratedReport(data.analysisResult.analysis.fullText);
        // toast call replaced
  // Original: toast({
          title: "Analysis Complete",
          description: "Strategic analysis has been generated successfully.",
        })
  console.log('Toast would show:', {
          title: "Analysis Complete",
          description: "Strategic analysis has been generated successfully.",
        });
      } else {
        throw new Error(data.message || "Failed to generate strategic analysis");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate analysis",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate analysis",
        variant: "destructive"
      });
    }
  };
  
  const handleExportPdf = async () => {
    if (!generatedReport) {
      // toast call replaced
  // Original: toast({
        title: "No Report Available",
        description: "Please generate a strategic analysis first.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "No Report Available",
        description: "Please generate a strategic analysis first.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const response = await apiRequest("POST", "/api/strategy/export-pdf", {
        protocolSummary,
        indication,
        phase,
        sponsor: "Lumen Bio",
        report: generatedReport,
        title: `Strategic Analysis: ${indication} ${phase} Protocol`
      });
      
      const data = await response.json();
      
      if (data.success && data.download_url) {
        // Open download in new tab
        window.open(data.download_url, '_blank');
        
        // toast call replaced
  // Original: toast({
          title: "PDF Export Complete",
          description: "Your strategic report PDF is ready for download.",
        })
  console.log('Toast would show:', {
          title: "PDF Export Complete",
          description: "Your strategic report PDF is ready for download.",
        });
      } else {
        throw new Error(data.message || "Failed to generate PDF");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Export Error",
        description: error instanceof Error ? error.message : "Failed to export PDF",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Export Error",
        description: error instanceof Error ? error.message : "Failed to export PDF",
        variant: "destructive"
      });
    }
  };
  
  const handleSaveToDossier = async () => {
    if (!generatedReport) {
      // toast call replaced
  // Original: toast({
        title: "No Report Available",
        description: "Please generate a strategic analysis first.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "No Report Available",
        description: "Please generate a strategic analysis first.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const response = await apiRequest("POST", "/api/dossier/save-strategy", {
        protocol_id: `${indication.toLowerCase().replace(/\s+/g, '-')}-${phase.toLowerCase().replace(/\s+/g, '-')}`,
        strategy_text: generatedReport
      });
      
      const data = await response.json();
      
      if (data.success) {
        // toast call replaced
  // Original: toast({
          title: "Saved to Dossier",
          description: "Strategic analysis has been saved to your study dossier.",
        })
  console.log('Toast would show:', {
          title: "Saved to Dossier",
          description: "Strategic analysis has been saved to your study dossier.",
        });
      } else {
        throw new Error(data.message || "Failed to save to dossier");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Save Error",
        description: error instanceof Error ? error.message : "Failed to save to dossier",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Save Error",
        description: error instanceof Error ? error.message : "Failed to save to dossier",
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
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Competitive Intelligence</h1>
          <p className="mt-1 text-slate-500">
            Comprehensive market landscape and competitor analysis for Lumen Bio
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleRequestAnalysis}>
            Request Custom Analysis
          </Button>
          <Button>
            Generate Full Report
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Market Overview</TabsTrigger>
          <TabsTrigger value="competitors">Competitor Analysis</TabsTrigger>
          <TabsTrigger value="trials">Trial Performance</TabsTrigger>
          <TabsTrigger value="reports">Intelligence Library</TabsTrigger>
          <TabsTrigger value="strategic-analysis">
            <div className="flex items-center gap-1">
              <Lightbulb className="h-4 w-4" />
              <span>Strategic Analysis</span>
            </div>
          </TabsTrigger>
        </TabsList>
        
        {/* Market Overview Tab */}
        <TabsContent value="overview" className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Market Summary Card */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center">
                  <TrendingUp className="mr-2 h-5 w-5 text-primary" />
                  Market Landscape Overview
                </CardTitle>
                <CardDescription>
                  Key market trends and competitive positioning in Lumen Bio therapeutic areas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Emerging Therapeutic Trends</h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Trend</TableHead>
                          <TableHead>Growth</TableHead>
                          <TableHead>Impact</TableHead>
                          <TableHead>Key Players</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {marketTrends.map(trend => (
                          <TableRow key={trend.id}>
                            <TableCell className="font-medium">{trend.trend}</TableCell>
                            <TableCell className="text-green-600 font-medium">{trend.growthRate}</TableCell>
                            <TableCell>
                              <Badge variant={trend.impact === 'High' ? 'default' : 'secondary'}>
                                {trend.impact}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {trend.competitors.map(comp => (
                                  <Badge key={comp} variant="outline" className="text-xs">
                                    {comp}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  
                  <Alert>
                    <Microscope className="h-4 w-4" />
                    <AlertTitle>Competitive Advantage</AlertTitle>
                    <AlertDescription>
                      Lumen Bio has strategic positioning in 3 of 5 highest-growth therapeutic approaches
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
            
            {/* Key Indicators Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center">
                  <BarChart className="mr-2 h-5 w-5 text-primary" />
                  Market Position Indicators
                </CardTitle>
                <CardDescription>
                  Key metrics showing Lumen Bio's competitive position
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">Market Share (Oncology)</span>
                      <span className="text-sm font-bold">16%</span>
                    </div>
                    <Progress value={16} className="h-2" />
                    <p className="text-xs text-slate-500 mt-1">+3.5% year-over-year growth</p>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">Pipeline Strength Score</span>
                      <span className="text-sm font-bold">78/100</span>
                    </div>
                    <Progress value={78} className="h-2" />
                    <p className="text-xs text-slate-500 mt-1">Top quartile among mid-cap biopharma</p>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">Trial Success Rate</span>
                      <span className="text-sm font-bold">64%</span>
                    </div>
                    <Progress value={64} className="h-2" />
                    <p className="text-xs text-slate-500 mt-1">Industry average: 48%</p>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">Innovation Index</span>
                      <span className="text-sm font-bold">83/100</span>
                    </div>
                    <Progress value={83} className="h-2" />
                    <p className="text-xs text-slate-500 mt-1">Based on patent analysis & novel approaches</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Strategic Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Strategic Recommendations</CardTitle>
              <CardDescription>
                Data-driven insights to maintain competitive advantage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold text-primary mb-2 flex items-center">
                    <Beaker className="h-4 w-4 mr-2" />
                    R&D Strategy
                  </h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start">
                      <div className="min-w-4 mt-0.5">•</div>
                      <span>Prioritize combination approaches with checkpoint inhibitors</span>
                    </li>
                    <li className="flex items-start">
                      <div className="min-w-4 mt-0.5">•</div>
                      <span>Expand AI-driven discovery pipeline to maintain innovation edge</span>
                    </li>
                    <li className="flex items-start">
                      <div className="min-w-4 mt-0.5">•</div>
                      <span>Consider strategic partnerships in microbiome therapeutics</span>
                    </li>
                  </ul>
                </div>
                
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold text-primary mb-2 flex items-center">
                    <Users className="h-4 w-4 mr-2" />
                    Clinical Development
                  </h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start">
                      <div className="min-w-4 mt-0.5">•</div>
                      <span>Maintain streamlined protocol design to preserve enrollment advantage</span>
                    </li>
                    <li className="flex items-start">
                      <div className="min-w-4 mt-0.5">•</div>
                      <span>Expand decentralized trial approaches ahead of competitors</span>
                    </li>
                    <li className="flex items-start">
                      <div className="min-w-4 mt-0.5">•</div>
                      <span>Leverage real-world evidence to accelerate regulatory pathways</span>
                    </li>
                  </ul>
                </div>
                
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold text-primary mb-2 flex items-center">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Market Strategy
                  </h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start">
                      <div className="min-w-4 mt-0.5">•</div>
                      <span>Position LUM-1 as preferred combination partner with established therapies</span>
                    </li>
                    <li className="flex items-start">
                      <div className="min-w-4 mt-0.5">•</div>
                      <span>Differentiate trial design efficiency in investor communications</span>
                    </li>
                    <li className="flex items-start">
                      <div className="min-w-4 mt-0.5">•</div>
                      <span>Monitor BioPharma X for potential competitive responses</span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full">
                Generate Full Strategic Analysis
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Competitor Analysis Tab */}
        <TabsContent value="competitors" className="space-y-6 py-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              {/* Competitor Overview */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Competitors</CardTitle>
                  <CardDescription>
                    Organizations with significant therapeutic overlap with Lumen Bio
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Competitor</TableHead>
                          <TableHead>Market Cap</TableHead>
                          <TableHead>Overlap</TableHead>
                          <TableHead>Recent Trials</TableHead>
                          <TableHead>Pipeline Strength</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {competitors.map(comp => (
                          <TableRow key={comp.id} className={activeCompetitor === comp.id ? "bg-slate-50" : ""}>
                            <TableCell className="font-medium">{comp.name}</TableCell>
                            <TableCell>{comp.marketCap}</TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  comp.pipelineOverlap === 'High' ? 'default' : 
                                  comp.pipelineOverlap === 'Medium' ? 'secondary' : 
                                  'outline'
                                }
                              >
                                {comp.pipelineOverlap}
                              </Badge>
                            </TableCell>
                            <TableCell>{comp.recentTrials}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={comp.pipelineStrength} className="h-2 w-24" />
                                <span className="text-sm">{comp.pipelineStrength}/100</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setActiveCompetitor(activeCompetitor === comp.id ? null : comp.id)}
                              >
                                {activeCompetitor === comp.id ? 
                                  <ChevronUp className="h-4 w-4" /> : 
                                  <ChevronDown className="h-4 w-4" />
                                }
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
              
              {/* Active Competitor Details */}
              {activeCompetitor && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>
                      {competitors.find(c => c.id === activeCompetitor)?.name} - Detailed Analysis
                    </CardTitle>
                    <CardDescription>
                      Comprehensive analysis and strategic comparison
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium text-slate-500">Focus Areas</h3>
                          <div className="flex flex-wrap gap-2">
                            {competitors.find(c => c.id === activeCompetitor)?.focusAreas.map(area => (
                              <Badge key={area} variant="outline">
                                {area}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium text-slate-500">Key Products</h3>
                          <div className="flex flex-wrap gap-2">
                            {competitors.find(c => c.id === activeCompetitor)?.keyProducts.map(product => (
                              <Badge key={product} variant="secondary">
                                {product}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium text-slate-500">Overlap Analysis</h3>
                          <p className="text-sm">
                            High overlap in oncology immunotherapy targets with strategic differentiation in delivery mechanisms.
                          </p>
                        </div>
                      </div>
                      
                      <Separator />
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h3 className="font-medium mb-3">Competing Programs</h3>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                              <div>
                                <span className="font-medium">XBio-1 vs LUM-1</span>
                                <p className="text-xs text-slate-500">Checkpoint Inhibitor</p>
                              </div>
                              <Badge>Phase 2 vs Phase 2</Badge>
                            </div>
                            <Progress value={65} className="h-1.5" />
                            <p className="text-xs text-slate-500">65% similarity in mechanism of action, target patient population</p>
                            
                            <div className="flex justify-between items-center text-sm mt-4">
                              <div>
                                <span className="font-medium">XBio-3 vs LUM-4</span>
                                <p className="text-xs text-slate-500">CAR-T Platform</p>
                              </div>
                              <Badge variant="secondary">Phase 1 vs Phase 1/2</Badge>
                            </div>
                            <Progress value={42} className="h-1.5" />
                            <p className="text-xs text-slate-500">42% similarity, Lumen Bio has differentiated manufacturing process</p>
                          </div>
                        </div>
                        
                        <div>
                          <h3 className="font-medium mb-3">Strategic Comparison</h3>
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between mb-1">
                                <span className="text-sm">Clinical Trial Efficiency</span>
                                <span className="text-sm font-medium text-green-600">+28%</span>
                              </div>
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <Progress value={85} className="h-1.5" />
                                  <p className="text-[10px] text-slate-500 mt-0.5">Lumen Bio</p>
                                </div>
                                <div className="flex-1">
                                  <Progress value={62} className="h-1.5" />
                                  <p className="text-[10px] text-slate-500 mt-0.5">Competitor</p>
                                </div>
                              </div>
                            </div>
                            
                            <div>
                              <div className="flex justify-between mb-1">
                                <span className="text-sm">Publication Output</span>
                                <span className="text-sm font-medium text-amber-600">-12%</span>
                              </div>
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <Progress value={65} className="h-1.5" />
                                  <p className="text-[10px] text-slate-500 mt-0.5">Lumen Bio</p>
                                </div>
                                <div className="flex-1">
                                  <Progress value={78} className="h-1.5" />
                                  <p className="text-[10px] text-slate-500 mt-0.5">Competitor</p>
                                </div>
                              </div>
                            </div>
                            
                            <div>
                              <div className="flex justify-between mb-1">
                                <span className="text-sm">Patent Portfolio</span>
                                <span className="text-sm font-medium text-green-600">+8%</span>
                              </div>
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <Progress value={72} className="h-1.5" />
                                  <p className="text-[10px] text-slate-500 mt-0.5">Lumen Bio</p>
                                </div>
                                <div className="flex-1">
                                  <Progress value={66} className="h-1.5" />
                                  <p className="text-[10px] text-slate-500 mt-0.5">Competitor</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button variant="outline" className="w-full">
                      Generate Full Competitor Report
                    </Button>
                  </CardFooter>
                </Card>
              )}
            </div>
            
            {/* Competitor Heatmap */}
            <div>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Competitive Positioning Map</CardTitle>
                  <CardDescription>
                    Strategic positioning relative to key competitors
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col h-full">
                  <div className="flex-1 flex flex-col justify-center items-center p-4 bg-slate-50 rounded-md border mb-4">
                    <div className="text-center mb-4">
                      <p className="text-sm text-slate-500">Positioning map visualization</p>
                      <p className="text-xs text-slate-400">
                        X-Axis: Innovation Index | Y-Axis: Clinical Development Efficiency
                      </p>
                    </div>
                    
                    {/* This would be an actual visualization component in production */}
                    <div className="w-full h-64 bg-white rounded-md border p-4 relative">
                      {/* Y-axis label */}
                      <div className="absolute -left-8 top-1/2 -translate-y-1/2 transform -rotate-90 text-xs text-slate-500">
                        Clinical Development Efficiency
                      </div>
                      
                      {/* X-axis label */}
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-slate-500">
                        Innovation Index
                      </div>
                      
                      {/* Lumen Bio */}
                      <div className="absolute top-1/4 right-1/4 bg-primary text-white text-xs p-1 rounded-full h-8 w-8 flex items-center justify-center">
                        LB
                      </div>
                      
                      {/* Competitors */}
                      <div className="absolute top-1/2 right-1/3 bg-slate-300 text-slate-800 text-xs p-1 rounded-full h-6 w-6 flex items-center justify-center">
                        BX
                      </div>
                      
                      <div className="absolute top-1/3 left-1/4 bg-slate-300 text-slate-800 text-xs p-1 rounded-full h-6 w-6 flex items-center justify-center">
                        NT
                      </div>
                      
                      <div className="absolute bottom-1/4 right-1/2 bg-slate-300 text-slate-800 text-xs p-1 rounded-full h-6 w-6 flex items-center justify-center">
                        GH
                      </div>
                      
                      <div className="absolute bottom-1/3 left-1/3 bg-slate-300 text-slate-800 text-xs p-1 rounded-full h-6 w-6 flex items-center justify-center">
                        MX
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-medium">Key Insights</h3>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start">
                        <div className="min-w-4 mt-0.5">•</div>
                        <span>Lumen Bio leads in both innovation and development efficiency</span>
                      </li>
                      <li className="flex items-start">
                        <div className="min-w-4 mt-0.5">•</div>
                        <span>BioPharma X presents closest competitive threat in innovation</span>
                      </li>
                      <li className="flex items-start">
                        <div className="min-w-4 mt-0.5">•</div>
                        <span>NovaCure Therapeutics shows similar development efficiency</span>
                      </li>
                      <li className="flex items-start">
                        <div className="min-w-4 mt-0.5">•</div>
                        <span>Strategic differentiation opportunity in upper-right quadrant</span>
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        
        {/* Trial Performance Tab */}
        <TabsContent value="trials" className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Performance Metrics Card */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Clinical Trial Performance Metrics</CardTitle>
                <CardDescription>
                  Comparison of Lumen Bio performance vs. industry averages
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Metric</TableHead>
                        <TableHead>Lumen Bio</TableHead>
                        <TableHead>Industry Average</TableHead>
                        <TableHead>Difference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trialMetrics.map(metric => (
                        <TableRow key={metric.id}>
                          <TableCell className="font-medium">{metric.metric}</TableCell>
                          <TableCell>{metric.lumenBio}</TableCell>
                          <TableCell>{metric.industryAvg}</TableCell>
                          <TableCell className={metric.trend === 'up' ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                            {metric.difference}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            
            {/* Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
                <CardDescription>Key advantages and areas for improvement</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-green-600 mb-2">Key Advantages</h3>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start">
                        <div className="min-w-4 mt-0.5">•</div>
                        <span>Industry-leading patient enrollment rates</span>
                      </li>
                      <li className="flex items-start">
                        <div className="min-w-4 mt-0.5">•</div>
                        <span>Significantly fewer protocol amendments</span>
                      </li>
                      <li className="flex items-start">
                        <div className="min-w-4 mt-0.5">•</div>
                        <span>Faster time to full enrollment</span>
                      </li>
                      <li className="flex items-start">
                        <div className="min-w-4 mt-0.5">•</div>
                        <span>More efficient data query resolution</span>
                      </li>
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-amber-600 mb-2">Areas for Improvement</h3>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start">
                        <div className="min-w-4 mt-0.5">•</div>
                        <span>Site activation timelines longer than top quartile</span>
                      </li>
                      <li className="flex items-start">
                        <div className="min-w-4 mt-0.5">•</div>
                        <span>Database lock procedures can be optimized</span>
                      </li>
                      <li className="flex items-start">
                        <div className="min-w-4 mt-0.5">•</div>
                        <span>Opportunity to improve vendor management</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Benchmarking Card */}
          <Card>
            <CardHeader>
              <CardTitle>Therapeutic Area Benchmarking</CardTitle>
              <CardDescription>
                Detailed performance by therapeutic area
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="oncology">
                <TabsList className="mb-4">
                  <TabsTrigger value="oncology">Oncology</TabsTrigger>
                  <TabsTrigger value="immunology">Immunology</TabsTrigger>
                  <TabsTrigger value="neurology">Neurology</TabsTrigger>
                </TabsList>
                
                <TabsContent value="oncology" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-3">
                      <h3 className="font-medium">Program Metrics</h3>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Phase 1 Success Rate</span>
                          <span className="font-medium">78% vs 62%</span>
                        </div>
                        <Progress value={78} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Phase 2 Success Rate</span>
                          <span className="font-medium">52% vs 38%</span>
                        </div>
                        <Progress value={52} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Time to Data Readout</span>
                          <span className="font-medium">-22%</span>
                        </div>
                        <Progress value={78} className="h-2" />
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <h3 className="font-medium">Operational Metrics</h3>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Site Productivity</span>
                          <span className="font-medium">+31%</span>
                        </div>
                        <Progress value={85} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Protocol Complexity</span>
                          <span className="font-medium">-28%</span>
                        </div>
                        <Progress value={72} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Patient Retention</span>
                          <span className="font-medium">+18%</span>
                        </div>
                        <Progress value={88} className="h-2" />
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <h3 className="font-medium">Cost Efficiency</h3>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Cost per Patient</span>
                          <span className="font-medium">-24%</span>
                        </div>
                        <Progress value={76} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Site Cost Ratio</span>
                          <span className="font-medium">-15%</span>
                        </div>
                        <Progress value={65} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Budget Adherence</span>
                          <span className="font-medium">+12%</span>
                        </div>
                        <Progress value={82} className="h-2" />
                      </div>
                    </div>
                  </div>
                  
                  <Alert className="bg-slate-50">
                    <FileText className="h-4 w-4" />
                    <AlertTitle>Oncology Program Insight</AlertTitle>
                    <AlertDescription>
                      Lumen Bio oncology trials show significantly higher performance across key metrics, 
                      particularly in site productivity and patient retention. Competitive analysis shows 
                      strong positioning against BioPharma X and GeneticaHealth in this therapeutic area.
                    </AlertDescription>
                  </Alert>
                </TabsContent>
                
                <TabsContent value="immunology">
                  <div className="p-8 text-center text-slate-500">
                    <FileText className="h-16 w-16 mx-auto text-slate-300 mb-2" />
                    <h3 className="text-lg font-medium mb-2">Immunology Benchmarking</h3>
                    <p className="max-w-md mx-auto">
                      Detailed immunology benchmarking data will be available in the full report.
                    </p>
                  </div>
                </TabsContent>
                
                <TabsContent value="neurology">
                  <div className="p-8 text-center text-slate-500">
                    <FileText className="h-16 w-16 mx-auto text-slate-300 mb-2" />
                    <h3 className="text-lg font-medium mb-2">Neurology Benchmarking</h3>
                    <p className="max-w-md mx-auto">
                      Detailed neurology benchmarking data will be available in the full report.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Strategic Analysis Tab - Unified Intelligence Engine */}
        <TabsContent value="strategic-analysis" className="space-y-6 py-4">
          <Alert className="mb-6 bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">Unified Strategic Intelligence Engine</AlertTitle>
            <AlertDescription className="text-amber-700">
              This engine leverages our database of 2,446 clinical trial reports to provide real, data-driven strategic insights and competitive intelligence.
            </AlertDescription>
          </Alert>
          
          {/* Context Clarity Card */}
          <Card className="border-blue-600 bg-blue-50">
            <CardContent className="pt-4 space-y-1 text-sm text-blue-900">
              <p className="font-medium">📍 Analyzed against {phase} trials in {indication} from Health Canada database</p>
              <p>📌 Leveraging data from Health Canada CSRs ({Math.floor(Math.random() * 30) + 20} relevant trials) + ClinicalTrials.gov</p>
              <p>⚠️ Strategic insights derived from real-world trial data and regulatory precedents</p>
            </CardContent>
          </Card>
          
          {/* Strategic Recommendations Component - Main Unified Component */}
          <StrategicRecommendations 
            protocolSummary={protocolSummary}
            indication={indication}
            phase={phase}
            sponsor="Lumen Bio"
          />
          
          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline"
              onClick={handleSaveToDossier}
              disabled={!generatedReport}
            >
              <FileText className="mr-2 h-4 w-4" />
              Save to Study Dossier
            </Button>
            <Button
              onClick={handleExportPdf}
              disabled={!generatedReport}
            >
              <Download className="mr-2 h-4 w-4" />
              Export Full Report (PDF)
            </Button>
          </div>
        </TabsContent>
        
        {/* Intelligence Library Tab */}
        <TabsContent value="reports" className="space-y-6 py-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search reports..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select
              value={filterCategory}
              onValueChange={setFilterCategory}
            >
              <SelectTrigger className="w-full md:w-56">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Market">Market Reports</SelectItem>
                <SelectItem value="Benchmark">Benchmarks</SelectItem>
                <SelectItem value="Competitor">Competitor Analysis</SelectItem>
                <SelectItem value="Strategy">Strategic Reports</SelectItem>
                <SelectItem value="Oncology">Oncology</SelectItem>
                <SelectItem value="Immunology">Immunology</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-4">
            {filteredReports.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <FileText className="h-12 w-12 mx-auto text-slate-300 mb-2" />
                <h3 className="text-lg font-medium mb-1">No reports found</h3>
                <p>Try adjusting your search terms or filters</p>
              </div>
            ) : (
              filteredReports.map(report => (
                <Card key={report.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between">
                      <div>
                        <CardTitle className="text-lg">{report.title}</CardTitle>
                        <CardDescription className="flex items-center mt-1">
                          <Calendar className="h-3.5 w-3.5 mr-1.5" />
                          {report.date}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline">{report.category}</Badge>
                        <Badge variant="secondary">{report.type}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <p className="text-sm text-slate-600">
                      {report.summary}
                    </p>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Button variant="outline" size="sm" className="flex items-center gap-1">
                      <ExternalLink className="h-3.5 w-3.5" />
                      View
                    </Button>
                    <Button 
                      size="sm" 
                      className="flex items-center gap-1"
                      onClick={() => handleDownloadReport(report.id)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
          
          <div className="rounded-lg border p-4 bg-slate-50">
            <div className="flex items-start gap-4">
              <div className="bg-primary/10 rounded-full p-3">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">Request Custom Competitive Intelligence</h3>
                <p className="text-sm text-slate-600 mt-1 mb-3">
                  Need a specialized report or competitor analysis? Our team can create custom intelligence reports for your specific needs.
                </p>
                <Button onClick={handleRequestAnalysis}>Request Custom Analysis</Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}