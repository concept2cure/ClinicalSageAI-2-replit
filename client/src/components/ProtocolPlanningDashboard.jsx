import { useState, useEffect, createContext } from "react";
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
  Lightbulb
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
// Temporarily commented out for landing page development
// import { classifyTherapeuticArea } from "shared/utils/therapeutic-area-classifier";
import CSRAlignmentPanel from "@/components/CSRAlignmentPanel";
import ProtocolCorrectionSuggestions from "@/components/ProtocolCorrectionSuggestions";

// Create a context to share protocol state with child components
export const ProtocolPlanningContext = createContext({
  protocol: "",
  setProtocol: () => {},
});

// Make the context available globally for components that need it
window.ProtocolPlanningContext = ProtocolPlanningContext;

export default function ProtocolPlanningDashboard({ 
  initialProtocol = "", 
  sessionId = "adhoc", 
  persona = null,
  csrContext = null 
}) {
  const [protocol, setProtocol] = useState(initialProtocol);
  const [activeTab, setActiveTab] = useState("design");
  const [generating, setGenerating] = useState(false);
  const [sapContent, setSapContent] = useState("");
  const [indContent, setIndContent] = useState("");
  const [summaryContent, setSummaryContent] = useState("");
  const [sapReady, setSapReady] = useState(false);
  const [indReady, setIndReady] = useState(false);
  const [summaryReady, setSummaryReady] = useState(false);
  const { toast } = useToast();

  // Helper function to determine therapeutic area from indication
  const getTherapeuticAreaFromIndication = (indicationText) => {
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
  };
  
  // Parse CSR context details for display
  const studyId = csrContext?.id || csrContext?.studyId || sessionId;
  const indication = csrContext?.indication || csrContext?.details?.indication || "";
  const phase = csrContext?.phase || csrContext?.details?.phase || "";
  const molecule = csrContext?.drugName || csrContext?.details?.drugName || "";
  const therapeuticArea = csrContext?.meta?.therapeuticArea || 
                          (indication ? getTherapeuticAreaFromIndication(indication) : "Unknown");
  
  // Extract and format endpoints from CSR context
  const endpoints = [];
  if (csrContext?.details?.endpoints) {
    if (Array.isArray(csrContext.details.endpoints)) {
      endpoints.push(...csrContext.details.endpoints);
    } else if (typeof csrContext.details.endpoints === 'string') {
      endpoints.push(csrContext.details.endpoints);
    }
  }
  
  // Generate traceability metadata from CSR context
  const generateCsrMetadata = () => {
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
  };

  const generateSAP = async () => {
    try {
      setGenerating(true);
      // toast call replaced
  // Original: toast({
        title: "Generating SAP...",
        description: "This may take a minute as we analyze your protocol.",
      })
  console.log('Toast would show:', {
        title: "Generating SAP...",
        description: "This may take a minute as we analyze your protocol.",
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
        })
  console.log('Toast would show:', {
          title: "SAP Generated Successfully",
          description: "Your Statistical Analysis Plan is ready for review.",
        });
      } else {
        throw new Error(data.error || "Failed to generate SAP");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Error Generating SAP",
        description: error.message,
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error Generating SAP",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const generateIND = async () => {
    try {
      setGenerating(true);
      // toast call replaced
  // Original: toast({
        title: "Generating IND Summary...",
        description: "This may take a minute as we analyze your protocol.",
      })
  console.log('Toast would show:', {
        title: "Generating IND Summary...",
        description: "This may take a minute as we analyze your protocol.",
      });
      
      // Enhanced payload with detailed CSR context for better AI-driven output
      const enhancedContext = csrContext ? {
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
        })
  console.log('Toast would show:', {
          title: "IND Summary Generated Successfully",
          description: "Your IND Summary is ready for review.",
        });
      } else {
        throw new Error(data.error || "Failed to generate IND Summary");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Error Generating IND Summary",
        description: error.message,
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error Generating IND Summary",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const generateSummary = async () => {
    try {
      setGenerating(true);
      // toast call replaced
  // Original: toast({
        title: "Generating Protocol Summary...",
        description: "This may take a minute as we analyze your protocol.",
      })
  console.log('Toast would show:', {
        title: "Generating Protocol Summary...",
        description: "This may take a minute as we analyze your protocol.",
      });
      
      // Enhanced payload with detailed CSR context for better AI-driven output
      const enhancedContext = csrContext ? {
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
        })
  console.log('Toast would show:', {
          title: "Protocol Summary Generated Successfully",
          description: "Your Protocol Summary is ready for review.",
        });
      } else {
        throw new Error(data.error || "Failed to generate Protocol Summary");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Error Generating Protocol Summary",
        description: error.message,
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error Generating Protocol Summary",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };
  
  const exportToPDF = async (content, type) => {
    try {
      // toast call replaced
  // Original: toast({
        title: `Exporting ${type}...`,
        description: "Preparing PDF document.",
      })
  console.log('Toast would show:', {
        title: `Exporting ${type}...`,
        description: "Preparing PDF document.",
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
        throw new Error(`Failed to export ${type}`);
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
      })
  console.log('Toast would show:', {
        title: "Export Successful",
        description: `Your ${type} has been exported as a PDF.`,
      });
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: `Error Exporting ${type}`,
        description: error.message,
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: `Error Exporting ${type}`,
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Display CSR context banner if available
  const renderCsrContextBanner = () => {
    if (!csrContext) return null;
    
    // Check for advanced semantic fields from enhanced CSR extraction
    const hasSuggestions = csrContext?.efficacy?.primary?.length > 0 || 
                           csrContext?.design?.control || 
                           csrContext?.semantic?.design_rationale;
    
    return (
      <>
        <Card className="mb-4 border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex-1">
                <h3 className="text-sm font-medium flex items-center gap-1 text-blue-800">
                  <FileText className="h-4 w-4" /> Source CSR Context
                </h3>
                <p className="text-xs text-blue-700 mt-1">
                  This planning session is linked to CSR #{studyId}
                </p>
                
                {/* CSR metadata grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                  {molecule && (
                    <div className="flex flex-col">
                      <span className="text-xs text-blue-600">Study Drug</span>
                      <span className="text-sm font-medium flex items-center">
                        <Beaker className="h-3 w-3 mr-1 text-blue-500" /> {molecule}
                      </span>
                    </div>
                  )}
                  
                  {indication && (
                    <div className="flex flex-col">
                      <span className="text-xs text-blue-600">Indication</span>
                      <span className="text-sm font-medium flex items-center">
                        <Target className="h-3 w-3 mr-1 text-blue-500" /> {indication}
                      </span>
                    </div>
                  )}
                  
                  {phase && (
                    <div className="flex flex-col">
                      <span className="text-xs text-blue-600">Phase</span>
                      <span className="text-sm font-medium">
                        <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">
                          {phase}
                        </Badge>
                      </span>
                    </div>
                  )}
                  
                  {csrContext.sponsor && (
                    <div className="flex flex-col">
                      <span className="text-xs text-blue-600">Sponsor</span>
                      <span className="text-sm font-medium">{csrContext.sponsor}</span>
                    </div>
                  )}
                </div>
                
                {/* Endpoints section */}
                {endpoints.length > 0 && (
                  <div className="mt-3">
                    <span className="text-xs text-blue-600">Endpoints</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {endpoints.map((endpoint, index) => (
                        <Badge 
                          key={index} 
                          variant="outline" 
                          className="bg-blue-100 text-blue-700 border-blue-200 text-xs"
                        >
                          {endpoint}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col items-end gap-2">
                <span className="text-xs text-blue-600">Traceability</span>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-green-700">All outputs will reference source CSR</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* AI Suggestions Banner from CSR Context */}
        {hasSuggestions && (
          <div className="border-l-4 border-blue-400 bg-blue-50 p-4 mb-6 rounded-md">
            <h3 className="text-sm font-semibold text-blue-900 mb-1 flex items-center">
              <Lightbulb className="h-4 w-4 mr-1 text-blue-700" />
              📌 AI Suggestions from CSR Context
            </h3>
            <ul className="text-sm text-blue-800 list-disc pl-5 space-y-1">
              {csrContext?.efficacy?.primary?.length > 0 && (
                <li><strong>Primary Endpoint:</strong> {csrContext.efficacy.primary[0]}</li>
              )}
              {csrContext?.design?.control && (
                <li><strong>Control Arm:</strong> {csrContext.design.control}</li>
              )}
              {csrContext?.semantic?.design_rationale && (
                <li><strong>Design Rationale:</strong> {csrContext.semantic.design_rationale}</li>
              )}
              {csrContext?.stats_traceability?.primary_model && (
                <li><strong>Statistical Approach:</strong> {csrContext.stats_traceability.primary_model}</li>
              )}
              {csrContext?.pharmacology?.moa_explained && (
                <li><strong>Mechanism of Action:</strong> {csrContext.pharmacology.moa_explained}</li>
              )}
            </ul>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Protocol Planning Dashboard</h1>
      
      {/* CSR Context Banner */}
      {renderCsrContextBanner()}
      
      {/* CSR Semantic Alignment Panel */}
      {csrContext && <CSRAlignmentPanel sessionId={sessionId} />}
      
      {/* Protocol Correction Suggestions */}
      {csrContext && <ProtocolCorrectionSuggestions sessionId={sessionId} />}
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 mb-6">
          <TabsTrigger value="design" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Protocol Design</span>
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            <span>Protocol Summary</span>
            {summaryReady && <Badge variant="outline" className="ml-2 bg-green-100 text-green-700 border-green-200">Ready</Badge>}
          </TabsTrigger>
          <TabsTrigger value="sap" className="flex items-center gap-2">
            <BookCheck className="h-4 w-4" />
            <span>SAP</span>
            {sapReady && <Badge variant="outline" className="ml-2 bg-green-100 text-green-700 border-green-200">Ready</Badge>}
          </TabsTrigger>
          <TabsTrigger value="ind" className="flex items-center gap-2">
            <TestTube className="h-4 w-4" />
            <span>IND Summary</span>
            {indReady && <Badge variant="outline" className="ml-2 bg-green-100 text-green-700 border-green-200">Ready</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="design">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Protocol Design Editor
              </CardTitle>
              <CardDescription>
                Write or paste your protocol design details below. You can then generate associated documents.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                placeholder="Enter protocol design details here..."
                className="min-h-[400px] font-mono text-sm"
              />
              
              <div className="flex justify-between mt-6">
                <div className="flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2 text-amber-500" />
                  <span className="text-sm text-muted-foreground">
                    Include study population, primary &amp; secondary endpoints, and dosing regimen.
                  </span>
                </div>
                
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => generateSummary()} 
                    disabled={!protocol.trim() || generating}
                    className="gap-2"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    Generate Summary
                  </Button>
                  <Button 
                    onClick={() => {
                      setActiveTab("summary");
                      generateSummary();
                    }} 
                    disabled={!protocol.trim() || generating}
                    className="gap-2"
                  >
                    <ArrowRight className="h-4 w-4" />
                    Continue
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                Protocol Summary
              </CardTitle>
              <CardDescription>
                Generate a comprehensive summary of your protocol design.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summaryReady ? (
                <>
                  <Textarea
                    value={summaryContent}
                    onChange={(e) => setSummaryContent(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                    readOnly
                  />
                  
                  <div className="flex justify-between mt-6">
                    <Button 
                      variant="outline" 
                      onClick={() => exportToPDF(summaryContent, "Summary")}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Export as PDF
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
                        onClick={() => {
                          setActiveTab("sap");
                          if (!sapReady) generateSAP();
                        }}
                        className="gap-2"
                      >
                        <ArrowRight className="h-4 w-4" />
                        Continue to SAP
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-16">
                  <Microscope className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Generate Your Protocol Summary</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Create a detailed summary of your protocol to share with stakeholders or use for regulatory submission.
                  </p>
                  <Button 
                    onClick={generateSummary}
                    disabled={!protocol.trim() || generating}
                    className="gap-2"
                  >
                    {generating ? (
                      <>Generating...</>
                    ) : (
                      <>
                        <ClipboardCheck className="h-4 w-4" />
                        Generate Protocol Summary
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sap">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookCheck className="h-5 w-5" />
                Statistical Analysis Plan (SAP)
              </CardTitle>
              <CardDescription>
                Generate a comprehensive statistical analysis plan for your protocol.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sapReady ? (
                <>
                  <Textarea
                    value={sapContent}
                    onChange={(e) => setSapContent(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                    readOnly
                  />
                  
                  <div className="flex justify-between mt-6">
                    <Button 
                      variant="outline" 
                      onClick={() => exportToPDF(sapContent, "SAP")}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Export as PDF
                    </Button>
                    
                    <div className="flex gap-3">
                      <Button 
                        variant="outline" 
                        onClick={() => setActiveTab("summary")}
                        className="gap-2"
                      >
                        Back to Summary
                      </Button>
                      <Button 
                        onClick={() => {
                          setActiveTab("ind");
                          if (!indReady) generateIND();
                        }}
                        className="gap-2"
                      >
                        <ArrowRight className="h-4 w-4" />
                        Continue to IND
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-16">
                  <Microscope className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Generate Your Statistical Analysis Plan</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Create a comprehensive SAP with statistical methods, sample size calculations, and analysis strategies.
                  </p>
                  <Button 
                    onClick={generateSAP}
                    disabled={!protocol.trim() || generating}
                    className="gap-2"
                  >
                    {generating ? (
                      <>Generating...</>
                    ) : (
                      <>
                        <BookCheck className="h-4 w-4" />
                        Generate SAP
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ind">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                IND Summary
              </CardTitle>
              <CardDescription>
                Generate a detailed Investigational New Drug (IND) application summary.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {indReady ? (
                <>
                  <Textarea
                    value={indContent}
                    onChange={(e) => setIndContent(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                    readOnly
                  />
                  
                  <div className="flex justify-between mt-6">
                    <Button 
                      variant="outline" 
                      onClick={() => exportToPDF(indContent, "IND")}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Export as PDF
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
                      <>Generating...</>
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
    </div>
  );
}