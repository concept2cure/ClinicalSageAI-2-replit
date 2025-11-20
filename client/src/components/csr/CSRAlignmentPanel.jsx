import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function CSRAlignmentPanel() {
  const [selectedReports, setSelectedReports] = useState([]);
  const [alignmentResults, setAlignmentResults] = useState(null);

  // Sample data - in a real implementation, this would come from an API
  const availableReports = [
    {
      id: 'CSR-001',
      title: 'Phase 3 Study of LumenTrial-XR in Type 2 Diabetes',
      sponsor: 'Pfizer',
      date: '2023-10-15',
    },
    {
      id: 'CSR-002',
      title: 'Safety and Efficacy Study of TrialSage-IV in Rheumatoid Arthritis',
      sponsor: 'Novartis',
      date: '2023-09-22',
    },
    {
      id: 'CSR-003',
      title: 'Double-Blind Study of RegulatoryCTX for Major Depressive Disorder',
      sponsor: 'Roche',
      date: '2023-11-05',
    },
  ];

  const toggleReportSelection = reportId => {
    setSelectedReports(prev => {
      if (prev.includes(reportId)) {
        return prev.filter(id => id !== reportId);
      } else {
        return [...prev, reportId];
      }
    });
  };

  const runAlignment = async () => {
    if (selectedReports.length < 2) {
      alert('Please select at least 2 reports to compare');
      return;
    }

    // In a real implementation, this would call an API
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Sample alignment results
    setAlignmentResults({
      sections: [
        {
          name: 'Study Design',
          similarity: 85,
          notes: 'All studies used randomized, double-blind design',
        },
        {
          name: 'Primary Endpoints',
          similarity: 42,
          notes: 'Significant variation in endpoint selection and timing',
        },
        {
          name: 'Statistical Methods',
          similarity: 78,
          notes: 'Similar methods with minor variations in handling missing data',
        },
        {
          name: 'Adverse Events Reporting',
          similarity: 91,
          notes: 'Consistent approach to AE categorization and severity assessment',
        },
        {
          name: 'Inclusion/Exclusion Criteria',
          similarity: 65,
          notes: 'Moderate alignment with different age and comorbidity thresholds',
        },
      ],
    });
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>CSR Alignment & Comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="font-semibold mb-2">Select CSRs to Compare</h3>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Select</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Sponsor</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableReports.map(report => (
                  <TableRow
                    key={report.id}
                    className={selectedReports.includes(report.id) ? 'bg-blue-50' : ''}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedReports.includes(report.id)}
                        onChange={() => toggleReportSelection(report.id)}
                        className="h-4 w-4"
                      />
                    </TableCell>
                    <TableCell>{report.id}</TableCell>
                    <TableCell>{report.title}</TableCell>
                    <TableCell>{report.sponsor}</TableCell>
                    <TableCell>{new Date(report.date).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4">
            <Button onClick={runAlignment} disabled={selectedReports.length < 2}>
              Run Alignment Analysis
            </Button>
          </div>
        </div>

        {alignmentResults && (
          <div>
            <h3 className="font-semibold mb-2">Alignment Results</h3>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Similarity</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alignmentResults.sections.map((section, index) => (
                    <TableRow key={index}>
                      <TableCell>{section.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                              className={`h-2.5 rounded-full ${
                                section.similarity > 80
                                  ? 'bg-green-600'
                                  : section.similarity > 60
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                              }`}
                              style={{ width: `${section.similarity}%` }}
                            ></div>
                          </div>
                          <span className="ml-2">{section.similarity}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{section.notes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
