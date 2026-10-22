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

interface MarketNumberRead {
  submissionId: number;
  home: boolean;
  market: string | null;
  homeAgency: string | null;
  applicationNumber: string | null;
}

const isMarketNumberRead: ShapeGuard<MarketNumberRead> = (v): v is MarketNumberRead =>
  !!v && typeof v === 'object' && typeof (v as MarketNumberRead).home === 'boolean' &&
  ((v as MarketNumberRead).applicationNumber === null || typeof (v as MarketNumberRead).applicationNumber === 'string');

/** POST the number with its reason; the server's words on refusal. Never throws. */
async function postNumber(submissionId: number, applicationNumber: string, reason: string): Promise<string | null> {
  try {
    await apiRequest('POST', `/api/submissions/${submissionId}/application-number`, { applicationNumber, reason });
    return null;
  } catch (err) {
    if (err instanceof ApiRequestError) return err.message;
    return redactInternals(err instanceof Error ? err.message : '', 'the server could not be reached');
  }
}

export function MarketApplicationNumber({ submissionId, canChange }: { submissionId: number; canChange?: boolean }) {
  const [bump, setBump] = React.useState(0);
  const path = `/api/submissions/${submissionId}/application-number`;
  const st = useLiveData<MarketNumberRead>(path, [path, bump], isMarketNumberRead);
  const [open, setOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<{ text: string; error: boolean } | null>(null);

  if (st.loading) return null;
  if (st.error || !st.data) {
    return <div className="pj-file-m" role="alert">This market&apos;s application number could not be read.</div>;
  }
  const read = st.data;
  if (read.home) return null;
  const market = read.market ?? 'this';
  const save = async (values: Record<string, string>) => {
    const refused = await postNumber(submissionId, values.applicationNumber ?? '', values.reason ?? '');
    setOpen(false);
    setNotice(refused
      ? { text: `The application number was not recorded: ${refused}`, error: true }
      : { text: 'Application number recorded, with your reason.', error: false });
    if (!refused) setBump((n) => n + 1);
  };
  return (
    <div className="pj-file-m" data-testid="pj-market-number">
      {read.applicationNumber
        ? <>Application number ({market} market): <span className="mono">{read.applicationNumber}</span>.</>
        : <>No application number is recorded for the {market} market, so its packages are refused until one is. The project&apos;s number{read.homeAgency ? ` (${read.homeAgency})` : ''} is not used here.</>}
      {canChange !== false && (
        <>
          {' '}
          <button type="button" className="btn ghost pj-mkt-btn" onClick={() => { setNotice(null); setOpen(true); }}>
            {read.applicationNumber ? 'Change the number' : 'Record the number'}
          </button>
        </>
      )}
      {notice && <span role={notice.error ? 'alert' : 'status'}> {notice.text}</span>}
      {open && (
        <C2CForm
          config={{
            eyebrow: `${market} market`,
            title: read.applicationNumber ? 'Change the application number' : 'Record the application number',
            governed: true,
            submitLabel: 'Record',
            fields: [
              { key: 'applicationNumber', label: 'Application number', type: 'text', required: true,
                default: read.applicationNumber ?? '',
                desc: `The number the ${market} market's agency assigned to this application. Letters, digits, ".", "_" or "-"; a slash is not accepted yet.` },
              { key: 'reason', label: 'Reason', type: 'textarea', required: true,
                desc: 'Recorded with your name and the time, beside the old and the new number.' },
            ],
          }}
          onCancel={() => setOpen(false)}
          onSubmit={(values) => { void save(values); }}
        />
      )}
    </div>
  );
}
