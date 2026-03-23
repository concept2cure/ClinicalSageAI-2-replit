import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Eye, FileCheck, FileText, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function CMCReportsTab({
  projects,
  selectedProjectId,
  onSelectedProjectIdChange,
  drugSubstances,
  drugProducts,
}) {
  const [reportHistory, setReportHistory] = useState([]);
  const [reportHistoryLoading, setReportHistoryLoading] = useState(false);
  const [reportNotes, setReportNotes] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [collaborationNotes, setCollaborationNotes] = useState([]);
  const [newCollaborationNote, setNewCollaborationNote] = useState({ owner: '', note: '' });
  const [savingReport, setSavingReport] = useState(false);
  const [reportPreview, setReportPreview] = useState('');
  const { toast } = useToast();

  const selectedProject = useMemo(
    () => projects.find(project => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const reportDataFlow = useMemo(() => {
    const projectSubstances = selectedProjectId
      ? drugSubstances.filter(item => item.projectId === selectedProjectId)
      : drugSubstances;
    const projectProducts = selectedProjectId
      ? drugProducts.filter(item => item.projectId === selectedProjectId)
      : drugProducts;

    const openSubstanceItems = projectSubstances.filter(item => item.status !== 'approved').length;
    const openProductItems = projectProducts.filter(item => item.status !== 'approved').length;

    return {
      projectSubstances,
      projectProducts,
      complianceGaps: openSubstanceItems + openProductItems,
      activeProjects: projects.filter(item => item.status === 'active').length,
    };
  }, [selectedProjectId, drugSubstances, drugProducts, projects]);

  const buildReportMarkdown = useCallback(() => {
    const now = new Date().toISOString();
    const lines = [
      `# CMC Executive Snapshot`,
      ``,
      `- Generated At: ${now}`,
      `- Project: ${selectedProject?.name || 'All Projects'}`,
      `- Project ID: ${selectedProjectId || 'N/A'}`,
      ``,
      `## Data Flow Summary`,
      `- Projects in scope: ${selectedProject ? 1 : projects.length}`,
      `- Drug Substances used by module: ${reportDataFlow.projectSubstances.length}`,
      `- Drug Products used by module: ${reportDataFlow.projectProducts.length}`,
      `- Derived open compliance items: ${reportDataFlow.complianceGaps}`,
      ``,
      `## Cross-tab Data Usage`,
      `- Projects tab consumes /api/cmc/projects and powers ownership, region, stage, and status.`,
      `- Drug Substances tab consumes /api/cmc/drug-substances and feeds quality/compliance narratives.`,
      `- Drug Products tab consumes /api/cmc/drug-products and feeds formulation/container controls.`,
      `- Compliance tab derives readiness indicators from substances + products status distribution.`,
      `- Reports tab composes all tab data into project-level snapshot and collaboration notes.`,
      ``,
      `## Collaboration Notes`,
      ...(collaborationNotes.length === 0
        ? ['- No collaboration notes captured yet.']
        : collaborationNotes.map(
            note =>
              `- [${note.owner || 'Unassigned'}] ${note.note} (${new Date(note.createdAt).toLocaleString()})`
          )),
      ``,
      `## Additional Analyst Notes`,
      reportNotes || 'No additional notes.',
      ``,
    ];
    return lines.join('\n');
  }, [selectedProject, selectedProjectId, projects.length, reportDataFlow, collaborationNotes, reportNotes]);

  const refreshReportHistory = useCallback(async () => {
    if (!selectedProjectId) return;
    setReportHistoryLoading(true);
    try {
      const response = await fetch(`/api/cmc/projects/${selectedProjectId}/documents`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`Failed to load history (${response.status})`);
      const payload = await response.json();
      setReportHistory((payload.data || []).filter(item => item.documentType === 'CMC_REPORT'));
    } catch (error) {
      console.error('Error loading CMC report history:', error);
      toast({
        title: 'History Load Failed',
        description: 'Could not load project report history.',
        variant: 'destructive',
      });
    } finally {
      setReportHistoryLoading(false);
    }
  }, [selectedProjectId, toast]);

  useEffect(() => {
    refreshReportHistory();
  }, [refreshReportHistory]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const savedNotes = localStorage.getItem(`cmc-report-notes:${selectedProjectId}`);
    const savedCollaboration = localStorage.getItem(`cmc-collab-notes:${selectedProjectId}`);
    const savedTitle = localStorage.getItem(`cmc-report-title:${selectedProjectId}`);

    setReportNotes(savedNotes || '');
    setReportTitle(savedTitle || '');
    setCollaborationNotes(savedCollaboration ? JSON.parse(savedCollaboration) : []);
    setReportPreview('');
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) return;
    localStorage.setItem(`cmc-report-notes:${selectedProjectId}`, reportNotes);
  }, [selectedProjectId, reportNotes]);

  useEffect(() => {
    if (!selectedProjectId) return;
    localStorage.setItem(`cmc-report-title:${selectedProjectId}`, reportTitle);
  }, [selectedProjectId, reportTitle]);

  useEffect(() => {
    if (!selectedProjectId) return;
    localStorage.setItem(`cmc-collab-notes:${selectedProjectId}`, JSON.stringify(collaborationNotes));
  }, [selectedProjectId, collaborationNotes]);

  const downloadReport = () => {
    const content = buildReportMarkdown();
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cmc-report-${selectedProjectId || 'all'}-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const saveReportToProject = async () => {
    if (!selectedProjectId) {
      toast({
        title: 'Project Required',
        description: 'Select a project to attach this report.',
        variant: 'destructive',
      });
      return;
    }

    setSavingReport(true);
    try {
      const organizationId =
        Number(selectedProject?.organizationId) ||
        Number(localStorage.getItem('organizationId')) ||
        Number(localStorage.getItem('currentOrganizationId')) ||
        1;

      const response = await fetch(`/api/cmc/projects/${selectedProjectId}/documents`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          documentType: 'CMC_REPORT',
          title: reportTitle.trim() || `CMC Snapshot Report - ${new Date().toLocaleDateString()}`,
          content: buildReportMarkdown(),
          status: 'draft',
          version: '1.0',
          metadata: {
            source: 'cmc-module-reports-tab',
            tabData: {
              projectCount: selectedProject ? 1 : projects.length,
              substanceCount: reportDataFlow.projectSubstances.length,
              productCount: reportDataFlow.projectProducts.length,
              complianceGaps: reportDataFlow.complianceGaps,
            },
            collaborationNotes,
          },
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || `Failed to attach report (${response.status})`);
      }

      await refreshReportHistory();
      toast({
        title: 'Report Attached',
        description: 'The CMC report was attached to the selected project.',
      });
    } catch (error) {
      console.error('Error saving report:', error);
      toast({
        title: 'Save Failed',
        description: 'Unable to attach report to project. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingReport(false);
    }
  };

  const addCollaborationNote = () => {
    const trimmedNote = newCollaborationNote.note.trim();
    if (!trimmedNote) return;

    setCollaborationNotes(current => [
      {
        id: `${Date.now()}`,
        owner: newCollaborationNote.owner.trim(),
        note: trimmedNote,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    setNewCollaborationNote({ owner: '', note: '' });
  };

  const removeCollaborationNote = noteId => {
    setCollaborationNotes(current => current.filter(note => note.id !== noteId));
  };

  const generatePreview = () => {
    setReportPreview(buildReportMarkdown());
    toast({
      title: 'Preview Updated',
      description: 'Report preview has been regenerated from current tab data.',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">CMC Reports & Collaboration</h2>
          <p className="text-gray-600">
            Build project-level reports from all CMC tabs, collaborate inline, and attach to the
            selected project.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generatePreview}>
            <Eye className="w-4 h-4 mr-1" />
            Refresh Preview
          </Button>
          <Button variant="outline" onClick={downloadReport}>
            <FileText className="w-4 h-4 mr-1" />
            Download Markdown
          </Button>
          <Button onClick={saveReportToProject} disabled={savingReport || !selectedProjectId}>
            <FileCheck className="w-4 h-4 mr-1" />
            {savingReport ? 'Attaching...' : 'Attach to Project'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Scope</CardTitle>
          <CardDescription>
            Select a project, review data flow from each tab, and capture operator notes before
            publishing a report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Project Attachment</Label>
              <Select value={selectedProjectId} onValueChange={onSelectedProjectIdChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select CMC project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Active Project Summary</Label>
              <div className="p-3 border rounded-md bg-gray-50 text-sm">
                <p>
                  <strong>Name:</strong> {selectedProject?.name || 'All Projects'}
                </p>
                <p>
                  <strong>Stage:</strong> {selectedProject?.developmentStage || '-'}
                </p>
                <p>
                  <strong>Region:</strong> {selectedProject?.regulatoryRegion || '-'}
                </p>
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-1 block">Report Title</Label>
            <Input
              value={reportTitle}
              onChange={event => setReportTitle(event.target.value)}
              placeholder="e.g., Q2 CMC Readiness + Comparability Summary"
            />
          </div>

          <div>
            <Label className="mb-1 block">Operator Notes (included in report)</Label>
            <Textarea
              value={reportNotes}
              onChange={event => setReportNotes(event.target.value)}
              placeholder="Capture RA-CMC commentary, decisions, and reviewer-facing context."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Report Preview</CardTitle>
          <CardDescription>
            Regenerate to validate what will be downloaded or attached to the project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reportPreview ? (
            <pre className="text-xs bg-gray-50 border rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
              {reportPreview}
            </pre>
          ) : (
            <p className="text-sm text-gray-600">
              No preview generated yet. Click <strong>Refresh Preview</strong>.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Signals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Total projects: {projects.length}</p>
            <p>Active projects: {reportDataFlow.activeProjects}</p>
            <p>Selected scope: {selectedProject ? 'Single project' : 'Portfolio'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Substance / Product Flow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Drug substances: {reportDataFlow.projectSubstances.length}</p>
            <p>Drug products: {reportDataFlow.projectProducts.length}</p>
            <p>Derived open gaps: {reportDataFlow.complianceGaps}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tab Data Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Projects tab → ownership, stage, region</p>
            <p>Substances/Products tabs → quality evidence inventory</p>
            <p>Compliance tab → readiness status</p>
            <p>Reports tab → attachment + collaboration</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Collaboration Workspace</CardTitle>
          <CardDescription>
            Capture team notes from QA/RA-CMC/Manufacturing and include them in the attached report
            artifact.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input
              placeholder="Owner (e.g., QA Lead)"
              value={newCollaborationNote.owner}
              onChange={event =>
                setNewCollaborationNote(current => ({
                  ...current,
                  owner: event.target.value,
                }))
              }
            />
            <div className="md:col-span-2">
              <Input
                placeholder="Collaboration note, blocker, or decision"
                value={newCollaborationNote.note}
                onChange={event =>
                  setNewCollaborationNote(current => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
              />
            </div>
            <Button onClick={addCollaborationNote}>
              <Plus className="w-4 h-4 mr-1" />
              Add Note
            </Button>
          </div>

          {collaborationNotes.length === 0 ? (
            <p className="text-sm text-gray-600">No collaboration notes added yet.</p>
          ) : (
            <div className="space-y-2">
              {collaborationNotes.map(note => (
                <div key={note.id} className="p-3 border rounded-md bg-gray-50 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{note.owner || 'Unassigned'}</p>
                      <p>{note.note}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(note.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeCollaborationNote(note.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Attached Report History</CardTitle>
            <Button variant="outline" size="sm" onClick={refreshReportHistory}>
              Refresh
            </Button>
          </div>
          <CardDescription>
            Report artifacts saved to this project through CMC document endpoints.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reportHistoryLoading ? (
            <p className="text-sm text-gray-600">Loading report history…</p>
          ) : reportHistory.length === 0 ? (
            <p className="text-sm text-gray-600">No attached CMC reports for this project yet.</p>
          ) : (
            <div className="space-y-2">
              {reportHistory.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-gray-500">
                      Status: {item.status || 'draft'} • Version: {item.version || '-'}
                    </p>
                  </div>
                  <Badge className="bg-blue-100 text-blue-800">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
