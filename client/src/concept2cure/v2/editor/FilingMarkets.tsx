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
 *   - a market with no editing copy yet can have one created, bound to it by
 *     the server (POST /api/authoring/docs with c2c_document_id), which
 *     refuses in its own words when it cannot bind.
 * Nothing is listed while the markets are unread, and a failed read says so.
 */
import React, { useCallback, useRef, useState } from 'react';
import { apiRequest, ApiRequestError, redactInternals } from '@/lib/queryClient';
import type { FilingMarket } from '../useFilingOutline';

export interface FilingMarketsProps {
  home: FilingMarket | null;
  markets: readonly FilingMarket[];
  marketsError: boolean;
  /** The governed document the outline shows. */
  shownId: string | null;
  docs: readonly { id: string; title: string; c2c_document_id?: string | null }[];
  onOpen: (docId: string) => void;
  onCreate: (market: FilingMarket) => void;
  creatingId: string | null;
}

const nameOf = (f: FilingMarket) => `${f.agency.toUpperCase()} · ${f.doc_type.toUpperCase()}`;

/* Each action's accessible name is its visible text; the filing it acts on is
   its description (the row's name), so a voice-control user says what they
   see (WCAG 2.5.3; accessibility review, 2026-10-15). */
function FilingAction({ filing, isMarket, nameId, props }: { filing: FilingMarket; isMarket: boolean; nameId: string; props: FilingMarketsProps }) {
  if (filing.id === props.shownId) return <span className="ed-basis-d">Shown in the outline</span>;
  const copy = props.docs.find((d) => d.c2c_document_id === filing.id);
  if (copy) {
    return (
      <button type="button" className="btn ghost" aria-describedby={nameId} onClick={() => props.onOpen(copy.id)}>
        Open
      </button>
    );
  }
  if (!isMarket) return <span className="ed-basis-d">No editing copy yet</span>;
  const busy = props.creatingId === filing.id;
  const held = props.creatingId != null;
  return (
    <button
      type="button"
      className="btn ghost"
      aria-describedby={nameId}
      aria-disabled={held || undefined}
      onClick={() => { if (!held) props.onCreate(filing); }}
    >
      {busy ? 'Creating editing copy…' : 'Create editing copy'}
    </button>
  );
}

export function FilingMarkets(props: FilingMarketsProps) {
  const { home, markets, marketsError } = props;
  if (marketsError) {
    return (
      <div className="scaf-note" role="status">
        The markets added to this project could not be read, so only the home filing is offered here.
      </div>
    );
  }
  if (markets.length === 0) return null;
  const rows: Array<{ filing: FilingMarket; isMarket: boolean; what: string }> = [
    ...(home ? [{ filing: home, isMarket: false, what: 'home filing' }] : []),
    ...markets.map((m) => ({ filing: m, isMarket: true, what: 'Module 1 and 3.2.R' })),
  ];
  return (
    <div className="ed-basis" data-testid="ed-filings">
      <div className="ed-basis-h">
        <span className="ed-basis-l" id="ed-filings-h">Filings in this project</span>
      </div>
      <ul role="list" aria-labelledby="ed-filings-h" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map(({ filing, isMarket, what }) => (
          <li key={filing.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
            <span className="ed-basis-d" id={`ed-filing-${filing.id}`} style={{ flex: 1, margin: 0 }}>
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
export function FilingGaps({ gaps, agency }: { gaps: readonly { key: string; label: string }[]; agency: string }) {
  if (gaps.length === 0) return null;
  return (
    <div className="scaf-note" data-testid="ed-filing-gaps">
      <span id="ed-filing-gaps-h">
        {agency.toUpperCase()} requires {gaps.length === 1 ? 'a section' : `${gaps.length} sections`} the home filing does not hold.
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
 * Create a market's editing copy: one authoring document bound to the market's
 * governed document by the server, then opened. The server refuses in its own
 * words (a copy already held, a market not of this project); nothing is
 * created unbound. A person's act only: the "Create its document" button.
 */
export function useCreateMarketCopy(deps: {
  programId: string | null;
  fireToast: (msg: string, kind?: 'error') => void;
  openDocument: (docId: string) => Promise<void>;
}) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const create = useCallback(async (market: FilingMarket) => {
    const { programId, fireToast, openDocument } = depsRef.current;
    if (!programId) return;
    setCreatingId(market.id);
    try {
      const res = await apiRequest('POST', '/api/authoring/docs', {
        title: market.title, module: 'M1', client_program_id: programId, c2c_document_id: market.id,
      });
      const json = (await res.json().catch(() => null)) as { document?: { id?: unknown } } | null;
      const id = json?.document?.id;
      if (!res.ok || id == null) {
        fireToast(`The ${market.agency.toUpperCase()} document was not created — the server returned no document. Try again.`, 'error');
        return;
      }
      fireToast(`Document created · ${market.title}, bound to the ${market.agency.toUpperCase()} filing.`);
      await openDocument(String(id));
    } catch (err) {
      const why = err instanceof ApiRequestError ? err.message : redactInternals(err instanceof Error ? err.message : '', 'the server could not be reached');
      fireToast(`The ${market.agency.toUpperCase()} document was not created — ${why}`, 'error');
    } finally {
      setCreatingId(null);
    }
  }, []);
  return { creatingId, create };
}
