import React from 'react';
import { useLocation } from 'wouter';
import WorkbenchLayout from './WorkbenchLayout';
import EvidenceLibrary from './EvidenceLibrary';
import AuditTimeline from './AuditTimeline';
import TraceabilityInspector from './TraceabilityInspector';
import ClaimsView from './ClaimsView';
import StandardsView from './StandardsView';
import OutcomesView from './OutcomesView';
import ExportsView from './ExportsView';

export default function Cerv2WorkbenchPage({ params }) {
  const [location] = useLocation();
  const programId = params?.programId;
  const view = params?.view || 'evidence';

  if (!programId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <div className="text-lg font-semibold text-slate-900">Missing program ID</div>
          <div className="mt-2 text-sm text-slate-500">
            Open the workbench from a CERV2 program to continue.
          </div>
        </div>
      </div>
    );
  }

  const [selectedEntity, setSelectedEntity] = React.useState(null);

  const headerMap = {
    evidence: 'Evidence Library',
    audit: 'Audit Timeline',
    claims: 'Link Evidence to Claims',
    standards: 'Link Evidence to Standards',
    outcomes: 'Link Evidence to Outcomes',
    exports: 'Generate & Download Exports',
  };

  return (
    <WorkbenchLayout
      programId={programId}
      view={view}
      header={headerMap[view] || 'Workbench'}
    >
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div>
          {view === 'evidence' && <EvidenceLibrary programId={programId} />}
          {view === 'audit' && <AuditTimeline programId={programId} />}
          {view === 'claims' && <ClaimsView programId={programId} onSelect={setSelectedEntity} />}
          {view === 'standards' && <StandardsView programId={programId} onSelect={setSelectedEntity} />}
          {view === 'outcomes' && <OutcomesView programId={programId} onSelect={setSelectedEntity} />}
          {view === 'exports' && <ExportsView programId={programId} />}
        </div>
        {(view === 'claims' || view === 'standards' || view === 'outcomes') && (
          <div className="sticky top-24 h-fit">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <TraceabilityInspector programId={programId} entity={selectedEntity} />
            </div>
          </div>
        )}
      </div>
    </WorkbenchLayout>
  );
}
