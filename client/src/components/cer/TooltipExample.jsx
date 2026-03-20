import React from 'react';
import SimpleTooltip from './SimpleTooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FileText,
  BookOpen,
  CheckSquare,
  GitCompare,
  HelpCircle,
  Info,
  AlertCircle,
} from 'lucide-react';

/**
 * TooltipExample Component
 *
 * Demonstrates the use of the SimpleTooltip component in the CERV2 interface.
 * This component shows various ways to use contextual tooltips.
 */
const TooltipExample = () => {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-blue-500" />
            Contextual Learning Features
            <Badge className="ml-2 bg-blue-100 text-blue-700">New</Badge>
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Hover over or click on the help icons below to learn more about key aspects of creating
            a Clinical Evaluation Report.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start p-3 border border-gray-200 rounded-md">
              <div className="mr-3 mt-0.5">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">Device Profile</h3>
                  <SimpleTooltip
                    title="Device Profile"
                    content="The Device Profile is the foundation of your CER. It includes detailed information about your device's classification, technical characteristics, and intended use. According to MDR requirements, this information must be comprehensive and accurate."
                    regulations={['MDR Annex II, 1.1', 'MEDDEV 2.7/1 Rev4, 7']}
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Define your device's characteristics and classification.
                </p>
              </div>
            </div>

            <div className="flex items-start p-3 border border-gray-200 rounded-md">
              <div className="mr-3 mt-0.5">
                <BookOpen className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">Literature Search</h3>
                  <SimpleTooltip
                    title="Literature Search Strategy"
                    content="A well-defined literature search strategy is essential for a comprehensive CER. Your search should use appropriate databases, specific search terms, and clear inclusion/exclusion criteria. Document your methodology thoroughly to demonstrate a systematic approach."
                    regulations={['MDR Article 61', 'MEDDEV 2.7/1 Rev4, 8']}
                    width="lg"
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Conduct systematic literature searches for relevant clinical data.
                </p>
              </div>
            </div>

            <div className="flex items-start p-3 border border-gray-200 rounded-md">
              <div className="mr-3 mt-0.5">
                <GitCompare className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">Equivalence Assessment</h3>
                  <SimpleTooltip
                    title="Equivalence Assessment"
                    content="When claiming equivalence with another device, you must demonstrate technical, biological, and clinical equivalence. A detailed comparison based on specific characteristics is required, not just a statement of equivalence. Any differences must be analyzed for their impact on safety and performance."
                    regulations={['MDR Annex XIV, Part A', 'MEDDEV 2.7/1 Rev4, 8.4']}
                    width="lg"
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Establish equivalence with other devices to leverage their clinical data.
                </p>
              </div>
            </div>

            <div className="flex items-start p-3 border border-gray-200 rounded-md">
              <div className="mr-3 mt-0.5">
                <CheckSquare className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">Benefit-Risk Analysis</h3>
                  <SimpleTooltip
                    title="Benefit-Risk Analysis"
                    content="A thorough benefit-risk analysis is a critical component of your CER. Each identified risk must be weighed against clinical benefits, considering both severity and probability. Quantitative approaches are preferred where possible, and all conclusions must be supported by clinical evidence."
                    regulations={['MDR Annex I', 'MEDDEV 2.7/1 Rev4, 9.3.3']}
                    width="lg"
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Evaluate the clinical benefits against potential risks.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" className="gap-1">
                <AlertCircle className="h-4 w-4" />
                Show Compliance Workflow
              </Button>

              <Button variant="outline" size="sm" className="gap-1">
                <Info className="h-4 w-4" />
                Interactive Walkthrough
              </Button>

              <SimpleTooltip
                showIndicator={false}
                title="Learning Tools"
                content={
                  <div className="space-y-2">
                    <p>
                      Concept2Cure's learning tools help you navigate complex regulatory requirements:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Contextual tooltips explain concepts within their usage context</li>
                      <li>Interactive walkthroughs guide you through key workflows</li>
                      <li>Compliance storytelling presents regulations as an engaging narrative</li>
                    </ul>
                  </div>
                }
                width="lg"
                placement="bottom"
              >
                <Button variant="link" size="sm" className="gap-1 text-blue-600">
                  <HelpCircle className="h-4 w-4" />
                  About Learning Tools
                </Button>
              </SimpleTooltip>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TooltipExample;
