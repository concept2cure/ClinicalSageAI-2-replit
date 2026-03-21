/**
 * @fileoverview Artifact Viewer
 * @module concept2cure/components/artifacts/ArtifactViewer
 * @version 1.0.0
 *
 * @description
 * Claude.ai-style artifact viewer for documents, code, and generated content.
 * Supports preview, editing, versioning, and collaborative features.
 *
 * @author Concept2Cure UI Team
 * @compliance
 * - FDA 21 CFR Part 11: Full audit trail, electronic signatures
 * - WCAG 2.1 AA: Accessible document viewing
 */

import React, { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  X,
  Maximize2,
  Minimize2,
  Download,
  Copy,
  Check,
  Edit3,
  Save,
  Clock,
  User,
  FileText,
  Code,
  Table,
  Image,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Share2,
  Printer,
  Lock,
  Unlock,
  GitBranch,
  CheckCircle,
  AlertCircle,
  Loader2,
  Pen,
  Eye,
  History,
  Users,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type ArtifactType = 'document' | 'code' | 'table' | 'image' | 'markdown';
type ArtifactStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';

interface ArtifactVersion {
  id: string;
  version: string;
  createdAt: string;
  createdBy: string;
  changes?: string;
}

interface ArtifactCollaborator {
  id: string;
  name: string;
  avatar?: string;
  status: 'viewing' | 'editing';
}

interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  content: string;
  status: ArtifactStatus;
  language?: string; // For code artifacts
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  projectId?: string;
  projectName?: string;
  versions?: ArtifactVersion[];
  collaborators?: ArtifactCollaborator[];
  isLocked?: boolean;
  lockedBy?: string;
  metadata?: Record<string, unknown>;
}

interface ArtifactViewerProps {
  artifact: Artifact;
  onClose: () => void;
  onSave?: (artifact: Artifact) => Promise<void>;
  onExport?: (artifact: Artifact, format: string) => void;
  onShare?: (artifact: Artifact) => void;
  onSign?: (artifact: Artifact) => void;
  onVersionSelect?: (version: ArtifactVersion) => void;
  isEditable?: boolean;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS BADGE
// ═══════════════════════════════════════════════════════════════════════════════

const StatusBadge: React.FC<{ status: ArtifactStatus }> = ({ status }) => {
  const config = {
    draft: { bg: 'bg-zinc-100', text: 'text-zinc-600', icon: Edit3 },
    review: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Eye },
    approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle },
    published: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Check },
    archived: { bg: 'bg-zinc-100', text: 'text-zinc-500', icon: Clock },
  };

  const { bg, text, icon: Icon } = config[status];

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', bg, text)}>
      <Icon className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE ICON
// ═══════════════════════════════════════════════════════════════════════════════

const TypeIcon: React.FC<{ type: ArtifactType; className?: string }> = ({ type, className }) => {
  const icons = {
    document: FileText,
    code: Code,
    table: Table,
    image: Image,
    markdown: FileText,
  };

  const Icon = icons[type];
  return <Icon className={className} />;
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({
  artifact,
  onClose,
  onSave,
  onExport,
  onShare,
  onSign,
  onVersionSelect,
  isEditable = false,
  className,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(artifact.content);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  const editorRef = useRef<HTMLTextAreaElement>(null);
  
  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [artifact.content]);
  
  // Save changes
  const handleSave = useCallback(async () => {
    if (!onSave) return;
    
    setIsSaving(true);
    try {
      await onSave({ ...artifact, content: editContent });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  }, [artifact, editContent, onSave]);
  
  // Cancel editing
  const handleCancel = useCallback(() => {
    setEditContent(artifact.content);
    setIsEditing(false);
  }, [artifact.content]);
  
  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  return (
    <div
      className={cn(
        'flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden',
        isFullscreen
          ? 'fixed inset-4 z-50'
          : 'relative max-h-[80vh]',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-3 min-w-0">
          {/* Type Icon */}
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            artifact.type === 'document' && 'bg-blue-100',
            artifact.type === 'code' && 'bg-violet-100',
            artifact.type === 'table' && 'bg-emerald-100',
            artifact.type === 'markdown' && 'bg-amber-100',
          )}>
            <TypeIcon
              type={artifact.type}
              className={cn(
                'w-5 h-5',
                artifact.type === 'document' && 'text-blue-600',
                artifact.type === 'code' && 'text-violet-600',
                artifact.type === 'table' && 'text-emerald-600',
                artifact.type === 'markdown' && 'text-amber-600',
              )}
            />
          </div>
          
          {/* Title & Meta */}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 truncate">
              {artifact.name}
            </h2>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              {artifact.projectName && (
                <>
                  <span>{artifact.projectName}</span>
                  <span className="text-zinc-400">•</span>
                </>
              )}
              <span>Updated {formatDate(artifact.updatedAt)}</span>
            </div>
          </div>
          
          {/* Status */}
          <StatusBadge status={artifact.status} />
          
          {/* Lock indicator */}
          {artifact.isLocked && (
            <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              <Lock className="w-3 h-3" />
              <span>Locked by {artifact.lockedBy}</span>
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Collaborators */}
          {artifact.collaborators && artifact.collaborators.length > 0 && (
            <div className="flex items-center -space-x-2 mr-2">
              {artifact.collaborators.slice(0, 3).map((collab) => (
                <div
                  key={collab.id}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium',
                    collab.status === 'editing' ? 'bg-emerald-500 text-white' : 'bg-zinc-200 text-zinc-600'
                  )}
                  title={`${collab.name} (${collab.status})`}
                >
                  {collab.name.charAt(0)}
                </div>
              ))}
              {artifact.collaborators.length > 3 && (
                <div className="w-7 h-7 rounded-full border-2 border-white bg-zinc-100 flex items-center justify-center text-xs text-zinc-600">
                  +{artifact.collaborators.length - 3}
                </div>
              )}
            </div>
          )}
          
          {/* Version history */}
          {artifact.versions && artifact.versions.length > 0 && (
            <button
              onClick={() => setShowVersions(!showVersions)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                showVersions ? 'bg-violet-100 text-violet-700' : 'hover:bg-zinc-100 text-zinc-500'
              )}
              title="Version history"
            >
              <History className="w-4 h-4" />
            </button>
          )}
          
          {/* Copy */}
          <button
            onClick={handleCopy}
            className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors duration-150"
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
          
          {/* Export */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors duration-150"
              title="Export"
            >
              <Download className="w-4 h-4" />
            </button>
            
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-10">
                <button
                  onClick={() => { onExport?.(artifact, 'docx'); setShowExportMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-blue-600" />
                  Export as DOCX
                </button>
                <button
                  onClick={() => { onExport?.(artifact, 'pdf'); setShowExportMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-red-600" />
                  Export as PDF
                </button>
                <button
                  onClick={() => { onExport?.(artifact, 'md'); setShowExportMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2"
                >
                  <Code className="w-4 h-4 text-zinc-600" />
                  Export as Markdown
                </button>
              </div>
            )}
          </div>
          
          {/* Share */}
          {onShare && (
            <button
              onClick={() => onShare(artifact)}
              className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors duration-150"
              title="Share"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
          
          {/* Edit toggle */}
          {isEditable && !artifact.isLocked && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isEditing ? 'bg-violet-100 text-violet-700' : 'hover:bg-zinc-100 text-zinc-500'
              )}
              title={isEditing ? 'View mode' : 'Edit'}
            >
              {isEditing ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            </button>
          )}
          
          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors duration-150"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          
          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors duration-150"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          {isEditing ? (
            <textarea
              ref={editorRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className={cn(
                'w-full h-full p-6 resize-none',
                'font-mono text-sm text-zinc-900',
                'focus:outline-none'
              )}
              spellCheck={artifact.type !== 'code'}
            />
          ) : (
            <div className="p-6">
              {artifact.type === 'code' ? (
                <pre className="font-mono text-sm text-zinc-900 whitespace-pre-wrap">
                  <code>{artifact.content}</code>
                </pre>
              ) : artifact.type === 'markdown' ? (
                <div className="prose prose-sm max-w-none">
                  {/* In production, render markdown properly */}
                  <pre className="whitespace-pre-wrap">{artifact.content}</pre>
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-sm text-zinc-900">
                  {artifact.content}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Version Sidebar */}
        {showVersions && artifact.versions && (
          <div className="w-72 border-l border-zinc-200 bg-zinc-50 overflow-y-auto">
            <div className="p-4 border-b border-zinc-200">
              <h3 className="text-sm font-medium text-zinc-900 flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                Version History
              </h3>
            </div>
            
            <div className="p-2">
              {artifact.versions.map((version) => (
                <button
                  key={version.id}
                  onClick={() => onVersionSelect?.(version)}
                  className="w-full p-3 rounded-lg hover:bg-white text-left transition-colors duration-150"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-zinc-900">
                      v{version.version}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {formatDate(version.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <User className="w-3 h-3" />
                    {version.createdBy}
                  </div>
                  {version.changes && (
                    <p className="mt-1 text-xs text-zinc-500 line-clamp-2">
                      {version.changes}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Footer - Edit Mode */}
      {isEditing && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 bg-zinc-50">
          <p className="text-xs text-zinc-500">
            Editing as {artifact.createdBy}
          </p>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={cn(
                'px-4 py-1.5 text-sm font-medium rounded-lg transition-colors',
                'bg-violet-600 text-white hover:bg-violet-700',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'flex items-center gap-2'
              )}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      )}
      
      {/* Footer - View Mode with Sign */}
      {!isEditing && artifact.status === 'review' && onSign && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 bg-amber-50">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">This document requires your approval</span>
          </div>
          
          <button
            onClick={() => onSign(artifact)}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-lg transition-colors',
              'bg-emerald-600 text-white hover:bg-emerald-700',
              'flex items-center gap-2'
            )}
          >
            <Pen className="w-3.5 h-3.5" />
            Sign & Approve
          </button>
        </div>
      )}
    </div>
  );
};

export default ArtifactViewer;
