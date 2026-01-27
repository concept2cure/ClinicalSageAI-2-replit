/**
 * @file VaultDMSService.test.ts
 * Unit tests for VaultDMSService
 */

import { describe, it, expect, vi } from 'vitest';
const VaultDMSService = require('../server/services/VaultDMSService.js').default;

describe('VaultDMSService', () => {
  describe('createDocument', () => {
    it('should create a document with correct parameters and return the created document', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: 1,
              organization_id: 'tenant1',
              title: 'Test Doc',
              type: 'IND',
              date: '2025-01-01',
              status: 'Draft',
              file_path: '/uploads/tenant1/123-test.pdf',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          ],
        }),
      };

      const mockStorage = {};
      const service = new VaultDMSService(mockDb, mockStorage);

      const documentData = {
        title: 'Test Doc',
        type: 'IND',
        status: 'Draft',
        date: '2025-01-01',
        userId: 'user1',
      };
      const file = { originalname: 'test.pdf' };

      const result = await service.createDocument('tenant1', documentData, file);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, values] = mockDb.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO vault_documents');
      expect(values[0]).toBe('tenant1');
      expect(values[1]).toBe('Test Doc');
      expect(values[2]).toBe('IND');
      expect(values[3]).toBe('2025-01-01');
      expect(values[4]).toBe('Draft');
      expect(values[5]).toContain('/uploads/tenant1/');
      expect(result.id).toBe(1);
      expect(result.title).toBe('Test Doc');
    });
  });

  describe('listDocuments', () => {
    it('should return documents for a tenant', async () => {
      const sampleDocs = [
        {
          id: 1,
          organization_id: 'tenant1',
          title: 'Doc1',
          type: 'IND',
          date: '2025-01-01',
          status: 'Draft',
          file_path: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-02T00:00:00Z',
        },
        {
          id: 2,
          organization_id: 'tenant1',
          title: 'Doc2',
          type: 'NDA',
          date: '2025-01-03',
          status: 'Final',
          file_path: null,
          created_at: '2025-01-03T00:00:00Z',
          updated_at: '2025-01-04T00:00:00Z',
        },
      ];
      const mockDb = {
        query: vi.fn().mockResolvedValue({ rows: sampleDocs }),
      };
      const service = new VaultDMSService(mockDb, {});
      const result = await service.listDocuments('tenant1');
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toContain('FROM vault_documents');
      expect(params).toEqual(['tenant1']);
      expect(result).toEqual(sampleDocs);
    });
  });
});
