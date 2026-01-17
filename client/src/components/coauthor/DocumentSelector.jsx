// client/src/components/coauthor/DocumentSelector.jsx
import React, { useState } from 'react';
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
  AlertTriangle,
  ShieldCheck,
  Users,
  FolderTree,
  Sparkles,
} from 'lucide-react';
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
