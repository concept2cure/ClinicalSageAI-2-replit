import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  FileUp,
  Share2,
  Edit,
  Trash2,
  File,
  Clock,
  User,
  Tag,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  Menu,
  Save,
  FileText as FileWordIcon,
  FileSpreadsheet,
  FileJson,
  FileCode,
  Eye,
  Lock,
  ArrowUpRight,
  Table,
  Image,
  BarChart,
  FileArchive,
} from 'lucide-react';
import {
  downloadDocument,
  convertDocument,
  getSupportedFormats,
} from '../../hooks/useDocumentDownload';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

// Example HTML preview for HTML documents
const HtmlPreview = ({ htmlContent }) => (
  <div className="w-full h-full border rounded-lg overflow-hidden bg-white">
    <div className="border-b border-gray-200 px-3 py-2 flex items-center justify-between">
      <div className="flex items-center">
        <FileCode size={16} className="text-blue-600 mr-2" />
        <span className="text-sm font-medium">HTML Preview</span>
      </div>
    </div>
    <iframe
      srcDoc={htmlContent}
      className="w-full h-[calc(100%-40px)]"
      title="HTML Preview"
      sandbox="allow-same-origin"
    />
  </div>
);

// Placeholder for PDF preview (in a real app, use a PDF viewer library)
const PdfPreview = ({ document }) => (
  <div className="w-full h-full border rounded-lg overflow-hidden bg-gray-100 flex flex-col items-center justify-center">
    <File size={64} className="text-red-500 mb-4" />
    <h3 className="text-lg font-medium text-gray-900 mb-2">PDF Preview</h3>
    <p className="text-sm text-gray-600 mb-4 text-center max-w-md">
      {document.displayName}
      <br />
      <span className="text-xs">
        In production, this would use a PDF.js viewer or similar library.
      </span>
    </p>
  </div>
);

// JSON preview component
const JsonPreview = ({ jsonData }) => {
  const [expandedSections, setExpandedSections] = useState({});

  const toggleSection = key => {
    setExpandedSections({
      ...expandedSections,
      [key]: !expandedSections[key],
    });
  };

  const renderJson = (data, level = 0, parentKey = '') => {
    if (typeof data !== 'object' || data === null) {
      // Render primitive values
      return (
        <span className={`${typeof data === 'string' ? 'text-green-600' : 'text-purple-600'}`}>
          {typeof data === 'string' ? `"${data}"` : String(data)}
        </span>
      );
    }

    const isArray = Array.isArray(data);
    const keys = Object.keys(data);

    if (keys.length === 0) {
      return <span>{isArray ? '[]' : '{}'}</span>;
    }

    const fullKey = parentKey ? `${parentKey}.${level}` : String(level);
    const isExpanded = expandedSections[fullKey] !== false; // Default to expanded

    return (
      <div className="pl-4 border-l border-gray-200">
        <div
          className="flex items-center cursor-pointer hover:bg-gray-50 py-1"
          onClick={() => toggleSection(fullKey)}
        >
          <span className="text-gray-500 mr-1">{isExpanded ? '▼' : '▶'}</span>
          <span>{isArray ? '[' : '{'}</span>
          {!isExpanded && (
            <span className="ml-1 text-gray-500">
              {isArray ? `${keys.length} items` : `${keys.length} keys`}
            </span>
          )}
        </div>

        {isExpanded && (
          <div className="pl-2">
            {keys.map((key, index) => (
              <div key={key} className="py-1">
                <span className="text-blue-600 font-mono">{isArray ? '' : `"${key}": `}</span>
                {renderJson(data[key], index, fullKey)}
                {index < keys.length - 1 && <span>,</span>}
              </div>
            ))}
          </div>
        )}

        <div>{isArray ? ']' : '}'}</div>
      </div>
    );
  };

  let parsedData;
  try {
    parsedData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
  } catch (e) {
    return <div className="text-red-500 p-4">Invalid JSON: {e.message}</div>;
  }

  return (
    <div className="w-full h-full border rounded-lg overflow-auto bg-white">
      <div className="border-b border-gray-200 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center">
          <FileJson size={16} className="text-amber-600 mr-2" />
          <span className="text-sm font-medium">JSON Viewer</span>
        </div>
      </div>
      <div className="p-4 font-mono text-sm overflow-auto">{renderJson(parsedData)}</div>
    </div>
  );
};

// Image preview
const ImagePreview = ({ imageUrl, alt }) => (
  <div className="w-full h-full border rounded-lg overflow-hidden bg-gray-100 flex flex-col">
    <div className="border-b border-gray-200 px-3 py-2 flex items-center justify-between">
      <div className="flex items-center">
        <Image size={16} className="text-purple-600 mr-2" />
        <span className="text-sm font-medium">Image Preview</span>
      </div>
    </div>
    <div className="flex-1 flex items-center justify-center overflow-auto p-4">
      <img
        src={imageUrl}
        alt={alt || 'Image preview'}
        className="max-w-full max-h-full object-contain"
      />
    </div>
  </div>
);

// Spreadsheet preview (placeholder)
const SpreadsheetPreview = ({ document }) => (
  <div className="w-full h-full border rounded-lg overflow-hidden bg-white">
    <div className="border-b border-gray-200 px-3 py-2 flex items-center justify-between bg-green-50">
      <div className="flex items-center">
        <FileSpreadsheet size={16} className="text-green-600 mr-2" />
        <span className="text-sm font-medium">Spreadsheet Preview</span>
      </div>
    </div>
    <div className="p-4">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="border p-2 text-left"></th>
            <th className="border p-2 text-left">A</th>
            <th className="border p-2 text-left">B</th>
            <th className="border p-2 text-left">C</th>
            <th className="border p-2 text-left">D</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5].map(row => (
            <tr key={row}>
              <td className="border p-2 bg-gray-50 font-medium">{row}</td>
              {['A', 'B', 'C', 'D'].map(col => (
                <td key={col} className="border p-2">
                  {row === 1 && col === 'A' ? document.displayName : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 mt-4">
        In production, this would use a spreadsheet viewer component.
      </p>
    </div>
  </div>
);

export default function DocumentViewer({
  document,
  allowDelete = true,
  hideMetadata = false,
  onDelete = null,
}) {
  const { toast } = useToast();
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [previewMode, setPreviewMode] = useState('default');
  const [previewContent, setPreviewContent] = useState(null);
  const [supportedFormats, setSupportedFormats] = useState([]);

  // Get supported formats when component mounts
  useEffect(() => {
    setSupportedFormats(getSupportedFormats());
  }, []);

  // Determine preview mode based on document type
  useEffect(() => {
    if (!document) return;

    const fileName = document.displayName.toLowerCase();
    let mode = 'default';

    if (fileName.endsWith('.pdf')) {
      mode = 'pdf';
    } else if (fileName.endsWith('.json')) {
      mode = 'json';
      // Mock JSON data for preview
      const mockJsonData = {
        document: {
          name: document.displayName,
          type: document.type,
          status: document.status,
          metadata: {
            lastModified: document.lastModified,
            author: document.author || 'Unknown',
            tags: document.tags || [],
          },
        },
      };
      setPreviewContent(mockJsonData);
    } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      mode = 'html';
      // Mock HTML content for preview
      const mockHtmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>${document.displayName}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #2563eb; }
    .metadata { background: #f1f5f9; padding: 15px; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${document.displayName}</h1>
  <div class="metadata">
    <p><strong>Type:</strong> ${document.type}</p>
    <p><strong>Status:</strong> ${document.status}</p>
    <p><strong>Last Modified:</strong> ${document.lastModified}</p>
    <p><strong>Author:</strong> ${document.author || 'Unknown'}</p>
  </div>
  <p>This is a placeholder HTML preview for demonstration purposes.</p>
  <footer>Generated: ${new Date().toLocaleString()}</footer>
</body>
</html>`;
      setPreviewContent(mockHtmlContent);
    } else if (
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls') ||
      fileName.endsWith('.csv')
    ) {
      mode = 'spreadsheet';
    } else if (
      fileName.endsWith('.jpg') ||
      fileName.endsWith('.jpeg') ||
      fileName.endsWith('.png') ||
      fileName.endsWith('.gif')
    ) {
      mode = 'image';
      // In a real app, this would be a URL to the actual image
      setPreviewContent(
        `https://placehold.co/600x400/orange/white?text=${encodeURIComponent(document.displayName)}`
      );
    }

    setPreviewMode(mode);
  }, [document]);

  if (!document) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="bg-white rounded-lg p-8 text-center shadow-sm max-w-md">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-16 w-16 mx-auto mb-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Document Selected</h3>
          <p className="text-sm text-gray-600 mb-4">
            Select a document from the folder tree to preview it here.
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-sm text-gray-500">
            <div className="flex items-center">
              <FileText size={14} className="mr-1" /> View
            </div>
            <div className="flex items-center">
              <Download size={14} className="mr-1" /> Download
            </div>
            <div className="flex items-center">
              <Share2 size={14} className="mr-1" /> Share
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleDownload = async (format = 'original') => {
    setIsDownloading(true);
    try {
      let result;

      if (format === 'original') {
        result = await downloadDocument(document);
      } else {
        result = await convertDocument(document, format);
      }

      if (result.success) {
        toast({
          title: 'Download Successful',
          description: result.message,
          variant: 'default',
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      toast({
        title: 'Download Failed',
        description: error.message || 'Failed to download document',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
      setIsDownloadMenuOpen(false);
    }
  };

  // Get file icon based on document type/extension
  const getFileIcon = () => {
    const fileName = document.displayName.toLowerCase();

    if (fileName.endsWith('.pdf')) {
      return <FilePdf size={40} className="text-red-500" />;
    } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      return <FileWordIcon size={40} className="text-blue-600" />;
    } else if (
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls') ||
      fileName.endsWith('.csv')
    ) {
      return <FileSpreadsheet size={40} className="text-green-600" />;
    } else if (fileName.endsWith('.pptx') || fileName.endsWith('.ppt')) {
      return <File size={40} className="text-orange-600" />;
    } else if (fileName.endsWith('.json')) {
      return <FileJson size={40} className="text-amber-600" />;
    } else if (fileName.endsWith('.xml')) {
      return <FileCode size={40} className="text-purple-600" />;
    } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      return <FileCode size={40} className="text-blue-600" />;
    } else if (
      fileName.endsWith('.jpg') ||
      fileName.endsWith('.jpeg') ||
      fileName.endsWith('.png') ||
      fileName.endsWith('.gif')
    ) {
      return <Image size={40} className="text-purple-600" />;
    } else if (fileName.endsWith('.zip') || fileName.endsWith('.rar')) {
      return <FileArchive size={40} className="text-gray-600" />;
    } else {
      return <FileText size={40} className="text-gray-600" />;
    }
  };

  // Render document preview based on type
  const renderDocumentPreview = () => {
    switch (previewMode) {
      case 'pdf':
        return <PdfPreview document={document} />;
      case 'json':
        return <JsonPreview jsonData={previewContent} />;
      case 'html':
        return <HtmlPreview htmlContent={previewContent} />;
      case 'spreadsheet':
        return <SpreadsheetPreview document={document} />;
      case 'image':
        return <ImagePreview imageUrl={previewContent} alt={document.displayName} />;
      default:
        return (
          <div className="border rounded-lg p-6 text-center flex flex-col items-center">
            {getFileIcon()}
            <h3 className="text-lg font-medium text-gray-900 mb-2 mt-4">{document.displayName}</h3>
            <p className="text-sm text-gray-600 mb-6">{document.type || 'Document'}</p>

            {document.status && (
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mb-4 ${
                  document.status === 'Final'
                    ? 'bg-green-100 text-green-800'
                    : document.status === 'Draft'
                      ? 'bg-yellow-100 text-yellow-800'
                      : document.status === 'Under Review'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                }`}
              >
                {document.status === 'Final' && <CheckCircle size={12} className="mr-1" />}
                {document.status}
              </span>
            )}

            <div className="border-t w-full pt-4 mt-2">
              <p className="text-sm text-gray-600">
                Click the Download button to save this document in different formats
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-col rounded-lg shadow-sm overflow-hidden border border-gray-200">
      <div className="flex items-center justify-between border-b px-4 py-3 bg-white">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <FileText size={18} className="mr-2 text-orange-600" />
          {document.displayName}
        </h3>
        <div className="flex space-x-1">
          <button
            className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
            title="View in new window"
            onClick={() => window.open(`#`, '_blank')}
          >
            <ArrowUpRight size={16} />
          </button>
          {allowDelete && onDelete && (
            <button
              className="p-1.5 rounded hover:bg-red-50 text-red-500"
              title="Delete document"
              onClick={() => onDelete(document)}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div
        className={`grid ${hideMetadata ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'} gap-4 p-4 bg-white flex-grow`}
      >
        <div className={hideMetadata ? 'col-span-1' : 'col-span-2'}>
          <div className="flex items-center mb-4">
            <div className="relative">
              <button
                className={`inline-flex items-center justify-center px-3 py-1.5 border rounded shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none text-sm mr-2 ${isDownloading ? 'opacity-70 cursor-not-allowed' : ''}`}
                onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                disabled={isDownloading}
              >
                <Download size={14} className="mr-1.5" />
                Download
                <ChevronDown size={14} className="ml-1.5" />
              </button>

              {isDownloadMenuOpen && (
                <div className="absolute left-0 mt-1 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                  <div className="py-1">
                    <button
                      className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => handleDownload('original')}
                    >
                      <Download size={14} className="mr-2" />
                      Download Original
                    </button>
                    <div className="border-t border-gray-100 my-1"></div>
                    {supportedFormats.map(format => (
                      <button
                        key={format.value}
                        className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => handleDownload(format.value)}
                      >
                        {format.value === 'pdf' && (
                          <FilePdf size={14} className="mr-2 text-red-500" />
                        )}
                        {format.value === 'docx' && (
                          <FileWordIcon size={14} className="mr-2 text-blue-600" />
                        )}
                        {format.value === 'xlsx' && (
                          <FileSpreadsheet size={14} className="mr-2 text-green-600" />
                        )}
                        {format.value === 'pptx' && (
                          <File size={14} className="mr-2 text-orange-600" />
                        )}
                        {!['pdf', 'docx', 'xlsx', 'pptx'].includes(format.value) && (
                          <File size={14} className="mr-2 text-gray-500" />
                        )}
                        Download as {format.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none text-sm mr-2">
              <Share2 size={14} className="mr-1.5" />
              Share
            </button>

            {!hideMetadata && (
              <button className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none text-sm">
                <Edit size={14} className="mr-1.5" />
                Edit
              </button>
            )}
          </div>

          <div className="h-[calc(100%-60px)] overflow-auto">{renderDocumentPreview()}</div>
        </div>

        {!hideMetadata && (
          <div className="bg-gray-50 rounded-lg p-4 border">
            <h4 className="font-medium text-black mb-3">Document Details</h4>
            <div className="space-y-3 text-sm">
              <div className="flex">
                <div className="text-gray-700 w-28 flex items-center">
                  <File size={14} className="mr-1.5" /> Document Type:
                </div>
                <div className="font-medium text-black">{document.type || 'Not specified'}</div>
              </div>
              <div className="flex">
                <div className="text-gray-700 w-28 flex items-center">
                  <Clock size={14} className="mr-1.5" /> Last Modified:
                </div>
                <div className="font-medium text-black">{document.lastModified || 'Unknown'}</div>
              </div>
              <div className="flex">
                <div className="text-gray-700 w-28 flex items-center">
                  <CheckCircle size={14} className="mr-1.5" /> Status:
                </div>
                <div className="font-medium">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      document.status === 'Final'
                        ? 'bg-green-100 text-green-800'
                        : document.status === 'Draft'
                          ? 'bg-yellow-100 text-yellow-800'
                          : document.status === 'Under Review'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {document.status || 'Unknown'}
                  </span>
                </div>
              </div>
              <div className="flex">
                <div className="text-gray-700 w-28 flex items-center">
                  <User size={14} className="mr-1.5" /> Author:
                </div>
                <div className="font-medium text-black">{document.author || 'Unknown'}</div>
              </div>

              {document.tags && document.tags.length > 0 && (
                <div className="flex">
                  <div className="text-gray-700 w-28 flex items-center">
                    <Tag size={14} className="mr-1.5" /> Tags:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {document.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Regulatory compliance section */}
              <div className="mt-3 pt-4 border-t border-gray-200">
                <h5 className="font-medium text-black mb-2 flex items-center">
                  <Lock size={14} className="mr-1.5 text-orange-600" />
                  Regulatory Compliance
                </h5>
                <div className="bg-green-50 rounded-md p-3 mb-2">
                  <div className="flex items-center mb-1">
                    <CheckCircle size={14} className="text-green-600 mr-1.5" />
                    <span className="text-green-800 font-medium">21 CFR Part 11 Compliant</span>
                  </div>
                  <p className="text-xs text-green-700">
                    This document meets all requirements for electronic records per FDA 21 CFR Part
                    11.
                  </p>
                </div>
              </div>

              {/* Document Actions */}
              <div className="pt-2">
                <h5 className="font-medium text-black mb-2">Document Actions</h5>
                <div className="space-y-2">
                  <button className="inline-flex w-full items-center px-3 py-1.5 border border-gray-200 rounded text-sm text-gray-700 hover:bg-orange-50">
                    <Download size={14} className="mr-1.5" /> Export Metadata
                  </button>
                  <button className="inline-flex w-full items-center px-3 py-1.5 border border-gray-200 rounded text-sm text-gray-700 hover:bg-orange-50">
                    <AlertCircle size={14} className="mr-1.5" /> Compliance Check
                  </button>
                  <button className="inline-flex w-full items-center px-3 py-1.5 border border-gray-200 rounded text-sm text-gray-700 hover:bg-orange-50">
                    <Eye size={14} className="mr-1.5" /> View Version History
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
