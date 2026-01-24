import React, { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// UI Components
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';

// Icons
import {
  Sparkles,
  RotateCw,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  CheckCircle,
  Loader2,
  History,
  FileText,
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronUp,
  Edit,
  Clock,
  PenTool,
  RotateCcw,
  Eye,
  Save,
  Zap,
  Lightbulb,
  MessageSquare,
  MoreHorizontal,
} from 'lucide-react';

/**
 * TrialSage AI Writer Panel Component
 *
 * This component handles:
 * 1. Input window for prompts + data preview
 * 2. LLM-generated text displayed inline (editable)
 * 3. Accept/Reject buttons + version history
 * 4. Reuse or regenerate by section
 */
const TrialSageAIWriter = ({
  sectionId,
  sectionTitle,
  sectionContent = '',
  sectionType = 'standard',
  templateData,
  documentData,
  documentType = 'cer',
  framework = 'mdr',
  onSave,
  onCancel,
}) => {
  const [content, setContent] = useState(sectionContent);
  const [originalContent, setOriginalContent] = useState(sectionContent);
  const [prompt, setPrompt] = useState('');
  const [activeTab, setActiveTab] = useState('editor');
  const [selectedTone, setSelectedTone] = useState('regulatory');
  const [versions, setVersions] = useState([
    { id: 1, content: sectionContent, timestamp: new Date().toISOString(), source: 'template' },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [useStructuredPrompt, setUseStructuredPrompt] = useState(true);
  const [dataContext, setDataContext] = useState([]);
  const textareaRef = useRef(null);
  const { toast } = useToast();

  // Load relevant context from document data
  useEffect(() => {
    if (documentData) {
      // In a real app, this would intelligently extract relevant context
      // for the current section from the document data
      extractRelevantContext();
    }
  }, [documentData, sectionId]);

  // Extract relevant context from document data
  const extractRelevantContext = () => {
    // This is a simplified implementation
    // In a real app, this would use AI to identify relevant sections
    const relevantContext = [];

    if (!documentData) return;

    // Extract relevant information from document data
    Object.entries(documentData).forEach(([fileId, fileContent]) => {
      // Check for relevant sections based on section type
      if (fileContent.sections) {
        fileContent.sections.forEach(section => {
          const title = section.title?.toLowerCase() || '';
          const currentSectionTitle = sectionTitle.toLowerCase();

          // Match based on section title similarity
          if (
            title.includes(currentSectionTitle) ||
            currentSectionTitle.includes(title) ||
            (sectionType === 'clinical' &&
              (title.includes('clinical') || title.includes('study') || title.includes('trial'))) ||
            (sectionType === 'safety' &&
              (title.includes('safety') || title.includes('adverse') || title.includes('risk'))) ||
            (sectionType === 'performance' &&
              (title.includes('performance') ||
                title.includes('efficacy') ||
                title.includes('benefit')))
          ) {
            relevantContext.push({
              source: fileContent.fileName || 'Document',
              title: section.title,
              content: section.content?.substring(0, 200) + '...',
              relevance: 'high',
            });
          }
        });
      }

      // Extract relevant findings if available
      if (fileContent.keyFindings) {
        relevantContext.push({
          source: fileContent.fileName || 'Document',
          title: 'Key Findings',
          content: fileContent.keyFindings.join('. '),
          relevance: 'high',
        });
      }
    });

    // If we didn't find anything specifically relevant, add general context
    if (relevantContext.length === 0 && Object.keys(documentData).length > 0) {
      const firstFileContent = documentData[Object.keys(documentData)[0]];
      if (firstFileContent.sections && firstFileContent.sections.length > 0) {
        relevantContext.push({
          source: firstFileContent.fileName || 'Document',
          title: 'General Context',
          content: 'No specifically relevant content found. Using general context.',
          relevance: 'low',
        });
      }
    }

    setDataContext(relevantContext);
  };

  // Generate content using GPT-4 Turbo through our API
  const generateMutation = useMutation({
    mutationFn: async data => {
      setIsGenerating(true);
      const response = await apiRequest('POST', '/api/cer/ai/generate', data);
      return response.json();
    },
    onSuccess: data => {
      // Update the content
      setContent(data.generatedContent);

      // Add to version history
      setVersions(prev => [
        ...prev,
        {
          id: prev.length + 1,
          content: data.generatedContent,
          timestamp: new Date().toISOString(),
          source: 'ai',
        },
      ]);

      toast({
        title: 'Content generated',
        description: 'AI-generated content is ready for your review',
      });

      setIsGenerating(false);
    },
    onError: error => {
      console.error('Error generating content:', error);
      toast({
        title: 'Generation failed',
        description: 'There was a problem generating the content. Please try again.',
        variant: 'destructive',
      });
      setIsGenerating(false);
    },
  });

  // Handle generating content
  const handleGenerate = () => {
    // Generate a default prompt if none is provided
    const promptToUse = prompt || generateDefaultPrompt();

    generateMutation.mutate({
      prompt: promptToUse,
      sectionType,
      sectionTitle,
      currentContent: content,
      templateData,
      documentContext: dataContext.map(ctx => ({
        source: ctx.source,
        content: ctx.content,
      })),
      tone: selectedTone,
      documentType,
      framework,
      useStructuredOutput: useStructuredPrompt,
    });
  };

  // Generate a default prompt based on the section
  const generateDefaultPrompt = () => {
    return `Write a ${selectedTone} ${sectionTitle} section for a ${documentType.toUpperCase()} according to ${framework.toUpperCase()} guidelines.`;
  };

  // Handle selecting a previous version
  const handleSelectVersion = version => {
    setContent(version.content);
  };

  // Handle saving content
  const handleSave = () => {
    if (onSave) {
      onSave(content);
    }

    toast({
      title: 'Content saved',
      description: 'Your content has been saved successfully',
    });
  };

  // Handle cancelling changes
  const handleCancel = () => {
    setContent(originalContent);
    if (onCancel) {
      onCancel();
    }
  };

  // Regulatory style options
  const toneOptions = [
    {
      id: 'regulatory',
      label: 'Regulatory',
      description: 'Formal, precise, compliance-focused language appropriate for submissions',
    },
    {
      id: 'scientific',
      label: 'Scientific',
      description: 'Technical, evidence-based language focused on methods and results',
    },
    {
      id: 'clinical',
      label: 'Clinical',
      description: 'Medical terminology with focus on patient outcomes and interventions',
    },
    {
      id: 'lay',
      label: 'Lay Summary',
      description: 'Non-technical language suitable for patient information or summaries',
    },
  ];

  return (
    <div className="w-full">
      <div className="flex flex-col lg:flex-row lg:space-x-6">
        {/* Left panel: Editor */}
        <div className="lg:flex-1">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center">
                <PenTool className="mr-2 h-5 w-5 text-blue-600" />
                {sectionTitle}
              </h2>
              <TabsList>
                <TabsTrigger value="editor">Editor</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="editor">
              <Card className="mb-4">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">Content Editor</CardTitle>
                      <CardDescription>
                        Edit the section content manually or use AI assistance
                      </CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAIPrompt(!showAIPrompt)}
                      >
                        <Bot className="h-4 w-4 mr-2" />
                        AI Prompt
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleSave}>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {showAIPrompt && (
                    <div className="mb-4 border rounded-lg p-4 bg-blue-50">
                      <div className="flex justify-between items-start mb-3">
                        <Label className="text-blue-700 font-medium">AI Writing Assistant</Label>
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center space-x-2">
                            <Switch
                              id="structuredPrompt"
                              checked={useStructuredPrompt}
                              onCheckedChange={setUseStructuredPrompt}
                            />
                            <Label htmlFor="structuredPrompt" className="text-xs">
                              Structured Output
                            </Label>
                          </div>
                          <Select value={selectedTone} onValueChange={setSelectedTone}>
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                              <SelectValue placeholder="Select tone" />
                            </SelectTrigger>
                            <SelectContent>
                              {toneOptions.map(tone => (
                                <SelectItem key={tone.id} value={tone.id} className="text-xs">
                                  {tone.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Textarea
                        placeholder={`Enter a prompt, e.g., "Write a ${sectionTitle} section that highlights safety aspects..."`}
                        className="mb-3"
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        rows={3}
                      />

                      <div className="flex justify-between items-center">
                        <div className="text-xs text-blue-600">
                          <Tooltip>
                            <TooltipTrigger>
                              <div className="flex items-center">
                                <Lightbulb className="h-3 w-3 mr-1" />
                                <span>Using {dataContext.length} relevant sections as context</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>AI will use the context from your uploaded documents</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <Button size="sm" disabled={isGenerating} onClick={handleGenerate}>
                          {isGenerating ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Generate Content
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  <Textarea
                    ref={textareaRef}
                    className="min-h-[400px] font-mono text-sm"
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Enter or generate content for this section..."
                  />

                  <div className="mt-4 flex justify-between items-center text-xs text-gray-500">
                    <div>
                      {content.trim() === originalContent.trim() ? (
                        <span className="text-green-600 flex items-center">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          No unsaved changes
                        </span>
                      ) : (
                        <span className="text-amber-600 flex items-center">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Unsaved changes
                        </span>
                      )}
                    </div>
                    <div>
                      {content.length} characters | {content.split(/\s+/).filter(Boolean).length}{' '}
                      words
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="bg-gray-50 border-t flex justify-between py-3">
                  <Button variant="ghost" size="sm" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setContent(originalContent)}
                      disabled={content === originalContent}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Reset
                    </Button>
                    <Button size="sm" onClick={handleSave}>
                      <Save className="h-4 w-4 mr-1" />
                      Save
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="preview">
              <Card>
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Preview: {sectionTitle}</span>
                    <Button variant="outline" size="sm" onClick={() => setActiveTab('editor')}>
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="prose max-w-none">
                    {/* This would be replaced with a properly formatted preview */}
                    <div className="whitespace-pre-wrap">
                      {content || <em className="text-gray-400">No content to preview</em>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right panel: Context, Versions, Guidelines */}
        <div className="lg:w-80 mt-4 lg:mt-0">
          <div className="space-y-4">
            {/* Version History */}
            <Accordion type="single" collapsible defaultValue="versions">
              <AccordionItem value="versions" className="border rounded-lg overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center">
                    <History className="h-4 w-4 mr-2 text-blue-600" />
                    <span>Version History</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="border-t">
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2 p-3">
                      {versions.map((version, index) => (
                        <div
                          key={version.id}
                          className={`p-2 rounded-md cursor-pointer hover:bg-gray-100 ${
                            content === version.content
                              ? 'bg-blue-50 border border-blue-200'
                              : 'border'
                          }`}
                          onClick={() => handleSelectVersion(version)}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center">
                              {version.source === 'ai' ? (
                                <Badge
                                  variant="outline"
                                  className="bg-purple-50 border-purple-200 text-purple-700 text-xs"
                                >
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  AI
                                </Badge>
                              ) : version.source === 'user' ? (
                                <Badge
                                  variant="outline"
                                  className="bg-blue-50 border-blue-200 text-blue-700 text-xs"
                                >
                                  <Edit className="h-3 w-3 mr-1" />
                                  User
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-gray-50 border-gray-200 text-gray-700 text-xs"
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  Template
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(version.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-xs mt-1 text-gray-600 line-clamp-2">
                            {version.content.substring(0, 100)}...
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Document Context */}
            <Accordion type="single" collapsible defaultValue="context">
              <AccordionItem value="context" className="border rounded-lg overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center">
                    <FileJson className="h-4 w-4 mr-2 text-blue-600" />
                    <span>Document Context</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="border-t">
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-3 p-3">
                      {dataContext.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-sm text-gray-500">No relevant context found</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Upload documents to provide context for AI generation
                          </p>
                        </div>
                      ) : (
                        dataContext.map((ctx, idx) => (
                          <div key={idx} className="border rounded-md p-2">
                            <div className="flex items-center justify-between">
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  ctx.relevance === 'high'
                                    ? 'bg-green-50 border-green-200 text-green-700'
                                    : 'bg-amber-50 border-amber-200 text-amber-700'
                                }`}
                              >
                                {ctx.relevance === 'high' ? (
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                ) : (
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                )}
                                {ctx.relevance === 'high' ? 'High relevance' : 'Low relevance'}
                              </Badge>
                              <span className="text-xs text-gray-500">{ctx.source}</span>
                            </div>
                            <h5 className="text-xs font-medium mt-1">{ctx.title}</h5>
                            <p className="text-xs text-gray-600 mt-1">{ctx.content}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Regulatory Guidelines */}
            <Accordion type="single" collapsible>
              <AccordionItem value="guidelines" className="border rounded-lg overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center">
                    <Globe className="h-4 w-4 mr-2 text-blue-600" />
                    <span>Regulatory Guidelines</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="border-t">
                  <ScrollArea className="h-[200px]">
                    <div className="p-3">
                      {framework === 'mdr' && (
                        <div className="space-y-3">
                          <div className="bg-amber-50 p-2 rounded-md border border-amber-100">
                            <h5 className="text-xs font-medium text-amber-800">EU MDR Guidance</h5>
                            <p className="text-xs text-amber-700 mt-1">
                              According to MEDDEV 2.7/1 rev. 4, this section should include:
                            </p>
                            <ul className="text-xs text-amber-700 mt-1 list-disc pl-4 space-y-1">
                              <li>Scope of the clinical evaluation</li>
                              <li>Clinical data identification and appraisal</li>
                              <li>Analysis of clinical data</li>
                              <li>Conclusions on benefit-risk profile</li>
                            </ul>
                          </div>

                          <Alert className="py-2">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle className="text-xs font-medium">MDR Article 61</AlertTitle>
                            <AlertDescription className="text-xs">
                              Clinical evaluation shall follow a defined and methodologically sound
                              procedure.
                            </AlertDescription>
                          </Alert>
                        </div>
                      )}

                      {framework === 'fda' && (
                        <div className="space-y-3">
                          <div className="bg-amber-50 p-2 rounded-md border border-amber-100">
                            <h5 className="text-xs font-medium text-amber-800">
                              FDA 510(k) Guidance
                            </h5>
                            <p className="text-xs text-amber-700 mt-1">
                              For a 510(k) submission, this section should demonstrate:
                            </p>
                            <ul className="text-xs text-amber-700 mt-1 list-disc pl-4 space-y-1">
                              <li>Substantial equivalence to predicate device</li>
                              <li>Performance data supporting safety and effectiveness</li>
                              <li>Risk analysis and mitigation strategies</li>
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Tone Selector */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Writing Style</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={selectedTone}
                  onValueChange={setSelectedTone}
                  className="space-y-2"
                >
                  {toneOptions.map(tone => (
                    <div key={tone.id} className="flex items-start space-x-2">
                      <RadioGroupItem id={`tone-${tone.id}`} value={tone.id} />
                      <div>
                        <Label htmlFor={`tone-${tone.id}`} className="text-sm">
                          {tone.label}
                        </Label>
                        <p className="text-xs text-gray-500">{tone.description}</p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
                <Button
                  className="w-full mt-3"
                  size="sm"
                  disabled={isGenerating}
                  onClick={handleGenerate}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate with Style
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrialSageAIWriter;
