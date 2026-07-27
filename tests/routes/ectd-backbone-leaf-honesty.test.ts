/**
 * eCTD backbone — what the platform is entitled to claim.
 *
 * The compiler produces XML over `project_sections.content`. Nothing in that
 * route, or anywhere it calls, renders a PDF. Every document in the backbone
 * nevertheless declared:
 *
 *   <ectd:file-path>m3/3/2/p/drug-product.pdf</ectd:file-path>
 *   <ectd:checksum algorithm="md5">pending</ectd:checksum>
 *
 * — a leaf file that was never written, verified against a hash that was never
 * computed. And whenever content validation passed, the response said
 * `submissionReady: true`, which the surface renders as the words
 * "Submission-ready" beside a download button.
 *
 * These tests drive the real handlers against a mocked pool and assert on the
 * artifact and the response, because the artifact and the response are what a
 * reviewer and a regulatory user actually act on.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { createMockRequest, createMockResponse } from '../setup';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../../server/db', () => ({ pool: { query: mockQuery } }));

import ectdCompileRoutes from '../../server/routes/ectd-compile';

function getHandler(path: string, method: 'post' | 'get' = 'post') {
  const layer = ectdCompileRoutes.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const ORG = 77;
// Over 50 characters: `EMPTY_LOCKED_SECTION` raises a blocking error for any
// approved section with less, and the readiness cases need content validation to
// pass cleanly so that "clean content, still not submittable" is testable.
const CONTENT =
  'Drug product composition per protocol §5. Excipients and their function are described in Table 3.2.P.1-1.\n';

/** One approved M3 section carrying real content. */
function section(over: Record<string, unknown> = {}) {
  return {
    section_code: '3.2.P.1',
    title: 'Description and Composition',
    status: 'approved',
    content: CONTENT,
    word_count: 2500,
    assigned_to: null,
    module: 'm3',
    required: true,
    updated_at: '2026-07-20T00:00:00Z',
    ...over,
  };
}

function req(body: Record<string, unknown> = {}) {
  const r = createMockRequest({ params: { projectId: '42' }, body });
  (r as any).tenantId = ORG;
  return r;
}

/** Every pool.query in the compile path: sections read, then the audit insert. */
function mockSections(rows: unknown[]) {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (/FROM project_sections/i.test(sql)) return { rows, rowCount: rows.length };
    return { rows: [], rowCount: 0 };
  });
}

/**
 * Every section the FDA rule set requires, approved, with enough content that no
 * blocking rule fires. Needed so "content validation passed but the package is
 * still not submittable" can be tested as a distinct state — the point of the
 * change is that those two are no longer the same answer.
 */
const REQUIRED_CODES = [
  '1.1', '1.2', '1.3.1', '1.3.3', '1.3.4', '1.14.4.2', '1.20',
  '2.2', '2.3', '2.4', '2.5', '2.6.2', '2.6.4', '2.6.6', '2.7.1',
  '3.2.S', '3.2.P', '3.2.R',
  '4.2.1', '4.2.2', '4.2.3',
  '5.2', '5.3.5.1',
];

function cleanPackage(): unknown[] {
  return REQUIRED_CODES.map((code) =>
    section({ section_code: code, title: `Section ${code}`, word_count: 5000 }),
  );
}

async function compile(rows: unknown[] = [section()]) {
  mockSections(rows);
  const res = createMockResponse();
  await getHandler('/:projectId/compile')(req({ submissionType: 'original', region: 'FDA' }), res);
  return (res.json as any).mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the backbone makes no claim about files it did not write', () => {
  it('emits no leaf-file checksum at all', async () => {
    const { xmlBackbone } = await compile();
    // `pending` is not a checksum. It is the absence of one, wearing the element
    // a regulator reads as the leaf's integrity anchor.
    expect(xmlBackbone).not.toMatch(/pending/);
    expect(xmlBackbone).not.toMatch(/<ectd:checksum/);
  });

  it('declares no leaf path, because no leaf file is rendered', async () => {
    const { xmlBackbone } = await compile();
    // Declaring the path is the same fabrication as declaring the checksum: it
    // names a file that does not exist.
    expect(xmlBackbone).not.toMatch(/<ectd:file-path>/);
    expect(xmlBackbone).not.toMatch(/\.pdf/);
    expect(xmlBackbone).toMatch(/<ectd:leaf rendered="false">/);
  });

  it('marks the envelope as a draft backbone, not a sequence', async () => {
    const { xmlBackbone } = await compile();
    expect(xmlBackbone).toMatch(/<ectd:package-state>draft-backbone<\/ectd:package-state>/);
    expect(xmlBackbone).toMatch(/NOT A TRANSMISSIBLE SEQUENCE/);
  });

  it('counts sections with content, never files on disk', async () => {
    const { xmlBackbone } = await compile([section(), section({ section_code: '3.2.P.2' })]);
    expect(xmlBackbone).not.toMatch(/<ectd:total-files>/);
    expect(xmlBackbone).toMatch(/<ectd:sections-with-content>2<\/ectd:sections-with-content>/);
    expect(xmlBackbone).toMatch(/<ectd:rendered-leaf-files>0<\/ectd:rendered-leaf-files>/);
  });
});

describe('the content hash it does publish is real', () => {
  it('is the sha256 of the exact stored content', async () => {
    // The whole value of publishing a hash is that anyone holding the same bytes
    // reproduces it. So it is checked against an independently computed digest,
    // not against whatever the route happened to emit.
    const expected = createHash('sha256').update(CONTENT, 'utf8').digest('hex');
    const { xmlBackbone } = await compile();
    expect(xmlBackbone).toContain(`<ectd:content-sha256>${expected}</ectd:content-sha256>`);
  });

  it('changes when the content changes', async () => {
    const first = await compile([section()]);
    const second = await compile([section({ content: CONTENT + 'Revised.\n' })]);
    const hash = (xml: string) => xml.match(/<ectd:content-sha256>([a-f0-9]{64})</)?.[1];
    expect(hash(first.xmlBackbone)).toBeTruthy();
    expect(hash(second.xmlBackbone)).toBeTruthy();
    expect(hash(first.xmlBackbone)).not.toBe(hash(second.xmlBackbone));
  });

  it('publishes nothing rather than a hash of nothing', async () => {
    // A section with no content produces no document entry, so no hash — as
    // opposed to hashing the empty string and publishing that as identity.
    const { xmlBackbone } = await compile([section({ content: '' })]);
    expect(xmlBackbone).not.toMatch(/<ectd:content-sha256>/);
  });
});

describe('submission readiness', () => {
  it('is false while no leaf files exist, even with clean content', async () => {
    // Every required section present, approved and long enough: content
    // validation raises nothing. Under the old rule that alone produced
    // submissionReady: true.
    const result = await compile(cleanPackage());
    expect(result.contentValidationPassed).toBe(true);
    expect(result.submissionReady).toBe(false);
  });

  it('says why, rather than leaving the user to infer it', async () => {
    const result = await compile(cleanPackage());
    expect(result.submissionBlockers.join(' ')).toMatch(/does not yet produce the PDF leaf files/);
    expect(result.leafFilesRendered).toBe(0);
  });

  it('still reports the backbone compile as completed', async () => {
    // The backbone DID compile and the caller can download it. Conflating that
    // with submittability in either direction is the error being corrected.
    const result = await compile(cleanPackage());
    expect(result.status).toBe('completed');
    expect(result.xmlBackbone).toBeTruthy();
  });

  it('lists content errors alongside the packaging blocker', async () => {
    // A project missing FDA forms has both problems, and both should be named.
    const result = await compile([section({ status: 'draft', word_count: 10 })]);
    const blockers = result.submissionBlockers.join(' ');
    expect(blockers).toMatch(/blocking content/);
    expect(blockers).toMatch(/leaf files/);
  });

  it('applies the same rule to the readiness endpoint', async () => {
    // Two endpoints answer this question. Fixing one would leave the readiness
    // chip claiming ready while the compile panel said otherwise.
    mockSections(cleanPackage());
    const res = createMockResponse();
    await getHandler('/:projectId/status', 'get')(req(), res);
    const body = (res.json as any).mock.calls[0][0];

    expect(body.submissionReady).toBe(false);
    expect(body.submissionBlockers.join(' ')).toMatch(/leaf files/);
    // The completeness signal is kept — it is real, it just is not readiness.
    expect(body).toHaveProperty('contentComplete');
    expect(body).toHaveProperty('overallReadiness');
  });
});
