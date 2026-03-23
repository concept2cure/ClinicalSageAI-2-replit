/**
 * Supersession Test Driver — Intent-Driven
 *
 * Models supersession operations as business intent, not ORM gymnastics.
 * Every method maps to exactly one thing the system can do.
 *
 * Rules enforced:
 * - Cannot supersede itself
 * - Cannot create circular supersession
 * - Cannot supersede an already-superseded object with the same successor
 * - Cannot confirm a non-existent or already-confirmed record
 */

import type { ResolutionTestState, TestSupersessionRecord } from './resolution-test-state';

export class SupersessionDriver {
  constructor(private state: ResolutionTestState) {}

  /**
   * Find an existing supersession for an exact (from, to) pair.
   * This is what recordSupersession checks before inserting.
   */
  findExisting(params: {
    organizationId: number;
    supersededObjectType: string;
    supersededObjectId: string;
    successorObjectType: string;
    successorObjectId: string;
    inState?: string;
  }): TestSupersessionRecord | undefined {
    return this.state.supersessions.find(s =>
      s.organizationId === params.organizationId &&
      s.supersededObjectType === params.supersededObjectType &&
      s.supersededObjectId === params.supersededObjectId &&
      s.successorObjectType === params.successorObjectType &&
      s.successorObjectId === params.successorObjectId &&
      (params.inState ? s.state === params.inState : true)
    );
  }

  /**
   * Get the supersession chain for an object (walk predecessors).
   * Returns records where the given object is the successor.
   */
  getChain(params: {
    organizationId: number;
    objectType: string;
    objectId: string;
  }): TestSupersessionRecord[] {
    const chain: TestSupersessionRecord[] = [];
    let currentType = params.objectType;
    let currentId = params.objectId;

    for (let depth = 0; depth < 20; depth++) {
      const predecessor = this.state.supersessions.find(s =>
        s.organizationId === params.organizationId &&
        s.successorObjectType === currentType &&
        s.successorObjectId === currentId &&
        s.state === 'confirmed'
      );
      if (!predecessor) break;
      chain.push(predecessor);
      currentType = predecessor.supersededObjectType;
      currentId = predecessor.supersededObjectId;
    }

    return chain;
  }

  /**
   * Check if an object has been superseded (has a confirmed supersession record).
   */
  isSuperseded(params: {
    organizationId: number;
    objectType: string;
    objectId: string;
  }): boolean {
    return this.state.supersessions.some(s =>
      s.organizationId === params.organizationId &&
      s.supersededObjectType === params.objectType &&
      s.supersededObjectId === params.objectId &&
      s.state === 'confirmed'
    );
  }

  /**
   * Create a new supersession record. Enforces all business rules.
   */
  create(record: Omit<TestSupersessionRecord, 'id' | 'state' | 'createdAt'>): TestSupersessionRecord {
    // Rule: cannot supersede itself
    if (
      record.supersededObjectType === record.successorObjectType &&
      record.supersededObjectId === record.successorObjectId
    ) {
      throw new Error('An object cannot supersede itself');
    }

    // Rule: no circular supersession
    const chain = this.getChain({
      organizationId: record.organizationId,
      objectType: record.successorObjectType,
      objectId: record.successorObjectId,
    });
    const wouldCycle = chain.some(
      r => r.supersededObjectType === record.supersededObjectType &&
           r.supersededObjectId === record.supersededObjectId
    );
    if (wouldCycle) {
      throw new Error('Supersession would create a circular reference');
    }

    // Rule: no duplicate proposed supersession for same pair
    const existing = this.findExisting({
      organizationId: record.organizationId,
      supersededObjectType: record.supersededObjectType,
      supersededObjectId: record.supersededObjectId,
      successorObjectType: record.successorObjectType,
      successorObjectId: record.successorObjectId,
      inState: 'proposed',
    });
    if (existing) {
      throw new Error('Supersession already exists for this object pair');
    }

    const newRecord: TestSupersessionRecord = {
      ...record,
      id: `supersession-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      state: 'proposed',
      createdAt: new Date(),
    };

    this.state.supersessions.push(newRecord);
    return newRecord;
  }

  /**
   * Confirm a proposed supersession.
   */
  confirm(params: {
    organizationId: number;
    supersessionId: string;
    userId: number;
  }): TestSupersessionRecord {
    const record = this.state.supersessions.find(
      s => s.id === params.supersessionId &&
           s.organizationId === params.organizationId
    );
    if (!record) {
      throw new Error(`Supersession record ${params.supersessionId} not found`);
    }
    if (record.state !== 'proposed') {
      throw new Error(`Cannot confirm supersession in state "${record.state}"`);
    }

    record.state = 'confirmed';
    record.confirmedById = params.userId;
    record.confirmedAt = new Date();
    return record;
  }

  /**
   * Revert a confirmed supersession.
   */
  revert(params: {
    organizationId: number;
    supersessionId: string;
    userId: number;
  }): TestSupersessionRecord {
    const record = this.state.supersessions.find(
      s => s.id === params.supersessionId &&
           s.organizationId === params.organizationId
    );
    if (!record) {
      throw new Error(`Supersession record ${params.supersessionId} not found`);
    }
    if (record.state !== 'confirmed') {
      throw new Error(`Cannot revert supersession in state "${record.state}"`);
    }

    record.state = 'reverted';
    return record;
  }
}
