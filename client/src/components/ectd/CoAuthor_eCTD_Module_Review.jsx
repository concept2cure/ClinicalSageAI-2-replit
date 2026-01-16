import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  CheckCircle, AlertTriangle, FileText, MessageSquare, Sparkles, ArrowRight, RefreshCw, ShieldCheck, Loader2 } from 'lucide-react'

export default function CoAuthor_eCTD_Module_Review({ moduleName = "Module 2.5 Clinical Overview", content = "", moduleId }) {
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewComplete, setReviewComplete] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [findings, setFindings] = useState([]);
  const { toast } = useToast();
  
  const startAIReview = async () => {
    // If no content is provided, we might still want to run it if we have a moduleId to fetch from server
    // For now, we'll warn if empty but allow proceed for demo purposes if needed
    if (!content && !moduleId) {
        // Just a warning log, sometimes we might just test the connectivity
        console.warn("No content or module ID provided for review");
    }

    setIsReviewing(true);
    setReviewComplete(false);
    setFindings([]);

    try {
      // Call the real backend endpoint for eCTD validation
      console.log('Starting validation....');
      const result = await apiRequest('POST', '/api/regulatory/validate-section', {
        section: moduleName,
        content: content || "Sample content for validation purposes if none provided.",
        moduleId: moduleId,
        ruleset: 'fda-ectd-v1'
      });
      console.log('Validation finished');

      const data = await result.json();

      if (data.findings) {
        setFindings(data.findings);
      } else {
        setFindings([]);
      }
      
      setReviewComplete(true);
      
      toast({
        title: "Review Complete",
        description: `Found ${data.findings?.length || 0} issues in ${moduleName}`,
      });

    } catch (error) {
      console.error("AI Review Error:", error);
      toast({
        title: "Analysis Failed",
        description: "Could not complete the regulatory review. Please try again.",
        variant: "destructive"
      });
      // Fallback for demo purposes if backend is offline
      setFindings([
        { id: 'err-1', type: 'error', message: 'Connection to Regulatory Brain failed. Please check backend status.', section: 'System' }
      ]);
      setReviewComplete(true); 
    } finally {
      setIsReviewing(false);
    }
  };

  const getSeverityColor = (type) => {
    switch(type?.toLowerCase()) {
      case 'critical': return 'text-red-500 bg-red-100 dark:bg-red-900/20';
      case 'warning': return 'text-amber-500 bg-amber-100 dark:bg-amber-900/20';
      case 'suggestion': return 'text-blue-500 bg-blue-100 dark:bg-blue-900/20';
      default: return 'text-slate-500 bg-slate-100 dark:bg-slate-800';
    }
  };

  const getSeverityIcon = (type) => {
    switch(type?.toLowerCase()) {
      case 'critical': return <AlertTriangle className="h-4 w-4" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'suggestion': return <Sparkles className="h-4 w-4 text-blue-500" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 p-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">AI Module Review</h2>
          <p className="text-muted-foreground">Automated compliance and quality check for {moduleName}</p>
        </div>
        <div className="flex gap-2">
          {reviewComplete && (
            <Button variant="outline" onClick={() => setReviewComplete(false)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Reset
            </Button>
          )}
          <Button onClick={startAIReview} disabled={isReviewing}>
            {isReviewing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Run Compliance Check
              </>
            )}
          </Button>
        </div>
      </div>

      {isReviewing && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Analyzing document structure and compliance...</span>
                <span className="animate-pulse">Processing</span>
              </div>
              <Progress value={isReviewing ? 66 : 0} className="animate-pulse" />
              <p className="text-xs text-muted-foreground">Validating against ICH E3 and FDA Guidance...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {reviewComplete && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
          {/* Left Column: Summary */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Review Summary</CardTitle>
              <CardDescription>Overall compliance status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center p-4">
                 <div className={`text-5xl font-bold mb-2 ${findings.some(f => f.type === 'critical') ? 'text-red-500' : 'text-green-500'}`}>
                    {findings.length === 0 ? '100%' : `${Math.max(0, 100 - (findings.length * 10))}%`}
                 </div>
                 <Badge variant={findings.some(f => f.type === 'critical') ? "destructive" : "outline"}>
                    {findings.some(f => f.type === 'critical') ? 'Action Required' : 'Ready for Review'}
                 </Badge>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                   <span>Critical Issues</span>
                   <span className="font-bold text-red-500">{findings.filter(f => f.type === 'critical').length}</span>
                </div>
                <div className="flex justify-between text-sm">
                   <span>Warnings</span>
                   <span className="font-bold text-amber-500">{findings.filter(f => f.type === 'warning').length}</span>
                </div>
                <div className="flex justify-between text-sm">
                   <span>Suggestions</span>
                   <span className="font-bold text-blue-500">{findings.filter(f => f.type === 'suggestion').length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right Column: Findings List */}
          <Card className="md:col-span-2 flex flex-col">
            <CardHeader>
              <div className="flex justify-between items-center">
                  <CardTitle>Detailed Findings ({findings.length})</CardTitle>
                  <Tabs defaultValue="all" className="w-[300px]" onValueChange={val => setActiveTab(val)}>
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="critical">Critical</TabsTrigger>
                        <TabsTrigger value="suggestion">Suggest</TabsTrigger>
                    </TabsList>
                  </Tabs>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
                <ScrollArea className="h-[400px] pr-4">
                    {findings.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-10 text-muted-foreground">
                            <CheckCircle className="h-12 w-12 mb-4 text-green-500" />
                            <p>No issues found. Great job!</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {findings.filter(f => activeTab === 'all' || f.type === activeTab).map((finding, idx) => (
                                <Alert key={idx} className={`border-l-4 ${
                                    finding.type === 'critical' ? 'border-l-red-500' : 
                                    finding.type === 'warning' ? 'border-l-amber-500' : 
                                    'border-l-blue-500'
                                }`}>
                                    <div className="flex items-start gap-4">
                                        <div className={`p-2 rounded-full ${getSeverityColor(finding.type)}`}>
                                            {getSeverityIcon(finding.type)}
                                        </div>
                                        <div className="flex-1">
                                            <AlertTitle className="flex justify-between items-center">
                                                <span>{finding.section || 'General'}</span>
                                                <Badge variant="outline" className="capitalize">{finding.type}</Badge>
                                            </AlertTitle>
                                            <AlertDescription className="mt-2 text-sm">
                                                {finding.message}
                                                {finding.citation && (
                                                    <div className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded">
                                                        Ref: {finding.citation}
                                                    </div>
                                                )}
                                            </AlertDescription>
                                            {finding.suggestion && (
                                                <div className="mt-3 text-sm bg-green-50 dark:bg-green-900/10 p-2 rounded border border-green-100 dark:border-green-900/30">
                                                    <span className="font-semibold text-green-700 dark:text-green-400">Suggested Fix: </span>
                                                    {finding.suggestion}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Alert>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
      
      {!reviewComplete && !isReviewing && (
        <div className="flex flex-col items-center justify-center h-[400px] border-2 border-dashed rounded-lg bg-muted/10">
          <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Ready to Review</h3>
          <p className="text-muted-foreground max-w-md text-center mt-2">
            Click "Run Compliance Check" to analyze the current module for compliance, consistency, and quality improvements.
          </p>
          <Button onClick={startAIReview} className="mt-6">
            <Sparkles className="mr-2 h-4 w-4" /> Run Compliance Check
          </Button>
        </div>
      )}
    </div>
  );
}
