/**
 * EmptyState — faithful port of the bundle's EmptyState.
 *
 * Centered serif greeting + composer + suggestion pill row + agency strip.
 * Matches docs/design/concept2cure-design-system/project/ui_kits/ana_ri/
 * App.jsx (lines 94–122).
 *
 * Host integration: `greeting` and `suggestions` props let the host override
 * the default greeting line and the default pill list (the bundle hardcodes
 * both; production passes context-specific text from ZenApp).
 */
import { useRef, useState } from 'react';

import { I } from './icons';
import { Composer, type ComposerReadyAttachment } from './Composer';
import type { EffortLevel } from './ModelEffortPicker';
import type { SafetyNarrativeSubmit } from './SafetyNarrativeAffordance';
import type { MessageAttachment } from './useAnaChat';
import styles from './styles.module.css';

const AGENCIES = ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'ICH'] as const;

const DEFAULT_SUGGESTIONS: ReadonlyArray<{ Ico: typeof I.file; label: string }> = [
  { Ico: I.sparkles, label: 'Build a clinical protocol' },
  { Ico: I.file, label: 'Draft CTD Section 2.5' },
  { Ico: I.search, label: 'Find 510(k) predicates' },
  { Ico: I.flask, label: 'Start IND submission' },
  { Ico: I.clip, label: 'Submission readiness' },
  { Ico: I.globe, label: 'Create an SOP' },
  { Ico: I.sparkles, label: 'Run FDA War Game' },
];

export interface EmptySuggestion {
  label: string;
  /** Optional icon — falls back to the default file icon. */
  iconKey?: 'file' | 'search' | 'flask' | 'clip' | 'globe' | 'book' | 'chat' | 'folder' | 'sparkles';
}

/**
 * Project health snapshot surfaced above the composer on the empty state.
 * Structurally matches the `projectIntelligence` prop assembled by ZenApp.
 */
export interface AnaProjectIntelligence {
  documentCount: number;
  signalCount: number;
  readinessScore: number | null;
  memoryAtomCount: number;
  recommendations?: Array<{ id: string; title: string; severity: string; category: string }>;
  nextActions?: Array<{ id: string; title: string; priority: string; reason: string }>;
  riskFactors?: Array<{ description: string; likelihood: string; impact: string }>;
  openQuestions?: Array<{ question: string; priority: string; context: string }>;
}

export interface EmptyStateProps {
  greetingName: string;
  onSend: (text: string, attachments?: MessageAttachment[]) => void;
  isStreaming?: boolean;
  onStop?: () => void;
  /** Override the default "Good morning, {name}" line. Bundle shows the default. */
  greeting?: string;
  /** Override the default suggestion pill list. */
  suggestions?: ReadonlyArray<EmptySuggestion>;
  /** Scopes composer uploads to a project so extracted text lands in its memory. */
  projectId?: string;
  /** Tools pinned for the next turn, forwarded to the composer's tool picker. */
  selectedTools?: string[];
  onSelectedToolsChange?: (tools: string[]) => void;
  /** Response effort + advanced model override, forwarded to the composer's picker. */
  effort?: EffortLevel;
  onEffortChange?: (effort: EffortLevel) => void;
  modelOverride?: string | null;
  onModelOverrideChange?: (modelId: string | null) => void;
  /** Project health snapshot, rendered as a compact card above the composer. */
  projectIntelligence?: AnaProjectIntelligence;
  /** Guided Safety Narrative submit (E5). Forwarded to the composer's affordance. */
  onSafetyNarrative?: (payload: SafetyNarrativeSubmit) => void;
}

function resolveIcon(key?: EmptySuggestion['iconKey']): typeof I.file {
  switch (key) {
    case 'search': return I.search;
    case 'flask': return I.flask;
    case 'clip': return I.clip;
    case 'globe': return I.globe;
    case 'book': return I.book;
    case 'chat': return I.chat;
    case 'folder': return I.folder;
    case 'sparkles': return I.sparkles;
    case 'file':
    default: return I.file;
  }
}

export function EmptyState({
  greetingName,
  onSend,
  isStreaming,
  onStop,
  greeting,
  suggestions,
  projectId,
  selectedTools,
  onSelectedToolsChange,
  effort,
  onEffortChange,
  modelOverride,
  onModelOverrideChange,
  projectIntelligence,
  onSafetyNarrative,
}: EmptyStateProps) {
  const [draft, setDraft] = useState('');
  // Attachments the composer hands up at send time, consumed by `send`.
  const pendingAttachmentsRef = useRef<MessageAttachment[]>([]);

  const send = (text?: string) => {
    const out = text || draft;
    if (!out.trim()) {
      pendingAttachmentsRef.current = [];
      return;
    }
    // A suggestion-pill click (text passed) carries no attachments; a composer
    // send consumes whatever the composer handed up.
    const attachments = text ? [] : pendingAttachmentsRef.current;
    pendingAttachmentsRef.current = [];
    onSend(out, attachments.length > 0 ? attachments : undefined);
    if (!text) setDraft('');
  };

  const hour = new Date().getHours();
  const part = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const defaultGreeting = `Good ${part}, ${greetingName}`;

  const pills = suggestions && suggestions.length > 0
    ? suggestions.map(s => ({ Ico: resolveIcon(s.iconKey), label: s.label }))
    : DEFAULT_SUGGESTIONS;

  // Show the health card only when there's real signal to report.
  const pi = projectIntelligence;
  const hasIntel =
    !!pi &&
    ((pi.readinessScore !== null && pi.readinessScore !== undefined) ||
      pi.documentCount > 0 ||
      pi.signalCount > 0 ||
      pi.memoryAtomCount > 0);
  const topAction = pi?.nextActions?.[0];
  const intelStats = pi
    ? ([
        pi.readinessScore !== null && pi.readinessScore !== undefined
          ? { label: 'Readiness', value: `${Math.round(pi.readinessScore)}%`, accent: true }
          : null,
        pi.signalCount > 0 ? { label: 'Signals', value: String(pi.signalCount) } : null,
        pi.documentCount > 0 ? { label: 'Documents', value: String(pi.documentCount) } : null,
        pi.memoryAtomCount > 0 ? { label: 'Memory atoms', value: String(pi.memoryAtomCount) } : null,
      ].filter(Boolean) as Array<{ label: string; value: string; accent?: boolean }>)
    : [];

  return (
    <div className={styles.empty}>
      <div className={styles.emptyInner}>
        <div className={styles.greet}>
          <span className={styles.star}>✻</span> {greeting || defaultGreeting}
        </div>
        {hasIntel && (
          <div className={styles.intelCard}>
            <div className={styles.intelStats}>
              {intelStats.map(s => (
                <div key={s.label} className={styles.intelStat}>
                  <span
                    className={s.accent ? styles.intelValueAccent : styles.intelValue}
                  >
                    {s.value}
                  </span>
                  <span className={styles.intelLabel}>{s.label}</span>
                </div>
              ))}
            </div>
            {topAction && (
              <div className={styles.intelNext} title={topAction.reason}>
                <I.sparkles size={13} />
                <span className={styles.intelNextText}>
                  Next: {topAction.title}
                </span>
              </div>
            )}
          </div>
        )}
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => send()}
          onAttachmentsSend={(atts: ComposerReadyAttachment[]) => {
            pendingAttachmentsRef.current = atts;
          }}
          onStop={onStop}
          isStreaming={isStreaming}
          projectId={projectId}
          selectedTools={selectedTools}
          onSelectedToolsChange={onSelectedToolsChange}
          effort={effort}
          onEffortChange={onEffortChange}
          modelOverride={modelOverride}
          onModelOverrideChange={onModelOverrideChange}
          onSafetyNarrative={onSafetyNarrative}
        />
        <div className={styles.suggest}>
          {pills.map(({ Ico, label }) => (
            <button
              key={label}
              className={styles.suggestPill}
              onClick={() => send(label)}
              type="button"
            >
              <span className={styles.ico}>
                <Ico size={14} />
              </span>
              {label}
            </button>
          ))}
        </div>
        <div className={styles.agencyStrip}>
          {AGENCIES.map(a => (
            <div key={a} className={styles.al}>
              {a}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
