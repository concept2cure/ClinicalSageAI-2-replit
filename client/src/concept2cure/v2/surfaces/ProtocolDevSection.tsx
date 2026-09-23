/**
 * Protocol development — the section body, edited in the ONE editor.
 *
 * ── What this replaces ───────────────────────────────────────────────────────
 * `DocumentTab` in ProtocolDev.tsx rendered the stored section as static prose
 * and offered "Draft with AnA" and nothing else. `PATCH
 * /api/protocol-development/sections/:id` has existed since C2C-17 with no
 * caller on this surface, and the header said so in as many words: "the
 * document body is read-only … there is no editor on this surface to save
 * from."
 *
 * ── Why THIS editor ──────────────────────────────────────────────────────────
 * Five editor generations were built and deleted in this repository between
 * 2026-06 and 2026-08, each rebuilt by the next session. The canonical one is
 * `v2/editor/RichSectionEditor` — the same component `DocumentWorkbench`
 * mounts — and it is imported here exactly as it is: no fork, no wrapper that
 * re-implements a ribbon, nothing under `editor/` touched. It carries its own
 * fail-closed round-trip fidelity gate: if the stored string cannot survive the
 * schema parse unchanged it refuses rich mode for that section and edits the
 * raw source instead, so the governed record is never silently rewritten.
 *
 * `format="text"` because `protocol_sections.content` is a plain-text column
 * (the authoring store's is HTML; the dossier store's is text — the component
 * serializes per store and this is the text one).
 *
 * ── Why there is no timed autosave ───────────────────────────────────────────
 * The same reason DocumentWorkbench gives: the PATCH is a governed transaction
 * that records an attributable act with a stated reason, and a debounce timer
 * is not an act anyone performed. The author states why, then saves.
 *
 * ── Concurrency ──────────────────────────────────────────────────────────────
 * The save carries `expectedUpdatedAt` — the `updated_at` the section was
 * loaded with. A row that moved since is refused with SECTION_CHANGED (409),
 * which is reported here as a refusal with the draft left on screen. It is
 * never reported as a save, and never swallowed.
 */
import React, { useCallback, useRef, useState } from 'react';
import * as PG from './ProtocolGov';
import { RichSectionEditor, type RichSectionEditorHandle } from '../editor/RichSectionEditor';
import { ProtocolSectionConflict, saveProtocolSection } from './ProtocolDevWrites';

type SectionStatus = 'not_started' | 'draft' | 'complete';
const STATUSES: SectionStatus[] = ['not_started', 'draft', 'complete'];
const MIN_REASON = 8;

export interface ProtocolSectionPaneProps {
  doc: { id?: string; shortTitle?: string; content?: Record<string, { p?: string }[]> };
  sec: { id: string; num?: string; title?: string; status?: string; updatedAt?: string };
  /** False when the protocol row carries no governed document id. */
  canWrite?: boolean;
  onAsk: (prompt: string) => void;
  /** Fires only after the server confirms the write — the host re-reads. */
  onSaved: () => void;
}

/** The section's stored body, as the read model carries it. */
function storedBody(doc: ProtocolSectionPaneProps['doc'], sectionId: string): string {
  const blocks = doc.content?.[sectionId];
  return Array.isArray(blocks) && blocks.length ? String(blocks[0]?.p ?? '') : '';
}

/** A refusal, in the server's own words, never as an empty result. */
function refusalText(e: unknown): string {
  if (e instanceof ProtocolSectionConflict) {
    return `${e.message} Your draft is still on screen and was not written.`;
  }
  return e instanceof Error ? e.message : String(e);
}

export function ProtocolSectionPane({ doc, sec, canWrite, onAsk, onSaved }: ProtocolSectionPaneProps) {
  const editorRef = useRef<RichSectionEditorHandle | null>(null);
  const [reason, setReason] = useState('');
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<SectionStatus>(
    (STATUSES as string[]).includes(String(sec.status)) ? (sec.status as SectionStatus) : 'not_started',
  );
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  /* The canvas's `save()` catches the write's rejection itself — it has to, so
     its own footer can report "not persisted" — and resolves false. A boolean
     is not a reason: a 409 SECTION_CHANGED reached the author as "The section
     was not saved", with the one fact they needed (somebody else moved the
     row) dropped. `persist` stashes the refusal on its way past. */
  const lastRefusal = useRef<unknown>(null);

  const sectionId = Number(sec.id);
  const writable = Boolean(canWrite) && Number.isInteger(sectionId) && sectionId > 0;
  const statusChanged = status !== ((STATUSES as string[]).includes(String(sec.status)) ? sec.status : 'not_started');
  const reasonOk = reason.trim().length >= MIN_REASON;
  const hasChange = dirty || statusChanged;
  const canSave = writable && reasonOk && hasChange && !busy;

  /* The editor's write-through. It throws on refusal, which is what
     RichSectionEditor's footer reads to report "not persisted"; the refusal
     text itself is reported here, where the server's own sentence belongs. */
  const persist = useCallback(
    async (serialized: string) => {
      lastRefusal.current = null;
      try {
        await saveProtocolSection({
          sectionId,
          content: serialized,
          status,
          expectedUpdatedAt: sec.updatedAt || undefined,
          reason: reason.trim(),
        });
      } catch (e) {
        lastRefusal.current = e;
        throw e;
      }
    },
    [sectionId, status, sec.updatedAt, reason],
  );

  const runSave = async () => {
    if (!canSave) return;
    setBusy(true);
    setRefusal(null);
    try {
      if (dirty) {
        /* The canvas owns the serialization and the device crash-cache, so the
           content write goes through its handle rather than around it. */
        const saved = await editorRef.current?.save();
        if (!saved) {
          /* With no stashed refusal the canvas declined to serialize and the
             write never left the browser; there is no server sentence to
             quote and none is invented. */
          const msg = lastRefusal.current
            ? refusalText(lastRefusal.current)
            : 'The section was not saved. The text on screen is unchanged on the record.';
          setRefusal(msg);
          return;
        }
      } else {
        /* Status-only. The body the author is looking at is sent with it: a
           status flipped onto text they have not seen is a claim about a
           different draft. */
        await persist(editorRef.current?.getContent() ?? storedBody(doc, sec.id));
      }
      setReason('');
      onSaved();
    } catch (e) {
      setRefusal(refusalText(e));
    } finally {
      setBusy(false);
    }
  };

  const label = `Section ${sec.num ?? ''} — ${sec.title ?? ''}`.trim();
  return (
    <div className="pde-sec">
      <SectionHead sec={sec} shortTitle={doc.shortTitle} onAsk={onAsk} />

      <SectionReason writable={writable} reason={reason} onReason={setReason} />

      {/* The refusal sits ABOVE the canvas, where the author is looking and
          where it stays put — a toast would say the same thing twice and then
          disappear, and a refusal a reviewer has to remember is not a record
          of anything. */}
      {refusal && <div className="pde-refusal" role="alert">{refusal}</div>}

      <div className="pde-sec-canvas">
        <RichSectionEditor
          /* Remount on the section, so one section's draft can never be
             serialized into another section's row. */
          key={sec.id}
          ref={editorRef}
          value={storedBody(doc, sec.id)}
          format="text"
          onSave={persist}
          autosaveMs={null}
          showSaveButton={false}
          onDirtyChange={setDirty}
          readOnly={!writable}
          placeholder="Write this protocol section here. The save records a revision with your stated reason."
          storageKey={writable ? `pdev-section-${sec.id}` : null}
          ariaLabel={label}
          onAsk={onAsk}
        />
      </div>

      <SectionFoot
        sectionId={sec.id}
        status={status}
        onStatus={setStatus}
        writable={writable}
        busy={busy}
        canSave={canSave}
        onSave={runSave}
        state={saveState({ writable, hasChange, reasonOk })}
      />
    </div>
  );
}

/** The governed reason this save will carry, or why there is none to give. */
function SectionReason(
  { writable, reason, onReason }: { writable: boolean; reason: string; onReason: (v: string) => void },
) {
  if (!writable) {
    return (
      <div className="pde-note">
        This protocol has no governed document id, so the section is read-only here.
      </div>
    );
  }
  return (
    <label className="pde-reason">
      <span>Reason for change (governed) — required before the section can be saved</span>
      <textarea
        value={reason}
        onChange={(e) => onReason(e.target.value)}
        placeholder="Why this section is being changed — written to the audit trail with the save."
        aria-label="Reason for change, required before saving the section"
      />
    </label>
  );
}

/** The section's identity and its one AnA affordance. */
function SectionHead(
  { sec, shortTitle, onAsk }:
  { sec: ProtocolSectionPaneProps['sec']; shortTitle?: string; onAsk: (p: string) => void },
) {
  return (
    <div className="pde-sec-head">
      <div>
        <div className="pde-sec-eyebrow">{'Section ' + (sec.num ?? '')}</div>
        <h2 className="pde-sec-title">{sec.title}</h2>
      </div>
      <div className="pde-sec-meta">
        <PG.StatusBadge status={sec.status} />
        <PG.Btn
          icon="sparkles"
          variant="outline"
          onClick={() => onAsk('Draft ' + (sec.title ?? 'this section') + ' for ' + (shortTitle ?? 'this protocol') + ' from the linked evidence.')}
        >
          Draft with AnA
        </PG.Btn>
      </div>
    </div>
  );
}

/** What the save control is waiting for, stated rather than implied by a
 *  disabled button with no explanation. */
function saveState({ writable, hasChange, reasonOk }: { writable: boolean; hasChange: boolean; reasonOk: boolean }): string {
  if (!writable) return 'Read-only';
  if (!hasChange) return 'No unsaved changes';
  if (!reasonOk) return 'State a reason for change to save';
  return 'Ready to save';
}

interface SectionFootProps {
  sectionId: string;
  status: SectionStatus;
  onStatus: (s: SectionStatus) => void;
  writable: boolean;
  busy: boolean;
  canSave: boolean;
  onSave: () => void;
  state: string;
}

function SectionFoot({ sectionId, status, onStatus, writable, busy, canSave, onSave, state }: SectionFootProps) {
  return (
    <div className="pde-sec-foot">
      <label htmlFor={`pdev-status-${sectionId}`}>Section status</label>
      <select
        id={`pdev-status-${sectionId}`}
        value={status}
        disabled={!writable || busy}
        onChange={(e) => onStatus(e.target.value as SectionStatus)}
      >
        {STATUSES.map((s) => <option key={s} value={s}>{PG.labelize(s)}</option>)}
      </select>
      <PG.Btn icon="check" variant="primary" disabled={!canSave} onClick={onSave}>
        {busy ? 'Saving…' : 'Save section'}
      </PG.Btn>
      <span className="pde-sec-state">{state}</span>
    </div>
  );
}
