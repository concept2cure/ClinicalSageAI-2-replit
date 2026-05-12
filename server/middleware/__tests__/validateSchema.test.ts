import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadSchema, validateSchema, _clearSchemaCacheForTests } from '../validateSchema';

const SCHEMA_DIR = path.resolve('client/src/schemas');
const FIXTURE_NAME = '__test_validateSchema_fixture__';
const FIXTURE_PATH = path.join(SCHEMA_DIR, `${FIXTURE_NAME}.json`);

function writeFixture(contents: string) {
  fs.mkdirSync(SCHEMA_DIR, { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, contents, 'utf8');
}

beforeEach(() => {
  _clearSchemaCacheForTests();
});

afterEach(() => {
  if (fs.existsSync(FIXTURE_PATH)) fs.unlinkSync(FIXTURE_PATH);
  _clearSchemaCacheForTests();
});

describe('loadSchema — path safety', () => {
  it('rejects schema names with path traversal characters', () => {
    expect(() => loadSchema('../../etc/passwd')).toThrow(/Invalid schema name/);
    expect(() => loadSchema('a/b')).toThrow(/Invalid schema name/);
    expect(() => loadSchema('.. ')).toThrow(/Invalid schema name/);
  });

  it('rejects empty schema names', () => {
    expect(() => loadSchema('')).toThrow(/Invalid schema name/);
  });

  it('loads a valid schema and serves subsequent calls from cache', () => {
    writeFixture(JSON.stringify({ required: ['name'], properties: { name: { type: 'string' } } }));
    const schema1 = loadSchema(FIXTURE_NAME);
    // Delete file: a second call must still succeed because of caching.
    fs.unlinkSync(FIXTURE_PATH);
    const schema2 = loadSchema(FIXTURE_NAME);
    expect(schema1).toBe(schema2);
  });
});

describe('validateSchema middleware', () => {
  function makeReqRes(body: any) {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return { req: { body } as any, res };
  }

  it('returns 500 with a generic code when the schema cannot be loaded', () => {
    const mw = validateSchema('__definitely_missing_schema__');
    const { req, res } = makeReqRes({ name: 'x' });
    const next = vi.fn();
    mw(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('SCHEMA_UNAVAILABLE');
    // Should not leak the underlying filesystem error message.
    expect(JSON.stringify(body)).not.toMatch(/ENOENT|client\/src\/schemas/);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes when the body satisfies the schema', () => {
    writeFixture(JSON.stringify({ required: ['name'], properties: { name: { type: 'string' } } }));
    const mw = validateSchema(FIXTURE_NAME);
    const { req, res } = makeReqRes({ name: 'ok' });
    const next = vi.fn();
    mw(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 with structured errors when the body is invalid', () => {
    writeFixture(JSON.stringify({ required: ['name'], properties: { name: { type: 'string' } } }));
    const mw = validateSchema(FIXTURE_NAME);
    const { req, res } = makeReqRes({});
    const next = vi.fn();
    mw(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('Validation failed');
    expect(body.details[0]).toEqual(expect.objectContaining({ field: 'name' }));
    expect(next).not.toHaveBeenCalled();
  });
});
