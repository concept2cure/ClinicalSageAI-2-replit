import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, FolderOpen, Upload, CheckCircle } from 'lucide-react'
import { ctdTemplates } from '../data/ctd-templates';

const DocumentTemplatesSection = () => {
  const [selectedRegion, setSelectedRegion] = useState('All Regions');

  const filteredTemplates = ctdTemplates.filter(template => {
    if (selectedRegion === 'All Regions') return true;
    if (selectedRegion === 'US FDA') return template.region === 'FDA' || !template.region; // Default to show if no region specified
    return template.region === selectedRegion;
  });

  // Prioritize IND templates if they exist
  const displayTemplates = filteredTemplates.slice(0, 5);

  return (
    <Card className="border-green-200 shadow-sm hover:shadow-md transition-shadow duration-300">
      <CardHeader className="pb-2 bg-gradient-to-r from-green-50 to-white">
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center text-lg">
            <FileText className="h-5 w-5 mr-2 text-green-600" />
            Document Templates
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-700 border-blue-200 font-medium"
            >
              ICH Compliant
            </Badge>
            <Badge
              variant="outline"
              className="bg-green-100 text-green-700 border-green-200 font-medium"
            >
              Enterprise
            </Badge>
          </div>
        </div>
        <CardDescription>
          Start with pre-approved templates for regulatory documents
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <select 
            className="w-full p-2 border rounded-md"
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
          >
            <option>All Regions</option>
            <option value="FDA">US FDA</option>
            <option>EU EMA</option>
            <option>Health Canada</option>
            <option>PMDA</option>
          </select>

          <div className="flex space-x-2">
            <Button size="sm" className="bg-green-600 hover:bg-green-700">
              <FolderOpen className="h-4 w-4 mr-2" />
              Browse Templates
            </Button>
            <Button size="sm" variant="outline" className="border-slate-200">
              <Upload className="h-4 w-4 mr-2" />
              Upload Template
            </Button>
          </div>

          <div>
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium">Available Templates</h3>
              <Badge variant="outline" className="bg-slate-50">
                {filteredTemplates.length} results
              </Badge>
            </div>

            <div className="mt-4 space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {displayTemplates.map((template) => (
                <div key={template.id} className="border rounded-md p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between">
                    <div className="flex items-start">
                      <FileText className="h-5 w-5 mr-2 text-green-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium">{template.title}</h4>
                        <p className="text-xs text-slate-500">
                          Module {template.moduleSection} • {template.documentType || 'Regulatory'}
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-green-50 text-green-700">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Validated
                    </Badge>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant="outline" className="bg-slate-50">
                      {template.region || 'ICH'}
                    </Badge>
                    {template.version && (
                      <Badge variant="outline" className="bg-slate-50">
                        v{template.version}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 text-xs text-slate-600 line-clamp-2">
                    {template.description}
                  </div>
                  
                  {template.sections && template.sections.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-100">
                      <p className="text-xs font-medium text-slate-500 mb-1">Key Sections:</p>
                      <div className="flex flex-wrap gap-1">
                        {template.sections.slice(0, 3).map((section, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px] h-5">
                            {section.id}
                          </Badge>
                        ))}
                        {template.sections.length > 3 && (
                          <span className="text-[10px] text-slate-400 self-center">+{template.sections.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DocumentTemplatesSection;
