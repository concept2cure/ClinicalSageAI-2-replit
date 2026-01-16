import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, File, X } from 'lucide-react'

const DocumentUpload = ({ onDocumentUpload, moduleType, loading, tenantId }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [metadata, setMetadata] = useState({
    title: '',
    description: '',
    category: '',
    tags: '',
    confidentiality: 'internal',
  });

  const documentCategories = {
    general: ['Protocol', 'Report', 'Correspondence', 'Other'],
    cer: ['Clinical Evaluation', 'Literature Review', 'Risk Analysis', 'Technical Documentation'],
    ind: ['Module 1', 'Module 2', 'Module 3', 'Module 4', 'Module 5'],
    cmc: ['Manufacturing', 'Quality Control', 'Specifications', 'Stability Data'],
  };

  const handleDrag = useCallback(e => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(e => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setMetadata(prev => ({
        ...prev,
        title: e.dataTransfer.files[0].name.replace(/\.[^/.]+$/, ''),
      }));
    }
  }, []);

  const handleFileSelect = e => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setMetadata(prev => ({
        ...prev,
        title: e.target.files[0].name.replace(/\.[^/.]+$/, ''),
      }));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    await onDocumentUpload(selectedFile, {
      ...metadata,
      tags: metadata.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean),
      uploadedAt: new Date().toISOString(),
      size: selectedFile.size,
      type: selectedFile.type,
    });

    // Reset form
    setSelectedFile(null);
    setMetadata({
      title: '',
      description: '',
      category: '',
      tags: '',
      confidentiality: 'internal',
    });
  };

  const removeFile = () => {
    setSelectedFile(null);
    setMetadata(prev => ({ ...prev, title: '' }));
  };

  return (
    <div className="space-y-4">
      {/* File Drop Zone */}
      <Card
        className={`border-2 border-dashed transition-colors ${
          dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <CardContent className="p-6 text-center">
          {selectedFile ? (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <File className="h-8 w-8 text-blue-600" />
                <div className="text-left">
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={removeFile}
                className="text-red-600 hover:text-red-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="py-8">
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                Drop files here or click to browse
              </p>
              <p className="text-sm text-gray-500">Supports PDF, DOC, DOCX, XLS, XLSX (max 50MB)</p>
              <input
                type="file"
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                id="file-input"
              />
              <label htmlFor="file-input">
                <Button className="mt-4" variant="outline">
                  Select File
                </Button>
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metadata Form */}
      {selectedFile && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">Document Title</Label>
              <Input
                id="title"
                value={metadata.title}
                onChange={e => setMetadata(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter document title"
              />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                value={metadata.category}
                onValueChange={value => setMetadata(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {(documentCategories[moduleType] || documentCategories.general).map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={metadata.description}
              onChange={e => setMetadata(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the document content and purpose"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={metadata.tags}
                onChange={e => setMetadata(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="clinical, efficacy, safety"
              />
            </div>
            <div>
              <Label htmlFor="confidentiality">Confidentiality</Label>
              <Select
                value={metadata.confidentiality}
                onValueChange={value => setMetadata(prev => ({ ...prev, confidentiality: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="confidential">Confidential</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleUpload}
            disabled={loading || !metadata.title.trim()}
            className="w-full"
          >
            {loading ? 'Uploading...' : 'Upload Document'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;
