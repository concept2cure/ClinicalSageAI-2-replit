/**
 * Concept2Cure - Artifacts Catalog
 * 
 * Claude.ai-style template catalog for regulatory artifacts.
 * Browse, search, and use templates.
 */

import React, { useState, useMemo } from 'react';
import type { ArtifactTemplate, SubmissionType, ArtifactType, ArtifactCategory } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  FileText,
  BarChart3,
  Table2,
  Workflow,
  Network,
  Star,
  Download,
  Users,
  Building2,
  Sparkles,
  Filter,
  X,
  ChevronRight,
  Clock,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// MOCK TEMPLATES DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_TEMPLATES: ArtifactTemplate[] = [
  {
    id: 'tpl-1',
    name: '510(k) Cover Letter',
    description: 'Standard FDA 510(k) cover letter following official format guidelines',
    type: 'cover_letter',
    category: 'document',
    content: `[DATE]

Food and Drug Administration
Center for Devices and Radiological Health
Document Mail Center - WO66-G609
10903 New Hampshire Avenue
Silver Spring, MD 20993-0002

Re: 510(k) Premarket Notification
Device Name: [DEVICE NAME]
Classification: [PRODUCT CODE]

Dear Sir or Madam:

[COMPANY NAME] is submitting this 510(k) premarket notification...`,
    submissionTypes: ['510K'],
    tags: ['FDA', 'cover letter', 'medical device'],
    author: 'TrialSage',
    organization: 'Official',
    usageCount: 2847,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-2',
    name: 'Device Description Template',
    description: 'Comprehensive device description following FDA guidance for 510(k) submissions',
    type: 'device_description',
    category: 'document',
    content: `DEVICE DESCRIPTION

1. Device Name and Classification
[Device Trade Name]
Product Code: [CODE]
Regulation Number: [NUMBER]

2. Intended Use
[Describe the intended use of the device]

3. Device Description
[Detailed physical and functional description]

4. Technological Characteristics
[List key technological features]

5. Principles of Operation
[Explain how the device works]`,
    submissionTypes: ['510K', 'PMA', 'DE_NOVO'],
    tags: ['device description', 'technical', 'FDA'],
    author: 'TrialSage',
    organization: 'Official',
    usageCount: 1923,
    rating: 4.8,
    isOfficial: true,
    createdAt: new Date('2024-02-10'),
    updatedAt: new Date('2024-11-15'),
  },
  {
    id: 'tpl-3',
    name: 'Substantial Equivalence Summary',
    description: 'SE summary comparing device to predicate with technological characteristics',
    type: 'se_summary',
    category: 'document',
    content: `SUBSTANTIAL EQUIVALENCE SUMMARY

1. INTRODUCTION
This summary demonstrates substantial equivalence between [SUBJECT DEVICE] and [PREDICATE DEVICE].

2. PREDICATE DEVICE INFORMATION
K Number: [K-NUMBER]
Device Name: [NAME]
Manufacturer: [MANUFACTURER]

3. COMPARISON OF INTENDED USE
[Comparison table]

4. COMPARISON OF TECHNOLOGICAL CHARACTERISTICS
[Detailed comparison]

5. CONCLUSION
Based on the above analysis, [SUBJECT DEVICE] is substantially equivalent to [PREDICATE DEVICE].`,
    submissionTypes: ['510K'],
    tags: ['SE', 'predicate', 'comparison'],
    author: 'TrialSage',
    organization: 'Official',
    usageCount: 1456,
    rating: 4.7,
    isOfficial: true,
    createdAt: new Date('2024-03-05'),
    updatedAt: new Date('2024-10-20'),
  },
  {
    id: 'tpl-4',
    name: 'IND Cover Letter',
    description: 'FDA IND application cover letter for investigational new drugs',
    type: 'cover_letter',
    category: 'document',
    content: `[DATE]

Food and Drug Administration
Center for Drug Evaluation and Research
Central Document Room
5901-B Ammendale Road
Beltsville, MD 20705-1266

RE: Investigational New Drug Application
Drug Name: [DRUG NAME]
IND Number: [NUMBER] (if amendment)

Dear Sir or Madam:

[SPONSOR NAME] hereby submits this Investigational New Drug (IND) application...`,
    submissionTypes: ['IND'],
    tags: ['IND', 'drug', 'clinical trial', 'cover letter'],
    author: 'TrialSage',
    organization: 'Official',
    usageCount: 1234,
    rating: 4.8,
    isOfficial: true,
    createdAt: new Date('2024-04-01'),
    updatedAt: new Date('2024-09-15'),
  },
  {
    id: 'tpl-5',
    name: '7-Phase Submission Pyramid',
    description: 'Interactive Gantt chart showing 510(k) submission phases and timeline',
    type: 'pyramid_gantt',
    category: 'interactive',
    content: JSON.stringify({
      phases: [
        { id: 1, name: 'Pre-Submission', weeks: 4, status: 'planning' },
        { id: 2, name: 'Design Documentation', weeks: 6, status: 'planning' },
        { id: 3, name: 'Testing & Validation', weeks: 8, status: 'planning' },
        { id: 4, name: 'Clinical Evidence', weeks: 4, status: 'planning' },
        { id: 5, name: 'Submission Assembly', weeks: 3, status: 'planning' },
        { id: 6, name: 'FDA Review', weeks: 12, status: 'planning' },
        { id: 7, name: 'Clearance & Launch', weeks: 2, status: 'planning' },
      ],
    }),
    submissionTypes: ['510K'],
    tags: ['timeline', 'gantt', 'planning', 'phases'],
    author: 'TrialSage',
    organization: 'Official',
    usageCount: 987,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-05-15'),
    updatedAt: new Date('2024-08-30'),
  },
  {
    id: 'tpl-6',
    name: 'Risk Analysis Heatmap',
    description: 'Interactive risk visualization for regulatory submission risks',
    type: 'risk_heatmap',
    category: 'visualization',
    content: JSON.stringify({
      categories: ['Documentation', 'Testing', 'Clinical', 'Compliance', 'Technical'],
      template: true,
    }),
    submissionTypes: ['510K', 'IND', 'NDA', 'PMA'],
    tags: ['risk', 'heatmap', 'analysis', 'visualization'],
    author: 'TrialSage',
    organization: 'Official',
    usageCount: 876,
    rating: 4.6,
    isOfficial: true,
    createdAt: new Date('2024-06-01'),
    updatedAt: new Date('2024-07-20'),
  },
  {
    id: 'tpl-7',
    name: 'Clinical Summary Template',
    description: 'Template for summarizing clinical evidence and study results',
    type: 'clinical_summary',
    category: 'document',
    content: `CLINICAL SUMMARY

1. OVERVIEW
[Brief overview of clinical evidence strategy]

2. CLINICAL STUDIES
Study 1: [Title]
- Design: [Study design]
- Population: [N subjects]
- Endpoints: [Primary and secondary]
- Results: [Key findings]

3. ADVERSE EVENTS
[Summary of adverse events observed]

4. CONCLUSIONS
[Clinical conclusions supporting safety and effectiveness]`,
    submissionTypes: ['510K', 'PMA', 'IND', 'NDA'],
    tags: ['clinical', 'summary', 'evidence'],
    author: 'TrialSage',
    organization: 'Official',
    usageCount: 654,
    rating: 4.7,
    isOfficial: true,
    createdAt: new Date('2024-07-10'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-8',
    name: 'IFU Consistency Checker',
    description: 'Interactive tool to check Indications for Use consistency across documents',
    type: 'ifu_checker',
    category: 'interactive',
    content: JSON.stringify({
      documents: ['Form 3881', 'Cover Letter', 'Device Description', 'Labeling'],
      template: true,
    }),
    submissionTypes: ['510K'],
    tags: ['IFU', 'consistency', 'checker', 'tool'],
    author: 'TrialSage',
    organization: 'Official',
    usageCount: 543,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-08-01'),
    updatedAt: new Date('2024-11-15'),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY ICONS
// ─────────────────────────────────────────────────────────────────────────────

const categoryIcons: Record<ArtifactCategory, React.ElementType> = {
  document: FileText,
  interactive: Workflow,
  visualization: BarChart3,
};

const typeColors: Record<ArtifactCategory, string> = {
  document: 'bg-blue-100 text-blue-700',
  interactive: 'bg-purple-100 text-purple-700',
  visualization: 'bg-green-100 text-green-700',
};

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE CARD
// ─────────────────────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: ArtifactTemplate;
  onUse: () => void;
  onPreview: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onUse, onPreview }) => {
  const Icon = categoryIcons[template.category];

  return (
    <div className="group p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={cn(
            'p-2 rounded-lg',
            typeColors[template.category]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{template.name}</h3>
          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
            {template.description}
          </p>
        </div>
        {template.isOfficial && (
          <Badge variant="secondary" className="text-[10px] flex-shrink-0">
            <Sparkles className="h-2.5 w-2.5 mr-1" />
            Official
          </Badge>
        )}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {template.submissionTypes.map((type) => (
          <Badge
            key={type}
            variant="outline"
            className="text-[10px] px-1.5 py-0"
          >
            {type}
          </Badge>
        ))}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <Download className="h-3 w-3" />
          {template.usageCount.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
          {template.rating}
        </span>
        {template.organization && (
          <span className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {template.organization}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={onUse}
        >
          Use Template
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onPreview}
        >
          Preview
        </Button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE PREVIEW DIALOG
// ─────────────────────────────────────────────────────────────────────────────

interface TemplatePreviewProps {
  template: ArtifactTemplate | null;
  open: boolean;
  onClose: () => void;
  onUse: () => void;
}

const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  template,
  open,
  onClose,
  onUse,
}) => {
  if (!template) return null;

  const Icon = categoryIcons[template.category];
  const content = typeof template.content === 'string'
    ? template.content
    : JSON.stringify(template.content, null, 2);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', typeColors[template.category])}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{template.name}</DialogTitle>
              <DialogDescription>{template.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] mt-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <pre className="text-sm whitespace-pre-wrap font-mono text-gray-700">
              {content}
            </pre>
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Download className="h-4 w-4" />
              {template.usageCount.toLocaleString()} uses
            </span>
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
              {template.rating} rating
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Updated {new Date(template.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onUse}>
            <Sparkles className="h-4 w-4 mr-2" />
            Use This Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CATALOG COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ArtifactsCatalogProps {
  open: boolean;
  onClose: () => void;
}

export const ArtifactsCatalog: React.FC<ArtifactsCatalogProps> = ({ open, onClose }) => {
  const { activeProject, createArtifact, createConversation, setActiveConversation } = useProject();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ArtifactCategory | 'all'>('all');
  const [selectedSubmissionType, setSelectedSubmissionType] = useState<SubmissionType | 'all'>('all');
  const [previewTemplate, setPreviewTemplate] = useState<ArtifactTemplate | null>(null);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return MOCK_TEMPLATES.filter((template) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          template.name.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query) ||
          template.tags.some((tag) => tag.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && template.category !== selectedCategory) {
        return false;
      }

      // Submission type filter
      if (
        selectedSubmissionType !== 'all' &&
        !template.submissionTypes.includes(selectedSubmissionType)
      ) {
        return false;
      }

      return true;
    });
  }, [searchQuery, selectedCategory, selectedSubmissionType]);

  const handleUseTemplate = async (template: ArtifactTemplate) => {
    if (!activeProject) {
      // TODO: Show message to select/create project first
      return;
    }

    // Create a new conversation for this template
    const conversation = await createConversation(activeProject.id, `From template: ${template.name}`);
    setActiveConversation(conversation.id);

    // Create the artifact from template
    createArtifact({
      projectId: activeProject.id,
      conversationId: conversation.id,
      type: template.type,
      category: template.category,
      title: template.name,
      content: template.content,
    });

    onClose();
    setPreviewTemplate(null);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedSubmissionType('all');
  };

  const hasActiveFilters =
    searchQuery || selectedCategory !== 'all' || selectedSubmissionType !== 'all';

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Artifacts Catalog
            </DialogTitle>
            <DialogDescription>
              Browse and use regulatory document templates, interactive tools, and visualizations.
            </DialogDescription>
          </DialogHeader>

          {/* Filters */}
          <div className="flex items-center gap-3 py-4 border-b">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Category filter */}
            <Select
              value={selectedCategory}
              onValueChange={(value) => setSelectedCategory(value as ArtifactCategory | 'all')}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="document">Documents</SelectItem>
                <SelectItem value="interactive">Interactive</SelectItem>
                <SelectItem value="visualization">Visualizations</SelectItem>
              </SelectContent>
            </Select>

            {/* Submission type filter */}
            <Select
              value={selectedSubmissionType}
              onValueChange={(value) =>
                setSelectedSubmissionType(value as SubmissionType | 'all')
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="510K">510(k)</SelectItem>
                <SelectItem value="IND">IND</SelectItem>
                <SelectItem value="NDA">NDA</SelectItem>
                <SelectItem value="BLA">BLA</SelectItem>
                <SelectItem value="PMA">PMA</SelectItem>
                <SelectItem value="DE_NOVO">De Novo</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Results count */}
          <div className="text-sm text-gray-500 py-2">
            Showing {filteredTemplates.length} of {MOCK_TEMPLATES.length} templates
          </div>

          {/* Templates grid */}
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 gap-4 pb-4">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onUse={() => handleUseTemplate(template)}
                  onPreview={() => setPreviewTemplate(template)}
                />
              ))}
            </div>

            {filteredTemplates.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Filter className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No templates found
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Try adjusting your filters or search query.
                </p>
                <Button variant="outline" onClick={clearFilters}>
                  Clear all filters
                </Button>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Template preview */}
      <TemplatePreview
        template={previewTemplate}
        open={previewTemplate !== null}
        onClose={() => setPreviewTemplate(null)}
        onUse={() => previewTemplate && handleUseTemplate(previewTemplate)}
      />
    </>
  );
};

export default ArtifactsCatalog;
