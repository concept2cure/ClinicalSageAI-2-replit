/**
 * CERV2AttachmentManager — Phase 9 P2
 *
 * Per-section file attachment management with drag-drop upload.
 * Files stored as base64 in memory (auto-save strips them to save space).
 * 10 MB per file limit, 20 files per section max.
 */
import React, { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
 Paperclip,
 Upload,
 X,
 FileText,
 FileImage,
 FileSpreadsheet,
 File,
 AlertTriangle,
 ChevronDown,
 ChevronRight,
} from 'lucide-react';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES_PER_SECTION = 20;

const FILE_ICONS = {
 pdf: FileText,
 doc: FileText,
 docx: FileText,
 txt: FileText,
 jpg: FileImage,
 jpeg: FileImage,
 png: FileImage,
 gif: FileImage,
 svg: FileImage,
 xls: FileSpreadsheet,
 xlsx: FileSpreadsheet,
 csv: FileSpreadsheet,
};

function getIcon(name) {
 const ext = (name || '').split('.').pop().toLowerCase();
 return FILE_ICONS[ext] || File;
}

function formatSize(bytes) {
 if (bytes < 1024) return `${bytes} B`;
 if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
 return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * Props:
 * activeSectionId — currently selected section ID
 * attachments — { [sectionId]: [{ name, size, type, data }] }
 * onAttachmentsChange — update attachments map
 * outline — DOC_OUTLINE for section labels
 * visible — whether panel is shown
 * onToggle — toggle visibility
 */
export default function CERV2AttachmentManager({
 activeSectionId,
 attachments,
 onAttachmentsChange,
 outline,
 visible,
 onToggle,
}) {
 const fileInputRef = useRef(null);
 const [dragOver, setDragOver] = useState(false);
 const [error, setError] = useState(null);
 const [expandedSections, setExpandedSections] = useState(new Set([activeSectionId]));

 const sectionFiles = attachments[activeSectionId] || [];
 const totalFiles = Object.values(attachments).reduce((n, arr) => n + arr.length, 0);

 const addFiles = useCallback(
 fileList => {
 setError(null);
 const currentFiles = attachments[activeSectionId] || [];

 if (currentFiles.length + fileList.length > MAX_FILES_PER_SECTION) {
 setError(`Max ${MAX_FILES_PER_SECTION} files per section.`);
 return;
 }

 const newFiles = [];
 const oversized = [];

 Array.from(fileList).forEach(file => {
 if (file.size > MAX_FILE_SIZE) {
 oversized.push(file.name);
 return;
 }
 newFiles.push(file);
 });

 if (oversized.length > 0) {
 setError(`Files too large (>10 MB): ${oversized.join(', ')}`);
 }

 if (newFiles.length === 0) return;

 // Read files as base64
 Promise.all(
 newFiles.map(
 f =>
 new Promise(resolve => {
 const reader = new FileReader();
 reader.onload = () =>
 resolve({ name: f.name, size: f.size, type: f.type, data: reader.result });
 reader.onerror = () =>
 resolve({ name: f.name, size: f.size, type: f.type, data: null });
 reader.readAsDataURL(f);
 })
 )
 ).then(results => {
 const valid = results.filter(r => r.data !== null);
 onAttachmentsChange({
 ...attachments,
 [activeSectionId]: [...currentFiles, ...valid],
 });
 });
 },
 [activeSectionId, attachments, onAttachmentsChange]
 );

 const removeFile = (sectionId, index) => {
 const arr = [...(attachments[sectionId] || [])];
 arr.splice(index, 1);
 onAttachmentsChange({ ...attachments, [sectionId]: arr });
 };

 const handleDrop = useCallback(
 e => {
 e.preventDefault();
 setDragOver(false);
 if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
 },
 [addFiles]
 );

 const toggleSection = id => {
 setExpandedSections(prev => {
 const next = new Set(prev);
 next.has(id) ? next.delete(id) : next.add(id);
 return next;
 });
 };

 // Collapsed badge
 if (!visible) {
 return (
 <button
 onClick={onToggle}
 className="flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-slate-50 transition-colors"
 >
 <Paperclip className="w-3.5 h-3.5 text-slate-500" />
 <span className="text-slate-700">Attachments</span>
 {totalFiles > 0 && (
 <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
 {totalFiles}
 </Badge>
 )}
 </button>
 );
 }

 const sectionLabel = outline.find(s => s.id === activeSectionId)?.label || activeSectionId;

 return (
 <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
 {/* Header */}
 <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b">
 <div className="flex items-center gap-2">
 <Paperclip className="w-4 h-4 text-slate-600" />
 <span className="font-semibold text-sm text-slate-800">Attachments</span>
 <Badge variant="outline" className="text-[11px] px-1.5 py-0">
 {totalFiles} total
 </Badge>
 </div>
 <Button variant="ghost" size="sm" onClick={onToggle} className="h-7 px-2 text-xs">
 Close
 </Button>
 </div>

 {/* Drop zone for active section */}
 <div className="p-3">
 <p className="text-xs font-medium text-slate-600 mb-2">
 Upload to: <span className="text-stone-700">{sectionLabel}</span>
 </p>
 <div
 className={`border-2 border-dashed rounded-md p-4 text-center transition-colors ${
 dragOver ? 'border-stone-400 bg-stone-50' : 'border-slate-300 bg-slate-50'
 }`}
 onDragOver={e => {
 e.preventDefault();
 setDragOver(true);
 }}
 onDragLeave={() => setDragOver(false)}
 onDrop={handleDrop}
 >
 <Upload className="w-5 h-5 mx-auto mb-1 text-slate-400" />
 <p className="text-xs text-slate-500">Drag & drop files here or</p>
 <Button
 variant="outline"
 size="sm"
 className="mt-1.5 h-7 text-xs"
 onClick={() => fileInputRef.current?.click()}
 >
 Browse Files
 </Button>
 <input
 ref={fileInputRef}
 type="file"
 multiple
 className="hidden"
 onChange={e => {
 if (e.target.files.length) addFiles(e.target.files);
 e.target.value = '';
 }}
 />
 <p className="text-[11px] text-slate-400 mt-1">
 Max 10 MB per file · {MAX_FILES_PER_SECTION} files per section
 </p>
 </div>

 {error && (
 <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
 <AlertTriangle className="w-3.5 h-3.5" />
 {error}
 </div>
 )}
 </div>

 {/* Files list grouped by section */}
 <ScrollArea className="max-h-48 border-t">
 <div className="p-2">
 {outline.map(section => {
 const files = attachments[section.id] || [];
 if (files.length === 0) return null;
 const expanded = expandedSections.has(section.id);
 return (
 <div key={section.id} className="mb-1">
 <button
 className="flex items-center gap-1 w-full text-left text-xs font-medium text-slate-600 px-2 py-1 rounded hover:bg-slate-50"
 onClick={() => toggleSection(section.id)}
 >
 {expanded ? (
 <ChevronDown className="w-3 h-3" />
 ) : (
 <ChevronRight className="w-3 h-3" />
 )}
 {section.label}
 <Badge variant="secondary" className="text-[11px] px-1 py-0 ml-auto">
 {files.length}
 </Badge>
 </button>
 {expanded && (
 <div className="ml-4 space-y-0.5">
 {files.map((f, i) => {
 const Icon = getIcon(f.name);
 return (
 <div
 key={i}
 className="flex items-center gap-2 text-xs text-slate-700 px-2 py-1 rounded hover:bg-slate-50 group"
 >
 <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
 <span className="truncate flex-1">{f.name}</span>
 <span className="text-[11px] text-slate-400">{formatSize(f.size)}</span>
 <button
 onClick={() => removeFile(section.id, i)}
 className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
 >
 <X className="w-3.5 h-3.5" />
 </button>
 </div>
 );
 })}
 </div>
 )}
 </div>
 );
 })}
 {totalFiles === 0 && (
 <p className="text-xs text-slate-400 text-center py-2">No attachments yet.</p>
 )}
 </div>
 </ScrollArea>
 </div>
 );
}
