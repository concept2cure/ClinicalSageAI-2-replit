/**
 * @fileoverview IND Workspace Right Rail — section-specific context tabs
 *
 * Provides CTD/section-specific guidance, historical basis,
 * required inputs, reviewer state, and placement context.
 * Clearly differentiates IND from RI Copilot.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { BookOpen, History, ListChecks, UserCheck, MapPin, Loader2 } from 'lucide-react';
import { useCSRSearch } from '../../hooks/useWorkspaceIntelligence';
import { usePrecedentSearch } from '../../hooks/usePrecedentEngine';

interface INDRightRailProps {
  projectName?: string;
  submissionType?: string;
  indication?: string;
}

type TabId = 'guidance' | 'basis' | 'inputs' | 'reviewer' | 'placement';

const TABS: { id: TabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'guidance', label: 'Guidance', icon: BookOpen },
  { id: 'basis', label: 'Basis', icon: History },
  { id: 'inputs', label: 'Inputs', icon: ListChecks },
  { id: 'reviewer', label: 'Reviewer', icon: UserCheck },
  { id: 'placement', label: 'CTD', icon: MapPin },
];

export const INDRightRail: React.FC<INDRightRailProps> = ({
  projectName,
  submissionType,
  indication,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('guidance');

  // Live evidence data for Historical Basis tab
  const { data: csrResults = [], isLoading: csrLoading } = useCSRSearch(
    indication ? { query_text: indication, limit: 20 } : null
  );
  const { data: precedents = [], isLoading: precedentLoading } = usePrecedentSearch(
    submissionType ? { submissionType, indication } : null
  );

  return (
    <div className="hidden lg:flex w-72 shrink-0 border-l border-zinc-200 flex-col bg-zinc-50/30 min-h-0">
      {/* Tab bar */}
      <div className="flex items-center border-b border-zinc-200 px-1 shrink-0 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-2 text-[11px] font-medium whitespace-nowrap transition-colors border-b-2',
                activeTab === tab.id
                  ? 'border-violet-500 text-violet-700'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {activeTab === 'guidance' && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">
              Section Guidance
            </h3>
            <div className="space-y-2">
              <GuidanceItem
                title="21 CFR 312.23(a)(5)"
                body="Chemistry, Manufacturing, and Controls information — drug substance and drug product specifications, stability, and manufacturing process."
              />
              <GuidanceItem
                title="21 CFR 312.23(a)(8)"
                body="Clinical protocol — objectives, design, endpoints, statistical plan, safety monitoring."
              />
              <GuidanceItem
                title="ICH M4 CTD Structure"
                body="Module 1: Administrative · Module 2: Summaries · Module 3: Quality · Module 4: Nonclinical · Module 5: Clinical."
              />
              <GuidanceItem
                title="FDA Guidance"
                body="IND Applications for Clinical Investigations: refer to content and format requirements for initial IND submission."
              />
            </div>
          </div>
        )}

        {activeTab === 'basis' && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">
              Historical Basis
            </h3>
            {csrLoading || precedentLoading ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                <span className="text-xs text-zinc-500">Loading evidence…</span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <BasisItem label="Matched CSR studies" value={`${csrResults.length} found`} />
                  <BasisItem label="Precedent decisions" value={`${precedents.length} matched`} />
                  <BasisItem
                    label="Comparable endpoints"
                    value={csrResults.length > 0 ? `From ${csrResults.length} CSRs` : 'No data yet'}
                  />
                  <BasisItem
                    label="Historical approval rates"
                    value={
                      precedents.length > 0 ? `${precedents.length} phase-specific` : 'Pending'
                    }
                  />
                </div>
                {csrResults.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase">
                      Top CSR Matches
                    </span>
                    {csrResults.slice(0, 5).map((csr: any, i: number) => (
                      <div key={i} className="rounded border border-zinc-200 bg-white p-2">
                        <span className="text-[11px] font-medium text-zinc-700 line-clamp-1 block">
                          {csr.title || `Study ${i + 1}`}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          {csr.phase && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                              {csr.phase}
                            </span>
                          )}
                          {csr.outcome && (
                            <span
                              className={cn(
                                'text-[9px] px-1 py-0.5 rounded font-medium',
                                csr.outcome === 'positive'
                                  ? 'bg-emerald-50 text-emerald-600'
                                  : 'bg-red-50 text-red-600'
                              )}
                            >
                              {csr.outcome}
                            </span>
                          )}
                          {csr.sponsor && (
                            <span className="text-[9px] text-zinc-400">{csr.sponsor}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!indication && (
                  <p className="text-[11px] text-zinc-400 italic">
                    Select a project with an indication to see matched evidence.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'inputs' && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">
              Required Inputs
            </h3>
            <div className="space-y-2">
              <InputItem label="Investigator's Brochure" required />
              <InputItem label="Clinical Protocol" required />
              <InputItem label="CMC Data Package" required />
              <InputItem label="Nonclinical Pharmacology / Toxicology" required />
              <InputItem label="Previous Human Experience" />
              <InputItem label="Informed Consent Form" required />
              <InputItem label="IRB Approval" required />
              <InputItem label="Financial Disclosure" />
            </div>
          </div>
        )}

        {activeTab === 'reviewer' && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">
              Reviewer State
            </h3>
            <p className="text-xs text-zinc-500">
              Track section review progress and approval states across the dossier.
            </p>
            <div className="space-y-2">
              <ReviewItem label="Module 1 — Administrative" status="not_started" />
              <ReviewItem label="Module 2 — Summaries" status="drafting" />
              <ReviewItem label="Module 3 — Quality (CMC)" status="not_started" />
              <ReviewItem label="Module 4 — Nonclinical" status="not_started" />
              <ReviewItem label="Module 5 — Clinical" status="drafting" />
            </div>
          </div>
        )}

        {activeTab === 'placement' && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">
              CTD Placement
            </h3>
            <p className="text-xs text-zinc-500">
              Common Technical Document module structure for {submissionType || 'IND'} filing.
            </p>
            <div className="space-y-1.5">
              <PlacementItem
                module="1"
                label="Administrative Information"
                sections={['1.1 Cover Letter', '1.2 Application Form', '1.3.1 Patent Information']}
              />
              <PlacementItem
                module="2"
                label="CTD Summaries"
                sections={[
                  '2.2 Introduction',
                  '2.3 Quality Overall Summary',
                  '2.4 Nonclinical Overview',
                  '2.5 Clinical Overview',
                  '2.7 Clinical Summary',
                ]}
              />
              <PlacementItem
                module="3"
                label="Quality (CMC)"
                sections={['3.2.S Drug Substance', '3.2.P Drug Product', '3.2.A Appendices']}
              />
              <PlacementItem
                module="4"
                label="Nonclinical"
                sections={['4.2.1 Pharmacology', '4.2.2 Pharmacokinetics', '4.2.3 Toxicology']}
              />
              <PlacementItem
                module="5"
                label="Clinical"
                sections={['5.2 Clinical Study Reports', '5.3 Literature References']}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const GuidanceItem: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
    <span className="text-xs font-semibold text-zinc-700 block mb-1">{title}</span>
    <span className="text-[11px] text-zinc-500 leading-relaxed">{body}</span>
  </div>
);

const BasisItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 last:border-0">
    <span className="text-xs text-zinc-700">{label}</span>
    <span className="text-[10px] text-zinc-400">{value}</span>
  </div>
);

const InputItem: React.FC<{ label: string; required?: boolean }> = ({ label, required }) => (
  <div className="flex items-center gap-2 py-1">
    <div
      className={cn('w-2 h-2 rounded-full flex-shrink-0', required ? 'bg-red-400' : 'bg-zinc-300')}
    />
    <span className="text-xs text-zinc-700">{label}</span>
    {required && <span className="text-[9px] text-red-500 font-medium ml-auto">Required</span>}
  </div>
);

const ReviewItem: React.FC<{
  label: string;
  status: 'not_started' | 'drafting' | 'review' | 'approved' | 'locked';
}> = ({ label, status }) => {
  const statusConfig = {
    not_started: { bg: 'bg-zinc-100', text: 'text-zinc-500', label: 'Not Started' },
    drafting: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Drafting' },
    review: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'In Review' },
    approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Approved' },
    locked: { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Locked' },
  };
  const cfg = statusConfig[status];
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 last:border-0">
      <span className="text-xs text-zinc-700">{label}</span>
      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', cfg.bg, cfg.text)}>
        {cfg.label}
      </span>
    </div>
  );
};

const PlacementItem: React.FC<{ module: string; label: string; sections: string[] }> = ({
  module,
  label,
  sections,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
      >
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold leading-none flex-shrink-0">
          M{module}
        </span>
        <span className="text-xs font-medium text-zinc-700 flex-1">{label}</span>
        <span className="text-[10px] text-zinc-400">{sections.length}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-100 px-2.5 py-1.5">
          {sections.map(s => (
            <div
              key={s}
              className="text-[10px] text-zinc-500 py-0.5 pl-3 border-l-2 border-zinc-200"
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default INDRightRail;
