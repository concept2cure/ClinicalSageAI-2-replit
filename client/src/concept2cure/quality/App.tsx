/**
 * QualityApp — Quality domain shell.
 *
 * A tabbed shell (topbar + tab bar + scrollable page) over the quality
 * surfaces: the SOP register (controlled documents, periodic review, training),
 * Change control (the change-control log, lifecycle flowchart, and the links
 * to deviations, CAPAs and validation records), and the quality records
 * (QmsRecords.tsx: CAPA, nonconformances, suppliers, internal audits, management
 * reviews; decision P-48). Mirrors the host-
 * integration contract of the other domain shells: AnA prompts hand off to the
 * host conversation surface via `onAskAna`; rail cross-links route through
 * `onNavigate`.
 *
 * Ungoverned view state (tab, register filter, stage filter, expanded change)
 * and the change-register read live in this shell: the panes' own controls and
 * AnA's `quality.*` surface actions drive the SAME state, and open-change
 * resolves names against the same rows the log renders.
 *
 * @module client/src/concept2cure/quality/App
 */

import * as React from 'react';
import { I } from '../v2/icons';
import { SopRegister, STATUS_FILTERS, type StatusFilter } from './SopRegister';
import { ChangeControl } from './ChangeControl';
import { QmsRecords, QMS_RECORD_ASK, QMS_RECORD_TABS } from './QmsRecords';
import type { QmsRecordTab } from './qmsRecordData';
import type { RecordRegisterContext } from './qmsRegisterKit';
import { useChangeRegister } from './changeHooks';
import {
  STATE_LABEL,
  type ChangeState,
  /* The row type shares the pane component's name; the alias keeps both usable. */
  type ChangeControl as ChangeControlRow,
} from './changeData';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../v2/surfaceActions';
import { usePublishSurfaceContext } from '../v2/surfaceContext';

/** Stable identity for an unread register, so memo deps do not churn. */
const NO_CHANGES: ChangeControlRow[] = [];

export interface QualityAppProps {
  /** Forward an AnA prompt to the host conversation surface. */
  onAskAna?: (text: string) => void;
  /** Host navigation for the canonical workbench and project links. */
  onNavigate?: (target: string) => void;
  /** Which surface to open first. */
  initialTab?: QualityTab;
  qmsDocumentId?: string;
  qmsTargetRequest?: number;
}

type QualityTab = 'sop' | 'change' | QmsRecordTab;

const RECORD_ICON: Record<QmsRecordTab, React.ReactNode> = {
  capa: I.target,
  deviations: I.flag,
  nonconforming: I.alertTriangle,
  suppliers: I.building,
  audits: I.clipboardList,
  reviews: I.users,
};

const TABS: { id: QualityTab; label: string; icon: React.ReactNode }[] = [
  { id: 'sop', label: 'SOP register', icon: I.template },
  { id: 'change', label: 'Change control', icon: I.gitBranch },
  ...QMS_RECORD_TABS.map((t) => ({ ...t, icon: RECORD_ICON[t.id] })),
];

const HERE = Object.fromEntries(TABS.map((t) => [t.id, t.label])) as Record<QualityTab, string>;

const ASK_STARTER: Record<QualityTab, string> = {
  sop:
    'Give me a read-out on the quality system — what is overdue for review, what is awaiting approval, ' +
    'and where current-release personal acknowledgements are missing.',
  change:
    'Give me a read-out on change control — what is awaiting approval, what is overdue for implementation, ' +
    'and which linked deviations or CAPAs are still open.',
  ...QMS_RECORD_ASK,
};

/**
 * What AnA is told on a record tab: the register's rows as read, or that it is
 * still loading, or that its read failed (never an empty register in its place).
 */
export function recordTabContext(tab: QmsRecordTab, ctx: RecordRegisterContext | null) {
  const here = HERE[tab];
  const actions = [
    'Switch between the Quality tabs',
    `Raise or update ${here.toLowerCase()} records through the screen's drawers; each write is the person's own and is audited`,
    'AnA reads the register as shown; it does not record, disposition, approve or close records for the user',
  ];
  if (!ctx || ctx.tab !== tab || ctx.state === 'loading') {
    return { summary: `The user is on the ${here} tab of Quality. The register is still loading — its records are not readable yet.`, facts: { tab }, availableActions: actions };
  }
  if (ctx.state === 'failed') {
    return { summary: `The user is on the ${here} tab of Quality. The register could not be read — a failure, not an empty register.`, facts: { tab, registerRead: 'failed' }, availableActions: actions };
  }
  const n = ctx.count ?? 0;
  const counts = ctx.counts.map((c) => `${c.label}: ${c.val}`).join('; ');
  return {
    summary: `The user is on the ${here} tab of Quality. The register holds ${n} ${n === 1 ? ctx.noun[0] : ctx.noun[1]}` +
      (counts ? ` (${counts})` : '') + '.' + (ctx.truncated ? ` Only the first ${ctx.records.length} are listed in the facts.` : ''),
    facts: { tab, recordCount: n, counts: ctx.counts, records: ctx.records, truncated: ctx.truncated },
    availableActions: actions,
  };
}

export function QualityApp({ onAskAna, onNavigate, initialTab = 'sop',qmsDocumentId,qmsTargetRequest }: QualityAppProps) {
  const [tab, setTab] = React.useState<QualityTab>(initialTab);
  React.useEffect(()=>{if(qmsDocumentId)setTab('sop');},[qmsDocumentId,qmsTargetRequest]);
  const [editingDocument, setEditingDocument] = React.useState(false);
  // ARIA tabs pattern: the tablist is one tab stop; Arrow, Home and End move
  // between tabs and select as they go (APG tablist). Without this a
  // screen-reader user hears "tab" but arrows do nothing.
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const idx = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    const el = e.currentTarget.parentElement?.children[next] as HTMLElement | undefined;
    el?.focus();
  };
  /* Pane view state, lifted here so the panes' controls and AnA's surface
     actions drive one state — never a second path. */
  const [sopFilter, setSopFilter] = React.useState<StatusFilter>('all');
  const [stage, setStage] = React.useState<ChangeState | 'all'>('all');
  const [openId, setOpenId] = React.useState<number | null>(null);

  /* The change-control read, lifted out of the ChangeControl pane: the
     open-change handler resolves free-text names against the register, and a
     handler can only read state its own component holds. The tenant's rows or
     none — the example change log (FIXTURE_CHANGES) and the sample mode that
     could show it were removed on 2026-10-14. */
  const changeReg = useChangeRegister();
  /* The record register on screen reports what it read (QmsRecords.tsx), so
     what AnA is told about a record tab is the register's own rows. */
  const [recordCtx, setRecordCtx] = React.useState<RecordRegisterContext | null>(null);
  const changes: ChangeControlRow[] = changeReg.changes ?? NO_CHANGES;

  const onAsk = React.useCallback(
    (q: string) => {
      if (onAskAna) onAskAna(q);
      else console.info('[AnA · quality]', q);
    },
    [onAskAna],
  );

  /* AnA's hands on this screen — the surface-action bus (shared registry:
     quality.*, identity-resolved). The single registration slot lives HERE,
     not in a pane: the bus holds one registration per surface, and these
     actions span both tabs — a filter directive can arrive while the other
     tab is showing, so the handler switches tab first, the same two clicks a
     person would make, and the detail says so. Every handler drives the SAME
     state the panes' own controls drive (setTab / setSopFilter / setStage /
     setOpenId) — no second path; misses are honest refusals, never guesses.
     Governed writes have no bus handlers. Explicit Quality controls call the
     governed APIs; people read released text and personally acknowledge it in
     the register reader. Approval and retirement use the Part 11 ceremony. */
  useSurfaceActionHandlers('quality', {
    'quality.open-tab': (params) => {
      if (editingDocument) return { ok: false, reason: 'Return to the Quality register before switching tabs.' };
      const target = TABS.find((t) => t.id === params.tab)?.id;
      if (!target) return { ok: false, reason: `No Quality tab named "${params.tab}".` };
      if (tab === target) return { ok: true, detail: `Already on ${HERE[target]}` };
      setTab(target);
      return { ok: true, detail: `Opened ${HERE[target]}` };
    },
    'quality.filter-register': (params) => {
      if (editingDocument) return { ok: false, reason: 'Return to the Quality register before applying its filters.' };
      // Belt behind the registry's enum: the chip must exist on the pane.
      const chip = STATUS_FILTERS.find((f) => f.id === params.status);
      if (!chip) return { ok: false, reason: `No status chip named "${params.status}".` };
      let detail = '';
      if (tab !== 'sop') {
        setTab('sop');
        detail = 'Opened SOP register; ';
      }
      setSopFilter(chip.id);
      detail +=
        chip.id === 'all'
          ? 'showing all controlled documents'
          : `filtered to ${chip.label.toLowerCase()}`;
      return { ok: true, detail };
    },
    'quality.filter-changes': (params) => {
      if (editingDocument) return { ok: false, reason: 'Return to the Quality register before switching tabs.' };
      const raw = params.stage ?? '';
      const next: ChangeState | 'all' | null =
        raw === 'all'
          ? 'all'
          : Object.prototype.hasOwnProperty.call(STATE_LABEL, raw)
            ? (raw as ChangeState)
            : null;
      if (next === null) {
        return { ok: false, reason: `No lifecycle stage named "${params.stage}".` };
      }
      let detail = '';
      if (tab !== 'change') {
        setTab('change');
        detail = 'Opened change control; ';
      }
      setStage(next);
      detail += next === 'all' ? 'showing every change' : `filtered to ${STATE_LABEL[next]}`;
      /* A person's own filter click leaves an expansion alone, so this does
         too — but when the new stage hides the expanded row, the detail says
         so instead of implying it is in view. */
      if (openId !== null && next !== 'all') {
        const openRow = changes.find((c) => c.id === openId);
        if (openRow && openRow.status !== next) {
          detail += '; the expanded change is outside this stage now';
        }
      }
      return { ok: true, detail };
    },
    'quality.open-change': (params) => {
      if (editingDocument) return { ok: false, reason: 'Return to the Quality register before switching tabs.' };
      // Not-ready, not failed: the bus holds the directive and re-attempts on
      // the ready signal below — the navigate→act gap.
      if (changeReg.loading) {
        return { ok: false, reason: 'The change log is still loading.', retry: true };
      }
      // A failed read is not an empty log.
      if (changeReg.error) return { ok: false, reason: 'The change log could not be read.' };
      const wanted = String(params.change ?? '').trim().toLowerCase();
      if (!wanted) return { ok: false, reason: 'No change named.' };
      /* Change numbers are unique; titles are not — so exact matches are
         COLLECTED, and two changes with the same title refuse the same way
         two containment hits do. An AnA-driven open never guesses. */
      const byNumber = changes.filter((c) => c.changeNumber.trim().toLowerCase() === wanted);
      const exact = byNumber.length
        ? byNumber
        : changes.filter((c) => c.title.trim().toLowerCase() === wanted);
      const pool = exact.length
        ? exact
        : changes.filter((c) => `${c.changeNumber} ${c.title}`.toLowerCase().includes(wanted));
      if (pool.length === 0) {
        return { ok: false, reason: `No change matching "${params.change}" in the log.` };
      }
      if (pool.length > 1) {
        return {
          ok: false,
          reason: `"${params.change}" matches ${pool.length} changes — name one exactly.`,
        };
      }
      const hit = pool[0];
      const switched = tab !== 'change';
      if (switched) setTab('change');
      let detail = `Expanded ${hit.changeNumber} — ${hit.title}`;
      if (stage !== 'all' && hit.status !== stage) {
        // An expansion hidden behind the stage filter would be a lie.
        setStage('all');
        detail += '; cleared the stage filter so it shows';
      }
      setOpenId(hit.id);
      if (switched) detail += ' (opened change control)';
      return { ok: true, detail };
    },
  });

  /* What AnA is told about this screen — claims scoped to state THIS shell
     actually holds: the tab, both filters, the expanded change, and the
     change register it reads. SOP counts live in the SopRegister pane's own
     reads and are deliberately absent — a number published here would be a
     guess, and absent beats guessed. A loading or failed change read
     publishes itself as exactly that, never as an empty log. */
  const anaContext = React.useMemo(() => {
    if (editingDocument) return {
      summary: 'The user is in the controlled-document workbench inside Quality. The document workbench owns the open content and edit permissions; Quality tabs and register actions are held until the user returns.',
      facts: { tab, editingDocument: true },
      availableActions: ['Read or edit the open document through its workbench permissions', 'Return to the Quality register using the workbench’s Back control'],
    };
    if (tab !== 'sop' && tab !== 'change') return recordTabContext(tab, recordCtx);
    const openRow = openId !== null ? (changes.find((c) => c.id === openId) ?? null) : null;
    const state: string[] = [];
    if (sopFilter !== 'all') {
      const chip = STATUS_FILTERS.find((f) => f.id === sopFilter);
      state.push(`the SOP register is filtered to ${(chip?.label ?? sopFilter).toLowerCase()}`);
    }
    if (stage !== 'all') state.push(`the change log is filtered to ${STATE_LABEL[stage]}`);
    if (openRow) state.push(`change ${openRow.changeNumber} is expanded`);
    const base =
      `The user is on the ${HERE[tab]} tab of Quality` +
      (state.length ? ` — ${state.join('; ')}` : '') +
      '.';
    if (changeReg.loading) {
      return {
        summary: `${base} The change log is still loading — its records are not readable yet.`,
        facts: { tab, sopFilter, changeStage: stage },
      };
    }
    if (changeReg.error) {
      return {
        summary: `${base} The change log could not be read — a failure, not an empty log.`,
        facts: { tab, sopFilter, changeStage: stage },
      };
    }
    return {
      summary:
        `${base} The change log holds ${changes.length} change record${changes.length === 1 ? '' : 's'}.`,
      facts: {
        tab,
        sopFilter,
        changeStage: stage,
        openChange: openRow?.changeNumber ?? null,
        changeCount: changes.length,
      },
      availableActions: [
        'Switch between the SOP register, change control, CAPA, nonconformances, suppliers, internal audits and management reviews tabs',
        'Filter the controlled-document register by status',
        'Filter the change log by lifecycle stage',
        'Expand a change to its linked deviations, CAPAs and validation records',
        'Create, open and revise controlled documents in the register; edit their sections in the document workbench',
        'Approval and retirement use the register’s electronic-signature ceremony',
        'People read controlled text and record their own personal acknowledgement in the SOP register; AnA cannot acknowledge for them',
      ],
    };
  }, [editingDocument, tab, sopFilter, stage, openId, changes, changeReg.loading, changeReg.error, recordCtx]);
  usePublishSurfaceContext('quality', anaContext);

  /* The bus's ready signal: a not-ready open-change (retry: true) held across
     the navigate→act gap gets its re-attempt the moment the register read
     settles. Safe to fire on every settle; a no-op when nothing is pending. */
  React.useEffect(() => {
    if (!changeReg.loading) notifySurfaceActionReady('quality');
  }, [changeReg.loading]);

  return (
    <div className="qms-shell" data-screen-label="Quality" data-editing={editingDocument || undefined}>
      {!editingDocument && <div className="qms-topbar">
        <div className="qms-crumbs">
          <span>Quality</span>
          <span className="sep" aria-hidden="true">/</span>
          <span className="here">{HERE[tab]}</span>
        </div>
        <div className="qms-spacer" />
        <button className="qms-tb-btn" onClick={() => onAsk(ASK_STARTER[tab])}>
          {I.sparkles} Ask AnA
        </button>
      </div>}

      {!editingDocument && <div className="qms-tabbar" role="tablist" aria-label="Quality surfaces">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className="qms-tab"
            data-on={tab === t.id || undefined}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={onTabKey}
          >
            <span className="qms-tab-ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>}

      <div className="qms-page">
        <div className="qms-page-inner">
          {tab !== 'sop' && tab !== 'change' ? (
            <QmsRecords tab={tab} onAsk={onAsk} onContext={setRecordCtx} />
          ) : tab === 'sop' ? (
            <SopRegister onAsk={onAsk} onNavigate={onNavigate} filter={sopFilter} onFilterChange={setSopFilter}
              onEditorOpenChange={setEditingDocument} qmsDocumentId={qmsDocumentId} qmsTargetRequest={qmsTargetRequest} />
          ) : (
            <ChangeControl
              onAsk={onAsk} onNavigate={onNavigate} onEditorOpenChange={setEditingDocument}
              stage={stage}
              onStageChange={setStage}
              openId={openId}
              onOpenIdChange={setOpenId}
              changes={changes}
              loading={changeReg.loading}
              error={changeReg.error}
              onRetry={changeReg.refresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}
