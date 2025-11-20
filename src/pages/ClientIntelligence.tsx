import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { 
  Building2, 
  Microscope, 
  RefreshCw, 
  Download, 
  FileText, 
  Users, 
  Puzzle, 
  ExternalLink 
} from 'lucide-react';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';

export default function ClientIntelligence() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  // Query to fetch all clients
  const { data: clientsData, isLoading: isLoadingClients } = useQuery({
    queryKey: ['/api/clients'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/clients');
      return response.json();
    }
  });

  // Query to fetch selected client details
  const { data: clientData, isLoading: isLoadingClient } = useQuery({
    queryKey: ['/api/clients', selectedClient],
    queryFn: async () => {
      if (!selectedClient) return { client: null };
      const response = await apiRequest('GET', `/api/clients/${selectedClient}`);
      return response.json();
    },
    enabled: !!selectedClient
  });

  // Query to fetch client's latest report
  const { data: reportData, isLoading: isLoadingReport } = useQuery({
    queryKey: ['/api/clients', selectedClient, 'latest-report'],
    queryFn: async () => {
      if (!selectedClient) return { success: false, report: null };
      const response = await apiRequest('GET', `/api/clients/${selectedClient}/latest-report`);
      if (!response.ok && response.status !== 404) {
        throw new Error('Failed to fetch report');
      }
      return response.json();
    },
    enabled: !!selectedClient
  });

  // Mutation to fetch client data
  const fetchDataMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await apiRequest('POST', `/api/clients/${clientId}/fetch-data`);
      return response.json();
    },
    onSuccess: () => {
      // toast call replaced
  // Original: toast({
        title: 'Data Collection Started',
        description: 'Client-specific data collection is now in progress.',
      })
  console.log('Toast would show:', {
        title: 'Data Collection Started',
        description: 'Client-specific data collection is now in progress.',
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/clients', selectedClient] });
    },
    onError: (error: Error) => {
      // toast call replaced
  // Original: toast({
        title: 'Data Collection Failed',
        description: `Error: ${error.message}`,
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'Data Collection Failed',
        description: `Error: ${error.message}`,
        variant: 'destructive',
      });
    }
  });

  // Mutation to generate client report
  const generateReportMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await apiRequest('POST', `/api/clients/${clientId}/generate-report`);
      return response.json();
    },
    onSuccess: () => {
      // toast call replaced
  // Original: toast({
        title: 'Report Generated',
        description: 'Client intelligence report has been generated successfully.',
      })
  console.log('Toast would show:', {
        title: 'Report Generated',
        description: 'Client intelligence report has been generated successfully.',
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/clients', selectedClient, 'latest-report'] });
    },
    onError: (error: Error) => {
      // toast call replaced
  // Original: toast({
        title: 'Report Generation Failed',
        description: `Error: ${error.message}`,
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'Report Generation Failed',
        description: `Error: ${error.message}`,
        variant: 'destructive',
      });
    }
  });

  // Set default selected client
  useEffect(() => {
    if (!isLoadingClients && clientsData?.clients && clientsData.clients.length > 0 && !selectedClient) {
      setSelectedClient(clientsData.clients[0].id);
    }
  }, [clientsData, isLoadingClients, selectedClient]);

  const handleFetchData = () => {
    if (selectedClient) {
      fetchDataMutation.mutate(selectedClient);
    }
  };

  const handleGenerateReport = () => {
    if (selectedClient) {
      generateReportMutation.mutate(selectedClient);
    }
  };

  if (isLoadingClients) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-12 w-12 text-primary">
          <RefreshCw className="h-12 w-12" />
        </div>
      </div>
    );
  }

  const clients = clientsData?.clients || [];
  const client = clientData?.client;
  const report = reportData?.success ? reportData.report : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Client Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Manage and analyze client-specific clinical trial data
          </p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Client Selection Sidebar */}
        <div className="col-span-12 md:col-span-3 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Clients</CardTitle>
              <CardDescription>Select a client to view details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {clients.map((c: any) => (
                <Button
                  key={c.id}
                  variant={selectedClient === c.id ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => setSelectedClient(c.id)}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  {c.name}
                </Button>
              ))}
            </CardContent>
          </Card>
          
          {client && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={handleFetchData}
                  disabled={fetchDataMutation.isPending}
                >
                  {fetchDataMutation.isPending ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Fetch Trial Data
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={handleGenerateReport}
                  disabled={generateReportMutation.isPending}
                >
                  {generateReportMutation.isPending ? (
                    <FileText className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  Generate Report
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
        
        {/* Client Details */}
        <div className="col-span-12 md:col-span-9">
          {isLoadingClient ? (
            <Card className="h-96 flex items-center justify-center">
              <div className="animate-spin h-8 w-8 text-primary">
                <RefreshCw className="h-8 w-8" />
              </div>
            </Card>
          ) : client ? (
            <Tabs defaultValue="overview">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
                <TabsTrigger value="competitors">Competitors</TabsTrigger>
                <TabsTrigger value="report">Report</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="mt-4">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>{client.name}</CardTitle>
                      {client.website && (
                        <a 
                          href={client.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 flex items-center"
                        >
                          Visit Website <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <CardDescription>
                      {client.therapeuticAreas.join(', ')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Data Collection Status</h4>
                      <div className="flex items-center">
                        <Badge variant={
                          client.dataCollectionStatus === 'complete' ? 'default' :
                          client.dataCollectionStatus === 'in_progress' ? 'secondary' : 'outline'
                        }>
                          {client.dataCollectionStatus === 'complete' ? 'Complete' :
                           client.dataCollectionStatus === 'in_progress' ? 'In Progress' : 'Pending'}
                        </Badge>
                        {client.latestAnalysisDate && (
                          <span className="text-xs text-muted-foreground ml-2">
                            Last updated: {new Date(client.latestAnalysisDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium mb-2">Pipeline Assets</h4>
                        <div className="text-2xl font-bold">{client.pipeline.length}</div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium mb-2">Tracked Competitors</h4>
                        <div className="text-2xl font-bold">{client.competitors.length}</div>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium mb-2">Therapeutic Areas</h4>
                      <div className="flex flex-wrap gap-2">
                        {client.therapeuticAreas.map((area: string) => (
                          <Badge key={area} variant="secondary">{area}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="pipeline" className="mt-4 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Pipeline Assets</CardTitle>
                    <CardDescription>
                      {client.name}'s drug development pipeline
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Asset</TableHead>
                          <TableHead>Phase</TableHead>
                          <TableHead>Indication</TableHead>
                          <TableHead>Mechanism/Target</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {client.pipeline.map((asset: any) => (
                          <TableRow key={asset.name}>
                            <TableCell className="font-medium">{asset.name}</TableCell>
                            <TableCell>
                              <Badge variant={
                                asset.phase.includes('Preclinical') ? 'outline' :
                                asset.phase.includes('Phase 1') ? 'secondary' :
                                'default'
                              }>
                                {asset.phase}
                              </Badge>
                            </TableCell>
                            <TableCell>{asset.indication}</TableCell>
                            <TableCell>
                              {asset.mechanism && (
                                <div className="flex items-center">
                                  <Microscope className="h-3 w-3 mr-1" />
                                  <span className="text-xs">{asset.mechanism}</span>
                                </div>
                              )}
                              {asset.target && (
                                <div className="flex items-center mt-1">
                                  <Puzzle className="h-3 w-3 mr-1" />
                                  <span className="text-xs">{asset.target}</span>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="competitors" className="mt-4 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Competitor Analysis</CardTitle>
                    <CardDescription>
                      Key competitors in {client.name}'s therapeutic areas
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium mb-2">Tracked Competitors</h4>
                        <div className="flex flex-wrap gap-2">
                          {client.competitors.map((competitor: string) => (
                            <Badge key={competitor} variant="outline" className="flex items-center">
                              <Users className="h-3 w-3 mr-1" />
                              {competitor}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      {report && report.competitiveLandscape && (
                        <>
                          <Separator className="my-4" />
                          <div>
                            <h4 className="text-sm font-medium mb-2">Competitors by Trial Count</h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Competitor</TableHead>
                                  <TableHead>Trial Count</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {report.competitiveLandscape.competitorsByTrialCount.map((comp: any) => (
                                  <TableRow key={comp.competitor}>
                                    <TableCell className="font-medium">{comp.competitor}</TableCell>
                                    <TableCell>{comp.trialCount}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="report" className="mt-4 space-y-4">
                {isLoadingReport ? (
                  <Card className="h-96 flex items-center justify-center">
                    <div className="animate-spin h-8 w-8 text-primary">
                      <RefreshCw className="h-8 w-8" />
                    </div>
                  </Card>
                ) : report ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between">
                        <CardTitle>Intelligence Report</CardTitle>
                        <span className="text-xs text-muted-foreground">
                          Generated: {new Date(report.generatedDate).toLocaleDateString()}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="border rounded-lg p-4 text-center">
                          <div className="text-sm text-muted-foreground">Relevant Trials</div>
                          <div className="text-2xl font-bold mt-1">{report.relevantTrials}</div>
                        </div>
                        <div className="border rounded-lg p-4 text-center">
                          <div className="text-sm text-muted-foreground">Competitor Trials</div>
                          <div className="text-2xl font-bold mt-1">{report.competitorTrials}</div>
                        </div>
                        <div className="border rounded-lg p-4 text-center">
                          <div className="text-sm text-muted-foreground">Mechanism Trials</div>
                          <div className="text-2xl font-bold mt-1">{report.mechanismTrials}</div>
                        </div>
                        <div className="border rounded-lg p-4 text-center">
                          <div className="text-sm text-muted-foreground">Indication Trials</div>
                          <div className="text-2xl font-bold mt-1">{report.indicationTrials}</div>
                        </div>
                      </div>
                      
                      {report.keyInsights && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Key Insights</h4>
                          <div className="space-y-2">
                            {report.keyInsights.map((insight: string, idx: number) => (
                              <div key={idx} className="p-3 border rounded-lg text-sm">
                                {insight}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {report.competitorUpdates && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Recent Competitor Updates</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Competitor</TableHead>
                                <TableHead>Update</TableHead>
                                <TableHead>Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {report.competitorUpdates.map((update: any, idx: number) => (
                                <TableRow key={idx}>
                                  <TableCell className="font-medium">{update.competitor}</TableCell>
                                  <TableCell>{update.update}</TableCell>
                                  <TableCell>{new Date(update.date).toLocaleDateString()}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter>
                      <Button variant="outline" className="ml-auto">
                        <Download className="mr-2 h-4 w-4" />
                        Download Full Report
                      </Button>
                    </CardFooter>
                  </Card>
                ) : (
                  <Card className="p-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="mt-4 text-lg font-medium">No Report Available</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Generate a client intelligence report to view analysis
                    </p>
                    <Button 
                      className="mt-6"
                      onClick={handleGenerateReport}
                      disabled={generateReportMutation.isPending}
                    >
                      {generateReportMutation.isPending ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="mr-2 h-4 w-4" />
                      )}
                      Generate Report
                    </Button>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <Card className="p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Building2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-medium">No Client Selected</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Select a client from the sidebar to view details
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}