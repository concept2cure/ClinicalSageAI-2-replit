import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import WidgetBuilder from './WidgetBuilder';
import WidgetChart from './WidgetChart';

export default function KPIDashboard({ org }) {
  const [widgets, setWidgets] = useState([]);
  const [editWidget, setEditWidget] = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [widgetData, setWidgetData] = useState({});

  // Load widgets from API
  const loadWidgets = async () => {
    if (!org) return;
    try {
      const response = await api.get(`/api/org/${org}/widgets`);
      setWidgets(response.data);

      // Load data for each widget
      response.data.forEach(widget => {
        loadWidgetData(widget.id);
      });
    } catch (error) {
      console.error('Failed to load widgets:', error);
    }
  };

  // Load data for a specific widget
  const loadWidgetData = async widgetId => {
    try {
      const response = await api.post(`/api/org/${org}/widgets/execute`, { widget_id: widgetId });
      setWidgetData(prev => ({
        ...prev,
        [widgetId]: response.data,
      }));
    } catch (error) {
      console.error(`Failed to load data for widget ${widgetId}:`, error);
      setWidgetData(prev => ({
        ...prev,
        [widgetId]: { error: error.message || 'Failed to load data' },
      }));
    }
  };

  // Initialize on mount or when org changes
  useEffect(() => {
    loadWidgets();
  }, [org]);

  // Save a widget
  const saveWidget = async data => {
    if (!data) {
      setShowBuilder(false);
      setEditWidget(null);
      return;
    }

    try {
      // If no layout is provided, add default
      if (!data.layout) {
        data.layout = { x: 0, y: 0, w: 6, h: 4 };
      }

      const response = await api.post(`/api/org/${org}/widgets`, data);
      setShowBuilder(false);
      setEditWidget(null);
      await loadWidgets();

      // Load data for the new widget
      if (response.data && response.data.id) {
        loadWidgetData(response.data.id);
      }
    } catch (error) {
      console.error('Failed to save widget:', error);
      alert('Failed to save widget: ' + (error.message || 'Unknown error'));
    }
  };

  // Delete a widget
  const deleteWidget = async widgetId => {
    if (!confirm('Are you sure you want to delete this widget?')) return;

    try {
      await api.delete(`/api/org/${org}/widgets/${widgetId}`);
      setWidgets(widgets.filter(w => w.id !== widgetId));
    } catch (error) {
      console.error('Failed to delete widget:', error);
      alert('Failed to delete widget: ' + (error.message || 'Unknown error'));
    }
  };

  // Edit a widget
  const editWidgetHandler = widget => {
    setEditWidget(widget);
    setShowBuilder(true);
  };

  return (
    <div className="p-4">
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-semibold">KPI Dashboard</h2>
        <button
          className="bg-green-700 text-white px-3 py-1 rounded"
          onClick={() => setShowBuilder(true)}
        >
          + Add Widget
        </button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {widgets.map(widget => {
          // Parse layout or use defaults
          let layout;
          try {
            layout = JSON.parse(widget.layout);
          } catch (e) {
            layout = { w: 6, h: 4 };
          }

          // Calculate column span (based on w property in a 12-column grid)
          const colSpan = Math.min(12, Math.max(3, layout.w || 6));

          return (
            <div
              key={widget.id}
              className={`col-span-${colSpan} bg-white shadow rounded p-3 flex flex-col`}
              style={{ height: `${Math.max(2, layout.h || 4) * 80}px` }}
            >
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-semibold">{widget.name}</h4>
                <div className="flex space-x-1">
                  <button
                    className="text-gray-400 hover:text-blue-500 text-xs"
                    onClick={() => editWidgetHandler(widget)}
                  >
                    Edit
                  </button>
                  <button
                    className="text-gray-400 hover:text-red-500 text-xs"
                    onClick={() => deleteWidget(widget.id)}
                  >
                    Delete
                  </button>
                  <button
                    className="text-gray-400 hover:text-green-500 text-xs"
                    onClick={() => loadWidgetData(widget.id)}
                  >
                    Refresh
                  </button>
                </div>
              </div>
              <div className="flex-grow overflow-hidden">
                <WidgetChart type={widget.type} data={widgetData[widget.id]} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {widgets.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded">
          <p className="text-gray-500 mb-4">No widgets added yet</p>
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={() => setShowBuilder(true)}
          >
            Create Your First Widget
          </button>
        </div>
      )}

      {/* Widget builder modal */}
      {showBuilder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg">
            <WidgetBuilder onSave={saveWidget} initialData={editWidget || {}} />
          </div>
        </div>
      )}
    </div>
  );
}
