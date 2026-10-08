/**
 * DownloadMenu — the one Download control for an authoring document.
 *
 * docs/design/ONE_ANA_ONE_CANVAS.md §4.5, slice 7 (client half). The founder,
 * 2026-10-07: "I want to be able to pull them down and see them and work with
 * them". A document AnA had just built could not be downloaded: Word, PDF and
 * XML were three buttons, all disabled for a draft, because the export is a
 * filing artifact the server refuses (409) unless the document is sealed.
 *
 * One menu, two acts that cannot be mistaken for each other:
 *
 *   (a) Working copy (Word / PDF). Any status. `POST /api/authoring/docs/:id/
 *       working-copy`. The server marks every page "DRAFT — uncontrolled copy",
 *       prints no signature manifest, and records one audit row before the
 *       bytes leave (docs/evidence/D2-ONE-ANA/2026-10-08/ana-7-working-copy/).
 *       A convenience copy, not a record; each item says so.
 *   (b) Controlled export (Word / PDF / XML). The host's governed export,
 *       enabled only for a FROZEN or APPROVED document. Otherwise it is shown,
 *       disabled, with its reason beside it.
 *
 * The working copy is downloaded here, through the same `apiRequest` and
 * `downloadBlob` every export uses. A refusal is said in the server's words,
 * in a toast and beside the control; it is never silent and never a success.
 *
 * Keyboard and screen reader: a menu button (`aria-haspopup="menu"`,
 * `aria-expanded`); the arrow keys, Home and End move through the items;
 * Escape and Tab close it; focus returns to the button.
 *
 * Where it opens: the editor's toolbar (`.ed-doc-actions`) scrolls sideways,
 * which makes it a scroll box on both axes, and a list row sits in a list that
 * scrolls. A menu laid out inside either was cut off at the toolbar's height,
 * so in a browser none of its items could be seen or clicked. The menu
 * therefore opens in the top layer (a manual popover) where the browser has
 * one, and is placed in fixed coordinates from its button either way, by the
 * one placement every clipped menu uses (menuPlacement.ts), and moved with the
 * button when anything scrolls.
 *
 * Its state belongs to one document. A refusal, or a working copy still being
 * prepared, is shown only beside the document it was for: the host may hand
 * the same control another document while a request is out.
 */
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { downloadBlob, safeFileName } from '../download';
import { fixedMenuPlacement } from '../menuPlacement';

export type WorkingCopyFormat = 'docx' | 'pdf';
export type ControlledFormat = 'docx' | 'pdf' | 'xml';

/** Said on every working-copy item, so the copy is never taken for a record. */
export const WORKING_COPY_NOTE = 'Marked DRAFT — uncontrolled copy';
/** Why the controlled export is not offered on a document that is not sealed. */
export const CONTROLLED_EXPORT_REASON = 'Freeze or approve to export a controlled copy';

const FORMAT_LABEL: Record<ControlledFormat, string> = { docx: 'Word', pdf: 'PDF', xml: 'XML' };

/** A controlled export exists only for a sealed document (FROZEN or APPROVED, any case). */
export function isSealedStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toUpperCase();
  return s === 'FROZEN' || s === 'APPROVED';
}

export type WorkingCopyOutcome = { ok: true; message: string } | { ok: false; message: string };

const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
/* Names the document: the toast is read away from the control, and the person
   may have moved to another document by the time the answer comes. */
const notDownloaded = (title: string | null, why: string) =>
  `No working copy of ${title || 'the document'} was downloaded. ${sentence(why)}`;

/** The name the server gave the file (it ends "_working_copy"), when it said one. */
function serverFileName(res: Response): string | null {
  const disposition = typeof res.headers?.get === 'function' ? res.headers.get('Content-Disposition') : null;
  const name = disposition ? /filename="?([^";]+)"?/i.exec(disposition)?.[1] : null;
  return name ? safeFileName(name, '') || null : null;
}

/** Why the request was refused, in the server's words when it sent any. */
async function refusalOf(err: unknown, res?: Response): Promise<string> {
  if (res) {
    if (res.status === 401) return 'Your session isn’t authenticated. Sign in and try again';
    const body = await res.json().catch(() => null);
    return serverMessage(body) ?? `The server refused it (HTTP ${res.status})`;
  }
  /* apiRequest throws on a refusal, carrying the server's sentence (or a
     status-specific one) as the message; anything without a status never
     reached the server. */
  const e = err as { status?: unknown; message?: unknown } | null;
  if (typeof e?.status === 'number') return redactInternals(e.message, `The server refused it (HTTP ${e.status})`);
  return 'The server could not be reached';
}

/**
 * Request a working copy and hand it to the browser. Every outcome is a
 * sentence to show: a refusal, a file that did not arrive after the server
 * recorded it, a download the browser blocked, or the download itself.
 */
export async function downloadWorkingCopy(
  doc: { id: string; title: string | null },
  format: WorkingCopyFormat,
): Promise<WorkingCopyOutcome> {
  let res: Response;
  try {
    res = await apiRequest('POST', `/api/authoring/docs/${encodeURIComponent(doc.id)}/working-copy`, { format });
  } catch (e) {
    return { ok: false, message: notDownloaded(doc.title, await refusalOf(e)) };
  }
  if (!res.ok) return { ok: false, message: notDownloaded(doc.title, await refusalOf(null, res)) };
  const blob = await res.blob().catch(() => null);
  if (!blob || blob.size === 0) {
    return { ok: false, message: 'The working copy was recorded, but the file did not arrive. Check your downloads before trying again.' };
  }
  const file = serverFileName(res) ?? `${safeFileName(doc.title ?? '', 'document')}_working_copy.${format}`;
  if (!downloadBlob(file, blob)) {
    return { ok: false, message: 'The working copy was recorded, but your browser blocked the download. Check your downloads before trying again.' };
  }
  /* `downloadBlob` true means the file was handed to the browser, which may
     still ask where to save it or block it: "requested", as the controlled
     export says, not "downloaded". */
  return {
    ok: true,
    message: `Working copy of ${doc.title || 'the document'} (${FORMAT_LABEL[format]}) requested in your browser. Every page is marked DRAFT — uncontrolled copy.`,
  };
}

export interface DownloadMenuProps {
  docId: string;
  docTitle: string | null;
  fireToast: (m: string, tone?: 'ok' | 'error') => void;
  /**
   * The host's governed export, when it offers one. `blockedReason` is why it
   * cannot run now (null when it can); an unsealed document always carries
   * {@link CONTROLLED_EXPORT_REASON}. Absent: the menu offers working copies only.
   */
  controlled?: { run: (format: ControlledFormat) => void; blockedReason: string | null };
  /** The button's visible words. */
  label?: string;
  /** The button's accessible name when the visible words need context (a list row). */
  ariaLabel?: string;
  testId?: string;
}

/** Focus the menu item `delta` away from the focused one, wrapping (Home/End pass ±Infinity). */
function moveFocus(menu: HTMLElement | null, delta: number, preventScroll = false) {
  const items = Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = delta === Infinity ? items.length - 1 : delta === -Infinity ? 0 : (at + delta + items.length) % items.length;
  items[next]?.focus({ preventScroll });
}

const MENU_KEYS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity };

/**
 * Puts the menu in the top layer, out of every scroll box, where the browser
 * can. The `popover` attribute is set only there: a browser that hides an
 * unopened popover but cannot open one would otherwise hide the menu for good.
 * The menu element is new on every open, so it is shown once.
 */
function showInTopLayer(menu: HTMLElement) {
  const el = menu as HTMLElement & { showPopover?: () => void };
  if (typeof el.showPopover !== 'function' || !el.isConnected) return;
  try {
    el.setAttribute('popover', 'manual');
    el.showPopover();
  } catch {
    /* No top layer: the fixed position still keeps it out of the toolbar's scroll box. */
    el.removeAttribute('popover');
  }
}

/**
 * Places the open menu from its button with the one fixed placement
 * (menuPlacement.ts): above it when the menu fits there, else below. Its right
 * edge meets the button's unless that would run past the screen's left edge;
 * below, it scrolls inside itself when the screen is shorter than it.
 */
export function placeMenu(btn: HTMLElement, menu: HTMLElement) {
  menu.style.maxHeight = '';
  const b = btn.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const align = b.right - m.width >= 8 ? 'right' : 'left';
  const place: Record<string, unknown> = { ...fixedMenuPlacement(btn, { roomPx: m.height + 12, align }) };
  const room = window.innerHeight - b.bottom - 14;
  if (place.top !== 'auto' && m.height > room) place.maxHeight = Math.max(120, room);
  for (const [k, v] of Object.entries(place)) {
    const value = typeof v === 'number' ? `${Math.round(v)}px` : v == null ? '' : String(v);
    menu.style.setProperty(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), value);
  }
}

/** Open/close, outside click, placement, and the menu's keys. Escape returns focus to the button. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);
  /* Before paint, so the menu is never drawn where it does not belong. */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const btn = btnRef.current;
    if (!open || !menu || !btn) return undefined;
    showInTopLayer(menu);
    const place = () => placeMenu(btn, menu);
    place();
    /* Capture: a scroll of any box the button sits in (the toolbar, the
       list, the page) moves the button, so the menu follows it. Not the
       menu's own scroll: re-measuring it would put it back at its top. */
    const onScroll = (e: Event) => {
      if (!menu.contains(e.target as Node)) place();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    /* No scroll: opening the menu must not move the toolbar or the list under it. */
    moveFocus(menuRef.current, -Infinity, true);
    const outside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key in MENU_KEYS) {
      e.preventDefault();
      moveFocus(menuRef.current, MENU_KEYS[e.key]);
    }
  };
  return { open, setOpen, close, wrapRef, btnRef, menuRef, onMenuKey };
}

interface ItemProps {
  label: string;
  /** The item's own line under its label; omitted when the group says it once. */
  note?: string;
  noteId: string;
  /** Shown, not offered: aria-disabled keeps it reachable so its reason is read. */
  disabled?: boolean;
  onChoose: () => void;
  testId?: string;
}

function MenuItem({ label, note, noteId, disabled, onChoose, testId }: ItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className="dlm-item"
      aria-label={label}
      aria-describedby={noteId}
      aria-disabled={disabled || undefined}
      onClick={() => { if (!disabled) onChoose(); }}
      data-testid={testId}
    >
      <span className="dlm-item-t">{label}</span>
      {note && <span className="dlm-item-d" aria-hidden="true">{note}</span>}
    </button>
  );
}

/** The controlled export: offered when sealed, else shown disabled with its reason once. */
function ControlledGroup({ reason, noteId, onChoose }: { reason: string | null; noteId: string; onChoose: (f: ControlledFormat) => void }) {
  return (
    <div role="group" aria-label="Controlled export" className="dlm-group">
      <div className="dlm-sec" aria-hidden="true">Controlled export</div>
      {reason
        ? <span id={noteId} className="dlm-reason" data-testid="dlm-ctl-reason">{reason}</span>
        : <span id={noteId} hidden>A controlled copy, recorded in the export history.</span>}
      {(['docx', 'pdf', 'xml'] as const).map(f => (
        <MenuItem
          key={f}
          label={`Controlled export (${FORMAT_LABEL[f]})`}
          note={reason ? undefined : 'Recorded in the export history'}
          noteId={noteId}
          disabled={!!reason}
          onChoose={() => onChoose(f)}
          testId={`dlm-ctl-${f}`}
        />
      ))}
    </div>
  );
}

/**
 * The working copy of `docId`: the request, and what is shown beside the
 * control. Each request and each refusal names the document it was for and is
 * shown only while that document is this control's: the Authoring surface
 * keeps one control mounted as the person moves through the tree. An answer
 * that arrives after she has moved on is still told, in a toast that names
 * its document, and never holds or marks the other document's control.
 */
function useWorkingCopy(docId: string, docTitle: string | null, fireToast: DownloadMenuProps['fireToast']) {
  const [busy, setBusy] = useState<{ docId: string; format: WorkingCopyFormat; seq: number } | null>(null);
  const [refusal, setRefusal] = useState<{ docId: string; text: string } | null>(null);
  const seq = useRef(0);
  const busyFormat = busy?.docId === docId ? busy.format : null;
  const request = async (format: WorkingCopyFormat) => {
    if (busyFormat) return;
    const forDoc = docId;
    const mine = ++seq.current;
    setBusy({ docId: forDoc, format, seq: mine });
    setRefusal(prev => (prev?.docId === forDoc ? null : prev));
    const out = await downloadWorkingCopy({ id: forDoc, title: docTitle }, format);
    setBusy(prev => (prev?.seq === mine ? null : prev));
    if (!out.ok) setRefusal({ docId: forDoc, text: out.message });
    fireToast(out.message, out.ok ? 'ok' : 'error');
  };
  return { busyFormat, refusal: refusal?.docId === docId ? refusal.text : null, request };
}

export function DownloadMenu({ docId, docTitle, fireToast, controlled, label = 'Download', ariaLabel, testId }: DownloadMenuProps) {
  const menu = useMenu();
  const menuId = useId();
  const wcNoteId = useId();
  const ctlNoteId = useId();
  const { busyFormat, refusal, request } = useWorkingCopy(docId, docTitle, fireToast);

  const workingCopy = (format: WorkingCopyFormat) => {
    menu.close(true);
    void request(format);
  };
  const controlledExport = (format: ControlledFormat) => {
    menu.close(true);
    controlled?.run(format);
  };
  const reason = controlled?.blockedReason ?? null;

  return (
    <span className="dlm" ref={menu.wrapRef} data-testid={testId}>
      <button
        ref={menu.btnRef}
        type="button"
        className="btn ghost"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => menu.setOpen(o => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !menu.open) { e.preventDefault(); menu.setOpen(true); } }}
        aria-busy={busyFormat !== null || undefined}
      >
        {I.download} {busyFormat ? 'Preparing…' : label} {I.chevDown}
      </button>
      {menu.open && (
        <div
          ref={menu.menuRef}
          className="dlm-menu"
          role="menu"
          id={menuId}
          aria-label={`Download ${docTitle || 'this document'}`}
          onKeyDown={menu.onMenuKey}
          data-testid="dlm-menu"
        >
          <div role="group" aria-label="Working copy" className="dlm-group">
            <div className="dlm-sec" aria-hidden="true">Working copy</div>
            <span id={wcNoteId} hidden>{`${WORKING_COPY_NOTE}. Not a controlled record. Any status.`}</span>
            <MenuItem label="Working copy (Word)" note={WORKING_COPY_NOTE} noteId={wcNoteId} disabled={busyFormat !== null} onChoose={() => workingCopy('docx')} testId="dlm-wc-docx" />
            <MenuItem label="Working copy (PDF)" note={WORKING_COPY_NOTE} noteId={wcNoteId} disabled={busyFormat !== null} onChoose={() => workingCopy('pdf')} testId="dlm-wc-pdf" />
          </div>
          {controlled && <ControlledGroup reason={reason} noteId={ctlNoteId} onChoose={controlledExport} />}
        </div>
      )}
      <span className="sr-only" aria-live="polite">{busyFormat ? `Preparing a working copy (${FORMAT_LABEL[busyFormat]})…` : ''}</span>
      {/* Stays beside the control after the toast has gone; the toast is
          what announces it, so this is not a second alert. */}
      {refusal && <span className="dlm-err" data-testid="dlm-refusal">{refusal}</span>}
    </span>
  );
}
