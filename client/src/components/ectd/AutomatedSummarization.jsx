import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles, FileText, Copy, ArrowRight, Check, RefreshCw, Wand2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';

export default function AutomatedSummarization({ onInsert }) {
  const { toast } = useToast();
  const [inputText, setInputText] = useState('');
  const [summaryType, setSummaryType] = useState('executive');
  const [generatedSummary, setGeneratedSummary] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    if (!inputText) {
      toast({
        title: "Input Required",
        description: "Please enter text or select a source document to summarize.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    
    // Simulate AI processing
    setTimeout(() => {
      const summary = generateMockSummary(inputText, summaryType);
      setGeneratedSummary(summary);
      setIsGenerating(false);
      toast({
        title: "Summary Generated",
        description: "AI has successfully summarized the content.",
      });
    }, 2000);
  };

  const generateMockSummary = (text, type) => {
    const words = text.split(' ').length;
    let prefix = "";
    
    switch(type) {
      case 'executive':
        prefix = "**Executive Summary:**\n\nThe study demonstrated a statistically significant improvement in the primary endpoint. Safety profiles were consistent with known drug characteristics. Key findings include:\n- 15% reduction in symptoms.\n- No unexpected SAEs.\n\nRecommendation: Proceed to Phase 3.";
        break;
      case 'lay':
        prefix = "**Lay Summary:**\n\nThis study tested a new medicine for [Condition]. The results showed that patients who took the medicine felt better than those who took a dummy pill (placebo). Most side effects were mild, like headaches. The doctors believe this medicine is safe and works well.";
        break;
      case 'clinical':
        prefix = "**Clinical Overview (2.5):**\n\nEfficacy analysis reveals a robust treatment effect (p<0.001) across all subgroups. The safety dataset (N=450) indicates a favorable benefit-risk profile. Pharmacokinetic data suggests linear dose-proportionality.";
        break;
      default:
        prefix = "Summary generated.";
    }

    return `${prefix}\n\n(Based on input of ${words} words)`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedSummary);
    toast({ title: "Copied", description: "Summary copied to clipboard." });
  };

  const handleInsert = () => {
    if (onInsert) {
      onInsert(generatedSummary);
    } else {
      toast({ title: "Inserted", description: "Summary inserted into document." });
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      {/* Input Section */}
      <Card className="flex flex-col h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" /> Source Content
          </CardTitle>
          <CardDescription>Paste text or select a document section to summarize.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          <Textarea 
            placeholder="Paste clinical study report text, protocol details, or safety narratives here..." 
            className="h-full min-h-[300px] resize-none font-mono text-sm"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </CardContent>
        <CardFooter className="flex justify-between border-t pt-4">
          <Button variant="outline" size="sm" onClick={() => setInputText("The primary objective of this Phase 2 study was to evaluate the efficacy and safety of Drug X in patients with moderate to severe hypertension. A total of 200 patients were randomized 1:1 to receive either Drug X (50mg) or Placebo once daily for 12 weeks. The primary endpoint was the change from baseline in systolic blood pressure (SBP) at Week 12. Results showed a mean reduction in SBP of 15.4 mmHg in the Drug X group compared to 5.2 mmHg in the Placebo group (p<0.001). Adverse events were reported in 25% of patients in the Drug X group and 22% in the Placebo group. The most common AEs were headache and dizziness. No serious adverse events related to the study drug were observed.")}>
            Load Sample Text
          </Button>
          <div className="text-xs text-muted-foreground">
            {inputText.split(' ').filter(w => w).length} words
          </div>
        </CardFooter>
      </Card>

      {/* Output Section */}
      <Card className="flex flex-col h-full border-blue-100 shadow-sm">
        <CardHeader className="bg-blue-50/50">
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" /> AI Summary
            </CardTitle>
            <Select value={summaryType} onValueChange={setSummaryType}>
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue placeholder="Summary Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="executive">Executive Summary</SelectItem>
                <SelectItem value="lay">Lay Summary</SelectItem>
                <SelectItem value="clinical">Clinical Overview (2.5)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CardDescription>Generated content based on regulatory standards.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 pt-6">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">Analyzing medical terminology...</p>
            </div>
          ) : generatedSummary ? (
            <div className="prose prose-sm max-w-none p-4 bg-white border rounded-md h-full overflow-auto">
              <pre className="whitespace-pre-wrap font-sans text-sm">{generatedSummary}</pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-2">
              <Wand2 className="h-12 w-12 text-gray-300" />
              <p>Ready to generate summary</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between border-t pt-4 bg-blue-50/50">
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating}
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white"
          >
            {isGenerating ? 'Generating...' : 'Generate Summary'}
          </Button>
          
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={handleCopy} disabled={!generatedSummary}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button onClick={handleInsert} disabled={!generatedSummary} variant="secondary">
              Insert <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
