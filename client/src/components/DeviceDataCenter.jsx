// /client/src/components/DeviceDataCenter.jsx
import { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  FileText,
  Upload,
  Search,
  Filter,
  Download,
  Eye,
  Tags,
  FileCheck,
  Heart,
  Zap,
  Code,
  Shield,
  Clock,
  Package,
  Users,
  Activity,
  Factory,
  AlertTriangle,
  Plus,
  X,
  ChevronRight,
  ChevronDown,
  Folder,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Sparkles,
  UploadCloud
} from 'lucide-react';
import CategoryMultiSelect from './CategoryMultiSelect';
import MetadataDynamicForm, { validateMetadata } from './MetadataDynamicForm';
import StandardsPicker from './StandardsPicker';
import { toast } from '@/hooks/use-toast';

// Icon mapping for categories
const CATEGORY_ICONS = {
  bench_test: FileCheck,
  biocompatibility: Heart,
  predicate_labeling: FileText,
  electrical_safety: Zap,
  software_validation: Code,
  sterilization: Shield,
  shelf_life: Clock,
  packaging: Package,
  human_factors: Users,
  clinical_data: Activity,
  manufacturing: Factory,
  risk_analysis: AlertTriangle
};

export default function DeviceDataCenter() {
  const [files, setFiles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [standards, setStandards] = useState([]);
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStandard, setSelectedStandard] = useState('');
  const [selectedComponent, setSelectedComponent] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [stats, setStats] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // grid or list
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showEditTagsDialog, setShowEditTagsDialog] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const [aiSuggestedTags, setAiSuggestedTags] = useState([]);
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  
  // Edit Tags Dialog - Tab-based state
  const [activeTab, setActiveTab] = useState('tags'); // tags, metadata, standards, preview
  const [selectedCategories, setSelectedCategories] = useState([]); // Array of category codes
  const [selectedComponents, setSelectedComponents] = useState([]);
  const [selectedStandardRef, setSelectedStandardRef] = useState(null); // StandardRef object
  const [selectedStandards, setSelectedStandards] = useState([]); // Array for old standards dropdown (legacy)
  const [expandedComponents, setExpandedComponents] = useState(new Set());
  const [searchComponentQuery, setSearchComponentQuery] = useState('');
  const [metadataFields, setMetadataFields] = useState({});

  // Organization ID from headers
  const organizationId = 7;

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  // Load files when filters change
  useEffect(() => {
    loadFiles();
  }, [selectedCategory, selectedStandard, selectedComponent, searchQuery]);

  const loadData = async () => {
    try {
      setLoading(true);
      const headers = { 'X-Organization-Id': organizationId };
      
      // Load all reference data in parallel
      const [categoriesRes, standardsRes, componentsRes, statsRes] = await Promise.all([
        fetch('/api/device-data-center/categories', { headers }),
        fetch('/api/device-data-center/standards', { headers }),
        fetch('/api/device-data-center/components', { headers }),
        fetch('/api/device-data-center/stats', { headers })
      ]);

      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data.categories || []);
      }
      
      if (standardsRes.ok) {
        const data = await standardsRes.json();
        setStandards(data.standards || []);
      }
      
      if (componentsRes.ok) {
        const data = await componentsRes.json();
        setComponents(data.components || []);
      }
      
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }
      
      await loadFiles();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== 'all') params.append('category', selectedCategory);
      if (selectedStandard && selectedStandard !== 'all') params.append('testStandard', selectedStandard);
      if (selectedComponent && selectedComponent !== 'all') params.append('component', selectedComponent);
      if (searchQuery) params.append('search', searchQuery);
      
      const response = await fetch(`/api/device-data-center/files?${params}`, {
        headers: { 'X-Organization-Id': organizationId }
      });
      
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
      }
    } catch (error) {
      console.error('Error loading files:', error);
    }
  };

  const handleFileUpload = async (files) => {
    const fileList = Array.isArray(files) ? files : Array.from(files);
    
    for (const file of fileList) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', selectedCategory || 'bench_test');
      formData.append('deviceName', 'Device'); // Would come from device profile
      formData.append('tags', JSON.stringify(['new', '510k']));

      try {
        const response = await fetch('/api/device-data-center/upload', {
          method: 'POST',
          headers: { 'X-Organization-Id': organizationId },
          body: formData
        });

        if (response.ok) {
          const result = await response.json();
          
          // Call AI tagging service to suggest tags
          if (result.fileId) {
            await generateAITags(result.fileId, file.name);
          }
        }
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    }
    
    await loadFiles();
    await loadData(); // Refresh stats
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };
  
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const generateAITags = async (fileId, fileName) => {
    try {
      setIsGeneratingTags(true);
      
      const response = await fetch('/api/ai/tag-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Id': organizationId
        },
        body: JSON.stringify({
          fileId,
          fileName,
          category: selectedCategory
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setAiSuggestedTags(data.suggestedTags || []);
        
        // Do NOT auto-apply tags - let user choose from suggestions in Edit Tags dialog
      }
    } catch (error) {
      console.error('Error generating AI tags:', error);
    } finally {
      setIsGeneratingTags(false);
    }
  };
  
  const updateFileTags = async (fileId, tags) => {
    try {
      await fetch(`/api/device-data-center/files/${fileId}/tags`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Id': organizationId
        },
        body: JSON.stringify({ tags })
      });
      
      await loadFiles();
    } catch (error) {
      console.error('Error updating tags:', error);
    }
  };

  const saveCompleteTagData = async (fileId, data) => {
    try {
      const response = await fetch(`/api/device-data-center/files/${fileId}/complete-tags`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Id': organizationId
        },
        body: JSON.stringify({
          categories: data.categories,
          components: data.components,
          standard_ref: data.standard_ref,
          metadata: data.metadata,
          tags: data.tags
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save tag data');
      }
      
      await loadFiles();
      return true;
    } catch (error) {
      console.error('Error saving complete tag data:', error);
      toast({ title: 'Failed to save changes. Please try again.' });
      return false;
    }
  };
  
  // Category-specific metadata field templates
  const getMetadataTemplate = (categoryCode) => {
    const templates = {
      'bio_cytotoxicity': {
        test_lab: { type: 'text', label: 'Test Lab', required: true },
        test_date: { type: 'date', label: 'Test Date', required: true },
        sample_id: { type: 'text', label: 'Sample ID', required: true },
        contact_type: { type: 'select', label: 'Contact Type', required: true, options: ['Surface', 'Implant'] },
        contact_duration: { type: 'select', label: 'Contact Duration', required: true, options: ['Limited (<24h)', 'Prolonged (24h-30d)', 'Permanent (>30d)'] },
        result: { type: 'select', label: 'Result', required: true, options: ['Pass', 'Fail', 'Not run'] },
        acceptance_criteria_ref: { type: 'text', label: 'Acceptance Criteria Ref', required: true },
        lot_batch: { type: 'text', label: 'Lot/Batch', required: false },
        deviations: { type: 'textarea', label: 'Deviations', required: false }
      },
      'emc': {
        edition_year: { type: 'number', label: 'Edition Year', required: true },
        clause: { type: 'text', label: 'Clause', required: true },
        environment: { type: 'select', label: 'Environment', required: true, options: ['Home', 'Professional'] },
        immunity_result: { type: 'select', label: 'Immunity Result', required: true, options: ['Pass', 'Fail'] },
        emissions_result: { type: 'select', label: 'Emissions Result', required: true, options: ['Pass', 'Fail'] },
        margin_db: { type: 'number', label: 'Margin (dB)', required: false },
        test_config: { type: 'text', label: 'Test Configuration', required: false }
      },
      'electrical_safety': {
        clause: { type: 'text', label: 'Clause', required: true },
        mopp_moop_level: { type: 'select', label: 'MOPP/MOOP Level', required: true, options: ['1xMOPP', '2xMOPP', '1xMOOP', '2xMOOP'] },
        leakage_current: { type: 'number', label: 'Leakage Current (μA)', required: true },
        dielectric_strength_result: { type: 'select', label: 'Dielectric Strength', required: true, options: ['Pass', 'Fail'] },
        protective_earth_check: { type: 'select', label: 'Protective Earth', required: false, options: ['Pass', 'Fail', 'N/A'] }
      },
      'software': {
        software_class: { type: 'select', label: 'Software Class', required: true, options: ['Class A', 'Class B', 'Class C'] },
        sdlc_artifacts: { type: 'multiselect', label: 'SDLC Artifacts', required: true, options: ['SRS', 'SDD', 'STP', 'SVVP', 'Trace Matrix'] },
        result: { type: 'select', label: 'Result', required: true, options: ['Pass', 'Fail', 'Not run'] },
        soup_list: { type: 'textarea', label: 'SOUP List', required: false },
        defect_metrics: { type: 'text', label: 'Defect Metrics', required: false }
      },
      'ster_eo': {
        method: { type: 'select', label: 'Method', required: true, options: ['EO', 'Radiation', 'Moist Heat'] },
        sal: { type: 'text', label: 'SAL (e.g., 10^-6)', required: true },
        cycles: { type: 'number', label: 'Cycles', required: true },
        residuals_check: { type: 'select', label: 'Residuals Check (EO)', required: true, options: ['Pass', 'Fail'] },
        result: { type: 'select', label: 'Result', required: true, options: ['Pass', 'Fail'] },
        load_config: { type: 'text', label: 'Load Configuration', required: false }
      }
    };
    return templates[categoryCode] || {};
  };

  // Validate metadata fields against template requirements
  const validateMetadata = (templateFieldsArray, values) => {
    const errors = {};
    
    // templateFieldsArray is actually the entries of the template object
    // Each entry is [fieldKey, fieldConfig] where fieldConfig has { type, label, required, options }
    const template = templateFieldsArray.length > 0 ? Object.fromEntries(templateFieldsArray) : {};
    
    Object.entries(template).forEach(([fieldKey, fieldConfig]) => {
      if (fieldConfig.required) {
        const value = values[fieldKey];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          errors[fieldConfig.label] = 'This field is required';
        }
      }
    });
    
    return errors;
  };

  const openEditTagsDialog = async (file) => {
    setEditingFile(file);
    setShowEditTagsDialog(true);
    setActiveTab('tags');
    // Support both old single category and new array format
    setSelectedCategories(file.categories ? file.categories : (file.category ? [file.category] : []));
    setSelectedComponents(file.device_components || []);
    // Initialize standard ref from file data if available
    setSelectedStandardRef(file.standard_ref || null);
    setMetadataFields(file.metadata || {
      report_id: file.report_id || '',
      version: file.version || '',
      author_owner: file.author_owner || '',
      test_lab_name: file.test_lab_name || '',
      test_date: file.test_date || '',
      result: file.result || '',
      lot_batch: file.lot_batch || '',
      sample_id: file.sample_id || ''
    });
    setAiSuggestedTags([]);
    
    // Generate AI suggestions for this file
    await generateAITags(file.id, file.file_name);
  };

  const handleDeepSearch = async () => {
    if (!searchQuery) return;

    try {
      const response = await fetch(
        `/api/device-data-center/search/deep?query=${encodeURIComponent(searchQuery)}`,
        { headers: { 'X-Organization-Id': organizationId } }
      );
      
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
      }
    } catch (error) {
      console.error('Error in deep search:', error);
    }
  };

  const getCategoryIcon = (categoryCode) => {
    const IconComponent = CATEGORY_ICONS[categoryCode] || FileText;
    return <IconComponent className="h-4 w-4" />;
  };

  const getCategoryColor = (category) => {
    const cat = categories.find(c => c.category_code === category);
    return cat?.color || '#6B7280';
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-r from-blue-50 to-blue-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Files</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-700">
              {stats?.total_files || 0}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-r from-green-50 to-green-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Unique Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">
              {stats?.unique_devices || 0}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-r from-amber-50 to-amber-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Under Review</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-700">
              {stats?.under_review || 0}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-r from-purple-50 to-purple-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-700">
              {stats?.approved_files || 0}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-r from-red-50 to-red-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-700">
              {stats?.draft_files || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Drag and Drop Upload Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400 bg-white'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <UploadCloud className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <h3 className="text-lg font-semibold mb-2">
          {isDragging ? 'Drop files here' : 'Upload 510(k) Files'}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Drag and drop files or click to browse
        </p>
        <div className="flex gap-2 justify-center">
          <Button onClick={() => document.getElementById('file-upload').click()}>
            <Upload className="mr-2 h-4 w-4" />
            Browse Files
          </Button>
          <input
            id="file-upload"
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
            accept=".pdf,.docx,.xlsx,.doc,.xls"
          />
        </div>
        {isGeneratingTags && (
          <div className="mt-4 flex items-center justify-center gap-2 text-blue-600">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Analyzing files with AI...</span>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Device Data Room</CardTitle>
              <CardDescription>
                Comprehensive 510(k) submission file management with AI-powered tagging
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                Grid View
              </Button>
              <Button 
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                List View
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Deep search across all files, tags, and metadata..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDeepSearch()}
              />
            </div>
            <Button onClick={handleDeepSearch} variant="outline">
              <Search className="mr-2 h-4 w-4" />
              Deep Search
            </Button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger data-testid="select-category">
                <SelectValue placeholder="Filter by Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.category_code}>
                    <div 
                      className="flex items-center gap-2" 
                      style={{ paddingLeft: `${(cat.level || 0) * 12}px` }}
                    >
                      {cat.level === 0 && getCategoryIcon(cat.category_code)}
                      {cat.level > 0 && <ChevronRight className="h-3 w-3 text-gray-400" />}
                      <span className={cat.level === 0 ? 'font-semibold' : 'text-sm'}>
                        {cat.category_name}
                      </span>
                      {cat.required_for_510k && (
                        <Badge variant="secondary" className="text-xs">Required</Badge>
                      )}
                      {cat.synonyms && cat.synonyms.length > 0 && (
                        <span className="text-xs text-gray-400">
                          ({cat.synonyms.slice(0, 2).join(', ')})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStandard} onValueChange={setSelectedStandard}>
              <SelectTrigger data-testid="select-standard">
                <SelectValue placeholder="Filter by Test Standard" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Standards</SelectItem>
                {standards.map(std => (
                  <SelectItem key={std.id} value={std.standard_code}>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{std.standard_code}</span>
                        {std.edition_year && (
                          <Badge variant="outline" className="text-xs">{std.edition_year}</Badge>
                        )}
                        {std.family && (
                          <span className="text-xs text-gray-400">{std.family}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 line-clamp-1">{std.standard_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedComponent} onValueChange={setSelectedComponent}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Component" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Components</SelectItem>
                {components.map(comp => (
                  <SelectItem key={comp.id} value={comp.component_code}>
                    <div className="flex flex-col">
                      <span className="font-medium">{comp.component_name}</span>
                      <span className="text-xs text-gray-500">{comp.component_type}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Active Filters */}
          {((selectedCategory && selectedCategory !== 'all') || 
            (selectedStandard && selectedStandard !== 'all') || 
            (selectedComponent && selectedComponent !== 'all')) && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500">Active filters:</span>
              {selectedCategory && selectedCategory !== 'all' && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {categories.find(c => c.category_code === selectedCategory)?.category_name}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => setSelectedCategory('all')}
                  />
                </Badge>
              )}
              {selectedStandard && selectedStandard !== 'all' && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {selectedStandard}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => setSelectedStandard('all')}
                  />
                </Badge>
              )}
              {selectedComponent && selectedComponent !== 'all' && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {components.find(c => c.component_code === selectedComponent)?.component_name}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => setSelectedComponent('all')}
                  />
                </Badge>
              )}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setSelectedCategory('all');
                  setSelectedStandard('all');
                  setSelectedComponent('all');
                  setSelectedTags([]);
                }}
              >
                Clear All
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Files Display */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-500">Loading device files...</p>
          </CardContent>
        </Card>
      ) : files.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Folder className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium mb-2">No files found</h3>
            <p className="text-gray-500">
              Upload your first 510(k) submission file or adjust your filters
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map(file => (
            <Card 
              key={file.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedFile(file)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div 
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: getCategoryColor(file.category) + '20' }}
                  >
                    {getCategoryIcon(file.category)}
                  </div>
                  <Badge 
                    variant={
                      file.regulatory_status === 'approved' ? 'success' :
                      file.regulatory_status === 'under_review' ? 'warning' :
                      'secondary'
                    }
                  >
                    {file.regulatory_status || 'draft'}
                  </Badge>
                </div>
                <CardTitle className="text-base mt-2">{file.file_name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Multi-category badges */}
                {file.categories && file.categories.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {file.categories.slice(0, 3).map((cat, idx) => {
                      const categoryInfo = categories.find(c => c.category_code === cat);
                      return (
                        <Badge 
                          key={idx} 
                          variant="outline" 
                          className="text-xs"
                          style={{ 
                            borderColor: categoryInfo?.color || '#6B7280',
                            color: categoryInfo?.color || '#6B7280'
                          }}
                        >
                          {categoryInfo?.category_name || cat}
                        </Badge>
                      );
                    })}
                    {file.categories.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{file.categories.length - 3}
                      </Badge>
                    )}
                  </div>
                ) : file.category ? (
                  <div className="flex items-center text-sm text-gray-600">
                    <FileText className="h-3 w-3 mr-1" />
                    {file.category}
                  </div>
                ) : null}
                {file.device_name && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Activity className="h-3 w-3 mr-1" />
                    {file.device_name}
                  </div>
                )}
                {file.test_standards && file.test_standards.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {file.test_standards.slice(0, 2).map((std, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {std}
                      </Badge>
                    ))}
                    {file.test_standards.length > 2 && (
                      <Badge variant="outline" className="text-xs">
                        +{file.test_standards.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
                {file.tags && file.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {file.tags.map((tag, idx) => (
                      <Badge key={idx} className="text-xs">
                        <Tags className="h-2 w-2 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex justify-between items-center mt-3 pt-3 border-t">
                  <span className="text-xs text-gray-500">
                    {new Date(file.created_at).toLocaleDateString()}
                  </span>
                  <div className="flex gap-1">
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditTagsDialog(file);
                      }}
                      title="Edit Tags"
                      data-testid={`button-edit-tags-${file.id}`}
                    >
                      <Tags className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Preview">
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Download">
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="p-4 font-medium text-sm">File Name</th>
                  <th className="p-4 font-medium text-sm">Category</th>
                  <th className="p-4 font-medium text-sm">Device</th>
                  <th className="p-4 font-medium text-sm">Standards</th>
                  <th className="p-4 font-medium text-sm">Status</th>
                  <th className="p-4 font-medium text-sm">Date</th>
                  <th className="p-4 font-medium text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map(file => (
                  <tr key={file.id} className="border-b hover:bg-gray-50">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(file.category)}
                        <span className="font-medium">{file.file_name}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {/* Support both new multi-category and old single category */}
                      {file.categories && file.categories.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {file.categories.slice(0, 3).map((cat, idx) => {
                            const categoryInfo = categories.find(c => c.category_code === cat);
                            return (
                              <Badge 
                                key={idx} 
                                variant="outline" 
                                className="text-xs"
                                style={{ 
                                  borderColor: categoryInfo?.color || '#6B7280',
                                  color: categoryInfo?.color || '#6B7280'
                                }}
                              >
                                {categoryInfo?.category_name || cat}
                              </Badge>
                            );
                          })}
                          {file.categories.length > 3 && (
                            <span className="text-xs text-gray-500">
                              +{file.categories.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline">{file.category}</Badge>
                      )}
                    </td>
                    <td className="p-4 text-sm">{file.device_name || '-'}</td>
                    <td className="p-4">
                      {file.test_standards && file.test_standards.length > 0 ? (
                        <div className="flex gap-1">
                          {file.test_standards.slice(0, 2).map((std, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {std}
                            </Badge>
                          ))}
                          {file.test_standards.length > 2 && (
                            <span className="text-xs text-gray-500">
                              +{file.test_standards.length - 2}
                            </span>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="p-4">
                      <Badge 
                        variant={
                          file.regulatory_status === 'approved' ? 'success' :
                          file.regulatory_status === 'under_review' ? 'warning' :
                          'secondary'
                        }
                      >
                        {file.regulatory_status || 'draft'}
                      </Badge>
                    </td>
                    <td className="p-4 text-sm text-gray-500">
                      {new Date(file.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => openEditTagsDialog(file)}
                          title="Edit Tags"
                          data-testid={`button-edit-tags-${file.id}`}
                        >
                          <Tags className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Preview">
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Download">
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      
      {/* Edit Tags Dialog - Comprehensive Tab-Based UI */}
      {showEditTagsDialog && editingFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" data-testid="dialog-edit-tags">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] flex flex-col relative z-[10000]">
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">{editingFile.file_name}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowEditTagsDialog(false)} data-testid="button-close-dialog">
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Tab Navigation */}
            <div className="border-b px-4">
              <div className="flex gap-4">
                {['tags', 'metadata', 'standards', 'preview'].map(tab => (
                  <button
                    key={tab}
                    data-testid={`tab-${tab}`}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                      activeTab === tab 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* TAGS TAB */}
              {activeTab === 'tags' && (
                <div className="space-y-6">
                  {/* Hierarchical Category Multi-Select */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Categories (Multi-select with hierarchy)</Label>
                    <CategoryMultiSelect
                      tree={categories.filter(c => !c.parent_id).map(topCat => ({
                        id: topCat.category_code,
                        name: topCat.category_name,
                        aliases: topCat.synonyms || [],
                        children: categories.filter(c => c.parent_id === topCat.id).map(child => ({
                          id: child.category_code,
                          name: child.category_name,
                          aliases: child.synonyms || []
                        }))
                      }))}
                      value={selectedCategories}
                      onChange={setSelectedCategories}
                      allowPartial={true}
                      searchable={true}
                    />
                  </div>
                  
                  {/* Hierarchical Component Tree Selector */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Components (Hierarchical Tree)</Label>
                    <div className="border rounded-lg p-4 bg-gray-50 max-h-[300px] overflow-y-auto">
                      <Input
                        placeholder="Search components..."
                        value={searchComponentQuery}
                        onChange={(e) => setSearchComponentQuery(e.target.value)}
                        className="mb-3"
                        data-testid="input-search-components"
                      />
                      <div className="space-y-1">
                        {components
                          .filter(c => !c.parent_id && (!searchComponentQuery || 
                            c.component_name.toLowerCase().includes(searchComponentQuery.toLowerCase())))
                          .map(topLevel => (
                            <div key={topLevel.id}>
                              {/* Top-level component */}
                              <div className="flex items-center gap-2 p-2 hover:bg-white rounded cursor-pointer" data-testid={`component-${topLevel.component_code}`}>
                                <button
                                  onClick={() => {
                                    const newExpanded = new Set(expandedComponents);
                                    if (newExpanded.has(topLevel.id)) {
                                      newExpanded.delete(topLevel.id);
                                    } else {
                                      newExpanded.add(topLevel.id);
                                    }
                                    setExpandedComponents(newExpanded);
                                  }}
                                  className="p-1"
                                  data-testid={`button-toggle-${topLevel.component_code}`}
                                >
                                  {expandedComponents.has(topLevel.id) ? 
                                    <ChevronDown className="h-4 w-4" /> : 
                                    <ChevronRight className="h-4 w-4" />
                                  }
                                </button>
                                <input
                                  type="checkbox"
                                  checked={selectedComponents.includes(topLevel.component_code)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedComponents([...selectedComponents, topLevel.component_code]);
                                    } else {
                                      setSelectedComponents(selectedComponents.filter(c => c !== topLevel.component_code));
                                    }
                                  }}
                                  data-testid={`checkbox-${topLevel.component_code}`}
                                />
                                <span className="font-medium">{topLevel.component_name}</span>
                                {topLevel.bom_ref && <span className="text-xs text-gray-400">· {topLevel.bom_ref}</span>}
                              </div>
                              
                              {/* Child components */}
                              {expandedComponents.has(topLevel.id) && components
                                .filter(c => c.parent_id === topLevel.id)
                                .map(child => (
                                  <div key={child.id} className="flex items-center gap-2 p-2 hover:bg-white rounded cursor-pointer ml-8" data-testid={`component-${child.component_code}`}>
                                    <div className="w-5" />
                                    <input
                                      type="checkbox"
                                      checked={selectedComponents.includes(child.component_code)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedComponents([...selectedComponents, child.component_code]);
                                        } else {
                                          setSelectedComponents(selectedComponents.filter(c => c !== child.component_code));
                                        }
                                      }}
                                      data-testid={`checkbox-${child.component_code}`}
                                    />
                                    <span>{child.component_name}</span>
                                    {child.bom_ref && <span className="text-xs text-gray-400">· {child.bom_ref}</span>}
                                  </div>
                                ))}
                            </div>
                          ))}
                      </div>
                      {selectedComponents.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-xs text-gray-500 mb-2">Selected ({selectedComponents.length}):</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedComponents.map(code => (
                              <Badge key={code} variant="secondary" className="text-xs">
                                {components.find(c => c.component_code === code)?.component_name || code}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Standards Selector */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Test Standards (Normalized)</Label>
                    <Select
                      value={selectedStandards[0] || ''}
                      onValueChange={(val) => setSelectedStandards(val ? [val] : [])}
                    >
                      <SelectTrigger data-testid="select-standard-tags">
                        <SelectValue placeholder="Select standard..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {standards.map((std) => (
                          <SelectItem key={std.standard_code} value={std.standard_code} data-testid={`standard-option-${std.standard_code}`}>
                            <div className="flex items-center gap-2">
                              <span>{std.standard_name}</span>
                              {std.edition_year && (
                                <Badge variant="outline" className="text-xs">{std.edition_year}</Badge>
                              )}
                              {std.family && (
                                <Badge variant="secondary" className="text-xs">{std.family}</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              
              {/* METADATA TAB - Dynamic Forms */}
              {activeTab === 'metadata' && (
                <MetadataDynamicForm
                  categories={selectedCategories}
                  standard={selectedStandardRef}
                  value={metadataFields}
                  onChange={setMetadataFields}
                />
              )}
              
              {/* STANDARDS TAB - Structured Inputs */}
              {activeTab === 'standards' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500 mb-4">
                    Structured standard reference with family, code, edition year, clause, and region
                  </p>
                  <StandardsPicker
                    value={selectedStandardRef}
                    onChange={setSelectedStandardRef}
                    suggestions={standards.map(std => ({
                      family: std.family || 'ISO',
                      code: std.standard_code,
                      edition_year: std.edition_year?.toString(),
                      clause: std.clause,
                      region: std.region || 'Global'
                    }))}
                  />
                </div>
              )}
              
              {/* PREVIEW TAB */}
              {activeTab === 'preview' && (
                <div className="space-y-4">
                  <h3 className="font-semibold">Computed Citation Payload</h3>
                  <div className="bg-gray-50 border rounded-lg p-4 font-mono text-xs overflow-auto max-h-[400px]">
                    <pre>{JSON.stringify({
                      file_id: editingFile.id,
                      file_name: editingFile.file_name,
                      categories: selectedCategories,
                      components: selectedComponents,
                      standard_ref: selectedStandardRef,
                      metadata: metadataFields,
                      tags: editingFile.tags
                    }, null, 2)}</pre>
                  </div>
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">QC Readiness</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className={`h-4 w-4 ${selectedCategories.length > 0 ? 'text-green-600' : 'text-gray-300'}`} />
                        <span className="text-sm">Categories selected ({selectedCategories.length})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className={`h-4 w-4 ${selectedStandardRef?.code ? 'text-green-600' : 'text-gray-300'}`} />
                        <span className="text-sm">Standard reference defined</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className={`h-4 w-4 ${Object.keys(metadataFields).filter(k => metadataFields[k]).length > 0 ? 'text-green-600' : 'text-gray-300'}`} />
                        <span className="text-sm">Metadata fields populated</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer Actions */}
            <div className="border-t p-4 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={async () => {
                  setIsGeneratingTags(true);
                  await generateAITags(editingFile.id, editingFile.file_name);
                  setIsGeneratingTags(false);
                }}
                disabled={isGeneratingTags}
                data-testid="button-regenerate-ai"
              >
                {isGeneratingTags ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI Assist
                  </>
                )}
              </Button>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowEditTagsDialog(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button 
                  onClick={async () => {
                    // Validate at least one category is selected
                    if (selectedCategories.length === 0) {
                      toast({ title: 'Please select at least one category before saving.' });
                      setActiveTab('tags');
                      return;
                    }

                    // Validate required metadata fields if template exists
                    const template = getMetadataTemplate(selectedCategories[0]);
                    if (Object.keys(template).length > 0) {
                      const errors = validateMetadata(Object.values(template), metadataFields);
                      if (Object.keys(errors).length > 0) {
                        const errorList = Object.entries(errors).map(([k, v]) => `• ${k}: ${v}`).join('\n');
                        toast({ title: `Please fix these required fields:\n\n${errorList}` });
                        setActiveTab('metadata');
                        return;
                      }
                    }

                    // Save complete data structure
                    const success = await saveCompleteTagData(editingFile.id, {
                      categories: selectedCategories,
                      components: selectedComponents,
                      standard_ref: selectedStandardRef,
                      metadata: metadataFields,
                      tags: editingFile.tags || []
                    });

                    if (success) {
                      setShowEditTagsDialog(false);
                    }
                  }} 
                  data-testid="button-save"
                  disabled={selectedCategories.length === 0}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Save All Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}