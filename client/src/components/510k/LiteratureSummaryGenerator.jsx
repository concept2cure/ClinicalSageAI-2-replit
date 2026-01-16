/**
 * Literature Summary Generator Component
 *
 * This component provides an interface for generating AI-powered summaries
 * from multiple literature entries, supporting different summary types.
 */

import React, { useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/components/ui/toaster';
import {
  Loader2, BookOpen, FileText, Save, Copy, ArrowLeft, RefreshCw, BookMarked, Lightbulb, Scale, Info } from 'lucide-react'

import { useContext } from 'react';
import { useTenant } from '../../contexts/TenantContext.tsx';

// Summary types with descriptions
const SUMMARY_TYPES = [
  {
    id: 'standard',
    name: 'Standard Summary',
    description: 'A concise summary of key findings from all selected literature sources',
    icon: <BookOpen className="h-5 w-5" />,
  },
  {
    id: 'detailed',
    name: 'Detailed Analysis',
    description: 'A comprehensive analysis with methodologies, results, and clinical relevance',
    icon: <FileText className="h-5 w-5" />,
  },
  {
    id: 'critical',
    name: 'Critical Review',
    description: 'A critical evaluation highlighting strengths, limitations, and evidence quality',
    icon: <Lightbulb className="h-5 w-5" />,
  },
  {
    id: 'comparison',
    name: 'Comparative Assessment',
    description: 'A comparison of findings, methodologies, and outcomes across literature sources',
    icon: <Scale className="h-5 w-5" />,
  },
];

// Literature Entry Chip component
const LiteratureChip = ({ entry, onRemove }) => (
  <div className="inline-flex items-center bg-blue-50 rounded-full px-3 py-1 mr-2 mb-2 max-w-full">
    <div className="truncate text-sm">{entry.title}</div>
    {onRemove && (
      <button onClick={() => onRemove(entry.id)} className="ml-2 text-gray-500 hover:text-red-500">
        &times;
      </button>
    )}
  </div>
);

const LiteratureSummaryGenerator = ({ entries = [], onBackToSearch, documentId, documentType }) => {
  const [selectedEntries, setSelectedEntries] = useState(entries);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState(null);
  const [summaryType, setSummaryType] = useState('standard');
  const [customFocus, setCustomFocus] = useState('');

  const { toast } = useToast();
  const { organizationId } = useContext(TenantContext);

  // Remove an entry from the selected list
  const handleRemoveEntry = entryId => {
    setSelectedEntries(selectedEntries.filter(entry => entry.id !== entryId));
  };

  // Generate summary from selected entries
  const handleGenerateSummary = async () => {
    if (selectedEntries.length === 0) {
      toast({
        title: 'Cannot generate summary',
        description: 'Please select at least one literature entry',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      const response = await axios.post('/api/510k/literature/summaries', {
        literatureIds: selectedEntries.map(entry => entry.id),
        summaryType,
        focus: customFocus.trim() || undefined,
        organizationId: organizationId || 'default-org',
      });

      setGeneratedSummary(response.data);

      toast({
        title: 'Summary generated',
        description: 'The literature summary has been generated successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error generating summary:', error);
      toast({
        title: 'Failed to generate summary',
        description: error.response?.data?.error || 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Save summary to document
  const handleSaveSummary = async () => {
    if (!generatedSummary || !documentId) return;

    try {
      // This endpoint would need to be implemented
      const response = await axios.post(
        `/api/510k/literature/summaries/${generatedSummary.id}/save`,
        {
          documentId,
          documentType: documentType || '510k',
          sectionId: 'literature-section', // Replace with actual section ID
          organizationId: organizationId || 'default-org',
        }
      );

      toast({
        title: 'Summary saved',
        description: 'The literature summary has been added to your document',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error saving summary:', error);
      toast({
        title: 'Failed to save summary',
        description: error.response?.data?.error || 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  };

  // Copy summary to clipboard
  const handleCopySummary = () => {
    if (!generatedSummary) return;

    navigator.clipboard.writeText(generatedSummary.summary).then(
      () => {
        toast({
          title: 'Copied to clipboard',
          description: 'The summary has been copied to your clipboard',
          variant: 'default',
        });
      },
      err => {
        console.error('Could not copy text: ', err);
        toast({
          title: 'Failed to copy',
          description: 'Could not copy summary to clipboard',
          variant: 'destructive',
        });
      }
    );
  };

  return (
    <div className="literature-summary-generator">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center">
                <BookMarked className="mr-2 h-5 w-5" />
                Literature Summary Generator
              </CardTitle>
              <CardDescription>
                Generate AI-powered summaries from multiple literature sources
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onBackToSearch}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Search
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column: Configuration and Selected Entries */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Selected Literature</h3>
              <div className="border rounded-md p-3 min-h-[100px] mb-4">
                {selectedEntries.length === 0 ? (
                  <div className="text-gray-400 text-center py-4">
                    No literature selected. Add entries from the search results.
                  </div>
                ) : (
                  <div>
                    {selectedEntries.map(entry => (
                      <LiteratureChip key={entry.id} entry={entry} onRemove={handleRemoveEntry} />
                    ))}
                  </div>
                )}
              </div>

              <h3 className="text-lg font-semibold mb-3">Summary Configuration</h3>
              <div className="space-y-6">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Summary Type</Label>
                  <RadioGroup
                    defaultValue="standard"
                    value={summaryType}
                    onValueChange={setSummaryType}
                    className="space-y-3"
                  >
                    {SUMMARY_TYPES.map(type => (
                      <div className="flex items-start" key={type.id}>
                        <RadioGroupItem value={type.id} id={`type-${type.id}`} className="mt-1" />
                        <div className="ml-3">
                          <Label
                            htmlFor={`type-${type.id}`}
                            className="font-medium flex items-center"
                          >
                            {type.icon}
                            <span className="ml-2">{type.name}</span>
                          </Label>
                          <p className="text-sm text-gray-500">{type.description}</p>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label htmlFor="custom-focus" className="text-sm font-medium mb-2 block">
                    Custom Focus (Optional)
                  </Label>
                  <Input
                    id="custom-focus"
                    placeholder="e.g., Safety profile, Clinical efficacy, Device comparison"
                    value={customFocus}
                    onChange={e => setCustomFocus(e.target.value)}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Specify a particular aspect to focus on in the summary
                  </p>
                </div>

                <Button
                  onClick={handleGenerateSummary}
                  disabled={isGenerating || selectedEntries.length === 0}
                  className="w-full"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Generate Summary
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Right column: Generated Summary */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Generated Summary</h3>
              <div className="border rounded-md p-3 min-h-[400px] mb-4 relative">
                {isGenerating ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                    <p>Generating summary...</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Analyzing {selectedEntries.length} literature entries
                    </p>
                  </div>
                ) : generatedSummary ? (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <Badge variant="outline">
                        {SUMMARY_TYPES.find(t => t.id === generatedSummary.summary_type)?.name ||
                          'Summary'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {new Date(generatedSummary.created_at).toLocaleString()}
                      </Badge>
                    </div>
                    <Separator className="mb-3" />
                    <ScrollArea className="h-[330px] pr-4">
                      <div className="prose prose-sm max-w-none">
                        {generatedSummary.summary.split('\n').map((paragraph, index) => (
                          <p key={index}>{paragraph}</p>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Info className="h-10 w-10 text-gray-300 mb-2" />
                    <p className="text-gray-400">
                      Configure the summary options and click "Generate Summary"
                    </p>
                  </div>
                )}
              </div>

              {generatedSummary && (
                <div className="flex space-x-2">
                  <Button variant="outline" className="flex-grow" onClick={handleCopySummary}>
                    <Copy className="mr-2 h-4 w-4" /> Copy to Clipboard
                  </Button>
                  <Button className="flex-grow" onClick={handleSaveSummary} disabled={!documentId}>
                    <Save className="mr-2 h-4 w-4" /> Save to Document
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiteratureSummaryGenerator;
