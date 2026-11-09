/**
 * The project's filings, in the editor's outline pane (FILING_SPINE F22b).
 *
 * A project is one filing in its home market; a market added to it (F22) is
 * its own governed document holding that market's Module 1 and 3.2.R. The
 * outline shows the filing the open document is the editing copy of, so this
 * list names every filing of the project and, for each, what can be done from
 * here:
 *   - the one the outline shows says so;
 *   - one whose editing copy is in the document list opens it;
 *   - a filing with no editing copy yet, the home filing or a market, can have
 *     one created, bound to it by the server (POST /api/authoring/docs with
 *     c2c_document_id), which refuses in its own words when it cannot bind.
 * Nothing is listed while the markets are unread, and a failed read says so.
 *
 * THE HOME FILING (2026-11-02, found walking the device journey in the running
 * app). Since 31a5453861 a document binds to a filing only when its create
 * names it, and the only create that named one was a market's: this list
 * rendered nothing for a project with no added market, and called a home
 * filing with no copy "Shown in the outline". So a new project's home filing
 * could not get its editing copy from any screen, and no section reached it.
 * Its create is now offered here, also while a working document is open
 * (`quiet`), which is where a new project lands.
 */
import React, { useCallback, useRef, useState } from 'react';
import { apiRequest, ApiRequestError, redactInternals } from '@/lib/queryClient';
import type { FilingMarket } from '../useFilingOutline';
import { editingCopyOf } from './editingCopy';
import { filingAuthorityLabel } from './writingAgencyPresentation';

export interface FilingMarketsProps {
  home: FilingMarket | null;
  markets: readonly FilingMarket[];
  marketsError: boolean;
  /** The governed document the outline shows. */
  shownId: string | null;
  docs: readonly { id: string; title: string; c2c_document_id?: string | null }[];
  onOpen: (docId: string) => void;
  /** Create `filing`'s editing copy; `home` when it is the project's home filing. */
  onCreate: (filing: FilingMarket, home: boolean) => void;
  creatingId: string | null;
  /** A working document or a pinned one is open: list only a home filing that has no copy. */
  quiet?: boolean;
}

/* Typed as strings, but a home filing read with no agency or class recorded
   carries neither, and the list now renders for the home filing: name what is
   recorded, else the filing's title, and never throw. */
const upper = (v: unknown) => (typeof v === 'string' ? v.toUpperCase() : '');
const authorityOf = (f: FilingMarket) => typeof f.agency === 'string' && typeof f.doc_type === 'string' ? filingAuthorityLabel(f) : upper(f.agency);
const nameOf = (f: FilingMarket) => [authorityOf(f), upper(f.doc_type)].filter(Boolean).join(' · ') || f.title || 'This filing';
/** The filing a toast names: its agency's, when one is recorded. */
const filingOf = (f: FilingMarket) => (authorityOf(f) ? `${authorityOf(f)} filing` : 'filing');

/* Each action's accessible name is its visible text; the filing it acts on is
   its description (the row's name), so a voice-control user says what they
   see (WCAG 2.5.3; accessibility review, 2026-10-15). */
function FilingAction({ filing, isMarket, nameId, props }: { filing: FilingMarket; isMarket: boolean; nameId: string; props: FilingMarketsProps }) {
  const copy = editingCopyOf(props.docs, filing.id, (d) => d.c2c_document_id);
  if (filing.id === props.shownId && copy.kind !== 'none') return <span className="ed-basis-d">Shown in the outline</span>;
  if (copy.kind === 'one') {
    return (
      <button type="button" className="btn ghost" aria-describedby={nameId} onClick={() => props.onOpen(copy.doc.id)}>
        Open
      </button>
    );
  }
  if (copy.kind === 'several') return <span className="ed-basis-d">{copy.docs.length} documents are bound to this filing</span>;
  const busy = props.creatingId === filing.id;
  const held = props.creatingId != null;
  return (
    <button
      type="button"
      className="btn ghost"
      aria-describedby={nameId}
      aria-disabled={held || undefined}
      onClick={() => { if (!held) props.onCreate(filing, !isMarket); }}
    >
      {busy ? 'Creating editing copy…' : 'Create editing copy'}
    </button>
  );
}

export function FilingMarkets(props: FilingMarketsProps) {
  const { home, markets, marketsError, quiet } = props;
  const homeLacksCopy = home != null && editingCopyOf(props.docs, home.id, (d) => d.c2c_document_id).kind === 'none';
  if (quiet && !homeLacksCopy) return null;
  if (marketsError && !quiet) {
    return (
      <div className="scaf-note" role="status">
        The markets added to this project could not be read, so only the home filing is offered here.
      </div>
    );
  }
  if (markets.length === 0 && !homeLacksCopy) return null;
  const rows: Array<{ filing: FilingMarket; isMarket: boolean; what: string }> = [
    ...(home ? [{ filing: home, isMarket: false, what: 'home filing' }] : []),
    ...(quiet ? [] : markets.map((m) => ({ filing: m, isMarket: true, what: 'Module 1 and 3.2.R' }))),
  ];
  return (
    <div className="ed-basis" data-testid="ed-filings">
      <div className="ed-basis-h">
        <span className="ed-basis-l" id="ed-filings-h">Filings in this project</span>
      </div>
      <ul role="list" aria-labelledby="ed-filings-h" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {/* The row wraps, and the name keeps at least 12ch: in the editor's narrow left column the button
            took the width and "FDA · IND — home filing" stood one word per line (J3 human test R5, 2026-11-06). */}
        {rows.map(({ filing, isMarket, what }) => (
          <li key={filing.id} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '2px 0' }}>
            <span className="ed-basis-d" id={`ed-filing-${filing.id}`} style={{ flex: '1 1 12ch', margin: 0 }}>
              {nameOf(filing)} — {what}
            </span>
            <FilingAction filing={filing} isMarket={isMarket} nameId={`ed-filing-${filing.id}`} props={props} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The market's gaps: required sections the home filing does not hold. Shown, never added. */
export function FilingGaps({ gaps, agency, docType = '' }: { gaps: readonly { key: string; label: string }[]; agency: string; docType?: string }) {
  if (gaps.length === 0) return null;
  return (
    <div className="scaf-note" data-testid="ed-filing-gaps">
      <span id="ed-filing-gaps-h">
        {filingAuthorityLabel({ agency, doc_type: docType })} requires {gaps.length === 1 ? 'a section' : `${gaps.length} sections`} the home filing does not hold.
        They belong to the home filing; nothing was added for them.
      </span>
      <ul role="list" aria-labelledby="ed-filing-gaps-h" style={{ margin: '4px 0 0', paddingLeft: 16 }}>
        {gaps.map((g) => (
          <li key={g.key}><span className="ed-num">{g.key}</span> {g.label}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Create a filing's editing copy, a market's or the home filing's: one
 * authoring document bound to that governed document by the server, then
 * opened. A market's copy holds its Module 1; the home filing's has no single
 * CTD module (it holds the whole filing), so it names none. The server refuses in its own
 * words (a copy already held, a market not of this project); nothing is
 * created unbound. A person's act only: the "Create its document" button.
 */
export function useCreateMarketCopy(deps: {
  programId: string | null;
  fireToast: (msg: string, kind?: 'error') => void;
  openDocument: (docId: string) => Promise<void>;
  /** Move focus to the opened document: the button that was pressed is gone. */
  focusOpened: () => void;
}) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const create = useCallback(async (market: FilingMarket, home = false) => {
    const { programId, fireToast, openDocument, focusOpened } = depsRef.current;
    if (!programId) return;
    setCreatingId(market.id);
    try {
      const res = await apiRequest('POST', '/api/authoring/docs', {
        title: market.title, module: home ? null : 'M1', client_program_id: programId, c2c_document_id: market.id,
      });
      const json = (await res.json().catch(() => null)) as { document?: { id?: unknown } } | null;
      const id = json?.document?.id;
      if (!res.ok || id == null) {
        fireToast(`The document for the ${filingOf(market)} was not created — the server returned no document. Try again.`, 'error');
        return;
      }
      fireToast(`Document created · ${market.title}, bound to the ${filingOf(market)}.`);
      await openDocument(String(id));
      focusOpened();
    } catch (err) {
      const why = err instanceof ApiRequestError ? err.message : redactInternals(err instanceof Error ? err.message : '', 'the server could not be reached');
      fireToast(`The document for the ${filingOf(market)} was not created — ${why}`, 'error');
    } finally {
      setCreatingId(null);
    }
  }, []);
  return { creatingId, create };
}
