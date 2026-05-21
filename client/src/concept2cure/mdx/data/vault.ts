/**
 * Document vault — Phase 5
 *
 * Full vault surface (not the workbench tab stub). Folder hierarchy,
 * artifacts with version history, retention policy, distribution policy,
 * SHA-256 hash chain, e-signature manifest per artifact.
 *
 * Wire shape: GET /api/mdx/vault, GET /api/mdx/vault/:fileId/versions
 */

export const VAULT_FOLDERS = [
  { id: 'root',    label: 'All artifacts',           count: 247, parent: null },
  { id: 'k510',    label: '510(k) submissions',      count: 89,  parent: 'root' },
  { id: 'pma',     label: 'PMA submissions',         count: 42,  parent: 'root' },
  { id: 'cer',     label: 'Clinical evaluation',     count: 31,  parent: 'root' },
  { id: 'eng',     label: 'Engineering (DHF + RMF)', count: 41,  parent: 'root' },
  { id: 'udi',     label: 'Labeling and UDI',        count: 18,  parent: 'root' },
  { id: 'pv',      label: 'Post-market vigilance',   count: 16,  parent: 'root' },
  { id: 'qms',     label: 'Quality system',          count: 22,  parent: 'root' },
  { id: 'corresp', label: 'Agency correspondence',   count: 14,  parent: 'root' },
  { id: 'shared',  label: 'Shared boilerplate',      count: 12,  parent: 'root' },
];

export const VAULT_FILES = [
  { id: 'f1', name: '510k-BX204-eSTAR-v2.7.zip',           type: 'zip',  kind: 'submission', folder: 'k510', prog: 'BX-204',  size: '34.2 MB', ver: 'v2.7', status: 'locked',  updated: '2026-05-12', author: 'JC', hash: '8c3f2d11a8e1ccd2',  esig: true,  linked: 18, retention: '15 years', distribution: 'org-internal' },
  { id: 'f2', name: 'RMF-BX204-residual-v3.1.pdf',         type: 'pdf',  kind: 'risk',       folder: 'eng',  prog: 'BX-204',  size: '4.8 MB',  ver: 'v3.1', status: 'review',  updated: '8h ago',     author: 'AK', hash: 'f0419a37710a3349', esig: false, linked: 24, retention: '15 years', distribution: 'org-internal' },
  { id: 'f3', name: 'CV-330-DSMB-charter-v1.4.docx',       type: 'docx', kind: 'clinical',   folder: 'pma',  prog: 'CV-330',  size: '1.1 MB',  ver: 'v1.4', status: 'draft',   updated: '5h ago',     author: 'MW', hash: '12bc66e85f7c0091', esig: false, linked: 8,  retention: '25 years', distribution: 'cro-shared' },
  { id: 'f4', name: 'BX-204-IFU-EN-v2.7.pdf',              type: 'pdf',  kind: 'labeling',   folder: 'udi',  prog: 'BX-204',  size: '892 kB',  ver: 'v2.7', status: 'locked',  updated: '6d ago',     author: 'JC', hash: 'a8e1ccd24e927720', esig: true,  linked: 4,  retention: 'product life + 10y', distribution: 'public' },
  { id: 'f5', name: 'CAPA-0218-effectiveness-verif.pdf',   type: 'pdf',  kind: 'capa',       folder: 'pv',   prog: 'BX-204',  size: '2.4 MB',  ver: 'v1.0', status: 'review',  updated: '2d ago',     author: 'AK', hash: '4e927720d6f12233', esig: false, linked: 6,  retention: '15 years', distribution: 'org-internal' },
  { id: 'f6', name: 'OR-801-biocompat-ISO10993.pdf',       type: 'pdf',  kind: 'engineering',folder: 'eng',  prog: 'OR-801',  size: '12.1 MB', ver: 'v2.0', status: 'review',  updated: '11d ago',    author: 'LT', hash: '710a334987d212bc', esig: false, linked: 12, retention: '15 years', distribution: 'supplier-shared' },
  { id: 'f7', name: 'FDA-NM-512-RTA-letter-2025-09-12.pdf',type: 'pdf',  kind: 'agency',     folder: 'corresp',prog:'NM-512',  size: '432 kB',  ver: 'v1.0', status: 'locked',  updated: '2025-09-12', author: 'FDA',hash: '5f7c0091a8e1ccd2', esig: false, linked: 3,  retention: '25 years', distribution: 'org-internal' },
  { id: 'f8', name: 'QMS-management-review-Q2-2026.pdf',   type: 'pdf',  kind: 'qms',        folder: 'qms',  prog: '—',       size: '3.7 MB',  ver: 'v1.2', status: 'locked',  updated: '2026-04-30', author: 'JC', hash: 'd6f1223345e927ab', esig: true,  linked: 1,  retention: '7 years', distribution: 'org-internal' },
  { id: 'f9', name: 'BX-204-cybersec-SBOM-CycloneDX.json', type: 'zip',  kind: 'engineering',folder: 'eng',  prog: 'BX-204',  size: '1.8 MB',  ver: 'v4.1.2',status:'draft', updated: '1h ago',     author: 'PS', hash: '45e927abf0419a37', esig: false, linked: 2,  retention: '15 years', distribution: 'org-internal' },
  { id: 'f10',name: 'CV-117-K254481-clearance-letter.pdf', type: 'pdf',  kind: 'agency',     folder: 'corresp',prog:'CV-117',  size: '187 kB',  ver: 'v1.0', status: 'locked',  updated: '2026-02-08', author: 'FDA',hash: 'ccd2710a8c3f2d11', esig: false, linked: 1,  retention: '25 years', distribution: 'public' },
  { id: 'f11',name: 'MDR-3500A-template-blank.docx',       type: 'docx', kind: 'template',   folder: 'shared',prog:'—',       size: '128 kB',  ver: 'v1.0', status: 'locked',  updated: '2026-03-15', author: 'JC', hash: '8c3f2d11d6f12233', esig: false, linked: 12, retention: '7 years', distribution: 'org-internal' },
  { id: 'f12',name: 'IFU-EU-translation-baseline-DE.docx', type: 'docx', kind: 'template',   folder: 'shared',prog:'—',       size: '84 kB',   ver: 'v2.1', status: 'locked',  updated: '2026-02-22', author: 'AM', hash: 'a8e1ccd28c3f2d11', esig: false, linked: 8,  retention: '7 years', distribution: 'org-internal' },
];

export const VAULT_VERSIONS = [
  { v: 'v2.7', status: 'locked',   when: '2026-05-12 14:08', author: 'JC', note: 'Locked for FDA transmittal · SHA-256 sealed' },
  { v: 'v2.6', status: 'review',   when: '2026-05-09 09:22', author: 'JC', note: 'Predicate matrix updated with K252712' },
  { v: 'v2.5', status: 'draft',    when: '2026-05-04 17:41', author: 'AK', note: 'Performance test reports v4 attached' },
  { v: 'v2.4', status: 'superseded',when:'2026-04-28 11:00', author: 'JC', note: 'Initial assembly · 18 sections' },
];

export const VAULT_KPIS = [
  { label: 'Artifacts in vault', metric: '247', meta: '12 awaiting signature · 3 retention review' },
  { label: 'Locked + signed',    metric: '184', meta: 'SHA-256 sealed for active submissions', tone: 'ok' },
  { label: 'Retention review',   metric: '3',   meta: 'Approaching 15-year minimum · audit before purge', tone: 'warn' },
  { label: 'Vault size',         metric: '4.2', unit: 'GB', meta: 'Across 10 folders · 7-year+ retention' },
];

export const VAULT_DOC_FRAMEWORKS = [
  { id: 'k510',    label: '510(k)',     desc: 'Submission artifacts' },
  { id: 'pma',     label: 'PMA',        desc: 'Premarket approval' },
  { id: 'cer',     label: 'CER',        desc: 'Clinical evaluation' },
  { id: 'eng',     label: 'Engineering',desc: 'DHF + RMF' },
  { id: 'qms',     label: 'QMS',        desc: 'Quality system' },
  { id: 'agency',  label: 'Agency',     desc: 'FDA / NB correspondence' },
];

