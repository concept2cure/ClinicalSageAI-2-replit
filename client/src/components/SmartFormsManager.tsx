import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { 
  FileText, 
  Download, 
  RefreshCw, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  Search,
  Filter,
  Zap,
  FileCheck,
  Brain,
  Package
} from 'lucide-react';

interface SmartFormDefinition {
  formId: string;
  formNumber: string;
  title: string;
  description: string;
  category: '510k' | 'PMA' | 'Clinical' | 'Special' | 'Common';
  version: string;
  lastUpdated: string;
  fields: any[];
  dependencies?: string[];
  autoGenerationTrigger?: {
    stage: number;
    condition?: string;
  };
}

interface SmartFormStatus {
  formId: string;
  status: 'pending' | 'generated' | 'error';
  completeness: number;
  version: number;
  lastGenerated?: string;
  content?: string;
}

interface SmartFormsManagerProps {
  projectId: string;
}

export default function SmartFormsManager({ projectId }: SmartFormsManagerProps) {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedForm, setSelectedForm] = useState<string | null>(null);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);

  // Fetch forms registry
  const { data: registryData, isLoading: isLoadingRegistry } = useQuery({
    queryKey: ['/api/fda-forms/registry'],
    enabled: true
  });

  // Fetch project forms status
  const { data: formsStatus, isLoading: isLoadingStatus, refetch: refetchStatus } = useQuery({
    queryKey: [`/api/fda-forms/project/${projectId}/forms`],
    enabled: !!projectId
  });

  // Generate smart form mutation
  const generateSmartFormMutation = useMutation({
    mutationFn: async (formId: string) => {
      const response = await fetch(`/api/fda-forms/project/${projectId}/generate-smart/${formId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': '1'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate form');
      }
      
      return response.json();
    },
    onSuccess: (data, formId) => {
      toast({
        title: 'Form Generated',
        description: `Successfully generated form ${formId}`
      });
      refetchStatus();
    },
    onError: (error: Error) => {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Auto-generate all required forms
  const autoGenerateAllMutation = useMutation({
    mutationFn: async () => {
      setIsGeneratingBatch(true);
      const response = await fetch(`/api/fda-forms/project/${projectId}/auto-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': '1'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to auto-generate forms');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Forms Auto-Generated',
        description: `Successfully generated ${data.results?.length || 0} forms`
      });
      refetchStatus();
      setIsGeneratingBatch(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Auto-Generation Failed',
        description: error.message,
        variant: 'destructive'
      });
      setIsGeneratingBatch(false);
    }
  });

  // Generate forms for specific stage
  const generateStageFormsMutation = useMutation({
    mutationFn: async (stage: number) => {
      const response = await fetch(`/api/fda-forms/project/${projectId}/generate-stage/${stage}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': '1'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate stage forms');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Stage Forms Generated',
        description: 'Successfully generated forms for this workflow stage'
      });
      refetchStatus();
    },
    onError: (error: Error) => {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Filter forms based on search and category
  const getFilteredForms = () => {
    if (!registryData?.registry) return [];
    
    let forms = Object.values(registryData.registry) as SmartFormDefinition[];
    
    // Filter by category
    if (selectedCategory !== 'all') {
      forms = forms.filter(form => form.category === selectedCategory);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      forms = forms.filter(form => 
        form.title.toLowerCase().includes(query) ||
        form.formNumber.toLowerCase().includes(query) ||
        form.description.toLowerCase().includes(query)
      );
    }
    
    return forms;
  };

  // Get form status
  const getFormStatus = (formId: string): SmartFormStatus | undefined => {
    if (!formsStatus?.forms) return undefined;
    return formsStatus.forms.find((f: any) => f.formId === formId);
  };

  // Get status badge
  const getStatusBadge = (status: SmartFormStatus | undefined) => {
    if (!status) {
      return <Badge variant="outline">Not Generated</Badge>;
    }
    
    switch (status.status) {
      case 'generated':
        return (
          <Badge className="bg-stone-1000">
            <CheckCircle className="w-3 h-3 mr-1" />
            Generated
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  // Calculate overall completion
  const calculateOverallCompletion = () => {
    const forms = getFilteredForms();
    if (forms.length === 0) return 0;
    
    const completedCount = forms.filter(form => {
      const status = getFormStatus(form.formId);
      return status?.status === 'generated';
    }).length;
    
    return Math.round((completedCount / forms.length) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-6 w-6" />
                SMART Forms Manager
              </CardTitle>
              <CardDescription>
                Intelligent FDA form generation with auto-population from CERV2 workflow data
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => autoGenerateAllMutation.mutate()}
                disabled={isGeneratingBatch || autoGenerateAllMutation.isPending}
                data-testid="button-auto-generate-all"
              >
                {isGeneratingBatch ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Auto-Generate Required
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => refetchStatus()}
                data-testid="button-refresh-forms"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Progress Overview */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Completion</span>
              <span>{calculateOverallCompletion()}%</span>
            </div>
            <Progress value={calculateOverallCompletion()} className="h-2" />
            <div className="grid grid-cols-4 gap-4 mt-4">
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {registryData?.totalForms || 0}
                </div>
                <div className="text-xs text-muted-foreground">Total Forms</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-stone-1000">
                  {formsStatus?.forms?.filter((f: any) => f.status === 'generated').length || 0}
                </div>
                <div className="text-xs text-muted-foreground">Generated</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-stone-1000">
                  {formsStatus?.forms?.filter((f: any) => f.status === 'pending').length || 0}
                </div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-stone-1000">
                  {formsStatus?.forms?.filter((f: any) => f.status === 'error').length || 0}
                </div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search forms by name, number, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-forms"
                />
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setSearchQuery('')}
              data-testid="button-clear-search"
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Forms by Category */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="all" data-testid="tab-all-forms">
                All Forms
              </TabsTrigger>
              <TabsTrigger value="510k" data-testid="tab-510k-forms">
                510(k)
              </TabsTrigger>
              <TabsTrigger value="PMA" data-testid="tab-pma-forms">
                PMA
              </TabsTrigger>
              <TabsTrigger value="Clinical" data-testid="tab-clinical-forms">
                Clinical
              </TabsTrigger>
              <TabsTrigger value="Special" data-testid="tab-special-forms">
                Special
              </TabsTrigger>
              <TabsTrigger value="Common" data-testid="tab-common-forms">
                Common
              </TabsTrigger>
            </TabsList>

            <TabsContent value={selectedCategory} className="mt-6">
              <div className="grid gap-4">
                {isLoadingRegistry ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p>Loading forms registry...</p>
                  </div>
                ) : getFilteredForms().length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p>No forms found matching your criteria</p>
                  </div>
                ) : (
                  getFilteredForms().map((form) => {
                    const status = getFormStatus(form.formId);
                    return (
                      <Card key={form.formId} className="hover:shadow-md transition-shadow">
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-lg">
                                  FDA {form.formNumber}
                                </CardTitle>
                                {getStatusBadge(status)}
                                {status?.completeness !== undefined && (
                                  <Badge variant="outline">
                                    {status.completeness}% Complete
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm font-medium mt-1">{form.title}</p>
                              <CardDescription className="mt-2">
                                {form.description}
                              </CardDescription>
                              {form.dependencies && form.dependencies.length > 0 && (
                                <div className="flex items-center gap-2 mt-2">
                                  <span className="text-xs text-muted-foreground">
                                    Depends on:
                                  </span>
                                  {form.dependencies.map(dep => (
                                    <Badge key={dep} variant="outline" className="text-xs">
                                      {dep}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {status?.status === 'generated' ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => generateSmartFormMutation.mutate(form.formId)}
                                    data-testid={`button-regenerate-${form.formId}`}
                                  >
                                    <RefreshCw className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    data-testid={`button-download-${form.formId}`}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => generateSmartFormMutation.mutate(form.formId)}
                                  disabled={generateSmartFormMutation.isPending}
                                  data-testid={`button-generate-${form.formId}`}
                                >
                                  {generateSmartFormMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <FileCheck className="h-4 w-4 mr-1" />
                                      Generate
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        {status?.status === 'generated' && (
                          <CardContent>
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                              <span>Version {status.version}</span>
                              <span>Last generated: {new Date(status.lastGenerated || '').toLocaleString()}</span>
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Batch Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Batch Actions
          </CardTitle>
          <CardDescription>
            Generate multiple forms at once based on submission type or workflow stage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <Button
              variant="outline"
              onClick={() => generateStageFormsMutation.mutate(0)}
              data-testid="button-generate-stage-0"
            >
              Generate Stage 0 Forms
            </Button>
            <Button
              variant="outline"
              onClick={() => generateStageFormsMutation.mutate(1)}
              data-testid="button-generate-stage-1"
            >
              Generate Stage 1 Forms
            </Button>
            <Button
              variant="outline"
              onClick={() => generateStageFormsMutation.mutate(2)}
              data-testid="button-generate-stage-2"
            >
              Generate Stage 2 Forms
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}