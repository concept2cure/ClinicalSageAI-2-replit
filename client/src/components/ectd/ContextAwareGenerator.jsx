import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brain, Sparkles, FileText, CheckCircle, AlertCircle, ArrowRight, RefreshCw, BookOpen } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';

const ECTD_SECTIONS = [
  { 
    id: '2.2', 
    title: '2.2 Introduction', 
    rules: ['State the proprietary name', 'Define the pharmacological class', 'Briefly describe the indication'],
    template: 'The proprietary name of the drug substance is [Name]. It belongs to the pharmacological class of [Class]. This application seeks approval for the indication of [Indication].'
  },
  { 
    id: '2.3', 
    title: '2.3 Quality Overall Summary', 
    rules: ['Summarize drug substance characteristics', 'Describe manufacturing process', 'Confirm stability data'],
    template: 'The drug substance [Name] is a [Chemical Structure]. The manufacturing process involves [Steps]. Stability studies demonstrate [Duration] shelf-life at [Conditions].'
  },
  { 
    id: '2.4', 
    title: '2.4 Nonclinical Overview', 
    rules: ['Assess pharmacological strategy', 'Evaluate toxicological profile', 'Relate findings to human safety'],
    template: 'Nonclinical studies demonstrate a favorable pharmacological profile. Toxicology studies in [Species] revealed no unexpected safety signals. The NOAEL was determined to be [Value].'
  },
  { 
    id: '2.5', 
    title: '2.5 Clinical Overview', 
    rules: ['Integrated analysis of benefits and risks', 'Critical evaluation of efficacy', 'Justification of dose'],
    template: 'The clinical development program comprised [Number] studies. Efficacy was demonstrated in the pivotal Phase 3 trials (Study [ID]). The benefit-risk profile supports approval for [Indication].'
  },
  { 
    id: '2.7.3', 
    title: '2.7.3 Summary of Clinical Efficacy', 
    rules: ['Analyze primary endpoints', 'Compare with control/placebo', 'Discuss subgroup analysis'],
    template: 'In the pivotal study [ID], the primary endpoint of [Endpoint] was met with statistical significance (p<0.001). The treatment effect was consistent across age and gender subgroups.'
  },
  { 
    id: '2.7.4', 
    title: '2.7.4 Summary of Clinical Safety', 
    rules: ['Analyze adverse events', 'Evaluate laboratory abnormalities', 'Discuss special safety topics'],
    template: 'Exposure to [Drug] was evaluated in [N] subjects. The most common adverse events were [AE1] and [AE2]. No new safety signals were identified in the long-term extension.'
  }
];

export default function ContextAwareGenerator({ onInsert }) {
  const { toast } = useToast();
  const [selectedSection, setSelectedSection] = useState(ECTD_SECTIONS[3].id); // Default to 2.5
  const [inputContext, setInputContext] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const currentSection = ECTD_SECTIONS.find(s => s.id === selectedSection);

  const handleGenerate = () => {
    setIsGenerating(true);
    
    // Simulate AI Contextual Generation
    setTimeout(() => {
      let content = `**DRAFT FOR SECTION ${currentSection.id}**\n\n`;
      
      // Simulate using the template and input
      if (inputContext) {
        content += `Based on the provided data: "${inputContext.substring(0, 50)}..."\n\n`;
        content += currentSection.template.replace('[Name]', 'CardioFix').replace('[Indication]', 'Hypertension').replace('[ID]', 'CF-301');
        content += `\n\nSpecific Analysis:\nThe data supports the requirements for ${currentSection.title}. `;
        content += `As required by ICH M4 guidelines, this section addresses ${currentSection.rules[0].toLowerCase()}.`;
      } else {
        content += currentSection.template;
        content += "\n\n[Note: Please provide specific study data to generate a more detailed draft.]";
      }

      setGeneratedContent(content);
      setIsGenerating(false);
      toast({
        title: "Content Generated",
        description: `Draft created for Section ${currentSection.id}`,
      });
    }, 1500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      {/* Left Panel: Context Configuration */}
      <div className="lg:col-span-4 flex flex-col gap-4">
        <Card className="flex-1 flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" /> Context Engine
            </CardTitle>
            <CardDescription>Configure the AI for specific eCTD sections.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target eCTD Section</label>
              <Select value={selectedSection} onValueChange={setSelectedSection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ECTD_SECTIONS.map(section => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2 text-blue-800 font-medium text-sm">
                <BookOpen className="h-4 w-4" /> Regulatory Context
              </div>
              <ul className="space-y-1">
                {currentSection?.rules.map((rule, idx) => (
                  <li key={idx} className="text-xs text-blue-700 flex items-start gap-2">
                    <CheckCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2 flex-1 flex flex-col">
              <label className="text-sm font-medium">Key Data Points / Context</label>
              <Textarea 
                placeholder="Paste key findings, p-values, or study IDs here..." 
                className="flex-1 resize-none min-h-[150px]"
                value={inputContext}
                onChange={(e) => setInputContext(e.target.value)}
              />
              <Button variant="outline" size="sm" onClick={() => setInputContext("Study CF-301 met its primary endpoint with p=0.002. Safety profile was comparable to placebo. No SAEs reported.")}>
                Load Sample Data
              </Button>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" /> Generate Draft
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Right Panel: Generated Content */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-slate-600" /> Generated Draft
              </CardTitle>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                ICH Compliant
              </Badge>
            </div>
            <CardDescription>
              AI-generated content tailored for {currentSection?.title}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <div className="h-full p-6 bg-slate-50/50">
              {generatedContent ? (
                <div className="bg-white border shadow-sm rounded-lg p-6 h-full overflow-y-auto prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-slate-800">{generatedContent}</pre>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                  <Brain className="h-12 w-12 mb-2 opacity-20" />
                  <p>Select a section and generate content</p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="justify-between border-t pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              <span>Always review AI-generated content for accuracy.</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setGeneratedContent('')}>Clear</Button>
              <Button 
                onClick={() => onInsert && onInsert(generatedContent)}
                disabled={!generatedContent}
              >
                Insert into Document <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
