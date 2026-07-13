/**
 * Vault sources, taxonomy helpers, and file-explorer data utilities.
 *
 * Extracted from kit vault-sources.jsx. Contains all non-component logic:
 * source definitions, connector state, TMF spine builder, dossier spine
 * conversion, vault-build enumeration, and file-explorer status/helpers.
 */

import React from 'react';
import { connected } from '../dataConnect';
import { DOSSIER_SPINES } from './dossier-data';
import { TMF_REFERENCE_MODEL, ETMF_SAMPLE_TRIAL, ETMF_FILINGS } from './etmf';
import { giForSeg } from './governed-intelligence-data';
import { SC_SUBMISSIONS } from './submission';

/* ── Vault source ── */

export interface VaultSource {
  id: string;
  label: string;
  kind: string;
  real: boolean;
  native?: boolean;
  gap?: boolean;
  desc: string;
  endpoint?: string;
  connected?: boolean;
}

export const VAULT_SOURCES: VaultSource[] = [
  { id: 'corpus', label: 'Concept2Cure Vault', kind: 'native', real: true, native: true,
    desc: 'This project corpus — semantic search across every governed artifact.' },
  { id: 'veeva', label: 'Veeva Vault', kind: 'veeva', real: true,
    desc: 'Veeva Vault (RIM / QualityDocs) — search and import governed documents.',
    endpoint: 'server/services/connectors/veeva-vault.ts' },
  { id: 'sharepoint', label: 'SharePoint', kind: 'sharepoint', real: true,
    desc: 'Microsoft SharePoint document libraries — search and import.',
    endpoint: 'server/services/connectors/sharepoint.ts' },
  { id: 'onedrive', label: 'OneDrive', kind: 'onedrive', real: true,
    desc: 'Microsoft OneDrive — search and import files.',
    endpoint: 'server/services/connectors/onedrive.ts' },
  { id: 'gdrive', label: 'Google Drive', kind: 'gdrive', real: false, gap: true,
    desc: 'No backend connector yet — Google Drive is not wired in concept2cure-v2. Ask us to prioritize it.' },
];

(window as any).VAULT_SOURCES = VAULT_SOURCES;

/* ── Connector status ── */

export function vaultSourceConnected(s: VaultSource | null | undefined): boolean {
  if (!s) return false;
  if (s.id === 'corpus') return connected();
  return !!s.connected;
}

(window as any).vaultSourceConnected = vaultSourceConnected;

/* ── TMF spine builder ── */

export interface SpineNode {
  id: string;
  code: string;
  label: string;
  children: (SpineNode | SpineDoc)[];
}

export interface SpineDoc {
  id: string;
  num: string;
  title: string;
  type: string;
  /** Optional so dossier-data DossierDoc leaves (which carry no section) fit. */
  section?: string;
  status: string;
  pct: number;
  owner: string;
  ver: string;
  updated: string;
  preview: string;
  blocker?: boolean;
  flag?: string;
}

export interface Spine {
  program: string;
  spine: string;
  standard: string;
  tree: (SpineNode | SpineDoc)[];
  filingTypes?: any[];
  docKinds?: any[];
  live?: boolean;
}

export function buildTmfSpine(): Spine {
  const model = TMF_REFERENCE_MODEL;
  const trial = ETMF_SAMPLE_TRIAL;
  const provided = new Set<string>(trial.providedArtifacts || []);
  const filings = ETMF_FILINGS;

  const tree: SpineNode[] = model.map((z) => ({
    id: 'tmf-z' + z.number,
    code: 'Zone ' + z.number,
    label: z.name,
    children: z.artifacts.map((a) => {
      const filed = provided.has(a.code);
      const f = filings[a.code];
      const status = filed
        ? ((f && f.status) || 'final')
        : (a.essential ? 'expected' : 'not_applicable');
      return {
        id: 'tmf-' + a.code,
        num: '—',
        title: a.name,
        type: a.essential ? 'Essential' : 'Optional',
        section: 'Zone ' + z.number + ' · ' + z.name,
        status,
        pct: filed ? 100 : 0,
        owner: 'CRO / sponsor',
        ver: filed ? 'v1.0' : '—',
        updated: filed ? 'filed' : 'expected',
        preview: 'DIA TMF Reference Model · Zone ' + z.number + ' · ' + z.name +
          (a.essential ? ' · essential document (ICH E6(R2) section 8)' : ' · optional artifact'),
      } as SpineDoc;
    }),
  }));

  return {
    program: trial.title,
    spine: 'DIA TMF Reference Model v3 · ICH E6(R2) section 8',
    standard: 'tmf',
    tree,
  };
}

(window as any).buildTmfSpine = buildTmfSpine;

/* ── Attach the TMF spine as the CRO build of DOSSIER_SPINES ── */

DOSSIER_SPINES.cro = buildTmfSpine();

/* ── Standard labels per segment ── */

export const VAULT_STANDARD_LABEL: Record<string, string> = {
  biotech: 'eCTD · ICH CTD (Modules 1-5)',
  pharma: 'eCTD · ICH CTD (Modules 1-5)',
  medtech: 'FDA eSTAR · EU MDR Annex II/III · global',
  diagnostics: 'EU IVDR Annex II/III · FDA · global',
  cro: 'DIA TMF Reference Model v3',
  health: 'eCTD · ICH CTD',
};

(window as any).VAULT_STANDARD_LABEL = VAULT_STANDARD_LABEL;

/* ── Vault builds ── */

export const APP_TYPE_LABELS: Record<string, string> = {
  ind: 'IND', nda: 'NDA', bla: 'BLA', anda: 'ANDA', maa: 'MAA',
  '510k': '510(k)', de_novo: 'De Novo', pma: 'PMA', cta: 'CTA',
  ivdr: 'IVDR PE', tmf: 'TMF',
};

export const REGION_LABELS: Record<string, string> = {
  fda: 'FDA', eu: 'EU', jp: 'PMDA', '—': '',
};

export interface VaultBuild {
  id: string;
  program: string;
  appType: string;
  region: string;
  pathway: string;
  seg: string;
  label: string;
}

export const VAULT_BUILDS: VaultBuild[] = (() => {
  const builds: VaultBuild[] = [];
  SC_SUBMISSIONS.forEach((s) => {
    builds.push({
      id: s.id,
      program: s.program,
      appType: s.appType,
      region: s.region,
      pathway: s.pathway,
      seg: (s.appType === 'bla' || s.appType === 'ind') ? 'biotech' : 'pharma',
      label: s.program + ' · ' + (APP_TYPE_LABELS[s.appType] || s.appType) +
        (REGION_LABELS[s.region] ? ' · ' + REGION_LABELS[s.region] : ''),
    });
  });
  const giMedtech = giForSeg('medtech');
  if (giMedtech && giMedtech.program) {
    builds.push({
      id: 'build-medtech', program: giMedtech.program.code,
      appType: '510k', region: 'fda', pathway: 'estar', seg: 'medtech',
      label: giMedtech.program.code + ' · 510(k) · FDA eSTAR',
    });
  }
  const giDiagnostics = giForSeg('diagnostics');
  if (giDiagnostics && giDiagnostics.program) {
    builds.push({
      id: 'build-ivd', program: 'IVD dossier',
      appType: 'ivdr', region: 'eu', pathway: 'ivdr', seg: 'diagnostics',
      label: 'IVD dossier · IVDR PE · EU',
    });
  }
  builds.push({
    id: 'build-tmf', program: ETMF_SAMPLE_TRIAL.trialId,
    appType: 'tmf', region: '—', pathway: 'tmf', seg: 'cro',
    label: ETMF_SAMPLE_TRIAL.trialId + ' · TMF · DIA RM',
  });
  return builds;
})();

(window as any).VAULT_BUILDS = VAULT_BUILDS;

/* ── Spine selection for a build ── */

export function spineForBuild(build: VaultBuild | null | undefined): Spine | undefined {
  const S = DOSSIER_SPINES;
  if (!build) return S.biotech;
  const p = build.pathway || '';
  if (p === 'estar' || p === 'mdr') return S.medtech || S.biotech;
  if (p === 'ivdr') return S.diagnostics || S.biotech;
  if (p === 'tmf') return S.cro || S.biotech;
  return (build.appType === 'nda' || build.appType === 'anda')
    ? (S.pharma || S.biotech)
    : S.biotech;
}

(window as any).spineForBuild = spineForBuild;

/* ── Live vault structure to spine conversion ── */

export function vaultStructureToSpine(live: any): Spine | null {
  if (!live || !Array.isArray(live.documents) || !live.documents.length) return null;

  const filing = (Array.isArray(live.filingTypes) && live.filingTypes[0]) || null;
  const refs = (filing && Array.isArray(filing.regulatoryRefs) && filing.regulatoryRefs.length)
    ? ' · ' + filing.regulatoryRefs.join(' · ')
    : '';
  const standardLabel = filing
    ? ((filing.label || filing.value) + refs)
    : (live.view || 'Vault');

  function sectionsToTree(doc: any): (SpineNode | SpineDoc)[] {
    const secs = (doc.sections || []).slice().sort(
      (a: any, b: any) => (a.pathOrder || 0) - (b.pathOrder || 0),
    );
    if (!secs.length) return [];

    const byKey: Record<string, { _s: any; children: any[] }> = {};
    const roots: any[] = [];
    secs.forEach((s: any) => { byKey[s.key] = { _s: s, children: [] }; });
    secs.forEach((s: any) => {
      const node = byKey[s.key];
      if (s.parentKey && byKey[s.parentKey]) byKey[s.parentKey].children.push(node);
      else roots.push(node);
    });

    function toNode(n: any): SpineNode | SpineDoc {
      const s = n._s;
      if (n.children.length) {
        return {
          id: 'sec-' + doc.id + '-' + s.key,
          code: s.key,
          label: s.label,
          children: n.children.map(toNode),
        } as SpineNode;
      }
      return {
        id: 'doc-' + doc.id + '-' + s.key,
        num: s.key,
        title: s.label,
        type: s.mandatory ? 'Required' : 'Optional',
        section: doc.title || doc.docType,
        status: s.status || (s.hasContent ? 'draft' : 'not_started'),
        pct: s.hasContent ? 100 : 0,
        owner: doc.agency || '—',
        ver: s.version || '—',
        updated: s.hasContent ? 'authored' : '—',
        blocker: (s.mandatory && !s.hasContent) || undefined,
        flag: (s.mandatory && !s.hasContent) ? 'Mandatory section — no content yet' : undefined,
        preview: (doc.title || doc.docType || 'Document') + ' · ' + s.key + ' · ' + s.label +
          (s.mandatory ? ' · mandatory section' : ''),
      } as SpineDoc;
    }
    return roots.map(toNode);
  }

  const tree: SpineNode[] = live.documents.map((doc: any) => {
    const kids = sectionsToTree(doc);
    return {
      id: 'vaultdoc-' + doc.id,
      code: (doc.docType || '').toUpperCase(),
      label: doc.title || doc.docType || 'Document',
      children: kids.length ? kids : [{
        id: 'doc-' + doc.id,
        num: '—',
        title: doc.title || doc.docType,
        type: 'Document',
        section: doc.docType,
        status: doc.status || 'not_started',
        pct: typeof doc.readiness === 'number' ? doc.readiness : 0,
        owner: doc.agency || '—',
        ver: '—',
        updated: '—',
        preview: (doc.title || doc.docType) + (doc.agency ? ' · ' + doc.agency : ''),
      } as SpineDoc],
    };
  });

  return {
    program: (live.documents[0] && live.documents[0].title) || live.view || 'Vault',
    spine: standardLabel,
    standard: live.view || '',
    tree,
    filingTypes: Array.isArray(live.filingTypes) ? live.filingTypes : [],
    docKinds: Array.isArray(live.docKinds) ? live.docKinds : [],
    live: true,
  };
}

(window as any).vaultStructureToSpine = vaultStructureToSpine;

/* ── File-explorer status vocabulary ── */

export interface FeStatus {
  label: string;
  tone: string;
}

export const FE_STATUS: Record<string, FeStatus> = {
  expected: { label: 'Expected', tone: 'info' },
  received: { label: 'Received', tone: 'warn' },
  in_review: { label: 'In review', tone: 'warn' },
  missing: { label: 'Missing', tone: 'bad' },
  not_applicable: { label: 'N/A', tone: 'info' },
  final: { label: 'Final', tone: 'good' },
  approved: { label: 'Approved', tone: 'good' },
  reviewed: { label: 'Reviewed', tone: 'good' },
  complete: { label: 'Complete', tone: 'good' },
  review: { label: 'In review', tone: 'warn' },
  draft: { label: 'Draft', tone: 'info' },
  not_started: { label: 'Not started', tone: 'bad' },
};

/* ── File-explorer tree helpers ── */

export function feIsDoc(n: any): boolean {
  return n && (n.num !== undefined || n.title !== undefined) && !n.children;
}

export function feFlatten(nodes: any[], out?: any[]): any[] {
  out = out || [];
  (nodes || []).forEach((n: any) => {
    if (feIsDoc(n)) out!.push(n);
    else if (n.children) feFlatten(n.children, out);
  });
  return out;
}

export function feFileIcon(d: any, icons: Record<string, any>): React.ReactNode {
  const t = ((d && d.type) || '').toLowerCase();
  if (/form/.test(t)) return icons.fileText || icons.file;
  if (/table|data/.test(t)) return icons.grid || icons.fileText;
  if (/csr|report|study/.test(t)) return icons.barChart || icons.fileText;
  if (/label/.test(t)) return icons.tag || icons.fileText;
  if (/plan|charter|essential|optional/.test(t)) return icons.clipboardList || icons.fileText;
  return icons.fileText || icons.file;
}

export function feSt(s: string): FeStatus {
  return FE_STATUS[s] || { label: s || '—', tone: 'info' };
}
