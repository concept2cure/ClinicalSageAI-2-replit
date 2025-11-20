import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { FileUp, FileText, Save, FileDown, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Form schema for direct parameter entry
const formSchema = z.object({
  protocol_id: z.string().min(2, "Protocol ID must be at least 2 characters"),
  indication: z.string().min(1, "Indication is required"),
  phase: z.string().min(1, "Phase is required"),
  sample_size: z.coerce.number().min(1, "Sample size must be at least 1"),
  duration_weeks: z.coerce.number().min(1, "Duration must be at least 1 week"),
  dropout_rate: z.coerce.number().min(0, "Dropout rate must be at least 0").max(100, "Dropout rate must be at most 100"),
  primary_endpoint: z.string().optional(),
  study_design: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// Result of protocol analysis
interface ProtocolAnalysisResult {
  extracted_data: {
    title: string;
    phase: string;
    indication: string;
    sample_size: number;
    duration_weeks: number;
    dropout_rate: number;
    primary_endpoints: string[];
    secondary_endpoints?: string[];
    study_design?: string;
    arms?: string[];
    blinding?: string;
  };
  risk_flags: {
    underpowered: boolean;
    endpoint_risk: boolean;
    duration_mismatch: boolean;
    high_dropout: boolean;
    design_issues: boolean;
    innovative_approach: boolean;
  };
  risk_scores: {
    success_probability: number;
    dropout_risk: number;
    regulatory_alignment: number;
    innovation_index: number;
    competitive_edge: number;
  };
  csr_benchmarks?: {
    median_sample_size: number;
    sample_size_range: [number, number];
    median_duration: string;
    duration_range: [number, number];
    success_rate: number;
    average_dropout_rate: number;
  };
  strategic_insights: string[];
  recommendation_summary: string;
}

export default function TrialSuccessPredictorV2() {
  const [protocolText, setProtocolText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<ProtocolAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [savingToDossier, setSavingToDossier] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Define the form using react-hook-form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      protocol_id: `TS-${Math.floor(Math.random() * 10000)}`,
      indication: "",
      phase: "",
      sample_size: 200,
      duration_weeks: 24,
      dropout_rate: 15,
      primary_endpoint: "",
      study_design: "",
    },
  });

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      
      // Read file contents if it's a text file
      if (file.type === "text/plain") {
        const reader = new FileReader();
        reader.onload = (event) => {
          setProtocolText(event.target?.result as string || "");
        };
        reader.readAsText(file);
      }
      
      // toast call replaced
  // Original: toast({
        title: "File uploaded",
        description: `${file.name} (${Math.round(file.size / 1024)
  console.log('Toast would show:', {
        title: "File uploaded",
        description: `${file.name} (${Math.round(file.size / 1024)} KB) has been uploaded.`,
      });
    }
  };

  // Handle form submission
  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      // Convert dropout rate from percentage to decimal
      const data = {
        ...values,
        dropout_rate: values.dropout_rate / 100
      };

      const response = await apiRequest("POST", "/api/protocol/analyze", data);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || "Failed to analyze protocol");
      }
      
      setAnalysisResult(result);
    } catch (error) {
      console.error("Error analyzing protocol:", error);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to analyze protocol",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to analyze protocol",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle protocol text analysis
  const analyzeProtocolText = async () => {
    if (!protocolText.trim() && !uploadedFile) {
      // toast call replaced
  // Original: toast({
        title: "Input required",
        description: "Please paste protocol text or upload a file",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Input required",
        description: "Please paste protocol text or upload a file",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      let formData = new FormData();
      
      if (uploadedFile) {
        formData.append("file", uploadedFile);
      } else {
        formData.append("text", protocolText);
      }
      
      formData.append("protocol_id", `TS-${Math.floor(Math.random() * 10000)}`);

      const response = await fetch("/api/protocol/full-analyze", {
        method: "POST",
        body: formData,
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || "Failed to analyze protocol");
      }
      
      setAnalysisResult(result);

      // Pre-fill the form with extracted data
      if (result.extracted_data) {
        form.reset({
          protocol_id: result.extracted_data.protocol_id || form.getValues("protocol_id"),
          indication: result.extracted_data.indication || "",
          phase: result.extracted_data.phase || "",
          sample_size: result.extracted_data.sample_size || 200,
          duration_weeks: result.extracted_data.duration_weeks || 24,
          dropout_rate: result.extracted_data.dropout_rate ? result.extracted_data.dropout_rate * 100 : 15,
          primary_endpoint: result.extracted_data.primary_endpoints?.[0] || "",
          study_design: result.extracted_data.study_design || "",
        });
      }
    } catch (error) {
      console.error("Error analyzing protocol text:", error);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to analyze protocol text",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to analyze protocol text",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Export PDF report
  const exportPdfReport = async () => {
    if (!analysisResult) return;
    
    setExportLoading(true);
    try {
      const protocolId = form.getValues("protocol_id");
      
      // Enhanced report data with all necessary information for generating comprehensive recommendations
      const reportData = {
        protocol_id: protocolId,
        prediction: analysisResult.risk_scores.success_probability,
        parsed: {
          // Complete protocol information for analysis
          indication: analysisResult.extracted_data.indication,
          phase: analysisResult.extracted_data.phase,
          sample_size: analysisResult.extracted_data.sample_size,
          duration_weeks: analysisResult.extracted_data.duration_weeks,
          dropout_rate: analysisResult.extracted_data.dropout_rate,
          primary_endpoint: analysisResult.extracted_data.primary_endpoints?.[0] || "",
          secondary_endpoints: analysisResult.extracted_data.secondary_endpoints || [],
          study_design: analysisResult.extracted_data.study_design || "",
          arms: analysisResult.extracted_data.arms || [],
          blinding: analysisResult.extracted_data.blinding || ""
        },
        benchmarks: analysisResult.csr_benchmarks,
        risk_flags: analysisResult.risk_flags,
        risk_scores: analysisResult.risk_scores, // Include all risk scores for multi-dimensional analysis
        strategic_insights: analysisResult.strategic_insights,
        recommendation_summary: analysisResult.recommendation_summary || "",
        session_id: `session-${Date.now()}` // Add session tracking for future reference
      };
      
      const response = await apiRequest("POST", "/api/export/intelligence-report", reportData);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate PDF report");
      }
      
      // Get the PDF file as a blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create a link and trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = `Trial_Intelligence_Report_${protocolId}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // toast call replaced
  // Original: toast({
        title: "Report exported",
        description: "PDF report has been generated and downloaded",
      })
  console.log('Toast would show:', {
        title: "Report exported",
        description: "PDF report has been generated and downloaded",
      });
    } catch (error) {
      console.error("Error exporting PDF:", error);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to export PDF report",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to export PDF report",
        variant: "destructive",
      });
    } finally {
      setExportLoading(false);
    }
  };

  // Save to dossier
  const saveToDossier = async () => {
    if (!analysisResult) return;
    
    setSavingToDossier(true);
    try {
      const protocolId = form.getValues("protocol_id");
      
      const dossierData = {
        protocol_id: protocolId,
        report_data: {
          parsed: {
            indication: analysisResult.extracted_data.indication,
            phase: analysisResult.extracted_data.phase,
            sample_size: analysisResult.extracted_data.sample_size,
            duration_weeks: analysisResult.extracted_data.duration_weeks,
            dropout_rate: analysisResult.extracted_data.dropout_rate,
            primary_endpoints: analysisResult.extracted_data.primary_endpoints || [],
          },
          prediction: analysisResult.risk_scores.success_probability,
          benchmarks: {
            avg_sample_size: analysisResult.csr_benchmarks?.median_sample_size || 0,
            avg_duration: analysisResult.csr_benchmarks?.median_duration || "0 weeks",
            avg_dropout: analysisResult.csr_benchmarks?.average_dropout_rate || 0,
            total_trials: analysisResult.csr_benchmarks?.success_rate || 0,
            success_rate: analysisResult.csr_benchmarks?.success_rate || 0,
          },
          risk_flags: analysisResult.risk_flags,
          strategic_insights: analysisResult.strategic_insights,
        },
        username: "default" // This would normally come from auth context
      };
      
      const response = await apiRequest("POST", "/api/dossier/save-protocol", dossierData);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save to dossier");
      }
      
      // toast call replaced
  // Original: toast({
        title: "Saved to dossier",
        description: "Report has been saved to your protocol dossier",
      })
  console.log('Toast would show:', {
        title: "Saved to dossier",
        description: "Report has been saved to your protocol dossier",
      });
    } catch (error) {
      console.error("Error saving to dossier:", error);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save to dossier",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save to dossier",
        variant: "destructive",
      });
    } finally {
      setSavingToDossier(false);
    }
  };

  const getRiskColor = (flag: boolean) => {
    return flag ? "destructive" : "success";
  };

  const getBenchmarkStatus = (current: number, benchmark: number, higher_is_better = true) => {
    const threshold = 0.1; // 10% difference threshold
    const ratio = current / benchmark;
    
    if (higher_is_better) {
      if (ratio < 1 - threshold) return "destructive";
      if (ratio > 1 + threshold) return "success";
      return "warning";
    } else {
      if (ratio > 1 + threshold) return "destructive";
      if (ratio < 1 - threshold) return "success";
      return "warning";
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">Upload/Paste Protocol</TabsTrigger>
          <TabsTrigger value="manual">Manual Parameters</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload or Paste Protocol</CardTitle>
              <CardDescription>
                Upload a protocol document or paste text to automatically extract parameters and analyze success likelihood.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept=".pdf,.docx,.txt" 
                  onChange={handleFileChange}
                />
                <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                  <FileUp className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-medium mb-2">
                  {uploadedFile ? uploadedFile.name : 'Drag & drop your protocol or click to browse'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {uploadedFile
                    ? `${(uploadedFile.size / 1024).toFixed(1)} KB - ${uploadedFile.type}`
                    : 'PDF, DOCX, or TXT files. Or paste text below.'}
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Or paste protocol text</div>
                <Textarea
                  placeholder="Paste your protocol or study design summary here..."
                  value={protocolText}
                  onChange={(e) => setProtocolText(e.target.value)}
                  rows={10}
                />
                <p className="text-sm text-muted-foreground">
                  Paste the protocol text or study design summary for automatic parameter extraction.
                </p>
              </div>

              <Button 
                onClick={analyzeProtocolText} 
                disabled={loading}
                className="w-full"
              >
                {loading ? "Analyzing..." : "Analyze Protocol"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Manual Parameter Entry</CardTitle>
              <CardDescription>
                Enter trial parameters manually to predict the likelihood of success.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="protocol_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Protocol ID</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter protocol ID" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="indication"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Indication</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Obesity, Diabetes" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="phase"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phase</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Phase 2" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="sample_size"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sample Size</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="duration_weeks"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Duration (weeks)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="dropout_rate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Dropout Rate (%)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="primary_endpoint"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Primary Endpoint</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., BMI reduction ≥5%" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="study_design"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Study Design</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Randomized, double-blind" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <Button type="submit" disabled={loading}>
                    {loading ? "Analyzing..." : "Analyze Parameters"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {analysisResult && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Live Extracted Parameters</CardTitle>
              <CardDescription>
                Parameters extracted from your protocol
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Phase</span>
                    <span className="font-medium">{analysisResult.extracted_data.phase}</span>
                  </div>
                  <Separator />
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Sample Size</span>
                    <span className="font-medium">{analysisResult.extracted_data.sample_size}</span>
                  </div>
                  <Separator />
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Duration</span>
                    <span className="font-medium">{analysisResult.extracted_data.duration_weeks} weeks</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Indication</span>
                    <span className="font-medium">{analysisResult.extracted_data.indication}</span>
                  </div>
                  <Separator />
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Dropout Rate</span>
                    <span className="font-medium">{(analysisResult.extracted_data.dropout_rate * 100).toFixed(1)}%</span>
                  </div>
                  <Separator />
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Primary Endpoint</span>
                    <span className="font-medium truncate max-w-[200px]">
                      {analysisResult.extracted_data.primary_endpoints?.[0] || "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI Success Prediction</CardTitle>
              <CardDescription>
                Machine learning prediction based on trial parameters and CSR analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-medium">Predicted Success:</span>
                  <span className="text-2xl font-bold text-primary">
                    {(analysisResult.risk_scores.success_probability * 100).toFixed(1)}%
                  </span>
                </div>
                
                <div className="space-y-2">
                  <span className="text-lg font-medium">Risk Flags:</span>
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.risk_flags.underpowered && (
                      <Badge variant="destructive">🔻 Sample Size Low</Badge>
                    )}
                    {analysisResult.risk_flags.endpoint_risk && (
                      <Badge variant="destructive">🔻 Endpoint Risk</Badge>
                    )}
                    {analysisResult.risk_flags.duration_mismatch && (
                      <Badge variant="destructive">🔻 Duration Mismatch</Badge>
                    )}
                    {analysisResult.risk_flags.high_dropout && (
                      <Badge variant="warning">🟡 Dropout Estimate Aggressive</Badge>
                    )}
                    {analysisResult.risk_flags.design_issues && (
                      <Badge variant="warning">🟡 Design Concerns</Badge>
                    )}
                    {analysisResult.risk_flags.innovative_approach && (
                      <Badge variant="outline">💡 Innovative Approach</Badge>
                    )}
                    {!Object.values(analysisResult.risk_flags).some(flag => flag) && (
                      <Badge variant="success">✅ No Major Risks Detected</Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {analysisResult.csr_benchmarks && (
            <Card>
              <CardHeader>
                <CardTitle>CSR Benchmark Comparison</CardTitle>
                <CardDescription>
                  How your protocol compares to similar CSRs in our database
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-2 font-medium">
                    <div>Metric</div>
                    <div>Your Protocol</div>
                    <div>CSR Median</div>
                    <div>Status</div>
                  </div>
                  
                  <Separator />
                  
                  <div className="grid grid-cols-4 gap-2">
                    <div>Sample Size</div>
                    <div>{analysisResult.extracted_data.sample_size}</div>
                    <div>{analysisResult.csr_benchmarks.median_sample_size}</div>
                    <div>
                      <Badge variant={getBenchmarkStatus(
                        analysisResult.extracted_data.sample_size,
                        analysisResult.csr_benchmarks.median_sample_size,
                        true
                      )}>
                        {analysisResult.extracted_data.sample_size < analysisResult.csr_benchmarks.median_sample_size ? "🔴" :
                         analysisResult.extracted_data.sample_size > analysisResult.csr_benchmarks.median_sample_size ? "🟢" : "🟡"}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2">
                    <div>Duration</div>
                    <div>{analysisResult.extracted_data.duration_weeks}w</div>
                    <div>{analysisResult.csr_benchmarks.median_duration}</div>
                    <div>
                      <Badge variant={getBenchmarkStatus(
                        analysisResult.extracted_data.duration_weeks,
                        parseInt(analysisResult.csr_benchmarks.median_duration),
                        false
                      )}>
                        {analysisResult.extracted_data.duration_weeks > parseInt(analysisResult.csr_benchmarks.median_duration) * 1.1 ? "🔴" :
                         analysisResult.extracted_data.duration_weeks < parseInt(analysisResult.csr_benchmarks.median_duration) * 0.9 ? "🟢" : "🟡"}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2">
                    <div>Dropout</div>
                    <div>{(analysisResult.extracted_data.dropout_rate * 100).toFixed(1)}%</div>
                    <div>{(analysisResult.csr_benchmarks.average_dropout_rate * 100).toFixed(1)}%</div>
                    <div>
                      <Badge variant={getBenchmarkStatus(
                        analysisResult.extracted_data.dropout_rate,
                        analysisResult.csr_benchmarks.average_dropout_rate,
                        false
                      )}>
                        {analysisResult.extracted_data.dropout_rate < analysisResult.csr_benchmarks.average_dropout_rate ? "🟢" :
                         analysisResult.extracted_data.dropout_rate > analysisResult.csr_benchmarks.average_dropout_rate * 1.2 ? "🔴" : "🟡"}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2">
                    <div>Endpoint</div>
                    <div className="truncate">{analysisResult.extracted_data.primary_endpoints?.[0]}</div>
                    <div>-</div>
                    <div>
                      <Badge variant={analysisResult.risk_flags.endpoint_risk ? "destructive" : "success"}>
                        {analysisResult.risk_flags.endpoint_risk ? "🔴" : "🟢"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Strategic Insights</CardTitle>
              <CardDescription>
                AI-powered recommendations to improve trial success
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 list-disc pl-5">
                {analysisResult.strategic_insights.map((insight, index) => (
                  <li key={index}>{insight}</li>
                ))}
              </ul>
              
              <div className="mt-4 pt-4 border-t">
                <p className="font-medium">Recommendation Summary:</p>
                <p className="mt-1">{analysisResult.recommendation_summary}</p>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={saveToDossier}
                disabled={savingToDossier}
              >
                <Save className="h-4 w-4" />
                {savingToDossier ? "Saving..." : "Save to Dossier"}
              </Button>
              
              <Button
                className="flex items-center gap-2"
                onClick={exportPdfReport}
                disabled={exportLoading}
              >
                <FileDown className="h-4 w-4" />
                {exportLoading ? "Generating..." : "Export Full Intelligence Report"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}