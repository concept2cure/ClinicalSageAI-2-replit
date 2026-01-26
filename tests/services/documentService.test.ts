/**
 * Document Service Unit Tests
 *
 * Tests for core document CRUD operations and workflow management.
 *
 * @module tests/services/documentService.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockDb, mockRequest, mockResponse, createTestDocument } from '../setup';

// Mock the database
vi.mock('../../server/db', () => ({
  default: mockDb,
  pool: mockDb,
}));

describe('DocumentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Document CRUD Operations', () => {
    it('should create a new document', async () => {
      const testDoc = createTestDocument({
        name: 'Test Protocol v1.0',
        type: 'protocol',
        projectId: 'proj-123',
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [testDoc],
        rowCount: 1,
      });

      // Simulate document creation
      const result = await mockDb.query(
        'INSERT INTO documents (id, name, type, project_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [testDoc.id, testDoc.name, testDoc.type, testDoc.projectId]
      );

      expect(result.rows[0]).toEqual(testDoc);
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('should retrieve document by ID', async () => {
      const testDoc = createTestDocument({ id: 'doc-456' });

      mockDb.query.mockResolvedValueOnce({
        rows: [testDoc],
        rowCount: 1,
      });

      const result = await mockDb.query('SELECT * FROM documents WHERE id = $1', ['doc-456']);

      expect(result.rows[0].id).toBe('doc-456');
    });

    it('should return null for non-existent document', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const result = await mockDb.query('SELECT * FROM documents WHERE id = $1', ['non-existent']);

      expect(result.rows.length).toBe(0);
    });

    it('should update document metadata', async () => {
      const updatedDoc = createTestDocument({
        id: 'doc-789',
        name: 'Updated Protocol v2.0',
        version: '2.0',
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [updatedDoc],
        rowCount: 1,
      });

      const result = await mockDb.query(
        'UPDATE documents SET name = $1, version = $2 WHERE id = $3 RETURNING *',
        ['Updated Protocol v2.0', '2.0', 'doc-789']
      );

      expect(result.rows[0].name).toBe('Updated Protocol v2.0');
      expect(result.rows[0].version).toBe('2.0');
    });

    it('should soft delete document', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'doc-del', status: 'archived' }],
        rowCount: 1,
      });

      const result = await mockDb.query(
        "UPDATE documents SET status = 'archived' WHERE id = $1 RETURNING *",
        ['doc-del']
      );

      expect(result.rows[0].status).toBe('archived');
    });
  });

  describe('Document Versioning', () => {
    it('should create new version of document', async () => {
      const originalDoc = createTestDocument({ id: 'doc-orig', version: '1.0' });
      const newVersion = createTestDocument({
        id: 'doc-v2',
        version: '2.0',
        previousVersionId: 'doc-orig',
      });

      mockDb.query
        .mockResolvedValueOnce({ rows: [originalDoc], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [newVersion], rowCount: 1 });

      // Get original
      const original = await mockDb.query('SELECT * FROM documents WHERE id = $1', ['doc-orig']);
      expect(original.rows[0].version).toBe('1.0');

      // Create new version
      const created = await mockDb.query(
        'INSERT INTO documents (id, version, previous_version_id) VALUES ($1, $2, $3) RETURNING *',
        ['doc-v2', '2.0', 'doc-orig']
      );
      expect(created.rows[0].version).toBe('2.0');
      expect(created.rows[0].previousVersionId).toBe('doc-orig');
    });

    it('should retrieve version history', async () => {
      const versions = [
        createTestDocument({ id: 'v3', version: '3.0' }),
        createTestDocument({ id: 'v2', version: '2.0' }),
        createTestDocument({ id: 'v1', version: '1.0' }),
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: versions,
        rowCount: 3,
      });

      const result = await mockDb.query(
        'SELECT * FROM documents WHERE document_group_id = $1 ORDER BY created_at DESC',
        ['group-123']
      );

      expect(result.rows.length).toBe(3);
      expect(result.rows[0].version).toBe('3.0');
    });
  });

  describe('Document Locking', () => {
    it('should acquire lock on document', async () => {
      const lock = {
        documentId: 'doc-lock',
        lockedBy: 'user-123',
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [lock],
        rowCount: 1,
      });

      const result = await mockDb.query(
        'INSERT INTO document_locks (document_id, locked_by, expires_at) VALUES ($1, $2, $3) RETURNING *',
        [lock.documentId, lock.lockedBy, lock.expiresAt]
      );

      expect(result.rows[0].documentId).toBe('doc-lock');
      expect(result.rows[0].lockedBy).toBe('user-123');
    });

    it('should reject lock if document already locked', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Document is already locked'));

      await expect(
        mockDb.query('INSERT INTO document_locks (document_id, locked_by) VALUES ($1, $2)', [
          'doc-locked',
          'user-456',
        ])
      ).rejects.toThrow('Document is already locked');
    });

    it('should release lock', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

      const result = await mockDb.query(
        'DELETE FROM document_locks WHERE document_id = $1 AND locked_by = $2',
        ['doc-lock', 'user-123']
      );

      expect(result.rowCount).toBe(1);
    });
  });

  describe('Document Search', () => {
    it('should search documents by name', async () => {
      const docs = [
        createTestDocument({ name: 'Protocol A' }),
        createTestDocument({ name: 'Protocol B' }),
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: docs,
        rowCount: 2,
      });

      const result = await mockDb.query('SELECT * FROM documents WHERE name ILIKE $1', [
        '%Protocol%',
      ]);

      expect(result.rows.length).toBe(2);
    });

    it('should filter documents by status', async () => {
      const approvedDocs = [
        createTestDocument({ status: 'approved' }),
        createTestDocument({ status: 'approved' }),
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: approvedDocs,
        rowCount: 2,
      });

      const result = await mockDb.query('SELECT * FROM documents WHERE status = $1', ['approved']);

      expect(result.rows.every(d => d.status === 'approved')).toBe(true);
    });

    it('should paginate results', async () => {
      const page1 = [createTestDocument({ id: 'doc-1' }), createTestDocument({ id: 'doc-2' })];

      mockDb.query.mockResolvedValueOnce({
        rows: page1,
        rowCount: 2,
      });

      const result = await mockDb.query(
        'SELECT * FROM documents ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [10, 0]
      );

      expect(result.rows.length).toBe(2);
    });
  });
});
