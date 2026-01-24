import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  ListFilter,
  Search,
  X,
  EyeOff,
  Eye,
  Clock,
  User,
  Tag,
  Star,
  StarOff,
  FileText as FileWordIcon,
  FilePdf,
  FileSpreadsheet,
  FilePresentation,
  FileJson,
  FileCode,
  Image,
  FileArchive,
  Zap,
  Plus,
} from 'lucide-react';
import { useDocuShare } from '../../contexts/DocuShareContext';

// Icon mapping for different file types
const FILE_ICONS = {
  pdf: { icon: FilePdf, color: 'text-red-500' },
  docx: { icon: FileWordIcon, color: 'text-blue-600' },
  doc: { icon: FileWordIcon, color: 'text-blue-600' },
  xlsx: { icon: FileSpreadsheet, color: 'text-green-600' },
  xls: { icon: FileSpreadsheet, color: 'text-green-600' },
  csv: { icon: FileSpreadsheet, color: 'text-green-600' },
  pptx: { icon: FilePresentation, color: 'text-orange-600' },
  ppt: { icon: FilePresentation, color: 'text-orange-600' },
  json: { icon: FileJson, color: 'text-amber-600' },
  xml: { icon: FileCode, color: 'text-purple-600' },
  html: { icon: FileCode, color: 'text-blue-600' },
  htm: { icon: FileCode, color: 'text-blue-600' },
  jpg: { icon: Image, color: 'text-purple-600' },
  jpeg: { icon: Image, color: 'text-purple-600' },
  png: { icon: Image, color: 'text-purple-600' },
  gif: { icon: Image, color: 'text-purple-600' },
  zip: { icon: FileArchive, color: 'text-gray-600' },
  rar: { icon: FileArchive, color: 'text-gray-600' },
  default: { icon: FileText, color: 'text-orange-600' },
};

/**
 * Get file icon based on file extension
 */
function getFileIcon(filename) {
  if (!filename) return FILE_ICONS.default;

  const extension = filename.split('.').pop().toLowerCase();
  return FILE_ICONS[extension] || FILE_ICONS.default;
}

/**
 * FolderTreeView Component
 *
 * A Microsoft-style folder tree view component that organizes documents into
 * a hierarchical folder structure with expandable/collapsible folders.
 */
export default function FolderTreeView({
  onSelectDocument,
  customView = 'default', // 'default', 'bystatus', 'bytype', 'bydate', 'favorites'
  showStatusBadges = true,
  showFileIcons = true,
  showFileCounts = true,
  showToolbar = true,
  allowFavorites = true,
  initialOpenFolders = true, // whether folders start open or closed
  compactMode = false, // more condensed view
}) {
  const { docs, selectedDoc } = useDocuShare();
  const [filterTerm, setFilterTerm] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [folderStructure, setFolderStructure] = useState({});
  const [favorites, setFavorites] = useState([]);
  const [viewMode, setViewMode] = useState(customView);

  // Handle favorites
  useEffect(() => {
    // In a real app, this would load from localStorage or backend
    const savedFavorites = localStorage.getItem('docFavorites');
    if (savedFavorites) {
      try {
        setFavorites(JSON.parse(savedFavorites));
      } catch (e) {
        console.error('Failed to parse favorites', e);
        setFavorites([]);
      }
    }
  }, []);

  // Save favorites whenever they change
  useEffect(() => {
    localStorage.setItem('docFavorites', JSON.stringify(favorites));
  }, [favorites]);

  // Build folder structure based on view mode and filter
  useEffect(() => {
    let structure;

    switch (viewMode) {
      case 'bystatus':
        structure = buildStatusStructure(docs, filterTerm);
        break;
      case 'bytype':
        structure = buildTypeStructure(docs, filterTerm);
        break;
      case 'bydate':
        structure = buildDateStructure(docs, filterTerm);
        break;
      case 'favorites':
        structure = buildFavoritesStructure(docs, favorites, filterTerm);
        break;
      default:
        structure = buildFolderStructure(docs, filterTerm);
    }

    setFolderStructure(structure);
  }, [docs, viewMode, filterTerm, favorites]);

  // Toggle favorite status of a document
  const toggleFavorite = doc => {
    if (favorites.includes(doc.objectId)) {
      setFavorites(favorites.filter(id => id !== doc.objectId));
    } else {
      setFavorites([...favorites, doc.objectId]);
    }
  };

  // Clear filter
  const clearFilter = () => {
    setFilterTerm('');
  };

  return (
    <div className="h-full flex flex-col bg-white border rounded-lg overflow-hidden">
      {showToolbar && (
        <div className="p-2 border-b flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <button
              className={`p-1.5 rounded ${viewMode === 'default' ? 'bg-orange-100 text-orange-700' : 'text-gray-700 hover:bg-gray-100'}`}
              onClick={() => setViewMode('default')}
              title="Default view"
            >
              <Folder size={16} />
            </button>
            <button
              className={`p-1.5 rounded ${viewMode === 'bystatus' ? 'bg-orange-100 text-orange-700' : 'text-gray-700 hover:bg-gray-100'}`}
              onClick={() => setViewMode('bystatus')}
              title="View by status"
            >
              <Zap size={16} />
            </button>
            <button
              className={`p-1.5 rounded ${viewMode === 'bydate' ? 'bg-orange-100 text-orange-700' : 'text-gray-700 hover:bg-gray-100'}`}
              onClick={() => setViewMode('bydate')}
              title="View by date"
            >
              <Clock size={16} />
            </button>
            {allowFavorites && (
              <button
                className={`p-1.5 rounded ${viewMode === 'favorites' ? 'bg-orange-100 text-orange-700' : 'text-gray-700 hover:bg-gray-100'}`}
                onClick={() => setViewMode('favorites')}
                title="Favorites"
              >
                <Star size={16} />
              </button>
            )}
          </div>

          <div className="flex items-center">
            {showFilter ? (
              <div className="relative">
                <input
                  type="text"
                  value={filterTerm}
                  onChange={e => setFilterTerm(e.target.value)}
                  placeholder="Filter..."
                  className="text-sm border rounded-lg pr-7 pl-2 py-1 w-36 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  autoFocus
                />
                <button
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  onClick={clearFilter}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                className="p-1.5 rounded text-gray-700 hover:bg-gray-100"
                onClick={() => setShowFilter(true)}
                title="Filter documents"
              >
                <Search size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-y-auto flex-1 p-2">
        {Object.keys(folderStructure).length === 0 ? (
          <div className="text-center p-4 text-gray-500">
            <p>No documents found</p>
          </div>
        ) : (
          <div className="space-y-1">
            {Object.keys(folderStructure).map(folderName => (
              <FolderNode
                key={folderName}
                name={folderName}
                items={folderStructure[folderName]}
                level={0}
                onSelectDocument={onSelectDocument}
                selectedDoc={selectedDoc}
                initialExpanded={initialOpenFolders}
                showStatusBadges={showStatusBadges}
                showFileIcons={showFileIcons}
                showFileCounts={showFileCounts}
                compactMode={compactMode}
                favorites={favorites}
                toggleFavorite={allowFavorites ? toggleFavorite : null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Recursive folder tree node component
 */
function FolderNode({
  name,
  items,
  level,
  onSelectDocument,
  selectedDoc,
  initialExpanded = true,
  showStatusBadges = true,
  showFileIcons = true,
  showFileCounts = true,
  compactMode = false,
  favorites = [],
  toggleFavorite = null,
}) {
  const [expanded, setExpanded] = useState(initialExpanded);

  // Count files and folders
  const fileCount = items.files ? items.files.length : 0;
  const folderCount = Object.keys(items).filter(key => key !== 'files').length;

  const handleToggle = () => {
    setExpanded(!expanded);
  };

  const indent = compactMode ? level * 12 : level * 16; // Indentation per level

  return (
    <div>
      <div
        className={`flex items-center cursor-pointer select-none ${compactMode ? 'py-0.5' : 'py-1'} hover:bg-orange-50 rounded px-1`}
        onClick={handleToggle}
        style={{ paddingLeft: `${indent}px` }}
      >
        <span className="mr-1 text-gray-500">
          {expanded ? (
            <ChevronDown size={compactMode ? 12 : 14} />
          ) : (
            <ChevronRight size={compactMode ? 12 : 14} />
          )}
        </span>
        <span className="mr-1.5 text-orange-500">
          {expanded ? (
            <FolderOpen size={compactMode ? 14 : 16} />
          ) : (
            <Folder size={compactMode ? 14 : 16} />
          )}
        </span>
        <span className={`${compactMode ? 'text-xs' : 'text-sm'} font-medium text-black`}>
          {name}
        </span>
        {showFileCounts && (
          <span className={`ml-2 ${compactMode ? 'text-[10px]' : 'text-xs'} text-gray-500`}>
            ({folderCount > 0 ? `${folderCount} folder${folderCount !== 1 ? 's' : ''}, ` : ''}
            {fileCount} file{fileCount !== 1 ? 's' : ''})
          </span>
        )}
      </div>

      {expanded && (
        <div>
          {/* Render files in this folder */}
          {items.files &&
            items.files.map(file => {
              const FileIcon = showFileIcons ? getFileIcon(file.displayName).icon : FileText;
              const iconColor = showFileIcons
                ? getFileIcon(file.displayName).color
                : 'text-gray-500';
              const isFavorite = favorites.includes(file.objectId);

              return (
                <div
                  key={file.objectId}
                  className={`group flex items-center ${compactMode ? 'py-0.5' : 'py-1'} px-1 cursor-pointer rounded hover:bg-orange-50 ${
                    selectedDoc?.objectId === file.objectId ? 'bg-orange-100' : ''
                  }`}
                  style={{ paddingLeft: `${indent + (compactMode ? 16 : 24)}px` }}
                >
                  <div className="flex-1 flex items-center" onClick={() => onSelectDocument(file)}>
                    <FileIcon size={compactMode ? 12 : 14} className={`mr-1.5 ${iconColor}`} />
                    <span className={`${compactMode ? 'text-xs' : 'text-sm'} truncate text-black`}>
                      {file.displayName}
                    </span>

                    {showStatusBadges && file.status && (
                      <span
                        className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          file.status === 'Final'
                            ? 'bg-green-100 text-green-800'
                            : file.status === 'Draft'
                              ? 'bg-yellow-100 text-yellow-800'
                              : file.status === 'Under Review'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {file.status}
                      </span>
                    )}
                  </div>

                  {toggleFavorite && (
                    <button
                      className={`p-1 rounded ${isFavorite ? 'text-amber-500' : 'text-gray-400 opacity-0 group-hover:opacity-100'} hover:bg-gray-100`}
                      onClick={e => {
                        e.stopPropagation();
                        toggleFavorite(file);
                      }}
                    >
                      {isFavorite ? <Star size={12} /> : <StarOff size={12} />}
                    </button>
                  )}
                </div>
              );
            })}

          {/* Render sub-folders */}
          {Object.keys(items)
            .filter(key => key !== 'files')
            .map(folderName => (
              <FolderNode
                key={folderName}
                name={folderName}
                items={items[folderName]}
                level={level + 1}
                onSelectDocument={onSelectDocument}
                selectedDoc={selectedDoc}
                initialExpanded={initialExpanded}
                showStatusBadges={showStatusBadges}
                showFileIcons={showFileIcons}
                showFileCounts={showFileCounts}
                compactMode={compactMode}
                favorites={favorites}
                toggleFavorite={toggleFavorite}
              />
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * Filter documents based on search term
 */
function filterDocuments(docs, filterTerm) {
  if (!filterTerm) return docs;

  const lowerFilter = filterTerm.toLowerCase();
  return docs.filter(
    doc =>
      doc.displayName.toLowerCase().includes(lowerFilter) ||
      (doc.type && doc.type.toLowerCase().includes(lowerFilter)) ||
      (doc.author && doc.author.toLowerCase().includes(lowerFilter)) ||
      (doc.status && doc.status.toLowerCase().includes(lowerFilter)) ||
      (doc.tags && doc.tags.some(tag => tag.toLowerCase().includes(lowerFilter)))
  );
}

/**
 * Build folder structure from document list (default view)
 */
function buildFolderStructure(documents, filterTerm = '') {
  const filteredDocs = filterDocuments(documents, filterTerm);
  const structure = {};

  // Define special folder order
  const folderOrder = [
    'Recent',
    'Regulatory',
    'Clinical',
    'IND',
    'CSR',
    'CER',
    'Safety',
    'CMC',
    'Quality',
    'Shared',
  ];

  // First pass: create the basic structure
  filteredDocs.forEach(doc => {
    // Determine main folder based on module
    let mainFolder;
    switch (doc.module) {
      case 'ind':
        mainFolder = 'IND';
        break;
      case 'csr':
        mainFolder = 'CSR';
        break;
      case 'cer':
        mainFolder = 'CER';
        break;
      case 'regulatory':
        mainFolder = 'Regulatory';
        break;
      case 'safety':
        mainFolder = 'Safety';
        break;
      case 'enterprise':
        mainFolder = 'Enterprise';
        break;
      default:
        // For general docs, categorize by type
        if (doc.type?.includes('Clinical')) mainFolder = 'Clinical';
        else if (doc.type?.includes('Chemistry Manufacturing Controls')) mainFolder = 'CMC';
        else if (doc.type?.includes('Quality')) mainFolder = 'Quality';
        else mainFolder = 'General';
    }

    // Create main folder if it doesn't exist
    if (!structure[mainFolder]) {
      structure[mainFolder] = { files: [] };
    }

    // Determine subfolder based on document type or specific criteria
    let subFolder = 'General';

    if (doc.type) {
      // Extract a reasonable subfolder name from document type
      if (doc.type.includes('Protocol')) subFolder = 'Protocols';
      else if (doc.type.includes('Report')) subFolder = 'Reports';
      else if (doc.type.includes('Submission')) subFolder = 'Submissions';
      else if (doc.type.includes('Meeting')) subFolder = 'Meeting Minutes';
      else if (doc.type.includes('Guidelines')) subFolder = 'Guidelines';
      else if (doc.type.includes('SOP')) subFolder = 'SOPs';
      else subFolder = doc.type;
    }

    // Create subfolder if it doesn't exist
    if (!structure[mainFolder][subFolder]) {
      structure[mainFolder][subFolder] = { files: [] };
    }

    // Add document to subfolder
    structure[mainFolder][subFolder].files.push(doc);
  });

  // Create a "Recent" folder with the most recent documents
  const recentDocs = [...filteredDocs]
    .sort((a, b) => {
      // Sort by date (recent first)
      const dateA = new Date(a.lastModified);
      const dateB = new Date(b.lastModified);
      return dateB - dateA;
    })
    .slice(0, 10); // Get top 10 most recent

  if (recentDocs.length > 0) {
    structure['Recent'] = { files: recentDocs };
  }

  // Create a ordered structure based on folderOrder
  const orderedStructure = {};
  folderOrder.forEach(folder => {
    if (structure[folder]) {
      orderedStructure[folder] = structure[folder];
    }
  });

  // Add any remaining folders not in the predefined order
  Object.keys(structure).forEach(folder => {
    if (!orderedStructure[folder]) {
      orderedStructure[folder] = structure[folder];
    }
  });

  return orderedStructure;
}

/**
 * Build folder structure categorized by status
 */
function buildStatusStructure(documents, filterTerm = '') {
  const filteredDocs = filterDocuments(documents, filterTerm);
  const structure = {};

  // Define status categories
  const statusCategories = {
    Final: { order: 1 },
    'Under Review': { order: 2 },
    Draft: { order: 3 },
    Other: { order: 4 },
  };

  // Group documents by status
  filteredDocs.forEach(doc => {
    const status = doc.status || 'Other';

    if (!structure[status]) {
      structure[status] = { files: [] };
    }

    structure[status].files.push(doc);
  });

  // Create an ordered structure based on status priority
  const orderedStructure = {};
  Object.keys(statusCategories)
    .sort((a, b) => statusCategories[a].order - statusCategories[b].order)
    .forEach(status => {
      if (structure[status]) {
        orderedStructure[status] = structure[status];
      }
    });

  // Add any remaining statuses
  Object.keys(structure).forEach(status => {
    if (!orderedStructure[status]) {
      orderedStructure[status] = structure[status];
    }
  });

  return orderedStructure;
}

/**
 * Build folder structure categorized by document type
 */
function buildTypeStructure(documents, filterTerm = '') {
  const filteredDocs = filterDocuments(documents, filterTerm);
  const structure = {};

  // Group documents by type
  filteredDocs.forEach(doc => {
    const type = doc.type || 'Other';

    if (!structure[type]) {
      structure[type] = { files: [] };
    }

    structure[type].files.push(doc);
  });

  return structure;
}

/**
 * Build folder structure categorized by date
 */
function buildDateStructure(documents, filterTerm = '') {
  const filteredDocs = filterDocuments(documents, filterTerm);
  const structure = {};

  // Create date categories
  const today = new Date();
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const thisYear = new Date(today.getFullYear(), 0, 1);

  // Define date categories
  const dateCategories = {
    'This Month': {
      check: date => date >= thisMonth,
      order: 1,
    },
    'Last Month': {
      check: date => date >= lastMonth && date < thisMonth,
      order: 2,
    },
    'This Year': {
      check: date => date >= thisYear && date < lastMonth,
      order: 3,
    },
    Older: {
      check: date => date < thisYear,
      order: 4,
    },
  };

  // Group documents by date category
  filteredDocs.forEach(doc => {
    const date = doc.lastModified ? new Date(doc.lastModified) : new Date(0);
    let category = 'Older'; // Default

    // Determine the appropriate date category
    for (const [cat, { check }] of Object.entries(dateCategories)) {
      if (check(date)) {
        category = cat;
        break;
      }
    }

    if (!structure[category]) {
      structure[category] = { files: [] };
    }

    structure[category].files.push(doc);
  });

  // Create an ordered structure based on date category
  const orderedStructure = {};
  Object.keys(dateCategories)
    .sort((a, b) => dateCategories[a].order - dateCategories[b].order)
    .forEach(category => {
      if (structure[category]) {
        orderedStructure[category] = structure[category];
      }
    });

  return orderedStructure;
}

/**
 * Build folder structure for favorites
 */
function buildFavoritesStructure(documents, favorites, filterTerm = '') {
  const filteredDocs = filterDocuments(documents, filterTerm);
  const favoriteDocs = filteredDocs.filter(doc => favorites.includes(doc.objectId));

  return {
    Favorites: { files: favoriteDocs },
  };
}
