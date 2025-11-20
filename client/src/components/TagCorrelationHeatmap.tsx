// React Component: TagCorrelationHeatmap
// Heatmap for tag co-occurrence matrix

import { HeatMapGrid } from 'react-grid-heatmap';

interface TagCorrelationHeatmapProps {
  tagPairs: Record<string, number>;
}

export default function TagCorrelationHeatmap({ tagPairs }: TagCorrelationHeatmapProps) {
  const tagSet = new Set<string>();

  // Extract unique tags
  Object.keys(tagPairs).forEach(pair => {
    const [a, b] = pair.split('::');
    tagSet.add(a);
    tagSet.add(b);
  });

  const tags = Array.from(tagSet).sort();
  const matrix = tags.map(row =>
    tags.map(col => {
      if (row === col) return 0;
      const key = [row, col].sort().join('::');
      return tagPairs[key] || 0;
    })
  );

  // If no data, show empty state
  if (Object.keys(tagPairs).length === 0 || tags.length <= 1) {
    return null;
  }

  return (
    <div className="bg-white border rounded p-4 mb-6">
      <h4 className="text-md font-semibold text-rose-700 mb-2">🔥 Tag Correlation Heatmap</h4>
      <div style={{ fontSize: 12 }}>
        <HeatMapGrid
          data={matrix}
          xLabels={tags}
          yLabels={tags}
          cellRender={(x, y, value) => (value > 0 ? value : '')}
          cellStyle={(_, __, value) => ({
            background: `rgba(255, 99, 132, ${value ? Math.min(value / 10, 1) : 0})`,
            color: value > 5 ? 'white' : 'black',
            fontWeight: 'bold',
          })}
          xLabelsStyle={{ color: '#333', fontSize: 10 }}
          yLabelsStyle={{ color: '#333', fontSize: 10 }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-2">
        This heatmap shows which tags frequently appear together. Darker colors indicate stronger
        correlations.
      </p>
    </div>
  );
}
