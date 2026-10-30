/**
 * Invoices — the organisation's Stripe invoice list, on Licensing under the
 * plan status, for billing administrators (D2, fold billing into Licensing,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/).
 *
 * Moved from UsageBilling.tsx's Billing tab, which showed it to every member,
 * could not tell "billing is not set up" from "no invoices yet", and read one
 * page with no way to the next. GET /api/billing/invoices now takes the billing
 * administrators' guard (BILLING_ADMIN_ROLES) and says which of those it is.
 *
 * Each state is its own branch, and no two share a condition:
 *  - not offered: the session's permissions say this viewer is not a billing
 *    administrator (BILLING_ADMIN_PERMISSION), so the list is not read;
 *  - refused: the route's guard answered 403, a role answer, not a failure;
 *  - failed: any other failed read, or a body that is not an invoice page,
 *    which reads "Couldn't load invoices" with Try again, never an empty list;
 *  - not set up: the organisation has no Stripe customer record;
 *  - a page: which invoices are on screen, and whether older ones are not.
 *    Stripe's list gives no total, so the count is stated once it is known: on
 *    the last page.
 *
 * Read-only: opening an invoice is a link to Stripe's own page.
 */
import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState, ErrorState, type DataState, type ShapeGuard } from '../dataConnect';
import '../styles/licensing-history.css';

/* Stripe invoice projection (billing-dashboard.ts GET /invoices). date, status,
   number, and the PDF/hosted URLs come straight from Stripe and are null on
   the wire when absent, so they are nullable and rendered null-safe — never
   fabricated. amount/currency are always present on the projection. */
export interface LiveInvoice {
  id: string;
  date: string | null;
  amount: number;
  status: string | null;
  number: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
  currency: string | null;
}

export interface InvoicePage {
  billingSetUp: boolean;
  invoices: LiveInvoice[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** `{ billingSetUp, invoices: [...], hasMore, nextCursor }`. Presence is not
    enough: the table maps over `invoices` at once, and `billingSetUp` is the
    verdict that separates "not set up" from "none yet". A body without either
    is a shape failure, and saying the organisation has no billing history when
    the payload was malformed is the same lie in a quieter voice. */
export const isInvoicePage: ShapeGuard<InvoicePage> = (value: unknown): value is InvoicePage => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.billingSetUp === 'boolean' &&
    typeof v.hasMore === 'boolean' &&
    (v.nextCursor === null || typeof v.nextCursor === 'string') &&
    Array.isArray(v.invoices) &&
    v.invoices.every((r) => r !== null && typeof r === 'object')
  );
};

export const INVOICE_PAGE_SIZE = 10;

export type InvoiceView =
  | { kind: 'not-offered' }
  | { kind: 'loading' }
  | { kind: 'refused' }
  | { kind: 'failed' }
  | { kind: 'not-set-up' }
  | { kind: 'page'; page: InvoicePage; pageIndex: number; first: number; last: number };

export interface Invoices {
  view: InvoiceView;
  canNewer: boolean;
  canOlder: boolean;
  newer: () => void;
  older: () => void;
  retry: () => void;
}

function viewOf(offered: boolean, state: DataState<InvoicePage>, pageIndex: number): InvoiceView {
  if (!offered) return { kind: 'not-offered' };
  if (state.loading) return { kind: 'loading' };
  if (state.error) return state.status === 403 ? { kind: 'refused' } : { kind: 'failed' };
  // A 200 with no body is not a page.
  if (!state.data) return { kind: 'failed' };
  if (!state.data.billingSetUp) return { kind: 'not-set-up' };
  const first = pageIndex * INVOICE_PAGE_SIZE + 1;
  return { kind: 'page', page: state.data, pageIndex, first, last: first + state.data.invoices.length - 1 };
}

/**
 * The invoice read, paged by Stripe's cursor. `cursors` holds the
 * `startingAfter` of each page past the first, so Newer is a pop and needs no
 * second cursor from the server. Not read at all unless `offered`.
 */
export function useInvoices(offered: boolean): Invoices {
  const [cursors, setCursors] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const cursor = cursors[cursors.length - 1];
  const path = offered
    ? `/api/billing/invoices?limit=${INVOICE_PAGE_SIZE}` + (cursor ? `&startingAfter=${encodeURIComponent(cursor)}` : '')
    : null;
  const state = useLiveData<InvoicePage>(path, [path, attempt], isInvoicePage);
  const view = useMemo(() => viewOf(offered, state, cursors.length), [offered, state, cursors.length]);
  const next = view.kind === 'page' && view.page.hasMore ? view.page.nextCursor : null;
  return {
    view,
    canNewer: cursors.length > 0 && view.kind !== 'loading',
    canOlder: next !== null,
    newer: () => setCursors((c) => c.slice(0, -1)),
    older: () => {
      if (next) setCursors((c) => [...c, next]);
    },
    retry: () => setAttempt((a) => a + 1),
  };
}

/** Which invoices are on screen, and whether older ones are not. */
export function invoicePageNote(view: Extract<InvoiceView, { kind: 'page' }>): string {
  const { first, last, page } = view;
  if (page.invoices.length === 0) return 'There are no older invoices.';
  const span = first === last ? `invoice ${first}` : `invoices ${first} to ${last}`;
  return page.hasMore
    ? `Showing ${span}. Older invoices are on the next page.`
    : `Showing ${span} of ${last}. There are no older invoices.`;
}

/** What AnA reads of the list: the sentence for the summary and the facts, in every state. */
export function invoiceContext(view: InvoiceView): { sentence: string; facts: { invoices: unknown; invoicesUnavailable: string | null } } {
  switch (view.kind) {
    case 'not-offered':
      return {
        sentence: 'Invoices are not shown: they are for billing administrators, and this viewer is not one.',
        facts: { invoices: null, invoicesUnavailable: 'not a billing administrator, so the invoice list is not read' },
      };
    case 'loading':
      return { sentence: 'Invoices are still loading.', facts: { invoices: null, invoicesUnavailable: 'still loading' } };
    case 'refused':
      return {
        sentence: 'The billing service refused the invoice list for this role.',
        facts: { invoices: null, invoicesUnavailable: 'refused for this role (403)' },
      };
    case 'failed':
      return {
        sentence: 'The invoice list could not be read — a failure, not a finding that there are no invoices.',
        facts: { invoices: null, invoicesUnavailable: 'the invoice read failed' },
      };
    case 'not-set-up':
      return {
        sentence: 'Billing is not set up: the organization has no Stripe customer record, so it has no invoices.',
        facts: { invoices: { billingSetUp: false, rows: [] }, invoicesUnavailable: null },
      };
    case 'page': {
      const { page, first, last } = view;
      const sentence =
        page.invoices.length === 0
          ? first === 1
            ? 'Billing is set up and Stripe has issued no invoices.'
            : 'There are no older invoices.'
          : `Invoices ${first} to ${last} are on screen` +
            (page.hasMore ? '; older ones are on the next page.' : ', and there are no older ones.');
      return {
        sentence,
        facts: {
          invoices: {
            billingSetUp: true,
            first,
            last,
            hasMore: page.hasMore,
            rows: page.invoices.map((iv) => ({
              number: iv.number, date: iv.date, amount: iv.amount, currency: iv.currency, status: iv.status,
            })),
          },
          invoicesUnavailable: null,
        },
      };
    }
  }
}

/* ── Display helpers (moved with the list from UsageBilling.tsx) ── */

/** Stripe invoice status → chip tone (paid good, open/past_due attention). */
const INVOICE_TONE: Record<string, string> = { paid: 'ok', open: 'warn', past_due: 'warn' };

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** ISO → "Jul 1, 2026"; "—" when absent. */
function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Live Stripe amounts carry their real currency — format it honestly. */
function fmtMoney(amount: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
    }).format(amount);
  } catch {
    return '$' + amount.toFixed(2);
  }
}

function InvoiceTable({ rows }: { rows: LiveInvoice[] }) {
  return (
    <table className="ub-inv">
      <thead>
        <tr>
          <th>Date</th>
          <th>Total</th>
          <th>Status</th>
          <th style={{ textAlign: 'right' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((v) => {
          const url = v.hostedUrl || v.pdfUrl || null;
          const tone = INVOICE_TONE[(v.status || '').toLowerCase()] || 'idle';
          return (
            <tr key={v.id}>
              <td>{fmtDay(v.date)}</td>
              <td>
                {fmtMoney(v.amount, v.currency)}{' '}
                <span className="ub-i" title={v.number ? 'Invoice ' + v.number : 'Invoice detail'}>
                  {I.info || 'i'}
                </span>
              </td>
              <td>
                <span className={'rd-chip tone-' + tone}>{v.status ? cap(v.status) : '—'}</span>
              </td>
              <td style={{ textAlign: 'right' }}>
                {url ? (
                  <a className="ub-view" href={url} target="_blank" rel="noreferrer">
                    View
                  </a>
                ) : (
                  <span className="ub-row-s">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function InvoiceBody({ invoices }: { invoices: Invoices }) {
  const { view } = invoices;
  switch (view.kind) {
    case 'not-offered':
      return null;
    case 'loading':
      return (
        <div role="status" className="scaf-note" style={{ padding: '18px 16px' }}>
          Loading invoices…
        </div>
      );
    case 'refused':
      return (
        <EmptyState
          icon={I.lock}
          title="Invoices are for billing administrators"
          hint="The billing service did not admit your role to the invoice list. Your organization's admins and owners can read it."
        />
      );
    case 'failed':
      return (
        <ErrorState
          title="Couldn't load invoices"
          message="Stripe didn't return your invoices. Try again, or check the billing service is reachable."
          retry={invoices.retry}
        />
      );
    case 'not-set-up':
      return (
        <EmptyState
          icon={I.creditCard}
          title="Billing is not set up"
          hint="This organization has no Stripe customer record, so it has no invoices. The record is created the first time a subscription is checked out."
        />
      );
    case 'page':
      if (view.first === 1 && view.page.invoices.length === 0) {
        return (
          <EmptyState
            icon={I.fileText}
            title="No invoices yet"
            hint="Billing is set up. Invoices from Stripe appear here once one is issued."
          />
        );
      }
      return (
        <>
          {view.page.invoices.length > 0 && <InvoiceTable rows={view.page.invoices} />}
          <div className="lh-page" style={{ padding: '10px 16px 12px' }}>
            <div className="lh-page-note" role="status">
              {invoicePageNote(view)}
            </div>
            {(invoices.canNewer || invoices.canOlder) && (
              <div className="lh-page-acts">
                <button type="button" className="btn ghost" disabled={!invoices.canNewer} onClick={invoices.newer}>
                  Newer
                </button>
                <button type="button" className="btn ghost" disabled={!invoices.canOlder} onClick={invoices.older}>
                  Older
                </button>
              </div>
            )}
          </div>
        </>
      );
  }
}

/** The invoice card, under the plan status. Not rendered for a member:
    Licensing tells a member once who reads invoices and changes the
    subscription (Part 1b), rather than in two notes. */
export function LicensingInvoices({ invoices }: { invoices: Invoices }) {
  if (invoices.view.kind === 'not-offered') return null;
  return (
    <div className="pj-card" style={{ marginBottom: 16 }}>
      <div className="pj-card-h">
        <span className="t">Invoices</span>
      </div>
      <div className="pj-card-b" style={{ padding: 0 }}>
        <InvoiceBody invoices={invoices} />
      </div>
    </div>
  );
}
