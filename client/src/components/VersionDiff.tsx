/**
 * VersionDiff Component
 *
 * Inline diff viewer for comparing two versions of a document.
 * Features:
 *  - Version selector dropdowns (from / to)
 *  - Inline diff view with green (addition) and red (deletion) highlighting
 *  - Summary stats (additions, deletions)
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types mirroring server-side shapes
// ---------------------------------------------------------------------------

interface DiffChunk {
  type: 'add' | 'delete' | 'equal';
  content: string;
  lineStart: number;
}

interface VersionEntry {
  id: number;
  documentId: number;
  versionNumber: string;
  versionLabel: string | null;
  changeDescription: string | null;
  changeType: string | null;
  status: string;
  createdAt: string;
}

interface DiffResponse {
  documentId: number;
  from: string;
  to: string;
  additions: number;
  deletions: number;
  changes: DiffChunk[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VersionDiffProps {
  /** The document ID whose versions we are comparing */
  documentId: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VersionDiff({ documentId }: VersionDiffProps) {
  const [fromVersion, setFromVersion] = useState<string>('');
  const [toVersion, setToVersion] = useState<string>('');

  // Fetch list of versions for the document
  const {
    data: versionsData,
    isLoading: versionsLoading,
    error: versionsError,
  } = useQuery<{ versions: VersionEntry[]; count: number }>({
    queryKey: [`/api/documents/${documentId}/versions`],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/documents/${documentId}/versions`);
      return res.json();
    },
    enabled: !!documentId,
  });

  // Fetch diff between two versions (only when both are selected)
  const {
    data: diffData,
    isLoading: diffLoading,
    error: diffError,
  } = useQuery<DiffResponse>({
    queryKey: [`/api/documents/${documentId}/diff`, fromVersion, toVersion],
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/documents/${documentId}/diff?from=${encodeURIComponent(fromVersion)}&to=${encodeURIComponent(toVersion)}`
      );
      return res.json();
    },
    enabled: !!documentId && !!fromVersion && !!toVersion && fromVersion !== toVersion,
  });

  const versions = versionsData?.versions ?? [];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Version Comparison</CardTitle>
        <CardDescription>
          Select two versions to view the differences between them.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Version selectors */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5 min-w-[180px]">
            <label className="text-sm font-medium text-muted-foreground">From (older)</label>
            <Select value={fromVersion} onValueChange={setFromVersion} disabled={versionsLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.versionNumber}>
                    {v.versionNumber}
                    {v.versionLabel ? ` - ${v.versionLabel}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[180px]">
            <label className="text-sm font-medium text-muted-foreground">To (newer)</label>
            <Select value={toVersion} onValueChange={setToVersion} disabled={versionsLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.versionNumber}>
                    {v.versionNumber}
                    {v.versionLabel ? ` - ${v.versionLabel}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Loading / error states */}
        {versionsLoading && (
          <p className="text-sm text-muted-foreground">Loading versions...</p>
        )}
        {versionsError && (
          <p className="text-sm text-red-600">
            Failed to load versions: {(versionsError as Error).message}
          </p>
        )}
        {fromVersion && toVersion && fromVersion === toVersion && (
          <p className="text-sm text-amber-600">
            Please select two different versions to compare.
          </p>
        )}

        {/* Diff summary */}
        {diffData && (
          <div className="flex gap-3 items-center">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              +{diffData.additions} addition{diffData.additions !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              -{diffData.deletions} deletion{diffData.deletions !== 1 ? 's' : ''}
            </Badge>
          </div>
        )}

        {diffLoading && (
          <p className="text-sm text-muted-foreground">Computing diff...</p>
        )}
        {diffError && (
          <p className="text-sm text-red-600">
            Failed to compute diff: {(diffError as Error).message}
          </p>
        )}

        {/* Inline diff view */}
        {diffData && diffData.changes.length > 0 && (
          <div className="border rounded-md overflow-hidden font-mono text-sm">
            {diffData.changes.map((chunk, idx) => {
              const lines = chunk.content.split('\n');
              return (
                <React.Fragment key={idx}>
                  {lines.map((line, lineIdx) => {
                    const lineNumber = chunk.lineStart + lineIdx;
                    let bgClass = '';
                    let prefix = ' ';

                    if (chunk.type === 'add') {
                      bgClass = 'bg-green-50 text-green-900';
                      prefix = '+';
                    } else if (chunk.type === 'delete') {
                      bgClass = 'bg-red-50 text-red-900';
                      prefix = '-';
                    }

                    return (
                      <div
                        key={`${idx}-${lineIdx}`}
                        className={`flex ${bgClass} border-b border-gray-100 last:border-b-0`}
                      >
                        <span className="w-12 shrink-0 text-right pr-2 text-gray-400 select-none border-r border-gray-200 bg-gray-50 py-0.5">
                          {lineNumber}
                        </span>
                        <span className="w-5 shrink-0 text-center select-none py-0.5 font-bold">
                          {prefix}
                        </span>
                        <span className="flex-1 whitespace-pre-wrap break-all px-2 py-0.5">
                          {line}
                        </span>
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {diffData && diffData.changes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No differences found between version {diffData.from} and {diffData.to}.
          </p>
        )}

        {/* No versions state */}
        {!versionsLoading && versions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No versions found for this document.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
