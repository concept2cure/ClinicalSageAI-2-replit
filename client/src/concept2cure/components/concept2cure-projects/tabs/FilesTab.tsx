/**
 * FilesTab — Project files browser (table + filter + sort + group-by).
 * Mirror of design-system/ui_kits/home/Projects.jsx
 * (ProjectFilesScreen, lines 703–826).
 */
import { useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import { useProjectFiles } from '../data/useProjectFiles';
import type { Project } from '../types';

interface Props {
  project: Project;
  onProjectMutated?: () => void;
  onAskAna?: (text: string) => void;
}

type SortKey = 'recent' | 'name' | 'size' | 'kind';
type GroupKey = 'kind' | 'none';

import type { ProjectFile } from '../data/useProjectFiles';

interface AugmentedFile extends ProjectFile {
  uploaded: string;
  sizeLabel: string;
}

export function FilesTab({ project, onProjectMutated, onAskAna }: Props) {
  const { files, loading: filesLoading, refetch: refetchFiles } = useProjectFiles(project.id);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [groupBy, setGroupBy] = useState<GroupKey>('kind');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const failed: string[] = [];
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('projectId', project.id);
        const res = await fetch('/api/concept2cure/documents/upload', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        if (!res.ok) failed.push(`${file.name} (${res.status})`);
      }
      if (failed.length) console.error(`File upload failed: ${failed.join(', ')}`);
      if (failed.length < fileList.length) {
        onProjectMutated?.();
        refetchFiles();
      }
    } catch (err) {
      console.error('File upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const augmented = useMemo<AugmentedFile[]>(() => {
    return files.map(f => ({
      ...f,
      uploaded: f.when,
      sizeLabel: f.lines ? `${(f.lines * 0.082).toFixed(1)} KB` : '—',
    }));
  }, [files]);

  const filtered = augmented.filter(f =>
    f.name.toLowerCase().includes(query.toLowerCase()),
  );
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'size') return (b.lines || 0) - (a.lines || 0);
    if (sort === 'kind') return a.kind.localeCompare(b.kind);
    return 0;
  });

  const groups = useMemo(() => {
    if (groupBy !== 'kind') return [{ key: 'all', items: sorted }];
    const g: Record<string, AugmentedFile[]> = {};
    for (const f of sorted) (g[f.kind] = g[f.kind] || []).push(f);
    return Object.entries(g).map(([key, items]) => ({ key, items }));
  }, [sorted, groupBy]);

  return (
    <div className="pfiles" data-screen-label={`Files · ${project.name}`}>
      <header className="pfiles-head">
        <div>
          <div className="pfiles-eyebrow">Project files</div>
          <h2 className="pfiles-title">{files.length} files in this project</h2>
          <p className="pfiles-sub">
            Files added here are available to every chat. Claude can read, cite, and update them — and tracks which sections of which files informed each answer.
          </p>
        </div>
        <div className="pfiles-head-r">
          <input
            ref={folderInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => uploadFiles(e.target.files)}
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => uploadFiles(e.target.files)}
          />
          <button
            type="button"
            className="prj-btn"
            disabled={uploading}
            onClick={() => folderInputRef.current?.click()}
          >
            Drop folder
          </button>
          <button
            type="button"
            className="prj-btn primary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {I.plus} {uploading ? 'Uploading…' : 'Add files'}
          </button>
        </div>
      </header>

      {/* Per HANDOFF item 13: capacityPct dropped. Capacity bar removed. */}

      <div className="pfiles-tools">
        <div className="pfiles-search">
          <span className="pfiles-search-ico">{I.search}</span>
          <input
            className="pfiles-search-input"
            placeholder={`Search ${files.length} files…`}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="pfiles-tool-group">
          <span className="pfiles-tool-lbl">Sort</span>
          <select
            className="pfiles-select"
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
          >
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="kind">Type</option>
          </select>
        </div>
        <div className="pfiles-tool-group">
          <span className="pfiles-tool-lbl">Group by</span>
          <select
            className="pfiles-select"
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as GroupKey)}
          >
            <option value="kind">Type</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>

      {!filesLoading && sorted.length === 0 && (
        <div className="pfiles-empty">
          <div className="pfiles-empty-ico">{I.file}</div>
          <div className="pfiles-empty-title">No files match "{query}"</div>
          <div className="pfiles-empty-sub">
            Try a different search, or drop files into the project to add them.
          </div>
        </div>
      )}

      {groups.map(g => (
        <section key={g.key} className="pfiles-group">
          {groupBy === 'kind' && (
            <div className="pfiles-group-h">
              <span className="pfiles-group-name">{g.key}</span>
              <span className="pfiles-group-count">{g.items.length}</span>
            </div>
          )}
          <div className="pfiles-table">
            <div className="pfiles-th">
              <span>Name</span>
              <span>Author</span>
              <span>Updated</span>
              <span>Size</span>
              <span>Lines</span>
            </div>
            {g.items.map(f => (
              <button
                type="button"
                key={f.name}
                className="pfiles-tr"
                title={`Open ${f.name}`}
                onClick={() =>
                  onAskAna?.(
                    `Open file "${f.name}" (${f.kind}, ${f.lines ?? 0} lines, uploaded ${f.uploaded}, by ${f.author}). ` +
                      'Summarize it, surface its outline, and flag anything that affects open blockers.',
                  )
                }
              >
                <span className="pfiles-tr-name">
                  <span className="pfiles-tr-kind">{f.kind}</span>
                  <span className="pfiles-tr-fname">{f.name}</span>
                </span>
                <span className="pfiles-tr-author">{f.author}</span>
                <span className="pfiles-tr-when">{f.uploaded}</span>
                <span className="pfiles-tr-size">{f.sizeLabel}</span>
                <span className="pfiles-tr-lines">{f.lines || '—'}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
