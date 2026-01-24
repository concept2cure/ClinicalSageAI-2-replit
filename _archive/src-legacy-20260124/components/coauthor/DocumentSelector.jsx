// client/src/components/coauthor/DocumentSelector.jsx
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { FileText, BookOpen, ChevronRight, LayoutDashboard, FileCheck } from 'lucide-react';
import ModuleDashboard from './ModuleDashboard';

// Mock document templates
const recentDocuments = [
  { id: 'doc1', title: 'Enzymase 10mg Clinical Overview', module: '2.5', lastEdited: '2 hours ago' },
  { id: 'doc2', title: 'NAD-102 Stability Analysis', module: '2.3', lastEdited: '1 day ago' },
  { id: 'doc3', title: 'Cellbloc Safety Summary', module: '2.7', lastEdited: '3 days ago' },
];

const [templates, setTemplates] = useState([]);
const [loading, setLoading] = useState(true);
const [selectedCategory, setSelectedCategory] = useState('all');
const [categories, setCategories] = useState([]);

// Load templates from API
useEffect(() => {
  const loadTemplates = async () => {
    try {
      setLoading(true);
      
      // Load categories
      const categoriesResponse = await fetch('/api/templates/categories');
      const categoriesData = await categoriesResponse.json();
      if (categoriesData.success) {
        setCategories(['all', ...categoriesData.categories]);
      }
      
      // Load templates
      const templatesResponse = await fetch(
        selectedCategory === 'all' 
          ? '/api/templates' 
          : `/api/templates?category=${selectedCategory}`
      );
      const templatesData = await templatesResponse.json();
      
      if (templatesData.success) {
        setTemplates(templatesData.templates);
      } else {
        console.error('Failed to load templates:', templatesData.error);
        // Fallback templates
        setTemplates([
          { id: 'tpl1', name: 'Clinical Study Report Template', module: 'M5', description: 'ICH E3 compliant CSR template with guidance', category: 'clinical' },
          { id: 'tpl2', name: 'Quality Overall Summary Template', module: 'M2', description: 'Complete QOS template with examples', category: 'quality' },


  const handleTemplateSelect = async (template) => {
    try {
      // Load full template data
      const response = await fetch(`/api/templates/${template.id}`);
      const data = await response.json();
      
      if (data.success) {
        // Pass template to document editor
        onSelectDocument({
          type: 'template',
          template: data.template,
          moduleId: template.module
        });
      } else {
        console.error('Failed to load template:', data.error);
      }
    } catch (error) {
      console.error('Error loading template:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading templates...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Template Category Filter */}
      <div className="flex space-x-2 mb-4">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === category
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid gap-4">
        <h3 className="font-medium">Available Templates</h3>
        {templates.length > 0 ? (
          <div className="grid gap-4">
            {templates.map((template) => (
              <div key={template.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-medium">{template.name}</h4>
                    <p className="text-sm text-gray-600">
                      {template.module} • {template.category}
                      {template.region && ` • ${template.region}`}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {template.module}
                    </span>
                    {template.region && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {template.region}
                      </span>
                    )}
                  </div>
                </div>
                
                <p className="text-sm text-gray-700 mb-3">{template.description}</p>
                
                <div className="flex justify-between items-center">
                  <div className="flex space-x-2">
                    {template.metadata?.tags?.slice(0, 3).map((tag, index) => (
                      <span key={index} className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => handleTemplateSelect(template)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                  >
                    Use Template
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No templates found for the selected category.</p>
            <button 
              onClick={() => setSelectedCategory('all')}
              className="mt-2 text-blue-600 hover:text-blue-800"
            >
              View all templates
            </button>
          </div>
        )}
      </div>
    </div>
  );

          { id: 'tpl3', name: 'FDA CTD Module 2 Template', module: 'M2', description: 'FDA-specific template for Module 2 summaries', category: 'regulatory' },
        ]);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      // Fallback templates
      setTemplates([
        { id: 'tpl1', name: 'Clinical Study Report Template', module: 'M5', description: 'ICH E3 compliant CSR template with guidance', category: 'clinical' },
        { id: 'tpl2', name: 'Quality Overall Summary Template', module: 'M2', description: 'Complete QOS template with examples', category: 'quality' },
        { id: 'tpl3', name: 'FDA CTD Module 2 Template', module: 'M2', description: 'FDA-specific template for Module 2 summaries', category: 'regulatory' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  loadTemplates();
}, [selectedCategory]);

export default function DocumentSelector({ onSelectDocument }) {
  const [activeTab, setActiveTab] = useState('recent');

  const handleModuleSelect = (moduleTitle) => {
    // For now just open Module 2 editor
    if (moduleTitle.includes('2')) {
      onSelectDocument('module2');
    } else {
      // Could display a message that this module is not yet implemented
      console.log('Module selected:', moduleTitle);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">eCTD Co-Author™</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-blue-600" />
              <span>Module Dashboard</span>
            </CardTitle>
            <CardDescription>
              Overview of your submission modules and their completion status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ModuleDashboard onSelectModule={handleModuleSelect} />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-blue-600" />
              <span>Quick Actions</span>
            </CardTitle>
            <CardDescription>
              Common tasks and shortcuts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li>
                <Button 
                  variant="outline" 
                  className="w-full justify-between"
                  onClick={() => onSelectDocument('module2')}
                >
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span>Continue Module 2.7</span>
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </li>
              <li>
                <Button 
                  variant="outline" 
                  className="w-full justify-between"
                  onClick={() => setActiveTab('templates')}
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-blue-600" />
                    <span>New from Template</span>
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </li>
              <li>
                <Button 
                  variant="outline" 
                  className="w-full justify-between"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span>Import Document</span>
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader className="pb-3">
          <Tabs defaultValue="recent" value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="recent">Recent Documents</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab}>
            <TabsContent value="recent" className="m-0">
              <div className="space-y-4">
                {recentDocuments.map(doc => (
                  <div key={doc.id} className="border rounded p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-600" />
                          {doc.title}
                        </h3>
                        <p className="text-sm text-gray-500">Module {doc.module} • Last edited {doc.lastEdited}</p>
                      </div>
                      <Button 
                        size="sm" 
                        onClick={() => onSelectDocument('module2')}
                      >
                        Open
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="templates" className="m-0">
              <div className="space-y-4">
                {templates.map(tpl => (
                  <div key={tpl.id} className="border rounded p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-blue-600" />
                          {tpl.title}
                        </h3>
                        <p className="text-sm text-gray-500">Module {tpl.module}</p>
                        <p className="text-sm mt-1">{tpl.description}</p>
                      </div>
                      <Button 
                        size="sm" 
                        onClick={() => onSelectDocument('module2')}
                      >
                        Use Template
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}