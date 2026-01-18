import React, { useEffect, useMemo, useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { apiRequest } from '@/lib/queryClient';
import {
  Activity,
  BarChart3,
  BookOpen,
  ClipboardList,
  FileCheck,
  FileSpreadsheet,
  FolderOpen,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  Wand2,
} from 'lucide-react';

const navItems = [
  { id: 'workbench', label: 'Workbench', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'programs', label: 'Programs', icon: <Target className="h-4 w-4" /> },
  { id: 'evidence', label: 'Evidence Library', icon: <FolderOpen className="h-4 w-4" /> },
  { id: 'claims', label: 'Claims Matrix', icon: <FileSpreadsheet className="h-4 w-4" /> },
  { id: 'standards', label: 'Standards', icon: <ShieldCheck className="h-4 w-4" /> },
  { id: 'outcomes', label: 'Outcomes', icon: <Activity className="h-4 w-4" /> },
  { id: 'coauthor', label: 'Co-Author', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'submissions', label: 'Submissions', icon: <FileCheck className="h-4 w-4" /> },
  { id: 'time-machine', label: 'Time Machine', icon: <Timer className="h-4 w-4" /> },
  { id: 'audit', label: 'Audit & Access', icon: <ClipboardList className="h-4 w-4" /> },
];

const defaultReadinessTiles = [
  {
    id: 'evidence',
    label: 'Evidence Coverage',
    score: 0,
    blockers: ['No readiness data available'],
  },
  {
    id: 'claims',
    label: 'Claims Coverage',
    score: 0,
    blockers: ['No readiness data available'],
  },
  {
    id: 'standards',
    label: 'Standards Coverage',
    score: 0,
    blockers: ['No readiness data available'],
  },
  {
    id: 'outcomes',
    label: 'Outcomes Substantiation',
    score: 0,
    blockers: ['No readiness data available'],
  },
];

const nextActions = [];

export default function RegulatoryWorkbench() {
  const { currentOrganization, currentClientWorkspace } = useTenant();
  const [activeSection, setActiveSection] = useState('workbench');
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('');
  const [evidenceFilter, setEvidenceFilter] = useState('all');
  const [selectedClaimId, setSelectedClaimId] = useState('');
  const [selectedStandardId, setSelectedStandardId] = useState('');
  const [selectedOutcomeId, setSelectedOutcomeId] = useState('');
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestPayload, setManifestPayload] = useState(null);
  const [readinessScore, setReadinessScore] = useState(0);
  const [readinessTiles, setReadinessTiles] = useState(defaultReadinessTiles);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightResults, setPreflightResults] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [submissionHistory, setSubmissionHistory] = useState([]);
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [auditEvents, setAuditEvents] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [allowUnresolvedExport, setAllowUnresolvedExport] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditEntityFilter, setAuditEntityFilter] = useState('');
  const [newEvidenceName, setNewEvidenceName] = useState('');
  const [newEvidenceType, setNewEvidenceType] = useState('clinical');
  const [newEvidenceOwner, setNewEvidenceOwner] = useState('Reg Affairs');
  const [evidenceUploadError, setEvidenceUploadError] = useState(null);
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState([]);
  const [bulkTag, setBulkTag] = useState('');
  const [newClaimText, setNewClaimText] = useState('');
  const [newClaimType, setNewClaimType] = useState('regulatory');
  const [newClaimRisk, setNewClaimRisk] = useState('medium');
  const [claimStatus, setClaimStatus] = useState('pending');
  const [claimRisk, setClaimRisk] = useState('medium');
  const [smartMatrix, setSmartMatrix] = useState(null);
  const [smartMatrixLoading, setSmartMatrixLoading] = useState(false);
  const [smartMatrixError, setSmartMatrixError] = useState(null);
  const [newStandardName, setNewStandardName] = useState('');
  const [newStandardRequirement, setNewStandardRequirement] = useState('');
  const [newStandardOwner, setNewStandardOwner] = useState('Reg Affairs');
  const [newStandardStatus, setNewStandardStatus] = useState('missing');
  const [standardStatus, setStandardStatus] = useState('missing');
  const [standardOwner, setStandardOwner] = useState('Reg Affairs');
  const [newOutcomeName, setNewOutcomeName] = useState('');
  const [newOutcomeTimepoint, setNewOutcomeTimepoint] = useState('');
  const [newOutcomeComparator, setNewOutcomeComparator] = useState('');
  const [newOutcomeConfidence, setNewOutcomeConfidence] = useState('low');
  const [newOutcomeStatus, setNewOutcomeStatus] = useState('missing');
  const [outcomeStatus, setOutcomeStatus] = useState('missing');
  const [outcomeConfidence, setOutcomeConfidence] = useState('low');
  const programOptions = useMemo(() => [], []);
  const [activeProgramId, setActiveProgramId] = useState('');

  const [evidenceItems, setEvidenceItems] = useState([]);

  const [claims, setClaims] = useState([]);

  const [standards, setStandards] = useState([]);

  const [outcomes, setOutcomes] = useState([]);

  useEffect(() => {
    const loadWorkbench = async () => {
      try {
        const response = await apiRequest(`/api/cer2v/workbench?programId=${activeProgramId}`);
        if (response?.evidence) setEvidenceItems(response.evidence);
        if (response?.claims) setClaims(response.claims);
        if (response?.standards) setStandards(response.standards);
        if (response?.outcomes) setOutcomes(response.outcomes);
      } catch {
        // fallback to default state
      }
    };

    loadWorkbench();
  }, [activeProgramId]);

  useEffect(() => {
    const loadEvidence = async () => {
      try {
        const endpoint =
          evidenceFilter === 'inbox'
            ? `/api/cer2v/evidence/inbox?programId=${activeProgramId}`
            : `/api/cer2v/evidence?programId=${activeProgramId}`;
        const response = await apiRequest(endpoint);
        if (response?.evidence) setEvidenceItems(response.evidence);
      } catch {
        // ignore
      }
    };

    loadEvidence();
  }, [activeProgramId, evidenceFilter]);

  useEffect(() => {
    const loadReadiness = async () => {
      try {
        const response = await apiRequest(`/api/cer2v/readiness?programId=${activeProgramId}`);
        if (Array.isArray(response?.tiles)) setReadinessTiles(response.tiles);
        if (Number.isFinite(response?.overallScore)) setReadinessScore(response.overallScore);
      } catch {
        // fallback to defaults
      }
    };

    loadReadiness();
  }, [activeProgramId]);

  useEffect(() => {
    if (evidenceItems.length && !evidenceItems.find(item => item.id === selectedEvidenceId)) {
      setSelectedEvidenceId(evidenceItems[0].id);
    }
  }, [evidenceItems, selectedEvidenceId]);

  const activeProgram = programOptions.find(program => program.id === activeProgramId);

  const filteredEvidence = evidenceItems.filter(item => {
    if (evidenceFilter === 'all') return true;
    if (evidenceFilter === 'inbox') return item.status === 'inbox';
    if (evidenceFilter === 'linked') return item.linkedClaims + item.linkedStandards + item.linkedOutcomes > 0;
    return item.type === evidenceFilter;
  });

  const evidenceHashCounts = useMemo(() => {
    return evidenceItems.reduce((acc, item) => {
      if (!item.hash) return acc;
      acc[item.hash] = (acc[item.hash] || 0) + 1;
      return acc;
    }, {});
  }, [evidenceItems]);

  const selectedEvidence = evidenceItems.find(item => item.id === selectedEvidenceId);
  const selectedClaim = claims.find(item => item.id === selectedClaimId);
  const selectedStandard = standards.find(item => item.id === selectedStandardId);
  const selectedOutcome = outcomes.find(item => item.id === selectedOutcomeId);

  useEffect(() => {
    if (selectedClaim) {
      setClaimStatus(selectedClaim.status || 'pending');
      setClaimRisk(selectedClaim.risk || 'medium');
    }
  }, [selectedClaim]);

  useEffect(() => {
    if (selectedStandard) {
      setStandardStatus(selectedStandard.status || 'missing');
      setStandardOwner(selectedStandard.owner || 'Reg Affairs');
    }
  }, [selectedStandard]);

  useEffect(() => {
    if (selectedOutcome) {
      setOutcomeStatus(selectedOutcome.status || 'missing');
      setOutcomeConfidence(selectedOutcome.confidence || 'low');
    }
  }, [selectedOutcome]);

  useEffect(() => {
    const loadSubmissions = async () => {
      setSubmissionLoading(true);
      try {
        const response = await apiRequest(`/api/cer2v/submissions?programId=${activeProgramId}`);
        if (Array.isArray(response?.records)) setSubmissionHistory(response.records);
      } catch {
        setSubmissionHistory([]);
      } finally {
        setSubmissionLoading(false);
      }
    };

    loadSubmissions();
  }, [activeProgramId]);

  useEffect(() => {
    if (activeSection !== 'audit') return;
    const loadAudit = async () => {
      setAuditLoading(true);
      try {
        const response = await apiRequest(`/api/cer2v/audit?programId=${activeProgramId}`);
        if (Array.isArray(response?.events)) setAuditEvents(response.events);
      } catch {
        setAuditEvents([]);
      } finally {
        setAuditLoading(false);
      }
    };

    loadAudit();
  }, [activeSection, activeProgramId]);

  const applyWorkbenchUpdate = response => {
    if (response?.evidence) setEvidenceItems(response.evidence);
    if (response?.claims) setClaims(response.claims);
    if (response?.standards) setStandards(response.standards);
    if (response?.outcomes) setOutcomes(response.outcomes);
  };

  const refreshReadiness = async () => {
    try {
      const response = await apiRequest(`/api/cer2v/readiness?programId=${activeProgramId}`);
      if (Array.isArray(response?.tiles)) setReadinessTiles(response.tiles);
      if (Number.isFinite(response?.overallScore)) setReadinessScore(response.overallScore);
    } catch {
      // keep previous readiness values
    }
  };

  const handleClassifyEvidence = async (evidenceId, type) => {
    try {
      const response = await apiRequest('/api/cer2v/evidence/classify', {
        method: 'POST',
        data: { evidenceId, type, programId: activeProgramId },
      });
      applyWorkbenchUpdate(response);
      await refreshReadiness();
    } catch {
      // keep UI state as-is on failure
    }
  };

  const handleLinkEvidence = async (kind, targetId) => {
    if (!selectedEvidenceId || !targetId) return;
    const endpointMap = {
      claims: `/api/cer2v/claims/${targetId}/link`,
      standards: `/api/cer2v/standards/${targetId}/link`,
      outcomes: `/api/cer2v/outcomes/${targetId}/link`,
    };
    const endpoint = endpointMap[kind];
    if (!endpoint) return;
    try {
      const response = await apiRequest(endpoint, {
        method: 'POST',
        data: { evidenceId: selectedEvidenceId, programId: activeProgramId },
      });
      applyWorkbenchUpdate(response);
      await refreshReadiness();
    } catch {
      // keep UI state as-is on failure
    }
  };

  const handleFetchManifest = async () => {
    setManifestLoading(true);
    try {
      const response = await apiRequest('/api/cer2v/manifest', {
        method: 'POST',
        data: { csrIds: ['CSR-DEMO-001'] },
      });
      setManifestPayload(response?.manifest || null);
      setVerifyResult(null);
    } catch (error) {
      setManifestPayload(null);
      setVerifyResult(null);
    } finally {
      setManifestLoading(false);
    }
  };

  const handleRunPreflight = async () => {
    setPreflightLoading(true);
    try {
      const response = await apiRequest('/api/cer2v/preflight', {
        method: 'POST',
        data: { programId: activeProgramId },
      });
      setPreflightResults(response || null);
    } catch {
      setPreflightResults(null);
    } finally {
      setPreflightLoading(false);
    }
  };

  const handleVerifyManifest = async () => {
    if (!manifestPayload) return;
    setVerifyLoading(true);
    try {
      const response = await apiRequest('/api/cer2v/verify', {
        method: 'POST',
        data: { manifest: manifestPayload },
      });
      setVerifyResult(response || null);
    } catch {
      setVerifyResult({ success: false, match: false });
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleRefreshSubmissions = async () => {
    setSubmissionLoading(true);
    try {
      const response = await apiRequest(`/api/cer2v/submissions?programId=${activeProgramId}`);
      if (Array.isArray(response?.records)) setSubmissionHistory(response.records);
    } catch {
      setSubmissionHistory([]);
    } finally {
      setSubmissionLoading(false);
    }
  };

  const handleRefreshAudit = async () => {
    setAuditLoading(true);
    try {
      const response = await apiRequest(`/api/cer2v/audit?programId=${activeProgramId}`);
      if (Array.isArray(response?.events)) setAuditEvents(response.events);
    } catch {
      setAuditEvents([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleCreateEvidence = async () => {
    if (!newEvidenceName.trim()) return;
    try {
      const response = await apiRequest('/api/cer2v/evidence', {
        method: 'POST',
        data: {
          programId: activeProgramId,
          evidenceId: `ev-${Date.now()}`,
          name: newEvidenceName.trim(),
          evidenceType: newEvidenceType,
          owner: newEvidenceOwner,
          status: 'inbox',
        },
      });
      if (response?.evidence) setEvidenceItems(response.evidence);
      if (response?.evidence == null && response?.claims) applyWorkbenchUpdate(response);
      setNewEvidenceName('');
    } catch {
      // ignore
    }
  };

  const handleUploadEvidence = async event => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setEvidenceUploadError(null);
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('programId', activeProgramId);
      formData.append('evidenceType', newEvidenceType);
      formData.append('owner', newEvidenceOwner);
      const response = await fetch('/api/cer2v/evidence/upload', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setEvidenceUploadError(payload?.error || 'Upload failed');
        return;
      }
      const payload = await response.json();
      if (payload?.evidence) setEvidenceItems(payload.evidence);
    } catch {
      setEvidenceUploadError('Upload failed');
    } finally {
      event.target.value = '';
    }
  };

  const handleUpdateEvidence = async () => {
    if (!selectedEvidenceId) return;
    try {
      const response = await apiRequest(`/api/cer2v/evidence/${selectedEvidenceId}`, {
        method: 'PATCH',
        data: {
          programId: activeProgramId,
          name: selectedEvidence?.name,
          evidenceType: selectedEvidence?.type,
          status: selectedEvidence?.status,
          owner: selectedEvidence?.owner,
          hash: selectedEvidence?.hash,
        },
      });
      if (response?.evidence) setEvidenceItems(response.evidence);
    } catch {
      // ignore
    }
  };

  const handleToggleEvidenceSelection = (evidenceId, checked) => {
    setSelectedEvidenceIds(prev =>
      checked ? [...prev, evidenceId] : prev.filter(id => id !== evidenceId)
    );
  };

  const handleBulkUpdate = async payload => {
    if (!selectedEvidenceIds.length) return;
    try {
      const response = await apiRequest('/api/cer2v/evidence/bulk', {
        method: 'PATCH',
        data: {
          programId: activeProgramId,
          evidenceIds: selectedEvidenceIds,
          ...payload,
        },
      });
      if (response?.evidence) setEvidenceItems(response.evidence);
      setSelectedEvidenceIds([]);
    } catch {
      // ignore
    }
  };

  const handleArchiveDuplicates = async () => {
    try {
      const response = await apiRequest('/api/cer2v/evidence/dedupe', {
        method: 'POST',
        data: { programId: activeProgramId },
      });
      if (response?.evidence) setEvidenceItems(response.evidence);
    } catch {
      // ignore
    }
  };

  const handleCreateClaim = async () => {
    if (!newClaimText.trim()) return;
    try {
      const response = await apiRequest('/api/cer2v/claims', {
        method: 'POST',
        data: {
          programId: activeProgramId,
          text: newClaimText.trim(),
          type: newClaimType,
          risk: newClaimRisk,
          status: 'pending',
        },
      });
      if (response?.claims) {
        setClaims(response.claims);
      } else if (response?.evidence) {
        applyWorkbenchUpdate(response);
      }
      setNewClaimText('');
    } catch {
      // ignore for now
    }
  };

  const handleUpdateClaim = async () => {
    if (!selectedClaimId) return;
    try {
      const response = await apiRequest(`/api/cer2v/claims/${selectedClaimId}`, {
        method: 'PATCH',
        data: {
          programId: activeProgramId,
          status: claimStatus,
          risk: claimRisk,
        },
      });
      if (response?.claims) setClaims(response.claims);
      if (response?.evidence) applyWorkbenchUpdate(response);
    } catch {
      // ignore
    }
  };

  const handleGenerateSmartMatrix = async () => {
    setSmartMatrixLoading(true);
    setSmartMatrixError(null);
    try {
      const response = await apiRequest('POST', '/api/smart-claims-matrix/generate', {
        deviceId: activeProgramId,
        cerIds: [activeProgramId],
      });
      const payload = await response.json();
      if (payload?.matrix) {
        setSmartMatrix(payload.matrix);
      } else {
        setSmartMatrixError('No matrix returned');
      }
    } catch (error) {
      setSmartMatrixError(error?.message || 'Failed to generate smart matrix');
    } finally {
      setSmartMatrixLoading(false);
    }
  };

  const handleExportClaims = () => {
    const header = ['Claim', 'Type', 'Risk', 'Status', 'Linked Evidence', 'Strength'];
    const rows = claims.map(item => [
      item.text,
      item.type,
      item.risk,
      item.status,
      String(item.linkedEvidence || 0),
      String(item.strength || 0),
    ]);
    const csv = [header, ...rows]
      .map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `claims-matrix-${activeProgramId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSubmission = async () => {
    const citationSummary = {
      totalTokens: 0,
      resolvedTokens: 0,
      unresolvedTokens: 0,
    };
    try {
      const response = await fetch('/api/cer2v/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csrIds: ['CSR-DEMO-001'],
          programId: activeProgramId,
          citationSummary,
          allowUnresolved: allowUnresolvedExport,
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        setExportError(errorPayload?.error || 'Export failed');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cer2v-export-${activeProgramId}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      await handleRefreshSubmissions();
      setExportError(null);
    } catch {
      setExportError('Export failed');
    }
  };

  const handleCreateStandard = async () => {
    if (!newStandardName.trim() || !newStandardRequirement.trim()) return;
    try {
      const response = await apiRequest('/api/cer2v/standards', {
        method: 'POST',
        data: {
          programId: activeProgramId,
          name: newStandardName.trim(),
          requirement: newStandardRequirement.trim(),
          status: newStandardStatus,
          owner: newStandardOwner,
        },
      });
      if (response?.standards) setStandards(response.standards);
      if (response?.evidence) applyWorkbenchUpdate(response);
      setNewStandardName('');
      setNewStandardRequirement('');
    } catch {
      // ignore
    }
  };

  const handleUpdateStandard = async () => {
    if (!selectedStandardId) return;
    try {
      const response = await apiRequest(`/api/cer2v/standards/${selectedStandardId}`, {
        method: 'PATCH',
        data: {
          programId: activeProgramId,
          status: standardStatus,
          owner: standardOwner,
        },
      });
      if (response?.standards) setStandards(response.standards);
      if (response?.evidence) applyWorkbenchUpdate(response);
    } catch {
      // ignore
    }
  };

  const handleExportStandards = () => {
    const header = ['Standard', 'Requirement', 'Status', 'Owner', 'Linked Evidence'];
    const rows = standards.map(item => [
      item.name,
      item.requirement,
      item.status,
      item.owner,
      String(item.linkedEvidence || 0),
    ]);
    const csv = [header, ...rows]
      .map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `standards-coverage-${activeProgramId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateOutcome = async () => {
    if (!newOutcomeName.trim()) return;
    try {
      const response = await apiRequest('/api/cer2v/outcomes', {
        method: 'POST',
        data: {
          programId: activeProgramId,
          name: newOutcomeName.trim(),
          timepoint: newOutcomeTimepoint.trim() || 'TBD',
          comparator: newOutcomeComparator.trim() || 'TBD',
          confidence: newOutcomeConfidence,
          status: newOutcomeStatus,
        },
      });
      if (response?.outcomes) setOutcomes(response.outcomes);
      if (response?.evidence) applyWorkbenchUpdate(response);
      setNewOutcomeName('');
      setNewOutcomeTimepoint('');
      setNewOutcomeComparator('');
    } catch {
      // ignore
    }
  };

  const handleUpdateOutcome = async () => {
    if (!selectedOutcomeId) return;
    try {
      const response = await apiRequest(`/api/cer2v/outcomes/${selectedOutcomeId}`, {
        method: 'PATCH',
        data: {
          programId: activeProgramId,
          status: outcomeStatus,
          confidence: outcomeConfidence,
        },
      });
      if (response?.outcomes) setOutcomes(response.outcomes);
      if (response?.evidence) applyWorkbenchUpdate(response);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-220px)] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur">
      <aside className="w-72 border-r border-slate-200 bg-slate-50/80 p-4 flex flex-col gap-4">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Program</div>
          <div className="mt-2 space-y-2">
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={activeProgramId}
              onChange={event => setActiveProgramId(event.target.value)}
            >
              {programOptions.map(program => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
            <Badge variant="outline" className="text-xs">
              {currentClientWorkspace?.name || 'Client workspace'}
            </Badge>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                activeSection === item.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Command palette: <span className="font-medium">Cmd/Ctrl + K</span>
        </div>
      </aside>

      <section className="flex-1 overflow-y-auto">
        <div className="border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Organization</div>
              <div className="text-lg font-semibold">
                {currentOrganization?.name || 'Concept2Cure'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-slate-200 text-slate-700">
                {activeProgram?.name || 'Program'}
              </Badge>
              <Badge className="bg-emerald-100 text-emerald-800">
                Readiness {readinessScore}%
              </Badge>
              <Button variant="outline" size="sm">
                <Sparkles className="mr-2 h-4 w-4" />
                Cmd + K
              </Button>
              <Button size="sm" onClick={handleExportSubmission}>
                <Wand2 className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6 p-6">
          <div className="col-span-12 lg:col-span-8 space-y-6">
            {activeSection === 'workbench' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {readinessTiles.map(tile => (
                    <Card key={tile.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{tile.label}</CardTitle>
                        <CardDescription>{tile.score}% ready</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Progress value={tile.score} />
                        <div className="text-xs text-muted-foreground">Top blockers</div>
                        <ul className="text-sm space-y-1">
                          {tile.blockers.map(blocker => (
                            <li key={blocker} className="flex items-start gap-2">
                              <span className="mt-1 h-2 w-2 rounded-full bg-amber-500" />
                              {blocker}
                            </li>
                          ))}
                        </ul>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveSection(tile.id)}
                        >
                          Fix next
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Next Best Actions</CardTitle>
                    <CardDescription>Prioritized tasks to unlock export readiness</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {nextActions.map(action => (
                      <div
                        key={action.label}
                        className="flex items-center justify-between rounded-lg border p-3 text-sm"
                      >
                        <div>
                          <div className="font-medium">{action.label}</div>
                          <div className="text-xs text-muted-foreground">{action.context}</div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveSection(action.section)}
                        >
                          Open
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection !== 'workbench' &&
              activeSection !== 'evidence' &&
              activeSection !== 'claims' &&
              activeSection !== 'standards' &&
              activeSection !== 'outcomes' &&
              activeSection !== 'submissions' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{navItems.find(item => item.id === activeSection)?.label}</CardTitle>
                  <CardDescription>Workbench panel placeholder (scaffolded for Epic 1).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    This section will host the live {navItems.find(item => item.id === activeSection)?.label} workbench
                    view with list + canvas + inspector.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setActiveSection('workbench')}>
                    Back to Workbench
                  </Button>
                </CardContent>
              </Card>
            )}

            {activeSection === 'evidence' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Evidence Inbox</CardTitle>
                    <CardDescription>Classify evidence before linking it to claims, standards, and outcomes.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={newEvidenceName}
                        onChange={event => setNewEvidenceName(event.target.value)}
                        placeholder="Evidence name"
                        className="flex-1 min-w-[220px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                      <select
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={newEvidenceType}
                        onChange={event => setNewEvidenceType(event.target.value)}
                      >
                        <option value="clinical">Clinical</option>
                        <option value="bench">Bench</option>
                        <option value="biocompatibility">Biocompatibility</option>
                        <option value="labeling">Labeling</option>
                      </select>
                      <input
                        value={newEvidenceOwner}
                        onChange={event => setNewEvidenceOwner(event.target.value)}
                        placeholder="Owner"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                      <Button size="sm" onClick={handleCreateEvidence}>
                        Add evidence
                      </Button>
                      <label className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm cursor-pointer">
                        Upload file
                        <input type="file" className="hidden" multiple onChange={handleUploadEvidence} />
                      </label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleArchiveDuplicates}
                      >
                        Archive duplicates
                      </Button>
                    </div>
                    {evidenceUploadError && (
                      <div className="text-xs text-amber-700">{evidenceUploadError}</div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={bulkTag}
                        onChange={event => setBulkTag(event.target.value)}
                        placeholder="Tag selected"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleBulkUpdate({
                            tags: bulkTag ? [bulkTag] : [],
                          })
                        }
                      >
                        Apply tag
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkUpdate({ status: 'archived' })}
                      >
                        Archive selected
                      </Button>
                    </div>
                  </CardContent>
                  <CardContent className="flex flex-wrap items-center gap-2">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'inbox', label: 'Inbox' },
                      { id: 'linked', label: 'Linked' },
                      { id: 'clinical', label: 'Clinical' },
                      { id: 'bench', label: 'Bench' },
                      { id: 'biocompatibility', label: 'Biocomp' },
                      { id: 'labeling', label: 'Labeling' },
                    ].map(filter => (
                      <Button
                        key={filter.id}
                        variant={evidenceFilter === filter.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setEvidenceFilter(filter.id)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Evidence Library</CardTitle>
                    <CardDescription>File-first evidence objects with traceable metadata.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {filteredEvidence.map(item => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedEvidenceId(item.id)}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          selectedEvidenceId === item.id
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-muted-foreground/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">{item.type} • {item.owner}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedEvidenceIds.includes(item.id)}
                              onChange={event => {
                                event.stopPropagation();
                                handleToggleEvidenceSelection(item.id, event.target.checked);
                              }}
                            />
                            <Badge variant={item.status === 'inbox' ? 'outline' : 'default'}>
                              {item.status === 'inbox' ? 'Inbox' : 'Classified'}
                            </Badge>
                            {item.hash && evidenceHashCounts[item.hash] > 1 && (
                              <Badge variant="destructive">Duplicate</Badge>
                            )}
                            <Badge variant="outline">
                              {item.linkedClaims + item.linkedStandards + item.linkedOutcomes} links
                            </Badge>
                          </div>
                        </div>
                        {item.status === 'inbox' && (
                          <div className="mt-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={event => {
                                event.stopPropagation();
                                handleClassifyEvidence(item.id);
                              }}
                            >
                              Classify & Add Metadata
                            </Button>
                          </div>
                        )}
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={event => {
                              event.stopPropagation();
                              window.open(
                                `/api/cer2v/evidence/${item.id}/download?programId=${activeProgramId}`,
                                '_blank'
                              );
                            }}
                          >
                            Download
                          </Button>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'claims' && (
              <div className="space-y-4">
                <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-slate-50">
                  <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-base">Smart Claims Matrix (AI)</CardTitle>
                      <CardDescription>Regulatory readiness, predicted feedback, and defensibility scoring.</CardDescription>
                    </div>
                    <Button size="sm" onClick={handleGenerateSmartMatrix} disabled={smartMatrixLoading}>
                      {smartMatrixLoading ? 'Generating…' : 'Generate AI Matrix'}
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {smartMatrixError && (
                      <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700">
                        {smartMatrixError}
                      </div>
                    )}
                    {!smartMatrix && !smartMatrixError && (
                      <div className="text-muted-foreground">
                        Generate to see AI readiness, critical gaps, and predicted reviewer feedback.
                      </div>
                    )}
                    {smartMatrix && (
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="rounded-lg border bg-white p-3">
                          <div className="text-xs text-muted-foreground">Readiness</div>
                          <div className="text-lg font-semibold capitalize">{smartMatrix.regulatoryReadiness}</div>
                        </div>
                        <div className="rounded-lg border bg-white p-3">
                          <div className="text-xs text-muted-foreground">Compliance</div>
                          <div className="text-lg font-semibold">{smartMatrix.complianceScore}%</div>
                        </div>
                        <div className="rounded-lg border bg-white p-3">
                          <div className="text-xs text-muted-foreground">Claims analyzed</div>
                          <div className="text-lg font-semibold">{smartMatrix.totalClaims}</div>
                        </div>
                        <div className="rounded-lg border bg-white p-3">
                          <div className="text-xs text-muted-foreground">Opportunity score</div>
                          <div className="text-lg font-semibold">{smartMatrix.opportunityScore}</div>
                        </div>
                        <div className="md:col-span-2 rounded-lg border bg-white p-3">
                          <div className="text-xs text-muted-foreground">Predicted FDA feedback</div>
                          <ul className="mt-2 list-disc pl-4 text-sm">
                            {(smartMatrix.predictedFdaFeedback || []).length === 0 && (
                              <li>No critical feedback predicted.</li>
                            )}
                            {(smartMatrix.predictedFdaFeedback || []).map(item => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="md:col-span-2 rounded-lg border bg-white p-3">
                          <div className="text-xs text-muted-foreground">Predicate recommendations</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(smartMatrix.predicateDeviceRecommendations || []).map(item => (
                              <Badge key={item} variant="outline">{item}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Claims Matrix</CardTitle>
                    <CardDescription>Traceable claims with evidence strength and gaps.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={newClaimText}
                        onChange={event => setNewClaimText(event.target.value)}
                        placeholder="Add a new claim"
                        className="flex-1 min-w-[220px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                      <select
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={newClaimType}
                        onChange={event => setNewClaimType(event.target.value)}
                      >
                        <option value="regulatory">Regulatory</option>
                        <option value="labeling">Labeling</option>
                        <option value="marketing">Marketing</option>
                      </select>
                      <select
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={newClaimRisk}
                        onChange={event => setNewClaimRisk(event.target.value)}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <Button size="sm" onClick={handleCreateClaim}>
                        Add claim
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleExportClaims}>
                        Export CSV
                      </Button>
                    </div>
                  </CardContent>
                  <CardContent className="space-y-3">
                    {claims.map(claim => (
                      <button
                        key={claim.id}
                        onClick={() => setSelectedClaimId(claim.id)}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          selectedClaimId === claim.id
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-muted-foreground/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">{claim.text}</div>
                            <div className="text-xs text-muted-foreground">{claim.type} • {claim.risk} risk</div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant="outline">{claim.status}</Badge>
                            <Badge variant="outline">{claim.linkedEvidence} evidence</Badge>
                          </div>
                        </div>
                        <div className="mt-3">
                          <Progress value={claim.strength} />
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'standards' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Consensus Standards</CardTitle>
                    <CardDescription>Map requirements to evidence artifacts.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        value={newStandardName}
                        onChange={event => setNewStandardName(event.target.value)}
                        placeholder="Standard name (e.g., ISO 10993-5)"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                      <input
                        value={newStandardOwner}
                        onChange={event => setNewStandardOwner(event.target.value)}
                        placeholder="Owner"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                      <input
                        value={newStandardRequirement}
                        onChange={event => setNewStandardRequirement(event.target.value)}
                        placeholder="Requirement summary"
                        className="md:col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                        <select
                          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                          value={newStandardStatus}
                          onChange={event => setNewStandardStatus(event.target.value)}
                        >
                          <option value="missing">Missing</option>
                          <option value="needs-review">Needs review</option>
                          <option value="satisfied">Satisfied</option>
                        </select>
                        <Button size="sm" onClick={handleCreateStandard}>
                          Add standard
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportStandards}>
                          Export coverage CSV
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                  <CardContent className="space-y-3">
                    {standards.map(requirement => (
                      <button
                        key={requirement.id}
                        onClick={() => setSelectedStandardId(requirement.id)}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          selectedStandardId === requirement.id
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-muted-foreground/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">{requirement.name}</div>
                            <div className="text-xs text-muted-foreground">{requirement.requirement}</div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant="outline">{requirement.status}</Badge>
                            <Badge variant="outline">{requirement.linkedEvidence} evidence</Badge>
                          </div>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'outcomes' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Outcomes Substantiation</CardTitle>
                    <CardDescription>Structured outcomes tied to clinical evidence.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        value={newOutcomeName}
                        onChange={event => setNewOutcomeName(event.target.value)}
                        placeholder="Outcome name"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                      <input
                        value={newOutcomeTimepoint}
                        onChange={event => setNewOutcomeTimepoint(event.target.value)}
                        placeholder="Timepoint"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                      <input
                        value={newOutcomeComparator}
                        onChange={event => setNewOutcomeComparator(event.target.value)}
                        placeholder="Comparator"
                        className="md:col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                        <select
                          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                          value={newOutcomeConfidence}
                          onChange={event => setNewOutcomeConfidence(event.target.value)}
                        >
                          <option value="low">Low confidence</option>
                          <option value="medium">Medium confidence</option>
                          <option value="high">High confidence</option>
                        </select>
                        <select
                          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                          value={newOutcomeStatus}
                          onChange={event => setNewOutcomeStatus(event.target.value)}
                        >
                          <option value="missing">Missing</option>
                          <option value="partial">Partial</option>
                          <option value="supported">Supported</option>
                        </select>
                        <Button size="sm" onClick={handleCreateOutcome}>
                          Add outcome
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                  <CardContent className="space-y-3">
                    {outcomes.map(outcome => (
                      <button
                        key={outcome.id}
                        onClick={() => setSelectedOutcomeId(outcome.id)}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          selectedOutcomeId === outcome.id
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-muted-foreground/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">{outcome.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {outcome.timepoint} • Comparator: {outcome.comparator}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant="outline">{outcome.status}</Badge>
                            <Badge variant="outline">{outcome.linkedEvidence} evidence</Badge>
                          </div>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'submissions' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Submission Center</CardTitle>
                    <CardDescription>Preflight checks, export history, and RegTrace attestation.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="rounded-lg border p-3">
                      <div className="font-medium">Preflight Status</div>
                      <p className="text-muted-foreground">
                        {preflightResults?.checks
                          ? `${preflightResults.blocking || 0} critical blockers detected.`
                          : 'Run checks before export.'}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={handleRunPreflight}
                      >
                        {preflightLoading ? 'Running...' : 'Run preflight checks'}
                      </Button>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="font-medium">Export controls</div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          id="allow-unresolved"
                          type="checkbox"
                          checked={allowUnresolvedExport}
                          onChange={event => setAllowUnresolvedExport(event.target.checked)}
                        />
                        <label htmlFor="allow-unresolved">
                          Allow export with unresolved citations
                        </label>
                      </div>
                      {exportError && (
                        <div className="mt-2 text-xs text-amber-700">{exportError}</div>
                      )}
                    </div>
                    {preflightResults?.checks && (
                      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                        <div className="font-medium text-sm text-foreground">Regulatory CI checks</div>
                        <ul className="mt-2 space-y-2">
                          {preflightResults.checks.map(check => (
                            <li key={check.checkId} className="flex items-start gap-2">
                              <span
                                className={`mt-1 h-2 w-2 rounded-full ${
                                  check.status === 'pass'
                                    ? 'bg-emerald-500'
                                    : check.severity === 'high'
                                      ? 'bg-red-500'
                                      : 'bg-amber-500'
                                }`}
                              />
                              <div>
                                <div className="font-medium text-foreground">
                                  {check.status.toUpperCase()} • {check.severity}
                                </div>
                                <div>{check.message}</div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">Export history</div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRefreshSubmissions}
                        >
                          {submissionLoading ? 'Refreshing...' : 'Refresh'}
                        </Button>
                      </div>
                      <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                        {submissionHistory.length === 0 && (
                          <div>No exports recorded yet.</div>
                        )}
                        {submissionHistory.map(record => (
                          <div key={record.exportId} className="rounded-md border bg-background p-2">
                            <div className="font-medium text-foreground">{record.filename}</div>
                            <div>Exported {record.createdAt}</div>
                            <div>Evidence {record.integrity?.evidenceCount ?? 0}</div>
                            <div className="break-all">
                              Merkle {record.integrity?.merkleRoot || 'n/a'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="font-medium">RegTrace Manifest</div>
                      <p className="text-muted-foreground">Last export has a signed manifest with evidence map.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={handleFetchManifest}
                      >
                        {manifestLoading ? 'Loading...' : 'View attestation'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 ml-2"
                        onClick={handleVerifyManifest}
                        disabled={!manifestPayload}
                      >
                        {verifyLoading ? 'Verifying...' : 'Verify integrity'}
                      </Button>
                      {verifyResult && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {verifyResult.match
                            ? 'Integrity verified (Merkle root match).'
                            : 'Integrity check failed.'}
                        </div>
                      )}
                    </div>
                    {manifestPayload && (
                      <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                        <div className="font-medium text-sm text-foreground">RegTrace manifest snapshot</div>
                        <pre className="mt-2 whitespace-pre-wrap">
                          {JSON.stringify(manifestPayload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'audit' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Audit & Access</CardTitle>
                    <CardDescription>Traceable activity log for CERv2 actions.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        value={auditActionFilter}
                        onChange={event => setAuditActionFilter(event.target.value)}
                        placeholder="Filter by action"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                      <input
                        value={auditEntityFilter}
                        onChange={event => setAuditEntityFilter(event.target.value)}
                        placeholder="Filter by entity"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        {auditEvents.length} events
                      </div>
                      <Button variant="outline" size="sm" onClick={handleRefreshAudit}>
                        {auditLoading ? 'Refreshing...' : 'Refresh'}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {auditEvents.length === 0 && (
                        <div className="rounded-md border p-3 text-xs text-muted-foreground">
                          No audit events yet.
                        </div>
                      )}
                      {auditEvents
                        .filter(event =>
                          auditActionFilter
                            ? String(event.action || '')
                                .toLowerCase()
                                .includes(auditActionFilter.toLowerCase())
                            : true
                        )
                        .filter(event =>
                          auditEntityFilter
                            ? `${event.entityType || ''}:${event.entityId || ''}`
                                .toLowerCase()
                                .includes(auditEntityFilter.toLowerCase())
                            : true
                        )
                        .map(event => (
                        <div key={event.id} className="rounded-md border p-3 text-xs">
                          <div className="font-medium text-foreground">{event.action}</div>
                          <div className="text-muted-foreground">{event.diffSummary || 'No summary'}</div>
                          <div className="text-muted-foreground">
                            {event.entityType ? `${event.entityType}: ${event.entityId}` : 'No entity'}
                          </div>
                          <div className="text-muted-foreground">
                            {event.createdAt}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          <aside className="col-span-12 lg:col-span-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inspector</CardTitle>
                <CardDescription>Metadata and quick actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {activeSection === 'evidence' && selectedEvidence ? (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Evidence object</div>
                      <div className="font-medium">{selectedEvidence.name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Type</div>
                      <div className="font-medium">{selectedEvidence.type}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Hash</div>
                      <div className="font-medium">{selectedEvidence.hash}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Linked evidence</div>
                      <div className="font-medium">
                        Claims {selectedEvidence.linkedClaims} • Standards {selectedEvidence.linkedStandards} • Outcomes {selectedEvidence.linkedOutcomes}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{selectedEvidence.status}</Badge>
                      <Badge variant="outline">Uploaded {selectedEvidence.uploadedAt}</Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(
                          `/api/cer2v/evidence/${selectedEvidence.id}/download?programId=${activeProgramId}`,
                          '_blank'
                        )
                      }
                    >
                      Download evidence
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Type</div>
                        <select
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          value={selectedEvidence.type}
                          onChange={event =>
                            setEvidenceItems(prev =>
                              prev.map(item =>
                                item.id === selectedEvidence.id
                                  ? { ...item, type: event.target.value }
                                  : item
                              )
                            )
                          }
                        >
                          <option value="clinical">Clinical</option>
                          <option value="bench">Bench</option>
                          <option value="biocompatibility">Biocompatibility</option>
                          <option value="labeling">Labeling</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Owner</div>
                        <input
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          value={selectedEvidence.owner}
                          onChange={event =>
                            setEvidenceItems(prev =>
                              prev.map(item =>
                                item.id === selectedEvidence.id
                                  ? { ...item, owner: event.target.value }
                                  : item
                              )
                            )
                          }
                        />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Status</div>
                        <select
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          value={selectedEvidence.status}
                          onChange={event =>
                            setEvidenceItems(prev =>
                              prev.map(item =>
                                item.id === selectedEvidence.id
                                  ? { ...item, status: event.target.value }
                                  : item
                              )
                            )
                          }
                        >
                          <option value="inbox">Inbox</option>
                          <option value="classified">Classified</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Hash</div>
                        <input
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          value={selectedEvidence.hash}
                          onChange={event =>
                            setEvidenceItems(prev =>
                              prev.map(item =>
                                item.id === selectedEvidence.id
                                  ? { ...item, hash: event.target.value }
                                  : item
                              )
                            )
                          }
                        />
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleUpdateEvidence}>
                      Update evidence
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setActiveSection('claims')}>
                      Link in claims matrix
                    </Button>
                  </>
                ) : activeSection === 'claims' && selectedClaim ? (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Selected claim</div>
                      <div className="font-medium">{selectedClaim.text}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Type</div>
                      <div className="font-medium">{selectedClaim.type}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Risk</div>
                      <div className="font-medium">{selectedClaim.risk}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Status</div>
                        <select
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          value={claimStatus}
                          onChange={event => setClaimStatus(event.target.value)}
                        >
                          <option value="pending">Pending</option>
                          <option value="supported">Supported</option>
                          <option value="at-risk">At risk</option>
                          <option value="needs-evidence">Needs evidence</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Risk level</div>
                        <select
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          value={claimRisk}
                          onChange={event => setClaimRisk(event.target.value)}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Evidence strength</div>
                      <div className="font-medium">{selectedClaim.strength}%</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Selected evidence: {selectedEvidenceId || 'None'}
                    </div>
                    <Button variant="outline" size="sm" onClick={handleUpdateClaim}>
                      Update claim
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!selectedEvidenceId}
                      onClick={() => handleLinkEvidence('claims', selectedClaimId)}
                    >
                      Link selected evidence
                    </Button>
                  </>
                ) : activeSection === 'standards' && selectedStandard ? (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Standard</div>
                      <div className="font-medium">{selectedStandard.name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Requirement</div>
                      <div className="font-medium">{selectedStandard.requirement}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Status</div>
                      <div className="font-medium">{selectedStandard.status}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Status</div>
                        <select
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          value={standardStatus}
                          onChange={event => setStandardStatus(event.target.value)}
                        >
                          <option value="missing">Missing</option>
                          <option value="needs-review">Needs review</option>
                          <option value="satisfied">Satisfied</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Owner</div>
                        <input
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          value={standardOwner}
                          onChange={event => setStandardOwner(event.target.value)}
                        />
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleUpdateStandard}>
                      Update standard
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      Selected evidence: {selectedEvidenceId || 'None'}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!selectedEvidenceId}
                      onClick={() => handleLinkEvidence('standards', selectedStandardId)}
                    >
                      Attach selected evidence
                    </Button>
                  </>
                ) : activeSection === 'outcomes' && selectedOutcome ? (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Outcome</div>
                      <div className="font-medium">{selectedOutcome.name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Timepoint</div>
                      <div className="font-medium">{selectedOutcome.timepoint}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Confidence</div>
                      <div className="font-medium">{selectedOutcome.confidence}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Status</div>
                        <select
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          value={outcomeStatus}
                          onChange={event => setOutcomeStatus(event.target.value)}
                        >
                          <option value="missing">Missing</option>
                          <option value="partial">Partial</option>
                          <option value="supported">Supported</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Confidence</div>
                        <select
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          value={outcomeConfidence}
                          onChange={event => setOutcomeConfidence(event.target.value)}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleUpdateOutcome}>
                      Update outcome
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      Selected evidence: {selectedEvidenceId || 'None'}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!selectedEvidenceId}
                      onClick={() => handleLinkEvidence('outcomes', selectedOutcomeId)}
                    >
                      Link selected evidence
                    </Button>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Active program</div>
                      <div className="font-medium">{activeProgram?.name || 'Program'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Pathway</div>
                      <div className="font-medium">510(k)</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Next export target</div>
                      <div className="font-medium">eCTD bundle v0.4</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Audit ready</Badge>
                      <Badge variant="outline">Traceable</Badge>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Signals</CardTitle>
                <CardDescription>Realtime readiness telemetry</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Evidence inbox</span>
                  <Badge variant="outline">7 new</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Claims needing review</span>
                  <Badge variant="outline">3</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Standards gaps</span>
                  <Badge variant="outline">1</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button variant="outline" size="sm">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  View readiness report
                </Button>
                <Button variant="outline" size="sm">
                  <FileCheck className="mr-2 h-4 w-4" />
                  Run preflight
                </Button>
                <Button variant="outline" size="sm">
                  <Activity className="mr-2 h-4 w-4" />
                  Open audit trail
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>
    </div>
  );
}
