/** Lifecycle receipts observe the existing editor; they never store document text. */
export interface ProposalReceipt {
  applicationId: string;
  editorInstanceId: string;
}

export type ProposalState = 'pending' | 'settled' | 'absent' | 'unavailable';

interface ProposalSnapshot {
  ready: boolean;
  restorePending: boolean;
  clean: boolean;
  pending: ReadonlySet<string>;
}

/** Accepted applications and observers live only as long as this editor mount. */
export class ProposalLifecycle {
  readonly editorInstanceId = globalThis.crypto.randomUUID();
  private readonly accepted = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private alive = true;

  recordAccepted(applicationIds: readonly string[]): void {
    for (const id of applicationIds) this.accepted.add(id);
  }

  isActive(): boolean { return this.alive; }

  state(receipt: ProposalReceipt, snapshot: ProposalSnapshot): ProposalState {
    if (!this.alive || !receipt.applicationId || !receipt.editorInstanceId) return 'unavailable';
    if (!snapshot.ready || snapshot.restorePending) return 'unavailable';
    if (snapshot.pending.has(receipt.applicationId)) return 'pending';
    if (this.accepted.has(receipt.applicationId)) return 'settled';
    if (receipt.editorInstanceId === this.editorInstanceId || snapshot.clean) return 'absent';
    return 'unavailable';
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  notify(): void {
    for (const listener of this.listeners) {
      try { listener(); } catch { /* An observer must never block an editor action. */ }
    }
  }

  activate(): void { this.alive = true; }

  close(): void {
    this.alive = false;
    this.notify();
    this.listeners.clear();
  }
}
