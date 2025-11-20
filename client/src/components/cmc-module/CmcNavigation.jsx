import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Beaker,
  FlaskConical,
  Factory,
  FileCheck,
  BarChart,
  Lightbulb,
  BookOpen,
  FileText,
  Database,
  DownloadCloud,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Separator } from '../../components/ui/separator';

export default function CmcNavigation({ currentBlueprintId }) {
  const location = useLocation();

  const modules = [
    {
      id: 'blueprint',
      name: 'Blueprint Generator',
      href: `/cmc/blueprints/${currentBlueprintId || 'new'}`,
      icon: Beaker,
      description: 'Create and manage CMC blueprints',
      isNew: false,
    },
    {
      id: 'impact',
      name: 'Change Impact Simulator',
      href: `/cmc/impact-simulator/${currentBlueprintId}`,
      icon: FlaskConical,
      description: 'Simulate impact of manufacturing changes',
      isNew: false,
    },
    {
      id: 'manufacturing',
      name: 'Manufacturing Tuner',
      href: `/cmc/manufacturing/${currentBlueprintId}`,
      icon: Factory,
      description: 'Optimize manufacturing parameters',
      isNew: false,
    },
    {
      id: 'compliance',
      name: 'Compliance Tools',
      href: `/cmc/compliance/${currentBlueprintId}`,
      icon: FileCheck,
      description: 'Verify regulatory compliance',
      isNew: false,
    },
    {
      id: 'analytics',
      name: 'CMC Analytics',
      href: `/cmc/analytics/${currentBlueprintId}`,
      icon: BarChart,
      description: 'Track and visualize CMC metrics',
      isNew: false,
    },
    {
      id: 'batch-records',
      name: 'Batch Records',
      href: `/cmc/batch-records/${currentBlueprintId}`,
      icon: Database,
      description: 'Generate and manage batch records',
      isNew: true,
    },
    {
      id: 'method-validation',
      name: 'Method Validation',
      href: `/cmc/method-validation/${currentBlueprintId}`,
      icon: Lightbulb,
      description: 'Automated analytical method validation',
      isNew: true,
    },
  ];

  const integrations = [
    {
      name: 'IND Wizard™',
      href: '/ind-wizard/cmc',
      description: 'IND submission preparation',
      buttonText: 'Go to IND Wizard',
      icon: FileText,
    },
    {
      name: 'TrialSage Vault™',
      href: '/vault/cmc-documents',
      description: 'Document management',
      buttonText: 'View in Vault',
      icon: BookOpen,
    },
    {
      name: 'Export to eCTD',
      href: '/cmc/export/ectd',
      description: 'Generate eCTD-ready documents',
      buttonText: 'Export Documents',
      icon: DownloadCloud,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        {modules.map(item => (
          <Link
            key={item.id}
            to={item.href}
            className={cn(
              'flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-muted/50 text-sm',
              location.pathname.includes(item.id) && 'bg-muted font-medium'
            )}
          >
            <div className="flex items-center gap-3">
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <span>{item.name}</span>
            </div>
            {item.isNew && (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                New
              </span>
            )}
          </Link>
        ))}
      </div>

      <Separator />

      <div className="space-y-1">
        <h3 className="mb-2 px-3 text-xs font-medium text-muted-foreground">Integrations</h3>
        {integrations.map((integration, i) => (
          <Link
            key={i}
            to={integration.href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/50"
          >
            <integration.icon className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 space-y-1">
              <p className="font-medium leading-none">{integration.name}</p>
              <p className="text-xs text-muted-foreground">{integration.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
