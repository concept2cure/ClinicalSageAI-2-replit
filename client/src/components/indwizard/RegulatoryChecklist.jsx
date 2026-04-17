import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Clipboard,
  Check,
  AlertTriangle,
  XCircle,
  Info,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import indWizardService from '@/services/indWizardService';

export default function RegulatoryChecklist({ submissionId }) {
  const [loading, setLoading] = useState(true);
  const [checklistData, setChecklistData] = useState(null);

  useEffect(() => {
    if (submissionId) {
      setLoading(true);

      indWizardService
        .getRegulatoryChecklist(submissionId)
        .then(data => {
          setChecklistData(data);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to load regulatory checklist:', error);
          setLoading(false);
        });
    }
  }, [submissionId]);

  const calculateProgress = () => {
    if (!checklistData) return 0;

    const completedItems = checklistData.items.filter(item => item.status === 'complete').length;
    return Math.round((completedItems / checklistData.items.length) * 100);
  };

  if (loading) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center">
            <Clipboard className="h-5 w-5 mr-2 text-blue-600" />
            Regulatory Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-12">
          <div className="flex flex-col items-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mb-3"></div>
            <p className="text-sm text-gray-500">Loading checklist...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!checklistData) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center">
            <Clipboard className="h-5 w-5 mr-2 text-blue-600" />
            Regulatory Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-12">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <p className="text-gray-600 mb-4">Could not load regulatory checklist data</p>
            <Button>Retry Loading</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progress = calculateProgress();
  const criticalIssues = checklistData.items.filter(
    item => item.priority === 'critical' && item.status !== 'complete'
  );

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          <div className="flex items-center">
            <Clipboard className="h-5 w-5 mr-2 text-blue-600" />
            <span>Regulatory Checklist</span>
          </div>
          <div className="text-sm font-normal text-gray-500 flex items-center">
            <span className="mr-2">FDA 21 CFR 312</span>
            <a href="https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 flex items-center">
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500 mb-1">Completion Status</div>
              <div className="font-semibold">{progress}% Complete</div>
            </div>
            <div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  criticalIssues.length === 0
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {criticalIssues.length === 0 ? (
                  <Check className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                )}
                {criticalIssues.length === 0
                  ? 'All critical items addressed'
                  : `${criticalIssues.length} critical ${criticalIssues.length === 1 ? 'issue' : 'issues'}`}
              </span>
            </div>
          </div>

          <Progress value={progress} className="h-2" />

          <ScrollArea className="h-[350px] pr-4">
            <div className="space-y-4">
              {/* Group the items by category */}
              {Object.entries(
                checklistData.items.reduce((acc, item) => {
                  acc[item.category] = acc[item.category] || [];
                  acc[item.category].push(item);
                  return acc;
                }, {})
              ).map(([category, items]) => (
                <div key={category} className="space-y-2">
                  <h3 className="font-medium text-gray-700">{category}</h3>
                  <div className="space-y-2">
                    {items.map(item => (
                      <div
                        key={item.id}
                        className={`border rounded-md p-3 ${
                          item.status === 'complete'
                            ? 'bg-green-50 border-green-200'
                            : item.priority === 'critical'
                              ? 'bg-red-50 border-red-200'
                              : 'bg-amber-50 border-amber-200'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex gap-2">
                            <div className="mt-0.5">
                              {item.status === 'complete' ? (
                                <Check className="h-5 w-5 text-green-600" />
                              ) : item.priority === 'critical' ? (
                                <XCircle className="h-5 w-5 text-red-600" />
                              ) : (
                                <AlertTriangle className="h-5 w-5 text-amber-600" />
                              )}
                            </div>
                            <div>
                              <h4 className="font-medium text-sm">
                                {item.title}
                                {item.required && <span className="ml-1 text-red-500">*</span>}
                              </h4>
                              <p className="text-xs text-gray-600 mt-0.5">{item.description}</p>
                            </div>
                          </div>

                          <div className="flex items-center">
                            {item.status !== 'complete' && (
                              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                                <Info className="h-3.5 w-3.5" />
                                <span>Details</span>
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {item.additionalInfo && (
                          <div className="mt-2 pt-2 border-t border-dashed border-gray-200">
                            <p className="text-xs text-gray-600">{item.additionalInfo}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
