import React from 'react';

export default function StabilityDataVisualizer({ fullSize = false }) {
  return (
    <div
      className={`${fullSize ? 'h-full' : 'h-[300px]'} flex items-center justify-center bg-muted/30 rounded-md`}
    >
      <div className="text-center p-6">
        <h3 className="text-lg font-medium mb-2">Stability Data Visualization</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Interactive stability data charts would be displayed here, showing trends in assay,
          impurities, and other quality attributes over time under various storage conditions.
        </p>
        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <div className="p-4 border rounded-md bg-card">
            <div className="text-lg font-medium">98.7%</div>
            <div className="text-sm text-muted-foreground">Assay (latest)</div>
          </div>
          <div className="p-4 border rounded-md bg-card">
            <div className="text-lg font-medium">0.12%</div>
            <div className="text-sm text-muted-foreground">Total Impurities</div>
          </div>
          <div className="p-4 border rounded-md bg-card">
            <div className="text-lg font-medium">24 mo</div>
            <div className="text-sm text-muted-foreground">Predicted Shelf-life</div>
          </div>
          <div className="p-4 border rounded-md bg-card">
            <div className="text-lg font-medium">-0.01%/mo</div>
            <div className="text-sm text-muted-foreground">Degradation Rate</div>
          </div>
        </div>
      </div>
    </div>
  );
}
