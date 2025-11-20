import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  Info,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  FileText,
  Target,
} from 'lucide-react';

export interface ReportSection {
  title: string;
  content?: string;
  table?: Array<Record<string, string | number>>;
  bullets?: string[];
}

export interface StrategicReport {
  protocol_id: string;
  generated_on: string;
  sections: ReportSection[];
}

interface StrategicReportProps {
  report: StrategicReport;
  onExportPdf: () => void;
}

const StrategicReport: React.FC<StrategicReportProps> = ({ report, onExportPdf }) => {
  // Helper to format the date
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      return dateString;
    }
  };

  // Helper to get an icon based on section title
  const getSectionIcon = (title: string) => {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('benchmark')) return <TrendingUp className="h-5 w-5 text-blue-600" />;
    if (titleLower.includes('risk')) return <AlertCircle className="h-5 w-5 text-amber-600" />;
    if (titleLower.includes('regulatory')) return <FileText className="h-5 w-5 text-green-600" />;
    if (titleLower.includes('strategic')) return <Target className="h-5 w-5 text-purple-600" />;
    if (titleLower.includes('recommendation'))
      return <CheckCircle className="h-5 w-5 text-teal-600" />;
    return <Info className="h-5 w-5 text-slate-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Report header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Strategic Intelligence Report</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">
              Protocol ID: <span className="font-medium">{report.protocol_id}</span>
            </p>
            <span className="text-muted-foreground">•</span>
            <p className="text-muted-foreground">
              Generated: <span className="font-medium">{formatDate(report.generated_on)}</span>
            </p>
          </div>
        </div>

        <Button variant="outline" onClick={onExportPdf}>
          <Download className="mr-2 h-4 w-4" />
          Export PDF
        </Button>
      </div>

      {/* Report sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {report.sections.map((section, index) => (
          <Card key={index} className="overflow-hidden">
            <CardHeader className="bg-slate-50">
              <div className="flex items-center">
                {getSectionIcon(section.title)}
                <CardTitle className="ml-2">{section.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {/* Text content */}
              {section.content && <p className="text-slate-700 mb-4">{section.content}</p>}

              {/* Table content */}
              {section.table && section.table.length > 0 && (
                <div className="border rounded-md overflow-hidden mt-2">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-slate-50">
                      <tr>
                        {Object.keys(section.table[0]).map(key => (
                          <th
                            key={key}
                            className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                          >
                            {key.replace(/_/g, ' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {section.table.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {Object.entries(row).map(([key, value], cellIndex) => (
                            <td
                              key={`${rowIndex}-${cellIndex}`}
                              className="px-4 py-2 text-sm text-slate-700 font-medium"
                            >
                              {typeof value === 'string' && value.includes('%') ? (
                                <Badge variant={parseFloat(value) > 50 ? 'default' : 'secondary'}>
                                  {value}
                                </Badge>
                              ) : (
                                value
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Bullet points */}
              {section.bullets && section.bullets.length > 0 && (
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  {section.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex} className="text-slate-700">
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default StrategicReport;
