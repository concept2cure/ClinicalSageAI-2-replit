import React from 'react';
import { FileStack, FlaskConical, ShieldCheck, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocumentStudioSurfaceProps {
  osLayer: 'documents' | 'vault' | 'reports';
  onOpenWorkbench?: (domain: 'biostatistics' | 'safety-narrative' | 'precedent-intelligence') => void;
  children: React.ReactNode;
}

const LAYER_META = {
  documents: {
    title: 'Document Studio',
    subtitle: 'Primary authoring and governed dossier assembly surface.',
  },
  vault: {
    title: 'Vault Layer',
    subtitle: 'Evidence and source package management as first-class OS layer.',
  },
  reports: {
    title: 'Reports Layer',
    subtitle: 'Reporting and narrative outputs elevated to first-class OS layer.',
  },
};

export function DocumentStudioSurface({ osLayer, onOpenWorkbench, children }: DocumentStudioSurfaceProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 border-b border-stone-200 bg-stone-50/70 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-stone-800">{LAYER_META[osLayer].title}</h3>
            <p className="text-[11px] text-stone-500">{LAYER_META[osLayer].subtitle}</p>
          </div>

          <div className="hidden xl:flex items-center gap-1">
            <WorkbenchButton
              label="Biostats"
              icon={FlaskConical}
              onClick={() => onOpenWorkbench?.('biostatistics')}
            />
            <WorkbenchButton
              label="Safety"
              icon={ShieldCheck}
              onClick={() => onOpenWorkbench?.('safety-narrative')}
            />
            <WorkbenchButton
              label="Precedent"
              icon={BarChart3}
              onClick={() => onOpenWorkbench?.('precedent-intelligence')}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function WorkbenchButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] text-stone-600',
        'hover:text-stone-800 hover:border-stone-300 hover:bg-stone-50 transition-colors'
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
      <FileStack className="w-3 h-3 text-stone-400" />
    </button>
  );
}

export default DocumentStudioSurface;
