import React, { useState, useEffect, createContext, useCallback, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { 
  AlertCircle, 
  FileText, 
  TestTube, 
  Download, 
  Microscope, 
  ClipboardCheck, 
  BookCheck,
  ArrowRight,
  Check,
  Beaker,
  Target,
  Lightbulb,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { classifyTherapeuticArea } from "shared/utils/therapeutic-area-classifier";
import CSRAlignmentPanel from "@/components/CSRAlignmentPanel";
import ProtocolCorrectionSuggestions from "@/components/ProtocolCorrectionSuggestions";

// Types for CSR Context
interface CsrEfficacy {
  primary?: string[];
}

interface CsrDesign {
  control?: string;
}

interface CsrSemantic {
  design_rationale?: string;
}

interface CsrPharmacology {
  moa_explained?: string;
}

interface CsrStatsTraceability {
  primary_model?: string;
}

interface CsrMeta {
  therapeuticArea?: string;
}

interface CsrContext {
  id?: string | number;
  studyId?: string | number;
  title?: string;
  sponsor?: string;
  indication?: string;
  phase?: string;
  drugName?: string;
  details?: {
    indication?: string;
    phase?: string;
    drugName?: string;
    endpoints?: string[] | string;
  };
  efficacy?: CsrEfficacy;
  design?: CsrDesign;
  semantic?: CsrSemantic;
  pharmacology?: CsrPharmacology;
  stats_traceability?: CsrStatsTraceability;
  meta?: CsrMeta;
}

// Type for enhanced context used in API calls
interface EnhancedCsrContext {
  id?: string | number;
  title?: string;
  sponsor?: string;
  indication?: string;
  phase?: string;
  drugName?: string;
  endpoints?: string[];
  design_rationale?: string;
  moa?: string;
  primary_model?: string;
  primary_endpoint?: string;
  control_arm?: string;
}

// Type for metadata in export
interface ExportMetadata {
  csrId?: string | number;
  title?: string;
  sponsor?: string;
  indication?: string;
  phase?: string;
  molecule?: string;
}

// Type for Protocol Planning Context
interface ProtocolPlanningContextType {
  protocol: string;
  setProtocol: React.Dispatch<React.SetStateAction<string>>;
}

// Props for the component
interface ProtocolPlanningDashboardProps {
  initialProtocol?: string;
  sessionId?: string;
  persona?: string | null;
  csrContext?: CsrContext | null;
}

// Create a context to share protocol state with child components
export const ProtocolPlanningContext = createContext<ProtocolPlanningContextType>({
  protocol: "",
  setProtocol: () => {},
});

// Make the context available globally for components that need it
// Note: this is typesafe by using a declaration merging approach
declare global {
  interface Window {
    ProtocolPlanningContext: React.Context<ProtocolPlanningContextType>;
  }
}
window.ProtocolPlanningContext = ProtocolPlanningContext;

/**
 * ProtocolPlanningDashboard - Component for designing and generating clinical trial protocols
 * 
 * Features:
 * - Protocol design with CSR alignment and suggestions
 * - Generation of Statistical Analysis Plans (SAP)
 * - Generation of IND summaries for regulatory submission
 * - Protocol summaries for stakeholders
 * - PDF export functionality
 */
const ProtocolPlanningDashboard: React.FC<ProtocolPlanningDashboardProps> = ({ 
  initialProtocol = "", 
  sessionId = "adhoc", 
  persona = null,
  csrContext = null 
}) => {
  // Protocol state
  const [protocol, setProtocol] = useState<string>(initialProtocol);
  const [activeTab, setActiveTab] = useState<string>("design");
  
  // Document generation states
  const [generating, setGenerating] = useState<boolean>(false);
  const [sapContent, setSapContent] = useState<string>("");
  const [indContent, setIndContent] = useState<string>("");
  const [summaryContent, setSummaryContent] = useState<string>("");
  
  // Document readiness states
  const [sapReady, setSapReady] = useState<boolean>(false);
  const [indReady, setIndReady] = useState<boolean>(false);
  const [summaryReady, setSummaryReady] = useState<boolean>(false);
  
  // UI state
  const [exportLoading, setExportLoading] = useState<boolean>(false);
  
  // Toast notifications
  const { toast } = useToast();

  /**
   * Helper function to determine therapeutic area from indication
   */
  const getTherapeuticAreaFromIndication = useCallback((indicationText: string): string => {
    // Use the imported classifier if available
    if (typeof classifyTherapeuticArea === 'function') {
      return classifyTherapeuticArea(indicationText);
    }
    
    // Fallback classification based on common keywords
    const indicationLower = indicationText.toLowerCase();
    
    if (/cancer|oncology|tumor|carcinoma|lymphoma|leukemia|melanoma|sarcoma/.test(indicationLower)) {
      return "Oncology";
    } else if (/diabetes|insulin|glycemic|hyperglycemia/.test(indicationLower)) {
      return "Endocrinology";
    } else if (/alzheimer|dementia|parkinsons|epilepsy|seizure|neurology|multiple sclerosis|neurological/.test(indicationLower)) {
      return "Neurology";
    } else if (/cardio|heart|vascular|arterial|hypertension|cholesterol|stroke/.test(indicationLower)) {
      return "Cardiovascular";
    } else if (/depression|anxiety|bipolar|schizophrenia|psychiatric|mental health/.test(indicationLower)) {
      return "Psychiatry";
    } else if (/respiratory|asthma|copd|lung|pulmonary/.test(indicationLower)) {
      return "Respiratory";
    } else if (/inflammat|rheumatoid|arthritis|autoimmune|lupus|psoriasis/.test(indicationLower)) {
      return "Immunology";
    } else if (/infect|hiv|viral|bacteria|hepatitis|covid|antibiotic/.test(indicationLower)) {
      return "Infectious Disease";
    } else if (/gastr|crohn|ibs|colitis|bowel|intestinal/.test(indicationLower)) {
      return "Gastroenterology";
    } else if (/renal|kidney|urinary|bladder/.test(indicationLower)) {
      return "Nephrology";
    } else if (/rare disease|orphan|genetic disorder/.test(indicationLower)) {
      return "Rare Disease";
    } else if (/obesity|weight|metabolic/.test(indicationLower)) {
      return "Metabolic Disorders";
    } else if (/women|gynecology|fertility|contraception|pregnancy/.test(indicationLower)) {
      return "Women's Health";
    }
    
    return "Other";
  }, []);
  
  // Parse CSR context details for display
  const studyId = csrContext?.id || csrContext?.studyId || sessionId;
  const indication = csrContext?.indication || csrContext?.details?.indication || "";
  const phase = csrContext?.phase || csrContext?.details?.phase || "";
  const molecule = csrContext?.drugName || csrContext?.details?.drugName || "";
  const therapeuticArea = csrContext?.meta?.therapeuticArea || 
                        (indication ? getTherapeuticAreaFromIndication(indication) : "Unknown");
  
  // Extract and format endpoints from CSR context
  const endpoints: string[] = [];
  if (csrContext?.details?.endpoints) {
    if (Array.isArray(csrContext.details.endpoints)) {
      endpoints.push(...csrContext.details.endpoints);
    } else if (typeof csrContext.details.endpoints === 'string') {
      endpoints.push(csrContext.details.endpoints);
    }
  }
  
  /**
   * Generate traceability metadata from CSR context
   */
  const generateCsrMetadata = useCallback((): string => {
    if (!csrContext) return "";
    
    return `
---
Source CSR Information:
- CSR ID: ${csrContext.id || "Not specified"}
- Title: ${csrContext.title || "Not specified"}
- Sponsor: ${csrContext.sponsor || "Not specified"}
- Indication: ${indication}
- Phase: ${phase}
- Study drug: ${molecule}
${endpoints.length > 0 ? `- Original endpoints: ${endpoints.join(', ')}` : ''}
---
`;
  }, [csrContext, indication, phase, molecule, endpoints]);

  /**
   * Generate a Statistical Analysis Plan
   */
  const generateSAP = useCallback(async (): Promise<void> => {
    try {
      setGenerating(true);
      // toast call replaced
  // Original: toast({
        title: "Generating SAP...",
        description: "This may take a minute as we analyze your protocol.",
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "Generating SAP...",
        description: "This may take a minute as we analyze your protocol.",
        variant: "default"
      });
      
      const response = await fetch("/api/planner/generate-sap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          protocol,
          sessionId,
          // Include source CSR context for traceability
          csrContext: csrContext ? {
            id: csrContext.id,
            title: csrContext.title,
            sponsor: csrContext.sponsor,
            indication,
            phase,
            drugName: molecule,
            endpoints: endpoints
          } : null
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Add CSR traceability metadata to SAP
        const sapWithMetadata = data.content + "\n\n" + generateCsrMetadata();
        setSapContent(sapWithMetadata);
        setSapReady(true);
        
        // toast call replaced
  // Original: toast({
          title: "SAP Generated Successfully",
          description: "Your Statistical Analysis Plan is ready for review.",
          variant: "default"
        })
  console.log('Toast would show:', {
          title: "SAP Generated Successfully",
          description: "Your Statistical Analysis Plan is ready for review.",
          variant: "default"
        });
      } else {
        throw new Error(data.error || "Failed to generate SAP");
      }
    } catch (error: any) {
      console.error("Error generating SAP:", error);
      // toast call replaced
  // Original: toast({
        title: "Error Generating SAP",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error Generating SAP",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }, [protocol, sessionId, csrContext, indication, phase, molecule, endpoints, generateCsrMetadata, toast]);

  /**
   * Generate an IND Summary
   */
  const generateIND = useCallback(async (): Promise<void> => {
    try {
      setGenerating(true);
      // toast call replaced
  // Original: toast({
        title: "Generating IND Summary...",
        description: "This may take a minute as we analyze your protocol.",
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "Generating IND Summary...",
        description: "This may take a minute as we analyze your protocol.",
        variant: "default"
      });
      
      // Enhanced payload with detailed CSR context for better AI-driven output
      const enhancedContext: EnhancedCsrContext | null = csrContext ? {
        id: csrContext.id,
        title: csrContext.title,
        sponsor: csrContext.sponsor,
        indication,
        phase,
        drugName: molecule,
        endpoints: endpoints,
        // Include advanced semantic fields for context-aware generation
        design_rationale: csrContext.semantic?.design_rationale,
        moa: csrContext.pharmacology?.moa_explained,
        primary_model: csrContext.stats_traceability?.primary_model,
        primary_endpoint: csrContext.efficacy?.primary?.[0],
        control_arm: csrContext.design?.control
      } : null;
      
      const response = await fetch("/api/planner/generate-ind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          protocol,
          sessionId,
          // Pass enhanced CSR context for traceability and AI-guidance
          csrContext: enhancedContext
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Add CSR traceability metadata to IND
        const indWithMetadata = data.content + "\n\n" + generateCsrMetadata();
        setIndContent(indWithMetadata);
        setIndReady(true);
        
        // toast call replaced
  // Original: toast({
          title: "IND Summary Generated Successfully",
          description: "Your IND Summary is ready for review.",
          variant: "default"
        })
  console.log('Toast would show:', {
          title: "IND Summary Generated Successfully",
          description: "Your IND Summary is ready for review.",
          variant: "default"
        });
      } else {
        throw new Error(data.error || "Failed to generate IND Summary");
      }
    } catch (error: any) {
      console.error("Error generating IND Summary:", error);
      // toast call replaced
  // Original: toast({
        title: "Error Generating IND Summary",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error Generating IND Summary",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }, [protocol, sessionId, csrContext, indication, phase, molecule, endpoints, generateCsrMetadata, toast]);

  /**
   * Generate a Protocol Summary
   */
  const generateSummary = useCallback(async (): Promise<void> => {
    try {
      setGenerating(true);
      // toast call replaced
  // Original: toast({
        title: "Generating Protocol Summary...",
        description: "This may take a minute as we analyze your protocol.",
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "Generating Protocol Summary...",
        description: "This may take a minute as we analyze your protocol.",
        variant: "default"
      });
      
      // Enhanced payload with detailed CSR context for better AI-driven output
      const enhancedContext: EnhancedCsrContext | null = csrContext ? {
        id: csrContext.id,
        title: csrContext.title,
        sponsor: csrContext.sponsor,
        indication,
        phase,
        drugName: molecule,
        endpoints: endpoints,
        // Include advanced semantic fields for context-aware generation
        design_rationale: csrContext.semantic?.design_rationale,
        moa: csrContext.pharmacology?.moa_explained,
        primary_model: csrContext.stats_traceability?.primary_model,
        primary_endpoint: csrContext.efficacy?.primary?.[0],
        control_arm: csrContext.design?.control
      } : null;
      
      const response = await fetch("/api/planner/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          protocol,
          sessionId,
          // Pass enhanced CSR context for traceability and AI-guidance
          csrContext: enhancedContext
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Add CSR traceability metadata to Summary
        const summaryWithMetadata = data.content + "\n\n" + generateCsrMetadata();
        setSummaryContent(summaryWithMetadata);
        setSummaryReady(true);
        
        // toast call replaced
  // Original: toast({
          title: "Protocol Summary Generated Successfully",
          description: "Your Protocol Summary is ready for review.",
          variant: "default"
        })
  console.log('Toast would show:', {
          title: "Protocol Summary Generated Successfully",
          description: "Your Protocol Summary is ready for review.",
          variant: "default"
        });
      } else {
        throw new Error(data.error || "Failed to generate Protocol Summary");
      }
    } catch (error: any) {
      console.error("Error generating Protocol Summary:", error);
      // toast call replaced
  // Original: toast({
        title: "Error Generating Protocol Summary",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error Generating Protocol Summary",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }, [protocol, sessionId, csrContext, indication, phase, molecule, endpoints, generateCsrMetadata, toast]);
  
  /**
   * Export content to PDF
   */
  const exportToPDF = useCallback(async (content: string, type: string): Promise<void> => {
    try {
      setExportLoading(true);
      // toast call replaced
  // Original: toast({
        title: `Exporting ${type}...`,
        description: "Preparing PDF document.",
        variant: "default"
      })
  console.log('Toast would show:', {
        title: `Exporting ${type}...`,
        description: "Preparing PDF document.",
        variant: "default"
      });
      
      const response = await fetch(`/api/planner/export-${type.toLowerCase()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content,
          sessionId,
          metadata: csrContext ? {
            csrId: csrContext.id,
            title: csrContext.title,
            sponsor: csrContext.sponsor,
            indication,
            phase,
            molecule
          } : null
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to export ${type}: ${response.status} ${response.statusText}`);
      }
      
      // Create a blob from the PDF Stream
      const blob = await response.blob();
      // Create a link element, use it to download the blob and remove it
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${type.toLowerCase()}_${sessionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // toast call replaced
  // Original: toast({
        title: "Export Successful",
        description: `Your ${type} has been exported as a PDF.`,
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "Export Successful",
        description: `Your ${type} has been exported as a PDF.`,
        variant: "default"
      });
    } catch (error: any) {
      console.error(`Error exporting ${type}:`, error);
      // toast call replaced
  // Original: toast({
        title: `Error Exporting ${type}`,
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: `Error Exporting ${type}`,
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setExportLoading(false);
    }
  }, [sessionId, csrContext, indication, phase, molecule, toast]);

  /**
   * Display CSR context banner if available
   */
  const renderCsrContextBanner = useCallback((): ReactNode => {
    if (!csrContext) return null;
    
    // Check for advanced semantic fields from enhanced CSR extraction
    const hasSuggestions = csrContext?.efficacy?.primary?.length > 0 || 
                           csrContext?.design?.control || 
                           csrContext?.semantic?.design_rationale;
    
    return (
      <>
        <Card className="mb-4 border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex-1">
                <h3 className="text-sm font-medium flex items-center gap-1 text-blue-800 dark:text-blue-300">
                  <FileText className="h-4 w-4" /> Source CSR Context
                </h3>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                  This planning session is linked to CSR #{studyId}
                </p>
                
                {/* CSR metadata grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                  {molecule && (
                    <div className="flex flex-col">
                      <span className="text-xs text-blue-600 dark:text-blue-400">Study Drug</span>
                      <span className="text-sm font-medium flex items-center dark:text-blue-200">
                        <Beaker className="h-3 w-3 mr-1 text-blue-500" /> {molecule}
                      </span>
                    </div>
                  )}
                  
                  {indication && (
                    <div className="flex flex-col">
                      <span className="text-xs text-blue-600 dark:text-blue-400">Indication</span>
                      <span className="text-sm font-medium flex items-center dark:text-blue-200">
                        <Target className="h-3 w-3 mr-1 text-blue-500" /> {indication}
                      </span>
                    </div>
                  )}
                  
                  {phase && (
                    <div className="flex flex-col">
                      <span className="text-xs text-blue-600 dark:text-blue-400">Phase</span>
                      <span className="text-sm font-medium">
                        <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">
                          {phase}
                        </Badge>
                      </span>
                    </div>
                  )}
                  
                  {csrContext.sponsor && (
                    <div className="flex flex-col">
                      <span className="text-xs text-blue-600 dark:text-blue-400">Sponsor</span>
                      <span className="text-sm font-medium dark:text-blue-200">{csrContext.sponsor}</span>
                    </div>
                  )}
                </div>
                
                {/* Endpoints section */}
                {endpoints.length > 0 && (
                  <div className="mt-3">
                    <span className="text-xs text-blue-600 dark:text-blue-400">Endpoints</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {endpoints.map((endpoint, index) => (
                        <Badge 
                          key={index} 
                          variant="outline" 
                          className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 text-xs"
                        >
                          {endpoint}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col items-end gap-2">
                <Badge 
                  variant="outline" 
                  className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700"
                >
                  {therapeuticArea}
                </Badge>
                
                {hasSuggestions && (
                  <div className="text-xs text-blue-700 dark:text-blue-400 flex items-center">
                    <Lightbulb className="h-3 w-3 mr-1" /> 
                    Suggestions available from CSR analysis
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }, [csrContext, studyId, molecule, indication, phase, endpoints, therapeuticArea]);

  // Render the component
  return (
    <div className="space-y-6">
      <ProtocolPlanningContext.Provider value={{ protocol, setProtocol }}>
        {/* CSR Context Banner */}
        {renderCsrContextBanner()}
        
        <Tabs defaultValue="design" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="design" className="gap-2">
              <BookCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Protocol Design</span>
              <span className="sm:hidden">Design</span>
            </TabsTrigger>
            <TabsTrigger value="sap" className="gap-2">
              <ClipboardCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Statistical Analysis Plan</span>
              <span className="sm:hidden">SAP</span>
            </TabsTrigger>
            <TabsTrigger value="ind" className="gap-2">
              <TestTube className="h-4 w-4" />
              <span className="hidden sm:inline">IND Summary</span>
              <span className="sm:hidden">IND</span>
            </TabsTrigger>
          </TabsList>
          
          {/* Protocol Design Tab */}
          <TabsContent value="design">
            <Card>
              <CardHeader>
                <CardTitle>Protocol Design</CardTitle>
                <CardDescription>
                  Draft your clinical trial protocol, reviewing CSR alignment and suggestions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  <div className="lg:col-span-3 space-y-4">
                    <div>
                      <label htmlFor="protocol" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Protocol Text
                      </label>
                      <Textarea
                        id="protocol"
                        value={protocol}
                        onChange={(e) => setProtocol(e.target.value)}
                        placeholder="Enter your protocol text here..."
                        rows={15}
                        className="w-full"
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Start with your protocol's objectives, design, eligibility criteria, and endpoints.
                      </p>
                    </div>
                    
                    <div className="flex justify-between">
                      <Button
                        onClick={generateSAP}
                        disabled={!protocol.trim() || generating}
                        className="gap-2"
                      >
                        {generating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <ArrowRight className="h-4 w-4" />
                            Continue to SAP
                          </>
                        )}
                      </Button>
                      
                      <Button variant="outline" onClick={generateSummary}>
                        Generate Summary
                      </Button>
                    </div>
                  </div>
                  
                  <div className="lg:col-span-2 space-y-4">
                    {csrContext && (
                      <>
                        <CSRAlignmentPanel csrId={csrContext.id} protocolText={protocol} />
                        <ProtocolCorrectionSuggestions sessionId={sessionId} />
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Statistical Analysis Plan Tab */}
          <TabsContent value="sap">
            <Card>
              <CardHeader>
                <CardTitle>Statistical Analysis Plan</CardTitle>
                <CardDescription>
                  Generate and review the Statistical Analysis Plan for your protocol.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sapReady ? (
                  <>
                    <div className="mb-6">
                      <Textarea
                        value={sapContent}
                        onChange={(e) => setSapContent(e.target.value)}
                        rows={20}
                        className="font-mono text-sm"
                      />
                    </div>
                    
                    <div className="flex flex-col sm:flex-row justify-between gap-3">
                      <Button 
                        onClick={() => exportToPDF(sapContent, "SAP")}
                        disabled={exportLoading}
                        className="gap-2"
                      >
                        {exportLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Preparing...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" />
                            Export SAP as PDF
                          </>
                        )}
                      </Button>
                      
                      <div className="flex gap-3">
                        <Button 
                          variant="outline" 
                          onClick={() => setActiveTab("design")}
                          className="gap-2"
                        >
                          Back to Design
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => setActiveTab("ind")}
                          className="gap-2"
                        >
                          Go to IND Summary
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-16">
                    <ClipboardCheck className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Generate Your Statistical Analysis Plan</h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      Create a comprehensive Statistical Analysis Plan aligned with your protocol design.
                    </p>
                    <Button 
                      onClick={generateSAP}
                      disabled={!protocol.trim() || generating}
                      className="gap-2"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <ClipboardCheck className="h-4 w-4" />
                          Generate SAP
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* IND Summary Tab */}
          <TabsContent value="ind">
            <Card>
              <CardHeader>
                <CardTitle>IND Summary</CardTitle>
                <CardDescription>
                  Generate and review the IND Summary for your protocol.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {indReady ? (
                  <>
                    <div className="mb-6">
                      <Textarea
                        value={indContent}
                        onChange={(e) => setIndContent(e.target.value)}
                        rows={20}
                        className="font-mono text-sm"
                      />
                    </div>
                    
                    <div className="flex flex-col sm:flex-row justify-between gap-3">
                      <Button 
                        onClick={() => exportToPDF(indContent, "IND")}
                        disabled={exportLoading}
                        className="gap-2"
                      >
                        {exportLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Preparing...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" />
                            Export IND as PDF
                          </>
                        )}
                      </Button>
                      
                      <div className="flex gap-3">
                        <Button 
                          variant="outline" 
                          onClick={() => setActiveTab("sap")}
                          className="gap-2"
                        >
                          Back to SAP
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => setActiveTab("design")}
                          className="gap-2"
                        >
                          Back to Design
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-16">
                    <Microscope className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Generate Your IND Summary</h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      Create a comprehensive IND summary with protocol design elements formatted for regulatory submission.
                    </p>
                    <Button 
                      onClick={generateIND}
                      disabled={!protocol.trim() || generating}
                      className="gap-2"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <TestTube className="h-4 w-4" />
                          Generate IND Summary
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </ProtocolPlanningContext.Provider>
    </div>
  );
};

export default ProtocolPlanningDashboard;