/**
 * Concept2Cure - Pre-Submission Package Generator
 * 
 * Generates FDA Pre-Submission (Q-Sub) meeting packages with all required
 * components per FDA guidance on Pre-Submission Program.
 * 
 * Biotech/CRO specific: Q-Sub meeting preparation workflow
 * 
 * @module concept2cure/components/regulatory/PreSubPackageGenerator
 * @version 1.0.0
 */

import React, { useState, useCallback } from 'react';
import type { Project, Artifact } from '../../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Package,
  FileText,
  CheckCircle2,
  Clock,
  Sparkles,
  Download,
  Send,
  ChevronRight,
  Calendar,
  Users,
  Building2,
  MessageSquare,
  ListChecks,
  Loader2,
  AlertTriangle,
  Info,
  Plus,
  X,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface PreSubQuestion {
  id: string;
  question: string;
  context?: string;
  category: 'clinical' | 'nonclinical' | 'labeling' | 'manufacturing' | 'testing' | 'other';
  priority: 'high' | 'medium' | 'low';
}

interface PreSubMeetingInfo {
  meetingType: 'pre-ide' | 'pre-sub' | 'pre-pma' | 'pre-bla' | 'type-b' | 'type-c';
  requestedDate?: Date;
  primaryContact: {
    name: string;
    title: string;
    email: string;
    phone: string;
  };
  attendees: string[];
  meetingObjectives: string;
}

interface PackageSection {
  id: string;
  title: string;
  description: string;
  required: boolean;
  status: 'not-started' | 'in-progress' | 'complete' | 'not-applicable';
  content?: string;
  linkedArtifacts: string[];
}

interface PreSubPackageData {
  meetingInfo: PreSubMeetingInfo;
  questions: PreSubQuestion[];
  sections: PackageSection[];
  coverLetter: string;
  backgroundInfo: string;
}

interface PreSubPackageGeneratorProps {
  project: Project;
  artifacts: Artifact[];
  onGenerate: (packageData: PreSubPackageData) => Promise<Blob>;
  onSaveProgress: (packageData: PreSubPackageData) => void;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MEETING_TYPES = [
  { value: 'pre-ide', label: 'Pre-IDE Meeting', description: 'Investigational device exemption' },
  { value: 'pre-sub', label: 'Pre-Submission', description: 'Q-Sub feedback request' },
  { value: 'pre-pma', label: 'Pre-PMA Meeting', description: 'PMA review preparation' },
  { value: 'pre-bla', label: 'Pre-BLA Meeting', description: 'Biologics license application' },
  { value: 'type-b', label: 'Type B Meeting', description: 'Substantive guidance' },
  { value: 'type-c', label: 'Type C Meeting', description: 'General guidance' },
];

const QUESTION_CATEGORIES = [
  { value: 'clinical', label: 'Clinical', color: 'bg-green-100 text-green-700' },
  { value: 'nonclinical', label: 'Nonclinical', color: 'bg-blue-100 text-stone-700' },
  { value: 'labeling', label: 'Labeling', color: 'bg-purple-100 text-purple-700' },
  { value: 'manufacturing', label: 'Manufacturing', color: 'bg-orange-100 text-orange-700' },
  { value: 'testing', label: 'Testing', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'other', label: 'Other', color: 'bg-stone-100 text-stone-700' },
];

const DEFAULT_SECTIONS: PackageSection[] = [
  {
    id: 'cover-letter',
    title: 'Cover Letter',
    description: 'Formal request letter identifying the submission type and purpose',
    required: true,
    status: 'not-started',
    linkedArtifacts: [],
  },
  {
    id: 'device-description',
    title: 'Device Description',
    description: 'Detailed description of the device, including indications for use',
    required: true,
    status: 'not-started',
    linkedArtifacts: [],
  },
  {
    id: 'predicate-comparison',
    title: 'Predicate Device Comparison',
    description: 'Substantial equivalence comparison table (for 510(k))',
    required: false,
    status: 'not-started',
    linkedArtifacts: [],
  },
  {
    id: 'regulatory-history',
    title: 'Regulatory History',
    description: 'Previous FDA interactions and submissions',
    required: false,
    status: 'not-started',
    linkedArtifacts: [],
  },
  {
    id: 'proposed-testing',
    title: 'Proposed Testing Strategy',
    description: 'Outline of planned testing approach',
    required: true,
    status: 'not-started',
    linkedArtifacts: [],
  },
  {
    id: 'clinical-study',
    title: 'Proposed Clinical Study',
    description: 'Clinical trial protocol overview (if applicable)',
    required: false,
    status: 'not-started',
    linkedArtifacts: [],
  },
  {
    id: 'questions',
    title: 'Specific Questions',
    description: 'Clear, numbered questions for FDA feedback',
    required: true,
    status: 'not-started',
    linkedArtifacts: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION EDITOR
// ─────────────────────────────────────────────────────────────────────────────

interface QuestionEditorProps {
  questions: PreSubQuestion[];
  onAdd: (question: Omit<PreSubQuestion, 'id'>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PreSubQuestion>) => void;
}

const QuestionEditor: React.FC<QuestionEditorProps> = ({
  questions,
  onAdd,
  onRemove,
  onUpdate,
}) => {
  const [newQuestion, setNewQuestion] = useState('');
  const [newCategory, setNewCategory] = useState<PreSubQuestion['category']>('clinical');

  const handleAdd = () => {
    if (newQuestion.trim()) {
      onAdd({
        question: newQuestion.trim(),
        category: newCategory,
        priority: 'medium',
      });
      setNewQuestion('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-stone-50 rounded-lg border border-dashed border-stone-300">
        <Label className="text-sm font-medium">Add New Question</Label>
        <div className="mt-2 flex gap-2">
          <Textarea
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Enter your question for FDA..."
            className="flex-1 text-sm min-h-[60px]"
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <Select value={newCategory} onValueChange={(v) => setNewCategory(v as PreSubQuestion['category'])}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd} disabled={!newQuestion.trim()}>
            <Plus className="h-4 w-4 mr-1" />
            Add Question
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {questions.map((q, idx) => {
          const categoryInfo = QUESTION_CATEGORIES.find(c => c.value === q.category);
          return (
            <div
              key={q.id}
              className="p-3 bg-white rounded-lg border border-stone-200 group"
            >
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-stone-700 text-xs font-medium flex items-center justify-center">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-900">{q.question}</p>
                  {q.context && (
                    <p className="text-xs text-stone-500 mt-1">{q.context}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className={cn('text-xs', categoryInfo?.color)}>
                      {categoryInfo?.label}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        q.priority === 'high' && 'bg-red-50 text-red-700',
                        q.priority === 'medium' && 'bg-amber-50 text-amber-700',
                        q.priority === 'low' && 'bg-stone-50 text-stone-700'
                      )}
                    >
                      {q.priority} priority
                    </Badge>
                  </div>
                </div>
                <button
                  onClick={() => onRemove(q.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-stone-400 hover:text-red-600 transition-all duration-150"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}

        {questions.length === 0 && (
          <div className="text-center py-6 text-sm text-stone-500">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 text-stone-400" />
            <p>No questions added yet.</p>
            <p className="text-xs mt-1">Add specific questions you want FDA feedback on.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION CHECKLIST
// ─────────────────────────────────────────────────────────────────────────────

interface SectionChecklistProps {
  sections: PackageSection[];
  onUpdateStatus: (id: string, status: PackageSection['status']) => void;
}

const SectionChecklist: React.FC<SectionChecklistProps> = ({
  sections,
  onUpdateStatus,
}) => {
  const completedCount = sections.filter(s => s.status === 'complete').length;
  const requiredCount = sections.filter(s => s.required).length;
  const requiredCompleteCount = sections.filter(s => s.required && s.status === 'complete').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-stone-900">
            Package Sections
          </span>
          <p className="text-xs text-stone-500">
            {completedCount}/{sections.length} sections complete
          </p>
        </div>
        {requiredCompleteCount < requiredCount && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {requiredCount - requiredCompleteCount} required sections missing
          </Badge>
        )}
      </div>

      <Progress
        value={(completedCount / sections.length) * 100}
        className="h-2"
      />

      <div className="space-y-2">
        {sections.map(section => (
          <div
            key={section.id}
            className={cn(
              'p-3 rounded-lg border transition-colors duration-150',
              section.status === 'complete' && 'bg-green-50 border-green-200',
              section.status === 'in-progress' && 'bg-blue-50 border-blue-200',
              section.status === 'not-started' && 'bg-white border-stone-200',
              section.status === 'not-applicable' && 'bg-stone-50 border-stone-200 opacity-60'
            )}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={section.status === 'complete'}
                onCheckedChange={(checked) =>
                  onUpdateStatus(section.id, checked ? 'complete' : 'not-started')
                }
                className={cn(
                  'mt-0.5',
                  section.status === 'complete' && 'border-green-600 bg-green-600'
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-sm font-medium',
                    section.status === 'complete' && 'text-green-800',
                    section.status === 'in-progress' && 'text-blue-800',
                    section.status === 'not-started' && 'text-stone-900',
                    section.status === 'not-applicable' && 'text-stone-500 line-through'
                  )}>
                    {section.title}
                  </span>
                  {section.required && (
                    <Badge variant="outline" className="text-xs text-red-600 border-red-200">
                      Required
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  {section.description}
                </p>
              </div>
              <Select
                value={section.status}
                onValueChange={(v) => onUpdateStatus(section.id, v as PackageSection['status'])}
              >
                <SelectTrigger className="w-[130px] h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not-started">Not Started</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="not-applicable">N/A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const PreSubPackageGenerator: React.FC<PreSubPackageGeneratorProps> = ({
  project,
  artifacts,
  onGenerate,
  onSaveProgress,
  className,
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('info');

  const [packageData, setPackageData] = useState<PreSubPackageData>({
    meetingInfo: {
      meetingType: 'pre-sub',
      primaryContact: {
        name: '',
        title: '',
        email: '',
        phone: '',
      },
      attendees: [],
      meetingObjectives: '',
    },
    questions: [],
    sections: DEFAULT_SECTIONS,
    coverLetter: '',
    backgroundInfo: '',
  });

  const handleUpdateMeetingInfo = useCallback((updates: Partial<PreSubMeetingInfo>) => {
    setPackageData(prev => ({
      ...prev,
      meetingInfo: { ...prev.meetingInfo, ...updates },
    }));
  }, []);

  const handleAddQuestion = useCallback((question: Omit<PreSubQuestion, 'id'>) => {
    setPackageData(prev => ({
      ...prev,
      questions: [
        ...prev.questions,
        { ...question, id: `q-${Date.now()}` },
      ],
    }));
  }, []);

  const handleRemoveQuestion = useCallback((id: string) => {
    setPackageData(prev => ({
      ...prev,
      questions: prev.questions.filter(q => q.id !== id),
    }));
  }, []);

  const handleUpdateSectionStatus = useCallback((id: string, status: PackageSection['status']) => {
    setPackageData(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.id === id ? { ...s, status } : s
      ),
    }));
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const blob = await onGenerate(packageData);
      // Download the generated package
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pre-sub-package-${project.name.replace(/\s+/g, '-')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Package generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const requiredComplete = packageData.sections.filter(s => s.required && s.status === 'complete').length;
  const requiredTotal = packageData.sections.filter(s => s.required).length;
  const isReadyToGenerate = requiredComplete === requiredTotal && packageData.questions.length > 0;

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={cn('gap-2', className)}>
          <Package className="h-4 w-4" />
          Pre-Sub Package
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Pre-Submission Package Generator
          </DialogTitle>
          <DialogDescription>
            Create a complete FDA Q-Sub meeting package with all required components.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="info" className="text-xs">
              <Building2 className="h-3 w-3 mr-1" />
              Meeting Info
            </TabsTrigger>
            <TabsTrigger value="questions" className="text-xs">
              <MessageSquare className="h-3 w-3 mr-1" />
              Questions ({packageData.questions.length})
            </TabsTrigger>
            <TabsTrigger value="sections" className="text-xs">
              <ListChecks className="h-3 w-3 mr-1" />
              Sections
            </TabsTrigger>
            <TabsTrigger value="generate" className="text-xs">
              <Package className="h-3 w-3 mr-1" />
              Generate
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[450px] mt-4">
            {/* Meeting Info Tab */}
            <TabsContent value="info" className="space-y-4 m-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Meeting Type</Label>
                  <Select
                    value={packageData.meetingInfo.meetingType}
                    onValueChange={(v) => handleUpdateMeetingInfo({ meetingType: v as PreSubMeetingInfo['meetingType'] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEETING_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div>
                            <div className="font-medium">{type.label}</div>
                            <div className="text-xs text-stone-500">{type.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Requested Meeting Date</Label>
                  <Input
                    type="date"
                    onChange={(e) => handleUpdateMeetingInfo({ requestedDate: new Date(e.target.value) })}
                  />
                </div>
              </div>

              <div className="p-4 bg-stone-50 rounded-lg space-y-3">
                <Label className="font-medium">Primary Contact</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Full Name"
                    value={packageData.meetingInfo.primaryContact.name}
                    onChange={(e) => handleUpdateMeetingInfo({
                      primaryContact: { ...packageData.meetingInfo.primaryContact, name: e.target.value }
                    })}
                  />
                  <Input
                    placeholder="Title"
                    value={packageData.meetingInfo.primaryContact.title}
                    onChange={(e) => handleUpdateMeetingInfo({
                      primaryContact: { ...packageData.meetingInfo.primaryContact, title: e.target.value }
                    })}
                  />
                  <Input
                    type="email"
                    placeholder="Email"
                    value={packageData.meetingInfo.primaryContact.email}
                    onChange={(e) => handleUpdateMeetingInfo({
                      primaryContact: { ...packageData.meetingInfo.primaryContact, email: e.target.value }
                    })}
                  />
                  <Input
                    type="tel"
                    placeholder="Phone"
                    value={packageData.meetingInfo.primaryContact.phone}
                    onChange={(e) => handleUpdateMeetingInfo({
                      primaryContact: { ...packageData.meetingInfo.primaryContact, phone: e.target.value }
                    })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Meeting Objectives</Label>
                <Textarea
                  value={packageData.meetingInfo.meetingObjectives}
                  onChange={(e) => handleUpdateMeetingInfo({ meetingObjectives: e.target.value })}
                  placeholder="Describe the primary objectives for this meeting..."
                  className="min-h-[100px]"
                />
              </div>
            </TabsContent>

            {/* Questions Tab */}
            <TabsContent value="questions" className="m-0">
              <QuestionEditor
                questions={packageData.questions}
                onAdd={handleAddQuestion}
                onRemove={handleRemoveQuestion}
                onUpdate={(id, updates) => {
                  setPackageData(prev => ({
                    ...prev,
                    questions: prev.questions.map(q =>
                      q.id === id ? { ...q, ...updates } : q
                    ),
                  }));
                }}
              />
            </TabsContent>

            {/* Sections Tab */}
            <TabsContent value="sections" className="m-0">
              <SectionChecklist
                sections={packageData.sections}
                onUpdateStatus={handleUpdateSectionStatus}
              />
            </TabsContent>

            {/* Generate Tab */}
            <TabsContent value="generate" className="space-y-4 m-0">
              <div className="border border-stone-200 rounded-md">
                <div className="px-4 py-3 border-b border-stone-200">
                  <h3 className="text-lg font-semibold">Package Summary</h3>
                  <p className="text-sm text-muted-foreground">
                    Review your pre-submission package before generating
                  </p>
                </div>
                <div className="px-4 py-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-stone-50 rounded-lg">
                      <div className="text-sm font-medium text-stone-700">Meeting Type</div>
                      <div className="text-lg font-semibold text-stone-900">
                        {MEETING_TYPES.find(t => t.value === packageData.meetingInfo.meetingType)?.label}
                      </div>
                    </div>
                    <div className="p-3 bg-stone-50 rounded-lg">
                      <div className="text-sm font-medium text-stone-700">Questions</div>
                      <div className="text-lg font-semibold text-stone-900">
                        {packageData.questions.length} questions
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-stone-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-stone-700">Sections Status</span>
                      <span className="text-sm text-stone-500">
                        {requiredComplete}/{requiredTotal} required complete
                      </span>
                    </div>
                    <Progress value={(requiredComplete / requiredTotal) * 100} className="h-2" />
                  </div>

                  {!isReadyToGenerate && (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-center gap-2 text-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-medium">Cannot Generate Yet</span>
                      </div>
                      <ul className="mt-2 text-xs text-amber-600 space-y-1 ml-6 list-disc">
                        {packageData.questions.length === 0 && (
                          <li>Add at least one question for FDA</li>
                        )}
                        {requiredComplete < requiredTotal && (
                          <li>Complete all required sections ({requiredTotal - requiredComplete} remaining)</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => onSaveProgress(packageData)}
                >
                  Save Progress
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={!isReadyToGenerate || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating Package...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Generate Package
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default PreSubPackageGenerator;
