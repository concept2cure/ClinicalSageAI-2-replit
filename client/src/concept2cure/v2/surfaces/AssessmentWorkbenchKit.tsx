import React from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { GOVERNED_REASON_MAX } from '@shared/constants/governed-reason';
import type { C2CFormConfig } from '../C2CForm';

export const savedRecordFields: C2CFormConfig['fields'] = [
  { key: 'title', label: 'Saved assessment title', type: 'text', required: true },
  { key: 'reason', label: 'Reason for saving (governed)', type: 'textarea', required: true,
    placeholder: `Explain this save in 8–${GOVERNED_REASON_MAX} characters.` },
];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Empty cells are missing measurements, never zero. */
export function enteredMeasurements(text: string): number[] {
  const parts = text.trim().split(/[\s,;]+/);
  if (!text.trim() || parts.some(part => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(part))) throw new Error('Enter finite measured values separated by spaces or commas.');
  const values = parts.map(Number);
  if (values.some(value => !Number.isFinite(value))) throw new Error('Enter finite measured values.');
  return values;
}

export async function assessmentRequest(method: 'GET' | 'POST', path: string, input?: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await apiRequest(method, path, input);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(serverMessage(body) || `The request failed (HTTP ${response.status}).`);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('The server did not confirm the requested record.');
  return body;
}

export function requireSavedIdentity(row: Record<string, unknown> | null | undefined, programId: string): string {
  if (!row || typeof row.id !== 'string' || !UUID.test(row.id) || row.program_id !== programId) {
    throw new Error('The server did not confirm a saved record for this project. Refresh saved records before another attempt.');
  }
  return row.id;
}

export function RecordedSnapshot({ title, value }: { title: string; value: unknown }) {
  return <details open><summary>{title}</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 420, overflow: 'auto' }}>{JSON.stringify(value, null, 2)}</pre></details>;
}
