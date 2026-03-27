import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings, FileText, Users, ShieldCheck, Save } from 'lucide-react';

interface ProjectConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  project: {
    id: string;
    name: string;
    description?: string;
    submissionType?: string;
    sponsor?: string;
    product?: string;
    region?: string;
    targetAgency?: string;
    targetSubmissionDate?: string;
    status?: string;
    customInstructions?: string;
  } | null;
  onSave: (data: Record<string, any>) => Promise<void>;
}

const SUBMISSION_TYPES = [
  '510K',
  'IND',
  'NDA',
  'BLA',
  'PMA',
  'MAA',
  'DE_NOVO',
  'EUA',
  'IVDR',
] as const;

const AGENCIES = ['FDA', 'EMA', 'PMDA', 'Health Canada'] as const;

const STATUS_OPTIONS = [
  'planning',
  'active',
  'in_review',
  'submitted',
  'archived',
] as const;

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  active: 'Active',
  in_review: 'In Review',
  submitted: 'Submitted',
  archived: 'Archived',
};

const INSTRUCTIONS_MAX = 5000;

function ProjectConfigPanel({ isOpen, onClose, project, onSave }: ProjectConfigPanelProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state — General tab
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submissionType, setSubmissionType] = useState('');
  const [productName, setProductName] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [targetAgency, setTargetAgency] = useState('');
  const [targetSubmissionDate, setTargetSubmissionDate] = useState('');
  const [status, setStatus] = useState('');

  // Form state — Instructions tab
  const [customInstructions, setCustomInstructions] = useState('');

  // Sync form state when project prop changes or panel opens
  useEffect(() => {
    if (isOpen && project) {
      setName(project.name || '');
      setDescription(project.description || '');
      setSubmissionType(project.submissionType || '');
      setProductName(project.product || '');
      setSponsor(project.sponsor || '');
      setTargetAgency(project.targetAgency || project.region || '');
      setTargetSubmissionDate(project.targetSubmissionDate || '');
      setStatus(project.status || '');
      setCustomInstructions(project.customInstructions || '');
      setSaved(false);
    }
  }, [isOpen, project]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        submissionType: submissionType || undefined,
        product: productName.trim() || undefined,
        sponsor: sponsor.trim() || undefined,
        targetAgency: targetAgency || undefined,
        region: targetAgency || undefined,
        targetSubmissionDate: targetSubmissionDate || undefined,
        status: status || undefined,
        customInstructions: customInstructions.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleResetInstructions = () => {
    setCustomInstructions('');
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-[420px] sm:max-w-[420px] p-0 flex flex-col bg-[#FAFAF8] border-l border-[#E8E6DC]"
      >
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle className="text-lg font-semibold text-[#4D4B45] flex items-center gap-2">
            <Settings className="h-5 w-5 text-[#4D4B45]/60" />
            Project Configuration
          </SheetTitle>
          <SheetDescription className="text-sm text-[#4D4B45]/60">
            {project?.name || 'Configure project settings'}
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="mx-6 bg-transparent border-b border-[#E8E6DC] rounded-none h-auto p-0 gap-0">
            <TabsTrigger
              value="general"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4D4B45] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 text-sm text-[#4D4B45]/60 data-[state=active]:text-[#4D4B45] font-medium"
            >
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              General
            </TabsTrigger>
            <TabsTrigger
              value="instructions"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4D4B45] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 text-sm text-[#4D4B45]/60 data-[state=active]:text-[#4D4B45] font-medium"
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Instructions
            </TabsTrigger>
            <TabsTrigger
              value="team"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4D4B45] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 text-sm text-[#4D4B45]/60 data-[state=active]:text-[#4D4B45] font-medium"
            >
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Team
            </TabsTrigger>
            <TabsTrigger
              value="compliance"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4D4B45] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 text-sm text-[#4D4B45]/60 data-[state=active]:text-[#4D4B45] font-medium"
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
              Compliance
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            {/* ── General Tab ── */}
            <TabsContent value="general" className="px-6 py-5 space-y-5 m-0">
              {/* Project Name */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., CardioFlow Heart Monitor"
                  className="border-[#E8E6DC] bg-white text-[#4D4B45] placeholder:text-[#4D4B45]/40 focus-visible:ring-[#4D4B45]/20 focus-visible:border-[#4D4B45]/40"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Description <span className="text-[#4D4B45]/40 font-normal">(optional)</span>
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the project..."
                  rows={2}
                  className="border-[#E8E6DC] bg-white text-[#4D4B45] placeholder:text-[#4D4B45]/40 focus-visible:ring-[#4D4B45]/20 focus-visible:border-[#4D4B45]/40 resize-none"
                />
              </div>

              {/* Submission Type */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Submission Type
                </label>
                <Select value={submissionType} onValueChange={setSubmissionType}>
                  <SelectTrigger className="border-[#E8E6DC] bg-white text-[#4D4B45] focus:ring-[#4D4B45]/20">
                    <SelectValue placeholder="Select submission type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBMISSION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product / Device Name */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Product / Device / Molecule{' '}
                  <span className="text-[#4D4B45]/40 font-normal">(optional)</span>
                </label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g., CardioFlow™, Atorvastatin 20 mg"
                  className="border-[#E8E6DC] bg-white text-[#4D4B45] placeholder:text-[#4D4B45]/40 focus-visible:ring-[#4D4B45]/20 focus-visible:border-[#4D4B45]/40"
                />
              </div>

              {/* Sponsor */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Sponsor / Client{' '}
                  <span className="text-[#4D4B45]/40 font-normal">(optional)</span>
                </label>
                <Input
                  value={sponsor}
                  onChange={(e) => setSponsor(e.target.value)}
                  placeholder="e.g., Acme Biotech, Inc."
                  className="border-[#E8E6DC] bg-white text-[#4D4B45] placeholder:text-[#4D4B45]/40 focus-visible:ring-[#4D4B45]/20 focus-visible:border-[#4D4B45]/40"
                />
              </div>

              {/* Target Agency */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Target Agency
                </label>
                <div className="flex gap-2 flex-wrap">
                  {AGENCIES.map((agency) => (
                    <button
                      key={agency}
                      type="button"
                      onClick={() => setTargetAgency(agency)}
                      className={`px-3.5 py-1.5 text-sm font-medium rounded-lg border transition-all duration-150 ${
                        targetAgency === agency
                          ? 'bg-[#4D4B45] text-white border-[#4D4B45]'
                          : 'bg-white text-[#4D4B45] border-[#E8E6DC] hover:border-[#4D4B45]/30'
                      }`}
                    >
                      {agency}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Submission Date */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Target Submission Date
                </label>
                <Input
                  type="date"
                  value={targetSubmissionDate}
                  onChange={(e) => setTargetSubmissionDate(e.target.value)}
                  className="border-[#E8E6DC] bg-white text-[#4D4B45] focus-visible:ring-[#4D4B45]/20 focus-visible:border-[#4D4B45]/40"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Status
                </label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="border-[#E8E6DC] bg-white text-[#4D4B45] focus:ring-[#4D4B45]/20">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s] || s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* ── Instructions Tab ── */}
            <TabsContent value="instructions" className="px-6 py-5 space-y-4 m-0">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-[#4D4B45]">
                    Custom Instructions
                  </label>
                  {customInstructions.trim().length > 0 && (
                    <Badge
                      variant="secondary"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium"
                    >
                      Active — injected into every conversation
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-[#4D4B45]/50 mb-3">
                  Provide context or rules that AnA should follow for this project.
                  These instructions are included in every conversation within this project.
                </p>
                <Textarea
                  value={customInstructions}
                  onChange={(e) => {
                    if (e.target.value.length <= INSTRUCTIONS_MAX) {
                      setCustomInstructions(e.target.value);
                    }
                  }}
                  placeholder="e.g., Always reference ICH E6(R2) guidelines. Focus on Class III device requirements. Use formal language in all outputs."
                  rows={10}
                  className="border-[#E8E6DC] bg-white text-[#4D4B45] placeholder:text-[#4D4B45]/40 focus-visible:ring-[#4D4B45]/20 focus-visible:border-[#4D4B45]/40 resize-none text-sm leading-relaxed"
                />
                <div className="flex items-center justify-between mt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetInstructions}
                    className="text-xs text-[#4D4B45]/50 hover:text-[#4D4B45] h-auto py-1 px-2"
                    disabled={!customInstructions.trim()}
                  >
                    Reset to default
                  </Button>
                  <span className="text-xs text-[#4D4B45]/40">
                    {customInstructions.length.toLocaleString()} / {INSTRUCTIONS_MAX.toLocaleString()} characters
                  </span>
                </div>
              </div>
            </TabsContent>

            {/* ── Team Tab (placeholder) ── */}
            <TabsContent value="team" className="px-6 py-5 m-0">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-[#E8E6DC]/50 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-[#4D4B45]/40" />
                </div>
                <h3 className="text-sm font-medium text-[#4D4B45] mb-1.5">
                  Team Management
                </h3>
                <p className="text-sm text-[#4D4B45]/50 max-w-[260px]">
                  Team management for enterprise accounts.
                  Assign roles, manage permissions, and track contributor activity.
                </p>
              </div>
            </TabsContent>

            {/* ── Compliance Tab (placeholder) ── */}
            <TabsContent value="compliance" className="px-6 py-5 m-0">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-[#E8E6DC]/50 flex items-center justify-center mb-4">
                  <ShieldCheck className="h-6 w-6 text-[#4D4B45]/40" />
                </div>
                <h3 className="text-sm font-medium text-[#4D4B45] mb-1.5">
                  21 CFR Part 11 Compliance Tracking
                </h3>
                <p className="text-sm text-[#4D4B45]/50 max-w-[260px]">
                  Audit trail summary, electronic signature tracking, and compliance
                  verification controls will be available here.
                </p>
              </div>
            </TabsContent>
          </div>

          {/* ── Footer with Save ── */}
          <div className="px-6 py-4 border-t border-[#E8E6DC] bg-white flex items-center justify-between">
            <div className="text-xs text-[#4D4B45]/40">
              {saved && (
                <span className="text-emerald-600 font-medium">Changes saved</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-[#4D4B45]/60 hover:text-[#4D4B45]"
              >
                Close
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={!name.trim() || saving}
                className="bg-[#4D4B45] text-white hover:bg-[#3A3935] disabled:opacity-40"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export default ProjectConfigPanel;
