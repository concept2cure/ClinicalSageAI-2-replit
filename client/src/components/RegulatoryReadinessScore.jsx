import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Loader2, Info, Shield, AlertCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

export default function RegulatoryReadinessScore() {
  const [isLoading, setIsLoading] = useState(false);
  const [readinessScore, setReadinessScore] = useState(null);
  const [regulatoryItems, setRegulatoryItems] = useState([
    {
      id: 1,
      checked: false,
      label: 'Protocol includes clear primary endpoints',
      category: 'protocol',
      weight: 10,
    },
    {
      id: 2,
      checked: false,
      label: 'Sample size justification is provided',
      category: 'statistics',
      weight: 12,
    },
    {
      id: 3,
      checked: false,
      label: 'Inclusion/exclusion criteria are specific',
      category: 'protocol',
      weight: 8,
    },
    {
      id: 4,
      checked: false,
      label: 'Safety monitoring plan is detailed',
      category: 'safety',
      weight: 14,
    },
    {
      id: 5,
      checked: false,
      label: 'Statistical analysis plan aligns with endpoints',
      category: 'statistics',
      weight: 10,
    },
    {
      id: 6,
      checked: false,
      label: 'Randomization methodology is specified',
      category: 'design',
      weight: 7,
    },
    {
      id: 7,
      checked: false,
      label: 'Data management procedures are documented',
      category: 'operations',
      weight: 6,
    },
    {
      id: 8,
      checked: false,
      label: 'Informed consent process is described',
      category: 'ethics',
      weight: 9,
    },
    {
      id: 9,
      checked: false,
      label: 'Study drug handling procedures are defined',
      category: 'drug',
      weight: 8,
    },
    {
      id: 10,
      checked: false,
      label: 'Adverse event reporting procedures are established',
      category: 'safety',
      weight: 16,
    },
  ]);

  const toggleItem = itemId => {
    setRegulatoryItems(
      regulatoryItems.map(item => (item.id === itemId ? { ...item, checked: !item.checked } : item))
    );
  };

  const calculateReadiness = async () => {
    setIsLoading(true);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Calculate score based on weights of checked items
      const totalWeight = regulatoryItems.reduce((sum, item) => sum + item.weight, 0);
      const checkedWeight = regulatoryItems
        .filter(item => item.checked)
        .reduce((sum, item) => sum + item.weight, 0);

      const score = Math.round((checkedWeight / totalWeight) * 100);

      // Generate findings based on unchecked items
      const findings = regulatoryItems
        .filter(item => !item.checked)
        .map(item => ({
          id: item.id,
          message: `Missing: ${item.label}`,
          severity: item.weight >= 12 ? 'high' : item.weight >= 8 ? 'medium' : 'low',
          category: item.category,
        }));

      // Get guidance based on score
      let guidance = '';
      if (score < 50) {
        guidance = 'Protocol requires significant development before submission';
      } else if (score < 75) {
        guidance = 'Protocol needs targeted improvements in key areas';
      } else if (score < 90) {
        guidance = 'Protocol is mostly complete with minor gaps';
      } else {
        guidance = 'Protocol meets most regulatory requirements';
      }

      setReadinessScore({
        score,
        findings,
        guidance,
        categoryScores: calculateCategoryScores(),
      });
    } catch (error) {
      console.error('Error calculating regulatory readiness:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateCategoryScores = () => {
    const categories = {};

    // Initialize categories
    regulatoryItems.forEach(item => {
      if (!categories[item.category]) {
        categories[item.category] = {
          totalWeight: 0,
          checkedWeight: 0,
          items: 0,
          checkedItems: 0,
        };
      }

      categories[item.category].totalWeight += item.weight;
      categories[item.category].items += 1;

      if (item.checked) {
        categories[item.category].checkedWeight += item.weight;
        categories[item.category].checkedItems += 1;
      }
    });

    // Calculate scores
    return Object.keys(categories).map(category => {
      const { totalWeight, checkedWeight, items, checkedItems } = categories[category];
      const score = Math.round((checkedWeight / totalWeight) * 100);

      return {
        category,
        score,
        completeness: `${checkedItems}/${items}`,
        weight: totalWeight,
      };
    });
  };

  const getCategoryLabel = category => {
    const labels = {
      protocol: 'Protocol Design',
      statistics: 'Statistical Methods',
      safety: 'Safety Monitoring',
      design: 'Study Design',
      operations: 'Study Operations',
      ethics: 'Ethics & Compliance',
      drug: 'Investigational Product',
    };

    return labels[category] || category;
  };

  const getSeverityColor = severity => {
    if (severity === 'high') return 'bg-red-500';
    if (severity === 'medium') return 'bg-amber-500';
    return 'bg-blue-500';
  };

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Regulatory Readiness Assessment</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Assess your protocol's alignment with FDA and EMA regulatory requirements</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {!readinessScore ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {regulatoryItems.map(item => (
                <div key={item.id} className="flex items-center space-x-2 border p-3 rounded-md">
                  <Checkbox
                    id={`item-${item.id}`}
                    checked={item.checked}
                    onCheckedChange={() => toggleItem(item.id)}
                  />
                  <div className="flex justify-between items-center flex-1">
                    <Label htmlFor={`item-${item.id}`} className="cursor-pointer flex-1">
                      {item.label}
                    </Label>
                    <Badge variant="outline" className="ml-2">
                      {getCategoryLabel(item.category)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={calculateReadiness} className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Calculate Regulatory Readiness
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-1">
                <h4 className="font-medium">Overall Readiness Score</h4>
                <span className="text-lg font-bold">{readinessScore.score}%</span>
              </div>
              <Progress value={readinessScore.score} className="h-2.5" />

              <div className="mt-2 p-3 bg-slate-50 rounded-md border text-sm">
                {readinessScore.guidance}
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-3">Category Scores</h4>
              <div className="space-y-3">
                {readinessScore.categoryScores.map(category => (
                  <div key={category.category} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{getCategoryLabel(category.category)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{category.completeness}</span>
                        <span className="font-medium">{category.score}%</span>
                      </div>
                    </div>
                    <Progress value={category.score} className="h-1.5" />
                  </div>
                ))}
              </div>
            </div>

            {readinessScore.findings.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Key Findings</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {readinessScore.findings.map(finding => (
                    <div
                      key={finding.id}
                      className="flex items-start gap-2 p-2 border rounded-md text-sm"
                    >
                      <div
                        className={`w-2 h-2 rounded-full mt-1.5 ${getSeverityColor(finding.severity)}`}
                      ></div>
                      <div className="flex-1">{finding.message}</div>
                      <Badge variant="outline" className="text-xs">
                        {getCategoryLabel(finding.category)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button variant="outline" onClick={() => setReadinessScore(null)} className="mt-3">
              Reset Assessment
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
