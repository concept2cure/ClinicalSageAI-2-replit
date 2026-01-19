// client/src/components/coauthor/DocumentSelector.jsx
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
<<<<<<< HEAD
import { FileText, BookOpen, ChevronRight, LayoutDashboard, FileCheck } from 'lucide-react'
=======
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  FileText,
  BookOpen,
  ChevronRight,
  LayoutDashboard,
  FileCheck,
  AlertTriangle,
  ShieldCheck,
  Users,
  FolderTree,
  Sparkles,
} from 'lucide-react';
>>>>>>> codex/implement-liquid-csr-ingestion-pipeline
import ModuleDashboard from './ModuleDashboard';

const RECENT_DOCUMENTS = [
  { id: 'doc1', title: 'Enzymase 10mg Clinical Overview', module: '2.5', lastEdited: '2 hours ago' },
  { id: 'doc2', title: 'NAD-102 Stability Analysis', module: '2.3', lastEdited: '1 day ago' },
  { id: 'doc3', title: 'Cellbloc Safety Summary', module: '2.7', lastEdited: '3 days ago' },
];

const TEMPLATES = [
  {
    id: 'tpl1',
    title: 'Clinical Study Report Template',
    module: 'M5',
    description: 'ICH E3 compliant CSR template with guidance',
  },
  {
    id: 'tpl2',
    title: 'Quality Overall Summary Template',
    module: 'M2',
    description: 'Complete QOS template with examples',
  },
  {
    id: 'tpl3',
    title: 'FDA CTD Module 2 Template',
    module: 'M2',
    description: 'FDA-specific template for Module 2 summaries',
  },
];

const PYRAMID_MODULES = [
  { id: 'm1', label: 'Module 1', status: 'approved', description: 'Administrative' },
  { id: 'm2', label: 'Module 2', status: 'in-progress', description: 'Summaries' },
  { id: 'm3', label: 'Module 3', status: 'draft', description: 'Quality' },
  { id: 'm4', label: 'Module 4', status: 'draft', description: 'Nonclinical' },
  { id: 'm5', label: 'Module 5', status: 'draft', description: 'Clinical' },
];

const LIFECYCLE_DOCS = [
  { id: 'protocols', label: 'Protocols & Synopses', status: 'In Progress' },
  { id: 'csrs', label: 'Clinical Study Reports', status: 'Draft' },
  { id: 'manuscripts', label: 'Manuscripts & Abstracts', status: 'Planned' },
  { id: 'value', label: 'Value Dossiers', status: 'Planned' },
  { id: 'mlr', label: 'MLR-Ready Materials', status: 'In Review' },
];

const INTEGRATIONS = [
  'Vault RIM / eTMF',
  'SharePoint Embedded',
  'Datavision & iEnvision',
  'Internal SOP routing & naming',
];

const GOVERNANCE_TRACKS = [
  {
    id: 'regulatory',
    title: 'Regulatory Submissions',
    description: 'IND, NDA, BLA readiness with eCTD technical compliance gates.',
  },
  {
    id: 'medaffairs',
    title: 'Medical Affairs & Publications',
    description: 'Manuscripts, abstracts, slide decks, and MLR-ready materials.',
  },
  {
    id: 'safety',
    title: 'Safety & Risk Management',
    description: 'Signal narratives, REMS support, and safety summaries.',
  },
];

const WORKFLOW_STAGES = [
  { id: 'ingest', label: 'Data Ingestion', detail: 'Protocol, SAP, CSR, and source data' },
  { id: 'draft', label: 'AI Drafting', detail: 'Lumen Cortex + Kimi AI generation' },
  { id: 'review', label: 'Medical Review', detail: 'SME + statistics validation' },
  { id: 'mlr', label: 'MLR Approval', detail: 'Compliance, legal, regulatory signoff' },
  { id: 'publish', label: 'Submission Ready', detail: 'eCTD package + publishing' },
];

const PLATFORM_CAPABILITIES = [
  'End-to-end CTD pyramid coverage (Modules 1-5)',
  'Scientific defensibility checks with evidence mapping',
  'Built-in SOP routing & audit trails',
  'Unified IND/NDA/BLA authoring workspace',
];

const REVIEWER_EXPECTATIONS = [
  'Traceable claims linked to source data and CSR evidence',
  'Clear benefit-risk narrative with consistent endpoints',
  'Region-specific conformance (FDA, EMA, PMDA)',
  'MLR-compliant language with governance signoff',
];

const PROGRAM_PORTFOLIO = [
  {
    id: 'ind-042',
    name: 'IND-042 Oncology',
    status: 'Drafting',
    nextMilestone: 'Module 2 draft due in 12 days',
  },
  {
    id: 'nda-018',
    name: 'NDA-018 CV',
    status: 'Review',
    nextMilestone: 'QC & stats validation in progress',
  },
  {
    id: 'bla-007',
    name: 'BLA-007 Rare Disease',
    status: 'Planning',
    nextMilestone: 'Protocol authoring kickoff',
  },
];


const PYRAMID_MODULES = [
  { id: 'm1', label: 'Module 1', status: 'approved', description: 'Administrative' },
  { id: 'm2', label: 'Module 2', status: 'in-progress', description: 'Summaries' },
  { id: 'm3', label: 'Module 3', status: 'draft', description: 'Quality' },
  { id: 'm4', label: 'Module 4', status: 'draft', description: 'Nonclinical' },
  { id: 'm5', label: 'Module 5', status: 'draft', description: 'Clinical' },
];

const STATUS_STYLES = {
  approved: { label: 'Approved', variant: 'success' },
  'in-progress': { label: 'In Progress', variant: 'secondary' },
  draft: { label: 'Draft', variant: 'outline' },
};

export default function DocumentSelector({ onSelectDocument }) {
  const [activeTab, setActiveTab] = useState('recent');

  const handleModuleSelect = moduleTitle => {
    if (moduleTitle.includes('2')) {
      onSelectDocument('module2');
    } else {
      console.log('Module selected:', moduleTitle);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-6xl space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Regulatory Submission Workspace</p>
            <h1 className="text-3xl font-semibold">eCTD Co-Author™</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">IND → eCTD</Badge>
            <Badge variant="secondary">Target: FDA</Badge>
            <Badge variant="outline">Region: EMA + PMDA</Badge>
            <Badge variant="outline">Sequence 0007</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Regulatory Submission Workspace</p>
        <h1 className="text-3xl font-semibold">eCTD Co-Author™</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Orchestrate IND → eCTD workflows with compliance guidance, structured authoring, and
          readiness analytics tailored to biotech, CRO, and pharma teams.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-muted/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Submission Health</CardTitle>
            <CardDescription>Overall readiness across modules</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span>Completeness</span>
                <span className="font-medium">78%</span>
              </div>
              <Progress value={78} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span>Validation</span>
                <span className="font-medium">92%</span>
              </div>
              <Progress value={92} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
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
            <CardDescription>Top issues to resolve</CardDescription>
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
            <CardDescription>Active contributors</CardDescription>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-blue-600" />
              <span>Module Dashboard</span>
            </CardTitle>
            <CardDescription>
              Track authoring progress and jump into sections with AI-assisted writing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ModuleDashboard onSelectModule={handleModuleSelect} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xl flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-blue-600" />
                <span>Quick Actions</span>
              </CardTitle>
              <CardDescription>Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => onSelectDocument('module2')}
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      <span>Continue Module 2.7</span>
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </li>
                <li>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-blue-600" />
                      <span>New from Template</span>
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </li>
                <li>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-600" />
                      <span>Launch AI Draft</span>
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-blue-600" />
                Regulatory Pyramid
              </CardTitle>
              <CardDescription>Module coverage snapshot</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {PYRAMID_MODULES.map(module => {
                const status = STATUS_STYLES[module.status];
                return (
                  <div
                    key={module.id}
                    className="flex items-center justify-between rounded-md border border-muted/60 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium">{module.label}</p>
                      <p className="text-xs text-muted-foreground">{module.description}</p>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Lifecycle Document Coverage</CardTitle>
            <CardDescription>
              From protocols and CSRs to publications and value dossiers.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {LIFECYCLE_DOCS.map(doc => (
              <div key={doc.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium text-sm">{doc.label}</p>
                  <p className="text-xs text-muted-foreground">Status: {doc.status}</p>
                </div>
                <Badge variant="outline">{doc.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Enterprise Integrations</CardTitle>
            <CardDescription>Aligned with your SOPs and routing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {INTEGRATIONS.map(integration => (
              <div key={integration} className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>{integration}</span>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full mt-2">
              Configure Integrations
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Governance Tracks</CardTitle>
            <CardDescription>Regulatory, medical affairs, and safety governance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {GOVERNANCE_TRACKS.map(track => (
              <div key={track.id} className="rounded-md border border-muted/60 p-3">
                <p className="font-medium">{track.title}</p>
                <p className="text-xs text-muted-foreground">{track.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">End-to-End Workflow</CardTitle>
            <CardDescription>Aligned with reviewer expectations and SOPs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {WORKFLOW_STAGES.map(stage => (
              <div key={stage.id} className="flex items-start gap-3 rounded-md border border-muted/60 p-3">
                <span className="text-xs font-semibold uppercase text-blue-600">{stage.label}</span>
                <span className="text-xs text-muted-foreground">{stage.detail}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Concept2Cure Platform Differentiators</CardTitle>
          <CardDescription>Comprehensive suite for IND, NDA, and BLA programs.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
          {PLATFORM_CAPABILITIES.map(capability => (
            <div key={capability} className="flex items-start gap-2 rounded-md border border-muted/60 p-3">
              <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5" />
              <span>{capability}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Reviewer Expectations</CardTitle>
            <CardDescription>Aligned to agency and internal governance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {REVIEWER_EXPECTATIONS.map(item => (
              <div key={item} className="flex items-start gap-2 rounded-md border border-muted/60 p-3">
                <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Program Portfolio</CardTitle>
            <CardDescription>IND/NDA/BLA workstreams in flight.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {PROGRAM_PORTFOLIO.map(program => (
              <div key={program.id} className="rounded-md border border-muted/60 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{program.name}</p>
                  <Badge variant="outline">{program.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{program.nextMilestone}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      </div>

      <Card>
        <CardHeader className="pb-3">
          <Tabs defaultValue="recent" value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="recent">Recent Documents</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab}>
            <TabsContent value="recent" className="m-0">
              <div className="space-y-4">
                {RECENT_DOCUMENTS.map(doc => (
                  <div key={doc.id} className="border rounded p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-600" />
                          {doc.title}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Module {doc.module} • Last edited {doc.lastEdited}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => onSelectDocument('module2')}>
                        Open
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="templates" className="m-0">
              <div className="space-y-4">
                {TEMPLATES.map(tpl => (
                  <div key={tpl.id} className="border rounded p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-blue-600" />
                          {tpl.title}
                        </h3>
                        <p className="text-sm text-gray-500">Module {tpl.module}</p>
                        <p className="text-sm mt-1 text-muted-foreground">{tpl.description}</p>
                      </div>
                      <Button size="sm" onClick={() => onSelectDocument('module2')}>
                        Use Template
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
