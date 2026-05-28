/**
 * useSamd — live adapter for the SaMD IEC 62304 workspace.
 *
 * Calls GET /api/mdx/software (optionally scoped to a program UUID) and
 * adapts software_lifecycle_items → KitDocument[] for the DocumentsPanel.
 * Falls back to SAMD_DOCUMENTS seed data when the org has no items yet.
 *
 * Individual SRS requirements, OTS/SOUP components, and anomaly rows have
 * no backend table at this granularity — those stay on seed fixtures until
 * dedicated tables ship.
 */

import { SAMD_DOCUMENTS, SAMD_DOC_FRAMEWORKS } from '../data/samd';
import type { KitDocument, KitDocFramework } from '../components/DocumentsPanel';
import type { DocStatus, DocEsigState } from '../components/DocumentsPanel';
import { useFetchJson } from './useFetchJson';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SoftwareItem {
  id: number;
  organization_id: number;
  program_id: string | null;
  doc_level: 'basic' | 'enhanced';
  safety_class: 'A' | 'B' | 'C' | null;
  item_kind: string;
  title: string;
  identifier: string | null;
  status: 'draft' | 'in_review' | 'approved' | 'superseded';
  evidence_artifact_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SoftwarePayload {
  data: SoftwareItem[];
  meta: { count: number };
}

const KIND_TO_FRAMEWORK: Record<string, string> = {
  srs:                'srs',
  sds:                'sds',
  arch:               'vv',
  unit_test:          'vv',
  integration_test:   'vv',
  system_test:        'vv',
  release_note:       'vv',
  anomaly_log:        'cyber',
  ots_list:           'cyber',
  sbom:               'cyber',
  pentest:            'cyber',
  threat_model:       'cyber',
  cybersecurity_label:'cyber',
  risk_control:       'vv',
  use_error:          'vv',
};

const KIND_LABEL: Record<string, string> = {
  srs:                'Software Requirements Specification',
  sds:                'Software Design Specification',
  arch:               'Software Architecture',
  unit_test:          'Unit Test Specification',
  integration_test:   'Integration Test Specification',
  system_test:        'System Test Specification',
  release_note:       'Release Notes',
  anomaly_log:        'Anomaly Log',
  ots_list:           'OTS/SOUP List',
  sbom:               'Software Bill of Materials',
  pentest:            'Penetration Test Report',
  threat_model:       'Threat Model',
  cybersecurity_label:'Cybersecurity Labeling',
  risk_control:       'Risk Control Measures',
  use_error:          'Use Error Analysis',
};

function adaptStatus(s: SoftwareItem['status']): DocStatus {
  if (s === 'approved')   return 'ready';
  if (s === 'in_review')  return 'review';
  if (s === 'superseded') return 'locked';
  return 'draft';
}

function adaptEsig(s: SoftwareItem['status']): DocEsigState {
  return s === 'approved' ? 'signed' : 'na';
}

function adaptCompletion(s: SoftwareItem['status']): number {
  if (s === 'approved' || s === 'superseded') return 100;
  if (s === 'in_review') return 70;
  return 20;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1)  return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

function adaptItem(item: SoftwareItem): KitDocument {
  return {
    id:               `swlc-${item.id}`,
    framework:        KIND_TO_FRAMEWORK[item.item_kind] ?? 'vv',
    type:             KIND_LABEL[item.item_kind] ?? item.item_kind,
    title:            item.title,
    ver:              item.identifier ?? 'v1.0',
    status:           adaptStatus(item.status),
    completion:       adaptCompletion(item.status),
    owner:            '',
    reviewers:        [],
    lastEdit:         formatRelative(item.updated_at),
    esigRequired:     true,
    esigState:        adaptEsig(item.status),
    sections:         0,
    sectionsComplete: 0,
    blocker:          false,
  };
}

export interface UseSamdResult {
  documents: KitDocument[];
  docFrameworks: KitDocFramework[];
  loading: boolean;
}

export function useSamd(programId: string | null): UseSamdResult {
  const isUuid = programId != null && UUID_RE.test(programId);
  const qs = isUuid ? `?program_id=${encodeURIComponent(programId)}` : '';
  const { data, loading } = useFetchJson<SoftwarePayload>(`/api/mdx/software${qs}`);

  const items = data?.data;
  return {
    documents:    items && items.length > 0 ? items.map(adaptItem) : SAMD_DOCUMENTS,
    docFrameworks: SAMD_DOC_FRAMEWORKS,
    loading,
  };
}
