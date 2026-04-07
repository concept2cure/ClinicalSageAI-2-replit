import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Book } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function SubmissionBuilderTab({ processId }) {
  const [building, setBuilding] = useState(false);

  const buildSubmission = async format => {
    setBuilding(true);
    try {
      const response = await fetch(
        `/api/process/processes/${processId}/submission/build?fmt=${format}`,
        { method: 'POST' }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `submission_book_${Date.now()}.${format === 'pdf' ? 'pdf' : 'docx'}`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const error = await response.json().catch(() => ({ error: 'Failed to build submission' }));
        toast({ title: error.error || 'Failed to build submission' });
      }
    } catch (error) {
      console.error('Error building submission:', error);
      toast({ title: 'Failed to build submission' });
    } finally {
      setBuilding(false);
    }
  };

  const submissionSections = [
    {
      title: 'P.3 Manufacturing Process',
      description: 'Complete manufacturing process description with CPPs and control strategy',
      icon: '🏭',
    },
    {
      title: 'PPQ Summary',
      description: 'Process performance qualification results and acceptance criteria',
      icon: '✅',
    },
    {
      title: 'P.5 Mini (Methods Overview)',
      description: 'Analytical methods overview and validation status',
      icon: '🔬',
    },
  ];

  return (
    <div className="space-y-6">
      <Card data-testid="card-submission-builder">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Book className="h-5 w-5" />
            Single-Book Submission Builder
          </CardTitle>
          <p className="text-sm text-slate-600">
            Generate comprehensive submission documents combining P.3, PPQ, and methods overview
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={() => buildSubmission('pdf')}
              disabled={building}
              data-testid="button-build-pdf"
            >
              {building ? (
                'Building...'
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate PDF
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => buildSubmission('docx')}
              disabled={building}
              data-testid="button-build-docx"
            >
              {building ? (
                'Building...'
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generate DOCX
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-submission-contents">
        <CardHeader>
          <CardTitle>Submission Contents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {submissionSections.map((section, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                data-testid={`section-${i}`}
              >
                <div className="text-2xl">{section.icon}</div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{section.title}</div>
                  <div className="text-xs text-slate-600 mt-1">{section.description}</div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  Auto-included
                </Badge>
              </div>
            ))}
          </div>

          <div className="border-t mt-6 pt-4">
            <div className="text-sm font-medium mb-2">Requirements:</div>
            <div className="space-y-1 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  !
                </Badge>
                P.3 documents must be generated first using "Generate P.3 Docs"
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  !
                </Badge>
                PPQ data should be entered in the PPQ & CPV tab
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  !
                </Badge>
                Analytical methods should be defined for P.5 mini section
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-submission-features">
        <CardHeader>
          <CardTitle>Advanced Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-medium mb-2">PDF Features:</div>
              <ul className="space-y-1 text-slate-600">
                <li>• Professional formatting</li>
                <li>• Table of contents</li>
                <li>• Page breaks between sections</li>
                <li>• Print-ready layout</li>
              </ul>
            </div>
            <div>
              <div className="font-medium mb-2">DOCX Features:</div>
              <ul className="space-y-1 text-slate-600">
                <li>• Editable format</li>
                <li>• Compatible with Word</li>
                <li>• Easy customization</li>
                <li>• Collaborative editing</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
