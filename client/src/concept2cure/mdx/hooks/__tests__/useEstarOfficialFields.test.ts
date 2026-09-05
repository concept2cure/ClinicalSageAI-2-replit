/**
 * @vitest-environment jsdom
 */
/**
 * useEstarOfficialFields — the "what will be written" preview contract.
 *
 * The url builder is the query contract; a 200 maps the documented shape
 * through untouched; a 404 (not in this org) and a 422 (field map not
 * populated) MUST surface as `error` with `fields` null — never as an empty
 * field list, which would read as "the template carries nothing". The
 * provenance-to-words map is pinned so a store or column name never reaches
 * the screen.
 *
 * The error sentence is pinned too, and for a reason: useFetchJson throws
 * `HTTP <status>: <raw body>`, and ErrorState's internals filter redacts any
 * message that BEGINS with a transport status to ''. Passing the raw string
 * through meant the user saw a bare title and a retry that could never
 * succeed on a 404 or 422. The hook now derives a human sentence and an
 * `errorKind` so the surface can decide whether retry is honest.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { redactInternals } from '@/lib/queryClient';
import {
  describeOfficialFieldsError,
  notSetWords,
  officialFieldsUrl,
  sourceWords,
  useEstarOfficialFields,
  NO_SOURCE_WORDS,
  REQUEST_SOURCE_WORDS,
} from '../useEstarOfficialFields';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const VIEW = {
  descriptorId: '510k-device',
  type: '510k',
  variant: 'device',
  mappedCount: 3,
  sourcedCount: 2,
  fields: [
    {
      key: 'deviceTradeName',
      caption: 'Device Trade Name',
      xfaSomPath: 'form1.p1.trade',
      value: 'BX-204 CGM',
      source: 'regulatory_programs.product_name',
      declaredSource: 'regulatory_programs.product_name',
    },
    {
      key: 'applicantCompanyName',
      caption: 'Applicant Company',
      xfaSomPath: 'form1.p1.applicant',
      value: 'Acme Devices',
      source: 'client_workspaces.name',
      declaredSource: 'client_workspaces.name',
    },
    {
      key: 'deviceCommonName',
      caption: 'Common Name',
      xfaSomPath: null,
      value: null,
      source: null,
      declaredSource: 'regulatory_programs.common_name',
    },
  ],
};

const NOT_FOUND = 'This program was not found in your organization';
const NOT_PRODUCIBLE =
  'The field map for this template is not populated, so there is nothing to preview';
const FAILED = 'The field list could not be loaded';

describe('officialFieldsUrl (pure)', () => {
  it('is null without an ident — the fetch stays idle', () => {
    expect(officialFieldsUrl(null, '510k', 'device')).toBeNull();
    expect(officialFieldsUrl('', '510k', 'ivd')).toBeNull();
  });

  it('carries ident, type and variant, encoded', () => {
    expect(officialFieldsUrl('a b/c', '510k', 'ivd')).toBe(
      '/api/510k/estar/official-fields?ident=a+b%2Fc&type=510k&variant=ivd',
    );
  });

  it('carries every marketing pathway the server accepts', () => {
    expect(officialFieldsUrl('bx204', 'de_novo', 'device')).toBe(
      '/api/510k/estar/official-fields?ident=bx204&type=de_novo&variant=device',
    );
    expect(officialFieldsUrl('bx204', 'pma', 'ivd')).toBe(
      '/api/510k/estar/official-fields?ident=bx204&type=pma&variant=ivd',
    );
  });
});

describe('sourceWords (pure) — provenance in plain words', () => {
  /* Every provenance string the server's ESTAR_ADMINISTRATIVE_SOURCES table
     can emit (server/services/pathway-engines/estar/estar-administrative-data.ts),
     pinned one by one. A new source that reaches the screen raw is a finding. */
  const EMITTED: Array<[string, string]> = [
    ['regulatory_programs.product_name', 'Device profile · product name'],
    ['regulatory_programs.product_code', 'Device profile · product code'],
    [
      'regulatory_programs.predicate_devices[0].kNumber',
      'Device profile · first predicate · K-number',
    ],
    ['regulatory_programs.predicate_devices[0].name', 'Device profile · first predicate · name'],
    ['fda_510k_projects.device_name', '510(k) project · device name'],
    ['fda_510k_projects.regulation_number', '510(k) project · regulation number'],
    ['fda_510k_projects.product_code', '510(k) project · product code'],
    ['client_workspaces.name', 'Client workspace · name'],
    ['client_workspaces.contact_email', 'Client workspace · contact email'],
    ['client_workspaces.contact_phone', 'Client workspace · contact phone'],
    ['organizations.name', 'Organization · name'],
    /* Phase 3 — every key has a governed home. */
    ['regulatory_programs.common_name', 'Device profile · common name'],
    ['regulatory_programs.classification_name', 'Device profile · classification name'],
    ['regulatory_programs.regulation_number', 'Device profile · regulation number'],
    ['regulatory_programs.associated_product_codes', 'Device profile · associated product codes'],
    [
      'regulatory_programs.indications_for_use_citation',
      'Device profile · indications for use citation',
    ],
    [
      'estar_registrations.correspondent_company_name',
      'eSTAR registration · correspondent company name',
    ],
    [
      'estar_registrations.correspondent_contact_email',
      'eSTAR registration · correspondent contact email',
    ],
    ['estar_registrations.correspondent_telephone', 'eSTAR registration · correspondent telephone'],
    [
      'estar_registrations.declaration_company_address',
      'eSTAR registration · declaration company address',
    ],
    ['request', REQUEST_SOURCE_WORDS],
  ];

  it.each(EMITTED)('%s → %s', (source, words) => {
    expect(sourceWords(source)).toBe(words);
  });

  it('names the absence of a source', () => {
    expect(sourceWords(null)).toBe(NO_SOURCE_WORDS);
    expect(sourceWords(undefined)).toBe(NO_SOURCE_WORDS);
    expect(sourceWords('')).toBe(NO_SOURCE_WORDS);
  });

  it('never lets a store or column name through raw — including an unknown store', () => {
    for (const s of [...EMITTED.map(([source]) => source), 'some_new_store.some_column']) {
      const words = sourceWords(s);
      expect(words).not.toMatch(/_/);
      expect(words).not.toMatch(/\[0\]/);
      expect(words).not.toMatch(
        /regulatory_programs|fda_510k_projects|client_workspaces|organizations\.|estar_registrations/,
      );
    }
  });
});

describe('notSetWords (pure) — where the durable home is', () => {
  it('names the declared home in the same words as a sourced value', () => {
    expect(notSetWords('regulatory_programs.common_name')).toBe('Not set — Device profile · common name');
    expect(notSetWords('estar_registrations.correspondent_company_name')).toBe(
      'Not set — eSTAR registration · correspondent company name',
    );
  });

  it('is null when the key has no declared home — the row stays export-only', () => {
    expect(notSetWords(null)).toBeNull();
    expect(notSetWords(undefined)).toBeNull();
    expect(notSetWords('')).toBeNull();
  });
});

describe('describeOfficialFieldsError (pure) — status-aware, human, never the raw transport line', () => {
  it('no message ⇒ no error', () => {
    expect(describeOfficialFieldsError(null)).toEqual({ error: null, errorKind: null });
    expect(describeOfficialFieldsError(undefined)).toEqual({ error: null, errorKind: null });
    expect(describeOfficialFieldsError('')).toEqual({ error: null, errorKind: null });
  });

  it('404 (the route refused the ident org-scoped) ⇒ not-found', () => {
    expect(
      describeOfficialFieldsError('HTTP 404: {"error":"Project not found in your organization"}'),
    ).toEqual({ error: NOT_FOUND, errorKind: 'not-found' });
    expect(describeOfficialFieldsError('HTTP 404')).toEqual({ error: NOT_FOUND, errorKind: 'not-found' });
  });

  it('422 (field map not populated) ⇒ not-producible', () => {
    expect(
      describeOfficialFieldsError(
        'HTTP 422: {"error":"ESTAR_FIELD_MAP_NOT_POPULATED","descriptorId":"510k-ivd","blockers":["field map not populated"]}',
      ),
    ).toEqual({ error: NOT_PRODUCIBLE, errorKind: 'not-producible' });
    expect(describeOfficialFieldsError('HTTP 422')).toEqual({
      error: NOT_PRODUCIBLE,
      errorKind: 'not-producible',
    });
  });

  it('reads the code token from a body cut at 200 characters — never JSON.parse', () => {
    /* useFetchJson slices the body at 200 chars, so the object is usually
       unterminated. The mapper must still recognise the code. */
    const body = JSON.stringify({
      error: 'ESTAR_FIELD_MAP_NOT_POPULATED',
      descriptorId: '510k-ivd',
      blockers: Array.from({ length: 40 }, (_, i) => `blocker number ${i} with some length`),
    });
    const truncated = `HTTP 422: ${body.slice(0, 200)}`;
    expect(truncated.endsWith('}')).toBe(false);
    expect(describeOfficialFieldsError(truncated)).toEqual({
      error: NOT_PRODUCIBLE,
      errorKind: 'not-producible',
    });
  });

  it('anything else — a 500, a proxy page, a network throw — ⇒ failed', () => {
    expect(describeOfficialFieldsError('HTTP 500: <html><body>Bad gateway</body></html>')).toEqual({
      error: FAILED,
      errorKind: 'failed',
    });
    expect(describeOfficialFieldsError('HTTP 503')).toEqual({ error: FAILED, errorKind: 'failed' });
    expect(describeOfficialFieldsError('HTTP 401: {"error":"Unauthorized"}')).toEqual({
      error: FAILED,
      errorKind: 'failed',
    });
    expect(describeOfficialFieldsError('network down')).toEqual({ error: FAILED, errorKind: 'failed' });
    expect(describeOfficialFieldsError('Fetch failed')).toEqual({ error: FAILED, errorKind: 'failed' });
  });

  it('every sentence survives ErrorState’s internals filter unchanged', () => {
    /* The defect: a message beginning `HTTP <status>` is redacted to '' by
       redactInternals, so the panel showed a bare title. The sentences the
       mapper produces must not trip that filter, or any other marker. */
    for (const raw of [
      'HTTP 404: {"error":"Project not found in your organization"}',
      'HTTP 422: {"error":"ESTAR_FIELD_MAP_NOT_POPULATED"}',
      'HTTP 500: relation "estar_registrations" does not exist',
      'network down',
    ]) {
      const { error } = describeOfficialFieldsError(raw);
      expect(error).not.toBeNull();
      expect(redactInternals(error, '')).toBe(error);
      expect(error).not.toMatch(/HTTP|ESTAR_|\/api\//);
    }
  });
});

describe('useEstarOfficialFields', () => {
  it('stays idle with a null ident', () => {
    const { result } = renderHook(() => useEstarOfficialFields(null, '510k', 'device'));
    expect(result.current.fields).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.errorKind).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the type reaches the wire for a De Novo and a PMA read', async () => {
    fetchMock.mockResolvedValue(response({ ...VIEW, type: 'de_novo' }));
    const { result } = renderHook(() => useEstarOfficialFields('bx204', 'de_novo', 'device'));
    await waitFor(() => expect(result.current.fields).not.toBeNull());
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/510k/estar/official-fields?ident=bx204&type=de_novo&variant=device',
    );
    const pma = renderHook(() => useEstarOfficialFields('cv330', 'pma', 'ivd'));
    await waitFor(() => expect(pma.result.current.loading).toBe(false));
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      '/api/510k/estar/official-fields?ident=cv330&type=pma&variant=ivd',
    );
  });

  it('200 maps the field list through with counts', async () => {
    fetchMock.mockResolvedValue(response(VIEW));
    const { result } = renderHook(() => useEstarOfficialFields('bx204', '510k', 'device'));
    await waitFor(() => expect(result.current.fields).not.toBeNull());
    expect(result.current.fields?.mappedCount).toBe(3);
    expect(result.current.fields?.sourcedCount).toBe(2);
    expect(result.current.fields?.fields.map((f) => f.key)).toEqual([
      'deviceTradeName',
      'applicantCompanyName',
      'deviceCommonName',
    ]);
    /* The server sends xfaSomPath as string | null; null passes through as-is. */
    expect(result.current.fields?.fields[2].xfaSomPath).toBeNull();
    /* declaredSource rides through untouched — set on the blank row too. */
    expect(result.current.fields?.fields[2].value).toBeNull();
    expect(result.current.fields?.fields[2].declaredSource).toBe('regulatory_programs.common_name');
    expect(result.current.fields?.fields[0].declaredSource).toBe('regulatory_programs.product_name');
    expect(result.current.error).toBeNull();
    expect(result.current.errorKind).toBeNull();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe('/api/510k/estar/official-fields?ident=bx204&type=510k&variant=device');
  });

  it('404 (not in this org) is a not-found sentence, never an empty field list', async () => {
    fetchMock.mockResolvedValue(
      response({ error: 'Project not found in your organization' }, 404),
    );
    const { result } = renderHook(() => useEstarOfficialFields('nope', '510k', 'device'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.fields).toBeNull();
    expect(result.current.error).toBe(NOT_FOUND);
    expect(result.current.errorKind).toBe('not-found');
  });

  it('422 (field map not populated) is a not-producible sentence, never an empty field list', async () => {
    fetchMock.mockResolvedValue(
      response(
        {
          error: 'ESTAR_FIELD_MAP_NOT_POPULATED',
          descriptorId: '510k-ivd',
          blockers: ['field map not populated'],
        },
        422,
      ),
    );
    const { result } = renderHook(() => useEstarOfficialFields('bx204', '510k', 'ivd'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.fields).toBeNull();
    expect(result.current.error).toBe(NOT_PRODUCIBLE);
    expect(result.current.errorKind).toBe('not-producible');
  });

  it('a network throw is a failed read — retryable, in plain words', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useEstarOfficialFields('bx204', '510k', 'device'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.fields).toBeNull();
    expect(result.current.error).toBe(FAILED);
    expect(result.current.errorKind).toBe('failed');
  });

  it('a 200 that is not a field list is an error, not an empty table', async () => {
    fetchMock.mockResolvedValue(response({ data: [] }));
    const { result } = renderHook(() => useEstarOfficialFields('bx204', '510k', 'device'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.fields).toBeNull();
    expect(result.current.errorKind).toBe('failed');
  });
});
