import React, { useState, useEffect } from 'react';
import { Search, FileText, Download, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function WorkingVault() {
  const [files, setFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      setFilteredFiles(
        files.filter(file => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    } else {
      setFilteredFiles(files);
    }
  }, [searchQuery, files]);

  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/vault/files');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data && data.files && Array.isArray(data.files)) {
        setFiles(data.files);
        setFilteredFiles(data.files);
      } else {
        console.warn('Invalid API response structure:', data);
        setFiles([]);
        setFilteredFiles([]);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      setFiles([]);
      setFilteredFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = bytes => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileTypeIcon = type => {
    switch (type) {
      case 'pdf':
        return '📄';
      case 'spreadsheet':
        return '📊';
      case 'image':
        return '🖼️';
      case 'xml':
        return '📋';
      case 'text':
        return '📝';
      default:
        return '📄';
    }
  };

  const openFile = async file => {
    try {
      // Test if file is accessible first
      const testUrl = `/api/vault/file/${encodeURIComponent(file.name)}`;
      const response = await fetch(testUrl, { method: 'HEAD' });

      if (response.ok) {
        // File is accessible, open it
        window.open(testUrl, '_blank');
        console.log(`Successfully opened file: ${file.name}`);
      } else {
        console.error(`File not accessible: ${response.status} ${response.statusText}`);
        // Try alternative path format
        const altUrl = file.path;
        window.open(altUrl, '_blank');
      }
    } catch (error) {
      console.error('Error opening file:', error);
      // Final fallback: force download
      downloadFile(file);
    }
  };

  const downloadFile = file => {
    const link = document.createElement('a');
    link.href = file.path;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading vault files...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Document Vault</h3>
        <span className="text-sm text-gray-500">{files.length} files</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search files..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* File List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredFiles.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchQuery ? 'No files match your search' : 'No files found'}
          </div>
        ) : (
          filteredFiles.map(file => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <span className="text-lg">{getFileTypeIcon(file.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)} • {file.type}
                  </p>
                </div>
              </div>
              <div className="flex space-x-1">
                <Button size="sm" variant="ghost" onClick={() => openFile(file)} title="View file">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => downloadFile(file)}
                  title="Download file"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary */}
      {files.length > 0 && (
        <div className="text-xs text-gray-500 border-t pt-2">
          Total: {files.length} files •
          {filteredFiles.length !== files.length && ` Showing: ${filteredFiles.length} files • `}
          Size: {formatFileSize(files.reduce((sum, file) => sum + file.size, 0))}
        </div>
      )}
    </div>
  );
}
