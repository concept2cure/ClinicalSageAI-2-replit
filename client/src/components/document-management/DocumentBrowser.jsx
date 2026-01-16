import React, { useState, useEffect } from 'react';
import { useDocuShare } from '@/hooks/useDocuShare';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  Search, Filter, Plus, MoreVertical, FileText, Download, Eye, ArrowUpDown, Clock, CheckCircle, History, Lock, Trash2, Edit, FileUp } from 'lucide-react'

/**
 * Document Browser Component
 *
 * A comprehensive document management interface for browsing, searching,
 * filtering, and managing documents in the 21 CFR Part 11 compliant DocuShare system.
 *
 * @param {Object} props - Component props
 * @param {Function} props.onDocumentSelect - Called when a document is selected
 * @param {string} props.moduleContext - Filter documents by module context
 * @param {number} props.height - The height of the browser component
 */
export default function DocumentBrowser({ onDocumentSelect, moduleContext, height = 500 }) {
  const { documents, isLoadingDocuments, downloadDocument } = useDocuShare();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'lastModified', direction: 'desc' });
  const [filteredDocuments, setFilteredDocuments] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    documentTypes: [],
    dateRange: { start: null, end: null },
    authors: [],
  });

  // Format file size for display
  const formatFileSize = bytes => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  // Handle document selection
  const handleDocumentClick = doc => {
    if (onDocumentSelect) {
      onDocumentSelect(doc);
    }
  };

  // Sort documents
  const requestSort = key => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Handle document download
  const handleDownload = document => {
    downloadDocument(document.id);
  };

  // Filter and sort documents
  useEffect(() => {
    let docsToDisplay = [...documents];

    // Apply module context filter if provided
    if (moduleContext) {
      docsToDisplay = docsToDisplay.filter(doc => doc.moduleContext === moduleContext);
    }

    // Apply search filter
    if (searchTerm) {
      docsToDisplay = docsToDisplay.filter(
        doc =>
          doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          doc.author.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    docsToDisplay.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    setFilteredDocuments(docsToDisplay);
  }, [documents, searchTerm, sortConfig, moduleContext]);

  // Get unique document types for filtering
  const documentTypes = [...new Set(documents.map(doc => doc.documentType))];

  // Get unique authors for filtering
  const authors = [...new Set(documents.map(doc => doc.author))];

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <div className="mb-4 flex justify-between">
        <div className="flex-1 mr-2 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9 pr-4 py-2"
            placeholder="Search documents by name, author..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-blue-50 text-blue-600' : ''}
          >
            <Filter className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1.5" />
                Upload
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="cursor-pointer">
                <FileUp className="h-4 w-4 mr-2" />
                Upload Document
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer">
                <Lock className="h-4 w-4 mr-2" />
                Import with Electronic Signature
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showFilters && (
        <div className="mb-4 p-3 border rounded-md bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Document Types</h4>
              <div className="space-y-2">
                {documentTypes.map(type => (
                  <div key={type} className="flex items-center">
                    <Checkbox
                      id={`type-${type}`}
                      checked={filters.documentTypes.includes(type)}
                      onCheckedChange={checked => {
                        if (checked) {
                          setFilters(prev => ({
                            ...prev,
                            documentTypes: [...prev.documentTypes, type],
                          }));
                        } else {
                          setFilters(prev => ({
                            ...prev,
                            documentTypes: prev.documentTypes.filter(t => t !== type),
                          }));
                        }
                      }}
                    />
                    <label
                      htmlFor={`type-${type}`}
                      className="ml-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Date Range</h4>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">From</label>
                  <Input
                    type="date"
                    value={filters.dateRange.start || ''}
                    onChange={e => {
                      setFilters(prev => ({
                        ...prev,
                        dateRange: {
                          ...prev.dateRange,
                          start: e.target.value,
                        },
                      }));
                    }}
                    className="h-8"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">To</label>
                  <Input
                    type="date"
                    value={filters.dateRange.end || ''}
                    onChange={e => {
                      setFilters(prev => ({
                        ...prev,
                        dateRange: {
                          ...prev.dateRange,
                          end: e.target.value,
                        },
                      }));
                    }}
                    className="h-8"
                  />
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Authors</h4>
              <div className="space-y-2">
                {authors.map(author => (
                  <div key={author} className="flex items-center">
                    <Checkbox
                      id={`author-${author.replace(/\s+/g, '-')}`}
                      checked={filters.authors.includes(author)}
                      onCheckedChange={checked => {
                        if (checked) {
                          setFilters(prev => ({
                            ...prev,
                            authors: [...prev.authors, author],
                          }));
                        } else {
                          setFilters(prev => ({
                            ...prev,
                            authors: prev.authors.filter(a => a !== author),
                          }));
                        }
                      }}
                    />
                    <label
                      htmlFor={`author-${author.replace(/\s+/g, '-')}`}
                      className="ml-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {author}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilters({
                  documentTypes: [],
                  dateRange: { start: null, end: null },
                  authors: [],
                });
              }}
            >
              Reset Filters
            </Button>
            <Button size="sm" onClick={() => setShowFilters(false)}>
              Apply Filters
            </Button>
          </div>
        </div>
      )}

      <div className="border rounded-md overflow-hidden">
        <ScrollArea style={{ height: showFilters ? height - 200 : height - 80 }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-9">
                  <Checkbox
                    checked={
                      filteredDocuments.length > 0 &&
                      selectedDocuments.length === filteredDocuments.length
                    }
                    onCheckedChange={checked => {
                      if (checked) {
                        setSelectedDocuments(filteredDocuments.map(doc => doc.id));
                      } else {
                        setSelectedDocuments([]);
                      }
                    }}
                  />
                </TableHead>
                <TableHead className="w-[40%] cursor-pointer" onClick={() => requestSort('name')}>
                  <div className="flex items-center">
                    Document Name
                    {sortConfig.key === 'name' && (
                      <ArrowUpDown
                        className={`ml-1 h-3 w-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`}
                      />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => requestSort('documentType')}>
                  <div className="flex items-center">
                    Type
                    {sortConfig.key === 'documentType' && (
                      <ArrowUpDown
                        className={`ml-1 h-3 w-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`}
                      />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => requestSort('author')}>
                  <div className="flex items-center">
                    Author
                    {sortConfig.key === 'author' && (
                      <ArrowUpDown
                        className={`ml-1 h-3 w-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`}
                      />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => requestSort('lastModified')}>
                  <div className="flex items-center">
                    Last Modified
                    {sortConfig.key === 'lastModified' && (
                      <ArrowUpDown
                        className={`ml-1 h-3 w-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`}
                      />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => requestSort('version')}>
                  <div className="flex items-center">
                    Version
                    {sortConfig.key === 'version' && (
                      <ArrowUpDown
                        className={`ml-1 h-3 w-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`}
                      />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => requestSort('size')}>
                  <div className="flex items-center">
                    Size
                    {sortConfig.key === 'size' && (
                      <ArrowUpDown
                        className={`ml-1 h-3 w-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`}
                      />
                    )}
                  </div>
                </TableHead>
                <TableHead className="w-9"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingDocuments ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    Loading documents...
                  </TableCell>
                </TableRow>
              ) : filteredDocuments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <FileText className="h-8 w-8 text-gray-300 mb-2" />
                      <p className="text-gray-500">No documents found</p>
                      <Button variant="outline" className="mt-2">
                        <Plus className="h-4 w-4 mr-1.5" />
                        Upload Document
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredDocuments.map(doc => (
                  <TableRow
                    key={doc.id}
                    className={`cursor-pointer ${selectedDocuments.includes(doc.id) ? 'bg-blue-50' : ''}`}
                    onClick={() => handleDocumentClick(doc)}
                  >
                    <TableCell className="py-2" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedDocuments.includes(doc.id)}
                        onCheckedChange={checked => {
                          if (checked) {
                            setSelectedDocuments(prev => [...prev, doc.id]);
                          } else {
                            setSelectedDocuments(prev => prev.filter(id => id !== doc.id));
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium py-2">
                      <div className="flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-blue-600" />
                        <span>{doc.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline">{doc.documentType}</Badge>
                    </TableCell>
                    <TableCell className="py-2">{doc.author}</TableCell>
                    <TableCell className="py-2 whitespace-nowrap">
                      <div className="flex items-center">
                        <Clock className="h-3 w-3 text-gray-400 mr-1" />
                        {new Date(doc.lastModified).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">v{doc.version}</TableCell>
                    <TableCell className="py-2">{formatFileSize(doc.size)}</TableCell>
                    <TableCell className="py-2" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => handleDocumentClick(doc)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => handleDownload(doc)}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer">
                            <History className="h-4 w-4 mr-2" />
                            Version History
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer">
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Properties
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <div className="mt-3 flex justify-between items-center text-xs text-gray-500">
        <div className="flex items-center">
          <CheckCircle className="h-3 w-3 mr-1 text-teal-600" />
          21 CFR Part 11 Compliant Document Repository
        </div>
        <div>
          {filteredDocuments.length} of {documents.length} documents
        </div>
      </div>
    </div>
  );
}
