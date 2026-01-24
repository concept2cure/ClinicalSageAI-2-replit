import React, { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis
} from "recharts";
import {
  FileText,
  Microscope,
  BarChart2,
  PieChart as PieChartIcon,
  ChartBar,
  BookOpen,
  Download,
  Share,
  AlertCircle,
  Beaker,
  Target,
  ArrowUpRight,
  Clock,
  Users,
  TrendingUp,
  Layers,
  CheckCircle,
  ArrowDownRight,
  FileCheck,
  ExternalLink,
  LineChart as LineChartIcon,
  BellDot,
  Sparkles,
  Award,
  Brain,
  Lightbulb,
  Dna,
  Upload,
  FileUp,
  Loader2,
  UploadCloud,
  Info,
  File,
  Lock
} from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";

// Custom insight card component
const InsightCard = ({ 
  title, 
  description, 
  impact, 
  category,
  evidence,
  recommendation,
  confidence
}: { 
  title: string, 
  description: string, 
  impact: "high" | "medium" | "low",
  category: "clinical" | "operational" | "regulatory" | "competitive",
  evidence: string,
  recommendation: string,
  confidence: number
}) => {
  const [expanded, setExpanded] = useState(false);

  // Determine styling based on category
  const getCategoryStyles = () => {
    switch (category) {
      case "clinical":
        return {
          bgColor: "bg-blue-50",
          border: "border-blue-200",
          iconColor: "text-blue-600",
          icon: <Microscope className="h-5 w-5" />
        };
      case "operational":
        return {
          bgColor: "bg-green-50",
          border: "border-green-200",
          iconColor: "text-green-600",
          icon: <BarChart2 className="h-5 w-5" />
        };
      case "regulatory":
        return {
          bgColor: "bg-purple-50",
          border: "border-purple-200",
          iconColor: "text-purple-600",
          icon: <FileCheck className="h-5 w-5" />
        };
      case "competitive":
        return {
          bgColor: "bg-amber-50",
          border: "border-amber-200",
          iconColor: "text-amber-600",
          icon: <Target className="h-5 w-5" />
        };
      default:
        return {
          bgColor: "bg-slate-50",
          border: "border-slate-200",
          iconColor: "text-slate-600",
          icon: <Lightbulb className="h-5 w-5" />
        };
    }
  };

  // Determine styling based on impact
  const getImpactColor = () => {
    switch (impact) {
      case "high":
        return "bg-red-100 text-red-800 border-red-200";
      case "medium":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  const categoryStyles = getCategoryStyles();
  const impactColor = getImpactColor();
  
  return (
    <Card className={`${categoryStyles.bgColor} border ${categoryStyles.border} hover:shadow-md transition-all duration-200`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-full bg-white ${categoryStyles.border}`}>
              {categoryStyles.icon}
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <div className="flex gap-2">
            <Badge className={impactColor}>
              {impact.charAt(0).toUpperCase() + impact.slice(1)} Impact
            </Badge>
            <Badge variant="outline" className="bg-white">
              {Math.round(confidence * 100)}% Confidence
            </Badge>
          </div>
        </div>
        <CardDescription className="mt-2">
          {description}
        </CardDescription>
      </CardHeader>
      
      {expanded && (
        <CardContent className="pb-2 pt-0">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium mb-1">Evidence:</h4>
              <p className="text-sm text-slate-600">{evidence}</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium mb-1">Recommendation:</h4>
              <p className="text-sm text-slate-600">{recommendation}</p>
            </div>
          </div>
        </CardContent>
      )}
      
      <CardFooter className="pt-0">
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-xs hover:bg-white/50"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show Less" : "Show More"}
        </Button>
      </CardFooter>
    </Card>
  );
};

// Document Upload Form Component
const DocumentUploadForm = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // Form schema with Zod validation
  const formSchema = z.object({
    projectName: z.string().min(2, "Project name is required"),
    documentType: z.string().min(1, "Document type is required"),
    therapeuticArea: z.string().min(1, "Therapeutic area is required"),
    phase: z.string().optional(),
    description: z.string().optional(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectName: "",
      documentType: "",
      therapeuticArea: "",
      phase: "",
      description: "",
    },
  });

  // Simulate a file upload with progress
  const simulateUpload = () => {
    if (fileInputRef.current?.files?.length === 0) {
      // toast call replaced
  // Original: toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setProgress(0);
    
    // Simulate progress updates
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setUploading(false);
          setUploadSuccess(true);
          return 100;
        }
        return prev + 5;
      });
    }, 200);
  };

  // Handle form submission
  const onSubmit = (values: z.infer<typeof formSchema>) => {
    console.log("Form values:", values);
    setCurrentStep(2);
  };

  // Simulate starting the analysis
  const startAnalysis = () => {
    setAnalysisStarted(true);
    // toast call replaced
  // Original: toast({
      title: "Analysis Started",
      description: "Your document is being analyzed. You'll be notified when it's complete.",
    })
  console.log('Toast would show:', {
      title: "Analysis Started",
      description: "Your document is being analyzed. You'll be notified when it's complete.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Document Information */}
      {currentStep === 1 && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="projectName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter project name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="documentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Document Type</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="protocol">Protocol</SelectItem>
                        <SelectItem value="csr">Clinical Study Report</SelectItem>
                        <SelectItem value="ind">IND</SelectItem>
                        <SelectItem value="regulatory">Regulatory Submission</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="therapeuticArea"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Therapeutic Area</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select therapeutic area" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="microbiome">Microbiome</SelectItem>
                        <SelectItem value="obesity">Obesity</SelectItem>
                        <SelectItem value="infection">Infectious Disease</SelectItem>
                        <SelectItem value="gi">Gastrointestinal</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="phase"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Study Phase (Optional)</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select study phase (if applicable)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="phase1">Phase 1</SelectItem>
                      <SelectItem value="phase2">Phase 2</SelectItem>
                      <SelectItem value="phase3">Phase 3</SelectItem>
                      <SelectItem value="phase4">Phase 4</SelectItem>
                      <SelectItem value="na">Not Applicable</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Brief description of the document or specific analysis needs" 
                      className="resize-none" 
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end pt-2">
              <Button type="submit">
                Continue
              </Button>
            </div>
          </form>
        </Form>
      )}
      
      {/* Step 2: Document Upload */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center bg-slate-50">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xlsx,.ppt,.pptx"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  // Handle file selection logic here
                  console.log(e.target.files[0].name);
                }
              }}
            />
            
            {!uploadSuccess ? (
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-medium">Upload Your Document</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Support for PDF, Word, Excel, and PowerPoint files. Maximum file size: 50MB.
                </p>
                
                <div>
                  <Button
                    variant="outline"
                    size="lg"
                    className="relative"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <FileUp className="h-4 w-4 mr-2" />
                    Select File
                  </Button>
                </div>
                
                {uploading && (
                  <div className="max-w-md mx-auto mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span>Uploading...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-green-50 text-green-600">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-medium">Upload Complete</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Your document has been successfully uploaded. Click below to start the AI analysis.
                </p>
                
                <div>
                  <Button
                    variant="default"
                    size="lg"
                    onClick={startAnalysis}
                    disabled={analysisStarted}
                  >
                    {analysisStarted ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Brain className="h-4 w-4 mr-2" />
                        Start Analysis
                      </>
                    )}
                  </Button>
                </div>
                
                {analysisStarted && (
                  <div className="max-w-md mx-auto mt-4 text-sm text-slate-500">
                    <p>This may take several minutes depending on document size and complexity.</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {!uploadSuccess && (
            <div className="flex justify-between">
              <Button 
                variant="ghost" 
                onClick={() => setCurrentStep(1)}
              >
                Back to Details
              </Button>
              <Button 
                onClick={simulateUpload} 
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Upload Document"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// CSR Similarity Scatterplot Component
const CsrSimilarityScatterplot = ({ 
  data, 
  height = 300, 
  selectedCategory = null 
}: { 
  data: Array<any>, 
  height?: number,
  selectedCategory: string | null
}) => {
  // Filter data based on selected category if needed
  const filteredData = selectedCategory 
    ? data.filter(item => item.category === selectedCategory)
    : data;

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey="relevanceScore" name="Relevance" unit="%" domain={[50, 100]} />
          <YAxis type="number" dataKey="impactScore" name="Impact" unit="%" domain={[0, 100]} />
          <ZAxis type="number" dataKey="size" range={[50, 400]} />
          <RechartsTooltip 
            cursor={{ strokeDasharray: '3 3' }} 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-white p-3 border rounded-md shadow-md text-xs">
                    <p className="font-medium text-sm">{data.name}</p>
                    <p className="text-slate-600 mt-1">{data.indication}</p>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="text-slate-500">Relevance:</span>
                      <span className="font-medium">{data.relevanceScore}%</span>
                      <span className="text-slate-500">Impact Score:</span>
                      <span className="font-medium">{data.impactScore}%</span>
                      <span className="text-slate-500">Study Phase:</span>
                      <span className="font-medium">{data.phase}</span>
                      <span className="text-slate-500">Sample Size:</span>
                      <span className="font-medium">{data.sampleSize} patients</span>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Scatter name="CSR Documents" data={filteredData} fill="#8884d8">
            {filteredData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={COLORS[index % COLORS.length]} 
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="flex justify-center items-center text-xs text-slate-500 mt-1">
        <div className="flex items-center mr-4">
          <span className="mr-1">X-axis:</span>
          <span className="font-medium">Relevance Score</span>
        </div>
        <div className="flex items-center">
          <span className="mr-1">Y-axis:</span>
          <span className="font-medium">Impact Score</span>
        </div>
      </div>
    </div>
  );
};

// Main component
const CsrIntelligenceInsights = () => {
  const [selectedTherapeuticArea, setSelectedTherapeuticArea] = useState<string | null>(null);
  const [selectedInsightType, setSelectedInsightType] = useState<string>("all");

  // Fetch CSR intelligence insights
  const { data: csrInsights, isLoading: insightsLoading } = useQuery({
    queryKey: ['/api/csr-intelligence/lumen-bio'],
    initialData: {
      // This is just the initial data structure - would be populated from API
      therapeuticAreas: [
        { id: "microbiome", name: "Microbiome", count: 28 },
        { id: "obesity", name: "Obesity", count: 42 },
        { id: "infection", name: "Infectious Disease", count: 37 },
        { id: "gi", name: "Gastrointestinal", count: 25 }
      ],
      insights: [
        {
          id: "insight_1",
          title: "C. difficile Colonization Assessment Timing",
          description: "CSR analysis reveals optimal timing for C. difficile colonization assessment is at days 7, 14, 28, and 56 post-administration.",
          impact: "high" as const,
          category: "clinical" as const,
          relevance: 0.89,
          evidence: "Based on 17 C. difficile treatment studies where earlier assessment (day 7) correlated with 36% better prediction of sustained colonization at 8 weeks.",
          recommendation: "Restructure the LBP-2021 protocol to include microbiome assessment at days 7, 14, 28, and 56 instead of current bi-weekly schedule.",
          confidence: 0.92,
          relatedCSRs: ["CSR-187", "CSR-201", "CSR-356"]
        },
        {
          id: "insight_2",
          title: "Microbiome Biomarker Predictivity",
          description: "Multi-study analysis indicates specific microbiome diversity markers strongly predict therapeutic success in both C. difficile and norovirus programs.",
          impact: "high" as const,
          category: "clinical" as const,
          relevance: 0.95,
          evidence: "Cross-analysis of 23 microbiome-modulating intervention studies shows Shannon diversity index at day 14 predicts 87% of therapeutic outcomes.",
          recommendation: "Implement standardized microbiome diversity assessment using both Shannon and Simpson indices as early efficacy indicators for all programs.",
          confidence: 0.91,
          relatedCSRs: ["CSR-145", "CSR-187", "CSR-201", "CSR-356"]
        },
        {
          id: "insight_3",
          title: "Enrollment Acceleration Strategy",
          description: "Site performance patterns from similar microbiome studies reveal optimal site selection criteria for accelerated enrollment.",
          impact: "medium" as const,
          category: "operational" as const,
          relevance: 0.81,
          evidence: "Analysis of 19 microbiome-focused trials shows sites with dedicated microbiome research coordinators achieved 67% faster enrollment rates.",
          recommendation: "Prioritize sites with existing microbiome research infrastructure and specialized coordinators for the LBP-1019 study.",
          confidence: 0.87,
          relatedCSRs: ["CSR-122", "CSR-144", "CSR-356"]
        },
        {
          id: "insight_4",
          title: "Obesity Program Manufacturing Process Impact",
          description: "Manufacturing process variations significantly impact clinical outcomes in microbiome-based obesity interventions.",
          impact: "high" as const,
          category: "operational" as const,
          relevance: 0.93,
          evidence: "Five obesity-focused microbiome studies showed 42% efficacy variance attributable to batch-to-batch consistencies in the manufacturing process.",
          recommendation: "Implement enhanced quality control processes for LMN-0801 manufacturing with specific focus on spirulina cultivation consistency.",
          confidence: 0.89,
          relatedCSRs: ["CSR-209", "CSR-221", "CSR-298"]
        },
        {
          id: "insight_5",
          title: "Regulatory Pathway Optimization",
          description: "Analysis of successful microbiome therapeutic approvals reveals optimal regulatory strategy for expedited review.",
          impact: "high" as const,
          category: "regulatory" as const,
          relevance: 0.85,
          evidence: "Three recently approved microbiome therapeutics utilized similar modular submission strategies that reduced review times by 37%.",
          recommendation: "Restructure the planned BLA submission for LBP-2021 using a modular approach with CMC package submitted 60 days before clinical data.",
          confidence: 0.83,
          relatedCSRs: ["CSR-356", "CSR-401", "CSR-422"]
        },
        {
          id: "insight_6",
          title: "Competitive Differentiation Opportunity",
          description: "Comparative efficacy analysis reveals unique opportunity for differentiation in delivery mechanism for obesity program.",
          impact: "medium" as const,
          category: "competitive" as const,
          relevance: 0.78,
          evidence: "Comparison of 7 microbiome-based obesity interventions shows oral delivery method with gastric acid protection improves colonization by 61%.",
          recommendation: "Highlight the proprietary delivery technology in LMN-0801 as a key differentiator in investor and partner communications.",
          confidence: 0.81,
          relatedCSRs: ["CSR-209", "CSR-221", "CSR-356"]
        },
        {
          id: "insight_7",
          title: "Endpoint Selection Optimization",
          description: "Analysis of endpoint selection across microbiome trials reveals opportunity to improve statistical power.",
          impact: "medium" as const,
          category: "clinical" as const,
          relevance: 0.90,
          evidence: "Review of 32 microbiome therapeutic trial outcomes shows compositional analysis with multivariate endpoints increased sensitivity by 44%.",
          recommendation: "Revise the primary endpoint definition for LBP-1019 to include composite measure of viral shedding and symptom reduction.",
          confidence: 0.89,
          relatedCSRs: ["CSR-122", "CSR-141", "CSR-187"]
        },
        {
          id: "insight_8",
          title: "Patient Selection Refinement",
          description: "Subgroup analysis indicates opportunity to refine inclusion criteria for obesity program.",
          impact: "high" as const,
          category: "clinical" as const,
          relevance: 0.94,
          evidence: "Detailed subgroup analysis across 9 obesity intervention studies shows baseline gut microbiome composition predicts responders with 78% accuracy.",
          recommendation: "Consider implementing a pre-screening microbiome assessment for the LMN-0801 obesity program to identify likely responders.",
          confidence: 0.86,
          relatedCSRs: ["CSR-209", "CSR-221", "CSR-298"]
        }
      ],
      similarCSRs: [
        {
          id: "csr_1",
          name: "CSR-187",
          indication: "C. difficile Infection",
          phase: "Phase 2",
          relevanceScore: 92,
          impactScore: 85,
          size: 120,
          sampleSize: 120,
          category: "microbiome"
        },
        {
          id: "csr_2",
          name: "CSR-201",
          indication: "C. difficile Recurrence",
          phase: "Phase 3",
          relevanceScore: 88,
          impactScore: 78,
          size: 250,
          sampleSize: 250,
          category: "microbiome"
        },
        {
          id: "csr_3",
          name: "CSR-356",
          indication: "Microbiome Restoration",
          phase: "Phase 2",
          relevanceScore: 94,
          impactScore: 89,
          size: 105,
          sampleSize: 105,
          category: "microbiome"
        },
        {
          id: "csr_4",
          name: "CSR-209",
          indication: "Obesity",
          phase: "Phase 2",
          relevanceScore: 91,
          impactScore: 75,
          size: 180,
          sampleSize: 180,
          category: "obesity"
        },
        {
          id: "csr_5",
          name: "CSR-221",
          indication: "Weight Management",
          phase: "Phase 2",
          relevanceScore: 87,
          impactScore: 80,
          size: 165,
          sampleSize: 165,
          category: "obesity"
        },
        {
          id: "csr_6",
          name: "CSR-122",
          indication: "Antibiotic-resistant Infection",
          phase: "Phase 2",
          relevanceScore: 71,
          impactScore: 65,
          size: 140,
          sampleSize: 140,
          category: "infection"
        },
        {
          id: "csr_7",
          name: "CSR-298",
          indication: "Metabolic Syndrome",
          phase: "Phase 1/2",
          relevanceScore: 82,
          impactScore: 68,
          size: 95,
          sampleSize: 95,
          category: "obesity"
        }
      ],
      impactMetrics: {
        predictedSuccessProbability: 0.72,
        potentialTimelineSavings: 4.5, // months
        estimatedCostReduction: 2.4, // millions
        qualityImprovements: 3.2 // 1-5 scale
      }
    }
  });

  if (insightsLoading) {
    return <div className="p-8 flex justify-center">Loading CSR intelligence insights...</div>;
  }

  // Filter insights based on selected type
  const filteredInsights = csrInsights.insights.filter(insight => {
    if (selectedInsightType === "all") return true;
    return insight.category === selectedInsightType;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">CSR Intelligence Insights</h2>
          <p className="text-slate-600">
            AI-powered analysis from 779 clinical study reports revealing actionable insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="flex items-center gap-1">
            <Download className="h-4 w-4" /> 
            Export Insights
          </Button>
          <Button className="flex items-center gap-1">
            <Brain className="h-4 w-4" /> 
            Generate New Analysis
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-slate-500">Predicted Success</p>
                <p className="text-3xl font-bold mt-1">{Math.round(csrInsights.impactMetrics.predictedSuccessProbability * 100)}%</p>
                <p className="text-xs text-slate-500">Probability based on CSR analysis</p>
              </div>
              <div className="bg-white p-2 rounded-full border border-blue-200">
                <Target className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-slate-500">Timeline Savings</p>
                <p className="text-3xl font-bold mt-1">{csrInsights.impactMetrics.potentialTimelineSavings}</p>
                <p className="text-xs text-slate-500">Potential months saved</p>
              </div>
              <div className="bg-white p-2 rounded-full border border-green-200">
                <Clock className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-slate-500">Cost Reduction</p>
                <p className="text-3xl font-bold mt-1">${csrInsights.impactMetrics.estimatedCostReduction}M</p>
                <p className="text-xs text-slate-500">Potential cost savings</p>
              </div>
              <div className="bg-white p-2 rounded-full border border-purple-200">
                <BarChart2 className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-slate-500">Quality Score</p>
                <p className="text-3xl font-bold mt-1">{csrInsights.impactMetrics.qualityImprovements}</p>
                <p className="text-xs text-slate-500">Out of 5 potential improvement</p>
              </div>
              <div className="bg-white p-2 rounded-full border border-amber-200">
                <Award className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Tabs defaultValue="insights" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="insights" className="flex items-center gap-1">
            <Lightbulb className="h-4 w-4" />
            Key Insights
          </TabsTrigger>
          <TabsTrigger value="similar-csrs" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            Similar CSRs
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4" />
            Recommendations
          </TabsTrigger>
          <TabsTrigger value="document-upload" className="flex items-center gap-1">
            <UploadCloud className="h-4 w-4" />
            Document Analysis
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="insights" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <div className="text-lg font-semibold">Actionable Insights</div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Filter by:</span>
              <select 
                className="rounded-md border border-slate-300 py-1 px-2 text-sm"
                value={selectedInsightType}
                onChange={(e) => setSelectedInsightType(e.target.value)}
              >
                <option value="all">All Insights</option>
                <option value="clinical">Clinical</option>
                <option value="operational">Operational</option>
                <option value="regulatory">Regulatory</option>
                <option value="competitive">Competitive</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredInsights.map(insight => (
              <InsightCard 
                key={insight.id}
                title={insight.title}
                description={insight.description}
                impact={insight.impact}
                category={insight.category}
                evidence={insight.evidence}
                recommendation={insight.recommendation}
                confidence={insight.confidence}
              />
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="similar-csrs" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <div className="text-lg font-semibold">CSR Similarity Analysis</div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Filter by:</span>
              <select 
                className="rounded-md border border-slate-300 py-1 px-2 text-sm"
                value={selectedTherapeuticArea || ""}
                onChange={(e) => setSelectedTherapeuticArea(e.target.value || null)}
              >
                <option value="">All Areas</option>
                {csrInsights.therapeuticAreas.map(area => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">CSR Similarity Visualization</CardTitle>
                  <CardDescription>
                    Showing relevance and impact scores for CSRs most similar to Lumen Bio programs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CsrSimilarityScatterplot 
                    data={csrInsights.similarCSRs}
                    selectedCategory={selectedTherapeuticArea}
                  />
                </CardContent>
              </Card>
            </div>
            
            <div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Highest Relevance CSRs</CardTitle>
                  <CardDescription>
                    Clinical studies most relevant to your pipeline
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {csrInsights.similarCSRs
                      .filter(csr => !selectedTherapeuticArea || csr.category === selectedTherapeuticArea)
                      .sort((a, b) => b.relevanceScore - a.relevanceScore)
                      .slice(0, 5)
                      .map(csr => (
                        <div key={csr.id} className="p-3 hover:bg-slate-50">
                          <div className="flex justify-between">
                            <div className="font-medium">{csr.name}</div>
                            <Badge variant="outline">{csr.relevanceScore}% Relevance</Badge>
                          </div>
                          <div className="flex justify-between text-sm text-slate-500 mt-1">
                            <div>{csr.indication}</div>
                            <div>{csr.phase}</div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </CardContent>
                <CardFooter className="border-t p-3">
                  <Button variant="outline" size="sm" className="w-full">
                    <FileText className="h-4 w-4 mr-1" />
                    View All Similar CSRs
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="document-upload" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex justify-between">
                    <div>
                      <CardTitle className="text-lg">Upload Documents for Analysis</CardTitle>
                      <CardDescription>
                        Upload your clinical documents to analyze against our CSR intelligence database
                      </CardDescription>
                    </div>
                    <div className="bg-blue-50 p-2 rounded-full">
                      <UploadCloud className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <DocumentUploadForm />
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-5 w-5 text-blue-600" />
                    How Document Analysis Works
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="bg-blue-100 rounded-full p-2 mt-1">
                          <span className="text-blue-700 font-semibold">1</span>
                        </div>
                        <div>
                          <h4 className="font-medium text-blue-900">Upload Your Documents</h4>
                          <p className="text-sm text-slate-600 mt-1">
                            Upload your protocol, IND, or other clinical documents in PDF or Word format
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="bg-blue-100 rounded-full p-2 mt-1">
                          <span className="text-blue-700 font-semibold">2</span>
                        </div>
                        <div>
                          <h4 className="font-medium text-blue-900">AI-Powered Analysis</h4>
                          <p className="text-sm text-slate-600 mt-1">
                            Our AI engine analyzes your documents against 779+ CSRs in our database
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="bg-blue-100 rounded-full p-2 mt-1">
                          <span className="text-blue-700 font-semibold">3</span>
                        </div>
                        <div>
                          <h4 className="font-medium text-blue-900">Receive Actionable Insights</h4>
                          <p className="text-sm text-slate-600 mt-1">
                            Get detailed success factors, risks, and optimization recommendations specific to your program
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center pt-2">
                    <span className="text-sm text-slate-500 flex gap-2 items-center">
                      <span className="text-slate-400"><Lock className="h-4 w-4" /></span>
                      Your documents are processed securely and remain confidential
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileCheck className="h-5 w-5 text-primary" />
                    Recent Analyses
                  </CardTitle>
                  <CardDescription>
                    Your recently analyzed documents
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    <div className="p-3 hover:bg-slate-50 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="bg-blue-100 p-1.5 rounded">
                          <FileText className="h-4 w-4 text-blue-700" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">LBP-2021_Protocol_v3.2.pdf</p>
                          <p className="text-xs text-slate-500">Analyzed Apr 16, 2025</p>
                        </div>
                      </div>
                      <div className="flex items-center mt-2">
                        <Badge variant="outline" className="text-xs bg-blue-50">
                          <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                          87% Match Score
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="p-3 hover:bg-slate-50 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="bg-green-100 p-1.5 rounded">
                          <FileText className="h-4 w-4 text-green-700" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">LMN-0801_Phase1_Report.pdf</p>
                          <p className="text-xs text-slate-500">Analyzed Apr 12, 2025</p>
                        </div>
                      </div>
                      <div className="flex items-center mt-2">
                        <Badge variant="outline" className="text-xs bg-blue-50">
                          <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                          93% Match Score
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="p-3 hover:bg-slate-50 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="bg-purple-100 p-1.5 rounded">
                          <FileText className="h-4 w-4 text-purple-700" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">Regulatory_Strategy_2025.docx</p>
                          <p className="text-xs text-slate-500">Analyzed Apr 5, 2025</p>
                        </div>
                      </div>
                      <div className="flex items-center mt-2">
                        <Badge variant="outline" className="text-xs bg-blue-50">
                          <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                          76% Match Score
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t p-3">
                  <Button variant="ghost" size="sm" className="w-full">
                    View All Analyzed Documents
                  </Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    AI Processing Credits
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Available Credits</span>
                        <span className="font-semibold">23 / 30</span>
                      </div>
                      <Progress value={76} className="h-2" />
                    </div>
                    
                    <div className="bg-blue-50 p-3 rounded border border-blue-200 text-sm">
                      <p className="text-slate-700">
                        Each document analysis uses 1 credit. Your plan renews on <span className="font-medium">May 15, 2025</span>.
                      </p>
                    </div>
                    
                    <Button variant="outline" size="sm" className="w-full">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Upgrade Plan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="recommendations" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <h3 className="text-lg font-semibold">Strategic Recommendations</h3>
              
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <div className="flex items-center">
                    <div className="bg-blue-100 p-2 rounded-full mr-3">
                      <Dna className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Revise Microbiome Assessment Strategy</CardTitle>
                      <CardDescription>Clinical Program Optimization</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  <p className="text-sm text-slate-600">
                    Implement standardized microbiome assessment with both Shannon and Simpson indices at days 7, 14, 28, and 56 post-administration across all programs. This approach correlates with 87% of therapeutic outcomes based on cross-analysis of 23 microbiome intervention studies.
                  </p>
                  <div className="flex items-center mt-3 text-sm text-blue-600">
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    <span>Expected 36% improvement in predictive accuracy</span>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="pb-2">
                  <div className="flex items-center">
                    <div className="bg-green-100 p-2 rounded-full mr-3">
                      <Users className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Strategic Site Selection & Pre-screening</CardTitle>
                      <CardDescription>Operational Efficiency</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  <p className="text-sm text-slate-600">
                    Prioritize sites with dedicated microbiome research infrastructure and implement pre-screening microbiome assessment to identify likely responders, particularly for the LMN-0801 obesity program. Analysis shows baseline gut microbiome composition predicts responders with 78% accuracy.
                  </p>
                  <div className="flex items-center mt-3 text-sm text-green-600">
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    <span>Potential 67% faster enrollment rates</span>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-l-4 border-l-purple-500">
                <CardHeader className="pb-2">
                  <div className="flex items-center">
                    <div className="bg-purple-100 p-2 rounded-full mr-3">
                      <FileCheck className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Regulatory Submission Strategy</CardTitle>
                      <CardDescription>Regulatory Optimization</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  <p className="text-sm text-slate-600">
                    Restructure the planned BLA submission for LBP-2021 using a modular approach with CMC package submitted 60 days before clinical data. Three recently approved microbiome therapeutics utilized similar modular submission strategies that reduced review times by 37%.
                  </p>
                  <div className="flex items-center mt-3 text-sm text-purple-600">
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    <span>Estimated 4.5 month reduction in approval timeline</span>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Impact Summary</h3>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    <span className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      Timeline Impact
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart
                      data={[
                        { name: 'Current', value: 24, fill: '#9CA3AF' },
                        { name: 'Optimized', value: 19.5, fill: '#3B82F6' }
                      ]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis label={{ value: 'Months', angle: -90, position: 'insideLeft' }} />
                      <RechartsTooltip />
                      <Bar dataKey="value" name="Timeline (months)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="text-sm text-center mt-2">
                    <span className="text-blue-600 font-medium">4.5 months</span> potential timeline reduction
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    <span className="flex items-center gap-2">
                      <BarChart2 className="h-5 w-5 text-primary" />
                      Success Probability
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-center py-4">
                    <div style={{ width: 150, height: 150 }} className="relative">
                      <svg width="150" height="150" viewBox="0 0 150 150">
                        {/* Background circle */}
                        <circle 
                          cx="75" 
                          cy="75" 
                          r="60" 
                          fill="none" 
                          stroke="#e5e7eb" 
                          strokeWidth="15" 
                        />
                        {/* Progress circle - using strokeDasharray and strokeDashoffset */}
                        <circle 
                          cx="75" 
                          cy="75" 
                          r="60" 
                          fill="none" 
                          stroke="#3B82F6" 
                          strokeWidth="15" 
                          strokeDasharray={`${2 * Math.PI * 60}`} 
                          strokeDashoffset={`${2 * Math.PI * 60 * (1 - csrInsights.impactMetrics.predictedSuccessProbability)}`}
                          strokeLinecap="round"
                          transform="rotate(-90, 75, 75)"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold">{Math.round(csrInsights.impactMetrics.predictedSuccessProbability * 100)}%</span>
                        <span className="text-sm text-slate-500">Predicted Success</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-center mt-2">
                    Based on analysis of <span className="font-medium">{csrInsights.similarCSRs.length} similar CSRs</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CsrIntelligenceInsights;