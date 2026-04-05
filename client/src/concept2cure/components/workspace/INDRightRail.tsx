/**
 * @fileoverview IND Workspace Right Rail — section-specific context tabs
 *
 * Provides CTD/section-specific guidance, historical basis,
 * required inputs, reviewer state, and placement context.
 * Clearly differentiates IND from AnA Intelligence.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { BookOpen, History, ListChecks, UserCheck, MapPin, Loader2 } from 'lucide-react';
import { useCSRSearch } from '../../hooks/useWorkspaceIntelligence';
import { usePrecedentSearch } from '../../hooks/usePrecedentEngine';
import { LIFECYCLE, toLifecycleStage } from '../ui/enterprise';
import { WorkspaceTabBar, InspectorPanel, type WorkspaceTab } from '@/components/ui/workspace-primitives';

interface INDRightRailProps {
  projectName?: string;
  submissionType?: string;
  indication?: string;
}

type TabId = 'guidance' | 'basis' | 'inputs' | 'reviewer' | 'placement';

const TABS: (WorkspaceTab & { id: TabId })[] = [
  { id: 'guidance', label: 'Guidance', icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: 'basis', label: 'Basis', icon: <History className="w-3.5 h-3.5" /> },
  { id: 'inputs', label: 'Inputs', icon: <ListChecks className="w-3.5 h-3.5" /> },
  { id: 'reviewer', label: 'Reviewer', icon: <UserCheck className="w-3.5 h-3.5" /> },
  { id: 'placement', label: 'CTD', icon: <MapPin className="w-3.5 h-3.5" /> },
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
    <InspectorPanel className="hidden lg:flex" testId="ind-right-rail">
      {/* Tab bar */}
      <WorkspaceTabBar
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        testId="ind-right-rail-tabs"
      />

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {activeTab === 'guidance' && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-stone-600 uppercase tracking-wider">
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
            <h3 className="text-xs font-semibold text-stone-600 uppercase tracking-wider">
              Historical Basis
            </h3>
            {csrLoading || precedentLoading ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-stone-1000" />
                <span className="text-xs text-stone-500">Loading evidence…</span>
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
                  <div className="space-y-1.5 pt-2 border-t border-stone-200">
                    <span className="text-xs font-semibold text-stone-500 uppercase">
                      Top CSR Matches
                    </span>
                    {csrResults.slice(0, 5).map((csr: any, i: number) => (
                      <div key={i} className="rounded border border-stone-200 bg-white p-2">
                        <span className="text-xs font-medium text-stone-700 line-clamp-1 block">
                          {csr.title || `Study ${i + 1}`}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          {csr.phase && (
                            <span className="text-xs px-1 py-0.5 rounded bg-stone-100 text-stone-600 font-medium">
                              {csr.phase}
                            </span>
                          )}
                          {csr.outcome && (
                            <span
                              className={cn(
                                'text-xs px-1 py-0.5 rounded font-medium',
                                csr.outcome === 'positive'
                                  ? 'bg-stone-100 text-stone-700'
                                  : 'bg-stone-100 text-stone-700'
                              )}
                            >
                              {csr.outcome}
                            </span>
                          )}
                          {csr.sponsor && (
                            <span className="text-xs text-stone-400">{csr.sponsor}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!indication && (
                  <p className="text-xs text-stone-400 italic">
                    Select a project with an indication to see matched evidence.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'inputs' && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-stone-600 uppercase tracking-wider">
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
            <h3 className="text-xs font-semibold text-stone-600 uppercase tracking-wider">
              Reviewer State
            </h3>
            <p className="text-xs text-stone-500">
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
            <h3 className="text-xs font-semibold text-stone-600 uppercase tracking-wider">
              CTD Placement
            </h3>
            <p className="text-xs text-stone-500">
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
    </InspectorPanel>
  );
};

const GuidanceItem: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="rounded-lg border border-stone-200 bg-white p-2.5">
    <span className="text-xs font-semibold text-stone-700 block mb-1">{title}</span>
    <span className="text-xs text-stone-500 leading-relaxed">{body}</span>
  </div>
);

const BasisItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-stone-200 last:border-0">
    <span className="text-xs text-stone-700">{label}</span>
    <span className="text-xs text-stone-400">{value}</span>
  </div>
);

const InputItem: React.FC<{ label: string; required?: boolean }> = ({ label, required }) => (
  <div className="flex items-center gap-2 py-1">
    <div
      className={cn('w-2 h-2 rounded-full flex-shrink-0', required ? 'bg-stone-400' : 'bg-stone-300')}
    />
    <span className="text-xs text-stone-700">{label}</span>
    {required && <span className="text-xs text-stone-1000 font-medium ml-auto">Required</span>}
  </div>
);

const ReviewItem: React.FC<{
  label: string;
  status: 'not_started' | 'drafting' | 'review' | 'approved' | 'locked';
}> = ({ label, status }) => {
  const statusConfig = {
    not_started: { bg: LIFECYCLE.not_started.bg, text: LIFECYCLE.not_started.text, label: 'Not Started' },
    drafting: { bg: LIFECYCLE.draft.bg, text: LIFECYCLE.draft.text, label: 'Drafting' },
    review: { bg: LIFECYCLE.in_review.bg, text: LIFECYCLE.in_review.text, label: 'In Review' },
    approved: { bg: LIFECYCLE.approved.bg, text: LIFECYCLE.approved.text, label: 'Approved' },
    locked: { bg: LIFECYCLE.published.bg, text: LIFECYCLE.published.text, label: 'Locked' },
  };
  const cfg = statusConfig[status];
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-stone-200 last:border-0">
      <span className="text-xs text-stone-700">{label}</span>
      <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', cfg.bg, cfg.text)}>
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
    <div className="rounded-lg border border-stone-200 bg-white">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none rounded"
      >
        <span className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-semibold leading-none flex-shrink-0">
          M{module}
        </span>
        <span className="text-xs font-medium text-stone-700 flex-1">{label}</span>
        <span className="text-xs text-stone-400">{sections.length}</span>
      </button>
      {open && (
        <div className="border-t border-stone-200 px-2.5 py-1.5">
          {sections.map(s => (
            <div
              key={s}
              className="text-xs text-stone-500 py-0.5 pl-3 border-l-2 border-stone-200"
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
