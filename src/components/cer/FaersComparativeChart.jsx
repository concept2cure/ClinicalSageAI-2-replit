import React from 'react';

/**
 * FAERS Comparative Chart Component
 *
 * Displays comparative analysis of adverse event reports between the target product
 * and similar products in the same therapeutic class
 */
export function FaersComparativeChart({ productName = 'Target Product', faersData = {} }) {
  // Sample comparative data for visualization
  // In a real implementation, this would come from the faersData prop
  const comparators = faersData?.comparators || [
    { comparator: 'Similar Product A', riskScore: 3.2, reportCount: 156 },
    { comparator: 'Similar Product B', riskScore: 4.1, reportCount: 212 },
    { comparator: 'Similar Product C', riskScore: 2.8, reportCount: 98 },
  ];

  // Calculate the max value for scaling
  const maxRiskScore = Math.max(
    ...[faersData?.riskScore || 3.5, ...comparators.map(c => c.riskScore)]
  );

  // Calculate the max report count for scaling
  const maxReportCount = Math.max(
    ...[faersData?.reportCount || 180, ...comparators.map(c => c.reportCount)]
  );

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-4">Product</th>
              <th className="text-left py-2 px-4">Risk Score</th>
              <th className="text-left py-2 px-4">Reports</th>
              <th className="text-left py-2 px-4" style={{ width: '40%' }}>
                Relative Risk
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Target product */}
            <tr className="border-b bg-blue-50">
              <td className="py-3 px-4 font-medium">{productName}</td>
              <td className="py-3 px-4">{faersData?.riskScore || 3.5}</td>
              <td className="py-3 px-4">{faersData?.reportCount || 180}</td>
              <td className="py-3 px-4">
                <div className="flex items-center">
                  <div
                    className="bg-blue-500 h-4 rounded"
                    style={{ width: `${((faersData?.riskScore || 3.5) / maxRiskScore) * 100}%` }}
                  ></div>
                </div>
              </td>
            </tr>

            {/* Comparator products */}
            {comparators.map((comp, index) => (
              <tr key={index} className="border-b">
                <td className="py-3 px-4">{comp.comparator}</td>
                <td className="py-3 px-4">{comp.riskScore}</td>
                <td className="py-3 px-4">{comp.reportCount}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center">
                    <div
                      className="bg-gray-300 h-4 rounded"
                      style={{ width: `${(comp.riskScore / maxRiskScore) * 100}%` }}
                    ></div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Risk Score Distribution</h3>
          <div className="h-40 flex items-end space-x-2">
            {/* Target product */}
            <div className="flex flex-col items-center justify-end flex-1">
              <div
                className="bg-blue-500 w-12 rounded-t"
                style={{ height: `${((faersData?.riskScore || 3.5) / maxRiskScore) * 100}%` }}
              ></div>
              <span className="text-xs mt-2 text-center w-20 truncate">{productName}</span>
            </div>

            {/* Comparator products */}
            {comparators.map((comp, index) => (
              <div key={index} className="flex flex-col items-center justify-end flex-1">
                <div
                  className="bg-gray-300 w-12 rounded-t"
                  style={{ height: `${(comp.riskScore / maxRiskScore) * 100}%` }}
                ></div>
                <span className="text-xs mt-2 text-center w-20 truncate">{comp.comparator}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Report Volume Comparison</h3>
          <div className="h-40 flex items-end space-x-2">
            {/* Target product */}
            <div className="flex flex-col items-center justify-end flex-1">
              <div
                className="bg-blue-500 w-12 rounded-t"
                style={{ height: `${((faersData?.reportCount || 180) / maxReportCount) * 100}%` }}
              ></div>
              <span className="text-xs mt-2 text-center w-20 truncate">{productName}</span>
            </div>

            {/* Comparator products */}
            {comparators.map((comp, index) => (
              <div key={index} className="flex flex-col items-center justify-end flex-1">
                <div
                  className="bg-gray-300 w-12 rounded-t"
                  style={{ height: `${(comp.reportCount / maxReportCount) * 100}%` }}
                ></div>
                <span className="text-xs mt-2 text-center w-20 truncate">{comp.comparator}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="text-sm text-muted-foreground mt-2 border-t pt-3">
        <p>
          <strong>Analysis:</strong> {productName} demonstrates a
          {(faersData?.riskScore || 3.5) < 3
            ? ' lower'
            : (faersData?.riskScore || 3.5) > 4
              ? ' higher'
              : ' similar'}{' '}
          risk profile compared to the average for products in the same class (
          {(comparators.reduce((sum, c) => sum + c.riskScore, 0) / comparators.length).toFixed(1)}{' '}
          average risk score).
        </p>
      </div>
    </div>
  );
}
