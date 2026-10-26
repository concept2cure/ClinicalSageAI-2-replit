/* ------------------------------------------------------------------ *
 *  ProtocolDev.tsx -- protocol development hub (C2C-17 + C2C-18..22)
 *
 *  The surface's honest load states, what AnA can see of it, and the
 *  empty state. The loaded document is `ProtocolDevWorkspace`; the panes
 *  are the ProtocolDev*.tsx siblings beside it. The split happened when
 *  the registers stopped being read-only on 2026-09-21 — one file could
 *  not hold the editors and stay inside the repo's per-file limit, and
 *  suppressing the warning instead would have been the wrong trade.
 *
 *  Re-exported below: PaneHead, KV, SoaTab, RiskTab and the other panes,
 *  so every existing importer of this module is unmoved by the split.
 * ------------------------------------------------------------------ */
import React, { useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import * as PG from './ProtocolGov';
import type { PdevDoc } from '../fixtures/protocol-data';
import { isPendingStore, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { shellProgramName, shellProgramId, useShellProject } from '../shellProject';
import { ProtocolWorkspaceDoc } from './ProtocolDevWorkspace';
import { ProtocolSelectionBar, useProtocolSelection } from './ProtocolDevSelection';
import '../styles/protocol-dev-editing.css';
import { consumeNavParams, NAV_PARAMS_EVENT } from '../navParams';

/** Next major protocol version (kit PDEV_nextMajor). */
const pdevNextMajor = (v: string) => { const m = /^(\d+)\./.exec(v || ''); return m ? ((+m[1]) + 1) + '.0' : '1.0'; };

export { PaneHead, KV } from './ProtocolDevShared';
export { Outline, ObjectivesTab, EligibilityTab, MilestonesTab, AmendmentsTab, DeviationsTab } from './ProtocolDevPanes';
export { SoaTab } from './ProtocolDevSoa';
export { RiskTab, BudgetTab } from './ProtocolDevRegisters';
export { ReviewsTab, ConsentTab } from './ProtocolDevReviews';
export { ProtocolSectionPane } from './ProtocolDevSection';
export { TABS, ProtocolWorkspaceDoc } from './ProtocolDevWorkspace';

/**
 * What AnA can see of this screen. Built from the outer component, above the
 * honest-state early returns, because a hook after an early return is a
 * conditional hook — and because two of those states ("no protocol in
 * development" and "the store did not answer") are exactly what a user would
 * ask about.
 */
interface AnaSurfaceContext {
  summary: string;
  /** Registry type of the protocol on screen (surfaceContext.documentType). */
  documentType?: string;
  facts?: Record<string, unknown>;
  availableActions?: string[];
}

/**
 * The protocol, the section open on screen and the programme are named HERE,
 * in the context the server fences as observed screen state, and never in the
 * text of a request: the AnA buttons on this surface send fixed sentences
 * ("the protocol open on screen", "the section open on screen") because a
 * stored name spliced into a person's turn is an instruction channel
 * (periodic review 2026-09-28, editor family, SEC-C-4).
 */
/** A clinical protocol is an ICH M11 protocol; IACUC, IRB and IBC protocols have no registry type. */
function protocolRegistryType(kind: unknown): string | undefined {
  return kind === 'clinical' ? 'ICH_PROTOCOL' : undefined;
}

function anaContextFor(
  state: { loading: boolean; error: unknown; empty: boolean }, doc: PdevDoc | undefined,
  openSectionId: string | null, program: string | null,
): AnaSurfaceContext {
  if (state.loading) return { summary: 'The protocol is still loading; nothing on screen is final yet.' };
  if (state.error) {
    return {
      summary:
        'The protocol authoring store could not be read, so no protocol is on screen because of a ' +
        'failure, not because none is in development.',
      availableActions: ['Retry the protocol read'],
    };
  }
  if (state.empty || !doc) {
    return {
      summary: 'Protocol development: no protocol is available in the selected scope, so no document is open for authoring.',
      ...(program ? { facts: { programme: program } } : {}),
      availableActions: ['Start a clinical protocol', 'Draft a protocol synopsis for the open project'],
    };
  }
  const secs = Array.isArray(doc.sections) ? doc.sections : [];
  const objs = Array.isArray(doc.objectives) ? doc.objectives : [];
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const done = secs.filter((sec) => sec.status === 'complete').length;
  const open = secs.find((sec) => String(sec.id) === openSectionId);
  /* The design-as-data spine. A protocol with no design bound has been checked
     against no design gate, and AnA must say that rather than let the absence
     read as a pass. */
  const sd = doc.studyDesign ?? null;
  const designLine = !sd
    ? 'No study design is bound to this protocol, so no design gate has been run on it and its projections are unavailable.'
    : !sd.resolved
      ? `This protocol names study design ${sd.studyId}, which could not be read for this organisation — the link is unresolved.`
      : `Bound to study design "${sd.title}" (${sd.studyId}): ${sd.findings.length} design-gate finding(s), risk ${sd.riskLevel}.`;
  return {
    documentType: protocolRegistryType(doc.kind),
    summary:
      `Protocol development: "${doc.shortTitle}" (${doc.title}) v${doc.version}, status ` +
      `${doc.status}, ${doc.completeness}% complete — ${done} of ${secs.length} ` +
      `section(s) complete. ${len(doc.risks)} risk(s), ${len(doc.amendments)} amendment(s), ` +
      `${len(doc.deviations)} deviation(s), ${len(doc.completenessFindings)} completeness finding(s). ` +
      designLine,
    facts: {
      protocolId: doc.id,
      protocolProgramId: doc.programId,
      shortTitle: doc.shortTitle,
      title: doc.title,
      kind: doc.kind,
      version: doc.version,
      status: doc.status,
      sponsor: doc.sponsor,
      principalInvestigator: doc.pi,
      completenessPercent: doc.completeness,
      openSection: open ? { id: open.id, number: open.num, title: open.title, status: open.status } : null,
      sections: secs.map((sec) => ({ number: sec.num, title: sec.title, status: sec.status, required: sec.required })),
      objectives: objs.map((o) => ({ type: o.type, text: o.text, endpoint: o.endpoint })),
      completenessFindings: Array.isArray(doc.completenessFindings) ? doc.completenessFindings : [],
      studyDesign: sd
        ? {
            studyId: sd.studyId, resolved: sd.resolved, title: sd.title, phase: sd.phase,
            indication: sd.indication, riskLevel: sd.riskLevel, blocksApproval: sd.blocksApproval,
            canAdvance: sd.canAdvance, counts: sd.counts, summary: sd.summary,
            standardsChecked: sd.standardsChecked,
            findings: sd.findings.map((f) => ({ code: f.code, severity: f.sev, title: f.title, standard: f.standard })),
          }
        : null,
      registerCounts: {
        risks: len(doc.risks), milestones: len(doc.milestones), amendments: len(doc.amendments),
        deviations: len(doc.deviations), reviews: len(doc.reviews),
      },
    },
    availableActions: [
      'Open a protocol section to read, draft or edit it',
      'Add a risk, milestone, amendment or deviation to the governed registers (a real persisted write)',
      'Review the protocol for completeness against its recorded findings',
      sd
        ? 'Read the bound study design’s gate findings and its five projections on the Study design tab'
        : 'Create or bind a study design so the protocol carries the design gates’ findings and the spine’s projections',
    ],
  };
}

/**
 * The empty state, which names the programme it is empty FOR.
 *
 * It used to describe protocol authoring in the abstract and offer nothing to
 * press. Both affordances here are real: "Start a protocol" opens the governed
 * create drawer (POST /api/protocol-development/documents, which seeds the
 * section outline), and the AnA offer opens the conversation with the request
 * already written — it does not draft anything itself, and there is no model
 * output on this screen. With no programme open the prompt is phrased without
 * one rather than naming a fixture; an answer about the wrong programme is
 * worse than one that had to ask which.
 */
function ProtocolEmptyState({ onAsk }: { onAsk: (msg: string) => void }) {
  const program = shellProgramName();
  /* The programme's name is shown in the title below and carried in the fenced
     surface context; the request itself names no stored value, because a
     programme name is text any member can set (periodic review 2026-09-28,
     SEC-C-4). */
  const draftPrompt = program
    ? 'Draft a protocol synopsis for the project open in this workspace: the study objectives, design, population and primary endpoint, from the evidence already in this project.'
    : 'Draft a protocol synopsis: the study objectives, design, population and primary endpoint, from the evidence already in this project.';
  return (
    <div className="pd-wrap" style={{ padding: 16 }}>
      <div className="pde-empty">
        <EmptyState
          icon={I.fileText}
          title={program ? `No protocol in development for ${program}` : 'No protocol in development yet'}
          hint="Sections, objectives, the schedule of assessments, the risk register, the budget, amendments and review threads are all governed on one protocol document."
          regulation="Serves the ICH M11 protocol record"
        />
        <div className="pde-empty-actions">
          {/* `.c2c-empty-action` / `.c2c-empty-retry` are styled only INSIDE
              `.c2c-empty-state`; as siblings of it they render as bare text.
              The repo's button is `PG.Btn`, which is what these are. */}
          <PG.Btn icon="sparkles" variant="outline" onClick={() => onAsk(draftPrompt)}>Ask AnA to draft the synopsis</PG.Btn>
        </div>
      </div>

    </div>
  );
}

export function ProtocolWorkspace(props: SurfaceViewProps) {
  const programId = shellProgramId(useShellProject());
  const [requestedScope, setScope] = useState<string | null>(() => {
    const value = new URLSearchParams(window.location.search).get('protocolScope');
    return value === 'all' || value === 'unfiled' ? value : null;
  });
  const scope = requestedScope === 'all' || requestedScope === 'unfiled' ? requestedScope : (programId || 'all');
  const [navigationEpoch, setNavigationEpoch] = useState(0);
  useEffect(() => {
    const receive = () => {
      const params = consumeNavParams('protocol-dev');
      if (!params?.protocol || !/^[1-9]\d*$/.test(params.protocol)) return;
      const scopeParam = params.protocolScope === 'unfiled' || params.protocolScope === 'all' ? params.protocolScope : null;
      const url = new URL(window.location.href); url.searchParams.set('protocol', params.protocol);
      if (scopeParam) url.searchParams.set('protocolScope', scopeParam); else url.searchParams.delete('protocolScope');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      setScope(scopeParam); setNavigationEpoch((epoch) => epoch + 1);
    };
    receive(); window.addEventListener(NAV_PARAMS_EVENT, receive);
    return () => window.removeEventListener(NAV_PARAMS_EVENT, receive);
  }, []);
  const rememberScope = (value: string) => {
    const url = new URL(window.location.href);
    if (value === 'all' || value === 'unfiled') url.searchParams.set('protocolScope', value);
    else url.searchParams.delete('protocolScope');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    setScope(value);
  };
  const changeScope = (value: string) => {
    const url = new URL(window.location.href); url.searchParams.delete('protocol');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    rememberScope(value);
  };
  return <ScopedProtocolWorkspace key={`${programId}:${scope}:${navigationEpoch}`} {...props}
    programId={programId} scope={scope} setScope={changeScope} onCreatedScope={rememberScope} />;
}

function ScopedProtocolWorkspace({ onAsk, onNav, programId, scope, setScope, onCreatedScope }: SurfaceViewProps & {
  programId: string | null; scope: string; setScope: (scope: string) => void; onCreatedScope: (scope: string) => void;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const selection = useProtocolSelection(scope, reloadKey);
  const { doc, loading, error, empty, meta } = selection;
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const program = shellProgramName();
  const anaContext = useMemo(
    () => anaContextFor({ loading, error, empty }, doc, openSectionId, program),
    [loading, error, empty, doc, openSectionId, program],
  );
  usePublishSurfaceContext('protocol-dev', anaContext);

  /* The honest states are gated on there being NO document, not on `loading`.
     `useLiveData` sets `loading` on every refetch while keeping the last
     payload, and the re-read after a confirmed write is a refetch — so a
     blanket `if (loading)` unmounted the whole workspace after every governed
     write, threw the author back to the Document tab, and flashed "Loading
     protocol…" over a protocol that was already on screen. The register the
     write belongs to stays mounted; the refresh is reported in the header. */
  if (loading && !doc) {
    return <div className="pd-wrap"><div role="status" className="scaf-note" style={{ margin: 16 }}>Loading protocol…</div></div>;
  }
  if (error && !doc) {
    return (
      <div className="pd-wrap" style={{ padding: 16 }}>
        <EmptyState tone="error" icon={I.alertTriangle}
          title="Couldn't load the protocol"
          hint="The protocol could not be read, so nothing is shown — this is not the same as the organization having no protocol. Sign in and retry, or check that the service is reachable." />
      </div>);
  }
  if (!doc && isPendingStore({ meta })) {
    return (
      <div className="pd-wrap" style={{ padding: 16 }}>
        <EmptyState icon={I.alertTriangle}
          title="Protocol authoring isn't set up on this installation"
          hint="The protocol store has not been provisioned here, so there is nothing to show and nothing can be started yet. This is not the same as the organization having no protocol." />
      </div>);
  }
  const created = (id?: number | null) => {
    if (id) selection.select(String(id));
    if (programId && scope !== programId) onCreatedScope(programId);
    setReloadKey((key) => key + 1);
  };
  return <>
    <ProtocolSelectionBar selection={selection} programId={programId} programName={program}
      scope={scope} setScope={setScope} onCreated={created} />
    {!doc && selection.selectedId && !loading
      ? <div className="pde-refusal" role="alert" style={{ margin: 16 }}>The selected protocol is unavailable in this scope. Select another protocol or change scope.</div>
      : !doc ? <ProtocolEmptyState onAsk={onAsk} />
      : <ProtocolWorkspaceDoc key={doc.id}
          doc={doc as never} onAsk={onAsk} onNav={onNav} refreshing={loading} reloadError={error}
          onChanged={() => setReloadKey((key) => key + 1)} onOpenSection={setOpenSectionId} />}
  </>;

}

/* ---- Bridge exports ----

   The kit's module-scope globals, kept because something still depends on them:
   `SURFACE_VIEWS` is the registry object the kit merges into, and this file's
   `PDEV_nextMajor` write is the import-time side effect that
   tests/ui/surface-registry-coverage.test.ts cites as its reason for parsing
   surfaceViews.ts rather than importing it. */
(window as any).PDEV_nextMajor = pdevNextMajor;
(window as any).ProtocolWorkspace = ProtocolWorkspace;
(window as any).SURFACE_VIEWS = (window as any).SURFACE_VIEWS || {};
