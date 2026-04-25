/**
 * ClaudeEctdCoauthor — Phase 3 eCTD co-authoring workbench shell.
 *
 * Mirror of docs/design/concept2cure-design-system/project/ui_kits/
 * ectd_coauthor/App.jsx (App function + the rewrite engine).
 *
 * Production wiring philosophy:
 *   - Bundle ARTIFACTS / TREE serve as starter fixtures and as the
 *     fallback when host props don't yet carry live data.
 *   - Tree paths drive the Artifact + the Intelligence "Loaded" tool
 *     row; the Artifact reads from the same artifacts library.
 *   - Selection actions (Tighten / Strengthen) run through the same
 *     bundle rewrite engine so the streaming animation is faithful.
 *     A host prop can replace the rewrite source with a real backend.
 *   - Intelligence messages can run on real streaming when the host
 *     supplies a `chat` prop (UseAnaChatReturn-shaped). When omitted,
 *     the bundle's deterministic mock thread is used so the component
 *     still works standalone (canvas preview, storybook, tests).
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { TopBar } from './TopBar';
import { Tree } from './Tree';
import { Intelligence, type IntelligenceBlock, type IntelligenceMessage } from './Intelligence';
import { Artifact } from './Artifact';
import { SelectionToolbar, type SelectionAction } from './SelectionToolbar';
import type { SelectionInfo } from './ArtifactDoc';
import type { AnaChatAction, AnaChatMessage, UseAnaChatReturn } from '../ana/useAnaChat';
import {
  ARTIFACTS as DEFAULT_ARTIFACTS,
  REWRITES as DEFAULT_REWRITES,
  TREE as DEFAULT_TREE,
  type ArtifactSection,
  type EctdTreeModule,
  type ParagraphBlock,
} from './data';
import styles from './styles.module.css';

export interface ClaudeEctdCoauthorProps {
  /** Override the bundle's artifact library with live section content. */
  artifacts?: Record<string, ArtifactSection>;
  /** Override the bundle's M1–M5 tree with a live eCTD structure. */
  tree?: EctdTreeModule[];
  /** Initial active section path (defaults to "2.5"). */
  initialPath?: string;
  /** Override the bundle rewrite map (Tighten / Strengthen text source). */
  rewrites?: Record<string, string>;
  /** Optional initial messages — defaults to the bundle's seed thread. */
  initialMessages?: IntelligenceMessage[];
  /** Application-level breadcrumb (e.g. "NDA 212345"). */
  applicationLabel?: string;
  /** Tree footer stats. */
  readinessPct?: number;
  blockingCount?: number;
  lastRimSync?: string;
  /**
   * Top-bar / artifact-bar action callbacks. Each receives the active
   * section context so the host can route to the right document (`docId`
   * and `sectionId` are undefined when running against bundle fixtures).
   */
  onSubmitForReview?: (ctx: { docId?: string; sectionPath: string }) => void;
  onShare?: (ctx: { docId?: string; sectionPath: string }) => void;
  onExport?: (ctx: { docId?: string; sectionPath: string }) => void;
  onRevert?: (ctx: { docId?: string; sectionId?: string; sectionPath: string }) => void;
  /**
   * Live AnA chat controller (same hook Phase 2 uses). When supplied, the
   * Intelligence pane streams real responses through `/api/ana-ri/stream`
   * and the local mock thread is bypassed. When omitted, the bundle's
   * deterministic mock thread runs so the component still works standalone.
   */
  chat?: UseAnaChatReturn | null;
}

/* ─── AnA → Intelligence adapter ─────────────────────────────────────
 * Convert an AnaChatMessage stream into the structured IntelligenceMessage
 * shape the Phase 3 chat thread renders. Mapping:
 *   user        → { role: 'user', text }
 *   assistant   → { role: 'ai', blocks: [paragraph, ...action tool rows] }
 *
 * Streaming + thinking + warnings are not yet surfaced in the Phase 3
 * intel UI (the bundle didn't include those affordances); they're
 * preserved on the underlying chat object so a future UI update can
 * render them without re-wiring.
 */
function actionsToTools(actions: AnaChatAction[] | undefined): IntelligenceBlock[] {
  if (!actions || actions.length === 0) return [];
  return actions.map(a => ({
    kind: 'tool' as const,
    label: a.executed ? 'Done' : a.error ? 'Failed' : 'Action',
    value: a.label,
  }));
}

function adaptAnaMessages(messages: AnaChatMessage[]): IntelligenceMessage[] {
  const out: IntelligenceMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', text: m.text });
      continue;
    }
    const blocks: IntelligenceBlock[] = [];
    if (m.statusPhase && (!m.text || m.text.length === 0)) {
      blocks.push({ kind: 'p', text: m.statusPhase });
    } else if (m.text) {
      blocks.push({ kind: 'p', text: m.text });
    }
    blocks.push(...actionsToTools(m.executedActions));
    if (blocks.length > 0) {
      out.push({ role: 'ai', blocks });
    }
  }
  return out;
}

const SEED_MESSAGES: IntelligenceMessage[] = [
  {
    role: 'user',
    text: 'Draft Section 2.5 for NDA 212345. Cross-reference the Phase II CSR and anchor the efficacy argument on the FDA 2023 bridging guidance.',
  },
  {
    role: 'ai',
    blocks: [
      { kind: 'p', text: "I'll draft §2.5 against the current corpus. Pulling sources first." },
      { kind: 'tool', label: 'Pulled', value: 'Protocol-001, CSR-099, CSR-201, SAP v3' },
      { kind: 'tool', label: 'Matched', value: 'FDA 2023 bridging guidance · RIM precedent 0.87' },
      { kind: 'tool', label: 'Matched', value: 'EMA precedent EMEA/H/C/005612' },
      {
        kind: 'p',
        text:
          'Drafted §2.5.1, §2.5.4, and the efficacy summary table. The right pane is live — hover any paragraph for provenance, or select text to ask me to strengthen or tighten it.',
      },
      {
        kind: 'chip',
        title: 'Section 2.5 — Clinical overview',
        meta: '4 sections · 11 citations · v0.4 draft',
      },
    ],
  },
];

export function ClaudeEctdCoauthor({
  artifacts,
  tree,
  initialPath = '2.5',
  rewrites,
  initialMessages,
  applicationLabel,
  readinessPct,
  blockingCount,
  lastRimSync,
  onSubmitForReview,
  onShare,
  onExport,
  onRevert,
  chat,
}: ClaudeEctdCoauthorProps) {
  const useLiveChat = !!chat;
  const lib = artifacts ?? DEFAULT_ARTIFACTS;
  const treeData = tree ?? DEFAULT_TREE;
  const rewriteMap = rewrites ?? DEFAULT_REWRITES;

  const [activePath, setActivePath] = useState(initialPath);
  const [focus, setFocus] = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  const [streamTarget, setStreamTarget] = useState<{
    id: string;
    fullText: string;
    onDone?: () => void;
  } | null>(null);

  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<IntelligenceMessage[]>(
    initialMessages ?? SEED_MESSAGES,
  );

  const art = lib[activePath] ?? lib['2.5'];

  // Pick which message stream the Intelligence pane displays. In live mode we
  // adapt the AnA chat into the bundle's structured block shape; in mock mode
  // the local seed thread + onAction/onSend appends are used as-is.
  const liveMessages: IntelligenceMessage[] = useMemo(() => {
    if (useLiveChat && chat) return adaptAnaMessages(chat.messages);
    return messages;
  }, [useLiveChat, chat, messages]);
  const livePending = useLiveChat && chat ? chat.isStreaming : pending;

  // ───── Streaming rewrite engine (typed-out animation) ─────
  useEffect(() => {
    if (!streamTarget) return;
    const { id, fullText, onDone } = streamTarget;
    setStreamingId(id);
    setStreamText('');
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const step = Math.max(1, Math.round(fullText.length / 220));

    const tick = () => {
      i = Math.min(fullText.length, i + step);
      setStreamText(fullText.slice(0, i));
      if (i >= fullText.length) {
        setTimeout(() => {
          // Commit rewrite into the local artifact library mirror.
          Object.values(lib).forEach(a => {
            a.blocks.forEach(b => {
              if (b.kind === 'p' && (b as ParagraphBlock).id === id) {
                const p = b as ParagraphBlock;
                p.spans = [{ t: fullText }];
                p.confidence = Math.min(0.98, (p.confidence || 0.8) + 0.04);
                const stamp = new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                p.prov = {
                  ...p.prov,
                  foot: `Rewritten · strengthened · ${stamp}`,
                };
              }
            });
          });
          setStreamingId(null);
          setStreamText('');
          setStreamTarget(null);
          onDone?.();
        }, 300);
        return;
      }
      timer = setTimeout(tick, 16);
    };
    timer = setTimeout(tick, 16);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [streamTarget, lib]);

  const kickStream = (blockId: string, fullText: string, onDone?: () => void) => {
    setStreamTarget({ id: blockId, fullText, onDone });
  };

  // ───── User sends a free-form chat message ─────
  const onSend = (text: string) => {
    if (useLiveChat && chat) {
      void chat.send(text);
      return;
    }
    setMessages(m => [...m, { role: 'user', text }]);
    setPending(true);
    setTimeout(() => {
      setPending(false);
      setMessages(m => [
        ...m,
        {
          role: 'ai',
          blocks: [
            { kind: 'p', text: "Understood. I'll reflect that in the artifact now." },
            { kind: 'tool', label: 'Updated', value: `${art.path} · ${art.title}` },
          ],
        },
      ]);
    }, 900);
  };

  // ───── Selection toolbar action ─────
  const onAction = (action: SelectionAction) => {
    if (!selection) return;
    const { blockId, text } = selection;
    setSelection(null);
    window.getSelection?.()?.removeAllRanges();

    const snippet = `"${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`;

    if (action === 'tighten' || action === 'ask') {
      const rewrite = rewriteMap[blockId];
      if (!rewrite) return;
      const label = action === 'tighten' ? 'Tighten' : 'Strengthen';

      if (useLiveChat && chat) {
        // Real chat — let AnA respond; still kick the local rewrite animation so
        // the artifact text updates in place, faithful to the bundle's UX.
        void chat.send(
          `Selected · ${snippet}\n\n${label} this paragraph against the strongest regulatory precedent.`,
        );
        kickStream(blockId, rewrite);
        return;
      }

      // Mock path
      setMessages(m => [
        ...m,
        {
          role: 'user',
          pre: `Selected · ${snippet}`,
          text: `${label} this paragraph against the strongest regulatory precedent.`,
        },
      ]);
      setPending(true);

      setTimeout(() => {
        setPending(false);
        setMessages(m => [
          ...m,
          {
            role: 'ai',
            blocks: [
              { kind: 'tool', label: 'Precedent', value: 'FDA 2023 bridging guidance · RIM match 0.91' },
              { kind: 'tool', label: 'Cross-check', value: 'CSR-201 §7.1, SAP §9.4' },
              { kind: 'stream', target: `§${art.path} paragraph`, hint: 'rewriting in-place' },
            ],
          },
        ]);
        setTimeout(() => {
          kickStream(blockId, rewrite, () => {
            const block = lib[activePath]?.blocks.find(
              b => b.kind === 'p' && (b as ParagraphBlock).id === blockId,
            ) as ParagraphBlock | undefined;
            const conf = (block?.confidence ?? 0.9).toFixed(2);
            setMessages(m => [
              ...m,
              {
                role: 'ai',
                blocks: [
                  {
                    kind: 'p',
                    text: `Done. The rewritten paragraph cites the precedent explicitly and firms the quantitative claims. Confidence rose to ${conf}.`,
                  },
                ],
              },
            ]);
          });
        }, 600);
      }, 700);
    }

    if (action === 'precedent') {
      if (useLiveChat && chat) {
        void chat.send(
          `Selected · ${snippet}\n\nFind regulatory precedent for this claim.`,
        );
        return;
      }
      setMessages(m => [
        ...m,
        {
          role: 'user',
          pre: `Selected · ${snippet}`,
          text: 'Find regulatory precedent for this claim.',
        },
      ]);
      setPending(true);
      setTimeout(() => {
        setPending(false);
        setMessages(m => [
          ...m,
          {
            role: 'ai',
            blocks: [
              { kind: 'tool', label: 'RIM search', value: '3 matches across FDA / EMA / PMDA' },
              {
                kind: 'p',
                text:
                  'Top match: FDA 2023 draft guidance on oncology bridging studies (RIM precedent 0.91). Second: EMEA/H/C/005612 Assessment Report §4.3 (0.83). Third: PMDA consultation response Y-203 (0.76).',
              },
            ],
          },
        ]);
      }, 900);
    }

    if (action === 'flag') {
      if (useLiveChat && chat) {
        void chat.send(
          `Selected · ${snippet}\n\nFlag this paragraph for reviewer attention.`,
        );
        return;
      }
      setMessages(m => [
        ...m,
        {
          role: 'ai',
          blocks: [{ kind: 'tool', label: 'Flagged', value: `§${art.path} for reviewer attention` }],
        },
      ]);
    }
  };

  // ───── Tree navigation ─────
  // In live-chat mode, swapping artifacts is silent — the artifact pane swap is
  // its own visual feedback, no need to clutter the chat thread with breadcrumbs.
  const onTreeNav = (path: string) => {
    if (!lib[path]) return;
    setActivePath(path);
    setSelection(null);
    if (!useLiveChat) {
      setMessages(m => [
        ...m,
        {
          role: 'ai',
          blocks: [{ kind: 'tool', label: 'Loaded', value: `${path} · ${lib[path].title}` }],
        },
      ]);
    }
  };

  // Clear selection on outside scroll
  useEffect(() => {
    const clear = () => setSelection(null);
    document.addEventListener('scroll', clear, true);
    return () => document.removeEventListener('scroll', clear, true);
  }, []);

  return (
    <div
      className={styles.shell}
      data-focus={focus || undefined}
      data-tree-collapsed={treeCollapsed || undefined}
    >
      <TopBar
        art={art}
        applicationLabel={applicationLabel}
        focus={focus}
        setFocus={setFocus}
        treeCollapsed={treeCollapsed}
        setTreeCollapsed={setTreeCollapsed}
        onSubmitForReview={
          onSubmitForReview
            ? () => onSubmitForReview({ docId: art.docId, sectionPath: activePath })
            : undefined
        }
        onShare={
          onShare
            ? () => onShare({ docId: art.docId, sectionPath: activePath })
            : undefined
        }
        onExport={
          onExport
            ? () => onExport({ docId: art.docId, sectionPath: activePath })
            : undefined
        }
      />
      <Tree
        activePath={activePath}
        setActivePath={onTreeNav}
        modules={treeData}
        readinessPct={readinessPct}
        blockingCount={blockingCount}
        lastRimSync={lastRimSync}
      />
      <Intelligence
        messages={liveMessages}
        onSend={onSend}
        pending={livePending}
      />
      <Artifact
        art={art}
        path={activePath}
        streaming={streamingId}
        streamText={streamText}
        onSelect={setSelection}
        artifacts={lib}
        onRevert={
          onRevert
            ? () =>
                onRevert({
                  docId: art.docId,
                  sectionId: art.sectionId,
                  sectionPath: activePath,
                })
            : undefined
        }
      />
      <SelectionToolbar selection={selection} onAction={onAction} />
    </div>
  );
}
