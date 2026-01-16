import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger, } from '@/components/ui/accordion';
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import html2pdf from 'html2pdf.js';
import EnhancedProtocolIntelligencePanel from '@/components/EnhancedProtocolIntelligencePanel';
import AcademicInsightsPanel from '@/components/AcademicInsightsPanel';
import FormattedProtocolRecommendations from '@/components/FormattedProtocolRecommendations';
import ExportMenu from '@/components/ExportMenu';
import {
  ArrowRight, FileDown, FileText, Save, Loader2, PlusCircle, Upload, BookCopy, File, ExportMenu } from 'lucide-react'

export default function ProtocolOptimizer() {
  const [location] = useLocation();
  const dossierId = new URLSearchParams(location.split('?')[1]).get('dossier_id');

  const [protocolSummary, setProtocolSummary] = useState<string>('');
  const [studyType, setStudyType] = useState<string>('rct');
  const [includeReferences, setIncludeReferences] = useState<boolean>(true);
  const [useSimilarTrials, setUseSimilarTrials] = useState<boolean>(true);
  const [indication, setIndication] = useState<string>('');
  const [phase, setPhase] = useState<string>('phase3');
  const [protocolFile, setProtocolFile] = useState<File | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');

  // New state variables for enhanced protocol analysis
  const [useGlobalAcademicGuidance, setUseGlobalAcademicGuidance] = useState<boolean>(true);
  const [useCsrLibraryLearnings, setUseCsrLibraryLearnings] = useState<boolean>(true);
  const [analysisDepth, setAnalysisDepth] = useState<string>('comprehensive'); // 'basic', 'standard', 'comprehensive'

  const [analyzeLoading, setAnalyzeLoading] = useState<boolean>(false);
  const [generatedContent, setGeneratedContent] = useState<{
    recommendation: string;
    keySuggestions: string[];
    riskFactors: string[];
    matchedCsrInsights: any[];
    suggestedEndpoints: string[];
    suggestedArms: string[];
    // New structure for section-by-section protocol analysis
    sectionAnalysis?: {
      studyDesign?: {
        current: string;
        suggestions: string[];
        alignment: number;
        academicGuidance?: string;
        csrLearnings?: string[];
      };
      eligibilityCriteria?: {
        current: string;
        suggestions: string[];
        alignment: number;
        academicGuidance?: string;
        csrLearnings?: string[];
      };
      endpoints?: {
        current: string;
        suggestions: string[];
        alignment: number;
        academicGuidance?: string;
        csrLearnings?: string[];
      };
      statisticalAnalysis?: {
        current: string;
        suggestions: string[];
        alignment: number;
        academicGuidance?: string;
        csrLearnings?: string[];
      };
      safetyMonitoring?: {
        current: string;
        suggestions: string[];
        alignment: number;
        academicGuidance?: string;
        csrLearnings?: string[];
      };
      studyProcedures?: {
        current: string;
        suggestions: string[];
        alignment: number;
        academicGuidance?: string;
        csrLearnings?: string[];
      };
      ethicalConsiderations?: {
        current: string;
        suggestions: string[];
        alignment: number;
        academicGuidance?: string;
        csrLearnings?: string[];
      };
    };
    academicReferences?: {
      title: string;
      author: string;
      publication: string;
      year: string;
      relevance: string;
    }[];
    regulatoryAlignmentScore?: number;
    csrAlignmentScore?: number;
    academicAlignmentScore?: number;
    overallQualityScore?: number;
  } | null>(null);

  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [savedMessageVisible, setSavedMessageVisible] = useState<boolean>(false);
  const [versionCount, setVersionCount] = useState<number>(0);

  const outputRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Generate protocol optimization recommendation
  const analyzeProtocol = async () => {
    if (!protocolSummary.trim() && !protocolFile) {
      toast({
        title: 'Empty Protocol',
        description: 'Please enter a protocol summary or upload a protocol file.',
        variant: 'destructive',
      });
      return;
    }

    setAnalyzeLoading(true);
    setGeneratedContent(null);

    try {
      // Create a FormData object if a file is uploaded
      let payload: any = {
        protocolSummary,
        studyType,
        includeReferences,
        useSimilarTrials: true, // Always set to true to ensure we get all relevant CSRs
        indication,
        phase,
        findAllSimilarCSRs: true, // New flag to find all similar CSRs
        compareTherapeuticArea: true, // Match by therapeutic area
        compareTrialPhase: true, // Match by trial phase
        // Enhanced protocol analysis parameters
        useGlobalAcademicGuidance,
        useCsrLibraryLearnings,
        analysisDepth,
        // Request comprehensive section-by-section analysis
        sectionBySection: true,
        includeAcademicReferences: true,
        includeRegulatoryAlignment: true,
        includeCsrAlignment: true,
      };

      let response;

      if (protocolFile) {
        // If there's a file, we need to use FormData for multipart/form-data
        const formData = new FormData();
        formData.append('file', protocolFile);

        // Add all other parameters to the FormData
        Object.keys(payload).forEach(key => {
          formData.append(key, payload[key]?.toString() || '');
        });

        // Use fetch directly for file upload
        const uploadResponse = await fetch('/api/protocol/upload-and-optimize', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error(`File upload failed: ${uploadResponse.statusText}`);
        }

        response = await uploadResponse.json();
      } else {
        // Standard JSON request when no file is uploaded
        response = (await apiRequest(
          'POST',
          '/api/protocol/optimize',
          payload
        )) as ProtocolOptimizationResponse;
      }

      if (response.success) {
        setGeneratedContent({
          recommendation: response.recommendation,
          keySuggestions: response.keySuggestions || [],
          riskFactors: response.riskFactors || [],
          matchedCsrInsights: response.matchedCsrInsights || [],
          suggestedEndpoints: response.suggestedEndpoints || [],
          suggestedArms: response.suggestedArms || [],
          // Handle new section-by-section analysis structure
          sectionAnalysis: response.sectionAnalysis || {},
          academicReferences: response.academicReferences || [],
          regulatoryAlignmentScore: response.regulatoryAlignmentScore,
          csrAlignmentScore: response.csrAlignmentScore,
          academicAlignmentScore: response.academicAlignmentScore,
          overallQualityScore: response.overallQualityScore,
        });

        // If we received file content but no summary was manually entered, update the summary field
        if (protocolFile && !protocolSummary.trim() && response.extractedSummary) {
          setProtocolSummary(response.extractedSummary);
        }

        toast({
          title: 'Analysis Complete',
          description: `Successfully analyzed protocol ${protocolFile ? 'file' : 'summary'} and found ${response.matchedCsrInsights?.length || 0} similar CSRs.`,
        });
      } else {
        toast({
          title: 'Analysis Failed',
          description: response.error || 'Failed to analyze protocol. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Protocol analysis error:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred during analysis.',
        variant: 'destructive',
      });
    } finally {
      setAnalyzeLoading(false);
    }
  };

  // Export the recommendation as PDF
  const exportPDF = () => {
    if (!outputRef.current) return;

    const content = outputRef.current;
    const opt = {
      margin: 10,
      filename: `protocol_optimization_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
    };

    // Add TrialSage branding header
    const header = document.createElement('div');
    header.innerHTML = `
      <div style="margin-bottom: 20px; text-align: center;">
        <h1 style="color: #2563eb; margin-bottom: 5px;">TrialSage Protocol Optimization</h1>
        <p style="color: #64748b; margin: 0;">Generated on ${new Date().toLocaleString()}</p>
        <p style="color: #64748b; margin-top: 5px;">Indication: ${indication || 'Not specified'} | Phase: ${phase.replace('phase', 'Phase ') || 'Not specified'}</p>
      </div>
    `;

    content.prepend(header);

    // Generate PDF
    html2pdf()
      .set(opt)
      .from(content)
      .save()
      .then(() => {
        // Remove the temporary header after PDF generation
        content.removeChild(header);

        toast({
          title: 'Export Complete',
          description: 'Protocol optimization report has been exported as PDF',
        });
      });
  };

  // Save optimization to dossier
  const saveOptimizationToDossier = async () => {
    if (!dossierId || !generatedContent) {
      toast({
        title: 'Cannot Save',
        description: dossierId ? 'No optimization to save.' : 'No dossier selected.',
        variant: 'destructive',
      });
      return;
    }

    setSaveLoading(true);

    try {
      const response = await apiRequest('POST', `/api/dossier/${dossierId}/save-optimization`, {
        recommendation: generatedContent.recommendation,
        protocolSummary,
        csr_ids: generatedContent.matchedCsrInsights?.map(csr => csr.id) || [],
      });

      if (response.saved) {
        setSavedMessageVisible(true);
        setVersionCount(response.version_count || 0);

        setTimeout(() => {
          setSavedMessageVisible(false);
        }, 3000);

        toast({
          title: 'Saved Successfully',
          description: 'Optimization saved to dossier.',
        });
      } else {
        toast({
          title: 'Save Failed',
          description: response.error || 'Failed to save optimization.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred when saving.',
        variant: 'destructive',
      });
    } finally {
      setSaveLoading(false);
    }
  };

  // Handle view dossier button click
  const viewDossier = () => {
    if (dossierId) {
      window.location.href = `/dossier/${dossierId}`;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-3">
          Protocol Optimizer
        </h1>
        <p className="text-slate-600 max-w-2xl mx-auto">
          Enter your protocol summary and our AI will provide optimization suggestions based on
          successful clinical study reports.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="overflow-hidden border-0 shadow-lg rounded-xl">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3 border-b">
            <CardTitle className="text-blue-800">Protocol Input</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {dossierId && (
              <div className="bg-blue-50 p-3 rounded-md border border-blue-200 mb-2">
                <p className="text-sm text-blue-700 flex items-center">
                  <BookCopy className="h-4 w-4 mr-2" />
                  Optimization will be saved to Dossier ID: {dossierId.slice(0, 8)}...
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="indication">Indication/Condition</Label>
              <Input
                id="indication"
                placeholder="e.g., Type 2 Diabetes, Breast Cancer, etc."
                value={indication}
                onChange={e => setIndication(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="protocolFile">Upload Draft Protocol (PDF or DOCX)</Label>
              <div
                className={`border-2 border-dashed ${uploadedFileName ? 'border-green-200 bg-green-50/50' : 'border-blue-200'} rounded-lg p-6 transition-colors hover:${uploadedFileName ? 'border-green-300' : 'border-blue-300'} hover:${uploadedFileName ? 'bg-green-50/70' : 'bg-blue-50/50'} cursor-pointer`}
                onClick={() => document.getElementById('protocolFile')?.click()}
              >
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  {uploadedFileName ? (
                    <>
                      <div className="h-10 w-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-green-700">{uploadedFileName}</p>
                      <p className="text-xs text-green-600">File selected. Click to change.</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-blue-500" />
                      <p className="text-sm font-medium text-blue-700">
                        Drag and drop your protocol file, or click to browse
                      </p>
                      <p className="text-xs text-slate-500">
                        Upload a PDF or DOCX file of your draft protocol for AI analysis
                      </p>
                    </>
                  )}
                  <input
                    type="file"
                    id="protocolFile"
                    className="hidden"
                    accept=".pdf,.docx,.doc"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setProtocolFile(file);
                        setUploadedFileName(file.name);
                        toast({
                          title: 'File Selected',
                          description: `${file.name} ready for analysis`,
                        });
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 border-blue-200 text-blue-700"
                    onClick={() => document.getElementById('protocolFile')?.click()}
                  >
                    Select File
                  </Button>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                The AI will extract key details from your protocol and provide optimization
                suggestions
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phase">Study Phase</Label>
                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select phase" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phase1">Phase 1</SelectItem>
                    <SelectItem value="phase2">Phase 2</SelectItem>
                    <SelectItem value="phase3">Phase 3</SelectItem>
                    <SelectItem value="phase4">Phase 4</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="studyType">Study Design</Label>
                <Select value={studyType} onValueChange={setStudyType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select study type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rct">Randomized Controlled Trial</SelectItem>
                    <SelectItem value="observational">Observational Study</SelectItem>
                    <SelectItem value="singleArm">Single Arm Study</SelectItem>
                    <SelectItem value="crossover">Crossover Study</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="protocolSummary">Protocol Summary</Label>
              <Textarea
                id="protocolSummary"
                placeholder="Enter your protocol summary or design here..."
                className="min-h-[200px]"
                value={protocolSummary}
                onChange={e => setProtocolSummary(e.target.value)}
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-3">
              <h3 className="text-sm font-medium text-blue-800 mb-2">Expert Analysis Options</h3>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeReferences"
                    checked={includeReferences}
                    onCheckedChange={checked => setIncludeReferences(checked as boolean)}
                  />
                  <Label htmlFor="includeReferences">
                    Include references to regulatory guidelines
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="useSimilarTrials"
                    checked={useSimilarTrials}
                    onCheckedChange={checked => setUseSimilarTrials(checked as boolean)}
                  />
                  <Label htmlFor="useSimilarTrials">Find and use similar trials</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="useGlobalAcademicGuidance"
                    checked={useGlobalAcademicGuidance}
                    onCheckedChange={checked => setUseGlobalAcademicGuidance(checked as boolean)}
                  />
                  <Label htmlFor="useGlobalAcademicGuidance">
                    Include global academic guidance
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="useCsrLibraryLearnings"
                    checked={useCsrLibraryLearnings}
                    onCheckedChange={checked => setUseCsrLibraryLearnings(checked as boolean)}
                  />
                  <Label htmlFor="useCsrLibraryLearnings">Apply CSR library learnings</Label>
                </div>

                <div className="space-y-2 pt-1">
                  <Label htmlFor="analysisDepth" className="text-sm">
                    Analysis Depth
                  </Label>
                  <Select value={analysisDepth} onValueChange={setAnalysisDepth}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select depth" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic - High-level suggestions</SelectItem>
                      <SelectItem value="standard">Standard - Detailed recommendations</SelectItem>
                      <SelectItem value="comprehensive">
                        Comprehensive - Expert-level analysis
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-blue-600 italic mt-1">
                    Comprehensive analysis examines every protocol section and provides
                    academic-backed recommendations
                  </p>
                </div>
              </div>
            </div>

            <Button
              className="w-full text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md py-6 font-medium rounded-xl mt-2"
              disabled={analyzeLoading}
              onClick={analyzeProtocol}
            >
              {analyzeLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analyzing Protocol...
                </>
              ) : (
                <>
                  <ArrowRight className="mr-2 h-5 w-5" />
                  Optimize Protocol
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {generatedContent ? (
            <>
              <Card className="overflow-hidden border-0 shadow-lg rounded-xl">
                <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50 pb-3 border-b">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-blue-800">Optimization Results</CardTitle>
                    <div className="flex gap-3">
                      <ExportMenu
                        title={`Protocol Recommendations for ${indication} Study (${phase.replace('phase', 'Phase ')})`}
                        recommendations={generatedContent}
                        csrInsights={generatedContent?.matchedCsrInsights || []}
                        academicReferences={generatedContent?.academicReferences || []}
                        indication={indication}
                        phase={phase}
                        className="bg-white hover:bg-blue-50 transition-colors border-blue-200 text-blue-700 hover:text-blue-800 font-medium"
                      />

                      {dossierId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={saveOptimizationToDossier}
                          disabled={saveLoading}
                          className="bg-white hover:bg-green-50 transition-colors border-green-200 text-green-700 hover:text-green-800 font-medium"
                        >
                          {saveLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Save to Dossier
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  {savedMessageVisible && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800 flex items-center">
                      <PlusCircle className="h-4 w-4 mr-2" />
                      <span className="font-medium">
                        Successfully saved as version {versionCount}
                      </span>
                      <Button
                        variant="link"
                        className="ml-auto text-blue-600 hover:text-blue-800 transition-colors p-0 h-auto"
                        onClick={viewDossier}
                      >
                        View Dossier
                      </Button>
                    </div>
                  )}

                  <div ref={outputRef} className="mt-2">
                    <Tabs defaultValue="protocol-intelligence">
                      <TabsList className="mb-4 bg-slate-100 p-1 rounded-lg">
                        <TabsTrigger
                          value="protocol-intelligence"
                          className="data-[state=active]:bg-white data-[state=active]:text-blue-700 rounded-md"
                        >
                          Protocol Intelligence
                        </TabsTrigger>
                        <TabsTrigger
                          value="academic-insights"
                          className="data-[state=active]:bg-white data-[state=active]:text-blue-700 rounded-md"
                        >
                          Academic Insights
                        </TabsTrigger>
                        <TabsTrigger
                          value="recommendations"
                          className="data-[state=active]:bg-white data-[state=active]:text-blue-700 rounded-md"
                        >
                          Recommendations
                        </TabsTrigger>
                        <TabsTrigger
                          value="key-points"
                          className="data-[state=active]:bg-white data-[state=active]:text-blue-700 rounded-md"
                        >
                          Key Points
                        </TabsTrigger>
                        <TabsTrigger
                          value="section-analysis"
                          className="data-[state=active]:bg-white data-[state=active]:text-blue-700 rounded-md"
                        >
                          Section Analysis
                        </TabsTrigger>
                        <TabsTrigger
                          value="references"
                          className="data-[state=active]:bg-white data-[state=active]:text-blue-700 rounded-md"
                        >
                          Similar Trials
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="recommendations" className="space-y-4">
                        <FormattedProtocolRecommendations
                          recommendation={generatedContent.recommendation}
                          protocolTitle={protocolFile?.name || `${indication} Protocol`}
                        />
                      </TabsContent>

                      <TabsContent value="key-points" className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="bg-blue-50 p-5 rounded-xl border border-blue-100">
                            <h3 className="text-md font-semibold mb-3 text-blue-800 flex items-center">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="mr-2"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <path d="m12 16 4-4-4-4" />
                                <path d="M8 12h8" />
                              </svg>
                              Suggested Endpoints
                            </h3>
                            <ul className="list-disc pl-5 space-y-2">
                              {generatedContent.suggestedEndpoints?.map((item, i) => (
                                <li key={i} className="text-sm text-blue-700">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100">
                            <h3 className="text-md font-semibold mb-3 text-indigo-800 flex items-center">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="mr-2"
                              >
                                <path d="M4 19h16" />
                                <path d="M4 15h16" />
                                <path d="M4 11h16" />
                                <path d="M4 7h16" />
                              </svg>
                              Suggested Treatment Arms
                            </h3>
                            <ul className="list-disc pl-5 space-y-2">
                              {generatedContent.suggestedArms?.map((item, i) => (
                                <li key={i} className="text-sm text-indigo-700">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-100">
                            <h3 className="text-md font-semibold mb-3 text-emerald-800 flex items-center">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="mr-2"
                              >
                                <path d="m9 12 2 2 4-4" />
                                <path d="M12 3c-1.2 0-2.4.6-3 1.7A3.6 3.6 0 0 0 4.6 9c-1 .6-1.7 1.8-1.7 3s.7 2.4 1.7 3c-.3 1.2 0 2.5 1 3.4.8.8 2.1 1.1 3.3.8.6 1 1.8 1.7 3 1.7s2.4-.6 3-1.7c1.2.3 2.5 0 3.4-1 .8-.8 1.1-2.1.8-3.3 1-.6 1.7-1.8 1.7-3s-.7-2.4-1.7-3c.3-1.2 0-2.5-1-3.4-.8-.8-2.1-1.1-3.3-.8A3.6 3.6 0 0 0 12 3z" />
                              </svg>
                              Key Suggestions
                            </h3>
                            <ul className="list-disc pl-5 space-y-2">
                              {generatedContent.keySuggestions?.map((item, i) => (
                                <li key={i} className="text-sm text-emerald-700">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="bg-amber-50 p-5 rounded-xl border border-amber-100">
                            <h3 className="text-md font-semibold mb-3 text-amber-800 flex items-center">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="mr-2"
                              >
                                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                              Risk Factors
                            </h3>
                            <ul className="list-disc pl-5 space-y-2">
                              {generatedContent.riskFactors?.map((item, i) => (
                                <li key={i} className="text-sm text-amber-700">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Quality Assessment Scores */}
                          {(generatedContent.regulatoryAlignmentScore ||
                            generatedContent.csrAlignmentScore ||
                            generatedContent.academicAlignmentScore ||
                            generatedContent.overallQualityScore) && (
                            <div className="col-span-1 md:col-span-2 bg-gray-50 p-5 rounded-xl border border-gray-200">
                              <h3 className="text-md font-semibold mb-4 text-gray-800">
                                Protocol Quality Assessment
                              </h3>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                {generatedContent.regulatoryAlignmentScore && (
                                  <div className="bg-white p-3 rounded-lg border border-blue-100">
                                    <div className="text-3xl font-bold text-blue-700 mb-1">
                                      {generatedContent.regulatoryAlignmentScore}%
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      Regulatory Alignment
                                    </div>
                                  </div>
                                )}

                                {generatedContent.csrAlignmentScore && (
                                  <div className="bg-white p-3 rounded-lg border border-indigo-100">
                                    <div className="text-3xl font-bold text-indigo-700 mb-1">
                                      {generatedContent.csrAlignmentScore}%
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      CSR Library Alignment
                                    </div>
                                  </div>
                                )}

                                {generatedContent.academicAlignmentScore && (
                                  <div className="bg-white p-3 rounded-lg border border-emerald-100">
                                    <div className="text-3xl font-bold text-emerald-700 mb-1">
                                      {generatedContent.academicAlignmentScore}%
                                    </div>
                                    <div className="text-sm text-gray-600">Academic Alignment</div>
                                  </div>
                                )}

                                {generatedContent.overallQualityScore && (
                                  <div className="bg-white p-3 rounded-lg border border-amber-100">
                                    <div className="text-3xl font-bold text-amber-700 mb-1">
                                      {generatedContent.overallQualityScore}%
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      Overall Quality Score
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </TabsContent>

                      {/* New Section Analysis Tab */}
                      <TabsContent value="section-analysis" className="space-y-6">
                        {generatedContent.sectionAnalysis ? (
                          <>
                            <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                              <h3 className="text-md font-semibold mb-2 text-blue-800 flex items-center">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="mr-2"
                                >
                                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                                </svg>
                                Comprehensive Protocol Section Analysis
                              </h3>
                              <p className="text-sm text-blue-700">
                                Expert-level analysis of each protocol section with recommendations
                                from global academic guidance and CSR library learnings
                              </p>
                            </div>

                            {/* Accordion for each section */}
                            <Accordion type="single" collapsible className="w-full">
                              {/* Study Design Section */}
                              {generatedContent.sectionAnalysis.studyDesign && (
                                <AccordionItem
                                  value="design"
                                  className="border rounded-xl mb-3 overflow-hidden"
                                >
                                  <AccordionTrigger className="px-5 py-4 hover:bg-blue-50/50 [&[data-state=open]]:bg-blue-50">
                                    <div className="flex items-center">
                                      <span className="font-medium text-blue-800">
                                        Study Design
                                      </span>
                                      {generatedContent.sectionAnalysis.studyDesign.alignment && (
                                        <span
                                          className={`ml-3 text-xs font-medium px-2 py-1 rounded-full ${
                                            generatedContent.sectionAnalysis.studyDesign
                                              .alignment >= 80
                                              ? 'bg-green-100 text-green-800'
                                              : generatedContent.sectionAnalysis.studyDesign
                                                    .alignment >= 60
                                                ? 'bg-yellow-100 text-yellow-800'
                                                : 'bg-red-100 text-red-800'
                                          }`}
                                        >
                                          {generatedContent.sectionAnalysis.studyDesign.alignment}%
                                          Alignment
                                        </span>
                                      )}
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-5 py-4 border-t bg-white">
                                    <div className="space-y-4">
                                      {generatedContent.sectionAnalysis.studyDesign.current && (
                                        <div>
                                          <h4 className="text-sm font-medium text-gray-700">
                                            Current Design:
                                          </h4>
                                          <p className="mt-1 text-sm text-gray-600">
                                            {generatedContent.sectionAnalysis.studyDesign.current}
                                          </p>
                                        </div>
                                      )}

                                      {generatedContent.sectionAnalysis.studyDesign.suggestions &&
                                        generatedContent.sectionAnalysis.studyDesign.suggestions
                                          .length > 0 && (
                                          <div>
                                            <h4 className="text-sm font-medium text-blue-700">
                                              Expert Recommendations:
                                            </h4>
                                            <ul className="mt-2 space-y-2">
                                              {generatedContent.sectionAnalysis.studyDesign.suggestions.map(
                                                (suggestion, idx) => (
                                                  <li key={idx} className="text-sm flex">
                                                    <svg
                                                      xmlns="http://www.w3.org/2000/svg"
                                                      width="16"
                                                      height="16"
                                                      viewBox="0 0 24 24"
                                                      fill="none"
                                                      stroke="currentColor"
                                                      strokeWidth="2"
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      className="mr-2 flex-shrink-0 text-blue-500 mt-0.5"
                                                    >
                                                      <path d="m9 12 2 2 4-4" />
                                                      <path d="M12 3c-1.2 0-2.4.6-3 1.7A3.6 3.6 0 0 0 4.6 9c-1 .6-1.7 1.8-1.7 3s.7 2.4 1.7 3c-.3 1.2 0 2.5 1 3.4.8.8 2.1 1.1 3.3.8.6 1 1.8 1.7 3 1.7s2.4-.6 3-1.7c1.2.3 2.5 0 3.4-1 .8-.8 1.1-2.1.8-3.3 1-.6 1.7-1.8 1.7-3s-.7-2.4-1.7-3c.3-1.2 0-2.5-1-3.4-.8-.8-2.1-1.1-3.3-.8A3.6 3.6 0 0 0 12 3z" />
                                                    </svg>
                                                    <span className="text-gray-700">
                                                      {suggestion}
                                                    </span>
                                                  </li>
                                                )
                                              )}
                                            </ul>
                                          </div>
                                        )}

                                      {generatedContent.sectionAnalysis.studyDesign
                                        .academicGuidance && (
                                        <div className="p-3 bg-indigo-50 rounded-md">
                                          <h4 className="text-sm font-medium text-indigo-700">
                                            Academic Guidance:
                                          </h4>
                                          <p className="mt-1 text-sm text-indigo-900">
                                            {
                                              generatedContent.sectionAnalysis.studyDesign
                                                .academicGuidance
                                            }
                                          </p>
                                        </div>
                                      )}

                                      {generatedContent.sectionAnalysis.studyDesign.csrLearnings &&
                                        generatedContent.sectionAnalysis.studyDesign.csrLearnings
                                          .length > 0 && (
                                          <div className="p-3 bg-emerald-50 rounded-md">
                                            <h4 className="text-sm font-medium text-emerald-700">
                                              CSR Library Learnings:
                                            </h4>
                                            <ul className="mt-1 space-y-1">
                                              {generatedContent.sectionAnalysis.studyDesign.csrLearnings.map(
                                                (learning, idx) => (
                                                  <li
                                                    key={idx}
                                                    className="text-sm text-emerald-900"
                                                  >
                                                    {learning}
                                                  </li>
                                                )
                                              )}
                                            </ul>
                                          </div>
                                        )}
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              )}

                              {/* Eligibility Criteria Section */}
                              {generatedContent.sectionAnalysis.eligibilityCriteria && (
                                <AccordionItem
                                  value="eligibility"
                                  className="border rounded-xl mb-3 overflow-hidden"
                                >
                                  <AccordionTrigger className="px-5 py-4 hover:bg-blue-50/50 [&[data-state=open]]:bg-blue-50">
                                    <div className="flex items-center">
                                      <span className="font-medium text-blue-800">
                                        Eligibility Criteria
                                      </span>
                                      {generatedContent.sectionAnalysis.eligibilityCriteria
                                        .alignment && (
                                        <span
                                          className={`ml-3 text-xs font-medium px-2 py-1 rounded-full ${
                                            generatedContent.sectionAnalysis.eligibilityCriteria
                                              .alignment >= 80
                                              ? 'bg-green-100 text-green-800'
                                              : generatedContent.sectionAnalysis.eligibilityCriteria
                                                    .alignment >= 60
                                                ? 'bg-yellow-100 text-yellow-800'
                                                : 'bg-red-100 text-red-800'
                                          }`}
                                        >
                                          {
                                            generatedContent.sectionAnalysis.eligibilityCriteria
                                              .alignment
                                          }
                                          % Alignment
                                        </span>
                                      )}
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-5 py-4 border-t bg-white">
                                    <div className="space-y-4">
                                      {generatedContent.sectionAnalysis.eligibilityCriteria
                                        .current && (
                                        <div>
                                          <h4 className="text-sm font-medium text-gray-700">
                                            Current Criteria:
                                          </h4>
                                          <p className="mt-1 text-sm text-gray-600">
                                            {
                                              generatedContent.sectionAnalysis.eligibilityCriteria
                                                .current
                                            }
                                          </p>
                                        </div>
                                      )}

                                      {generatedContent.sectionAnalysis.eligibilityCriteria
                                        .suggestions &&
                                        generatedContent.sectionAnalysis.eligibilityCriteria
                                          .suggestions.length > 0 && (
                                          <div>
                                            <h4 className="text-sm font-medium text-blue-700">
                                              Expert Recommendations:
                                            </h4>
                                            <ul className="mt-2 space-y-2">
                                              {generatedContent.sectionAnalysis.eligibilityCriteria.suggestions.map(
                                                (suggestion, idx) => (
                                                  <li key={idx} className="text-sm flex">
                                                    <svg
                                                      xmlns="http://www.w3.org/2000/svg"
                                                      width="16"
                                                      height="16"
                                                      viewBox="0 0 24 24"
                                                      fill="none"
                                                      stroke="currentColor"
                                                      strokeWidth="2"
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      className="mr-2 flex-shrink-0 text-blue-500 mt-0.5"
                                                    >
                                                      <path d="m9 12 2 2 4-4" />
                                                      <path d="M12 3c-1.2 0-2.4.6-3 1.7A3.6 3.6 0 0 0 4.6 9c-1 .6-1.7 1.8-1.7 3s.7 2.4 1.7 3c-.3 1.2 0 2.5 1 3.4.8.8 2.1 1.1 3.3.8.6 1 1.8 1.7 3 1.7s2.4-.6 3-1.7c1.2.3 2.5 0 3.4-1 .8-.8 1.1-2.1.8-3.3 1-.6 1.7-1.8 1.7-3s-.7-2.4-1.7-3c.3-1.2 0-2.5-1-3.4-.8-.8-2.1-1.1-3.3-.8A3.6 3.6 0 0 0 12 3z" />
                                                    </svg>
                                                    <span className="text-gray-700">
                                                      {suggestion}
                                                    </span>
                                                  </li>
                                                )
                                              )}
                                            </ul>
                                          </div>
                                        )}

                                      {generatedContent.sectionAnalysis.eligibilityCriteria
                                        .academicGuidance && (
                                        <div className="p-3 bg-indigo-50 rounded-md">
                                          <h4 className="text-sm font-medium text-indigo-700">
                                            Academic Guidance:
                                          </h4>
                                          <p className="mt-1 text-sm text-indigo-900">
                                            {
                                              generatedContent.sectionAnalysis.eligibilityCriteria
                                                .academicGuidance
                                            }
                                          </p>
                                        </div>
                                      )}

                                      {generatedContent.sectionAnalysis.eligibilityCriteria
                                        .csrLearnings &&
                                        generatedContent.sectionAnalysis.eligibilityCriteria
                                          .csrLearnings.length > 0 && (
                                          <div className="p-3 bg-emerald-50 rounded-md">
                                            <h4 className="text-sm font-medium text-emerald-700">
                                              CSR Library Learnings:
                                            </h4>
                                            <ul className="mt-1 space-y-1">
                                              {generatedContent.sectionAnalysis.eligibilityCriteria.csrLearnings.map(
                                                (learning, idx) => (
                                                  <li
                                                    key={idx}
                                                    className="text-sm text-emerald-900"
                                                  >
                                                    {learning}
                                                  </li>
                                                )
                                              )}
                                            </ul>
                                          </div>
                                        )}
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              )}

                              {/* Add similar accordion items for other sections like endpoints, statisticalAnalysis, etc. */}
                            </Accordion>
                          </>
                        ) : (
                          <div className="text-center py-12 text-gray-500 italic bg-slate-50 rounded-xl border border-slate-200">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="48"
                              height="48"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mx-auto mb-3 text-slate-300"
                            >
                              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                            </svg>
                            <p>No section-by-section analysis available</p>
                            <p className="text-sm mt-2">
                              Enable "Comprehensive" analysis depth for detailed section analysis
                            </p>
                          </div>
                        )}
                      </TabsContent>
                      <TabsContent value="protocol-intelligence" className="space-y-4">
                        <EnhancedProtocolIntelligencePanel
                          protocolData={{
                            indication: indication,
                            phase: phase,
                            studyType: studyType,
                            summary: protocolSummary,
                          }}
                          analysisResults={generatedContent}
                          matchedCsrs={generatedContent.matchedCsrInsights || []}
                        />
                      </TabsContent>

                      <TabsContent value="academic-insights" className="space-y-4">
                        <AcademicInsightsPanel
                          protocolData={{
                            indication: indication,
                            phase: phase,
                            studyType: studyType,
                          }}
                          academicReferences={generatedContent.academicReferences || []}
                          therapeuticArea={indication}
                        />
                      </TabsContent>

                      <TabsContent value="references" className="space-y-4">
                        <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                          <h3 className="text-md font-semibold mb-2 text-blue-800 flex items-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2"
                            >
                              <circle cx="11" cy="11" r="8"></circle>
                              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            Similar CSRs by Therapeutic Area and Phase
                          </h3>
                          <p className="text-sm text-blue-700">
                            The following CSRs match your protocol's therapeutic area ({indication})
                            and trial phase ({phase.replace('phase', 'Phase ')})
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                          {generatedContent.matchedCsrInsights?.length > 0 ? (
                            generatedContent.matchedCsrInsights.map((csr, i) => (
                              <div
                                key={i}
                                className="p-5 border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow"
                              >
                                <h3 className="font-medium text-blue-800">{csr.title}</h3>
                                <div className="flex flex-wrap items-center gap-2 mt-2 mb-3">
                                  <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                                    Phase: {csr.phase}
                                  </span>
                                  <span className="text-xs font-medium px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full">
                                    Indication: {csr.indication}
                                  </span>
                                  {csr.therapeutic_area && (
                                    <span className="text-xs font-medium px-2 py-1 bg-emerald-100 text-emerald-800 rounded-full">
                                      Therapeutic Area: {csr.therapeutic_area}
                                    </span>
                                  )}
                                  {csr.match_score && (
                                    <span className="text-xs font-medium px-2 py-1 bg-amber-100 text-amber-800 rounded-full">
                                      Match Score: {csr.match_score}%
                                    </span>
                                  )}
                                </div>

                                <div className="mt-3 border-t border-gray-100 pt-3">
                                  <h4 className="text-sm font-medium text-gray-700 mb-1">
                                    Key Findings:
                                  </h4>
                                  <p className="text-sm text-slate-600">
                                    {csr.insight || 'No specific insights available'}
                                  </p>
                                </div>

                                {csr.suggestions && csr.suggestions.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-gray-100">
                                    <h4 className="text-sm font-medium text-gray-700 mb-1">
                                      Recommendations:
                                    </h4>
                                    <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                                      {csr.suggestions.map((suggestion: string, idx: number) => (
                                        <li key={idx}>{suggestion}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-10 text-gray-500 italic bg-slate-50 rounded-xl border border-slate-200">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="40"
                                height="40"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="mx-auto mb-3 text-slate-300"
                              >
                                <line x1="8" y1="6" x2="21" y2="6"></line>
                                <line x1="8" y1="12" x2="21" y2="12"></line>
                                <line x1="8" y1="18" x2="21" y2="18"></line>
                                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                <line x1="3" y1="18" x2="3.01" y2="18"></line>
                              </svg>
                              <p>No similar trials found</p>
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="overflow-hidden border-0 shadow-lg rounded-xl">
              <CardContent className="p-12 flex flex-col items-center justify-center text-center h-[500px] bg-gradient-to-br from-blue-50 to-indigo-50">
                <div className="rounded-full bg-white p-5 shadow-md mb-6">
                  <FileText className="h-12 w-12 text-blue-400" />
                </div>
                <h3 className="text-2xl font-semibold text-blue-800 mb-3">
                  No Optimization Results Yet
                </h3>
                <p className="text-slate-600 mt-2 max-w-md leading-relaxed">
                  Enter your protocol details in the form and click "Optimize Protocol" to receive
                  AI-powered recommendations and insights based on successful clinical study
                  reports.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-center">
                  <div className="flex items-center text-indigo-600 font-medium text-sm bg-white rounded-full py-2 px-4 shadow-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2"
                    >
                      <path d="m9 12 2 2 4-4" />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    Evidence-based suggestions
                  </div>
                  <div className="flex items-center text-emerald-600 font-medium text-sm bg-white rounded-full py-2 px-4 shadow-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2"
                    >
                      <path d="M12 2H2v10h10V2Z" />
                      <path d="M22 12h-10v10h10V12Z" />
                      <path d="M12 12H2v10h10V12Z" />
                      <path d="M22 2h-10v10h10V2Z" />
                    </svg>
                    Similar trial insights
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
