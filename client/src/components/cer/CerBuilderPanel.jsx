import React, { useState, useEffect } from 'react';
import { cerApiService } from '@/services/CerAPIService';
import LiteratureSearchPanel from './LiteratureSearchPanel';
import ComplianceScorePanel from './ComplianceScorePanel';
import EvidenceGapDetector from './EvidenceGapDetector';
import CerTooltipWrapper from './CerTooltipWrapper';
import CerOnboardingGuide from './CerOnboardingGuide';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2,
  FileText,
  BookOpen,
  FileDown,
  Plus,
  Trash2,
  Lightbulb,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useExportFAERS } from '../../hooks/useExportFAERS';
import CerPreviewPanel from './CerPreviewPanel';

export default function CerBuilderPanel({
  title,
  faers,
  comparators,
  sections,
  onTitleChange,
  onSectionsChange,
  onFaersChange,
  onComparatorsChange,
}) {
  const { toast } = useToast();
  const { exportToPDF, exportToWord } = useExportFAERS();

  const [selectedSectionType, setSelectedSectionType] = useState('benefit-risk');
  const [sectionContext, setSectionContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSection, setGeneratedSection] = useState(null);
  const [cerSections, setCerSections] = useState(sections || []);
  const [cerTitle, setCerTitle] = useState(title || 'Clinical Evaluation Report');

  // Sync local state with props
  useEffect(() => {
    setCerSections(sections || []);
  }, [sections]);

  useEffect(() => {
    setCerTitle(title || 'Clinical Evaluation Report');
  }, [title]);

  // Section type options
  const sectionTypes = [
    { id: 'benefit-risk', label: 'Benefit-Risk Analysis' },
    { id: 'safety', label: 'Safety Analysis' },
    { id: 'clinical-background', label: 'Clinical Background' },
    { id: 'device-description', label: 'Device Description' },
    { id: 'state-of-art', label: 'State of the Art Review' },
    { id: 'equivalence', label: 'Equivalence Assessment' },
    { id: 'literature-analysis', label: 'Literature Analysis' },
    { id: 'pms-data', label: 'Post-Market Surveillance Data' },
    { id: 'conclusion', label: 'Conclusion' },
  ];

  // Generate section using AI
  const generateSection = async () => {
    if (!sectionContext) {
      toast({
        title: 'Missing information',
        description: 'Please provide context for the section generation.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    console.log(
      'EMERGENCY FIX: Generating section',
      selectedSectionType,
      sectionContext.substring(0, 50)
    );

    try {
      // Fix: Changed from section to sectionType to match API service expectation
      const response = await fetch('/api/cer/generate-section', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          section: selectedSectionType,
          productName: cerTitle,
          context: sectionContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error generating section: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('EMERGENCY FIX: Section generated successfully', data);

      // If response includes a section property, use that
      if (data.section) {
        setGeneratedSection(data.section);
      } else {
        setGeneratedSection(data);
      }

      toast({
        title: 'Section generated',
        description: `${getSelectedSectionLabel()} section successfully generated.`,
      });
    } catch (error) {
      console.error('Error generating section:', error);
      toast({
        title: 'Generation failed',
        description: error.message || 'Failed to generate section. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Add the generated section to the report
  const addToReport = () => {
    if (!generatedSection) return;

    // Check if we need to handle additional metadata from AI generation
    const content = generatedSection.content;
    const model = generatedSection.model || 'gpt-4o';

    const newSection = {
      id: `section-${Date.now()}`,
      type: selectedSectionType,
      title: getSelectedSectionLabel(),
      content: content,
      markdown: true, // Flag to indicate markdown formatting
      dateAdded: new Date().toISOString(),
      metadata: {
        generatedBy: model,
        contextLength: sectionContext.length,
        regulatoryStandard: 'EU MDR 2017/745',
        complianceChecked: false,
      },
    };

    // Add to beginning if it's a device description or clinical background
    // otherwise add to the end
    let updatedSections;
    if (
      ['device-description', 'clinical-background'].includes(selectedSectionType) &&
      cerSections.length > 0
    ) {
      updatedSections = [newSection, ...cerSections];
    } else {
      updatedSections = [...cerSections, newSection];
    }

    setCerSections(updatedSections);
    onSectionsChange(updatedSections);

    // Show toast with additional model info if available
    toast({
      title: 'Section added',
      description: `${newSection.title} added to report${model ? ` (generated with ${model})` : ''}.`,
    });

    // Clear generated section and context for a fresh start
    setGeneratedSection(null);
    setSectionContext('');
  };

  // Get the human-readable label for the selected section type
  const getSelectedSectionLabel = () => {
    const section = sectionTypes.find(s => s.id === selectedSectionType);
    return section ? section.label : selectedSectionType;
  };

  // Handle title change
  const handleTitleChange = e => {
    const newTitle = e.target.value;
    setCerTitle(newTitle);
    onTitleChange(newTitle);
  };

  // Remove a section from the report
  const removeSection = sectionId => {
    const updatedSections = cerSections.filter(section => section.id !== sectionId);
    setCerSections(updatedSections);
    onSectionsChange(updatedSections);

    toast({
      title: 'Section removed',
      description: 'The section has been removed from your report.',
    });
  };

  return (
    <div className="space-y-4">
      {/* Section Generator Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left column - Section Generator */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white p-4 border border-[#e8e6dc] rounded">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#e8e6dc] pb-3 mb-3">
                <h3 className="text-base font-semibold text-[#141413]">Section Generator</h3>
                <Badge
                  variant="outline"
                  className="bg-[#faf0ec] text-[#5585b3] text-xs border-[#5585b3] px-2 py-0.5"
                >
                  AI-Powered
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sectionType" className="text-sm font-medium text-[#141413]">
                    Section Type
                  </Label>
                  <Select value={selectedSectionType} onValueChange={setSelectedSectionType}>
                    <SelectTrigger id="sectionType" className="h-9 border-[#e8e6dc] bg-white">
                      <SelectValue placeholder="Select section type" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-[#e8e6dc] shadow-lg max-h-80 overflow-y-auto z-50 mt-6">
                      <SelectGroup>
                        <SelectLabel className="text-xs font-semibold text-[#616161]">
                          CER Sections
                        </SelectLabel>
                        {sectionTypes.map(section => (
                          <SelectItem
                            key={section.id}
                            value={section.id}
                            className="text-sm hover:bg-[#f4f3ee] hover:text-[#141413] cursor-pointer"
                          >
                            {section.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="context" className="text-sm font-medium text-[#141413]">
                    Context Information
                  </Label>
                  <Textarea
                    id="context"
                    placeholder="Enter information to help generate this section..."
                    value={sectionContext}
                    onChange={e => setSectionContext(e.target.value)}
                    rows={5}
                    className="border-[#e8e6dc] focus:border-[#5585b3] focus:ring-1 focus:ring-[#5585b3] resize-none"
                  />
                  <p className="text-xs text-[#616161]">
                    Include specifics about your device or product for best results.
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={generateSection}
                    disabled={isGenerating || !sectionContext}
                    className="bg-[#5585b3] hover:bg-[#4a7399] text-white"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <span>Generate Section</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Generated Section Display */}
            {generatedSection && (
              <div className="bg-white border border-[#e8e6dc] rounded mt-4">
                <div className="p-4 border-b border-[#e8e6dc] bg-[#faf9f5]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-[#141413]">
                        {getSelectedSectionLabel()}
                      </h3>
                      <p className="text-xs text-[#616161] mt-1">
                        AI-generated content based on your inputs
                      </p>
                    </div>
                    {generatedSection.model && (
                      <Badge
                        variant="outline"
                        className="bg-[#faf0ec] text-[#5585b3] text-xs border-[#5585b3] px-2 py-0.5"
                      >
                        Model: {generatedSection.model}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-sm text-[#141413] leading-relaxed markdown-content">
                    {generatedSection.content.split('\n').map((paragraph, index) => {
                      // Handle Markdown heading formats
                      if (paragraph.startsWith('# ')) {
                        return (
                          <h1 key={index} className="text-xl font-bold mb-3">
                            {paragraph.replace('# ', '')}
                          </h1>
                        );
                      } else if (paragraph.startsWith('## ')) {
                        return (
                          <h2 key={index} className="text-lg font-semibold mb-3">
                            {paragraph.replace('## ', '')}
                          </h2>
                        );
                      } else if (paragraph.startsWith('### ')) {
                        return (
                          <h3 key={index} className="text-base font-semibold mb-3">
                            {paragraph.replace('### ', '')}
                          </h3>
                        );
                      } else if (paragraph.startsWith('- ')) {
                        // Handle bullet points
                        return (
                          <li key={index} className="ml-4 mb-2">
                            {paragraph.replace('- ', '')}
                          </li>
                        );
                      } else if (paragraph.trim() === '') {
                        // Handle empty lines
                        return <div key={index} className="h-2"></div>;
                      } else {
                        // Handle regular paragraphs
                        return (
                          <p key={index} className="mb-3 last:mb-0">
                            {paragraph}
                          </p>
                        );
                      }
                    })}
                  </div>
                </div>
                <div className="p-3 flex justify-end border-t border-[#e8e6dc] bg-[#faf9f5]">
                  <Button
                    onClick={addToReport}
                    className="bg-[#5585b3] hover:bg-[#4a7399] text-white"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    <span>Add to Report</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column - Report Sections */}
        <div className="space-y-4">
          <div className="bg-white p-4 border border-[#e8e6dc] rounded">
            <div className="flex items-center justify-between border-b border-[#e8e6dc] pb-3 mb-3">
              <h3 className="text-base font-semibold text-[#141413]">Report Sections</h3>
              <Badge
                variant="outline"
                className="text-xs bg-[#F5F5F5] text-[#616161] border-[#e8e6dc] px-2 py-0.5"
              >
                {cerSections.length} section{cerSections.length !== 1 ? 's' : ''}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="space-y-2">
                <Label htmlFor="report-title" className="text-sm font-medium text-[#141413]">
                  Report Title
                </Label>
                <Input
                  id="report-title"
                  value={cerTitle}
                  onChange={handleTitleChange}
                  className="h-9 border-[#e8e6dc] focus:border-[#5585b3] focus:ring-1 focus:ring-[#5585b3]"
                />
              </div>

              {cerSections.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 bg-[#faf9f5] rounded border border-[#e8e6dc] text-center">
                  <FileText className="h-8 w-8 text-[#8a8880] mb-2" />
                  <p className="text-sm text-[#141413] font-medium">No sections yet</p>
                  <p className="text-xs text-[#616161] mt-1">
                    Generate and add sections to build your report
                  </p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  {cerSections.map(section => (
                    <div
                      key={section.id}
                      className="p-3 border border-[#e8e6dc] rounded mb-2 bg-white hover:bg-[#f4f3ee]"
                    >
                      {/* Add Evidence Gap Detector before the section content */}
                      <EvidenceGapDetector
                        section={section}
                        onCitationNeeded={gap => {
                          toast({
                            title: 'Citation needed',
                            description: `Add support for claim: "${gap.claim}"`,
                            variant: 'default',
                          });
                        }}
                      />

                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium text-[#141413]">
                              <CerTooltipWrapper
                                content={
                                  <div>
                                    <p className="font-semibold mb-1">{section.title}</p>
                                    <p>
                                      Required by:{' '}
                                      {section.metadata?.regulatoryStandard || 'EU MDR 2017/745'}
                                    </p>
                                    <p className="mt-1">
                                      Last updated: {new Date(section.dateAdded).toLocaleString()}
                                    </p>
                                  </div>
                                }
                                showIcon={false}
                              >
                                {section.title}
                              </CerTooltipWrapper>
                            </h4>
                            {section.metadata?.generatedBy && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-[#faf0ec] text-[#5585b3] border-[#5585b3] px-2 py-0.5"
                              >
                                AI
                              </Badge>
                            )}
                            {section.metadata?.complianceChecked && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-[#E8F7EE] text-[#107C41] border-[#107C41] px-2 py-0.5"
                              >
                                Verified
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-[#616161] mt-1 line-clamp-2">
                            {section.content.substring(0, 100)}...
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-[#616161]">
                              {new Date(section.dateAdded).toLocaleDateString()}
                            </p>
                            {section.metadata?.regulatoryStandard && (
                              <p className="text-xs text-[#616161]">
                                {section.metadata.regulatoryStandard}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSection(section.id)}
                          className="h-8 w-8 p-0 text-[#616161] hover:text-[#4a7399] hover:bg-[#FFF4CE]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FAERS Data Panel */}
      {faers && faers.length > 0 && (
        <div className="bg-white p-4 border border-[#e8e6dc] rounded mt-4">
          <div className="flex items-center justify-between border-b border-[#e8e6dc] pb-3 mb-3">
            <h3 className="text-base font-semibold text-[#141413]">FDA FAERS Data Integration</h3>
            <Badge
              variant="outline"
              className="bg-[#faf0ec] text-[#5585b3] text-xs border-[#5585b3] px-2 py-0.5"
            >
              Auto-included
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="col-span-3">
              <p className="text-sm text-[#616161]">
                FAERS data for your product has been automatically integrated into the report. This
                data will appear in the Safety Analysis section of your final document.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
