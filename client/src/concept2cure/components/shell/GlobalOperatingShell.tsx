import React from 'react';
import {
  Layers,
  Brain,
  FlaskConical,
  Microscope,
  FileCheck,
  Archive,
  ShieldCheck,
  Send,
  Upload,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GlobalOperatingShellProps {
  layoutMode: string;
  activeProjectName?: string;
  activeNavId?: string;
  currentGlobalNodeLabel?: string;
  activeArtifactLabel?: string;
  onAction?: (
    action:
      | 'ri-copilot'
      | 'submission-builder'
      | 'cmc'
      | 'clinical-module5'
      | 'verify'
      | 'review'
      | 'publish'
      | 'haq'
      | 'vault'
  ) => void;
  children: React.ReactNode;
}

const GLOBAL_NODES = [
  { id: 'ri-copilot', label: 'RI Copilot', icon: Brain },
  { id: 'submission-builder', label: 'Submission Builder', icon: Layers },
  { id: 'cmc', label: 'CMC', icon: FlaskConical },
  { id: 'clinical-module5', label: 'Clinical / Module 5', icon: Microscope },
  { id: 'verify', label: 'Verify', icon: FileCheck },
  { id: 'review', label: 'Review', icon: ShieldCheck },
  { id: 'publish', label: 'Publish', icon: Send },
  { id: 'haq', label: 'HAQ', icon: Shield },
  { id: 'vault', label: 'Vault', icon: Archive },
] as const;

export function GlobalOperatingShell({
  layoutMode,
  activeProjectName,
  activeNavId,
  currentGlobalNodeLabel,
  activeArtifactLabel,
  onAction,
  children,
}: GlobalOperatingShellProps) {
  const showHeader = [
    'regulatory-workspace',
    'documents',
    'report-engine',
    'submissions',
    'review',
    'dossier-map',
  ].includes(layoutMode);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#faf9f7]">
      {showHeader && (
        <div className="h-9 border-b border-stone-200 bg-white/80 backdrop-blur-sm px-3 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-stone-500" />
          <span className="text-xs font-medium text-stone-700">Concept2Cure OS</span>
          {activeProjectName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
              {activeProjectName}
            </span>
          )}
          {activeArtifactLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
              {activeArtifactLabel}
            </span>
          )}
          {currentGlobalNodeLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
              {currentGlobalNodeLabel}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {onAction && (
              <>
                <button
                  type="button"
                  onClick={() => onAction('ri-copilot')}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-stone-100"
                >
                  <Brain className="w-3 h-3" />
                  RI Copilot
                </button>
                <button
                  type="button"
                  onClick={() => onAction('submission-builder')}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-stone-100"
                >
                  <Layers className="w-3 h-3" />
                  Submission Builder
                </button>
                <button
                  type="button"
                  onClick={() => onAction('cmc')}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-stone-100"
                >
                  <FlaskConical className="w-3 h-3" />
                  CMC
                </button>
                <button
                  type="button"
                  onClick={() => onAction('clinical-module5')}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-stone-100"
                >
                  <Microscope className="w-3 h-3" />
                  Clinical / Module 5
                </button>
                <button
                  type="button"
                  onClick={() => onAction('verify')}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-stone-100"
                >
                  <FileCheck className="w-3 h-3" />
                  Verify
                </button>
                <button
                  type="button"
                  onClick={() => onAction('review')}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-stone-100"
                >
                  <ShieldCheck className="w-3 h-3" />
                  Review
                </button>
                <button
                  type="button"
                  onClick={() => onAction('publish')}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-stone-100"
                >
                  <Upload className="w-3 h-3" />
                  Publish
                </button>
                <button
                  type="button"
                  onClick={() => onAction('haq')}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-stone-100"
                >
                  <Shield className="w-3 h-3" />
                  HAQ
                </button>
                <button
                  type="button"
                  onClick={() => onAction('vault')}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-600 hover:bg-stone-100"
                >
                  <Archive className="w-3 h-3" />
                  Vault
                </button>
              </>
            )}
            {GLOBAL_NODES.map(layer => {
              const Icon = layer.icon;
              const isActive = activeNavId === layer.id;
              return (
                <span
                  key={layer.id}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]',
                    isActive
                      ? 'border-stone-300 bg-stone-100 text-stone-700'
                      : 'border-stone-200 bg-white text-stone-400'
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {layer.label}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export default GlobalOperatingShell;
