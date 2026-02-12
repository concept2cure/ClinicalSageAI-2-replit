/**
 * CERV2VersionHistory — Phase 9 P2
 *
 * Shows version snapshots from CERV2AutoSaveService.
 * Displays section-level word-count diffs between snapshots.
 * Manual snapshot creation, restore, and delete.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Save, RotateCcw, ChevronRight, ChevronDown, Trash2 } from 'lucide-react';
import autoSaveService from '@/services/CERV2AutoSaveService';

function wordCount(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Props:
 *   docType, projectId — for auto-save key
 *   outline — DOC_OUTLINE for section labels
 *   currentState — { sectionData, deviceContext, etc. } current editor state
 *   onRestore — (snapshot) => void — restore a snapshot
 *   visible / onToggle
 */
export default function CERV2VersionHistory({
  docType,
  projectId,
  outline,
  currentState,
  onRestore,
  visible,
  onToggle,
}) {
  const [versions, setVersions] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const refresh = useCallback(() => {
    autoSaveService.init(docType, projectId || 'default');
    setVersions(autoSaveService.getVersions());
  }, [docType, projectId]);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  const handleSnapshot = () => {
    autoSaveService.init(docType, projectId || 'default');
    autoSaveService.pushVersion(currentState, `Manual snapshot`);
    refresh();
  };

  const handleRestore = v => {
    if (window.confirm('Restore this version? Current unsaved changes will be replaced.')) {
      onRestore(v.state);
    }
  };

  const toggleExpand = idx => {
    setExpanded(prev => (prev === idx ? null : idx));
  };

  // Collapsed badge
  if (!visible) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-slate-50 transition-colors"
      >
        <History className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-slate-700">History</span>
        {versions.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {versions.length}
          </Badge>
        )}
      </button>
    );
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-600" />
          <span className="font-semibold text-sm text-slate-800">Version History</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {versions.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSnapshot}
            className="h-7 text-xs gap-1"
          >
            <Save className="w-3 h-3" /> Snapshot
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggle} className="h-7 px-2 text-xs">
            Close
          </Button>
        </div>
      </div>

      {/* Versions list */}
      <ScrollArea className="max-h-64">
        <div className="p-2 space-y-1">
          {versions.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">
              No snapshots yet. Click &quot;Snapshot&quot; to save a version.
            </p>
          )}

          {versions.map((v, idx) => {
            const isExpanded = expanded === idx;
            const sectionData = v.state?.sectionData || {};
            const sectionWords = {};
            for (const [sid, content] of Object.entries(sectionData)) {
              sectionWords[sid] = wordCount(
                typeof content === 'string' ? content : JSON.stringify(content)
              );
            }
            const totalWords = Object.values(sectionWords).reduce((a, b) => a + b, 0);

            return (
              <div key={idx} className="border rounded-md overflow-hidden">
                <button
                  className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(idx)}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">
                      {v.label || `Version ${versions.length - idx}`}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {formatDate(v.timestamp)} · {totalWords} words
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-blue-600 hover:text-blue-800"
                    onClick={e => {
                      e.stopPropagation();
                      handleRestore(v);
                    }}
                  >
                    <RotateCcw className="w-3 h-3 mr-0.5" /> Restore
                  </Button>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-2 border-t bg-slate-50/50">
                    <table className="w-full text-[10px] mt-1">
                      <thead>
                        <tr className="text-slate-500">
                          <th className="text-left font-medium py-0.5">Section</th>
                          <th className="text-right font-medium py-0.5">Words</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outline.map(section => {
                          const w = sectionWords[section.id] || 0;
                          return (
                            <tr key={section.id} className="text-slate-600">
                              <td className="py-0.5 truncate max-w-[150px]">{section.label}</td>
                              <td className="text-right py-0.5 tabular-nums">{w}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
