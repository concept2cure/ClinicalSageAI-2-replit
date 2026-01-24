import React from 'react';

/**
 * FAERS Demographics Charts Component
 *
 * Displays demographic breakdowns for adverse event reports with visualizations
 * for age, gender, and other key demographic factors
 */
export function FaersDemographicsCharts({ faersData = {} }) {
  // Placeholder for actual chart implementation
  // In a real implementation, this would use a charting library like recharts or chart.js

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="p-4 border rounded">
        <h3 className="text-sm font-medium mb-3">Age Distribution</h3>
        <div className="h-40 flex items-end space-x-1">
          {/* Age distribution placeholder bars */}
          <div className="bg-blue-200 w-8 h-20 rounded-t flex-grow"></div>
          <div className="bg-blue-300 w-8 h-28 rounded-t flex-grow"></div>
          <div className="bg-blue-400 w-8 h-32 rounded-t flex-grow"></div>
          <div className="bg-blue-500 w-8 h-24 rounded-t flex-grow"></div>
          <div className="bg-blue-600 w-8 h-16 rounded-t flex-grow"></div>
          <div className="bg-blue-700 w-8 h-10 rounded-t flex-grow"></div>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>0-17</span>
          <span>18-44</span>
          <span>45-64</span>
          <span>65+</span>
        </div>
      </div>

      <div className="p-4 border rounded">
        <h3 className="text-sm font-medium mb-3">Gender Distribution</h3>
        <div className="h-40 flex items-center justify-center">
          {/* Gender distribution placeholder pie chart */}
          <div className="relative w-32 h-32 rounded-full">
            <div className="absolute inset-0 bg-blue-500 rounded-full"></div>
            <div
              className="absolute bg-pink-500 rounded-full"
              style={{
                clipPath: 'polygon(0 0, 60% 0, 60% 100%, 0 100%)',
                inset: 0,
              }}
            ></div>
            <div className="absolute inset-4 bg-white rounded-full"></div>
          </div>
        </div>
        <div className="flex justify-center space-x-4 text-xs mt-2">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-500 mr-1"></div>
            <span>Male ({faersData.malePercent || '42'}%)</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-pink-500 mr-1"></div>
            <span>Female ({faersData.femalePercent || '58'}%)</span>
          </div>
        </div>
      </div>

      <div className="p-4 border rounded">
        <h3 className="text-sm font-medium mb-3">Outcome Severity</h3>
        <div className="h-40 flex items-end space-x-1">
          {/* Outcome severity placeholder bars */}
          <div className="bg-green-300 w-8 h-32 rounded-t flex-grow"></div>
          <div className="bg-yellow-300 w-8 h-20 rounded-t flex-grow"></div>
          <div className="bg-orange-300 w-8 h-16 rounded-t flex-grow"></div>
          <div className="bg-red-300 w-8 h-10 rounded-t flex-grow"></div>
          <div className="bg-red-500 w-8 h-5 rounded-t flex-grow"></div>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-2 overflow-hidden">
          <span>Recovered</span>
          <span>Ongoing</span>
          <span>Hospitalized</span>
          <span>Life-threatening</span>
          <span>Fatal</span>
        </div>
      </div>
    </div>
  );
}
