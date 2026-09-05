// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { EstarFilingPanel } from '../EstarFilingPanel';

/**
 * Mount tests for the eSTAR filing panel.
 *
 * Type-checking proves the component compiles; it does not prove the component
 * SURVIVES FIRST PAINT. This panel renders before any of its three fetches
 * resolve, and in a real session those fetches can 401 (not signed in), fail
 * outright, or return an empty org. Each of those paths must render something
 * rather than throw, because a crash here takes the whole PMA surface with it.
 *
 * These pin exactly that: mount under each degraded condition and assert the
 * panel is still on screen.
 */

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

function mockFetch(handler: (url: string) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => handler(String(input))));
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

const REGISTRATION = {
  id: 'r1',
  correspondentCompanyName: 'Acme Regulatory Ltd',
  correspondentContactEmail: 'ra@acme.example',
  correspondentTelephone: '+1 555 0100',
  declarationCompanyName: 'Declaring Entity GmbH',
  declarationCompanyAddress: '1 Main St, Springfield',
};

/** Decoded body of the PUT the panel issued — null when no write was sent. */
function sentPut(): Record<string, unknown> | null {
  const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const put = calls.find(([, init]) => (init as { method?: string } | undefined)?.method === 'PUT');
  return put ? (JSON.parse((put[1] as { body: string }).body) as Record<string, unknown>) : null;
}

/** A registered org whose registration row holds the correspondent block. */
function mockRegisteredOrg() {
  mockFetch((url) => {
    if (url.includes('/registration')) {
      return okJson({
        registered: true,
        registration: REGISTRATION,
        clientRegistration: { clientId: 'o1', satisfied: ['fda_esg_account'] },
      });
    }
    if (url.includes('/catalog')) return okJson({ catalog: [] });
    if (url.includes('/submissions')) return okJson({ submissions: [] });
    return okJson({});
  });
}

describe('EstarFilingPanel — survives first paint', () => {
  it('renders while every request is still pending (no data at all)', () => {
    mockFetch(() => new Promise<Response>(() => {})); // never resolves
    render(<EstarFilingPanel />);
    expect(screen.getByText('eSTAR filing readiness')).toBeTruthy();
  });

  it('renders when the user is NOT signed in (401 on every endpoint)', async () => {
    mockFetch(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response),
    );
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getByText('eSTAR filing readiness')).toBeTruthy());
    // The four FDA prerequisites still render, all unheld — never a crash.
    expect(screen.getAllByText('Mark held').length).toBe(4);
  });

  it('renders when the network throws outright', async () => {
    mockFetch(() => Promise.reject(new Error('network down')));
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getByText('eSTAR filing readiness')).toBeTruthy());
  });

  it('renders an unregistered org with an empty catalog and no filings', async () => {
    mockFetch((url) => {
      if (url.includes('/registration')) {
        return okJson({ registered: false, registration: null, clientRegistration: { clientId: 'o1', satisfied: [] } });
      }
      if (url.includes('/catalog')) return okJson({ catalog: [] });
      if (url.includes('/submissions')) return okJson({ submissions: [] });
      return okJson({});
    });
    render(<EstarFilingPanel />);
    await waitFor(() =>
      expect(screen.getByText(/Not yet registered/i)).toBeTruthy(),
    );
  });

  it('renders a registered org with a catalog and a tracked filing', async () => {
    mockFetch((url) => {
      if (url.includes('/registration')) {
        return okJson({
          registered: true,
          registration: {},
          clientRegistration: {
            clientId: 'o1',
            satisfied: ['fda_esg_account', 'cdrh_portal_account', 'organization_identity', 'mdufa_fee_account'],
          },
        });
      }
      if (url.includes('/catalog')) {
        return okJson({ catalog: [{ key: '510k', label: '510(k)', programType: '510k', center: 'CDRH', regulatoryRef: '21 CFR 807' }] });
      }
      if (url.includes('/submissions')) {
        return okJson({
          submissions: [
            {
              id: 'sub-1', catalogKey: 'pma_original', programType: 'pma', variant: 'device',
              title: 'CV-330 PMA', status: 'under_review', decision: null,
              fdaTrackingNumber: 'P260001', filedAt: '2026-02-01T00:00:00.000Z',
              reviewGoalDays: 180, decisionDueAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        });
      }
      return okJson({});
    });
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getByText(/4\/4 FDA prerequisites held/)).toBeTruthy());
    expect(screen.getByText('CV-330 PMA')).toBeTruthy();
    // The review clock is shown, not silently dropped.
    expect(screen.getByText(/Decision due/)).toBeTruthy();
  });

  it('renders a filing with NO review clock without printing a bogus date', async () => {
    mockFetch((url) => {
      if (url.includes('/submissions')) {
        return okJson({
          submissions: [
            {
              id: 's2', catalogKey: 'qsub_pre_submission', programType: 'q_sub', variant: 'device',
              title: 'Pre-Sub', status: 'draft', decision: null, fdaTrackingNumber: null,
              filedAt: null, reviewGoalDays: null, decisionDueAt: null,
            },
          ],
        });
      }
      if (url.includes('/catalog')) return okJson({ catalog: [] });
      return okJson({ registered: false, registration: null, clientRegistration: { clientId: 'o', satisfied: [] } });
    });
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getByText('No review clock')).toBeTruthy());
  });
});

describe('EstarFilingPanel — correspondent and declaration block', () => {
  it('shows the stored values and says where they are written', async () => {
    mockRegisteredOrg();
    render(<EstarFilingPanel />);
    await waitFor(() =>
      expect((screen.getByLabelText('Correspondent company name') as HTMLInputElement).value).toBe(
        'Acme Regulatory Ltd',
      ),
    );
    const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
    expect(value('Correspondent contact email')).toBe('ra@acme.example');
    expect(value('Correspondent telephone')).toBe('+1 555 0100');
    /* The Declaration of Conformity's name and address are one legal entity —
       both are shown, from the same stored row. */
    expect(value('Declaration of Conformity company name')).toBe('Declaring Entity GmbH');
    expect(value('Declaration of Conformity company address')).toBe('1 Main St, Springfield');
    expect(screen.getByText('Correspondent and declaration')).toBeTruthy();
    expect(screen.getByText(/correspondent and Declaration of Conformity fields/)).toBeTruthy();
    /* Nothing edited — Save stays disabled. */
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders the block empty — no placeholder values — when the row has none', async () => {
    mockFetch((url) => {
      if (url.includes('/registration')) {
        return okJson({ registered: false, registration: null, clientRegistration: { clientId: 'o1', satisfied: [] } });
      }
      if (url.includes('/catalog')) return okJson({ catalog: [] });
      return okJson({ submissions: [] });
    });
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getByText(/Not yet registered/i)).toBeTruthy());
    expect((screen.getByLabelText('Correspondent company name') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Declaration of Conformity company name') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Declaration of Conformity company address') as HTMLInputElement).value).toBe('');
  });

  it('Save PUTs the five text fields with the held prerequisites preserved', async () => {
    mockRegisteredOrg();
    render(<EstarFilingPanel />);
    await waitFor(() =>
      expect((screen.getByLabelText('Correspondent telephone') as HTMLInputElement).value).toBe('+1 555 0100'),
    );
    fireEvent.change(screen.getByLabelText('Correspondent telephone'), { target: { value: ' +1 555 0199 ' } });
    fireEvent.change(screen.getByLabelText('Declaration of Conformity company address'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(sentPut()).toEqual({
      fdaEsgAccount: true,
      cdrhPortalAccount: false,
      organizationIdentity: false,
      mdufaFeeAccount: false,
      correspondentCompanyName: 'Acme Regulatory Ltd',
      correspondentContactEmail: 'ra@acme.example',
      correspondentTelephone: '+1 555 0199',
      declarationCompanyName: 'Declaring Entity GmbH',
      declarationCompanyAddress: null,
    });
  });

  it('toggling a prerequisite carries the stored correspondent values in the write', async () => {
    mockRegisteredOrg();
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getAllByText('Mark held').length).toBe(3));
    fireEvent.click(screen.getAllByText('Mark held')[0]);
    await waitFor(() => expect(sentPut()).not.toBeNull());
    expect(sentPut()).toMatchObject({
      fdaEsgAccount: true,
      cdrhPortalAccount: true,
      correspondentCompanyName: 'Acme Regulatory Ltd',
      declarationCompanyName: 'Declaring Entity GmbH',
      declarationCompanyAddress: '1 Main St, Springfield',
    });
  });

  it('says "Not saved" when the write is rejected (editor-only), keeping the typed values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL, init?: { method?: string }) => {
        const url = String(input);
        if (init?.method === 'PUT') {
          return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response);
        }
        if (url.includes('/registration')) {
          return okJson({ registered: true, registration: REGISTRATION, clientRegistration: { clientId: 'o1', satisfied: [] } });
        }
        if (url.includes('/catalog')) return okJson({ catalog: [] });
        return okJson({ submissions: [] });
      }),
    );
    render(<EstarFilingPanel />);
    await waitFor(() =>
      expect((screen.getByLabelText('Correspondent company name') as HTMLInputElement).value).toBe('Acme Regulatory Ltd'),
    );
    fireEvent.change(screen.getByLabelText('Correspondent company name'), { target: { value: 'Typed Co' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.getByText(/Not saved/)).toBeTruthy());
    expect((screen.getByLabelText('Correspondent company name') as HTMLInputElement).value).toBe('Typed Co');
  });
});

/**
 * The Declaration of Conformity is signed by ONE legal entity, so the form's
 * company name and company address have to describe the same company. The name
 * is an input of this block for that reason, and the write has to carry it.
 */
describe('EstarFilingPanel — the Declaration of Conformity company name', () => {
  it('a typed Declaration of Conformity company name is sent, so the DoC can name the entity that holds the address', async () => {
    mockFetch((url) => {
      if (url.includes('/registration')) {
        return okJson({
          registered: true,
          registration: { ...REGISTRATION, declarationCompanyName: null },
          clientRegistration: { clientId: 'o1', satisfied: [] },
        });
      }
      if (url.includes('/catalog')) return okJson({ catalog: [] });
      return okJson({ submissions: [] });
    });
    render(<EstarFilingPanel />);
    /* Wait for a value the stored row supplies — an empty field is also what
       first paint shows, so it would not prove the row had loaded. */
    await waitFor(() =>
      expect((screen.getByLabelText('Correspondent company name') as HTMLInputElement).value).toBe('Acme Regulatory Ltd'),
    );
    expect((screen.getByLabelText('Declaration of Conformity company name') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Declaration of Conformity company name'), {
      target: { value: ' Declaring Entity GmbH ' },
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(sentPut()).toMatchObject({
      declarationCompanyName: 'Declaring Entity GmbH',
      declarationCompanyAddress: '1 Main St, Springfield',
    });
  });
});

/**
 * A toggle must never blank text the org already holds.
 *
 * `registrationPatchToggling` guards that by distinguishing undefined ("the
 * registration has not loaded — do not touch the text") from a loaded row.
 * The call site coerced the first onto `null`, so a toggle pressed before GET
 * /registration landed — or after it failed — sent explicit nulls for all five
 * text columns and wiped the correspondent and Declaration of Conformity facts
 * from the org's registration. The four prerequisite buttons are live on the
 * first painted frame, so that click is one an ordinary user makes.
 */
describe('EstarFilingPanel — a toggle before the registration lands', () => {
  const TEXT_KEYS = [
    'correspondentCompanyName',
    'correspondentContactEmail',
    'correspondentTelephone',
    'declarationCompanyName',
    'declarationCompanyAddress',
  ];

  /** Reads answer as given; the PUT always succeeds. */
  function mockReads(read: (url: string) => Promise<Response>) {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL, init?: { method?: string }) => {
        if (init?.method === 'PUT') return okJson({});
        return read(String(input));
      }),
    );
  }

  it('omits the five text keys while the registration has not loaded', async () => {
    mockReads((url) => {
      if (url.includes('/registration')) return new Promise<Response>(() => {}); // never resolves
      if (url.includes('/catalog')) return okJson({ catalog: [] });
      return okJson({ submissions: [] });
    });
    render(<EstarFilingPanel />);
    expect(screen.getAllByText('Mark held').length).toBe(4);
    fireEvent.click(screen.getAllByText('Mark held')[0]);
    await waitFor(() => expect(sentPut()).not.toBeNull());
    const body = sentPut() as Record<string, unknown>;
    /*
     * ONLY the prerequisite the operator actually clicked. This used to send all
     * four — the clicked one true and the other three FALSE — because
     * `new Set(satisfied ?? [])` read "not loaded" as "none satisfied". An
     * organization that had recorded its FDA ESG account, CDRH Portal account,
     * DUNS/FEI identity and MDUFA fee account lost every one of them to a click
     * on a fifth thing, over a read they never saw fail. A prerequisite we have
     * not read is not an unmet one; the other three are omitted, and the PUT
     * leaves an absent field untouched.
     */
    expect(body).toEqual({ fdaEsgAccount: true });
    for (const key of TEXT_KEYS) expect(Object.hasOwn(body, key)).toBe(false);
  });

  it('omits them after the registration read FAILED, too — a failure is not "no values"', async () => {
    mockReads((url) => {
      if (url.includes('/registration')) {
        return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('boom') } as Response);
      }
      if (url.includes('/catalog')) return okJson({ catalog: [] });
      return okJson({ submissions: [] });
    });
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getAllByText('Mark held').length).toBe(4));
    fireEvent.click(screen.getAllByText('Mark held')[1]);
    await waitFor(() => expect(sentPut()).not.toBeNull());
    const body = sentPut() as Record<string, unknown>;
    for (const key of TEXT_KEYS) expect(Object.hasOwn(body, key)).toBe(false);
    // And the same rule for the booleans: a FAILED read tells us nothing about
    // the other three, so the click asserts one prerequisite and no more.
    expect(body).toEqual({ cdrhPortalAccount: true });
  });

  /*
   * The case the audit found, which is worse than the toggle: the operator is
   * not touching the prerequisites at all. They fill in the correspondent block
   * and press Save, and `correspondentPatch` sent all four booleans from the
   * same `satisfied ?? []`. A failed registration read therefore turned a save
   * about a correspondent email into a silent wipe of the four FDA
   * prerequisites — the ESG account, the CDRH Portal account, the DUNS/FEI
   * identity and the MDUFA fee account.
   */
  it('saving the correspondent block after a FAILED read writes no prerequisite at all', async () => {
    mockReads((url) => {
      if (url.includes('/registration')) {
        return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('boom') } as Response);
      }
      if (url.includes('/catalog')) return okJson({ catalog: [] });
      return okJson({ submissions: [] });
    });
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getByLabelText('Correspondent company name')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Correspondent company name'), {
      target: { value: 'Acme Regulatory Ltd' },
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(sentPut()).not.toBeNull());

    const body = sentPut() as Record<string, unknown>;
    // The text the operator typed, and nothing else.
    expect(body.correspondentCompanyName).toBe('Acme Regulatory Ltd');
    for (const p of ['fdaEsgAccount', 'cdrhPortalAccount', 'organizationIdentity', 'mdufaFeeAccount']) {
      expect(Object.hasOwn(body, p), `${p} must not be asserted from an unread registration`).toBe(false);
    }
  });

  it('includes them once the registration HAS loaded, at their stored values', async () => {
    mockReads((url) => {
      if (url.includes('/registration')) {
        return okJson({
          registered: true,
          registration: REGISTRATION,
          clientRegistration: { clientId: 'o1', satisfied: ['fda_esg_account'] },
        });
      }
      if (url.includes('/catalog')) return okJson({ catalog: [] });
      return okJson({ submissions: [] });
    });
    render(<EstarFilingPanel />);
    await waitFor(() =>
      expect((screen.getByLabelText('Correspondent company name') as HTMLInputElement).value).toBe(
        'Acme Regulatory Ltd',
      ),
    );
    fireEvent.click(screen.getAllByText('Mark held')[0]);
    await waitFor(() => expect(sentPut()).not.toBeNull());
    const body = sentPut() as Record<string, unknown>;
    for (const key of TEXT_KEYS) expect(Object.hasOwn(body, key)).toBe(true);
    expect(body).toMatchObject({
      correspondentCompanyName: 'Acme Regulatory Ltd',
      correspondentContactEmail: 'ra@acme.example',
      correspondentTelephone: '+1 555 0100',
      declarationCompanyName: 'Declaring Entity GmbH',
      declarationCompanyAddress: '1 Main St, Springfield',
    });
  });
});

/**
 * A prerequisite toggle writes and then RE-READS the registration, and every
 * read hands the correspondent block a new row object. Re-seeding the form from
 * it threw away whatever the user had typed and not yet saved — with no
 * message, and on fields the official eSTAR files. An unsaved edit now stands
 * until its own Save replaces it; a form nobody has typed into still follows
 * the row.
 */
describe('EstarFilingPanel — an unsaved correspondent edit survives a toggle', () => {
  /** The registration read answers with the stored row; once the toggle's PUT
   *  has gone out it answers with the toggled prerequisite AND a correspondent
   *  company name changed elsewhere, so a test can wait for the re-read to LAND
   *  rather than merely to be issued. */
  function mockRereadAfterToggle() {
    let toggled = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL, init?: { method?: string }) => {
        const url = String(input);
        if (init?.method === 'PUT') {
          toggled = true;
          return okJson({});
        }
        if (url.includes('/registration')) {
          return okJson({
            registered: true,
            registration: {
              ...REGISTRATION,
              correspondentCompanyName: toggled ? 'Acme Regulatory GmbH' : REGISTRATION.correspondentCompanyName,
            },
            clientRegistration: {
              clientId: 'o1',
              satisfied: toggled ? ['fda_esg_account', 'cdrh_portal_account'] : ['fda_esg_account'],
            },
          });
        }
        if (url.includes('/catalog')) return okJson({ catalog: [] });
        return okJson({ submissions: [] });
      }),
    );
  }

  const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

  it('keeps a typed Declaration of Conformity company name when a prerequisite is toggled', async () => {
    mockRereadAfterToggle();
    render(<EstarFilingPanel />);
    await waitFor(() => expect(field('Declaration of Conformity company name').value).toBe('Declaring Entity GmbH'));
    fireEvent.change(field('Declaration of Conformity company name'), {
      target: { value: 'Second Entity GmbH' },
    });
    fireEvent.click(screen.getAllByText('Mark held')[0]);
    /* The re-read has LANDED once the panel counts the toggled prerequisite. */
    await waitFor(() => expect(screen.getByText(/2\/4 FDA prerequisites held/)).toBeTruthy());
    expect(field('Declaration of Conformity company name').value).toBe('Second Entity GmbH');
    /* And the way to persist it is still open. */
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('still follows the row when nobody has typed into the form', async () => {
    mockRereadAfterToggle();
    render(<EstarFilingPanel />);
    await waitFor(() => expect(field('Correspondent company name').value).toBe('Acme Regulatory Ltd'));
    fireEvent.click(screen.getAllByText('Mark held')[0]);
    await waitFor(() => expect(screen.getByText(/2\/4 FDA prerequisites held/)).toBeTruthy());
    /* Nothing was being edited, so the re-read's value shows. */
    await waitFor(() => expect(field('Correspondent company name').value).toBe('Acme Regulatory GmbH'));
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
  });
});

/**
 * PUT /registration is editor-only on the server. Its refusal used to reach the
 * operator as the same sentence a malformed value gets — "the server rejected
 * the update" — which sends a read-only member looking for a bad character in
 * a correspondent email their role cannot write at all. The block now reports
 * the refusal the server actually gave. The role rule stays on the server: this
 * surface reads a status code, it does not re-derive who may write.
 */
describe('EstarFilingPanel — a refused correspondent save says which refusal it was', () => {
  async function attemptSave(respond: () => Promise<Response>) {
    mockRegisteredOrg();
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getByDisplayValue('Acme Regulatory Ltd')).toBeTruthy());
    fireEvent.change(screen.getByDisplayValue('Acme Regulatory Ltd'), {
      target: { value: 'Acme Regulatory Limited' },
    });
    mockFetch(respond);
    fireEvent.click(screen.getByText('Save'));
  }

  const refused = (status: number) =>
    Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) } as Response);

  it('403 names the role, so a viewer is not sent hunting for a bad value', async () => {
    await attemptSave(() => refused(403));
    await waitFor(() =>
      expect(screen.getByText('Not saved — your role cannot change these values.')).toBeTruthy(),
    );
  });

  it('400 is the one case that really is the update being rejected', async () => {
    await attemptSave(() => refused(400));
    await waitFor(() =>
      expect(screen.getByText('Not saved — the server rejected the update.')).toBeTruthy(),
    );
  });

  it('a request that reached no verdict says so, and says nothing changed', async () => {
    await attemptSave(() => Promise.reject(new Error('network down')));
    await waitFor(() =>
      expect(
        screen.getByText('Not saved — the server did not answer. Nothing was changed.'),
      ).toBeTruthy(),
    );
  });
});
