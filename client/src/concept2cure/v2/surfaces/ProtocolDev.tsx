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
import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import * as PG from './ProtocolGov';
import type { PdevDoc } from '../fixtures/protocol-data';
import { useLiveRows, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { shellProgramName } from '../shellProject';
import { ProtocolWorkspaceDoc } from './ProtocolDevWorkspace';
import { ProtocolDevForm } from './ProtocolDevForms';
import '../styles/protocol-dev-editing.css';

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
  facts?: Record<string, unknown>;
  availableActions?: string[];
}

function anaContextFor(
  state: { loading: boolean; error: unknown; empty: boolean }, doc: PdevDoc | undefined,
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
      summary: 'Protocol development: this organisation has no protocol in development yet, so there is nothing to author here.',
      availableActions: ['Start a clinical protocol', 'Draft a protocol synopsis for the open programme'],
    };
  }
  const secs = Array.isArray(doc.sections) ? doc.sections : [];
  const objs = Array.isArray(doc.objectives) ? doc.objectives : [];
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const done = secs.filter((sec) => sec.status === 'complete').length;
  return {
    summary:
      `Protocol development: "${doc.shortTitle}" (${doc.title}) v${doc.version}, status ` +
      `${doc.status}, ${doc.completeness}% complete — ${done} of ${secs.length} ` +
      `section(s) complete. ${len(doc.risks)} risk(s), ${len(doc.amendments)} amendment(s), ` +
      `${len(doc.deviations)} deviation(s), ${len(doc.completenessFindings)} completeness finding(s).`,
    facts: {
      protocolId: doc.id,
      shortTitle: doc.shortTitle,
      title: doc.title,
      kind: doc.kind,
      version: doc.version,
      status: doc.status,
      sponsor: doc.sponsor,
      principalInvestigator: doc.pi,
      completenessPercent: doc.completeness,
      openSection: doc.openSection,
      sections: secs.map((sec) => ({ number: sec.num, title: sec.title, status: sec.status, required: sec.required })),
      objectives: objs.map((o) => ({ type: o.type, text: o.text, endpoint: o.endpoint })),
      completenessFindings: Array.isArray(doc.completenessFindings) ? doc.completenessFindings : [],
      registerCounts: {
        risks: len(doc.risks), milestones: len(doc.milestones), amendments: len(doc.amendments),
        deviations: len(doc.deviations), reviews: len(doc.reviews),
      },
    },
    availableActions: [
      'Open a protocol section to read, draft or edit it',
      'Add a risk, milestone, amendment or deviation to the governed registers (a real persisted write)',
      'Review the protocol for completeness against its recorded findings',
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
function ProtocolEmptyState({ onAsk, onStarted }: { onAsk: (msg: string) => void; onStarted: () => void }) {
  const [starting, setStarting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const program = shellProgramName();
  const draftPrompt = program
    ? `Draft a protocol synopsis for ${program}: the study objectives, design, population and primary endpoint, from the evidence already in this programme.`
    : 'Draft a protocol synopsis: the study objectives, design, population and primary endpoint, from the evidence already in this programme.';
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
          <PG.Btn icon="plus" variant="primary" onClick={() => setStarting(true)}>Start a protocol</PG.Btn>
          <PG.Btn icon="sparkles" variant="outline" onClick={() => onAsk(draftPrompt)}>Ask AnA to draft the synopsis</PG.Btn>
        </div>
        {note && <div className="pde-refusal" role="alert">{note}</div>}
      </div>
      {starting && (
        <ProtocolDevForm
          kind="start-protocol"
          documentId={0}
          /* The drawer names the programme it is being started under; it does
             NOT pre-write a title. A prefilled "C2C-101 — " is a fragment the
             author has to finish, and a protocol title is not a fragment. */
          target={program ? { label: program } : undefined}
          onCancel={() => setStarting(false)}
          onDone={() => { setStarting(false); onStarted(); }}
          onError={(m) => { setStarting(false); setNote(m); }}
        />
      )}
    </div>
  );
}

export function ProtocolWorkspace({ onAsk, onNav }: SurfaceViewProps) {
  // GET /api/protocol-dev → the org's in-development protocol(s), already shaped
  // to the PdevDoc render contract (server/routes/protocol-dev.routes.ts reads
  // the real protocol_documents tree, org-scoped). Real rows, an honest empty
  // state, or an honest failed load — never a fixture. `reloadKey` bumps after a
  // confirmed register write so the read model refetches and the register
  // renders the server's row; nothing on this surface is appended locally.
  const [reloadKey, setReloadKey] = useState(0);
  const { rows, loading, error, empty } = useLiveRows<PdevDoc>('/api/protocol-dev', ['/api/protocol-dev', reloadKey]);
  const doc = rows[0];
  const anaContext = useMemo(() => anaContextFor({ loading, error, empty }, doc), [loading, error, empty, doc]);
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
          hint="The protocol authoring store didn't respond. This is the organization's in-development clinical protocol — sign in and retry, or check that the service is reachable." />
      </div>);
  }
  if (!doc) return <ProtocolEmptyState onAsk={onAsk} onStarted={() => setReloadKey((k) => k + 1)} />;
  return (
    <ProtocolWorkspaceDoc
      doc={doc as never}
      onAsk={onAsk}
      onNav={onNav}
      refreshing={loading}
      reloadError={error}
      onChanged={() => setReloadKey((k) => k + 1)}
    />);
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
