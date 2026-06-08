/**
 * Post-market surveillance — openFDA normalization, signal aggregation (spike
 * detection), recall summary, and the fetch seam with a mocked fetcher.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  normalizeMaudeResponse,
  aggregateSignals,
  normalizeRecallResponse,
  summarizeRecalls,
  fetchMaudeEvents,
  type MaudeEvent,
} from '../openfda-surveillance';

describe('normalizeMaudeResponse', () => {
  it('maps openFDA event fields and event types', () => {
    const events = normalizeMaudeResponse({
      results: [
        {
          report_number: 'MW5001',
          event_type: 'Death',
          date_received: '20260115',
          product_problems: ['Battery Problem'],
          device: [{ manufacturer_d_name: 'Acme' }],
        },
        { report_number: 'MW5002', event_type: 'Malfunction', date_received: 'bad' },
      ],
    });
    expect(events[0]).toMatchObject({
      reportNumber: 'MW5001',
      eventType: 'Death',
      productProblems: ['Battery Problem'],
      manufacturer: 'Acme',
    });
    expect(events[0].dateReceived?.getUTCFullYear()).toBe(2026);
    expect(events[1].dateReceived).toBeNull();
    expect(events[1].eventType).toBe('Malfunction');
  });

  it('handles a missing results array', () => {
    expect(normalizeMaudeResponse({})).toEqual([]);
  });
});

describe('aggregateSignals', () => {
  const make = (eventType: MaudeEvent['eventType'], date: string, problems: string[] = []): MaudeEvent => ({
    reportNumber: Math.random().toString(),
    eventType,
    dateReceived: new Date(date),
    productProblems: problems,
    manufacturer: null,
  });

  it('counts by type, top problems, and serious subset', () => {
    const r = aggregateSignals([
      make('Death', '2026-05-15', ['Overheating']),
      make('Injury', '2026-05-16', ['Overheating', 'Leak']),
      make('Malfunction', '2026-05-17', ['Overheating']),
    ]);
    expect(r.total).toBe(3);
    expect(r.byEventType).toMatchObject({ Death: 1, Injury: 1, Malfunction: 1 });
    expect(r.seriousCount).toBe(2);
    // Overheating (3) clearly leads Leak (1).
    expect(r.topProblems[0]).toMatchObject({ problem: 'Overheating', count: 3 });
  });

  it('flags a spike when the recent rate exceeds baseline', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const events = [
      ...Array.from({ length: 5 }, () => make('Malfunction', '2026-05-15')), // recent (within 30d)
      make('Malfunction', '2026-04-15'), // baseline (prior 30d)
    ];
    const r = aggregateSignals(events, { now, recentWindowDays: 30, baselineWindowDays: 30 });
    expect(r.recentCount).toBe(5);
    expect(r.baselineCount).toBe(1);
    expect(r.signalDetected).toBe(true);
  });

  it('does not flag below the minimum recent count', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const r = aggregateSignals([make('Malfunction', '2026-05-15'), make('Malfunction', '2026-05-16')], {
      now,
      recentWindowDays: 30,
      baselineWindowDays: 30,
      minRecentCount: 3,
    });
    expect(r.signalDetected).toBe(false);
  });
});

describe('recalls', () => {
  it('normalizes and summarizes by classification', () => {
    const recalls = normalizeRecallResponse({
      results: [
        { recall_number: 'Z-1', classification: 'Class I', reason_for_recall: 'r', recalling_firm: 'F' },
        { recall_number: 'Z-2', classification: 'Class II' },
        { recall_number: 'Z-3', classification: 'weird' },
      ],
    });
    const s = summarizeRecalls(recalls);
    expect(s.total).toBe(3);
    expect(s.byClassification['Class I']).toBe(1);
    expect(s.byClassification.Unclassified).toBe(1);
    expect(s.classICount).toBe(1);
  });
});

describe('fetchMaudeEvents (fetch seam)', () => {
  it('calls the openFDA device/event endpoint and normalizes the response', async () => {
    const fetcher = vi.fn(async (_url: string) => ({
      json: async () => ({ results: [{ report_number: 'A1', event_type: 'Injury', date_received: '20260101' }] }),
    }));
    const events = await fetchMaudeEvents('device.generic_name:pump', { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain('/device/event.json');
    expect(events[0]).toMatchObject({ reportNumber: 'A1', eventType: 'Injury' });
  });
});
