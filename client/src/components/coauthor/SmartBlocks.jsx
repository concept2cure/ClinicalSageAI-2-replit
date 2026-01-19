/**
 * Smart Blocks System
 * Auto-pulling facts from Data Room for regulatory documents
 * Supports MRSD tables, stability summaries, clinical endpoints, etc.
 */

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  Zap, Table, FileText, Activity, Beaker, Users, Shield, TrendingUp, Calendar, AlertCircle, CheckCircle, Info, Database, Plus, RefreshCw, Settings, Hash, BarChart, Heart, TestTube, Package, Microscope, ChevronRight, Clock, Target, Layers } from 'lucide-react'

// Smart Block Categories
const SMART_BLOCK_CATEGORIES = {
  clinical: {
    label: 'Clinical Data',
    icon: Heart,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  stability: {
    label: 'Stability Studies',
    icon: Beaker,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  safety: {
    label: 'Safety & Toxicology',
    icon: Shield,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  manufacturing: {
    label: 'Manufacturing',
    icon: Package,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  analytical: {
    label: 'Analytical Methods',
    icon: Microscope,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  regulatory: {
    label: 'Regulatory',
    icon: FileText,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
  },
};

// Pre-defined Smart Block Templates
const SMART_BLOCK_TEMPLATES = [
  // Clinical Smart Blocks
  {
    id: 'mrsd-table',
    category: 'clinical',
    title: 'MRSD Calculation Table',
    description: 'Auto-generates Maximum Recommended Starting Dose table from toxicology data',
    dataSource: 'toxicology_studies',
    format: 'table',
    fields: ['species', 'noael', 'body_weight', 'conversion_factor', 'hed', 'safety_factor', 'mrsd'],
    icon: Table,
  },
  {
    id: 'clinical-endpoints',
    category: 'clinical',
    title: 'Clinical Study Endpoints',
    description: 'Pulls primary and secondary endpoints from all clinical protocols',
    dataSource: 'clinical_protocols',
    format: 'structured_list',
    fields: ['study_id', 'primary_endpoints', 'secondary_endpoints', 'exploratory_endpoints'],
    icon: Target,
  },
  {
    id: 'adverse-events-summary',
    category: 'clinical',
    title: 'Adverse Events Summary',
    description: 'Aggregates AE data across all clinical studies',
    dataSource: 'safety_database',
    format: 'table',
    fields: ['event_term', 'frequency', 'severity', 'relationship', 'action_taken'],
    icon: AlertCircle,
  },
  {
    id: 'demographic-table',
    category: 'clinical',
    title: 'Patient Demographics Table',
    description: 'Compiles demographic data from all enrolled subjects',
    dataSource: 'clinical_database',
    format: 'table',
    fields: ['age_mean', 'age_range', 'gender', 'race', 'weight', 'height'],
    icon: Users,
  },

  // Stability Smart Blocks
  {
    id: 'stability-summary-6mo',
    category: 'stability',
    title: '6-Month Stability Summary',
    description: 'Auto-pulls all 6-month stability data points and trends',
    dataSource: 'stability_studies',
    format: 'summary_table',
    fields: ['test_parameter', 'initial', '1_month', '3_months', '6_months', 'trend', 'specification'],
    icon: Clock,
  },
  {
    id: 'stability-trending',
    category: 'stability',
    title: 'Stability Trending Analysis',
    description: 'Generates trending graphs and analysis for key stability indicators',
    dataSource: 'stability_database',
    format: 'chart_with_table',
    fields: ['parameter', 'time_points', 'values', 'regression_analysis', 'shelf_life_projection'],
    icon: TrendingUp,
  },
  {
    id: 'forced-degradation',
    category: 'stability',
    title: 'Forced Degradation Results',
    description: 'Summarizes stress testing and degradation pathways',
    dataSource: 'analytical_studies',
    format: 'structured_report',
    fields: ['stress_condition', 'degradation_percentage', 'degradants_identified', 'mass_balance'],
    icon: Beaker,
  },

  // Safety Smart Blocks
  {
    id: 'toxicology-summary',
    category: 'safety',
    title: 'Toxicology Study Summary',
    description: 'Comprehensive summary of all tox studies',
    dataSource: 'toxicology_reports',
    format: 'structured_list',
    fields: ['study_type', 'species', 'duration', 'noael', 'findings', 'conclusion'],
    icon: TestTube,
  },
  {
    id: 'genotoxicity-battery',
    category: 'safety',
    title: 'Genotoxicity Test Battery',
    description: 'Results from Ames, chromosomal aberration, and micronucleus tests',
    dataSource: 'genotox_studies',
    format: 'table',
    fields: ['test_name', 'system', 'metabolic_activation', 'result', 'conclusion'],
    icon: Microscope,
  },

  // Manufacturing Smart Blocks
  {
    id: 'batch-release-specs',
    category: 'manufacturing',
    title: 'Batch Release Specifications',
    description: 'Current release specifications and test methods',
    dataSource: 'quality_specifications',
    format: 'table',
    fields: ['test', 'specification', 'method', 'acceptance_criteria'],
    icon: CheckCircle,
  },
  {
    id: 'process-validation',
    category: 'manufacturing',
    title: 'Process Validation Summary',
    description: 'Summary of process validation batches and results',
    dataSource: 'validation_reports',
    format: 'structured_report',
    fields: ['batch_number', 'critical_parameters', 'results', 'conclusion'],
    icon: Settings,
  },
  {
    id: 'batch-genealogy',
    category: 'manufacturing',
    title: 'Batch Genealogy Table',
    description: 'Tracks batch history for clinical supplies',
    dataSource: 'batch_records',
    format: 'table',
    fields: ['batch_id', 'manufacture_date', 'usage', 'stability_status', 'expiry'],
    icon: Layers,
  },

  // Analytical Smart Blocks
  {
    id: 'method-validation-summary',
    category: 'analytical',
    title: 'Analytical Method Validation',
    description: 'Validation parameters for all analytical methods',
    dataSource: 'method_validation',
    format: 'table',
    fields: ['method_id', 'parameter', 'acceptance_criteria', 'result', 'conclusion'],
    icon: BarChart,
  },
  {
    id: 'impurity-profile',
    category: 'analytical',
    title: 'Impurity Profile Summary',
    description: 'Comprehensive impurity profile including identification',
    dataSource: 'analytical_data',
    format: 'table',
    fields: ['impurity_id', 'structure', 'source', 'level', 'qualification_threshold', 'toxicology_assessment'],
    icon: Microscope,
  },

  // Regulatory Smart Blocks
  {
    id: 'regulatory-commitments',
    category: 'regulatory',
    title: 'Regulatory Commitments Table',
    description: 'Active commitments from regulatory interactions',
    dataSource: 'regulatory_database',
    format: 'table',
    fields: ['commitment_id', 'description', 'due_date', 'status', 'owner'],
    icon: FileText,
  },
  {
    id: 'submission-history',
    category: 'regulatory',
    title: 'Submission History Timeline',
    description: 'Chronological history of all regulatory submissions',
    dataSource: 'submissions_log',
    format: 'timeline',
    fields: ['date', 'submission_type', 'agency', 'status', 'key_outcomes'],
    icon: Calendar,
  },
];

export default function SmartBlocks({ 
  onInsertBlock,
  documentId,
  isOpen = false,
  onClose 
}) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [blockConfig, setBlockConfig] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const organizationId = localStorage.getItem('currentOrganizationId');
  const projectId = localStorage.getItem('currentProjectId');

  // Filter templates based on category and search
  const filteredTemplates = SMART_BLOCK_TEMPLATES.filter(template => {
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Group templates by category
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {});

  // Generate smart block content
  const generateSmartBlockMutation = useMutation({
    mutationFn: async (blockTemplate) => {
      setIsProcessing(true);
      
      // Call backend to generate Smart Block content backed by Data Lineage
      return apiRequest('/api/smart-blocks/generate', {
        method: 'POST',
        data: {
          templateId: blockTemplate.id,
          dataSource: blockTemplate.dataSource,
          format: blockTemplate.format,
          fields: blockTemplate.fields,
          config: blockConfig,
          projectId,
          organizationId,
          documentId,
        },
      });
    },
    onSuccess: (data, blockTemplate) => {
      setIsProcessing(false);
      
      // Insert the generated content into the document
      if (onInsertBlock) {
        onInsertBlock({
          type: 'smart_block',
          templateId: blockTemplate.id,
          title: blockTemplate.title,
          content: data.content,
          metadata: {
            dataSource: blockTemplate.dataSource,
            timestamp: new Date().toISOString(),
            version: data.version,
            sourceDocuments: data.sourceDocuments,
          },
        });
      }

      toast({
        title: 'Smart Block Inserted',
        description: `${blockTemplate.title} has been added to your document`,
      });

      // Close dialog and reset
      setSelectedBlock(null);
      setBlockConfig({});
      if (onClose) onClose();
    },
    onError: (error) => {
      setIsProcessing(false);
      toast({
        title: 'Generation Failed',
        description: 'Could not generate the smart block. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleInsertBlock = (template) => {
    setSelectedBlock(template);
  };

  const handleConfirmInsert = () => {
    if (selectedBlock) {
      generateSmartBlockMutation.mutate(selectedBlock);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Smart Blocks Library
          </DialogTitle>
          <DialogDescription>
            Insert pre-configured content blocks that automatically pull the latest data from your Data Room
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Search and Filter */}
          <div className="flex gap-2">
            <Input
              placeholder="Search smart blocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(SMART_BLOCK_CATEGORIES).map(([key, category]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <category.icon className={`h-4 w-4 ${category.color}`} />
                      {category.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Templates Grid */}
          <ScrollArea className="h-[400px]">
            <div className="space-y-6">
              {Object.entries(groupedTemplates).map(([categoryKey, templates]) => {
                const category = SMART_BLOCK_CATEGORIES[categoryKey];
                const CategoryIcon = category.icon;
                
                return (
                  <div key={categoryKey}>
                    <div className="flex items-center gap-2 mb-3">
                      <CategoryIcon className={`h-4 w-4 ${category.color}`} />
                      <h3 className="font-medium text-sm">{category.label}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {templates.length}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      {templates.map(template => {
                        const TemplateIcon = template.icon;
                        
                        return (
                          <Card 
                            key={template.id}
                            className="cursor-pointer hover:border-blue-400 transition-colors"
                            onClick={() => handleInsertBlock(template)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div className={`p-2 rounded ${category.bgColor}`}>
                                  <TemplateIcon className={`h-4 w-4 ${category.color}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-medium mb-1">
                                    {template.title}
                                  </h4>
                                  <p className="text-xs text-gray-600 line-clamp-2">
                                    {template.description}
                                  </p>
                                  <div className="flex items-center gap-2 mt-2">
                                    <Badge variant="outline" className="text-xs">
                                      {template.format.replace('_', ' ')}
                                    </Badge>
                                    <span className="text-xs text-gray-400">
                                      {template.fields.length} fields
                                    </span>
                                  </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Status */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Database className="h-3 w-3" />
              <span>Connected to Data Room</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <RefreshCw className="h-3 w-3" />
              <span>Auto-updates enabled</span>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Confirmation Dialog */}
      {selectedBlock && (
        <Dialog open={!!selectedBlock} onOpenChange={() => setSelectedBlock(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Insert Smart Block</DialogTitle>
              <DialogDescription>
                This will pull the latest data from {selectedBlock.dataSource.replace('_', ' ')} and format it as a {selectedBlock.format.replace('_', ' ')}.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <selectedBlock.icon className="h-5 w-5 text-blue-600" />
                    <div>
                      <h4 className="font-medium">{selectedBlock.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {selectedBlock.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedBlock.fields.slice(0, 5).map(field => (
                          <Badge key={field} variant="outline" className="text-xs">
                            {field}
                          </Badge>
                        ))}
                        {selectedBlock.fields.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{selectedBlock.fields.length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="bg-blue-50 p-3 rounded-md">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">Auto-update enabled</p>
                    <p className="text-xs mt-1">
                      This block will automatically refresh when the source data changes
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button 
                variant="outline" 
                onClick={() => setSelectedBlock(null)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleConfirmInsert}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Insert Block
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
