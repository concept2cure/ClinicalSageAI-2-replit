import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '../../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';

export const AiSectionGenerator = ({ onSectionGenerated }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sectionType, setSectionType] = useState('safety');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');

  const sectionTypes = [
    {
      id: 'safety',
      name: 'Safety Analysis',
      description: 'Analysis of device safety based on available data',
    },
    {
      id: 'clinical',
      name: 'Clinical Evaluation',
      description: 'Evaluation of clinical performance and evidence',
    },
    { id: 'risk', name: 'Risk Assessment', description: 'Comprehensive risk-benefit analysis' },
    {
      id: 'literature',
      name: 'Literature Review',
      description: 'Analysis of relevant scientific literature',
    },
    {
      id: 'methodology',
      name: 'Evaluation Methodology',
      description: 'Description of evaluation methods and criteria',
    },
  ];

  const generateSection = async () => {
    setIsGenerating(true);
    setGeneratedContent('');

    try {
      const response = await fetch('/api/cer/generate-section', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sectionType,
          prompt: prompt || getDefaultPrompt(sectionType),
        }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();
      setGeneratedContent(data.content);

      if (onSectionGenerated) {
        onSectionGenerated({ sectionType, content: data.content });
      }
    } catch (error) {
      console.error('Error generating section:', error);
      setGeneratedContent(`Error generating content: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const getDefaultPrompt = type => {
    switch (type) {
      case 'safety':
        return 'Generate a comprehensive safety analysis section for a cardiac monitoring device based on FAERS data';
      case 'clinical':
        return 'Create a clinical evaluation section summarizing the clinical performance evidence';
      case 'risk':
        return 'Develop a structured risk-benefit analysis section following EU MDR guidelines';
      case 'literature':
        return 'Provide a literature review section analyzing the most relevant recent publications';
      case 'methodology':
        return 'Write a methodology section explaining the approach used for device evaluation';
      default:
        return 'Generate a section for my clinical evaluation report';
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="flex items-center">
            <Sparkles className="h-4 w-4 mr-2 text-blue-500" /> Generate Section
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>AI-Powered Section Generator</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-4">
            <div className="space-y-2">
              <Label htmlFor="section-type">Section Type</Label>
              <Select value={sectionType} onValueChange={setSectionType}>
                <SelectTrigger id="section-type">
                  <SelectValue placeholder="Select a section type" />
                </SelectTrigger>
                <SelectContent>
                  {sectionTypes.map(type => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {sectionTypes.find(t => t.id === sectionType)?.description}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-prompt">Custom Instructions (Optional)</Label>
              <Textarea
                id="custom-prompt"
                placeholder={getDefaultPrompt(sectionType)}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-gray-500">
                Leave blank to use the default prompt for this section type.
              </p>
            </div>

            {generatedContent && (
              <div className="space-y-2 mt-4">
                <Label>Generated Content</Label>
                <div className="p-4 bg-gray-50 rounded-md overflow-auto max-h-64 text-sm">
                  {generatedContent.split('\n').map((line, i) => (
                    <p key={i} className="mb-2">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={generateSection} disabled={isGenerating} className="relative">
              {isGenerating ? (
                <>
                  <span className="animate-pulse">Generating...</span>
                  <Sparkles className="ml-2 h-4 w-4 animate-spin" />
                </>
              ) : (
                <>
                  Generate with AI
                  <Sparkles className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
