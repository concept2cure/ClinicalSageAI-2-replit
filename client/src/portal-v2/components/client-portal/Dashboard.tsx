import React, { useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { usePortal } from '../../core/portalContext';
import { Brain, FileText, Shield, Beaker, BarChart3, MessageSquare } from 'lucide-react';
import LumenCortexChat from '@/components/LumenCortexChat';

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
  ectd_coauthor: '/client-portal/ectd-coauthor',
  '510k_builder': '/client-portal/510k-builder',
  lumen_cortex: '/client-portal/lumen-cortex',
  ai_assistant: '/client-portal/ai-assistant',
  safety_reporting: '/client-portal/safety',
  training: '/client-portal/training',
  project_hub: '/client-portal/project-hub',
  timeline_planner: '/client-portal/timeline-planner',
  settings: '/client-portal/settings',
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
};

export const Dashboard = () => {
  const tenant = useTenant();
  const { experience } = usePortal();
  const [, setLocation] = useLocation();
  const [showChat, setShowChat] = useState(true);

  const orgName = tenant.currentOrganization?.name || 'Organization';
  const clientName = tenant.currentClientWorkspace?.name || 'Client Workspace';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Client Portal</h1>
          <p className="text-sm text-muted-foreground">
            Unified workspace for {orgName} • {clientName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-indigo-50 text-indigo-700">
            Powered by Lumen Cortex
          </Badge>
          <Button
            variant={showChat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowChat(!showChat)}
            className={showChat ? 'bg-gradient-to-r from-indigo-500 to-purple-600' : ''}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            AI Assistant
          </Button>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Modules and info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-700">12</div>
                <div className="text-sm text-blue-600">Active Projects</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-700">3</div>
                <div className="text-sm text-green-600">Pending Reviews</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-amber-700">7</div>
                <div className="text-sm text-amber-600">Documents</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-purple-700">98%</div>
                <div className="text-sm text-purple-600">Compliance</div>
              </CardContent>
            </Card>
          </div>

          {/* Module Access */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-600" />
                Available Modules
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {experience.modules.map(moduleId => (
                <button
                  key={moduleId}
                  onClick={() => setLocation(moduleToRoute[moduleId] || '/client-portal')}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-indigo-100 flex items-center justify-center text-gray-600 group-hover:text-indigo-600 transition-colors">
                    {moduleIcons[moduleId] || <FileText className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
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
              className="bg-blue-600 hover:bg-blue-700"
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

        {/* Right column - Lumen Cortex Chat */}
        {showChat && (
          <div className="lg:col-span-1">
            <LumenCortexChat className="h-[600px]" />
          </div>
        )}
      </div>

      {/* Tenant Context Footer */}
      <Card className="bg-gray-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-gray-500">Organization:</span>
              <span className="ml-2 font-medium text-gray-700">{orgName}</span>
            </div>
            <div>
              <span className="text-gray-500">Workspace:</span>
              <span className="ml-2 font-medium text-gray-700">{clientName}</span>
            </div>
            <div>
              <span className="text-gray-500">Features:</span>
              <span className="ml-2 font-medium text-gray-700">
                {experience.features.join(', ')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
