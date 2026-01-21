/**
 * Supply Chain Storage Interface
 *
 * Enterprise-ready storage interface for pharmaceutical supply chain management
 * Supports GxP compliance, multi-tenant architecture, and 21 CFR Part 11 requirements
 */

import { z } from 'zod';

// ============================================================================
// SUPPLY CHAIN ENTITY TYPES
// ============================================================================

// Supplier Types
export const SupplierSchema = z.object({
  id: z.number(),
  organizationId: z.number(),
  clientWorkspaceId: z.number(),
  supplierCode: z.string(),
  name: z.string(),
  legalName: z.string().optional(),
  supplierType: z.enum(['API', 'Excipient', 'Packaging', 'Testing', 'Contract']),
  qualificationStatus: z.enum(['pending', 'qualified', 'disqualified', 'suspended']),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  qualificationDate: z.string().optional(),
  nextAuditDate: z.string().optional(),
  lastAuditDate: z.string().optional(),
  auditScore: z.number().optional(),
  primaryContact: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  regulatoryLicenses: z.any().optional(),
  certifications: z.any().optional(),
  inspectionHistory: z.any().optional(),
  deviationHistory: z.any().optional(),
  contractStatus: z.string().optional(),
  contractExpiry: z.string().optional(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  qualityScore: z.number().optional(),
  deliveryPerformance: z.number().optional(),
  notes: z.string().optional(),
  metadata: z.any().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateSupplierSchema = SupplierSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Supplier = z.infer<typeof SupplierSchema>;
export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;

// Material Types
export const MaterialSchema = z.object({
  id: z.number(),
  organizationId: z.number(),
  clientWorkspaceId: z.number(),
  materialCode: z.string(),
  name: z.string(),
  description: z.string().optional(),
  materialType: z.enum(['API', 'Excipient', 'PackagingMaterial', 'FinishedProduct']),
  materialCategory: z.string().optional(),
  casNumber: z.string().optional(),
  molecularFormula: z.string().optional(),
  molecularWeight: z.number().optional(),
  regulatoryStatus: z.enum(['approved', 'pending', 'restricted', 'banned']),
  dmeFileNumber: z.string().optional(),
  cepNumber: z.string().optional(),
  storageConditions: z.string().optional(),
  handlingInstructions: z.string().optional(),
  shelfLife: z.number().optional(),
  reorderPoint: z.number().optional(),
  primarySupplierId: z.number().optional(),
  qualityGrade: z.string().optional(),
  specificationVersion: z.string().optional(),
  specifications: z.any().optional(),
  batchSize: z.number().optional(),
  batchSizeUnit: z.string().optional(),
  isControlled: z.boolean().default(false),
  isHazardous: z.boolean().default(false),
  notes: z.string().optional(),
  metadata: z.any().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateMaterialSchema = MaterialSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Material = z.infer<typeof MaterialSchema>;
export type CreateMaterial = z.infer<typeof CreateMaterialSchema>;

// Batch Types
export const BatchSchema = z.object({
  id: z.number(),
  organizationId: z.number(),
  clientWorkspaceId: z.number(),
  batchNumber: z.string(),
  lotNumber: z.string().optional(),
  materialId: z.number(),
  batchStatus: z.enum(['in_process', 'testing', 'quarantine', 'approved', 'rejected', 'released', 'recalled']),
  manufacturingStatus: z.enum(['planned', 'in_progress', 'completed', 'failed']),
  manufacturingDate: z.string().optional(),
  expiryDate: z.string().optional(),
  retestDate: z.string().optional(),
  manufacturingSiteId: z.number().optional(),
  batchSize: z.number().optional(),
  batchSizeUnit: z.string().optional(),
  yield: z.number().optional(),
  qcStatus: z.enum(['pending', 'in_progress', 'passed', 'failed']),
  qcTestingDate: z.string().optional(),
  qcApprovalDate: z.string().optional(),
  qcApprovedBy: z.string().optional(),
  coaNumber: z.string().optional(),
  testResults: z.any().optional(),
  releaseStatus: z.enum(['not_released', 'pending_release', 'released', 'recalled']),
  qpReleaseDate: z.string().optional(),
  qpReleasedBy: z.string().optional(),
  releaseNotes: z.string().optional(),
  bomVersion: z.string().optional(),
  processVersion: z.string().optional(),
  currentLocation: z.string().optional(),
  storageConditions: z.string().optional(),
  distributionStatus: z.enum(['in_stock', 'shipped', 'delivered', 'consumed']).optional(),
  batchRecord: z.string().optional(),
  deviations: z.any().optional(),
  investigations: z.any().optional(),
  notes: z.string().optional(),
  metadata: z.any().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateBatchSchema = BatchSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Batch = z.infer<typeof BatchSchema>;
export type CreateBatch = z.infer<typeof CreateBatchSchema>;

// ============================================================================
// STORAGE INTERFACE
// ============================================================================

export interface ISupplyChainStorage {
  // Supplier Operations
  createSupplier(data: CreateSupplier): Promise<Supplier>;
  getSupplier(
    id: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Supplier | null>;
  updateSupplier(
    id: number,
    data: Partial<CreateSupplier>,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Supplier | null>;
  deleteSupplier(
    id: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<boolean>;
  listSuppliers(
    organizationId: number,
    clientWorkspaceId: number,
    filters?: {
      supplierType?: string;
      qualificationStatus?: string;
      riskLevel?: string;
      search?: string;
    }
  ): Promise<Supplier[]>;

  // Material Operations
  createMaterial(data: CreateMaterial): Promise<Material>;
  getMaterial(
    id: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Material | null>;
  updateMaterial(
    id: number,
    data: Partial<CreateMaterial>,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Material | null>;
  deleteMaterial(
    id: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<boolean>;
  listMaterials(
    organizationId: number,
    clientWorkspaceId: number,
    filters?: {
      materialType?: string;
      materialCategory?: string;
      regulatoryStatus?: string;
      search?: string;
    }
  ): Promise<Material[]>;

  // Batch Operations
  createBatch(data: CreateBatch): Promise<Batch>;
  getBatch(
    id: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Batch | null>;
  updateBatch(
    id: number,
    data: Partial<CreateBatch>,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Batch | null>;
  deleteBatch(
    id: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<boolean>;
  listBatches(
    organizationId: number,
    clientWorkspaceId: number,
    filters?: {
      batchStatus?: string;
      manufacturingStatus?: string;
      qcStatus?: string;
      releaseStatus?: string;
      materialId?: number;
      search?: string;
    }
  ): Promise<Batch[]>;

  // Batch Release Operations (QP Workflow)
  approveBatchForRelease(
    batchId: number,
    qpUserId: string,
    notes: string,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Batch | null>;
  rejectBatchRelease(
    batchId: number,
    qpUserId: string,
    reason: string,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Batch | null>;

  // Batch Genealogy
  getBatchGenealogy(
    batchId: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<{ parents: Batch[]; children: Batch[] }>;

  // Supplier Qualification Workflow
  qualifySupplier(
    supplierId: number,
    auditScore: number,
    qualifiedBy: string,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Supplier | null>;
  suspendSupplier(
    supplierId: number,
    reason: string,
    suspendedBy: string,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Supplier | null>;
}

// ============================================================================
// MEMORY STORAGE IMPLEMENTATION
// ============================================================================

export class MemSupplyChainStorage implements ISupplyChainStorage {
  private suppliers: Map<number, Supplier> = new Map();
  private materials: Map<number, Material> = new Map();
  private batches: Map<number, Batch> = new Map();
  private nextId = 1;

  private generateId(): number {
    return this.nextId++;
  }

  private checkTenantAccess(
    item: { organizationId: number; clientWorkspaceId: number },
    organizationId: number,
    clientWorkspaceId: number
  ): boolean {
    return item.organizationId === organizationId && item.clientWorkspaceId === clientWorkspaceId;
  }

  async createSupplier(data: CreateSupplier): Promise<Supplier> {
    const now = new Date().toISOString();
    const supplier: Supplier = {
      ...data,
      id: this.generateId(),
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.suppliers.set(supplier.id, supplier);
    return supplier;
  }

  async getSupplier(
    id: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Supplier | null> {
    const supplier = this.suppliers.get(id);
    if (!supplier || !this.checkTenantAccess(supplier, organizationId, clientWorkspaceId)) {
      return null;
    }
    return supplier;
  }

  async updateSupplier(
    id: number,
    data: Partial<CreateSupplier>,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Supplier | null> {
    const supplier = await this.getSupplier(id, organizationId, clientWorkspaceId);
    if (!supplier) return null;
    const updated: Supplier = {
      ...supplier,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.suppliers.set(id, updated);
    return updated;
  }

  async deleteSupplier(
    id: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<boolean> {
    const supplier = await this.getSupplier(id, organizationId, clientWorkspaceId);
    if (!supplier) return false;
    return this.suppliers.delete(id);
  }

  async listSuppliers(
    organizationId: number,
    clientWorkspaceId: number,
    filters: {
      supplierType?: string;
      qualificationStatus?: string;
      riskLevel?: string;
      search?: string;
    } = {}
  ): Promise<Supplier[]> {
    let suppliers = Array.from(this.suppliers.values()).filter(s =>
      this.checkTenantAccess(s, organizationId, clientWorkspaceId)
    );

    if (filters.supplierType) {
      suppliers = suppliers.filter(s => s.supplierType === filters.supplierType);
    }
    if (filters.qualificationStatus) {
      suppliers = suppliers.filter(s => s.qualificationStatus === filters.qualificationStatus);
    }
    if (filters.riskLevel) {
      suppliers = suppliers.filter(s => s.riskLevel === filters.riskLevel);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      suppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(search) || s.supplierCode.toLowerCase().includes(search)
      );
    }

    return suppliers;
  }

  async createMaterial(data: CreateMaterial): Promise<Material> {
    const now = new Date().toISOString();
    const material: Material = {
      ...data,
      id: this.generateId(),
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.materials.set(material.id, material);
    return material;
  }

  async getMaterial(
    id: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Material | null> {
    const material = this.materials.get(id);
    if (!material || !this.checkTenantAccess(material, organizationId, clientWorkspaceId)) {
      return null;
    }
    return material;
  }

  async updateMaterial(
    id: number,
    data: Partial<CreateMaterial>,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Material | null> {
    const material = await this.getMaterial(id, organizationId, clientWorkspaceId);
    if (!material) return null;
    const updated: Material = {
      ...material,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.materials.set(id, updated);
    return updated;
  }

  async deleteMaterial(
    id: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<boolean> {
    const material = await this.getMaterial(id, organizationId, clientWorkspaceId);
    if (!material) return false;
    return this.materials.delete(id);
  }

  async listMaterials(
    organizationId: number,
    clientWorkspaceId: number,
    filters: {
      materialType?: string;
      materialCategory?: string;
      regulatoryStatus?: string;
      search?: string;
    } = {}
  ): Promise<Material[]> {
    let materials = Array.from(this.materials.values()).filter(m =>
      this.checkTenantAccess(m, organizationId, clientWorkspaceId)
    );

    if (filters.materialType) {
      materials = materials.filter(m => m.materialType === filters.materialType);
    }
    if (filters.materialCategory) {
      materials = materials.filter(m => m.materialCategory === filters.materialCategory);
    }
    if (filters.regulatoryStatus) {
      materials = materials.filter(m => m.regulatoryStatus === filters.regulatoryStatus);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      materials = materials.filter(m =>
        m.name.toLowerCase().includes(search) || m.materialCode.toLowerCase().includes(search)
      );
    }

    return materials;
  }

  async createBatch(data: CreateBatch): Promise<Batch> {
    const now = new Date().toISOString();
    const batch: Batch = {
      ...data,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
    };
    this.batches.set(batch.id, batch);
    return batch;
  }

  async getBatch(
    id: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Batch | null> {
    const batch = this.batches.get(id);
    if (!batch || !this.checkTenantAccess(batch, organizationId, clientWorkspaceId)) {
      return null;
    }
    return batch;
  }

  async updateBatch(
    id: number,
    data: Partial<CreateBatch>,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Batch | null> {
    const batch = await this.getBatch(id, organizationId, clientWorkspaceId);
    if (!batch) return null;
    const updated: Batch = {
      ...batch,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.batches.set(id, updated);
    return updated;
  }

  async deleteBatch(
    id: number,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<boolean> {
    const batch = await this.getBatch(id, organizationId, clientWorkspaceId);
    if (!batch) return false;
    return this.batches.delete(id);
  }

  async listBatches(
    organizationId: number,
    clientWorkspaceId: number,
    filters: {
      batchStatus?: string;
      manufacturingStatus?: string;
      qcStatus?: string;
      releaseStatus?: string;
      materialId?: number;
      search?: string;
    } = {}
  ): Promise<Batch[]> {
    let batches = Array.from(this.batches.values()).filter(b =>
      this.checkTenantAccess(b, organizationId, clientWorkspaceId)
    );

    if (filters.batchStatus) {
      batches = batches.filter(b => b.batchStatus === filters.batchStatus);
    }
    if (filters.manufacturingStatus) {
      batches = batches.filter(b => b.manufacturingStatus === filters.manufacturingStatus);
    }
    if (filters.qcStatus) {
      batches = batches.filter(b => b.qcStatus === filters.qcStatus);
    }
    if (filters.releaseStatus) {
      batches = batches.filter(b => b.releaseStatus === filters.releaseStatus);
    }
    if (filters.materialId) {
      batches = batches.filter(b => b.materialId === filters.materialId);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      batches = batches.filter(b =>
        b.batchNumber.toLowerCase().includes(search) ||
        (b.lotNumber && b.lotNumber.toLowerCase().includes(search))
      );
    }

    return batches;
  }

  async approveBatchForRelease(
    batchId: number,
    qpUserId: string,
    notes: string,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Batch | null> {
    return await this.updateBatch(
      batchId,
      {
        releaseStatus: 'released',
        qpReleaseDate: new Date().toISOString(),
        qpReleasedBy: qpUserId,
        releaseNotes: notes,
      },
      organizationId,
      clientWorkspaceId
    );
  }

  async rejectBatchRelease(
    batchId: number,
    qpUserId: string,
    reason: string,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Batch | null> {
    return await this.updateBatch(
      batchId,
      {
        releaseStatus: 'not_released',
        releaseNotes: reason,
      },
      organizationId,
      clientWorkspaceId
    );
  }

  async getBatchGenealogy(
    _batchId: number,
    _organizationId: number,
    _clientWorkspaceId: number
  ): Promise<{ parents: Batch[]; children: Batch[] }> {
    return { parents: [], children: [] };
  }

  async qualifySupplier(
    supplierId: number,
    auditScore: number,
    _qualifiedBy: string,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Supplier | null> {
    return await this.updateSupplier(
      supplierId,
      {
        qualificationStatus: 'qualified',
        qualificationDate: new Date().toISOString(),
        auditScore,
      },
      organizationId,
      clientWorkspaceId
    );
  }

  async suspendSupplier(
    supplierId: number,
    reason: string,
    _suspendedBy: string,
    organizationId: number,
    clientWorkspaceId: number
  ): Promise<Supplier | null> {
    return await this.updateSupplier(
      supplierId,
      {
        qualificationStatus: 'suspended',
        notes: reason,
      },
      organizationId,
      clientWorkspaceId
    );
  }
}