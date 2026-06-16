/**
 * Horizon Store — where harvested KnowledgeCards live between scan and promotion.
 *
 * Phase 1 keeps this deliberately simple and dependency-free: an in-memory map,
 * optionally mirrored to a JSON file (HORIZON_STORE_PATH) so a single-node
 * deploy survives restarts. This mirrors the platform's existing file-backed
 * citable corpora (regulatory_data/*.json) rather than introducing a schema
 * migration. Phase 2 can swap this implementation for a Drizzle-backed table
 * behind the same interface without touching callers.
 *
 * De-duplication is by card id: re-ingesting the same change updates it in
 * place (and only re-opens review if its content hash changed).
 */

import { promises as fs } from 'fs';
import { createScopedLogger } from '../../utils/logger.js';
import type { CardStatus, KnowledgeCard } from './knowledge-card.js';

const logger = createScopedLogger('horizon-store');

export interface HorizonStore {
  upsert(card: KnowledgeCard): { inserted: boolean; changed: boolean };
  setStatus(id: string, status: CardStatus): boolean;
  get(id: string): KnowledgeCard | undefined;
  byStatus(status: CardStatus): KnowledgeCard[];
  all(): KnowledgeCard[];
  persist(): Promise<void>;
  load(): Promise<void>;
}

class InMemoryHorizonStore implements HorizonStore {
  private cards = new Map<string, KnowledgeCard>();
  private readonly path = process.env.HORIZON_STORE_PATH?.trim();

  upsert(card: KnowledgeCard): { inserted: boolean; changed: boolean } {
    const existing = this.cards.get(card.id);
    if (!existing) {
      this.cards.set(card.id, card);
      return { inserted: true, changed: true };
    }
    if (existing.hash === card.hash) {
      return { inserted: false, changed: false };
    }
    // Substance changed → keep id, refresh content, re-open for routing.
    this.cards.set(card.id, { ...card, status: 'pending' });
    return { inserted: false, changed: true };
  }

  setStatus(id: string, status: CardStatus): boolean {
    const card = this.cards.get(id);
    if (!card) return false;
    this.cards.set(id, { ...card, status });
    return true;
  }

  get(id: string): KnowledgeCard | undefined {
    return this.cards.get(id);
  }

  byStatus(status: CardStatus): KnowledgeCard[] {
    return [...this.cards.values()].filter(c => c.status === status);
  }

  all(): KnowledgeCard[] {
    return [...this.cards.values()];
  }

  async persist(): Promise<void> {
    if (!this.path) return;
    try {
      await fs.writeFile(this.path, JSON.stringify(this.all(), null, 2), 'utf8');
    } catch (err: any) {
      logger.warn(`Persist to ${this.path} failed: ${err?.message}`);
    }
  }

  async load(): Promise<void> {
    if (!this.path) return;
    try {
      const raw = await fs.readFile(this.path, 'utf8');
      const cards = JSON.parse(raw) as KnowledgeCard[];
      this.cards = new Map(cards.map(c => [c.id, c]));
      logger.info(`Loaded ${this.cards.size} cards from ${this.path}`);
    } catch {
      // Missing/empty file on first run is expected — start clean.
    }
  }
}

let _store: HorizonStore | null = null;

/** Shared store singleton. */
export function getHorizonStore(): HorizonStore {
  if (!_store) _store = new InMemoryHorizonStore();
  return _store;
}

/** Test seam: inject a custom store. */
export function __setHorizonStore(store: HorizonStore | null): void {
  _store = store;
}
