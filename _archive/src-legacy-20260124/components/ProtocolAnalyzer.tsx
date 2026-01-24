import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, BarChart, BookOpen, CheckCircle, Download, ExternalLink, FileText, GanttChart, RotateCcw, Search, Upload } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from "@/lib/queryClient";

interface ProtocolAnalysisResponse {
  id: string;
  fileName: string;
  status: 'completed' | 'processing' | 'failed';
  uploadDate: string;
  completionDate?: string;
  assessment: ProtocolAssessment;
}

interface ProtocolAssessment {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  detailedAnalysis: SectionAnalysis[];
  recommendations: Recommendation[];
  methodology: MethodologySection;
  sources: Source[];
  statisticalConsiderations: string[];
  regulatoryConsiderations: RegConsideration[];
  academicLiterature?: AcademicCitation[];
}

interface AcademicCitation {
  title: string;
  authors: string;
  journal: string;
  year: string;
  volume: string;
  pages: string;
  doi?: string;
  abstract?: string;
  citation_count?: number;
  relevance_score?: number;
}

interface SectionAnalysis {
  section: string;
  content: string;
  issues: string[];
  recommendations: string[];
}

interface Recommendation {
  category: string;
  issue: string;
  recommendation: string;
  evidence: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
}

interface MethodologySection {
  description: string;
  steps: string[];
  limitations: string[];
}

interface Source {
  type: string;
  count: number;
  description: string;
}

interface RegConsideration {
  agency: string;
  relevantGuidance: string;
  consideration: string;
}

export default function ProtocolAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch recent protocol analyses for this user
  const { data: recentAnalyses, isLoading: analysesLoading } = useQuery({
    queryKey: ['/api/protocol-analyses'],
    queryFn: () => apiRequest('GET', '/api/protocol-analyses').then(res => res.json()),
  });

  // Fetch details of current analysis if selected
  const { data: currentAnalysis, isLoading: currentAnalysisLoading } = useQuery({
    queryKey: ['/api/protocol-analyses', currentAnalysisId],
    queryFn: () => {
      if (!currentAnalysisId) return null;
      return apiRequest('GET', `/api/protocol-analyses/${currentAnalysisId}`).then(res => res.json());
    },
    enabled: !!currentAnalysisId,
  });

  // Upload and analyze protocol mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest('POST', '/api/protocol-analyses/upload', formData, {
        disableContentType: true,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setCurrentAnalysisId(data.id);
      setActiveTab('overview');
      // toast call replaced
  // Original: toast({
        title: 'Protocol uploaded successfully',
        description: 'Your protocol is now being analyzed.',
      })
  console.log('Toast would show:', {
        title: 'Protocol uploaded successfully',
        description: 'Your protocol is now being analyzed.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/protocol-analyses'] });
    },
    onError: (error: Error) => {
      // toast call replaced
  // Original: toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Export report as PDF
  const exportMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('GET', `/api/protocol-analyses/${id}/export-pdf`, null, {
        responseType: 'blob',
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `protocol-assessment-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      // toast call replaced
  // Original: toast({
        title: 'Report exported',
        description: 'Your protocol assessment report has been downloaded.',
      })
  console.log('Toast would show:', {
        title: 'Report exported',
        description: 'Your protocol assessment report has been downloaded.',
      });
    },
    onError: (error: Error) => {
      // toast call replaced
  // Original: toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) {
      // toast call replaced
  // Original: toast({
        title: 'No file selected',
        description: 'Please select a protocol file to upload.',
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'No file selected',
        description: 'Please select a protocol file to upload.',
        variant: 'destructive',
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    uploadMutation.mutate(formData);
  };

  const handleExport = () => {
    if (currentAnalysisId) {
      exportMutation.mutate(currentAnalysisId);
    }
  };

  const selectAnalysis = (id: string) => {
    setCurrentAnalysisId(id);
    setActiveTab('overview');
  };

  const renderImportanceBadge = (importance: 'critical' | 'high' | 'medium' | 'low') => {
    const colors = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-blue-100 text-blue-800',
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[importance]}`}>
        {importance.charAt(0).toUpperCase() + importance.slice(1)}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Upload className="h-5 w-5 text-primary mr-2" />
            Upload Protocol for Analysis
          </CardTitle>
          <CardDescription>
            Our AI-powered protocol analyzer will evaluate your study protocol against industry
            best practices and regulatory standards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Input
              type="file"
              accept=".pdf,.docx,.doc"
              onChange={handleFileChange}
              className="max-w-md"
            />
            <Button 
              onClick={handleUpload} 
              disabled={!file || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload & Analyze'}
            </Button>
          </div>
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          Supported file formats: PDF, Word (.docx, .doc)
        </CardFooter>
      </Card>

      {/* Analysis Results */}
      {currentAnalysisId && currentAnalysis && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 text-primary mr-2" />
                  Protocol Assessment: {currentAnalysis.fileName}
                </CardTitle>
                <CardDescription>
                  Uploaded on {new Date(currentAnalysis.uploadDate).toLocaleDateString()}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={exportMutation.isPending}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export Assessment
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-6 w-full">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="detailed">Detailed Analysis</TabsTrigger>
                <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
                <TabsTrigger value="methodology">Methodology</TabsTrigger>
                <TabsTrigger value="regulatory">Regulatory</TabsTrigger>
                <TabsTrigger value="literature">Literature</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="mt-4">
                <div className="space-y-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Executive Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed mb-4">
                        {currentAnalysis.assessment.summary}
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        <div>
                          <h4 className="font-medium text-sm mb-2 flex items-center">
                            <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                            Strengths
                          </h4>
                          <ul className="space-y-2">
                            {currentAnalysis.assessment.strengths.map((strength, idx) => (
                              <li key={idx} className="text-sm bg-green-50 p-2 rounded border border-green-100">
                                {strength}
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        <div>
                          <h4 className="font-medium text-sm mb-2 flex items-center">
                            <AlertCircle className="h-4 w-4 text-amber-500 mr-2" />
                            Areas for Improvement
                          </h4>
                          <ul className="space-y-2">
                            {currentAnalysis.assessment.weaknesses.map((weakness, idx) => (
                              <li key={idx} className="text-sm bg-amber-50 p-2 rounded border border-amber-100">
                                {weakness}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Statistical Considerations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {currentAnalysis.assessment.statisticalConsiderations.map((consideration, idx) => (
                          <li key={idx} className="text-sm bg-blue-50 p-2 rounded border border-blue-100">
                            {consideration}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Detailed Analysis Tab */}
              <TabsContent value="detailed" className="mt-4">
                <div className="space-y-6">
                  {currentAnalysis.assessment.detailedAnalysis.map((section, idx) => (
                    <Card key={idx}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{section.section}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm leading-relaxed mb-4">{section.content}</p>
                        
                        {section.issues.length > 0 && (
                          <>
                            <h4 className="font-medium text-sm mb-2">Identified Issues</h4>
                            <ul className="space-y-2 mb-4">
                              {section.issues.map((issue, issueIdx) => (
                                <li key={issueIdx} className="text-sm bg-amber-50 p-2 rounded border border-amber-100">
                                  {issue}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        
                        {section.recommendations.length > 0 && (
                          <>
                            <h4 className="font-medium text-sm mb-2">Section-Specific Recommendations</h4>
                            <ul className="space-y-2">
                              {section.recommendations.map((rec, recIdx) => (
                                <li key={recIdx} className="text-sm bg-blue-50 p-2 rounded border border-blue-100">
                                  {rec}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Recommendations Tab */}
              <TabsContent value="recommendations" className="mt-4">
                <ScrollArea className="h-[60vh]">
                  <div className="space-y-4">
                    {currentAnalysis.assessment.recommendations.map((rec, idx) => (
                      <Card key={idx}>
                        <CardHeader className="pb-2">
                          <div className="flex justify-between">
                            <CardTitle className="text-md">{rec.category}</CardTitle>
                            {renderImportanceBadge(rec.importance)}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div>
                              <h4 className="font-medium text-sm">Issue</h4>
                              <p className="text-sm mt-1">{rec.issue}</p>
                            </div>
                            
                            <div>
                              <h4 className="font-medium text-sm">Recommendation</h4>
                              <p className="text-sm mt-1">{rec.recommendation}</p>
                            </div>
                            
                            <div>
                              <h4 className="font-medium text-sm">Supporting Evidence</h4>
                              <p className="text-sm mt-1 bg-slate-50 p-2 rounded">{rec.evidence}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Methodology Tab */}
              <TabsContent value="methodology" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Assessment Methodology</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed mb-4">
                      {currentAnalysis.assessment.methodology.description}
                    </p>
                    
                    <h4 className="font-medium text-sm mb-2">Assessment Process</h4>
                    <ul className="space-y-2 mb-4">
                      {currentAnalysis.assessment.methodology.steps.map((step, idx) => (
                        <li key={idx} className="text-sm bg-slate-50 p-2 rounded border border-slate-100 flex items-start">
                          <span className="bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center mr-2 flex-shrink-0">
                            {idx + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ul>
                    
                    <h4 className="font-medium text-sm mb-2">Source Analysis</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {currentAnalysis.assessment.sources.map((source, idx) => (
                        <div key={idx} className="bg-slate-50 p-3 rounded border border-slate-100">
                          <div className="flex justify-between items-center mb-1">
                            <h5 className="font-medium text-sm">{source.type}</h5>
                            <Badge variant="outline">{source.count}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{source.description}</p>
                        </div>
                      ))}
                    </div>
                    
                    <h4 className="font-medium text-sm mb-2">Limitations</h4>
                    <ul className="space-y-2">
                      {currentAnalysis.assessment.methodology.limitations.map((limitation, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground">
                          • {limitation}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Regulatory Tab */}
              <TabsContent value="regulatory" className="mt-4">
                <ScrollArea className="h-[60vh]">
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-lg mb-6">
                      <h3 className="text-lg font-semibold mb-2 flex items-center">
                        <GanttChart className="h-5 w-5 mr-2 text-primary" />
                        Global Regulatory Guidance
                      </h3>
                      <p className="text-sm text-slate-600 mb-3">
                        This analysis incorporates guidance from major global regulatory agencies, ensuring protocol compliance with international standards.
                      </p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge variant="secondary">FDA</Badge>
                        <Badge variant="secondary">EMA</Badge>
                        <Badge variant="secondary">ICH</Badge>
                        <Badge variant="secondary">TGA</Badge>
                        <Badge variant="secondary">PMDA</Badge>
                        <Badge variant="secondary">NMPA</Badge>
                        <Badge variant="secondary">Health Canada</Badge>
                      </div>
                    </div>
                    
                    {currentAnalysis.assessment.regulatoryConsiderations.map((reg, idx) => (
                      <Card key={idx}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-md flex items-center">
                            <Badge variant="outline" className="mr-2 font-bold">{reg.agency}</Badge>
                            {reg.relevantGuidance}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
                            <p className="text-sm">{reg.consideration}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              
              {/* Literature Tab */}
              <TabsContent value="literature" className="mt-4">
                <div className="mb-6">
                  <div className="bg-slate-50 p-4 rounded-lg mb-4">
                    <h3 className="text-lg font-semibold mb-2 flex items-center">
                      <BookOpen className="h-5 w-5 mr-2 text-primary" />
                      Academic Literature Analysis
                    </h3>
                    <p className="text-sm text-slate-600 mb-1">
                      Evidence-based recommendations supported by relevant scientific literature focused on clinical trial design and execution.
                    </p>
                  </div>
                  
                  {/* Filter and sort controls */}
                  <div className="flex flex-wrap gap-3 mb-4">
                    <Select 
                      defaultValue="relevance" 
                      onValueChange={(value) => {
                        const sortedLiterature = [...(currentAnalysis.assessment.academicLiterature || [])];
                        if (value === "relevance") {
                          sortedLiterature.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
                        } else if (value === "citations") {
                          sortedLiterature.sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0));
                        } else if (value === "year") {
                          sortedLiterature.sort((a, b) => parseInt(b.year) - parseInt(a.year));
                        } else if (value === "regulatory") {
                          // Prioritize papers with global regulatory relevance in their title or abstract
                          sortedLiterature.sort((a, b) => {
                            // Create an array of global regulatory terms to search for
                            const regulatoryTerms = [
                              'regulatory', 'regulation', 'regulator', 'fda', 'ema', 'mhra', 'tga', 
                              'pmda', 'health canada', 'anvisa', 'cdsco', 'nmpa', 'kfda', 'sfda',
                              'ich', 'guidance', 'guideline', 'compliance', 'approval', 'submission',
                              'investigator brochure', 'drug approval', 'marketing authorization'
                            ];
                            
                            // Check if paper contains regulatory terms and count occurrences
                            const countRegTerms = (text) => {
                              if (!text) return 0;
                              const lowerText = text.toLowerCase();
                              return regulatoryTerms.reduce((count, term) => 
                                count + (lowerText.includes(term) ? 1 : 0), 0);
                            };
                            
                            const aRegScore = countRegTerms(a.title) * 2 + countRegTerms(a.abstract);
                            const bRegScore = countRegTerms(b.title) * 2 + countRegTerms(b.abstract);
                            
                            // First sort by regulatory score, then by relevance score
                            return bRegScore - aRegScore || (b.relevance_score || 0) - (a.relevance_score || 0);
                          });
                        }
                        
                        // Create a shallow copy of currentAnalysis to trigger a re-render
                        const updatedAnalysis = {
                          ...currentAnalysis,
                          assessment: {
                            ...currentAnalysis.assessment,
                            academicLiterature: sortedLiterature
                          }
                        };
                        setCurrentAnalysis(updatedAnalysis);
                      }}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Sort by..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="relevance">Sort by Relevance</SelectItem>
                        <SelectItem value="citations">Sort by Citations</SelectItem>
                        <SelectItem value="year">Sort by Year</SelectItem>
                        <SelectItem value="regulatory">Regulatory Relevance</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Input 
                      placeholder="Filter by keyword..." 
                      className="w-[200px]"
                      onChange={(e) => {
                        const searchTerm = e.target.value.toLowerCase();
                        // Filter literature based on the search term
                        // Create a shallow copy of currentAnalysis to trigger a re-render
                        if (searchTerm) {
                          const filteredLiterature = (currentAnalysis.assessment.academicLiterature || [])
                            .filter(citation => 
                              citation.title.toLowerCase().includes(searchTerm) || 
                              citation.abstract?.toLowerCase().includes(searchTerm) ||
                              citation.authors.toLowerCase().includes(searchTerm) ||
                              citation.journal.toLowerCase().includes(searchTerm)
                            );
                            
                          const updatedAnalysis = {
                            ...currentAnalysis,
                            assessment: {
                              ...currentAnalysis.assessment,
                              academicLiterature: filteredLiterature
                            }
                          };
                          setCurrentAnalysis(updatedAnalysis);
                        } else {
                          // Reset to original data when search term is empty
                          const originalAnalysis = assessments.find(a => a.id === currentAnalysisId);
                          if (originalAnalysis) {
                            setCurrentAnalysis(originalAnalysis);
                          }
                        }
                      }}
                    />
                    
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        // Reset to original data
                        const originalAnalysis = assessments.find(a => a.id === currentAnalysisId);
                        if (originalAnalysis) {
                          setCurrentAnalysis(originalAnalysis);
                        }
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset
                    </Button>
                  </div>
                </div>
                
                <ScrollArea className="h-[50vh]">
                  <div className="space-y-4">
                    {currentAnalysis.assessment.academicLiterature?.length === 0 && (
                      <div className="text-center p-8 text-slate-500">
                        <Search className="h-12 w-12 mx-auto mb-2 opacity-20" />
                        <p>No literature citations match your filter criteria.</p>
                      </div>
                    )}
                    
                    {currentAnalysis.assessment.academicLiterature?.map((citation, idx) => (
                      <Card key={idx} className="overflow-hidden">
                        <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-white">
                          <div className="flex justify-between items-start">
                            <CardTitle className="text-md font-medium">
                              {citation.title}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {citation.year}
                              </Badge>
                              {/* Add a "New" badge for recent publications (published in the last two years) */}
                              {parseInt(citation.year) >= new Date().getFullYear() - 1 && (
                                <Badge variant="default" className="text-xs bg-green-500 hover:bg-green-600">
                                  New
                                </Badge>
                              )}
                              {citation.relevance_score && (
                                <Badge variant="secondary" className="text-xs">
                                  Relevance: {Math.round(citation.relevance_score * 100)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                          <CardDescription>
                            {citation.authors} • {citation.journal} • Vol {citation.volume}, pp {citation.pages}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {citation.abstract && (
                            <div className="bg-white border border-slate-100 rounded-md p-3 mb-3">
                              <h4 className="text-sm font-medium mb-1">Abstract</h4>
                              <p className="text-xs text-slate-700 leading-relaxed">
                                {citation.abstract}
                              </p>
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              {citation.citation_count && (
                                <span className="text-xs text-slate-500 flex items-center">
                                  <FileText className="h-3 w-3 mr-1" />
                                  {citation.citation_count} citations
                                </span>
                              )}
                            </div>
                            {citation.doi && (
                              <a 
                                href={`https://doi.org/${citation.doi}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center"
                              >
                                View Publication <ExternalLink className="h-3 w-3 ml-1" />
                              </a>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Recent Analyses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart className="h-5 w-5 text-primary mr-2" />
            Recent Protocol Assessments
          </CardTitle>
          <CardDescription>
            Select a protocol to view its detailed assessment
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analysesLoading ? (
            <div className="text-center py-4">Loading recent assessments...</div>
          ) : recentAnalyses && recentAnalyses.length > 0 ? (
            <div className="space-y-3">
              {recentAnalyses.map((analysis: ProtocolAnalysisResponse) => (
                <div 
                  key={analysis.id} 
                  className={`flex items-center justify-between p-3 border rounded-md cursor-pointer hover:bg-slate-50 transition-colors ${currentAnalysisId === analysis.id ? 'border-primary' : ''}`}
                  onClick={() => selectAnalysis(analysis.id)}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-slate-500" />
                    <div>
                      <p className="font-medium text-sm">{analysis.fileName}</p>
                      <div className="flex items-center text-xs text-slate-500 gap-1">
                        <span>{new Date(analysis.uploadDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <Badge variant={analysis.status === 'completed' ? 'outline' : (analysis.status === 'processing' ? 'secondary' : 'destructive')}>
                    {analysis.status === 'completed' ? 'Completed' : (analysis.status === 'processing' ? 'Processing' : 'Failed')}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No protocol assessments yet. Upload a protocol to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}