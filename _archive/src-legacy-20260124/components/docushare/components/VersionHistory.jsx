import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  History,
  Calendar,
  User,
  FileText,
  Download,
  Eye,
  RotateCcw,
  GitBranch,
} from 'lucide-react';

const VersionHistory = ({ selectedDocument, onVersionSelect, loading }) => {
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    if (selectedDocument?.id) {
      loadVersions();
    }
  }, [selectedDocument]);

  const loadVersions = async () => {
    try {
      setLoadingVersions(true);
      // Mock version data - replace with actual API call
      const mockVersions = [
        {
          id: 'v3',
          version: '3.0',
          author: 'Dr. Sarah Johnson',
          date: '2024-01-15T10:30:00Z',
          changes: 'Updated safety analysis section with latest data',
          status: 'current',
          size: 2048576,
          checksum: 'abc123def456',
        },
        {
          id: 'v2',
          version: '2.1',
          author: 'Dr. Michael Chen',
          date: '2024-01-10T14:20:00Z',
          changes: 'Minor formatting corrections and reference updates',
          status: 'archived',
          size: 2040960,
          checksum: 'def456ghi789',
        },
        {
          id: 'v1',
          version: '2.0',
          author: 'Dr. Sarah Johnson',
          date: '2024-01-05T09:15:00Z',
          changes: 'Major revision with updated efficacy data and methodology',
          status: 'archived',
          size: 1998848,
          checksum: 'ghi789jkl012',
        },
        {
          id: 'v0',
          version: '1.0',
          author: 'Dr. Emily Rodriguez',
          date: '2023-12-20T16:45:00Z',
          changes: 'Initial document creation',
          status: 'archived',
          size: 1945600,
          checksum: 'jkl012mno345',
        },
      ];
      setVersions(mockVersions);
    } catch (error) {
      console.error('Failed to load versions:', error);
    } finally {
      setLoadingVersions(false);
    }
  };

  const formatDate = dateString => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = bytes => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!selectedDocument) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <History className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>Select a document to view version history</p>
        </div>
      </div>
    );
  }

  if (loadingVersions) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading version history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Version History
            <Badge variant="outline">{versions.length} versions</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Track all changes and revisions made to{' '}
            {selectedDocument.title || selectedDocument.filename}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {versions.map((version, index) => (
          <Card
            key={version.id}
            className={`transition-all hover:shadow-md ${
              version.status === 'current' ? 'ring-2 ring-blue-200 bg-blue-50' : ''
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium text-lg">Version {version.version}</h4>
                    <Badge
                      variant={version.status === 'current' ? 'default' : 'secondary'}
                      className={version.status === 'current' ? 'bg-green-600' : ''}
                    >
                      {version.status === 'current' ? 'Current' : 'Archived'}
                    </Badge>
                  </div>

                  <p className="text-sm text-gray-700 mb-3">{version.changes}</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-500 mb-3">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(version.date)}
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {version.author}
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {formatFileSize(version.size)}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs">
                        {version.checksum.substring(0, 8)}...
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onVersionSelect(selectedDocument.id, version.version)}
                      className="flex items-center gap-1"
                    >
                      <Eye className="h-3 w-3" />
                      View
                    </Button>
                    <Button size="sm" variant="outline" className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      Download
                    </Button>
                    {version.status !== 'current' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex items-center gap-1 text-orange-600 hover:text-orange-700"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </Button>
                    )}
                  </div>
                </div>

                {index < versions.length - 1 && (
                  <div className="absolute left-6 mt-16 w-px h-8 bg-gray-300"></div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {versions.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            <History className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No version history available for this document</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default VersionHistory;
