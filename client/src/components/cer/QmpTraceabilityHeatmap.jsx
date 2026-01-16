import React, { useState, useEffect } from 'react';
import { InfoIcon, AlertTriangle, CheckCircle, HelpCircle, Filter } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * QMP Traceability Heatmap Component
 *
 * This component provides a visual heatmap showing the traceability between
 * Quality Management Plan (QMP) requirements and different sections of the Clinical Evaluation Report.
 * It helps users identify coverage gaps and monitor compliance across the document.
 */
const QmpTraceabilityHeatmap = ({ deviceName, cerData }) => {
  const [mapData, setMapData] = useState({
    sections: [],
    requirements: [],
    coverage: [],
  });
  const [viewMode, setViewMode] = useState('coverage');
  const [filterLevel, setFilterLevel] = useState('all');

  // Mock data for demonstration purposes
  useEffect(() => {
    // In a real implementation, this would be fetched from an API
    const mockSections = [
      { id: 'scope', name: 'Scope' },
      { id: 'device-desc', name: 'Device Description' },
      { id: 'clinical-background', name: 'Clinical Background' },
      { id: 'intended-use', name: 'Intended Use/Purpose' },
      { id: 'literature', name: 'Literature Review' },
      { id: 'clinical-data', name: 'Clinical Data Analysis' },
      { id: 'risk', name: 'Risk Analysis' },
      { id: 'risk-benefit', name: 'Benefit-Risk Analysis' },
      { id: 'pms', name: 'Post-Market Surveillance' },
      { id: 'conclusion', name: 'Conclusion' },
    ];

    const mockRequirements = [
      { id: 'req1', name: 'Device Classification Documentation', level: 'high' },
      { id: 'req2', name: 'Quality Verified Literature Data', level: 'high' },
      { id: 'req3', name: 'Verified Clinical Data', level: 'high' },
      { id: 'req4', name: 'Risk Assessment Completeness', level: 'high' },
      { id: 'req5', name: 'Regulatory Standard Adherence', level: 'high' },
      { id: 'req6', name: 'Clinical Performance Evidence', level: 'medium' },
      { id: 'req7', name: 'Equivalence Methodology', level: 'medium' },
      { id: 'req8', name: 'State of Art Analysis', level: 'medium' },
      { id: 'req9', name: 'Usability Considerations', level: 'medium' },
      { id: 'req10', name: 'Post-Market Data Inclusion', level: 'medium' },
      { id: 'req11', name: 'Rationale Documentation', level: 'low' },
      { id: 'req12', name: 'Terminology Consistency', level: 'low' },
      { id: 'req13', name: 'Data Integrity Controls', level: 'low' },
    ];

    // Generate mock coverage data
    // Values: 0 = not applicable, 1 = missing, 2 = partial, 3 = complete
    const mockCoverage = [];

    // Loop through each requirement
    mockRequirements.forEach(req => {
      const reqCoverage = {};
      reqCoverage.requirementId = req.id;

      // For each section, assign a coverage value
      mockSections.forEach(section => {
        let value = 0;

        // Some logical rules to create a realistic pattern
        if (req.id === 'req1' && ['scope', 'device-desc', 'intended-use'].includes(section.id)) {
          value = 3; // Complete coverage for device classification in these sections
        } else if (req.id === 'req2' && ['literature'].includes(section.id)) {
          value = 3; // Complete coverage for literature data quality in literature section
        } else if (req.id === 'req3' && ['clinical-data'].includes(section.id)) {
          value = 2; // Partial coverage for verified clinical data
        } else if (req.id === 'req4' && ['risk'].includes(section.id)) {
          value = 3; // Complete for risk assessment in risk section
        } else if (req.id === 'req5') {
          // Regulatory adherence across multiple sections
          value = ['device-desc', 'intended-use', 'conclusion'].includes(section.id)
            ? 3
            : ['clinical-background', 'literature'].includes(section.id)
              ? 2
              : ['risk-benefit'].includes(section.id)
                ? 1
                : 0;
        } else if (req.id === 'req6' && ['clinical-data', 'conclusion'].includes(section.id)) {
          value = section.id === 'clinical-data' ? 3 : 2;
        } else if (req.id === 'req7' && ['clinical-data', 'literature'].includes(section.id)) {
          value = section.id === 'clinical-data' ? 2 : 1;
        } else if (
          req.id === 'req8' &&
          ['clinical-background', 'literature'].includes(section.id)
        ) {
          value = section.id === 'literature' ? 3 : 2;
        } else if (req.id === 'req9' && ['device-desc', 'clinical-data'].includes(section.id)) {
          value = section.id === 'device-desc' ? 2 : 1;
        } else if (req.id === 'req10' && ['pms', 'conclusion'].includes(section.id)) {
          value = section.id === 'pms' ? 3 : 1;
        } else if (req.id === 'req11') {
          // Rationale documentation across all sections
          value = ['device-desc', 'intended-use', 'conclusion', 'risk-benefit'].includes(section.id)
            ? 3
            : ['clinical-background', 'literature', 'clinical-data'].includes(section.id)
              ? 2
              : 1;
        } else if (req.id === 'req12') {
          // Terminology consistency across all sections
          value = Math.floor(Math.random() * 3) + 1; // Random values 1-3 for all sections
        } else if (
          req.id === 'req13' &&
          ['clinical-data', 'literature', 'pms'].includes(section.id)
        ) {
          value = section.id === 'clinical-data' ? 3 : 2;
        } else if (['scope', 'conclusion'].includes(section.id)) {
          // Most requirements have some relation to scope and conclusion
          value = Math.random() > 0.7 ? 0 : Math.floor(Math.random() * 2) + 1;
        }

        reqCoverage[section.id] = value;
      });

      mockCoverage.push(reqCoverage);
    });

    setMapData({
      sections: mockSections,
      requirements: mockRequirements,
      coverage: mockCoverage,
    });
  }, []);

  // Get the color for a cell based on its coverage value and view mode
  const getCellColor = (value, requirementLevel) => {
    if (viewMode === 'coverage') {
      // Colors for coverage view mode
      switch (value) {
        case 0:
          return 'bg-gray-100'; // Not applicable
        case 1:
          return 'bg-red-100'; // Missing
        case 2:
          return 'bg-yellow-100'; // Partial
        case 3:
          return 'bg-green-100'; // Complete
        default:
          return 'bg-gray-100';
      }
    } else {
      // Colors for risk level view mode
      switch (requirementLevel) {
        case 'high':
          return value === 0 ? 'bg-gray-100' : value === 3 ? 'bg-green-100' : 'bg-red-100';
        case 'medium':
          return value === 0 ? 'bg-gray-100' : value === 3 ? 'bg-green-100' : 'bg-yellow-100';
        case 'low':
          return value === 0 ? 'bg-gray-100' : value === 3 ? 'bg-green-100' : 'bg-blue-100';
        default:
          return 'bg-gray-100';
      }
    }
  };

  // Get the icon for a cell based on its coverage value and view mode
  const getCellIcon = (value, requirementLevel) => {
    if (value === 0) {
      return <div className="w-5 h-5 text-gray-300">—</div>; // Not applicable
    }

    if (viewMode === 'coverage') {
      switch (value) {
        case 1:
          return <AlertTriangle className="w-4 h-4 text-red-500" />; // Missing
        case 2:
          return <HelpCircle className="w-4 h-4 text-yellow-500" />; // Partial
        case 3:
          return <CheckCircle className="w-4 h-4 text-green-500" />; // Complete
        default:
          return null;
      }
    } else {
      // Icons for risk level view mode
      if (requirementLevel === 'high') {
        return value < 3 ? (
          <AlertTriangle className="w-4 h-4 text-red-500" />
        ) : (
          <CheckCircle className="w-4 h-4 text-green-500" />
        );
      } else if (requirementLevel === 'medium') {
        return value < 3 ? (
          <HelpCircle className="w-4 h-4 text-yellow-500" />
        ) : (
          <CheckCircle className="w-4 h-4 text-green-500" />
        );
      } else {
        return value < 3 ? (
          <InfoIcon className="w-4 h-4 text-blue-500" />
        ) : (
          <CheckCircle className="w-4 h-4 text-green-500" />
        );
      }
    }
  };

  // Get tooltip content for a cell
  const getCellTooltip = (requirement, section, value) => {
    if (value === 0) {
      return `Not applicable: ${requirement.name} is not relevant for the ${section.name} section`;
    }

    const status = value === 1 ? 'Missing' : value === 2 ? 'Partial' : 'Complete';
    const riskLevel =
      requirement.level === 'high'
        ? 'High Risk'
        : requirement.level === 'medium'
          ? 'Medium Risk'
          : 'Low Risk';

    return (
      <div className="p-2 max-w-xs">
        <p className="font-semibold mb-1">{requirement.name}</p>
        <p className="text-xs mb-1">Section: {section.name}</p>
        <p className="text-xs mb-1">Risk Level: {riskLevel}</p>
        <p className="text-xs mb-1">Status: {status}</p>
        {value === 1 && (
          <p className="text-xs text-red-600 mt-1">
            Action needed: Document how this requirement is addressed in this section
          </p>
        )}
        {value === 2 && (
          <p className="text-xs text-yellow-600 mt-1">
            Action needed: Provide additional information to fully address this requirement
          </p>
        )}
      </div>
    );
  };

  // Filter requirements based on the selected risk level
  const filteredRequirements = mapData.requirements.filter(req => {
    if (filterLevel === 'all') return true;
    return req.level === filterLevel;
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-md shadow p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h2 className="text-xl font-semibold">Quality Requirement Traceability</h2>
            <p className="text-sm text-gray-500 mt-1">
              Tracking coverage of quality requirements across CER sections
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div>
              <Select value={viewMode} onValueChange={setViewMode}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="View Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coverage">Coverage View</SelectItem>
                  <SelectItem value="risk">Risk Impact View</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={filterLevel} onValueChange={setFilterLevel}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Risk Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Requirements</SelectItem>
                  <SelectItem value="high">High Risk Only</SelectItem>
                  <SelectItem value="medium">Medium Risk Only</SelectItem>
                  <SelectItem value="low">Low Risk Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mb-6 flex flex-wrap gap-4">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-100 mr-2"></div>
            <span className="text-xs">Complete</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-yellow-100 mr-2"></div>
            <span className="text-xs">Partial</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-100 mr-2"></div>
            <span className="text-xs">Missing</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-gray-100 mr-2"></div>
            <span className="text-xs">Not Applicable</span>
          </div>
          {viewMode === 'risk' && (
            <div className="flex items-center">
              <div className="w-4 h-4 bg-blue-100 mr-2"></div>
              <span className="text-xs">Low Risk Issue</span>
            </div>
          )}
        </div>

        {/* Heatmap */}
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th className="p-2 border bg-gray-50 font-medium text-sm text-left">
                  Requirements {filterLevel !== 'all' && `(${filterLevel} risk)`}
                </th>
                {mapData.sections.map(section => (
                  <th
                    key={section.id}
                    className="p-2 border bg-gray-50 font-medium text-sm text-center"
                  >
                    <div className="transform -rotate-45 origin-center whitespace-nowrap w-20 truncate">
                      {section.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRequirements.map(req => {
                const reqCoverage = mapData.coverage.find(c => c.requirementId === req.id);

                return (
                  <tr key={req.id}>
                    <td className="p-2 border text-sm">
                      <div className="flex items-center">
                        <span
                          className={`w-2 h-2 rounded-full mr-2 ${
                            req.level === 'high'
                              ? 'bg-red-500'
                              : req.level === 'medium'
                                ? 'bg-yellow-500'
                                : 'bg-blue-500'
                          }`}
                        ></span>
                        <span className="truncate max-w-[180px]" title={req.name}>
                          {req.name}
                        </span>
                      </div>
                    </td>

                    {mapData.sections.map(section => {
                      const value = reqCoverage ? reqCoverage[section.id] : 0;

                      return (
                        <td key={`${req.id}-${section.id}`} className="p-0 border text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={`
                                    w-full h-12 flex items-center justify-center
                                    ${getCellColor(value, req.level)}
                                    cursor-pointer transition-colors hover:opacity-80
                                  `}
                                >
                                  {getCellIcon(value, req.level)}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>{getCellTooltip(req, section, value)}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary stats */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Overall Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">82%</div>
              <p className="text-xs text-gray-500">+5% from last version</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">High Risk Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">95%</div>
              <p className="text-xs text-green-600">All critical requirements addressed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Missing Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">4</div>
              <p className="text-xs text-gray-500">Requirements need documentation</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Sections Covered</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">10/10</div>
              <p className="text-xs text-gray-500">All sections have quality requirements</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default QmpTraceabilityHeatmap;
