import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Eye, Download, CheckCircle, AlertCircle, Clock, FileText } from 'lucide-react'
import { format } from 'date-fns';

/**
 * Document List Component
 *
 * Displays a list of documents with filtering, sorting, and pagination.
 *
 * @param {Object} props
 * @param {Array} props.documents - List of document objects to display
 * @param {boolean} props.loading - Whether documents are loading
 * @param {Function} props.onView - Function to call when View button is clicked, receives document
 * @param {Function} props.onDownload - Function to call when Download button is clicked, receives document
 * @param {Function} props.onApprove - Function to call when Approve button is clicked, receives document
 * @param {number} props.page - Current page number
 * @param {number} props.totalPages - Total number of pages
 * @param {Function} props.onPageChange - Function to call when page is changed, receives page number
 */
const DocumentList = ({
  documents = [],
  loading = false,
  onView,
  onDownload,
  onApprove,
  page = 1,
  totalPages = 1,
  onPageChange,
}) => {
  // Helper to render status badge
  const renderStatusBadge = status => {
    switch (status.toLowerCase()) {
      case 'draft':
        return (
          <Badge variant="outline" className="bg-gray-100">
            Draft
          </Badge>
        );
      case 'review':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800">
            In Review
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800">
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800">
            Needs Revision
          </Badge>
        );
      case 'final':
        return (
          <Badge variant="outline" className="bg-purple-100 text-purple-800">
            Final
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Render icon based on document type/module
  const renderDocumentIcon = module => {
    switch (module) {
      case 'cer':
        return <FileText className="h-5 w-5 text-blue-600" />;
      case 'ind':
        return <FileText className="h-5 w-5 text-green-600" />;
      case 'csr':
        return <FileText className="h-5 w-5 text-purple-600" />;
      case 'cmc':
        return <FileText className="h-5 w-5 text-orange-600" />;
      default:
        return <FileText className="h-5 w-5 text-gray-600" />;
    }
  };

  // Format date for display
  const formatDate = dateString => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return dateString;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-medium">No documents found</h3>
            <p className="text-muted-foreground mt-1">
              Try adjusting your filters or create a new document.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Module / Section</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell>{renderDocumentIcon(doc.module || 'default')}</TableCell>
                      <TableCell className="font-medium">
                        <div className="font-medium">{doc.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {doc.deviceName || doc.name || 'Document'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="capitalize">
                          {doc.module || doc.documentType || 'Document'}
                        </div>
                        {doc.section && (
                          <div className="text-sm text-muted-foreground">{doc.section}</div>
                        )}
                      </TableCell>
                      <TableCell>{renderStatusBadge(doc.status)}</TableCell>
                      <TableCell>
                        <div>
                          {doc.lastModified
                            ? formatDate(doc.lastModified)
                            : doc.generatedAt
                              ? formatDate(doc.generatedAt)
                              : 'Unknown'}
                        </div>
                        {doc.owner && (
                          <div className="text-sm text-muted-foreground">{doc.owner}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button variant="outline" size="sm" onClick={() => onView && onView(doc)}>
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">View</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onDownload && onDownload(doc)}
                          >
                            <Download className="h-4 w-4" />
                            <span className="sr-only">Download</span>
                          </Button>
                          {onApprove && doc.status !== 'approved' && doc.status !== 'final' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onApprove(doc)}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <CheckCircle className="h-4 w-4" />
                              <span className="sr-only">Approve</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center space-x-2 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange && onPageChange(page - 1)}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange && onPageChange(page + 1)}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DocumentList;
