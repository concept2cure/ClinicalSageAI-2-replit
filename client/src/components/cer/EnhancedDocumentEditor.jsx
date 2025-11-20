
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, FileText, Download, Lock } from 'lucide-react';
import { useToast } from '@/components/ui/toaster';
import { getDocumentTypeConfig, getSectionScaffold } from '@/config/documentTypeConfig';

export default function EnhancedDocumentEditor({ 
  documentType = '510K', 
  projectId,
  onSave,
  readOnly = false 
}) {
  const { toast } = useToast();
  const [config, setConfig] = useState(null);
  const [sections, setSections] = useState({});
  const [activeSection, setActiveSection] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const docConfig = getDocumentTypeConfig(documentType);
    setConfig(docConfig);
    
    // Initialize sections from scaffold
    const scaffold = getSectionScaffold(documentType);
    const initialSections = {};
    scaffold.forEach(section => {
      initialSections[section.id] = {
        title: section.title,
        content: '',
        required: section.required,
        lastModified: null
      };
    });
    setSections(initialSections);
    
    if (scaffold.length > 0) {
      setActiveSection(scaffold[0].id);
    }
  }, [documentType]);

  const handleSectionChange = (sectionId, content) => {
    setSections(prev => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        content,
        lastModified: new Date().toISOString()
      }
    }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        projectId,
        documentType,
        sections,
        metadata: {
          agency: config.agency,
          savedAt: new Date().toISOString()
        }
      };

      if (onSave) {
        await onSave(payload);
      }

      toast({
        title: 'Document Saved',
        description: `${config.name} saved successfully`,
      });
      
      setIsDirty(false);
    } catch (error) {
      toast({
        title: 'Save Failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const validateDocument = () => {
    const validationRules = config?.validationRules || [];
    const errors = [];

    validationRules.forEach(rule => {
      const section = sections[rule.field];
      if (rule.rule === 'required' && (!section?.content || section.content.trim() === '')) {
        errors.push(rule.message);
      }
    });

    if (errors.length > 0) {
      toast({
        title: 'Validation Errors',
        description: errors.join(', '),
        variant: 'destructive'
      });
      return false;
    }

    return true;
  };

  if (!config) {
    return <div>Loading editor...</div>;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{config.name}</CardTitle>
          <div className="flex gap-2">
            {isDirty && (
              <Button onClick={handleSave} disabled={readOnly}>
                <Save className="w-4 h-4 mr-2" />
                Save Draft
              </Button>
            )}
            <Button variant="outline" onClick={validateDocument}>
              <FileText className="w-4 h-4 mr-2" />
              Validate
            </Button>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeSection} onValueChange={setActiveSection}>
          <TabsList className="grid grid-cols-4 lg:grid-cols-6">
            {getSectionScaffold(documentType).map(section => (
              <TabsTrigger key={section.id} value={section.id}>
                {section.title}
                {section.required && <span className="text-red-500 ml-1">*</span>}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {Object.entries(sections).map(([sectionId, section]) => (
            <TabsContent key={sectionId} value={sectionId}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{section.title}</h3>
                  {section.lastModified && (
                    <span className="text-sm text-gray-500">
                      Last edited: {new Date(section.lastModified).toLocaleString()}
                    </span>
                  )}
                </div>
                
                <Textarea
                  value={section.content}
                  onChange={(e) => handleSectionChange(sectionId, e.target.value)}
                  placeholder={`Enter ${section.title} content...`}
                  className="min-h-[400px] font-mono"
                  disabled={readOnly}
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
