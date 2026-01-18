import React, { useState, useEffect } from 'react';
import { X, Link as LinkIcon, Trash2, Clock, FileText, TrendingUp } from 'lucide-react';
import { listEvidenceLinks, linkEvidence, unlinkEvidence, listAudit } from '@/api/cerv2Workbench';

export default function Inspector({ programId, evidence, onClose, onUpdate }) {
  const [links, setLinks] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [entityType, setEntityType] = useState('CLAIM');
  const [entityId, setEntityId] = useState('');
  const [impactPreview, setImpactPreview] = useState(null);

  useEffect(() => {
    if (!evidence || !programId) return;
    loadLinks();
    loadAudit();
  }, [evidence, programId]);

  const loadLinks = async () => {
    try {
      setLoading(true);
      const payload = await listEvidenceLinks(programId, {
        evidenceId: evidence.evidenceId,
      });
      setLinks(payload.data || []);
    } catch (err) {
      console.error('Failed to load links:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async () => {
    try {
      const payload = await listAudit(programId);
      const filtered = (payload.data || [])
        .filter((e) => e.metadata?.evidenceId === evidence.evidenceId)
        .slice(0, 10);
      setAuditEvents(filtered);
    } catch (err) {
      console.error('Failed to load audit:', err);
    }
  };

  const handleUnlink = async (link) => {
    try {
      await unlinkEvidence(programId, {
        evidenceId: evidence.evidenceId,
        entityType: link.entityType,
        entityId: link.entityId,
      });
      await loadLinks();
      onUpdate?.();
    } catch (err) {
      console.error('Failed to unlink:', err);
    }
  };

  const handleLink = async () => {
    if (!entityType || !entityId) return;
    try {
      await linkEvidence(programId, {
        evidenceId: evidence.evidenceId,
        entityType,
        entityId,
      });
      setLinkMode(false);
      setEntityId('');
      setImpactPreview(null);
      await loadLinks();
      onUpdate?.();
    } catch (err) {
      console.error('Failed to link:', err);
    }
  };

  const simulateImpact = () => {
    // Mock impact calculation
    const currentCoverage = 62;
    const newCoverage = currentCoverage + Math.floor(Math.random() * 5) + 1;
    setImpactPreview({
      before: currentCoverage,
      after: newCoverage,
      delta: newCoverage - currentCoverage,
    });
  };

  if (!evidence) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-[400px] border-l border-slate-200 bg-white shadow-2xl overflow-y-auto z-50">
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Inspector</h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <X className="h-5 w-5 text-slate-500" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Details Section */}
        <section>
          <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Details
          </h4>
          <div className="space-y-2 text-sm">
            <div>
              <div className="text-xs text-slate-500">Name</div>
              <div className="font-medium text-slate-900">{evidence.name}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Type</div>
              <div className="font-medium text-slate-900">{evidence.evidenceType || 'EVIDENCE'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Folder</div>
              <div className="font-medium text-slate-900">{evidence.folderPath || 'evidence'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Size</div>
              <div className="font-medium text-slate-900">
                {Math.round((evidence.sizeBytes || 0) / 1024)} KB
              </div>
            </div>
            {evidence.tags?.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Tags</div>
                <div className="flex flex-wrap gap-1">
                  {evidence.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Linked Entities Section */}
        <section>
          <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            Linked Entities ({links.length})
          </h4>
          {loading ? (
            <div className="text-xs text-slate-500">Loading links...</div>
          ) : links.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-4">No links yet</div>
          ) : (
            <div className="space-y-2">
              {links.map((link) => (
                <div
                  key={`${link.entityType}-${link.entityId}`}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700 truncate">
                      {link.entityType}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      ID: {link.entityId}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnlink(link)}
                    className="p-1 rounded hover:bg-rose-50 text-rose-600 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Link New Evidence Section */}
        <section>
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Link New Evidence</h4>
          {!linkMode ? (
            <button
              onClick={() => setLinkMode(true)}
              className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              + Add Link
            </button>
          ) : (
            <div className="space-y-3">
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="CLAIM">Claim</option>
                <option value="STANDARD">Standard</option>
                <option value="OUTCOME">Outcome</option>
              </select>
              <input
                value={entityId}
                onChange={(e) => {
                  setEntityId(e.target.value);
                  if (e.target.value) simulateImpact();
                }}
                placeholder="Enter entity ID"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              
              {impactPreview && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                  <div className="flex items-center gap-2 text-xs font-semibold text-green-700 mb-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Impact Preview
                  </div>
                  <div className="text-xs text-green-600">
                    Linking will increase Claims coverage from{' '}
                    <span className="font-semibold">{impactPreview.before}%</span> →{' '}
                    <span className="font-semibold">{impactPreview.after}%</span>
                    {' '}(+{impactPreview.delta}%)
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleLink}
                  disabled={!entityId}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Link
                </button>
                <button
                  onClick={() => {
                    setLinkMode(false);
                    setEntityId('');
                    setImpactPreview(null);
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Audit History Section */}
        <section>
          <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Activity
          </h4>
          {auditEvents.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-4">No activity yet</div>
          ) : (
            <div className="space-y-2">
              {auditEvents.map((event) => (
                <div
                  key={event.id}
                  className="p-2 rounded-lg border border-slate-200 text-xs"
                >
                  <div className="font-semibold text-slate-700">{event.action}</div>
                  <div className="text-slate-500 mt-0.5">
                    {new Date(event.createdAt).toLocaleString()}
                  </div>
                  {event.diffSummary && (
                    <div className="text-slate-600 mt-1">{event.diffSummary}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
