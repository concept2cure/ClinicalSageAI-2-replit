/**
 * A market's own application number, on its row of the project's markets
 * (decision P-44, docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * The project's number is its home market's. Another market's packages carry
 * the number that market's agency assigned, recorded on its submission, and
 * are refused until one is. The row reads GET
 * /api/submissions/:id/application-number, which answers through the reader
 * every package uses, so it says what the package will carry. It records
 * through POST to the same path: the project's lead or a manager, with a
 * reason, as a chained audit row. Nothing is drawn for the home market, whose
 * number is the project's, or while the read is in flight. A failed read says
 * so.
 */
import React from 'react';
import { apiRequest, ApiRequestError, redactInternals } from '@/lib/queryClient';
import { useLiveData, type ShapeGuard } from '../dataConnect';
import { C2CForm } from '../C2CForm';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';

interface MarketNumberRead {
  submissionId: number;
  home: boolean;
  market: string | null;
  homeAgency: string | null;
  applicationNumber: string | null;
  /** The newest recording: who, when, why. Absent from an older server. */
  lastRecorded?: { by: string | null; at: string; reason: string | null } | null;
}

const isMarketNumberRead: ShapeGuard<MarketNumberRead> = (v): v is MarketNumberRead =>
  !!v && typeof v === 'object' && typeof (v as MarketNumberRead).home === 'boolean' &&
  ((v as MarketNumberRead).applicationNumber === null || typeof (v as MarketNumberRead).applicationNumber === 'string');

/** POST the number with its reason: whether it changed, or the server's words on refusal. Never throws. */
async function postNumber(submissionId: number, applicationNumber: string, reason: string): Promise<{ refused: string } | { changed: boolean }> {
  try {
    const res = await apiRequest('POST', `/api/submissions/${submissionId}/application-number`, { applicationNumber, reason });
    const body = (await res.json().catch(() => null)) as { changed?: unknown } | null;
    // An answer that does not say it changed is not reported as a change.
    return { changed: body?.changed === true };
  } catch (err) {
    if (err instanceof ApiRequestError) return { refused: err.message };
    return { refused: redactInternals(err instanceof Error ? err.message : '', 'the server could not be reached') };
  }
}

/** What recording the number does, said before it is done (Part 11 review, 2026-10-22). */
const CONSEQUENCE =
  "Compile, export and transmit of this market read this number. A sequence already signed for release reads unsigned " +
  'until it is signed again over the new number, and a number a frozen or dispatched sequence was built under cannot be ' +
  'changed. Recorded with your name, the time and your reason, beside the old and the new number.';

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

/** What the market's packages carry, and who recorded it, when and why. */
function NumberLine({ read, market }: { read: MarketNumberRead; market: string }) {
  const last = read.lastRecorded;
  return (
    <>
      {read.applicationNumber
        ? <>Application number ({market} market): <span className="mono">{read.applicationNumber}</span>.</>
        : <>No application number is recorded for the {market} market, so its packages are refused until one is. The project&apos;s number{read.homeAgency ? ` (${read.homeAgency})` : ''} is not used here.</>}
      {last && <> Recorded by {last.by ?? 'an unnamed account'} on {when(last.at)}{last.reason ? `: ${last.reason}` : ''}.</>}
    </>
  );
}

/** The governed form: the number, its reason, and what recording it does. */
function NumberForm({ read, market, refusal, onCancel, onSubmit }: {
  read: MarketNumberRead; market: string; refusal: string | null;
  onCancel: () => void; onSubmit: (values: Record<string, string>) => void;
}) {
  return (
    <C2CForm
      config={{
        eyebrow: `${market} market`,
        title: read.applicationNumber ? 'Change the application number' : 'Record the application number',
        governed: CONSEQUENCE,
        submitLabel: 'Record',
        ...(refusal ? { notice: refusal } : {}),
        fields: [
          { key: 'applicationNumber', label: 'Application number', type: 'text', required: true,
            default: read.applicationNumber ?? '',
            desc: `The number the ${market} market's agency assigned to this application. Letters, digits, ".", "_" or "-"; a slash is not accepted yet.` },
          { key: 'reason', label: 'Reason', type: 'textarea', required: true,
            desc: `Why this number, in at least ${GOVERNED_REASON_MIN} characters. Recorded with your name and the time.` },
        ],
      }}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );
}

/** The record act: one save at a time, the server's refusal kept, an unchanged number said as such. */
function useRecordNumber(submissionId: number, onDone: (changed: boolean) => void) {
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const saving = React.useRef(false);
  const save = React.useCallback(async (values: Record<string, string>) => {
    if (saving.current) return;
    saving.current = true;
    try {
      const out = await postNumber(submissionId, values.applicationNumber ?? '', values.reason ?? '');
      if ('refused' in out) {
        setRefusal(`Not recorded: ${out.refused}`);
        return;
      }
      setRefusal(null);
      onDone(out.changed);
    } finally {
      saving.current = false;
    }
  }, [submissionId, onDone]);
  return { refusal, setRefusal, save };
}

export function MarketApplicationNumber({ submissionId, canChange, onChanged }: {
  submissionId: number;
  canChange?: boolean;
  /** Re-read what depends on the number (the market's verdict) after a change. */
  onChanged?: () => void;
}) {
  const [bump, setBump] = React.useState(0);
  const path = `/api/submissions/${submissionId}/application-number`;
  const st = useLiveData<MarketNumberRead>(path, [path, bump], isMarketNumberRead);
  const [open, setOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const done = React.useCallback((changed: boolean) => {
    setOpen(false);
    setNotice(changed
      ? 'Application number recorded, with your reason.'
      : 'No change: that is already the recorded number. Nothing was written.');
    if (!changed) return;
    setBump((n) => n + 1);
    onChanged?.();
  }, [onChanged]);
  const { refusal, setRefusal, save } = useRecordNumber(submissionId, done);

  if (st.loading) return null;
  if (st.error || !st.data) {
    return <div className="pj-file-m" role="alert">This market&apos;s application number could not be read.</div>;
  }
  const read = st.data;
  if (read.home) return null;
  const market = read.market ?? 'this';
  return (
    <div className="pj-file-m" data-testid="pj-market-number">
      <NumberLine read={read} market={market} />
      {canChange === false ? (
        <> Only this project&apos;s lead or an organization manager can record it.</>
      ) : (
        <>
          {' '}
          <button type="button" className="btn ghost pj-mkt-btn" onClick={() => { setNotice(null); setRefusal(null); setOpen(true); }}>
            {read.applicationNumber ? 'Change the number' : 'Record the number'}
          </button>
        </>
      )}
      {notice && <span role="status"> {notice}</span>}
      {open && (
        <NumberForm read={read} market={market} refusal={refusal}
          onCancel={() => { setOpen(false); setRefusal(null); }}
          onSubmit={(values) => { void save(values); }} />
      )}
    </div>
  );
}
