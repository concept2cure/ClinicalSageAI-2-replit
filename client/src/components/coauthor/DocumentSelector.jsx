// client/src/components/coauthor/DocumentSelector.jsx
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  FileText,
  BookOpen,
  ChevronRight,
  LayoutDashboard,
  FileCheck,
  FolderTree,
  Sparkles,
  Upload,
  AlertTriangle,
  Users,
  ShieldCheck,
  BookMarked,
  Clock,
} from 'lucide-react';

const RECENT_DOCUMENTS = [
  { id: 'doc1', title: 'Enzymase 10mg Clinical Overview', module: '2.5', lastEdited: '2 hours ago' },
  { id: 'doc2', title: 'NAD-102 Stability Analysis', module: '2.3', lastEdited: '1 day ago' },
  { id: 'doc3', title: 'Cellbloc Safety Summary', module: '2.7', lastEdited: '3 days ago' },
];

const TEMPLATE_LIBRARY = [
  {
    id: 'tpl1',
    title: 'Clinical Study Report Template',
    module: 'M5',
    description: 'ICH E3 compliant CSR template with guidance',
    region: 'ICH',
  },
  {
    id: 'tpl2',
    title: 'Quality Overall Summary Template',
    module: 'M2',
    description: 'Complete QOS template with examples',
    region: 'FDA/EMA',
  },
  {
    id: 'tpl3',
    title: 'FDA CTD Module 2 Template',
    module: 'M2',
    description: 'FDA-specific template for Module 2 summaries',
    region: 'FDA',
  },
];

const PYRAMID_STRUCTURE = [
  {
    id: 'module1',
    label: 'Module 1 — Administrative',
    status: 'approved',
    sections: ['1.1 FDA Forms', '1.2 Cover Letter', '1.3 Admin Information'],
  },
  {
    id: 'module2',
    label: 'Module 2 — Summaries',
    status: 'in-progress',
    sections: ['2.1 Table of Contents', '2.5 Clinical Overview', '2.7 Clinical Summary'],
  },
  {
    id: 'module3',
    label: 'Module 3 — Quality',
    status: 'draft',
    sections: ['3.2.S Drug Substance', '3.2.P Drug Product'],
  },
  {
    id: 'module4',
    label: 'Module 4 — Nonclinical',
    status: 'draft',
    sections: ['4.2 Pharmacology Studies'],
  },
  {
    id: 'module5',
    label: 'Module 5 — Clinical',
    status: 'draft',
    sections: ['5.3.5 Clinical Study Reports'],
  },
];

const STATUS_BADGES = {
  approved: { label: 'Approved', variant: 'success' },
  'in-progress': { label: 'In Progress', variant: 'secondary' },
  draft: { label: 'Draft', variant: 'outline' },
};

export default function DocumentSelector({ onSelectDocument }) {
  const [activeTab, setActiveTab] = useState('recent');
  const [selectedModuleId, setSelectedModuleId] = useState('module2');

  const selectedModule = useMemo(
    () => PYRAMID_STRUCTURE.find(module => module.id === selectedModuleId) || PYRAMID_STRUCTURE[0],
    [selectedModuleId]
  );

  return (
    <div className="container mx-auto py-6 max-w-7xl">
      <div className="flex flex-col gap-6">
        <Card className="border-muted/60 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Regulatory Submission Workspace</p>
                <h1 className="text-3xl font-semibold">eCTD Co-Author™</h1>
                <p className="text-sm text-muted-foreground mt-2">
                  Unified IND → eCTD pyramid with compliance signals, authoring workflow, and
                  submission health.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Import
                </Button>
                <Button variant="outline" className="gap-2">
                  <BookOpen className="h-4 w-4" />
                  Template Library
                </Button>
                <Button className="gap-2" onClick={() => onSelectDocument('module2')}>
                  <Sparkles className="h-4 w-4" />
                  Create New
                </Button>
              </div>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <Card className="border-muted/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Submission Health</CardTitle>
                  <CardDescription>Composite readiness across modules</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Completeness</span>
                      <span className="font-medium">78%</span>
                    </div>
                    <Progress value={78} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Technical Validation</span>
                      <span className="font-medium">92%</span>
                    </div>
                    <Progress value={92} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>QC Review</span>
                      <span className="font-medium">64%</span>
                    </div>
                    <Progress value={64} />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-muted/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Compliance Signals</CardTitle>
                  <CardDescription>Top items requiring attention</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Missing citations in 2.5.4</p>
                      <p className="text-muted-foreground">Add source references for efficacy data.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Module 1 ready for submission</p>
                      <p className="text-muted-foreground">All forms approved and validated.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-muted/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Team Momentum</CardTitle>
                  <CardDescription>Who is driving the draft</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" /> Alex Smith
                    </span>
                    <span className="text-muted-foreground">3 sections</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" /> Jamie Chen
                    </span>
                    <span className="text-muted-foreground">2 sections</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" /> Taylor Wong
                    </span>
                    <span className="text-muted-foreground">1 section</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr_320px]">
          <Card className="border-muted/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-blue-600" />
                Regulatory Pyramid
              </CardTitle>
              <CardDescription>Navigate modules & sections</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PYRAMID_STRUCTURE.map(module => {
                const status = STATUS_BADGES[module.status];
                const isSelected = module.id === selectedModuleId;
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => setSelectedModuleId(module.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-muted/60 hover:border-blue-200 hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{module.label}</span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {module.sections.slice(0, 2).map(section => (
                        <p key={section}>{section}</p>
                      ))}
                      {module.sections.length > 2 && <p>+{module.sections.length - 2} more</p>}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-muted/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5 text-blue-600" />
                Submission Workstream
              </CardTitle>
              <CardDescription>
                Selected: <span className="font-medium">{selectedModule.label}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="recent" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="recent">Recent</TabsTrigger>
                  <TabsTrigger value="templates">Templates</TabsTrigger>
                  <TabsTrigger value="actions">Actions</TabsTrigger>
                </TabsList>

                <TabsContent value="recent" className="mt-4 space-y-3">
                  {RECENT_DOCUMENTS.map(doc => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-lg border border-muted/60 p-3 hover:border-blue-200"
                    >
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-600" />
                          {doc.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Module {doc.module} • Last edited {doc.lastEdited}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => onSelectDocument('module2')}>
                        Open
                      </Button>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="templates" className="mt-4 space-y-3">
                  {TEMPLATE_LIBRARY.map(template => (
                    <div
                      key={template.id}
                      className="rounded-lg border border-muted/60 p-3 hover:border-blue-200"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            <BookMarked className="h-4 w-4 text-blue-600" />
                            {template.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {template.module} • {template.region}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => onSelectDocument('module2')}>
                          Use
                        </Button>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="actions" className="mt-4 space-y-3">
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-blue-600" />
                      Continue Module 2.7
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-blue-600" />
                      New from Template
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Upload className="h-4 w-4 text-blue-600" />
                      Import Document
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-muted/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-blue-600" />
                  Next Best Actions
                </CardTitle>
                <CardDescription>AI-guided tasks for this module</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Complete 2.7 Clinical Summary draft</p>
                    <p className="text-muted-foreground">Estimated 2.5 hours</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Run technical validation for Module 2</p>
                    <p className="text-muted-foreground">Flag missing references automatically.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-muted/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4 text-blue-600" />
                  Collaboration Snapshot
                </CardTitle>
                <CardDescription>Current activity and handoffs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Active reviewers</span>
                  <span>3</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Open comments</span>
                  <span>12</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Pending approvals</span>
                  <span>4</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
