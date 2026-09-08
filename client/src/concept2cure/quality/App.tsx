/**
 * QualityApp — Quality & Assurance domain shell.
 *
 * A tabbed shell (topbar + tab bar + scrollable page) over the quality
 * surfaces: the SOP register (controlled documents, periodic review, training)
 * and Change control (the change-control log, lifecycle flowchart, and the
 * links to deviations, CAPAs and validation records). Mirrors the host-
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
import { I } from './icons';
import { SopRegister, STATUS_FILTERS, type StatusFilter } from './SopRegister';
import { ChangeControl } from './ChangeControl';
import { useChangeRegister } from './changeHooks';
import {
  FIXTURE_CHANGES,
  STATE_LABEL,
  type ChangeState,
  /* The row type shares the pane component's name; the alias keeps both usable. */
  type ChangeControl as ChangeControlRow,
} from './changeData';
/* The canonical sample-mode guard, shared with the MDX lane — one definition
   of "may a fixture reach the screen", applied here because the register read
   is lifted (its marker still renders in the ChangeControl pane). */
import { useSampleRows, useShowingSample } from '../mdx/lib/useSampleRows';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../v2/surfaceActions';
import { usePublishSurfaceContext } from '../v2/surfaceContext';

export interface QualityAppProps {
  /** Forward an AnA prompt to the host conversation surface. */
  onAskAna?: (text: string) => void;
  /** Host navigation for rail cross-links (reserved; accepted for parity). */
  onNavigate?: (target: string) => void;
  /** Which surface to open first ('sop' | 'change'). */
  initialTab?: QualityTab;
}

type QualityTab = 'sop' | 'change';

const TABS: { id: QualityTab; label: string; icon: React.ReactNode }[] = [
  { id: 'sop', label: 'SOP register', icon: I.template },
  { id: 'change', label: 'Change control', icon: I.gitBranch },
];

const HERE: Record<QualityTab, string> = {
  sop: 'SOP register',
  change: 'Change control',
};

const ASK_STARTER: Record<QualityTab, string> = {
  sop:
    'Give me a read-out on the quality system — what is overdue for review, what is awaiting approval, ' +
    'and where read-and-understood training is short.',
  change:
    'Give me a read-out on change control — what is awaiting approval, what is overdue for implementation, ' +
    'and which linked deviations or CAPAs are still open.',
};

export function QualityApp({ onAskAna, initialTab = 'sop' }: QualityAppProps) {
  const [tab, setTab] = React.useState<QualityTab>(initialTab);
  /* Pane view state, lifted here so the panes' controls and AnA's surface
     actions drive one state — never a second path. */
  const [sopFilter, setSopFilter] = React.useState<StatusFilter>('all');
  const [stage, setStage] = React.useState<ChangeState | 'all'>('all');
  const [openId, setOpenId] = React.useState<number | null>(null);

  /* The change-control read, lifted out of the ChangeControl pane: the
     open-change handler resolves free-text names against the register, and a
     handler can only read state its own component holds. Same sample-mode
     boundary as before the lift — the fixture substitutes only under explicit
     sample mode (impossible in a production build), and the pane still
     renders the standing marker from the flag threaded down. */
  const changeReg = useChangeRegister();
  const changes: ChangeControlRow[] = useSampleRows(changeReg.changes, FIXTURE_CHANGES);
  const showingSampleChanges = useShowingSample(changeReg.changes);

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
     Approving, revising or retiring a document, raising or advancing a
     change, and recording training are governed acts with no handlers here —
     structurally excluded; they stay in conversation, where AnA proposes and
     the Part 11 ceremony runs. */
  useSurfaceActionHandlers('quality', {
    'quality.open-tab': (params) => {
      const target: QualityTab = params.tab === 'change' ? 'change' : 'sop';
      if (tab === target) return { ok: true, detail: `Already on ${HERE[target]}` };
      setTab(target);
      return { ok: true, detail: `Opened ${HERE[target]}` };
    },
    'quality.filter-register': (params) => {
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
    const openRow = openId !== null ? (changes.find((c) => c.id === openId) ?? null) : null;
    const state: string[] = [];
    if (sopFilter !== 'all') {
      const chip = STATUS_FILTERS.find((f) => f.id === sopFilter);
      state.push(`the SOP register is filtered to ${(chip?.label ?? sopFilter).toLowerCase()}`);
    }
    if (stage !== 'all') state.push(`the change log is filtered to ${STATE_LABEL[stage]}`);
    if (openRow) state.push(`change ${openRow.changeNumber} is expanded`);
    const base =
      `The user is on the ${HERE[tab]} tab of Quality & Assurance` +
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
        `${base} The change log holds ${changes.length} change record${changes.length === 1 ? '' : 's'}` +
        (showingSampleChanges ? ' (sample data mode — not tenant records)' : '') +
        '.',
      facts: {
        tab,
        sopFilter,
        changeStage: stage,
        openChange: openRow?.changeNumber ?? null,
        changeCount: changes.length,
        sampleChangeData: showingSampleChanges,
      },
      availableActions: [
        'Switch between the SOP register and change control tabs',
        'Filter the controlled-document register by status',
        'Filter the change log by lifecycle stage',
        'Expand a change to its linked deviations, CAPAs and validation records',
        'Approving, revising or retiring documents, raising or advancing changes, and recording training are governed — AnA proposes them in conversation, never through screen controls',
      ],
    };
  }, [tab, sopFilter, stage, openId, changes, changeReg.loading, changeReg.error, showingSampleChanges]);
  usePublishSurfaceContext('quality', anaContext);

  /* The bus's ready signal: a not-ready open-change (retry: true) held across
     the navigate→act gap gets its re-attempt the moment the register read
     settles. Safe to fire on every settle; a no-op when nothing is pending. */
  React.useEffect(() => {
    if (!changeReg.loading) notifySurfaceActionReady('quality');
  }, [changeReg.loading]);

  return (
    <div className="qms-shell" data-screen-label="Quality & Assurance">
      <div className="qms-topbar">
        <div className="qms-crumbs">
          <span>Quality &amp; Assurance</span>
          <span className="sep" aria-hidden="true">/</span>
          <span className="here">{HERE[tab]}</span>
        </div>
        <div className="qms-spacer" />
        <button className="qms-tb-btn" onClick={() => onAsk(ASK_STARTER[tab])}>
          {I.sparkle} Ask AnA
        </button>
      </div>

      <div className="qms-tabbar" role="tablist" aria-label="Quality surfaces">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className="qms-tab"
            data-on={tab === t.id || undefined}
            onClick={() => setTab(t.id)}
          >
            <span className="qms-tab-ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="qms-page">
        <div className="qms-page-inner">
          {tab === 'sop' ? (
            <SopRegister onAsk={onAsk} filter={sopFilter} onFilterChange={setSopFilter} />
          ) : (
            <ChangeControl
              onAsk={onAsk}
              stage={stage}
              onStageChange={setStage}
              openId={openId}
              onOpenIdChange={setOpenId}
              changes={changes}
              loading={changeReg.loading}
              showingSample={showingSampleChanges}
            />
          )}
        </div>
      </div>
    </div>
  );
}
