import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripVertical, ChevronDown, ChevronUp, Plus, Trash2, Edit } from 'lucide-react'

export default function SectionReorder({ submissionId }) {
  const [sections, setSections] = useState([
    { id: '1.0', title: 'Introduction', level: 1, expanded: true },
    { id: '1.1', title: 'Product Overview', level: 2, expanded: true },
    { id: '1.2', title: 'Regulatory Context', level: 2, expanded: true },
    { id: '2.0', title: 'Quality Information', level: 1, expanded: true },
    { id: '2.1', title: 'Drug Substance', level: 2, expanded: false },
    { id: '2.2', title: 'Drug Product', level: 2, expanded: false },
    { id: '2.3', title: 'Manufacturing Process', level: 2, expanded: false },
    { id: '3.0', title: 'Non-clinical Data', level: 1, expanded: true },
    { id: '3.1', title: 'Pharmacology', level: 2, expanded: true },
    { id: '3.2', title: 'Pharmacokinetics', level: 2, expanded: true },
    { id: '3.3', title: 'Toxicology', level: 2, expanded: true },
    { id: '4.0', title: 'Clinical Data', level: 1, expanded: true },
    { id: '4.1', title: 'Study Description', level: 2, expanded: true },
    { id: '4.2', title: 'Efficacy Results', level: 2, expanded: true },
    { id: '4.3', title: 'Safety Results', level: 2, expanded: true },
  ]);

  // Toggle section expanded state
  const toggleExpanded = id => {
    setSections(
      sections.map(section =>
        section.id === id ? { ...section, expanded: !section.expanded } : section
      )
    );
  };

  // Move section up
  const moveUp = index => {
    if (index === 0) return;
    const newSections = [...sections];
    const temp = newSections[index];
    newSections[index] = newSections[index - 1];
    newSections[index - 1] = temp;
    setSections(newSections);
  };

  // Move section down
  const moveDown = index => {
    if (index === sections.length - 1) return;
    const newSections = [...sections];
    const temp = newSections[index];
    newSections[index] = newSections[index + 1];
    newSections[index + 1] = temp;
    setSections(newSections);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Section Organization</CardTitle>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            <span>Add Section</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-hidden">
          {sections.map((section, index) => (
            <div key={section.id} className="border-b last:border-b-0 hover:bg-gray-50">
              <div className="flex items-center p-2">
                <div
                  className="flex items-center"
                  style={{ paddingLeft: `${(section.level - 1) * 1.5}rem` }}
                >
                  <GripVertical className="h-5 w-5 text-gray-400 cursor-move mr-1" />

                  <button
                    className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700"
                    onClick={() => toggleExpanded(section.id)}
                  >
                    {section.expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </button>

                  <div className="ml-1">
                    <div className="flex items-center">
                      <span className="font-medium text-sm">{section.id}</span>
                      <span className="ml-2 text-sm">{section.title}</span>
                    </div>
                  </div>
                </div>

                <div className="ml-auto flex items-center space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => moveUp(index)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => moveDown(index)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>

                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <Edit className="h-4 w-4" />
                  </Button>

                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {section.expanded && (
                <div
                  className="p-2 border-t bg-gray-50 text-xs text-gray-600"
                  style={{ paddingLeft: `${(section.level - 1) * 1.5 + 3}rem` }}
                >
                  {section.id === '4.1' ? (
                    <div className="space-y-1">
                      <p>
                        Study XYZ-123: Phase 2 randomized controlled trial evaluating efficacy and
                        safety in patients with condition ABC.
                      </p>
                      <p>- 150 patients enrolled across 12 sites</p>
                      <p>- Primary endpoint: Change in symptom severity at 12 weeks</p>
                    </div>
                  ) : (
                    <div>{section.title} content goes here. Click to edit section content.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
