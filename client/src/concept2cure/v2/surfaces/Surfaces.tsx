/**
 * Core surface family — kit app/Surfaces.jsx ported:
 *   Home            — AnA-first landing (centered composer, segment context)
 *   (GlobalRiBrowser moved to ./GlobalRiBrowser.tsx on 2026-09-29, so the
 *    shell no longer imports a hidden app's API calls.)
 *   KitSurfaceScaffold — the kit's honest "ready to install" state for
 *                     surfaces whose components haven't ported yet
 * Styles: styles/surfaces-v2.css (+ shell classes from app-v2.css).
 */
import { EngineChoices } from '../EngineChoices';
import { LiveDriveSwitch } from '../LiveDriveSwitch';
import { RunPolicySwitch } from '../RunPolicySwitch';
import React from 'react';
import { useAuth } from '@/services/portal/authService';

import type { UiSurface } from '@shared/constants/ui-surface-registry';
import { I } from '../icons';
import { useLiveRows } from '../dataConnect';
import {
  ANA_MODES,
  NAV_TIERS_V2,
  NAV_GROUP_OF,
  READINESS_META,
  getSegmentContext,
} from '../registryModel';
import '../styles/surfaces-v2.css';
import { useChatUpload, composeTurn } from '../../hooks/useChatUpload';
import { AppMentionMenu, useAppMentions } from '../appMentions';
import { CapabilityBrowser } from './CapabilityBrowser';

/* ════════════ Home — AnA-first landing (centered composer) ════════════ */

/**
 * One row of the real programme portfolio, as GET /api/c2c/projects projects it
 * from `regulatory_programs` (server/routes/c2c/projects.ts). Home only needs
 * the identity fields; the Projects surface reads the same route for the full
 * card. Declared here rather than imported so Home does not pull the whole
 * Projects module (and its New-Project wizard) into the landing chunk.
 */
interface HomeProgram {
  id: string;
  title: string;
  code: string;
  status: string;
  ws: string;
}

/**
 * The lead-programme line under the greeting.
 *
 * This block used to render `SEGMENT_CONTEXT[segment].program` — a constant. For
 * a biotech tenant that constant read 'BX-301 — BLA · 351(a)', so the FIRST
 * authenticated screen named a drug programme the organization had never
 * created, while Projects (one click away, reading the same database) correctly
 * reported none. Fabricated programme identity is a data-integrity defect in a
 * regulated tool, so the constant is gone and this reads the real portfolio.
 *
 * Four honest states, no fixture: loading, the real lead programme, "No programs
 * yet", or a failed read said plainly. An active programme is preferred as the
 * lead (that is what "what am I working on" means); if none is active the first
 * row still beats showing nothing.
 */
function HomeLeadProgram({ onNav }: { onNav: (id: string) => void }) {
  const { rows, loading, error, empty } = useLiveRows<HomeProgram>('/api/c2c/projects');

  if (loading) {
    return <div role="status" className="landing-segctx-prog">Loading your programs…</div>;
  }
  if (error) {
    return (
      <div className="landing-segctx-prog">
        <span className="ico">{I.alertTriangle}</span>
        Couldn&rsquo;t load your programs
      </div>
    );
  }
  if (empty) {
    return (
      <div className="landing-segctx-prog">
        <span className="ico">{I.gitBranch}</span>
        No programs yet
      </div>
    );
  }

  const lead = rows.find((p) => p.status === 'active') ?? rows[0];
  const others = rows.length - 1;
  return (
    <button
      type="button"
      className="landing-segctx-prog"
      onClick={() => onNav('projects')}
      title="Open the project portfolio"
    >
      <span className="ico">{I.gitBranch}</span>
      {lead.code ? `${lead.code} — ${lead.title}` : lead.title}
      {others > 0 && <span className="landing-segctx-tag">+{others} more</span>}
    </button>
  );
}

/**
 * The engine the next turn runs on, as a pair or not at all. V2App passes
 * `prefs.anaMode` — the value the shell chat reads its effort from — and its
 * setter. Half a binding is not one: with a mode and no setter the pill showed
 * the host's mode while a choice wrote state nothing read.
 */
type HomeModeBinding =
  | { mode: string; setMode: (m: string) => void }
  | { mode?: undefined; setMode?: undefined };

export function Home({
  onNav,
  onAsk,
  segment,
  mode: boundMode,
  setMode: setBoundMode,
}: {
  onNav: (id: string) => void;
  onAsk: (text: string) => void;
  segment: string;
} & HomeModeBinding) {
  const { user } = useAuth();
  const [draft, setDraft] = React.useState('');
  const [modeOpen, setModeOpen] = React.useState(false);
  /* The engine pill used to live here alone — `useState('standard')`, never
     sent. Home's question is seeded into ConversationThread on the SHELL chat,
     whose effort is effortForMode(prefs.anaMode), so a person who picked Deep
     research here was answered at whatever that preference said, under a pill
     claiming Deep research. Bound to the preference when the host passes it:
     V2App, the one production host, does, with the same pair it gives the
     rail. Local state remains only so a host that passes neither (the tests)
     still renders a working menu — and so does one that passes half. */
  const [localMode, setLocalMode] = React.useState('standard');
  const bound = boundMode !== undefined && setBoundMode !== undefined;
  const mode = bound ? boundMode : localMode;
  const setMode = bound ? setBoundMode : setLocalMode;
  const [plusOpen, setPlusOpen] = React.useState(false);

  /* Both landing popovers opened on click and closed on nothing but a second
     click on their own trigger: no Escape, no outside dismissal, and the
     trigger never said it was expanded. Escape closes whichever is open. */
  React.useEffect(() => {
    if (!plusOpen && !modeOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPlusOpen(false);
      setModeOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [plusOpen, modeOpen]);
  const [browseOpen, setBrowseOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  /* `@app` on the front door — the same hook the rail and the thread use. */
  const draftRef = React.useRef<HTMLTextAreaElement>(null);
  const mentions = useAppMentions(draft, setDraft, draftRef);
  const ctx = getSegmentContext(segment);

  /* ── "Attach file" opened a picker into nothing ────────────────────────────
     The `<input type="file">` below carried no onChange, so on the product's
     FRONT PAGE a user pressed +, chose "Attach file", picked a document in the
     OS dialog — and nothing was read, uploaded or shown. The picker closing
     was the entire feedback.

     `useChatUpload` → POST /api/chat/upload is the same path the shell
     composer and ConversationThread use; this composer just never called it.
     Attached files ride along to the thread this composer seeds, so the
     document the user attached is the one the conversation opens on. */
  const upload = useChatUpload();

  /* Time-aware greeting — the only warmth in the product, once. */
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const userName = user?.firstName || user?.displayName || 'there';
  const engine = ANA_MODES.find((m) => m.id === mode) ?? ANA_MODES[0];
  const engineMenuId = React.useId();
  const engineBtnRef = React.useRef<HTMLButtonElement>(null);

  const send = () => {
    const t = draft.trim();
    /* Attachments alone are a legitimate turn ("read this"), and a file still
       being read is not ready to be named — the same rule ConversationThread's
       composer applies. Only files the SERVER confirmed it read are mentioned;
       a failed upload keeps its chip and its error and is never described as
       attached. */
    if (upload.uploading) return;
    const { body: seedText, files } = composeTurn(t, upload.attachments);
    if (!seedText) return;
    /*
     * Seed the thread, do not `onAsk`.
     *
     * `onAsk` pushes into the SHELL's conversation and opens the shell's AnA
     * rail — but the destination, `conversation-thread`, is registered
     * `ownsConversation: true`, so the rail this question was sent to is the
     * one surface that never draws it.
     * And `ConversationThread` runs its own `useAnaChat` keyed off
     * `window.C2C_CONVO`, which nothing here was writing. Net effect: you typed
     * a question into the product's front door, landed on an EMPTY
     * conversation screen, and the answer streamed into a hidden rail — to
     * reappear, unbidden, the next time you opened a surface that does draw it.
     *
     * `window.C2C_CONVO = { id: 'new', seed }` is the protocol the thread
     * already implements (ConversationThread.tsx:300) and that ProjectHome
     * already uses (ProjectHome.tsx:570). The seed is sent on mount, into the
     * thread the user is actually looking at.
     */
    (window as any).C2C_CONVO = { id: 'new', seed: seedText, seedFiles: files };
    setDraft('');
    upload.clear();
    onNav('conversation-thread');
  };
  /* Open the wizard, not the (empty) portfolio behind it. Projects.tsx:675
     already reads this flag on mount and opens the wizard; nothing in the repo
     wrote it, so every "Start a new … project" hero CTA landed the user on a
     list with no programs and no obvious next step. */
  const newProject = () => {
    try { (window as any).__C2C_NEW_PROJECT = true; } catch { /* noop */ }
    onNav('projects');
  };


  const quickActions =
    ctx?.actions ??
    ([
      { id: 'author', label: 'Author', icon: 'penLine', surface: 'document-authoring' },
      { id: 'projects', label: 'Projects', icon: 'folder', surface: 'projects' },
      { id: 'evidence', label: 'Search evidence', icon: 'search', surface: 'evidence-search' },
      { id: 'intelligence', label: 'Intelligence', icon: 'globe', surface: 'global-ri' },
      { id: 'vault', label: 'From vault', icon: 'vault', surface: 'vault' },
    ] as { id: string; label: string; icon: string; surface: string }[]);

  return (
    <div className="landing">
      <div className="landing-center">
        <div className="landing-greet">
          <span className="landing-mark">✻</span>
          <h1>
            {greeting}, {userName}
          </h1>
        </div>
        {ctx && (
          <div className="landing-segctx">
            <div className="landing-segctx-top">
              <span className="landing-segctx-cat">{ctx.label}</span>
            </div>
            <HomeLeadProgram onNav={onNav} />
            {/* The tagline and the pathway chip strip (ctx.pathways — "510(k),
                De Novo, PMA, EU MDR") were removed here on 2026-09-07. Both are
                static segment copy, not this tenant's state: they described the
                category the user already picked, above a lead programme that
                reads their real portfolio. `ctx.pathways` is still rendered by
                the segment picker (Shell.tsx:415), where the pathways describe
                the category you are choosing between — which is the one place
                that copy answers a question the user is actually asking. */}
            <button type="button" className="landing-newproj" onClick={newProject}>
              <span className="ico">{I.plus}</span>Start a new {ctx.label} project
            </button>
          </div>
        )}
        <div className="landing-composer">
          <textarea
            ref={draftRef}
            className="landing-input"
            rows={3}
            placeholder="How can I help you today? Type @ to name an app."
            value={draft}
            aria-autocomplete="list"
            aria-controls={mentions.open ? 'landing-mentions' : undefined}
            aria-expanded={mentions.open}
            onChange={(e) => { setDraft(e.target.value); mentions.sync(e.currentTarget); }}
            onSelect={(e) => mentions.sync(e.currentTarget)}
            onBlur={() => mentions.close()}
            onKeyDown={(e) => {
              if (mentions.onKeyDown(e)) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <AppMentionMenu api={mentions} id="landing-mentions" />
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.xml"
            className="ana-hidden-input"
            aria-label="Attach files for AnA to read"
            onChange={(e) => {
              upload.addFiles(e.target.files);
              // Clear the input so re-picking the SAME file fires change again.
              e.target.value = '';
            }}
          />
          {upload.attachments.length > 0 && (
            <div className="landing-atts">
              {upload.attachments.map((a) => (
                <span key={a.id} className="landing-att" data-status={a.status}>
                  {I.paperclip} {a.name}
                  {a.status === 'uploading' && <em> · reading…</em>}
                  {a.status === 'error' && <em> · {a.error ?? 'failed'}</em>}
                  <button
                    type="button"
                    className="landing-att-x"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => upload.removeAttachment(a.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <span className="sr-only" aria-live="polite">{upload.statusMessage}</span>
          <div className="landing-crow">
            <div className="landing-crow-l">
              <LiveDriveSwitch />
              <RunPolicySwitch variant="foot" />
              <button
                type="button"
                className="landing-tool"
                title="Attach files" aria-label="Attach files"
                aria-haspopup="true"
                aria-expanded={plusOpen}
                onClick={() => setPlusOpen((o) => !o)}
              >
                {I.plus}
              </button>
              {plusOpen && (
                <div className="landing-plus-menu">
                  <button
                    type="button"
                    onClick={() => {
                      fileRef.current?.click();
                      setPlusOpen(false);
                    }}
                  >
                    <span className="ico">{I.paperclip}</span>Attach file
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onNav('vault');
                      setPlusOpen(false);
                    }}
                  >
                    <span className="ico">{I.vault}</span>From vault
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onNav('projects');
                      setPlusOpen(false);
                    }}
                  >
                    <span className="ico">{I.folder}</span>Open a project
                  </button>
                </div>
              )}
            </div>
            <div className="landing-crow-r">
              <button type="button" className="landing-engine" aria-haspopup="dialog" aria-expanded={modeOpen}
                aria-controls={modeOpen ? engineMenuId : undefined} ref={engineBtnRef}
                onClick={() => setModeOpen((o) => !o)}>
                <span className="landing-eng-ana">AnA</span>
                <span>{engine.effortLabel}</span>
                <span className="landing-eng-mode">{engine.label}</span>
                <span className="landing-eng-chev">{I.down}</span>
              </button>
              {modeOpen && (
                <div className="landing-mode-menu" role="dialog" aria-label="Engine" id={engineMenuId}>
                  <EngineChoices
                    mode={mode}
                    onChoose={(id) => {
                      setMode(id);
                      setModeOpen(false);
                      // Back to the pill: the choice's own button is gone.
                      engineBtnRef.current?.focus();
                    }}
                  />
                </div>
              )}
              <button
                type="button"
                className="landing-send"
                disabled={upload.uploading || (!draft.trim() && !upload.attachments.some((a) => a.status === 'ready'))}
                onClick={send}
                title="Send" aria-label="Send"
              >
                {I.arrowUp}
              </button>
            </div>
          </div>
        </div>
        <div className="landing-actions">
          {quickActions.map((a) => (
            <button key={a.id} type="button" className="landing-action" onClick={() => onNav(a.surface)}>
              <span className="ico">{I[a.icon] ?? I.grid}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
        {/* ── The module grid moved into CapabilityBrowser (2026-09-07) ──
            This rendered every module in the tenant's segment inline, below the
            composer — the product's whole capability catalogue on the first
            authenticated screen, under a composer whose point is that you can
            just ask. The home is the short head; the catalogue is the long tail
            and now opens on demand.

            Same data, same `onNav(id)`, same cards: nothing became less
            reachable, it went from one click to two and gained a search. */}
        <button type="button" className="landing-browse" onClick={() => setBrowseOpen(true)}>
          Browse all capabilities
        </button>
      </div>
      {browseOpen && (
        <CapabilityBrowser
          segment={segment}
          onNav={onNav}
          onClose={() => setBrowseOpen(false)}
        />
      )}
    </div>
  );
}

/* ════════ Kit surface scaffold — honest "ready to install" state ════════ */
export function KitSurfaceScaffold({
  surface,
  onAsk,
}: {
  surface: UiSurface;
  onAsk: (text: string) => void;
}) {
  const r = READINESS_META[surface.readiness as keyof typeof READINESS_META];
  const hookName = `use${surface.id.replace(/(^|-)(\w)/g, (_m, _s, c: string) => c.toUpperCase())}()`;
  const complianceLabel: Record<string, string> = {
    'accessibility-enforcement': 'accessibility',
    'microcopy-tone': 'microcopy tone',
    'regulatory-compliance-ux': '21 CFR Part 11',
    'motion-discipline': 'motion discipline',
  };
  const steps: React.ReactNode[] = [
    <>
      <b>Kit</b> — design prototype
      {surface.uiKit ? (
        <>
          {' '}
          in <span className="mono">ui_kits/{surface.uiKit}</span>
        </>
      ) : (
        ' (none yet — design owns this)'
      )}
      .
    </>,
    <>
      <b>Shell</b> — renders under layoutMode <span className="mono">{surface.layoutMode}</span> in the
      ui-v2 shell.
    </>,
    <>
      <b>Routes</b> — {surface.apiPrefixes.length} mounted REST prefix
      {surface.apiPrefixes.length > 1 ? 'es' : ''}, auth&#39;d + tested.
    </>,
    <>
      <b>Contract</b> —{' '}
      {surface.sharedContract ? (
        <>
          import <span className="mono">{surface.sharedContract}</span>
        </>
      ) : (
        'add a @shared type as you install (promotes to contract-ready).'
      )}
    </>,
    <>
      <b>Hook</b> — <span className="mono">{hookName}</span> via apiQueryOptions — ~5 lines.
    </>,
  ];
  return (
    <div className="page-inner">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">
            {NAV_TIERS_V2.find((t) => t.id === (NAV_GROUP_OF[surface.id] ?? 'biopharma'))?.label} ·{' '}
            {surface.group}
          </div>
          <h1 className="ph-title">{surface.label}</h1>
          <div className="ph-sub">{surface.notes}</div>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => onAsk(`Help me install the ${surface.label} surface`)}
        >
          {I.sparkles} Ask AnA
        </button>
      </div>

      <div className="scaf">
        <div className="scaf-readiness">
          <span className={`rd-chip tone-${r?.tone ?? 'idle'}`}>{r?.label ?? surface.readiness}</span>
          <span className="scaf-readiness-blurb">{r?.blurb}</span>
        </div>

        <div className="scaf-grid">
          <div className="scaf-card">
            <div className="l">Mounted routes</div>
            {surface.apiPrefixes.map((a) => (
              <div className="scaf-row" key={a}>
                <span className="ico scaf-ok">{I.check}</span>
                <span className="mono">{a}</span>
              </div>
            ))}
          </div>
          <div className="scaf-card">
            <div className="l">Bindings</div>
            <div className="scaf-row">
              <span className="scaf-k">Layout mode</span>
              <span className="mono scaf-v">{surface.layoutMode}</span>
            </div>
            <div className="scaf-row">
              <span className="scaf-k">UI kit</span>
              <span className="mono scaf-v">{surface.uiKit ?? '—'}</span>
            </div>
            <div className="scaf-row">
              <span className="scaf-k">Contract</span>
              <span className="mono scaf-v">
                {surface.sharedContract ? surface.sharedContract.replace('@shared/types/', '') : '—'}
              </span>
            </div>
            <div className="scaf-row">
              <span className="scaf-k">Catalog</span>
              <span className="mono scaf-v">{surface.discoveryCatalog ? 'yes' : '—'}</span>
            </div>
          </div>
        </div>

        {surface.anaToolFamilies.length > 0 && (
          <div className="scaf-ana">
            <div className="scaf-card">
              <div className="l">AnA tool families</div>
              <div>
                {surface.anaToolFamilies.map((a) => (
                  <span key={a} className="scaf-tag">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="scaf-install">
          <div className="scaf-install-hdr">Install path · kit → live (5 layers)</div>
          {steps.map((s, i) => (
            <div className="scaf-step" key={i}>
              <span className="k">{i + 1}</span>
              <span className="t">{s}</span>
            </div>
          ))}
        </div>

        <div className="scaf-note">
          Compliance rails gating this surface:{' '}
          {surface.compliance.map((c) => complianceLabel[c] ?? c).join(' · ')}.
        </div>
      </div>
    </div>
  );
}
