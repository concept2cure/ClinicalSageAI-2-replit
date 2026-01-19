import React from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Building,
  Shield,
  UserPlus,
  Package,
  Network,
  Layers,
  ArrowRight,
  Settings,
} from 'lucide-react';

const adminSections = [
  {
    title: 'Organization settings',
    description: 'Update org profile, branding, and default policies.',
    icon: Building,
    href: '/settings?tab=general',
    badge: 'Org',
  },
  {
    title: 'Enterprise security',
    description: 'SSO, MFA, session controls, and security baselines.',
    icon: Shield,
    href: '/settings?tab=security',
    badge: 'Security',
  },
  {
    title: 'New users & access',
    description: 'Add users, assign roles, and manage access groups.',
    icon: UserPlus,
    href: '/client-management?tab=users',
    badge: 'Users',
  },
  {
    title: 'Licensing & entitlements',
    description: 'Manage seats, modules, and subscription renewals.',
    icon: Package,
    href: '/client-licenses',
    badge: 'Licensing',
  },
  {
    title: 'CRO parent / child hierarchy',
    description: 'Manage CRO relationships and downstream client orgs.',
    icon: Network,
    href: '/tenant-management',
    badge: 'Hierarchy',
  },
  {
    title: 'Workspace & project dependencies',
    description: 'Configure client workspaces, quotas, and project scopes.',
    icon: Layers,
    href: '/client-management?tab=workspace-settings',
    badge: 'Workspaces',
  },
];

export default function AdminConsole() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-6 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                <Settings className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Enterprise Admin Console</h1>
                <p className="text-sm text-slate-600">
                  Consolidated administration for CROs, biotech sponsors, and consultants.
                </p>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setLocation('/client-portal')}
            className="border-slate-200"
          >
            Back to Client Portal
          </Button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {adminSections.map(section => {
            const Icon = section.icon;
            return (
              <Card key={section.title} className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className="space-y-2">
                    <CardTitle className="text-lg text-slate-900">{section.title}</CardTitle>
                    <CardDescription>{section.description}</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {section.badge}
                  </Badge>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-slate-700" />
                    </div>
                    <span>Configure now</span>
                  </div>
                  <Button onClick={() => setLocation(section.href)} className="gap-2">
                    Open
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
