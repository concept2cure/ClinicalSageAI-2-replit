import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Briefcase, Clipboard, Brain, AlarmClock, FileText, BarChart, Book, DownloadCloud, 
  CheckCircle, PlayCircle, ShieldCheck, TrendingUp, Award, Database
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';

interface UseCase {
  id: string;
  title: string;
  role: string;
  challenge: string;
  features: {
    csrSearch: boolean;
    riskModel: boolean;
    sapGenerator: boolean;
    dossierExport: boolean;
    protocolOptimizer: boolean;
    benchmarkComparison: boolean;
    regulatoryAlignment: boolean;
  };
  prefillData: {
    indication: string;
    phase: string;
    sample_size: number;
    duration_weeks: number;
    endpoint_primary: string;
    dropout_rate: number;
    [key: string]: any;
  };
  roi: {
    failureRiskReduction: number;
    timeSaved: number;
    precedentMatchScore: number;
    generationTime: number;
  };
  description: string;
}

export default function StrategicLauncherPage() {
  const [selectedTab, setSelectedTab] = useState('biotech');
  const [selectedUseCase, setSelectedUseCase] = useState<UseCase | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Fetch use cases from API
  const { data: useCases, isLoading, error } = useQuery({
    queryKey: ['/api/strategic-launcher/usecases'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/strategic-launcher/usecases');
      return response.json();
    }
  });

  // Launch use case mutation
  const launchMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/strategic-launcher/launch/${id}`);
      return response.json();
    },
    onSuccess: (data) => {
      // toast call replaced
  // Original: toast({
        title: "Use case launched",
        description: "The strategic intelligence workflow has been started.",
        variant: "default",
      })
  console.log('Toast would show:', {
        title: "Use case launched",
        description: "The strategic intelligence workflow has been started.",
        variant: "default",
      });
      
      // Navigate to the protocol builder with pre-populated data
      navigate(`/protocol-builder?scenario=${data.useCase.id}`);
    },
    onError: (error: any) => {
      // toast call replaced
  // Original: toast({
        title: "Launch failed",
        description: error.message || "Failed to launch use case.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Launch failed",
        description: error.message || "Failed to launch use case.",
        variant: "destructive",
      });
    }
  });

  // Download report mutation
  const downloadMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('GET', `/api/strategic-launcher/download/${id}`);
      return response.json();
    },
    onSuccess: (data) => {
      // toast call replaced
  // Original: toast({
        title: "Report prepared",
        description: "Your report is ready for download.",
        variant: "default",
      })
  console.log('Toast would show:', {
        title: "Report prepared",
        description: "Your report is ready for download.",
        variant: "default",
      });
      
      // Open the download link in a new tab
      if (data.downloadUrl) {
        window.open(data.downloadUrl, '_blank');
      }
    },
    onError: (error: any) => {
      // toast call replaced
  // Original: toast({
        title: "Download failed",
        description: error.message || "Failed to download report.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Download failed",
        description: error.message || "Failed to download report.",
        variant: "destructive",
      });
    }
  });

  // Filter use cases by category
  const filteredUseCases = useCases?.filter((useCase: UseCase) => {
    if (selectedTab === 'biotech') {
      return useCase.id.includes('biotech');
    } else if (selectedTab === 'vc') {
      return useCase.id.includes('vc');
    } else if (selectedTab === 'regulatory') {
      return useCase.id.includes('regulatory');
    }
    return true;
  }) || [];

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Strategic Intelligence Launcher</h1>
          <p className="text-muted-foreground mt-2">
            Scenario simulation engine for biotech leaders, CRO strategists, VCs, and regulatory teams
          </p>
        </div>
        <Badge variant="outline" className="px-3 py-1">
          <Brain className="w-4 h-4 mr-2" />
          AI-Powered
        </Badge>
      </div>

      <Tabs 
        defaultValue="biotech" 
        value={selectedTab} 
        onValueChange={setSelectedTab}
        className="space-y-4"
      >
        <TabsList className="grid grid-cols-3 w-[500px]">
          <TabsTrigger value="biotech" className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            <span>Biotech Founders</span>
          </TabsTrigger>
          <TabsTrigger value="vc" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            <span>VC Due Diligence</span>
          </TabsTrigger>
          <TabsTrigger value="regulatory" className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            <span>Regulatory Teams</span>
          </TabsTrigger>
        </TabsList>

        {['biotech', 'vc', 'regulatory'].map((tab) => (
          <TabsContent key={tab} value={tab} className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
              ) : error ? (
                <div className="text-center p-6 text-destructive">
                  <p>Failed to load use cases</p>
                </div>
              ) : filteredUseCases.length === 0 ? (
                <div className="text-center p-6 text-muted-foreground">
                  <p>No use cases available in this category</p>
                </div>
              ) : (
                <>
                  {filteredUseCases.map((useCase: UseCase) => (
                    <Card 
                      key={useCase.id} 
                      className={`transition-all ${selectedUseCase?.id === useCase.id ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setSelectedUseCase(useCase)}
                    >
                      <CardHeader className="pb-4">
                        <div className="flex justify-between">
                          <div>
                            <CardTitle className="text-xl">{useCase.title}</CardTitle>
                            <CardDescription className="mt-1">{useCase.role}</CardDescription>
                          </div>
                          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
                            {useCase.prefillData.indication}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <h3 className="font-semibold flex items-center text-lg mb-2">
                              <Clipboard className="w-5 h-5 mr-2 text-blue-600" />
                              Strategic Challenge
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {useCase.challenge}
                            </p>
                            
                            <h3 className="font-semibold flex items-center text-lg mt-4 mb-2">
                              <Database className="w-5 h-5 mr-2 text-green-600" />
                              Protocol Highlights
                            </h3>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Phase:</span>
                                <span className="font-medium">{useCase.prefillData.phase}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Sample Size:</span>
                                <span className="font-medium">{useCase.prefillData.sample_size}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Duration:</span>
                                <span className="font-medium">{useCase.prefillData.duration_weeks} weeks</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Dropout Rate:</span>
                                <span className="font-medium">{(useCase.prefillData.dropout_rate * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                          </div>
                          
                          <div>
                            <h3 className="font-semibold flex items-center text-lg mb-2">
                              <Brain className="w-5 h-5 mr-2 text-purple-600" />
                              TrialSage Intelligence
                            </h3>
                            
                            <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                              {Object.entries(useCase.features).map(([key, enabled]) => (
                                <div key={key} className="flex items-center">
                                  <div className={`w-4 h-4 rounded-full mr-2 ${enabled ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                                  <span className={enabled ? 'font-medium' : 'text-muted-foreground'}>
                                    {key.replace(/([A-Z])/g, ' $1').split(' ').map(word => 
                                      word.charAt(0).toUpperCase() + word.slice(1)
                                    ).join(' ')}
                                  </span>
                                </div>
                              ))}
                            </div>
                            
                            <h3 className="font-semibold flex items-center text-lg mb-2">
                              <BarChart className="w-5 h-5 mr-2 text-amber-600" />
                              ROI Impact
                            </h3>
                            
                            <div className="space-y-2">
                              <div>
                                <div className="flex justify-between mb-1 text-xs">
                                  <span>Risk Reduction</span>
                                  <span>{useCase.roi.failureRiskReduction}%</span>
                                </div>
                                <Progress value={useCase.roi.failureRiskReduction} className="h-2" />
                              </div>
                              <div>
                                <div className="flex justify-between mb-1 text-xs">
                                  <span>Time Saved</span>
                                  <span>{useCase.roi.timeSaved} hrs</span>
                                </div>
                                <Progress value={useCase.roi.timeSaved / 50 * 100} className="h-2" />
                              </div>
                              <div>
                                <div className="flex justify-between mb-1 text-xs">
                                  <span>Regulatory Alignment</span>
                                  <span>{useCase.roi.precedentMatchScore}%</span>
                                </div>
                                <Progress value={useCase.roi.precedentMatchScore} className="h-2" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="flex justify-between pt-2">
                        <Button 
                          variant="outline" 
                          onClick={() => downloadMutation.mutate(useCase.id)}
                          disabled={downloadMutation.isPending}
                          className="gap-2"
                        >
                          <DownloadCloud className="w-4 h-4" />
                          Download Report Bundle
                        </Button>
                        <Button 
                          onClick={() => launchMutation.mutate(useCase.id)}
                          disabled={launchMutation.isPending}
                          className="gap-2"
                        >
                          <PlayCircle className="w-4 h-4" />
                          Launch Workflow
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
      
      {selectedUseCase && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              Comparable Trials & Success Metrics
            </CardTitle>
            <CardDescription>
              Historical precedent and data-driven insights for {selectedUseCase.prefillData.indication} {selectedUseCase.prefillData.phase} trials
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Regulatory Alignment</h3>
                <div className="flex items-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center border-4 border-blue-500 mr-3">
                    <span className="text-xl font-bold">85%</span>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">Strong alignment</p>
                    <p className="text-muted-foreground">Based on latest FDA guidance</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Precedent Matching</h3>
                <div className="flex items-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center border-4 border-green-500 mr-3">
                    <span className="text-xl font-bold">78%</span>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">Good match</p>
                    <p className="text-muted-foreground">Based on 245 similar trials</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Success Probability</h3>
                <div className="flex items-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center border-4 border-amber-500 mr-3">
                    <span className="text-xl font-bold">72%</span>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">Above average</p>
                    <p className="text-muted-foreground">ML prediction confidence</p>
                  </div>
                </div>
              </div>
            </div>
            
            <Separator className="my-6" />
            
            <h3 className="text-lg font-semibold mb-4">Similar Precedent Trials</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trial ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Sponsor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">1</TableCell>
                  <TableCell>Weight Management Study A</TableCell>
                  <TableCell>Pharma Research Inc</TableCell>
                  <TableCell>2024-01</TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" size="sm">View Insight</Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">2</TableCell>
                  <TableCell>Clinical Evaluation of Novel Weight Loss Therapy</TableCell>
                  <TableCell>Medical Innovations</TableCell>
                  <TableCell>2023-12</TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" size="sm">View Insight</Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">3</TableCell>
                  <TableCell>Obesity Treatment Comparative Analysis</TableCell>
                  <TableCell>Global Health Partners</TableCell>
                  <TableCell>2023-10</TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" size="sm">View Insight</Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}