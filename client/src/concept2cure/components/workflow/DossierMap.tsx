import React from 'react';
import { ChevronLeft, FileText, CheckCircle, AlertTriangle, Clock, Lock } from 'lucide-react';

interface DossierMapProps {
  projectName?: string;
  projectType?: string;
  onSectionClick: (sectionCode: string) => void;
  onBack: () => void;
}

const STATUS_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  approved: { icon: CheckCircle, color: 'text-emerald-500' },
  'in-review': { icon: Clock, color: 'text-amber-500' },
  drafting: { icon: FileText, color: 'text-blue-500' },
  'not-started': { icon: Clock, color: 'text-zinc-300' },
  blocked: { icon: AlertTriangle, color: 'text-red-500' },
  locked: { icon: Lock, color: 'text-zinc-400' },
};

interface DossierSection {
  code: string;
  title: string;
  status: string;
  children?: DossierSection[];
}

const CTD_STRUCTURE: DossierSection[] = [
  {
    code: '1',
    title: 'Module 1 — Administrative',
    status: 'approved',
    children: [
      { code: '1.1', title: 'Forms', status: 'approved' },
      { code: '1.2', title: 'Cover Letter', status: 'approved' },
      { code: '1.3.1', title: 'Form FDA 1571', status: 'approved' },
      { code: '1.3.2', title: 'Form FDA 1572', status: 'drafting' },
    ],
  },
  {
    code: '2',
    title: 'Module 2 — CTD Summaries',
    status: 'drafting',
    children: [
      { code: '2.2', title: 'Introduction', status: 'drafting' },
      { code: '2.3', title: 'Quality Overall Summary', status: 'not-started' },
      { code: '2.5', title: 'Clinical Overview', status: 'drafting' },
      { code: '2.7.3', title: 'Clinical Efficacy', status: 'drafting' },
    ],
  },
  {
    code: '3',
    title: 'Module 3 — Quality',
    status: 'in-review',
    children: [
      { code: '3.2.S', title: 'Drug Substance', status: 'in-review' },
      { code: '3.2.P', title: 'Drug Product', status: 'in-review' },
      { code: '3.2.A', title: 'Appendices', status: 'not-started' },
    ],
  },
  {
    code: '4',
    title: 'Module 4 — Nonclinical',
    status: 'not-started',
    children: [
      { code: '4.2.1', title: 'Pharmacology', status: 'not-started' },
      { code: '4.2.3', title: 'Toxicology', status: 'not-started' },
    ],
  },
  {
    code: '5',
    title: 'Module 5 — Clinical',
    status: 'blocked',
    children: [
      { code: '5.3', title: 'Clinical Study Reports', status: 'blocked' },
      { code: '5.4', title: 'Literature References', status: 'not-started' },
    ],
  },
];

export const DossierMap: React.FC<DossierMapProps> = ({
  projectName,
  projectType,
  onSectionClick,
  onBack,
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-zinc-50/50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-11 border-b border-zinc-200 bg-white shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <span className="text-zinc-300">/</span>
        <span className="text-sm font-semibold text-zinc-900">Dossier Map</span>
        {projectType && (
          <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 font-medium ml-2">
            {projectType}
          </span>
        )}
        {projectName && <span className="text-xs text-zinc-500 ml-1">{projectName}</span>}
      </div>

      {/* CTD Tree */}
      <div className="max-w-3xl mx-auto w-full px-6 py-6 space-y-4">
        {CTD_STRUCTURE.map(mod => (
          <div
            key={mod.code}
            className="rounded-xl border border-zinc-200 bg-white overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 bg-zinc-50 border-b border-zinc-100">
              <span className="text-xs font-bold text-zinc-400 w-6">{mod.code}</span>
              <span className="text-sm font-semibold text-zinc-900">{mod.title}</span>
            </div>
            <div className="divide-y divide-zinc-100">
              {mod.children?.map(sec => {
                const statusInfo = STATUS_ICON[sec.status] || STATUS_ICON['not-started'];
                const Icon = statusInfo.icon;
                return (
                  <button
                    key={sec.code}
                    onClick={() => onSectionClick(sec.code)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 transition-colors text-left"
                  >
                    <Icon className={`w-3.5 h-3.5 ${statusInfo.color}`} />
                    <span className="text-xs font-mono text-zinc-400 w-10">{sec.code}</span>
                    <span className="text-sm text-zinc-800">{sec.title}</span>
                    <span className="text-xs text-zinc-400 ml-auto capitalize">
                      {sec.status.replace('-', ' ')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DossierMap;
