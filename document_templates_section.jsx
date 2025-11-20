import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, FolderOpen, Upload, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

export default function DocumentTemplatesSection() {
  const [expandedTemplates, setExpandedTemplates] = useState({});
  const [selectedRegion, setSelectedRegion] = useState('All Regions');

  const toggleTemplateExpansion = templateId => {
    setExpandedTemplates(prev => ({
      ...prev,
      [templateId]: !prev[templateId],
    }));
  };

  const templates = [
    {
      id: 'clinical-overview',
      title: 'FDA Clinical Overview Template',
      module: 'Module 2',
      updated: '2 weeks ago',
      regions: ['US FDA', 'EU EMA'],
      validated: true,
      sections: [
        { id: '2.5', title: '2.5', complete: true },
        { id: '2.5.6', title: '2.5.6', complete: true },
        { id: '2.7.3', title: '2.7.3', complete: true },
      ],
    },
    {
      id: 'module3',
      title: 'CTD Module Template',
      module: 'Module 3',
      updated: '3 weeks ago',
      regions: ['US FDA'],
      validated: true,
      sections: [{ id: '3.2.S.4.1', title: '3.2.S.4.1', complete: true }],
    },
  ];

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
              <CheckCircle className="h-3 w-3 mr-1" />
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
          <div className="flex flex-col space-y-4">
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Regions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Regions">All Regions</SelectItem>
                <SelectItem value="US FDA">US FDA</SelectItem>
                <SelectItem value="EU EMA">EU EMA</SelectItem>
                <SelectItem value="Health Canada">Health Canada</SelectItem>
                <SelectItem value="PMDA">PMDA</SelectItem>
              </SelectContent>
            </Select>

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
          </div>

          <div className="mt-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium">Featured Templates</h3>
              <Badge variant="outline" className="bg-slate-50">
                28 results
              </Badge>
            </div>

            <div className="space-y-4">
              {templates.map(template => (
                <div key={template.id} className="border rounded-md p-4">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center">
                      <FileText className="h-5 w-5 mr-2 text-green-600" />
                      <div>
                        <h4 className="font-medium">{template.title}</h4>
                        <p className="text-xs text-slate-500">
                          {template.module} • Updated {template.updated}
                        </p>
                      </div>
                    </div>
                    {template.validated && (
                      <Badge className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Validated
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2">
                    <div className="flex flex-wrap gap-1 mt-1">
                      {template.regions.map(region => (
                        <Badge
                          key={region}
                          variant="outline"
                          className="bg-slate-50 text-slate-700"
                        >
                          {region}
                        </Badge>
                      ))}
                    </div>

                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-slate-600">
                        <span>eCTD Structured Content Blocks:</span>
                        <span className="text-green-600 text-xs">ICH Guidelines Referenced</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {template.sections.map(section => (
                          <Badge
                            key={section.id}
                            className="bg-blue-50 text-blue-700 flex items-center"
                          >
                            <span className="mr-1">{section.title}</span>
                            {section.complete && <CheckCircle className="h-3 w-3" />}
                          </Badge>
                        ))}
                      </div>

                      {template.sections.length > 3 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-7 text-xs"
                          onClick={() => toggleTemplateExpansion(template.id)}
                        >
                          {expandedTemplates[template.id] ? (
                            <ChevronDown className="h-3 w-3 mr-1" />
                          ) : (
                            <ChevronRight className="h-3 w-3 mr-1" />
                          )}
                          Show {expandedTemplates[template.id] ? 'Less' : '5 Sections'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
