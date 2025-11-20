import React from 'react';
import { useSortable } from '../lightweight-wrappers.js';
import { CSS } from '../lightweight-wrappers.js';
import { FileText, Download, Eye, Diff } from 'lucide-react';

interface SortableItemProps {
  id: string | number;
  data: any;
  index: number;
  onView: () => void;
  onCompare: () => void;
  onDownload: (type: string) => void;
}

export default function SortableItem({
  id,
  data,
  index,
  onView,
  onCompare,
  onDownload,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className="bg-blue-50 p-4 border border-gray-200 rounded-lg shadow flex justify-between items-center hover:border-blue-300 transition-colors"
    >
      <div className="flex items-center">
        <div className="mr-4 text-blue-600">
          <FileText className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-blue-900">{data.drug_name}</h3>
          <p className="text-xs text-gray-500">
            Updated: {new Date(data.created_at).toLocaleString()}
            {data.version && (
              <span className="ml-2 bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs">
                v{data.version}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <button
          onClick={onView}
          className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
        >
          <Eye className="w-4 h-4" /> View
        </button>

        {index > 0 && (
          <button
            onClick={onCompare}
            className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
          >
            <Diff className="w-4 h-4" /> Compare
          </button>
        )}

        <button
          onClick={() => onDownload('txt')}
          className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
        >
          <FileText className="w-4 h-4" /> TXT
        </button>

        <button
          onClick={() => onDownload('pdf')}
          className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
        >
          <Download className="w-4 h-4" /> PDF
        </button>
      </div>
    </div>
  );
}
