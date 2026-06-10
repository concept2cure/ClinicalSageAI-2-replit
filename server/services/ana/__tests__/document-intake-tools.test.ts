/**
 * Smoke tests for the uploaded-document intake tools:
 *   - inspect_uploaded_document
 *   - read_uploaded_document
 *   - ocr_document_pages
 *   - read_spreadsheet
 *   - edit_spreadsheet
 *
 * These verify the wiring (registration, schema exposure, and structured
 * JSON errors on bad input) without a DB or filesystem — the file-loading
 * path short-circuits on a missing file_id before any pool import.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const INTAKE_TOOLS = [
  'inspect_uploaded_document',
  'read_uploaded_document',
  'ocr_document_pages',
  'read_spreadsheet',
  'edit_spreadsheet',
] as const;

describe('document intake tools — registration', () => {
  for (const name of INTAKE_TOOLS) {
    it(`registers a handler for ${name}`, () => {
      const handler = getToolHandler(name);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it(`exposes ${name} to AnA in ALL_ANA_TOOLS with a schema requiring file_id`, () => {
      const def = ALL_ANA_TOOLS.find((t) => t.name === name);
      expect(def).toBeDefined();
      expect(def!.description.length).toBeGreaterThan(50);
      expect(def!.input_schema.required).toContain('file_id');
    });
  }
});

describe('document intake tools — input validation (no DB needed)', () => {
  for (const name of INTAKE_TOOLS) {
    it(`${name} returns a structured error when file_id is missing`, async () => {
      const handler = getToolHandler(name)!;
      const result = JSON.parse(await handler({}, { organizationId: 1 }));
      expect(result.error).toMatch(/file_id/);
    });
  }
});
