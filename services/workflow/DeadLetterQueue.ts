/**
 * Dead Letter Queue Service
 * 
 * Captures failed workflow steps for retry or manual intervention.
 * Default implementation is in-memory with optional persistence hook.
 */

export interface DeadLetterItem {
  id: string;
  tenantId: string;
  workflowRunId: string;
  workflowStepId: string;
  stepRunId?: string | null;
  action?: string | null;
  errorMessage?: string | null;
  errorStack?: string | null;
  payload?: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
  status: 'PENDING' | 'RETRYING' | 'RESOLVED' | 'SKIPPED';
  nextRetryAt?: Date | null;
  resolvedAt?: Date | null;
  resolution?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeadLetterQueueAdapter {
  enqueue(item: DeadLetterItem): Promise<void>;
  update(item: DeadLetterItem): Promise<void>;
  listPending(limit?: number): Promise<DeadLetterItem[]>;
}

const inMemoryStore: DeadLetterItem[] = [];

export class InMemoryDeadLetterQueueAdapter implements DeadLetterQueueAdapter {
  async enqueue(item: DeadLetterItem): Promise<void> {
    inMemoryStore.push(item);
  }

  async update(item: DeadLetterItem): Promise<void> {
    const idx = inMemoryStore.findIndex(entry => entry.id === item.id);
    if (idx >= 0) inMemoryStore[idx] = item;
  }

  async listPending(limit = 50): Promise<DeadLetterItem[]> {
    return inMemoryStore
      .filter(item => item.status === 'PENDING' || item.status === 'RETRYING')
      .slice(0, limit);
  }
}

export class DeadLetterQueue {
  private adapter: DeadLetterQueueAdapter;

  constructor(adapter: DeadLetterQueueAdapter = new InMemoryDeadLetterQueueAdapter()) {
    this.adapter = adapter;
  }

  async enqueue(item: DeadLetterItem): Promise<void> {
    await this.adapter.enqueue(item);
  }

  async markResolved(item: DeadLetterItem, resolution: string): Promise<void> {
    item.status = 'RESOLVED';
    item.resolution = resolution;
    item.resolvedAt = new Date();
    item.updatedAt = new Date();
    await this.adapter.update(item);
  }

  async markSkipped(item: DeadLetterItem, resolution: string): Promise<void> {
    item.status = 'SKIPPED';
    item.resolution = resolution;
    item.resolvedAt = new Date();
    item.updatedAt = new Date();
    await this.adapter.update(item);
  }

  async listPending(limit?: number): Promise<DeadLetterItem[]> {
    return this.adapter.listPending(limit);
  }
}

export default DeadLetterQueue;
