import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Globe,
  Book,
  Languages,
  FileText,
  RefreshCw,
  ChevronDown,
  FileUp,
  FileDown,
  Sparkles,
  AlertTriangle,
  GraduationCap,
  FileCog,
} from "lucide-react";
import type { CsrReport } from "@/lib/types";

// Translation form schema
const textTranslationSchema = z.object({
  text: z.string().min(1, "Text is required"),
  sourceLanguage: z.string().min(2, "Source language is required"),
  targetLanguage: z.string().min(2, "Target language is required"),
});

// CSR translation schema
const csrTranslationSchema = z.object({
  reportId: z.string().min(1, "Report ID is required"),
  targetLanguage: z.string().min(2, "Target language is required"),
});

// Regulatory guidance translation schema
const regulatoryTranslationSchema = z.object({
  guidance: z.string().min(1, "Regulatory guidance text is required"),
  targetLanguage: z.string().min(2, "Target language is required"),
});

interface Language {
  code: string;
  name: string;
}

export default function Translation() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("text");
  
  // Fetch available languages
  const {
    data: languagesData,
    isLoading: isLoadingLanguages,
    error: languagesError,
  } = useQuery({
    queryKey: ["/api/translation/languages"],
    enabled: true,
  });

  // Fetch available reports for CSR translation
  const {
    data: reports,
    isLoading: isLoadingReports,
  } = useQuery<CsrReport[]>({
    queryKey: ["/api/reports"],
    enabled: true,
  });

  // Initialize forms
  const textTranslationForm = useForm<z.infer<typeof textTranslationSchema>>({
    resolver: zodResolver(textTranslationSchema),
    defaultValues: {
      text: "",
      sourceLanguage: "en",
      targetLanguage: "",
    },
  });

  const csrTranslationForm = useForm<z.infer<typeof csrTranslationSchema>>({
    resolver: zodResolver(csrTranslationSchema),
    defaultValues: {
      reportId: "",
      targetLanguage: "",
    },
  });

  const regulatoryTranslationForm = useForm<z.infer<typeof regulatoryTranslationSchema>>({
    resolver: zodResolver(regulatoryTranslationSchema),
    defaultValues: {
      guidance: "",
      targetLanguage: "",
    },
  });

  // Text translation mutation
  const textTranslationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof textTranslationSchema>) => {
      return apiRequest("/api/translation/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
    },
    onSuccess: (response) => {
      setTranslatedText(response.translatedText);
      // toast call replaced
  // Original: toast({
        title: "Translation Complete",
        description: `Translated to ${getLanguageName(response.targetLanguage)
  console.log('Toast would show:', {
        title: "Translation Complete",
        description: `Translated to ${getLanguageName(response.targetLanguage)}`,
      });
    },
    onError: (error) => {
      // toast call replaced
  // Original: toast({
        title: "Translation Failed",
        description: error.message || "Failed to translate text",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Translation Failed",
        description: error.message || "Failed to translate text",
        variant: "destructive",
      });
    },
  });

  // CSR report translation mutation
  const csrTranslationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof csrTranslationSchema>) => {
      return apiRequest(`/api/reports/${data.reportId}/translate?targetLanguage=${data.targetLanguage}`, {
        method: "GET",
      });
    },
    onSuccess: (response) => {
      setCsrTranslatedDetails(response.details);
      setCsrReport(response.report);
      setCsrTranslationInfo(response.translationInfo);
      // toast call replaced
  // Original: toast({
        title: "CSR Translation Complete",
        description: `Translated to ${response.translationInfo.targetLanguageName}`,
      })
  console.log('Toast would show:', {
        title: "CSR Translation Complete",
        description: `Translated to ${response.translationInfo.targetLanguageName}`,
      });
    },
    onError: (error) => {
      // toast call replaced
  // Original: toast({
        title: "CSR Translation Failed",
        description: error.message || "Failed to translate CSR report",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "CSR Translation Failed",
        description: error.message || "Failed to translate CSR report",
        variant: "destructive",
      });
    },
  });

  // Regulatory guidance translation mutation
  const regulatoryTranslationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof regulatoryTranslationSchema>) => {
      return apiRequest("/api/translation/regulatory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
    },
    onSuccess: (response) => {
      setTranslatedGuidance(response.translatedGuidance);
      // toast call replaced
  // Original: toast({
        title: "Regulatory Translation Complete",
        description: `Translated to ${response.targetLanguageName}`,
      })
  console.log('Toast would show:', {
        title: "Regulatory Translation Complete",
        description: `Translated to ${response.targetLanguageName}`,
      });
    },
    onError: (error) => {
      // toast call replaced
  // Original: toast({
        title: "Regulatory Translation Failed",
        description: error.message || "Failed to translate regulatory guidance",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Regulatory Translation Failed",
        description: error.message || "Failed to translate regulatory guidance",
        variant: "destructive",
      });
    },
  });

  // Translation results state
  const [translatedText, setTranslatedText] = useState<string>("");
  const [csrTranslatedDetails, setCsrTranslatedDetails] = useState<any>(null);
  const [csrReport, setCsrReport] = useState<CsrReport | null>(null);
  const [csrTranslationInfo, setCsrTranslationInfo] = useState<any>(null);
  const [translatedGuidance, setTranslatedGuidance] = useState<string>("");

  // Helper to get language name from code
  const getLanguageName = (code: string): string => {
    if (!languagesData?.languages) return code;
    const language = languagesData.languages.find((l: Language) => l.code === code);
    return language ? language.name : code;
  };

  // Form submission handlers
  const onTextTranslationSubmit = (data: z.infer<typeof textTranslationSchema>) => {
    textTranslationMutation.mutate(data);
  };

  const onCsrTranslationSubmit = (data: z.infer<typeof csrTranslationSchema>) => {
    csrTranslationMutation.mutate(data);
  };

  const onRegulatoryTranslationSubmit = (data: z.infer<typeof regulatoryTranslationSchema>) => {
    regulatoryTranslationMutation.mutate(data);
  };

  // Sample regulatory texts
  const regulatoryTemplates = [
    {
      name: "ICH E6(R3) Excerpt",
      text: "The principles established in this guideline may also be applied to other clinical investigations that may have an impact on the safety and well-being of human subjects (e.g., pharmacokinetic studies). This guideline should be read in conjunction with other ICH guidelines relevant to the conduct of clinical trials.",
    },
    {
      name: "FDA Guidance Sample",
      text: "Sponsors should develop a prospective statistical analysis plan (SAP) that is appropriate for the objectives of the trial and prespecify methods to handle missing data, including the assumptions underlying the statistical methods, sensitivity analyses, and the approach to inferences.",
    },
    {
      name: "EMA Policy Sample",
      text: "Following the implementation of the Clinical Trial Regulation (EU) No 536/2014, sponsors are required to submit a summary of clinical trial results to the EU database within one year from the end of a clinical trial in all Member States.",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container max-w-7xl py-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <Globe className="inline mr-2 h-8 w-8 text-primary" />
            Global Translation Service
          </h1>
          <p className="text-muted-foreground mt-1">
            Translate CSR documents, regulatory guidance, and clinical trial text across languages
          </p>
        </div>
        
        <Badge 
          variant="outline" 
          className="bg-blue-50 text-blue-900 hover:bg-blue-100 transition-colors"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          Premium Feature
        </Badge>
      </div>

      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-medium">
            <Languages className="inline mr-2 h-5 w-5 text-primary" /> 
            Multilingual Support
          </CardTitle>
          <CardDescription>
            Professionally translate clinical study data using specialized medical terminology
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-md p-4 bg-muted/50">
              <div className="flex items-center mb-2">
                <FileText className="h-5 w-5 text-blue-600 mr-2" />
                <h3 className="font-medium">CSR Document Translation</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Translate full clinical study reports while preserving specialized medical and scientific terminology
              </p>
            </div>
            <div className="border rounded-md p-4 bg-muted/50">
              <div className="flex items-center mb-2">
                <GraduationCap className="h-5 w-5 text-amber-600 mr-2" />
                <h3 className="font-medium">Regulatory Guidance</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Translate regulatory documents from FDA, EMA, PMDA and other global authorities
              </p>
            </div>
            <div className="border rounded-md p-4 bg-muted/50">
              <div className="flex items-center mb-2">
                <FileCog className="h-5 w-5 text-emerald-600 mr-2" />
                <h3 className="font-medium">Custom Text Translation</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Translate study protocols, consent forms, and other clinical trial documents
              </p>
            </div>
          </div>
          
          {isLoadingLanguages ? (
            <div className="flex flex-wrap gap-2 mt-6">
              {[...Array(9)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-20 rounded-full" />
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <Label className="text-sm font-medium mb-2 block">Supported Languages</Label>
              <div className="flex flex-wrap gap-2">
                {languagesData?.languages?.map((language: Language) => (
                  <Badge key={language.code} variant="outline" className="rounded-full">
                    {language.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="text" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 mb-6">
          <TabsTrigger value="text" className="flex items-center">
            <Book className="h-4 w-4 mr-2" />
            Text Translation
          </TabsTrigger>
          <TabsTrigger value="csr" className="flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            CSR Translation
          </TabsTrigger>
          <TabsTrigger value="regulatory" className="flex items-center">
            <GraduationCap className="h-4 w-4 mr-2" />
            Regulatory Translation
          </TabsTrigger>
        </TabsList>

        {/* Text Translation Tab */}
        <TabsContent value="text">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Source Text</CardTitle>
                <CardDescription>
                  Enter the text you want to translate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...textTranslationForm}>
                  <form onSubmit={textTranslationForm.handleSubmit(onTextTranslationSubmit)} className="space-y-4">
                    <FormField
                      control={textTranslationForm.control}
                      name="text"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Text to Translate</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter medical or clinical text here..."
                              className="min-h-32"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={textTranslationForm.control}
                        name="sourceLanguage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Source Language</FormLabel>
                            <FormControl>
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                                disabled={isLoadingLanguages}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select language" />
                                </SelectTrigger>
                                <SelectContent>
                                  {languagesData?.languages?.map((language: Language) => (
                                    <SelectItem key={language.code} value={language.code}>
                                      {language.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={textTranslationForm.control}
                        name="targetLanguage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Target Language</FormLabel>
                            <FormControl>
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                                disabled={isLoadingLanguages}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select language" />
                                </SelectTrigger>
                                <SelectContent>
                                  {languagesData?.languages?.map((language: Language) => (
                                    <SelectItem key={language.code} value={language.code}>
                                      {language.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={textTranslationMutation.isPending}
                    >
                      {textTranslationMutation.isPending ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Translating...
                        </>
                      ) : (
                        <>
                          <Book className="mr-2 h-4 w-4" />
                          Translate Text
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Translated Result</CardTitle>
                <CardDescription>
                  Specialized translation preserving medical terminology
                </CardDescription>
              </CardHeader>
              <CardContent>
                {textTranslationMutation.isPending ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ) : translatedText ? (
                  <div className="border rounded-md p-4 bg-muted/30 min-h-32">
                    <p className="whitespace-pre-wrap">{translatedText}</p>
                  </div>
                ) : (
                  <div className="border rounded-md p-4 bg-muted/30 min-h-32 flex items-center justify-center text-muted-foreground">
                    <p>Translated text will appear here</p>
                  </div>
                )}
              </CardContent>
              {translatedText && (
                <CardFooter className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(translatedText);
                      // toast call replaced
  // Original: toast({
                        title: "Copied to clipboard",
                        description: "The translated text has been copied to your clipboard",
                      })
  console.log('Toast would show:', {
                        title: "Copied to clipboard",
                        description: "The translated text has been copied to your clipboard",
                      });
                    }}
                  >
                    <FileDown className="h-4 w-4 mr-1" /> Copy
                  </Button>
                </CardFooter>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* CSR Translation Tab */}
        <TabsContent value="csr">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">CSR Selection</CardTitle>
                <CardDescription>
                  Select a CSR report to translate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...csrTranslationForm}>
                  <form onSubmit={csrTranslationForm.handleSubmit(onCsrTranslationSubmit)} className="space-y-4">
                    <FormField
                      control={csrTranslationForm.control}
                      name="reportId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Clinical Study Report</FormLabel>
                          <FormControl>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={isLoadingReports}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a CSR" />
                              </SelectTrigger>
                              <SelectContent>
                                {reports?.map((report) => (
                                  <SelectItem key={report.id} value={report.id.toString()}>
                                    {report.title} ({report.sponsor})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={csrTranslationForm.control}
                      name="targetLanguage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Language</FormLabel>
                          <FormControl>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={isLoadingLanguages}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select language" />
                              </SelectTrigger>
                              <SelectContent>
                                {languagesData?.languages?.map((language: Language) => (
                                  <SelectItem key={language.code} value={language.code}>
                                    {language.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="pt-2">
                      <Button 
                        type="submit" 
                        className="w-full"
                        disabled={csrTranslationMutation.isPending}
                      >
                        {csrTranslationMutation.isPending ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Translating CSR...
                          </>
                        ) : (
                          <>
                            <Book className="mr-2 h-4 w-4" />
                            Translate CSR
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-lg">
                  <span>Translated CSR Details</span>
                  {csrTranslationInfo && (
                    <Badge className="ml-2">
                      Translated to {csrTranslationInfo.targetLanguageName}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  View the translated clinical study report details
                </CardDescription>
              </CardHeader>
              <CardContent>
                {csrTranslationMutation.isPending ? (
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-1/2 mb-2" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-6 w-1/2 mt-4 mb-2" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : csrTranslatedDetails ? (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-md font-semibold">
                          {csrReport?.title}
                        </h3>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <Badge variant="outline">{csrReport?.sponsor}</Badge>
                          <Badge variant="outline">Phase {csrReport?.phase}</Badge>
                          <Badge variant="outline">{csrReport?.indication}</Badge>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-sm">Study Design</h4>
                        <p className="mt-1 text-sm">{csrTranslatedDetails.studyDesign}</p>
                      </div>

                      <div>
                        <h4 className="font-medium text-sm">Primary Objective</h4>
                        <p className="mt-1 text-sm">{csrTranslatedDetails.primaryObjective}</p>
                      </div>

                      <div>
                        <h4 className="font-medium text-sm">Study Description</h4>
                        <p className="mt-1 text-sm">{csrTranslatedDetails.studyDescription}</p>
                      </div>

                      <div>
                        <h4 className="font-medium text-sm">Endpoints</h4>
                        <div className="mt-1">
                          <p className="text-sm font-medium">Primary:</p>
                          <p className="text-sm">{csrTranslatedDetails.endpoints?.primary}</p>
                          
                          <p className="text-sm font-medium mt-2">Secondary:</p>
                          <ul className="list-disc pl-5 text-sm">
                            {csrTranslatedDetails.endpoints?.secondary?.map((endpoint: string, index: number) => (
                              <li key={index}>{endpoint}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-sm">Results</h4>
                        <div className="mt-1 space-y-2">
                          <div>
                            <p className="text-sm font-medium">Primary Results:</p>
                            <p className="text-sm">{csrTranslatedDetails.results?.primaryResults}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Secondary Results:</p>
                            <p className="text-sm">{csrTranslatedDetails.results?.secondaryResults}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Biomarker Results:</p>
                            <p className="text-sm">{csrTranslatedDetails.results?.biomarkerResults}</p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-sm">Safety</h4>
                        <div className="mt-1 space-y-2">
                          <div>
                            <p className="text-sm font-medium">Overall Safety:</p>
                            <p className="text-sm">{csrTranslatedDetails.safety?.overallSafety}</p>
                          </div>
                          {csrTranslatedDetails.safety?.commonAEs && (
                            <div>
                              <p className="text-sm font-medium">Common Adverse Events:</p>
                              <p className="text-sm">{csrTranslatedDetails.safety?.commonAEs}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="border rounded-md p-6 bg-muted/30 flex flex-col items-center justify-center text-muted-foreground h-[300px]">
                    <FileText className="h-12 w-12 mb-4 text-muted-foreground/70" />
                    <p>Select a CSR report and target language to translate</p>
                    {reports?.length === 0 && (
                      <p className="mt-2 text-sm">No CSR reports available for translation</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Regulatory Translation Tab */}
        <TabsContent value="regulatory">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Regulatory Guidance</CardTitle>
                <CardDescription>
                  Translate regulatory documents and guidance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...regulatoryTranslationForm}>
                  <form onSubmit={regulatoryTranslationForm.handleSubmit(onRegulatoryTranslationSubmit)} className="space-y-4">
                    <FormField
                      control={regulatoryTranslationForm.control}
                      name="guidance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Regulatory Text</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter regulatory guidance or documentation text here..."
                              className="min-h-32"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                          <FormDescription>
                            Translate regulatory guidance from FDA, EMA, PMDA, and other health authorities
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <div className="space-y-3">
                      <Label className="text-sm">Quick Templates</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {regulatoryTemplates.map((template, index) => (
                          <Button
                            key={index}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              regulatoryTranslationForm.setValue("guidance", template.text);
                            }}
                          >
                            {template.name}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <FormField
                      control={regulatoryTranslationForm.control}
                      name="targetLanguage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Language</FormLabel>
                          <FormControl>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={isLoadingLanguages}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select language" />
                              </SelectTrigger>
                              <SelectContent>
                                {languagesData?.languages?.map((language: Language) => (
                                  <SelectItem key={language.code} value={language.code}>
                                    {language.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="pt-2">
                      <Button 
                        type="submit" 
                        className="w-full"
                        disabled={regulatoryTranslationMutation.isPending}
                      >
                        {regulatoryTranslationMutation.isPending ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Translating...
                          </>
                        ) : (
                          <>
                            <Book className="mr-2 h-4 w-4" />
                            Translate Guidance
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Translated Guidance</CardTitle>
                <CardDescription>
                  Specialized regulatory translation with preserved terminology
                </CardDescription>
              </CardHeader>
              <CardContent>
                {regulatoryTranslationMutation.isPending ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                ) : translatedGuidance ? (
                  <div className="border rounded-md p-4 bg-muted/30 min-h-32">
                    <p className="whitespace-pre-wrap">{translatedGuidance}</p>
                  </div>
                ) : (
                  <div className="border rounded-md p-6 bg-muted/30 flex flex-col items-center justify-center text-muted-foreground min-h-32">
                    <GraduationCap className="h-10 w-10 mb-3 text-muted-foreground/70" />
                    <p>Translated regulatory guidance will appear here</p>
                    <p className="text-xs mt-2">Specialized translation preserves regulatory terminology and meaning</p>
                  </div>
                )}
              </CardContent>
              {translatedGuidance && (
                <CardFooter className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(translatedGuidance);
                      // toast call replaced
  // Original: toast({
                        title: "Copied to clipboard",
                        description: "The translated guidance has been copied to your clipboard",
                      })
  console.log('Toast would show:', {
                        title: "Copied to clipboard",
                        description: "The translated guidance has been copied to your clipboard",
                      });
                    }}
                  >
                    <FileDown className="h-4 w-4 mr-1" /> Copy
                  </Button>
                </CardFooter>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-8 p-4 border bg-yellow-50 rounded-md">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-amber-600 mr-2 mt-0.5" />
          <div>
            <h3 className="font-medium">Important Note on Translation Quality</h3>
            <p className="text-sm mt-1">
              While our translation service is trained on medical and clinical terminology, human review is recommended
              for critical regulatory submissions or patient-facing materials. Translation quality may vary by language.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}