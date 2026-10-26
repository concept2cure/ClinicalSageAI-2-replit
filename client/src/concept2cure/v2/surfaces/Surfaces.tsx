/**
 * Core surface family — kit app/Surfaces.jsx ported:
 *   Home            — where a client starts: projects, tasks, AnA, conversations
 *   (GlobalRiBrowser moved to ./GlobalRiBrowser.tsx on 2026-09-29, so the
 *    shell no longer imports a hidden app's API calls.)
 *   KitSurfaceScaffold — the kit's honest "ready to install" state for
 *                     surfaces whose components haven't ported yet
 * Styles: styles/surfaces-v2.css (+ shell classes from app-v2.css).
 */
import { EngineChoices } from '../EngineChoices';
import { fixedMenuPlacement } from '../menuPlacement';
import { LiveDriveSwitch } from '../LiveDriveSwitch';
import { RunPolicySwitch } from '../RunPolicySwitch';
import React from 'react';
import { useAuth } from '@/services/portal/authService';

import type { UiSurface } from '@shared/constants/ui-surface-registry';
import { I } from '../icons';
import {
  ANA_MODES,
  NAV_TIERS_V2,
  NAV_GROUP_OF,
  READINESS_META,
  getSegmentContext,
} from '../registryModel';
import '../styles/surfaces-v2.css';
import { useChatUpload, composeTurn, CHAT_UPLOAD_ACCEPT } from '../../hooks/useChatUpload';
import { AppMentionMenu, useAppMentions } from '../appMentions';
import type { OnboardingWelcome } from '../onboardingWelcome';
import { HomeConversations, HomeProjects, HomeTasks, type HomeProgram } from './HomeSections';
import { HomeSetup } from './HomeSetup';
import { useLiveRows } from '../dataConnect';
import { openNewProject } from '../surfaceActions';

/* ════════════ Home — where a client starts ════════════
   docs/design/CLIENT_JOURNEY_2026-10-25.md. Its sections, in the order a
   client reads them, are in ./HomeSections.tsx; Home adds the composer. */

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
  welcome,
  onDismissWelcome,
}: {
  onNav: (id: string) => void;
  onAsk: (text: string) => void;
  segment: string;
  /** First-run AnA welcome. It lived in the right rail, which is gone
   *  (docs/design/ONE_ANA_ONE_CANVAS.md, slices 6 and 9). Home offers it while
   *  the organization has no project (HomeProjects). Null once dismissed or
   *  once a conversation exists. */
  welcome?: OnboardingWelcome | null;
  onDismissWelcome?: () => void;
} & HomeModeBinding) {
  const { user } = useAuth();
  /* One read of the person's projects: "Your projects" lists them and the setup checklist's "first project" step
     reads the same rows (CLIENT_JOURNEY pass 5). */
  const [projectsEpoch, setProjectsEpoch] = React.useState(0);
  const projects = useLiveRows<HomeProgram>('/api/c2c/projects', [projectsEpoch]);
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
  /* AnA's run controls — "AnA drives", "Between steps" and what Auto does —
     sat open in the composer's foot, with a paragraph of ceilings, as the first
     thing a new client read. They are settings, not the next step: one button
     shows them, and they work as before. */
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsId = React.useId();

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
  const [enginePlace, setEnginePlace] = React.useState<React.CSSProperties>({});

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
  // The existing action bus carries the wizard opener across navigation/mount.
  const newProject = () => { openNewProject(onNav); };

  return (
    <div className="landing home-start">
      <div className="landing-center">
        <div className="landing-greet">
          <span className="landing-mark">✻</span>
          <h1>
            {greeting}, {userName}
          </h1>
          {ctx && <span className="landing-segctx-cat">{ctx.label}</span>}
        </div>
        <HomeSetup onNav={onNav} onNewProject={newProject} projects={projects} />
        <HomeProjects onNav={onNav} onNewProject={newProject} welcome={welcome} onDismissWelcome={onDismissWelcome}
          read={projects} onRetry={() => setProjectsEpoch((n) => n + 1)} />
        <HomeTasks onNav={onNav} />
        <section className="home-sec" aria-labelledby="home-ask-h">
          <h2 id="home-ask-h" className="home-sec-h">Ask AnA</h2>
        <div className="landing-composer">
          <textarea
            ref={draftRef}
            className="landing-input"
            rows={3}
            placeholder="Ask AnA to draft, check or find something. Type @ to name a place."
            value={draft}
            aria-autocomplete="list"
            aria-controls={mentions.open ? 'landing-mentions' : undefined}
            aria-expanded={mentions.open}
            aria-labelledby="home-ask-h"
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
          accept={CHAT_UPLOAD_ACCEPT}
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
              <button
                type="button"
                className="landing-tool"
                title="AnA settings" aria-label="AnA settings"
                aria-expanded={settingsOpen}
                aria-controls={settingsOpen ? settingsId : undefined}
                data-on={settingsOpen || undefined}
                onClick={() => setSettingsOpen((o) => !o)}
              >
                {I.sliders}
              </button>
            </div>
            <div className="landing-crow-r">
              <button type="button" className="landing-engine" aria-haspopup="dialog" aria-expanded={modeOpen}
                aria-controls={modeOpen ? engineMenuId : undefined} ref={engineBtnRef}
                onClick={() => {
                  // Fixed, from the pill: the composer clips anything inside it (F3).
                  if (!modeOpen) setEnginePlace(fixedMenuPlacement(engineBtnRef.current, { roomPx: 200, align: 'right' }));
                  setModeOpen((o) => !o);
                }}>
                <span className="landing-eng-ana">AnA</span>
                <span>{engine.effortLabel}</span>
                <span className="landing-eng-mode">{engine.label}</span>
                <span className="landing-eng-chev">{I.down}</span>
              </button>
              {modeOpen && (
                <div className="landing-mode-menu" role="dialog" aria-label="Engine" id={engineMenuId} style={enginePlace}>
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
          {settingsOpen && (
            <div className="landing-settings" id={settingsId} role="group" aria-label="AnA settings">
              <LiveDriveSwitch />
              <RunPolicySwitch variant="foot" />
            </div>
          )}
        </div>
        </section>
        <HomeConversations onNav={onNav} />
      </div>
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
