// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  OfficialEstarPanel,
  generateDisabledReason,
  officialEstarVariantFor,
  entitlementLockTitle,
} from '../OfficialEstarPanel';
import type { Program } from '../../data/programs';

/**
 * Mount tests for the official eSTAR panel — the ONE place the official FDA
 * eSTAR PDF is produced from.
 *
 * What is pinned:
 *   - it survives first paint under every degraded read (pending / 401 / throw),
 *     and the FIRST PAINTED FRAME — before useFetchJson's effect has run —
 *     asserts nothing about availability it has not checked;
 *   - not-ready ⇒ the Generate control is disabled WITH the blockers in its
 *     title, and no input claims to hold data;
 *   - ready ⇒ governed rows are read-only with their source in plain words,
 *     unsourced rows carry a labelled input marked as not stored;
 *   - a program switch never shows the previous program's values under the
 *     new program while its field list is still loading;
 *   - Generate posts useProgramData:true and ONLY the typed, non-empty keys;
 *   - the outcome line shows filled/blank counts and the blank captions;
 *   - a 403 NOT_ENTITLED renders Locked with the tier, never a dead button;
 *   - a failed field read renders ErrorState with a human sentence, never an
 *     empty table — retry only when a retry could succeed (not on 404/422);
 *   - a failed field read also disables Generate with the reason.
 */

vi.mock('../../../v2/download', () => ({ downloadBase64: vi.fn() }));

const PROGRAM: Program = {
  id: 'a2b4c6d8-0000-0000-0000-000000000001',
  title: 'BX-204 Continuous Glucose Monitor',
  code: 'BX-204',
  pathway: 'k510',
  stage: 'Assemble eSTAR',
  stageIdx: 5,
  readiness: 72,
  status: 'active',
  lead: 'Jordan Chen',
  owners: ['JC'],
  nextBlocker: null,
  dueLabel: 'FDA filing · 41 days',
  dueTone: 'warn',
  lastActivity: '2h ago',
  meta: '',
};

const PROGRAM_B: Program = {
  ...PROGRAM,
  id: 'a2b4c6d8-0000-0000-0000-000000000002',
  title: 'NX-9 Pulse Oximeter',
  code: 'NX-9',
};

const READY = {
  descriptorId: '510k-device',
  ready: true,
  templateAvailable: true,
  fieldMapPopulated: true,
  blockers: [],
};

const NOT_READY = {
  descriptorId: '510k-device',
  ready: false,
  templateAvailable: false,
  fieldMapPopulated: true,
  blockers: ['official FDA template not vendored'],
};

const FIELDS = {
  descriptorId: '510k-device',
  type: '510k',
  variant: 'device',
  mappedCount: 4,
  sourcedCount: 2,
  fields: [
    {
      key: 'deviceTradeName',
      caption: 'Device Trade Name',
      xfaSomPath: 'form1.p1.trade',
      value: 'BX-204 CGM',
      source: 'regulatory_programs.product_name',
    },
    {
      key: 'predicateSubmissionNumber',
      caption: 'Predicate 510(k) Number',
      xfaSomPath: 'form1.p2.pred',
      value: 'K221847',
      source: 'regulatory_programs.predicate_devices[0].kNumber',
    },
    {
      key: 'deviceCommonName',
      caption: 'Common Name',
      xfaSomPath: 'form1.p1.common',
      value: null,
      source: null,
    },
    {
      key: 'correspondentTelephone',
      caption: 'Correspondent Telephone',
      xfaSomPath: null,
      value: null,
      source: null,
    },
  ],
};

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
const failJson = (body: unknown, status: number) =>
  Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
const failText = (body: string, status: number) =>
  Promise.resolve({
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
  } as Response);
const pending = () => new Promise<Response>(() => {});

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

function mockFetch(handler: Handler) {
  const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** Readiness + field list answer; the POST is left to each test. */
function readsThen(readiness: unknown, fields: unknown, onPost: Handler): Handler {
  return (url, init) => {
    if (url.includes('/estar/readiness')) return okJson(readiness);
    if (url.includes('/estar/official-fields')) return okJson(fields);
    if (url.includes('/estar/official') && init?.method === 'POST') return onPost(url, init);
    return okJson({});
  };
}

/** Readiness answers; the field read is handed to `onFields`. */
function fieldsRead(onFields: Handler): Handler {
  return (url, init) => {
    if (url.includes('/estar/readiness')) return okJson(READY);
    if (url.includes('/estar/official-fields')) return onFields(url, init);
    return okJson({});
  };
}

const generateButton = () =>
  screen.getByRole('button', { name: /Generate official eSTAR \(PDF\)/ }) as HTMLButtonElement;

const CHECKING = 'Checking official eSTAR availability…';
const NOT_PRODUCIBLE_DEFAULT = 'The official template or its field map is not available';

beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OfficialEstarPanel — survives first paint', () => {
  it('the first painted frame asserts nothing it has not checked', () => {
    /* Before useFetchJson's effect runs it reports loading:false with no
       readiness and no error. Rendering that frame without effects (static
       markup) captures exactly what the user sees for that instant. */
    mockFetch(pending);
    const html = renderToStaticMarkup(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    expect(html).not.toContain('Not yet producible');
    expect(html).not.toContain(NOT_PRODUCIBLE_DEFAULT);
    expect(html).toContain(`title="${CHECKING}"`);
    expect(html).toContain(CHECKING);
  });

  it('renders while every request is still pending — checking is a visible status, not only a title', () => {
    mockFetch(pending);
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    expect(screen.getByText(/Official eSTAR · administrative data/)).toBeTruthy();
    expect(generateButton().disabled).toBe(true);
    expect(generateButton().title).toBe(CHECKING);
    const line = screen.getByText(CHECKING);
    expect(line.getAttribute('role')).toBe('status');
    expect(screen.queryByText('Not yet producible')).toBeNull();
    expect(screen.queryByText(NOT_PRODUCIBLE_DEFAULT)).toBeNull();
  });

  it('renders when the user is NOT signed in (401 everywhere) — disabled with a reason, no empty table', async () => {
    mockFetch(() => failJson({}, 401));
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(screen.getByTestId('official-estar-error')).toBeTruthy());
    expect(generateButton().disabled).toBe(true);
    expect(generateButton().title).toMatch(/not yet producible/);
    expect(document.querySelector('table.tbl')).toBeNull();
    expect(screen.queryByText(CHECKING)).toBeNull();
  });

  it('renders when the network throws outright — a failed read, in plain words, with retry', async () => {
    mockFetch(() => Promise.reject(new Error('network down')));
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(screen.getByTestId('official-estar-error')).toBeTruthy());
    expect(screen.getByText(/Official eSTAR · administrative data/)).toBeTruthy();
    const error = within(screen.getByTestId('official-estar-error'));
    expect(error.getByText('The field list could not be loaded')).toBeTruthy();
    expect(error.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText(/network down/)).toBeNull();
  });

  it('with no program says so and fetches no field list', async () => {
    const spy = mockFetch(readsThen(READY, FIELDS, () => okJson({})));
    render(<OfficialEstarPanel program={null} variant="device" />);
    expect(screen.getByTestId('official-estar-idle')).toBeTruthy();
    expect(generateButton().disabled).toBe(true);
    expect(generateButton().title).toMatch(/Open a program first/);
    // Let the readiness probe settle so the assertion covers the resolved state too.
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await act(async () => {});
    expect(spy.mock.calls.some((c) => String(c[0]).includes('/official-fields'))).toBe(false);
    expect(generateButton().title).toMatch(/Open a program first/);
  });
});

describe('OfficialEstarPanel — the produce-gate', () => {
  it('not ready ⇒ Generate disabled with the blockers in the title, no input claims data', async () => {
    mockFetch(readsThen(NOT_READY, FIELDS, () => okJson({})));
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(screen.getByText(/official FDA template not vendored/)).toBeTruthy());
    const btn = generateButton();
    expect(btn.disabled).toBe(true);
    expect(btn.title).toContain('official FDA template not vendored');
    expect(screen.getByText('Not yet producible')).toBeTruthy();
    expect(screen.queryByText(CHECKING)).toBeNull();
    // The preview still says what WOULD be written, but nothing typed is
    // presented as held data: inputs are empty, carry no placeholder, and
    // are labelled as not stored.
    await waitFor(() => expect(screen.getByLabelText('Common Name')).toBeTruthy());
    for (const input of Array.from(document.querySelectorAll('table.tbl input'))) {
      expect((input as HTMLInputElement).value).toBe('');
      expect(input.getAttribute('placeholder')).toBeNull();
    }
    expect(screen.getAllByText('Entered for this export only · not stored').length).toBe(2);
  });

  it('a failed field read disables Generate with the reason — the user has not seen what will be written', async () => {
    mockFetch(fieldsRead(() => failText('<html>Bad gateway</html>', 502)));
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(screen.getByTestId('official-estar-error')).toBeTruthy());
    await act(async () => {});
    const btn = generateButton();
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('The field list could not be loaded — load it before generating');
  });

  it('busy ⇒ Exporting… is a visible status line and the reason on the control', async () => {
    mockFetch(readsThen(READY, FIELDS, pending));
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(generateButton().disabled).toBe(false));
    fireEvent.click(generateButton());
    await waitFor(() => expect(screen.getByText('Exporting…')).toBeTruthy());
    expect(screen.getByText('Exporting…').getAttribute('role')).toBe('status');
    expect(generateButton().disabled).toBe(true);
    expect(generateButton().title).toBe('Exporting…');
  });

  it('generateDisabledReason (pure): lock, then program, then readiness, then busy, then not ready, then field list', () => {
    const base = {
      lockedTitle: null,
      hasProgram: true,
      readinessLoading: false,
      readinessError: null,
      ready: true,
      blockers: [],
      busy: false,
      fieldsError: null,
    };
    expect(generateDisabledReason(base)).toBeNull();
    expect(generateDisabledReason({ ...base, lockedTitle: 'Locked — x' })).toBe('Locked — x');
    expect(generateDisabledReason({ ...base, hasProgram: false })).toMatch(/Open a program first/);
    expect(generateDisabledReason({ ...base, readinessLoading: true })).toBe(CHECKING);
    expect(generateDisabledReason({ ...base, busy: true })).toBe('Exporting…');
    expect(
      generateDisabledReason({ ...base, ready: false, blockers: ['a', 'b'] }),
    ).toBe('Official eSTAR not yet producible — a · b');
    expect(
      generateDisabledReason({ ...base, ready: false, readinessError: 'HTTP 500' }),
    ).toMatch(/could not be checked/);
    expect(generateDisabledReason({ ...base, fieldsError: 'The field list could not be loaded' })).toBe(
      'The field list could not be loaded — load it before generating',
    );
    // Precedence: an earlier reason wins over the field-list read.
    expect(
      generateDisabledReason({ ...base, fieldsError: 'x', ready: false, blockers: ['a'] }),
    ).toBe('Official eSTAR not yet producible — a');
    expect(generateDisabledReason({ ...base, fieldsError: 'x', busy: true })).toBe('Exporting…');
    expect(generateDisabledReason({ ...base, fieldsError: 'x', readinessLoading: true })).toBe(CHECKING);
    expect(generateDisabledReason({ ...base, fieldsError: 'x', hasProgram: false })).toMatch(
      /Open a program first/,
    );
    expect(generateDisabledReason({ ...base, fieldsError: 'x', lockedTitle: 'Locked — x' })).toBe(
      'Locked — x',
    );
  });
});

describe('OfficialEstarPanel — the field preview', () => {
  it('ready ⇒ governed rows are read-only with source words; unsourced rows have labelled inputs', async () => {
    mockFetch(readsThen(READY, FIELDS, () => okJson({})));
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() =>
      expect(screen.getByText('2 of 4 fields have a governed source')).toBeTruthy(),
    );
    // Governed: the value is text, not an input, and the source is plain words.
    const trade = screen.getByTestId('official-estar-value-deviceTradeName');
    expect(trade.textContent).toBe('BX-204 CGM');
    expect(trade.tagName).not.toBe('INPUT');
    expect(screen.getByText('Device profile · product name')).toBeTruthy();
    expect(screen.getByText(/Device profile · first predicate/)).toBeTruthy();
    expect(screen.queryByText(/regulatory_programs/)).toBeNull();
    // The governed rows carry no input at all.
    const governedRows = document.querySelectorAll('tr[data-sourced="true"]');
    expect(governedRows.length).toBe(2);
    for (const row of Array.from(governedRows)) expect(row.querySelector('input')).toBeNull();
    // Unsourced: a labelled input, empty, marked as not stored.
    const common = screen.getByLabelText('Common Name') as HTMLInputElement;
    expect(common.tagName).toBe('INPUT');
    expect(common.value).toBe('');
    const tel = screen.getByLabelText('Correspondent Telephone') as HTMLInputElement;
    expect(tel.tagName).toBe('INPUT');
    expect(document.querySelectorAll('tr[data-sourced="false"] input').length).toBe(2);
    // Ready ⇒ the control is live.
    await waitFor(() => expect(generateButton().disabled).toBe(false));
  });

  it('switching programs never shows the previous program’s values while the next field list loads', async () => {
    /* useFetchJson keeps the previous payload in `data` across a url change —
       only `loading` flips. Without treating an in-flight read as "no field
       list", program A's product name and predicate would sit under program
       B's header until B's read resolved. */
    mockFetch(
      fieldsRead((url) =>
        url.includes(encodeURIComponent(PROGRAM.id)) ? okJson(FIELDS) : pending(),
      ),
    );
    const view = render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(screen.getByTestId('official-estar-value-deviceTradeName')).toBeTruthy());
    view.rerender(<OfficialEstarPanel program={PROGRAM_B} variant="device" />);
    expect(screen.queryAllByTestId(/^official-estar-value-/)).toHaveLength(0);
    expect(screen.queryByText('BX-204 CGM')).toBeNull();
    expect(screen.queryByText('K221847')).toBeNull();
    expect(screen.getByTestId('official-estar-loading')).toBeTruthy();
    expect(screen.getByText('Loading the field list…')).toBeTruthy();
    expect(document.querySelector('table.tbl')).toBeNull();
  });

  it('a failed field read (5xx) renders ErrorState with a sentence and retry, never an empty table or the raw body', async () => {
    let calls = 0;
    mockFetch(
      fieldsRead(() => {
        calls += 1;
        return calls === 1 ? failText('<html><body>Bad gateway</body></html>', 502) : okJson(FIELDS);
      }),
    );
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(screen.getByTestId('official-estar-error')).toBeTruthy());
    expect(document.querySelector('table.tbl')).toBeNull();
    const error = within(screen.getByTestId('official-estar-error'));
    expect(error.getByText('Could not load the field list')).toBeTruthy();
    expect(error.getByText('The field list could not be loaded')).toBeTruthy();
    expect(screen.queryByText(/HTTP 502/)).toBeNull();
    expect(screen.queryByText(/Bad gateway/)).toBeNull();
    fireEvent.click(error.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('2 of 4 fields have a governed source')).toBeTruthy());
  });

  it('a 404 says the program was not found — and offers no retry, which could not succeed', async () => {
    mockFetch(fieldsRead(() => failJson({ error: 'Project not found in your organization' }, 404)));
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(screen.getByTestId('official-estar-error')).toBeTruthy());
    const error = within(screen.getByTestId('official-estar-error'));
    expect(error.getByText('This program was not found in your organization')).toBeTruthy();
    expect(error.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(document.querySelector('table.tbl')).toBeNull();
  });

  it('a 422 says the field map is not populated — and offers no retry', async () => {
    mockFetch(
      fieldsRead(() =>
        failJson(
          { error: 'ESTAR_FIELD_MAP_NOT_POPULATED', descriptorId: '510k-device', blockers: ['field map not populated'] },
          422,
        ),
      ),
    );
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(screen.getByTestId('official-estar-error')).toBeTruthy());
    const error = within(screen.getByTestId('official-estar-error'));
    expect(
      error.getByText('The field map for this template is not populated, so there is nothing to preview'),
    ).toBeTruthy();
    expect(error.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByText(/ESTAR_FIELD_MAP_NOT_POPULATED/)).toBeNull();
    expect(document.querySelector('table.tbl')).toBeNull();
  });
});

describe('OfficialEstarPanel — Generate', () => {
  it('posts useProgramData:true and only the typed non-empty keys, then reports filled/blank', async () => {
    let posted: Record<string, unknown> | null = null;
    mockFetch(
      readsThen(READY, FIELDS, (_url, init) => {
        posted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return okJson({
          governed: true,
          officialEstarPdf: true,
          downloadable_output_ref: {
            encoding: 'base64',
            mime_type: 'application/pdf',
            filename: 'BX-204_eSTAR.pdf',
            data: 'AA==',
          },
          fieldReport: {
            mappedCount: 4,
            filledCount: 3,
            blankCount: 1,
            blankKeys: ['correspondentTelephone'],
            ignoredRequestKeys: [],
          },
        });
      }),
    );
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(generateButton().disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('Common Name'), { target: { value: '  Glucose monitor ' } });
    fireEvent.change(screen.getByLabelText('Correspondent Telephone'), { target: { value: '   ' } });
    fireEvent.click(generateButton());
    await waitFor(() => expect(posted).not.toBeNull());
    const body = posted as unknown as Record<string, unknown>;
    expect(body.useProgramData).toBe(true);
    expect(body.type).toBe('510k');
    expect(body.variant).toBe('device');
    expect((body.meta as Record<string, unknown>).ident).toBe(PROGRAM.id);
    // Only the typed, non-empty key travels — trimmed. The whitespace-only
    // telephone and the two governed keys are not in the request.
    expect(body.data).toEqual({ deviceCommonName: 'Glucose monitor' });
    await waitFor(() =>
      expect(
        screen.getByText(
          'Downloaded BX-204_eSTAR.pdf · 3 of 4 administrative fields filled · 1 left blank',
        ),
      ).toBeTruthy(),
    );
    // Blank keys are named by caption, not by key.
    expect(screen.getByText(/Left blank — the platform holds no value: Correspondent Telephone/)).toBeTruthy();
    expect(screen.queryByText(/correspondentTelephone/)).toBeNull();
  });

  it('switching programs forgets the previous program’s outcome — no stale Downloaded line under the new header', async () => {
    mockFetch(
      readsThen(READY, FIELDS, () =>
        okJson({
          governed: true,
          officialEstarPdf: true,
          downloadable_output_ref: {
            encoding: 'base64',
            mime_type: 'application/pdf',
            filename: 'BX-204_eSTAR.pdf',
            data: 'AA==',
          },
          fieldReport: {
            mappedCount: 4,
            filledCount: 3,
            blankCount: 1,
            blankKeys: ['correspondentTelephone'],
            ignoredRequestKeys: [],
          },
        }),
      ),
    );
    const view = render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(generateButton().disabled).toBe(false));
    fireEvent.click(generateButton());
    await waitFor(() => expect(screen.getByText(/Downloaded BX-204_eSTAR\.pdf/)).toBeTruthy());
    expect(screen.getByText(/Left blank — the platform holds no value/)).toBeTruthy();

    // Open another program: the outcome belonged to BX-204, not to NX-9.
    view.rerender(<OfficialEstarPanel program={PROGRAM_B} variant="device" />);
    await waitFor(() => expect(screen.queryByText(/Downloaded BX-204_eSTAR\.pdf/)).toBeNull());
    expect(screen.queryByText(/Left blank — the platform holds no value/)).toBeNull();
  });

  it('names the typed keys the server dropped', async () => {
    mockFetch(
      readsThen(READY, FIELDS, () =>
        okJson({
          governed: true,
          fieldReport: {
            mappedCount: 4,
            filledCount: 4,
            blankCount: 0,
            blankKeys: [],
            ignoredRequestKeys: ['deviceTradeName', 'notOnTemplate'],
          },
        }),
      ),
    );
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(generateButton().disabled).toBe(false));
    fireEvent.click(generateButton());
    await waitFor(() =>
      expect(screen.getByText('Downloaded package · 4 of 4 administrative fields filled')).toBeTruthy(),
    );
    const line = screen.getByText(/Entered values not written/);
    expect(line.textContent).toContain('Device Trade Name');
    expect(line.textContent).toContain('notOnTemplate');
  });

  it('a 403 NOT_ENTITLED renders Locked with the tier in the title — never a dead button', async () => {
    mockFetch(
      readsThen(READY, FIELDS, () =>
        failJson(
          {
            error: 'NOT_ENTITLED',
            capability: 'device_assembly_readiness',
            requiredTier: 'standard',
            message: "This capability requires the 'standard' plan or above (current plan: 'free').",
          },
          403,
        ),
      ),
    );
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(generateButton().disabled).toBe(false));
    fireEvent.click(generateButton());
    await waitFor(() => expect(screen.getByText('Locked')).toBeTruthy());
    expect(screen.getByText('Requires the standard plan — device assembly readiness')).toBeTruthy();
    const btn = generateButton();
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('Locked — requires the standard plan (device assembly readiness)');
  });

  it('a 422 refusal shows the blockers on the status line', async () => {
    mockFetch(
      readsThen(READY, FIELDS, () =>
        failJson({ error: 'ESTAR_NOT_PRODUCIBLE', blockers: ['content incomplete'] }, 422),
      ),
    );
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(generateButton().disabled).toBe(false));
    fireEvent.click(generateButton());
    await waitFor(() => expect(screen.getByText('Export failed — content incomplete')).toBeTruthy());
    expect(screen.queryByText('Locked')).toBeNull();
  });
});

/** Answer the entitlement read with `view`; everything else to `inner`. */
function withEntitlement(view: unknown, inner: Handler): Handler {
  return (url, init) => (url.includes('/estar/entitlement') ? okJson(view) : inner(url, init));
}

const ENTITLEMENT_DENIED = {
  capability: 'device_assembly_readiness',
  mode: 'on',
  enforced: true,
  allowed: false,
  requiredTier: 'standard',
  tier: 'free',
  reason: null,
};

describe('OfficialEstarPanel — the entitlement lock is known before the first click', () => {
  it('an enforced denial locks Generate on mount, names the tier, and never posts', async () => {
    let posted = 0;
    mockFetch(
      withEntitlement(
        ENTITLEMENT_DENIED,
        readsThen(READY, FIELDS, () => {
          posted += 1;
          return okJson({ governed: true });
        }),
      ),
    );
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(screen.getByTestId('official-estar-locked')).toBeTruthy());
    const btn = generateButton();
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe(entitlementLockTitle('standard'));
    expect(screen.getByText('Requires the standard plan — device assembly readiness')).toBeTruthy();
    expect(screen.getByText('Locked')).toBeTruthy();
    fireEvent.click(btn);
    expect(posted).toBe(0);
  });

  it('a denial in warn mode does not lock — the POST would go through', async () => {
    mockFetch(
      withEntitlement(
        { ...ENTITLEMENT_DENIED, mode: 'warn', enforced: false },
        readsThen(READY, FIELDS, () => okJson({ governed: true })),
      ),
    );
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(generateButton().disabled).toBe(false));
    expect(screen.queryByTestId('official-estar-locked')).toBeNull();
  });

  it('a failed entitlement read locks nothing', async () => {
    mockFetch((url, init) =>
      url.includes('/estar/entitlement')
        ? failText('<html>bad gateway</html>', 502)
        : readsThen(READY, FIELDS, () => okJson({ governed: true }))(url, init),
    );
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    await waitFor(() => expect(generateButton().disabled).toBe(false));
    expect(screen.queryByTestId('official-estar-locked')).toBeNull();
  });
});

describe('OfficialEstarPanel — which template family', () => {
  it('officialEstarVariantFor (pure): the product type decides, never the surface', () => {
    expect(officialEstarVariantFor({ productType: 'ivd' })).toBe('ivd');
    expect(officialEstarVariantFor({ productType: 'IVD' })).toBe('ivd');
    expect(officialEstarVariantFor({ productType: 'device' })).toBe('device');
    expect(officialEstarVariantFor({ productType: undefined })).toBe('device');
    expect(officialEstarVariantFor(null)).toBe('device');
  });

  it('the header names the family, and the reads carry the variant', async () => {
    const urls: string[] = [];
    mockFetch((url, init) => {
      urls.push(url);
      return readsThen(READY, { ...FIELDS, variant: 'ivd' }, () => okJson({}))(url, init);
    });
    render(<OfficialEstarPanel program={{ ...PROGRAM, productType: 'ivd' }} variant="ivd" />);
    expect(screen.getByText(/Official eSTAR · administrative data · IVD eSTAR/)).toBeTruthy();
    await waitFor(() => expect(urls.some((u) => u.includes('/estar/official-fields'))).toBe(true));
    expect(urls.filter((u) => u.includes('/estar/readiness')).every((u) => u.includes('variant=ivd'))).toBe(true);
    expect(urls.filter((u) => u.includes('/estar/official-fields')).every((u) => u.includes('variant=ivd'))).toBe(true);
  });

  it('a device program reads as the nIVD eSTAR', () => {
    mockFetch(() => pending());
    render(<OfficialEstarPanel program={PROGRAM} variant="device" />);
    expect(screen.getByText(/Official eSTAR · administrative data · nIVD eSTAR/)).toBeTruthy();
  });
});
