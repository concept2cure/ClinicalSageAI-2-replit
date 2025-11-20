import React, { useState, useEffect } from 'react';
import ReactDiffViewer from '../lightweight-wrappers.js';
import { useToast } from '../App';

// Define DiffType enum since it's not exported from the library
enum DiffType {
  CHARS = 'chars',
  WORDS = 'words',
  LINES = 'lines',
  SENTENCES = 'sentences',
}

interface DocumentVersion {
  id: number;
  version: number;
  content: string;
  created_at: string;
  user_id: number;
  user_name?: string;
}

interface DocumentDiffViewerProps {
  documentId: number;
  oldVersionId?: number;
  newVersionId?: number;
  onClose?: () => void;
}

export default function DocumentDiffViewer({
  documentId,
  oldVersionId,
  newVersionId,
  onClose,
}: DocumentDiffViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [selectedOldVersionId, setSelectedOldVersionId] = useState<number | undefined>(
    oldVersionId
  );
  const [selectedNewVersionId, setSelectedNewVersionId] = useState<number | undefined>(
    newVersionId
  );
  const [oldContent, setOldContent] = useState<string>('');
  const [newContent, setNewContent] = useState<string>('');
  const [diffType, setDiffType] = useState<DiffType>(DiffType.WORDS);

  // Fetch document versions
  useEffect(() => {
    const fetchVersions = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/documents/${documentId}/versions`);

        if (!response.ok) {
          throw new Error(`Failed to fetch document versions: ${response.status}`);
        }

        const data = await response.json();

        if (data.versions && Array.isArray(data.versions)) {
          // Sort by version number descending
          const sortedVersions = [...data.versions].sort((a, b) => b.version - a.version);
          setVersions(sortedVersions);

          // Set default selections if not provided
          if (!selectedOldVersionId && sortedVersions.length > 1) {
            setSelectedOldVersionId(sortedVersions[1].id); // Second newest
          }

          if (!selectedNewVersionId && sortedVersions.length > 0) {
            setSelectedNewVersionId(sortedVersions[0].id); // Newest
          }
        } else {
          throw new Error('Invalid version data received');
        }
      } catch (err) {
        console.error('Error fetching document versions:', err);
        setError((err as Error).message || 'Failed to load document versions');
        const { showToast } = useToast();
        showToast('Failed to load document versions', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchVersions();
  }, [documentId]);

  // Fetch content for the selected versions
  useEffect(() => {
    const fetchVersionContent = async () => {
      if (!selectedOldVersionId || !selectedNewVersionId) {
        return;
      }

      try {
        setLoading(true);

        // Fetch old version content
        const oldResponse = await fetch(
          `/api/documents/${documentId}/versions/${selectedOldVersionId}/content`
        );
        if (!oldResponse.ok) {
          throw new Error(`Failed to fetch old version content: ${oldResponse.status}`);
        }
        const oldData = await oldResponse.json();
        setOldContent(oldData.content || '');

        // Fetch new version content
        const newResponse = await fetch(
          `/api/documents/${documentId}/versions/${selectedNewVersionId}/content`
        );
        if (!newResponse.ok) {
          throw new Error(`Failed to fetch new version content: ${newResponse.status}`);
        }
        const newData = await newResponse.json();
        setNewContent(newData.content || '');
      } catch (err) {
        console.error('Error fetching version content:', err);
        setError((err as Error).message || 'Failed to load version content');
        const { showToast } = useToast();
        showToast('Failed to load version content', 'error');
      } finally {
        setLoading(false);
      }
    };

    if (selectedOldVersionId && selectedNewVersionId) {
      fetchVersionContent();
    }
  }, [documentId, selectedOldVersionId, selectedNewVersionId]);

  const handleOldVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const versionId = parseInt(e.target.value);
    if (versionId === selectedNewVersionId) {
      useToast().showToast('Please select different versions for comparison', 'warning');
      return;
    }
    setSelectedOldVersionId(versionId);
  };

  const handleNewVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const versionId = parseInt(e.target.value);
    if (versionId === selectedOldVersionId) {
      useToast().showToast('Please select different versions for comparison', 'warning');
      return;
    }
    setSelectedNewVersionId(versionId);
  };

  const handleDiffTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDiffType(e.target.value as DiffType);
  };

  if (loading && versions.length === 0) {
    return (
      <div className="p-4 text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-2">Loading document versions...</p>
      </div>
    );
  }

  if (error && versions.length === 0) {
    return (
      <div className="alert alert-danger m-4">
        <h5>Error Loading Document Versions</h5>
        <p>{error}</p>
        <button className="btn btn-outline-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  if (versions.length < 2) {
    return (
      <div className="alert alert-info m-4">
        <h5>Cannot Compare Versions</h5>
        <p>
          This document has only one version. At least two versions are required for comparison.
        </p>
        <button className="btn btn-outline-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  const getVersionLabel = (version: DocumentVersion) => {
    const date = new Date(version.created_at).toLocaleString();
    const userName = version.user_name || `User ${version.user_id}`;
    return `v${version.version} (${date} by ${userName})`;
  };

  return (
    <div className="document-diff-viewer">
      <div className="card">
        <div className="card-header bg-light d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Document Version Comparison</h5>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
        </div>

        <div className="card-body">
          <div className="row mb-3">
            <div className="col-md-4">
              <label htmlFor="oldVersionSelect" className="form-label">
                Previous Version:
              </label>
              <select
                id="oldVersionSelect"
                className="form-select"
                value={selectedOldVersionId}
                onChange={handleOldVersionChange}
                disabled={loading}
              >
                {versions.map(version => (
                  <option key={`old-${version.id}`} value={version.id}>
                    {getVersionLabel(version)}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-4">
              <label htmlFor="newVersionSelect" className="form-label">
                Current Version:
              </label>
              <select
                id="newVersionSelect"
                className="form-select"
                value={selectedNewVersionId}
                onChange={handleNewVersionChange}
                disabled={loading}
              >
                {versions.map(version => (
                  <option key={`new-${version.id}`} value={version.id}>
                    {getVersionLabel(version)}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-4">
              <label htmlFor="diffTypeSelect" className="form-label">
                Diff Type:
              </label>
              <select
                id="diffTypeSelect"
                className="form-select"
                value={diffType}
                onChange={handleDiffTypeChange}
                disabled={loading}
              >
                <option value={DiffType.CHARS}>Character by Character</option>
                <option value={DiffType.WORDS}>Word by Word</option>
                <option value={DiffType.LINES}>Line by Line</option>
                <option value={DiffType.SENTENCES}>Sentence by Sentence</option>
              </select>
            </div>
          </div>

          {loading && (selectedOldVersionId || selectedNewVersionId) ? (
            <div className="text-center my-4">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p>Loading content...</p>
            </div>
          ) : (
            <div className="diff-container border rounded">
              <ReactDiffViewer
                oldValue={oldContent}
                newValue={newContent}
                splitView={true}
                compareMethod={diffType}
                useDarkTheme={false}
                hideLineNumbers={false}
                extraLinesSurroundingDiff={3}
                codeFoldMessageRenderer={() => <span>Unchanged content folded</span>}
                renderContent={(highlighting: string) => (
                  <pre style={{ display: 'inline-block', width: '100%' }}>{highlighting}</pre>
                )}
              />
            </div>
          )}
        </div>

        <div className="card-footer d-flex justify-content-end">
          <button className="btn btn-secondary me-2" onClick={onClose}>
            Close
          </button>
          <a
            href={`/api/documents/${documentId}/versions/${selectedNewVersionId}/download`}
            className="btn btn-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download Current Version
          </a>
        </div>
      </div>
    </div>
  );
}
