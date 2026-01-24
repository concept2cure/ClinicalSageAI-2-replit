import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { isFeatureEnabled } from '@/flags/featureFlags';
import { Fingerprint, Check, X, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * PredicateComparison component displays a detailed side-by-side comparison
 * between the current device profile and a selected predicate device.
 *
 * @param {Object} props - Component props
 * @param {Object} props.deviceProfile - The current device profile
 * @param {Object} props.predicateDevice - The selected predicate device for comparison
 * @returns {JSX.Element} - Rendered component
 */
const PredicateComparison = ({ deviceProfile, predicateDevice }) => {
  // Guard: Only render if the feature flag is enabled
  if (!isFeatureEnabled('ENABLE_COMPARISONS')) {
    return null;
  }

  // Guard: Don't render if either device profile or predicate device is missing
  if (!deviceProfile || !predicateDevice) {
    return (
      <Card className="mb-6 shadow-sm">
        <CardHeader className="bg-amber-50 pb-3">
          <CardTitle className="text-amber-700 flex items-center text-base">
            <Fingerprint className="mr-2 h-5 w-5 text-amber-600" />
            Device Comparison
          </CardTitle>
          <CardDescription className="text-amber-600">
            Please select a predicate device to compare with your current device profile
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Helper function to determine if two values match for highlighting
  const isMatch = (value1, value2) => {
    if (value1 === value2) return true;

    // Case insensitive match for strings
    if (typeof value1 === 'string' && typeof value2 === 'string') {
      return value1.toLowerCase() === value2.toLowerCase();
    }

    return false;
  };

  // Helper function to compute similarity percentage
  const calculateSimilarity = () => {
    const comparisonPoints = [
      isMatch(deviceProfile.deviceName, predicateDevice.deviceName) ? 0.05 : 0,
      isMatch(deviceProfile.deviceClass, predicateDevice.deviceClass) ? 0.15 : 0,
      isMatch(deviceProfile.regulationNumber, predicateDevice.regulationNumber) ? 0.15 : 0,
      isMatch(deviceProfile.productCode, predicateDevice.productCode) ? 0.15 : 0,
      isMatch(deviceProfile.intendedUse, predicateDevice.intendedUse) ? 0.2 : 0,
      isMatch(deviceProfile.technologyDescription, predicateDevice.technologyDescription)
        ? 0.15
        : 0,
      isMatch(deviceProfile.clinicalUse, predicateDevice.clinicalUse) ? 0.15 : 0,
    ];

    const totalSimilarity = comparisonPoints.reduce((sum, value) => sum + value, 0);
    return Math.round(totalSimilarity * 100);
  };

  const similarity = calculateSimilarity();

  // Helper to get similarity color
  const getSimilarityColor = simPercent => {
    if (simPercent >= 75) return 'bg-green-100 text-green-800 border-green-200';
    if (simPercent >= 50) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  // Helper to render match status indicator
  const renderMatchIndicator = (value1, value2) => {
    const matches = isMatch(value1, value2);

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`flex justify-center items-center rounded-full p-1 ${matches ? 'bg-green-100' : 'bg-red-100'}`}
            >
              {matches ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <X className="h-4 w-4 text-red-600" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>{matches ? 'Match' : 'No Match'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <Card className="mb-6 shadow-sm">
      <CardHeader className="bg-blue-50 pb-3">
        <CardTitle className="text-blue-700 flex items-center text-base">
          <Fingerprint className="mr-2 h-5 w-5 text-blue-600" />
          Device Comparison
        </CardTitle>
        <CardDescription className="text-blue-600 flex items-center justify-between">
          <span>Side-by-side comparison with selected predicate device</span>
          <Badge className={`ml-2 ${getSimilarityColor(similarity)}`}>{similarity}% Similar</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-1/3">Attribute</TableHead>
              <TableHead className="w-1/3">Your Device</TableHead>
              <TableHead className="w-1/12 text-center">Match</TableHead>
              <TableHead className="w-1/3">Predicate Device</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Device Name */}
            <TableRow>
              <TableCell className="font-medium">Device Name</TableCell>
              <TableCell
                className={
                  isMatch(deviceProfile.deviceName, predicateDevice.deviceName) ? 'bg-green-50' : ''
                }
              >
                {deviceProfile.deviceName || 'Not specified'}
              </TableCell>
              <TableCell className="text-center">
                {renderMatchIndicator(deviceProfile.deviceName, predicateDevice.deviceName)}
              </TableCell>
              <TableCell
                className={
                  isMatch(deviceProfile.deviceName, predicateDevice.deviceName) ? 'bg-green-50' : ''
                }
              >
                {predicateDevice.deviceName || 'Not specified'}
              </TableCell>
            </TableRow>

            {/* Device Class */}
            <TableRow>
              <TableCell className="font-medium">Device Class</TableCell>
              <TableCell
                className={
                  isMatch(deviceProfile.deviceClass, predicateDevice.deviceClass)
                    ? 'bg-green-50'
                    : ''
                }
              >
                {deviceProfile.deviceClass || 'Not specified'}
              </TableCell>
              <TableCell className="text-center">
                {renderMatchIndicator(deviceProfile.deviceClass, predicateDevice.deviceClass)}
              </TableCell>
              <TableCell
                className={
                  isMatch(deviceProfile.deviceClass, predicateDevice.deviceClass)
                    ? 'bg-green-50'
                    : ''
                }
              >
                {predicateDevice.deviceClass || 'Not specified'}
              </TableCell>
            </TableRow>

            {/* Regulation Number */}
            <TableRow>
              <TableCell className="font-medium">Regulation Number</TableCell>
              <TableCell
                className={
                  isMatch(deviceProfile.regulationNumber, predicateDevice.regulationNumber)
                    ? 'bg-green-50'
                    : ''
                }
              >
                {deviceProfile.regulationNumber || 'Not specified'}
              </TableCell>
              <TableCell className="text-center">
                {renderMatchIndicator(
                  deviceProfile.regulationNumber,
                  predicateDevice.regulationNumber
                )}
              </TableCell>
              <TableCell
                className={
                  isMatch(deviceProfile.regulationNumber, predicateDevice.regulationNumber)
                    ? 'bg-green-50'
                    : ''
                }
              >
                {predicateDevice.regulationNumber || 'Not specified'}
              </TableCell>
            </TableRow>

            {/* Product Code */}
            <TableRow>
              <TableCell className="font-medium">Product Code</TableCell>
              <TableCell
                className={
                  isMatch(deviceProfile.productCode, predicateDevice.productCode)
                    ? 'bg-green-50'
                    : ''
                }
              >
                {deviceProfile.productCode || 'Not specified'}
              </TableCell>
              <TableCell className="text-center">
                {renderMatchIndicator(deviceProfile.productCode, predicateDevice.productCode)}
              </TableCell>
              <TableCell
                className={
                  isMatch(deviceProfile.productCode, predicateDevice.productCode)
                    ? 'bg-green-50'
                    : ''
                }
              >
                {predicateDevice.productCode || 'Not specified'}
              </TableCell>
            </TableRow>

            {/* Intended Use */}
            <TableRow>
              <TableCell className="font-medium">Intended Use</TableCell>
              <TableCell
                className={
                  isMatch(deviceProfile.intendedUse, predicateDevice.intendedUse)
                    ? 'bg-green-50'
                    : ''
                }
              >
                {deviceProfile.intendedUse || 'Not specified'}
              </TableCell>
              <TableCell className="text-center">
                {renderMatchIndicator(deviceProfile.intendedUse, predicateDevice.intendedUse)}
              </TableCell>
              <TableCell
                className={
                  isMatch(deviceProfile.intendedUse, predicateDevice.intendedUse)
                    ? 'bg-green-50'
                    : ''
                }
              >
                {predicateDevice.intendedUse || 'Not specified'}
              </TableCell>
            </TableRow>

            {/* Technology Description */}
            <TableRow>
              <TableCell className="font-medium">Technology</TableCell>
              <TableCell
                className={
                  isMatch(
                    deviceProfile.technologyDescription,
                    predicateDevice.technologyDescription
                  )
                    ? 'bg-green-50'
                    : ''
                }
              >
                {deviceProfile.technologyDescription || 'Not specified'}
              </TableCell>
              <TableCell className="text-center">
                {renderMatchIndicator(
                  deviceProfile.technologyDescription,
                  predicateDevice.technologyDescription
                )}
              </TableCell>
              <TableCell
                className={
                  isMatch(
                    deviceProfile.technologyDescription,
                    predicateDevice.technologyDescription
                  )
                    ? 'bg-green-50'
                    : ''
                }
              >
                {predicateDevice.technologyDescription || 'Not specified'}
              </TableCell>
            </TableRow>

            {/* Clinical Use */}
            <TableRow>
              <TableCell className="font-medium">Clinical Use</TableCell>
              <TableCell
                className={
                  isMatch(deviceProfile.clinicalUse, predicateDevice.clinicalUse)
                    ? 'bg-green-50'
                    : ''
                }
              >
                {deviceProfile.clinicalUse || 'Not specified'}
              </TableCell>
              <TableCell className="text-center">
                {renderMatchIndicator(deviceProfile.clinicalUse, predicateDevice.clinicalUse)}
              </TableCell>
              <TableCell
                className={
                  isMatch(deviceProfile.clinicalUse, predicateDevice.clinicalUse)
                    ? 'bg-green-50'
                    : ''
                }
              >
                {predicateDevice.clinicalUse || 'Not specified'}
              </TableCell>
            </TableRow>

            {/* Manufacturer */}
            <TableRow>
              <TableCell className="font-medium">Manufacturer</TableCell>
              <TableCell>{deviceProfile.manufacturer || 'Not specified'}</TableCell>
              <TableCell className="text-center">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex justify-center items-center rounded-full p-1 bg-gray-100">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      Manufacturer differences are expected and not considered in similarity score
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              <TableCell>{predicateDevice.manufacturer || 'Not specified'}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default PredicateComparison;
