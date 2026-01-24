import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, BarChart3, Search, List, PlusCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import ReactMarkdown from 'react-markdown';

const IntelligenceDashboard = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("summary");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  
  // Form states
  const [summaryMetrics, setSummaryMetrics] = useState<Record<string, any>>({
    totalReports: 693,
    indications: {
      "Oncology": 214,
      "Neurology": 89,
      "Cardiology": 156,
      "Infectious Disease": 122,
      "Immunology": 112
    },
    phases: {
      "Phase 1": 145,
      "Phase 2": 246,
      "Phase 3": 287,
      "Phase 4": 15
    },
    trends: {
      averageDropoutRate: 18.7,
      averageSampleSize: 342,
      commonEndpoints: [
        "Progression-Free Survival",
        "Overall Survival",
        "Objective Response Rate",
        "Safety & Tolerability",
        "Pharmacokinetics"
      ]
    }
  });
  
  const [compareState, setCompareState] = useState({
    studyIds: ["STUDY-001", "STUDY-002"],
    studySummaries: [
      "Phase 2 trial for advanced melanoma with 120 participants. Primary endpoint: Progression-free survival. Inclusion: BRAF V600E mutation positive, ECOG 0-1.",
      "Phase 2 trial for metastatic melanoma with 135 participants. Primary endpoint: Overall survival. Inclusion: BRAF mutation positive, ECOG 0-2."
    ]
  });
  
  const [indModuleState, setIndModuleState] = useState({
    studyId: "STUDY-001",
    section: "2.5.3",
    context: "Drug X showed promising efficacy in 3 Phase 2 trials for advanced melanoma with BRAF mutations. Overall response rate was 62% (95% CI: 53-71%). Most common adverse events were fatigue (23%), nausea (18%), and rash (15%). No drug-related deaths occurred."
  });
  
  const [qaState, setQaState] = useState({
    question: "What are best practices for designing phase 2 trials with adaptive dose-finding in oncology?",
    relatedStudies: [
      "Study NCT01234567 used a Bayesian adaptive design with 4 dose levels (10mg, 25mg, 50mg, 100mg) in 120 advanced cancer patients. ORR was primary endpoint with 4-week assessment intervals.",
      "Study NCT02345678 implemented continuous reassessment method for dose finding with stopping rules based on toxicity >30%. Started with 3+3 design then transitioned to Bayesian model after 18 patients."
    ]
  });

  // Handler functions
  const handleSummarySubmit = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('POST', '/api/intel/summary', { metrics: summaryMetrics });
      const data = await response.json();
      
      if (data.success) {
        setResults(data);
        // toast call replaced
  // Original: toast({
          title: "Intelligence brief generated",
          description: "Weekly brief has been created successfully",
        })
  console.log('Toast would show:', {
          title: "Intelligence brief generated",
          description: "Weekly brief has been created successfully",
        });
      } else {
        throw new Error(data.message || "Failed to generate brief");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Generation failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCompareSubmit = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('POST', '/api/intel/compare', { 
        study_ids: compareState.studyIds,
        study_summaries: compareState.studySummaries 
      });
      const data = await response.json();
      
      if (data.success) {
        setResults(data);
        // toast call replaced
  // Original: toast({
          title: "Comparison complete",
          description: "Protocol comparison has been generated",
        })
  console.log('Toast would show:', {
          title: "Comparison complete",
          description: "Protocol comparison has been generated",
        });
      } else {
        throw new Error(data.message || "Failed to compare protocols");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Comparison failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Comparison failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleIndModuleSubmit = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('GET', `/api/intel/ind-module?study_id=${encodeURIComponent(indModuleState.studyId)}&section=${encodeURIComponent(indModuleState.section)}&context=${encodeURIComponent(indModuleState.context)}`);
      const data = await response.json();
      
      if (data.success) {
        setResults(data);
        // toast call replaced
  // Original: toast({
          title: "IND Module generated",
          description: `Module ${indModuleState.section} has been created`,
        })
  console.log('Toast would show:', {
          title: "IND Module generated",
          description: `Module ${indModuleState.section} has been created`,
        });
      } else {
        throw new Error(data.message || "Failed to generate IND module");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Generation failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQaSubmit = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('POST', '/api/intel/qa', { 
        question: qaState.question,
        related_studies: qaState.relatedStudies 
      });
      const data = await response.json();
      
      if (data.success) {
        setResults(data);
        // toast call replaced
  // Original: toast({
          title: "Answer generated",
          description: "Protocol design question has been answered",
        })
  console.log('Toast would show:', {
          title: "Answer generated",
          description: "Protocol design question has been answered",
        });
      } else {
        throw new Error(data.message || "Failed to answer question");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Question answering failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Question answering failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderResults = () => {
    if (!results) return null;
    
    if (activeTab === "summary" && results.brief) {
      return (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Weekly Intelligence Brief</CardTitle>
            <CardDescription>Generated from aggregated metrics across clinical studies</CardDescription>
          </CardHeader>
          <CardContent className="prose max-w-none">
            <ReactMarkdown>{results.brief}</ReactMarkdown>
          </CardContent>
        </Card>
      );
    }
    
    if (activeTab === "compare" && results.summary) {
      return (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Protocol Comparison</CardTitle>
            <CardDescription>Differences and similarities between selected protocols</CardDescription>
          </CardHeader>
          <CardContent className="prose max-w-none">
            <ReactMarkdown>{results.summary}</ReactMarkdown>
          </CardContent>
        </Card>
      );
    }
    
    if (activeTab === "ind-module" && results.content) {
      return (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>IND Module {results.section}</CardTitle>
            <CardDescription>Generated content for regulatory submission</CardDescription>
          </CardHeader>
          <CardContent className="prose max-w-none">
            <ReactMarkdown>{results.content}</ReactMarkdown>
          </CardContent>
        </Card>
      );
    }
    
    if (activeTab === "qa" && results.answer) {
      return (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Protocol Design Answer</CardTitle>
            <CardDescription>Response to: {results.question}</CardDescription>
          </CardHeader>
          <CardContent className="prose max-w-none">
            <ReactMarkdown>{results.answer}</ReactMarkdown>
          </CardContent>
        </Card>
      );
    }
    
    return null;
  };

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Clinical Intelligence Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">Powered by OpenAI GPT-4</span>
        </div>
      </div>
      
      <Tabs defaultValue="summary" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="summary" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>Weekly Brief</span>
          </TabsTrigger>
          <TabsTrigger value="compare" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            <span>Compare Protocols</span>
          </TabsTrigger>
          <TabsTrigger value="ind-module" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>IND Module</span>
          </TabsTrigger>
          <TabsTrigger value="qa" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span>Protocol Q&A</span>
          </TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
          <TabsContent value="summary">
            <Card>
              <CardHeader>
                <CardTitle>Generate Weekly Intelligence Brief</CardTitle>
                <CardDescription>
                  Create a comprehensive brief based on aggregated clinical trial metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Metrics Data (Pre-populated with example data)
                    </label>
                    <Textarea 
                      rows={10}
                      value={JSON.stringify(summaryMetrics, null, 2)}
                      onChange={(e) => {
                        try {
                          setSummaryMetrics(JSON.parse(e.target.value));
                        } catch (error) {
                          // Allow invalid JSON during editing
                        }
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <Button 
                    onClick={handleSummarySubmit} 
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating Brief...
                      </>
                    ) : (
                      <>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Generate Weekly Brief
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="compare">
            <Card>
              <CardHeader>
                <CardTitle>Compare Trial Protocols</CardTitle>
                <CardDescription>
                  Analyze similarities and differences between two clinical trial protocols
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Protocol A ID
                      </label>
                      <Input 
                        value={compareState.studyIds[0]}
                        onChange={(e) => setCompareState({
                          ...compareState,
                          studyIds: [e.target.value, compareState.studyIds[1]]
                        })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Protocol B ID
                      </label>
                      <Input 
                        value={compareState.studyIds[1]}
                        onChange={(e) => setCompareState({
                          ...compareState,
                          studyIds: [compareState.studyIds[0], e.target.value]
                        })}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Protocol A Summary
                    </label>
                    <Textarea 
                      rows={4}
                      value={compareState.studySummaries[0]}
                      onChange={(e) => setCompareState({
                        ...compareState,
                        studySummaries: [e.target.value, compareState.studySummaries[1]]
                      })}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Protocol B Summary
                    </label>
                    <Textarea 
                      rows={4}
                      value={compareState.studySummaries[1]}
                      onChange={(e) => setCompareState({
                        ...compareState,
                        studySummaries: [compareState.studySummaries[0], e.target.value]
                      })}
                    />
                  </div>
                  
                  <Button 
                    onClick={handleCompareSubmit} 
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Comparing Protocols...
                      </>
                    ) : (
                      <>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Compare Protocols
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="ind-module">
            <Card>
              <CardHeader>
                <CardTitle>Generate IND Module</CardTitle>
                <CardDescription>
                  Create regulatory documentation based on clinical study findings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Study ID
                      </label>
                      <Input 
                        value={indModuleState.studyId}
                        onChange={(e) => setIndModuleState({
                          ...indModuleState,
                          studyId: e.target.value
                        })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Module Section
                      </label>
                      <Select
                        value={indModuleState.section}
                        onValueChange={(value) => setIndModuleState({
                          ...indModuleState,
                          section: value
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select section" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2.5">2.5 Clinical Overview</SelectItem>
                          <SelectItem value="2.5.1">2.5.1 Product Development Rationale</SelectItem>
                          <SelectItem value="2.5.2">2.5.2 Overview of Biopharmaceutics</SelectItem>
                          <SelectItem value="2.5.3">2.5.3 Overview of Clinical Pharmacology</SelectItem>
                          <SelectItem value="2.5.4">2.5.4 Overview of Efficacy</SelectItem>
                          <SelectItem value="2.5.5">2.5.5 Overview of Safety</SelectItem>
                          <SelectItem value="2.5.6">2.5.6 Benefits and Risks Conclusions</SelectItem>
                          <SelectItem value="2.7">2.7 Clinical Summary</SelectItem>
                          <SelectItem value="2.7.1">2.7.1 Summary of Biopharmaceutic Studies</SelectItem>
                          <SelectItem value="2.7.2">2.7.2 Summary of Clinical Pharmacology Studies</SelectItem>
                          <SelectItem value="2.7.3">2.7.3 Summary of Clinical Efficacy</SelectItem>
                          <SelectItem value="2.7.4">2.7.4 Summary of Clinical Safety</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Study Context and Findings
                    </label>
                    <Textarea 
                      rows={6}
                      value={indModuleState.context}
                      onChange={(e) => setIndModuleState({
                        ...indModuleState,
                        context: e.target.value
                      })}
                    />
                  </div>
                  
                  <Button 
                    onClick={handleIndModuleSubmit} 
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating IND Module...
                      </>
                    ) : (
                      <>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Generate IND Module
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="qa">
            <Card>
              <CardHeader>
                <CardTitle>Protocol Design Q&A</CardTitle>
                <CardDescription>
                  Get expert answers to clinical trial design questions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Question
                    </label>
                    <Textarea 
                      rows={3}
                      value={qaState.question}
                      onChange={(e) => setQaState({
                        ...qaState,
                        question: e.target.value
                      })}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Related Study 1 (optional)
                    </label>
                    <Textarea 
                      rows={3}
                      value={qaState.relatedStudies[0] || ""}
                      onChange={(e) => {
                        const newStudies = [...qaState.relatedStudies];
                        newStudies[0] = e.target.value;
                        setQaState({
                          ...qaState,
                          relatedStudies: newStudies
                        });
                      }}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Related Study 2 (optional)
                    </label>
                    <Textarea 
                      rows={3}
                      value={qaState.relatedStudies[1] || ""}
                      onChange={(e) => {
                        const newStudies = [...qaState.relatedStudies];
                        newStudies[1] = e.target.value;
                        setQaState({
                          ...qaState,
                          relatedStudies: newStudies
                        });
                      }}
                    />
                  </div>
                  
                  <Button 
                    onClick={handleQaSubmit} 
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Finding Answer...
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        Get Expert Answer
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
      
      {renderResults()}
    </div>
  );
};

export default IntelligenceDashboard;