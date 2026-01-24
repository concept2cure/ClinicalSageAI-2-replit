import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, FolderOpen, Upload, CheckCircle } from 'lucide-react';

const DocumentTemplatesSection = () => {
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
          <select className="w-full p-2 border rounded-md">
            <option>All Regions</option>
            <option>US FDA</option>
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
              <h3 className="text-sm font-medium">Featured Templates</h3>
              <Badge variant="outline" className="bg-slate-50">
                28 results
              </Badge>
            </div>

            <div className="mt-4 border rounded-md p-4">
              <div className="flex justify-between">
                <div className="flex items-start">
                  <FileText className="h-5 w-5 mr-2 text-green-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium">FDA Clinical Overview Template</h4>
                    <p className="text-xs text-slate-500">Module 2 • Updated 2 weeks ago</p>
                  </div>
                </div>
                <Badge className="bg-green-50 text-green-700">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Validated
                </Badge>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                <Badge variant="outline" className="bg-slate-50">
                  US FDA
                </Badge>
                <Badge variant="outline" className="bg-slate-50">
                  EU EMA
                </Badge>
              </div>

              <div className="mt-4">
                <div className="flex justify-between text-xs">
                  <span>eCTD Structured Content Blocks:</span>
                  <span className="text-green-600">ICH Guidelines Referenced</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge className="bg-blue-50 text-blue-700">
                    2.5 <CheckCircle className="h-3 w-3 ml-1" />
                  </Badge>
                  <Badge className="bg-blue-50 text-blue-700">
                    2.5.6 <CheckCircle className="h-3 w-3 ml-1" />
                  </Badge>
                  <Badge className="bg-blue-50 text-blue-700">
                    2.7.3 <CheckCircle className="h-3 w-3 ml-1" />
                  </Badge>
                </div>
                <Button size="sm" variant="ghost" className="mt-2 h-6 text-xs">
                  Show 5 Sections
                </Button>
              </div>
            </div>

            <div className="mt-4 border rounded-md p-4">
              <div className="flex justify-between">
                <div className="flex items-start">
                  <FileText className="h-5 w-5 mr-2 text-green-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium">CTD Module Template</h4>
                    <p className="text-xs text-slate-500">Module 3 • Updated 3 weeks ago</p>
                  </div>
                </div>
                <div className="flex space-x-1">
                  <Badge className="bg-blue-50 text-blue-700">ICH-Compliant</Badge>
                  <Badge className="bg-green-50 text-green-700">Online</Badge>
                </div>
              </div>

              <div className="mt-2">
                <Badge variant="outline" className="bg-slate-50">
                  US FDA
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DocumentTemplatesSection;
