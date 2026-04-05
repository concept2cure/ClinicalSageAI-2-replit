import React from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { usePortal } from '../../core/portalContext';
import {
  Brain,
  FileText,
  Shield,
  Beaker,
  BarChart3,
  MessageSquare,
  Microscope,
} from 'lucide-react';

const moduleToRoute: Record<string, string> = {
  dashboard: '/client-portal',
  vault: '/client-portal/vault',
  regulatory_intel: '/client-portal/regulatory-intel',
  cmc_platform: '/client-portal/cmc-wizard',
  clinical_trial: '/client-portal/study-architect',
  quality_management: '/client-portal/quality',
  document_control: '/client-portal/documents',
  analytics: '/client-portal/analytics',
  cer_generator: '/client-portal/cer-generator',
  ectd_coauthor: '/client-portal/documents', // [BATCH 5] remapped from ectd-coauthor
  '510k_builder': '/client-portal/510k-builder',
  ana_cortex: '/ana',
  ai_assistant: '/client-portal/ai-assistant',
  safety_reporting: '/client-portal/safety',
  training: '/client-portal/training',
  project_hub: '/client-portal/project-hub',
  timeline_planner: '/client-portal/timeline-planner',
  settings: '/client-portal/settings',
  ivdr_module: '/client-portal/ivdr',
};

const moduleIcons: Record<string, React.ReactNode> = {
  dashboard: <BarChart3 className="w-5 h-5" />,
  vault: <FileText className="w-5 h-5" />,
  regulatory_intel: <Shield className="w-5 h-5" />,
  cmc_platform: <Beaker className="w-5 h-5" />,
  clinical_trial: <Beaker className="w-5 h-5" />,
  quality_management: <Shield className="w-5 h-5" />,
  document_control: <FileText className="w-5 h-5" />,
  analytics: <BarChart3 className="w-5 h-5" />,
  settings: <Shield className="w-5 h-5" />,
  ivdr_module: <Microscope className="w-5 h-5" />,
};

export const Dashboard = () => {
  const tenant = useTenant();
  const { experience } = usePortal();
  const [, setLocation] = useLocation();

  const orgName = tenant.currentOrganization?.name || 'Organization';
  const clientName = tenant.currentClientWorkspace?.name || 'Client Workspace';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Client Portal</h1>
          <p className="text-sm text-muted-foreground">
            Unified workspace for {orgName} • {clientName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-stone-100 text-stone-700">
            Powered by AnA — RI Co-pilot
          </Badge>
          <Button
            variant="default"
            size="sm"
            onClick={() => setLocation('/ana')}
            className="bg-gradient-to-r from-stone-900 to-stone-600"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Open AnA
          </Button>
        </div>
      </div>

      {/* Main content grid */}
      <div className="space-y-6">
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-stone-100 border-stone-200">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-stone-700">12</div>
                <div className="text-sm text-stone-600">Active Projects</div>
              </CardContent>
            </Card>
            <Card className="bg-stone-100 border-stone-200">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-stone-800">3</div>
                <div className="text-sm text-stone-700">Pending Reviews</div>
              </CardContent>
            </Card>
            <Card className="bg-stone-100 border-stone-200">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-stone-700">7</div>
                <div className="text-sm text-stone-600">Documents</div>
              </CardContent>
            </Card>
            <Card className="bg-stone-100 border-stone-200">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-stone-700">98%</div>
                <div className="text-sm text-stone-600">Compliance</div>
              </CardContent>
            </Card>
          </div>

          {/* Module Access */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-stone-600" />
                Available Modules
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {experience.modules.map(moduleId => (
                <button
                  key={moduleId}
                  onClick={() => setLocation(moduleToRoute[moduleId] || '/client-portal')}
                  className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-4 text-left transition hover:border-stone-300 hover:bg-stone-100 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-stone-100 group-hover:bg-stone-100 flex items-center justify-center text-stone-600 group-hover:text-stone-600 transition-colors">
                    {moduleIcons[moduleId] || <FileText className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-stone-900">
                      {moduleId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </div>
                    <div className="text-xs text-muted-foreground">Click to access</div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => setLocation('/client-portal/vault')}
              className="bg-stone-600 hover:bg-stone-700"
            >
              <FileText className="w-4 h-4 mr-2" />
              Open Vault
            </Button>
            <Button variant="outline" onClick={() => setLocation('/submission-center')}>
              <Shield className="w-4 h-4 mr-2" />
              Submission Center
            </Button>
            <Button variant="outline" onClick={() => setLocation('/client-portal/analytics')}>
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </Button>
          </div>
        </div>

      </div>

      {/* Tenant Context Footer */}
      <Card className="bg-stone-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-stone-500">Organization:</span>
              <span className="ml-2 font-medium text-stone-700">{orgName}</span>
            </div>
            <div>
              <span className="text-stone-500">Workspace:</span>
              <span className="ml-2 font-medium text-stone-700">{clientName}</span>
            </div>
            <div>
              <span className="text-stone-500">Features:</span>
              <span className="ml-2 font-medium text-stone-700">
                {experience.features.join(', ')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
