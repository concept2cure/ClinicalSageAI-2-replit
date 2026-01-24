import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Mail, PieChart } from 'lucide-react';

export default function StudyDesignReport({ session }) {
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState(null);

  const generateReport = async () => {
    setGenerating(true);

    // In a real implementation, this would make an API call
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Sample report data
    const sampleReport = {
      title: session?.name || 'Study Design Report',
      generatedDate: new Date().toISOString().split('T')[0],
      sections: [
        'Executive Summary',
        'Study Objectives',
        'Study Design',
        'Study Population',
        'Treatment Groups',
        'Statistical Considerations',
        'Safety Assessments',
        'Ethical Considerations',
        'Appendices',
      ],
      totalPages: 28,
      fileSize: '3.2 MB',
      format: 'PDF',
    };

    setReport(sampleReport);
    setGenerating(false);
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Study Design Report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!report ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-6">
              Generate a comprehensive study design report based on your current plan. This document
              can be shared with stakeholders or used as a starting point for your protocol.
            </p>
            <Button onClick={generateReport} disabled={generating || !session} className="w-full">
              {generating ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-opacity-50 border-t-transparent rounded-full animate-spin mr-2"></div>
                  Generating Report...
                </>
              ) : (
                <>Generate Report</>
              )}
            </Button>

            {!session && (
              <p className="text-sm text-red-500 mt-2">
                Please select a session first to generate a report.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="font-semibold text-lg">{report.title}</h3>
              <p className="text-sm text-gray-500">Generated on {report.generatedDate}</p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500">Pages</p>
                  <p className="font-medium">{report.totalPages}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Size</p>
                  <p className="font-medium">{report.fileSize}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Format</p>
                  <p className="font-medium">{report.format}</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Report Contents</h4>
              <ul className="space-y-2">
                {report.sections.map((section, index) => (
                  <li key={index} className="flex items-center">
                    <div className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-medium mr-2">
                      {index + 1}
                    </div>
                    <span>{section}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              <Button variant="outline" className="flex-1">
                <Mail className="h-4 w-4 mr-2" />
                Email Report
              </Button>
              <Button variant="secondary" className="flex-1">
                <PieChart className="h-4 w-4 mr-2" />
                View Metrics
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
