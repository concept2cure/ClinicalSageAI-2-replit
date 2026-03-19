/**
 * Mashable Analytics Service
 *
 * This service provides cross-module analytics, visualizations, and dashboards
 * for the Concept2Cure platform. It enables seamless data aggregation, integration,
 * and analysis across all platform modules to provide comprehensive regulatory
 * and clinical insights.
 *
 * Features:
 * - Cross-module data aggregation and analytics
 * - Real-time metrics and KPIs
 * - Interactive dashboards and visualizations
 * - Custom report generation
 * - Intelligent trend detection
 * - Predictive analytics for regulatory outcomes
 * - Configurable alerts and notifications
 */

import regulatoryIntelligenceCore from './RegulatoryIntelligenceCore';

const API_BASE = '/api/mashable';

/**
 * Analytics data granularity levels
 */
export const DATA_GRANULARITY = {
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
};

/**
 * Analytics chart types
 */
export const CHART_TYPES = {
  LINE: 'line',
  BAR: 'bar',
  PIE: 'pie',
  SCATTER: 'scatter',
  AREA: 'area',
  BUBBLE: 'bubble',
  RADAR: 'radar',
  HEATMAP: 'heatmap',
  SANKEY: 'sankey',
  TIMELINE: 'timeline',
};

/**
 * Analytics metric types
 */
export const METRIC_TYPES = {
  COUNT: 'count',
  SUM: 'sum',
  AVERAGE: 'average',
  MEDIAN: 'median',
  MINIMUM: 'minimum',
  MAXIMUM: 'maximum',
  PERCENTILE: 'percentile',
  STANDARD_DEVIATION: 'standard_deviation',
  VARIANCE: 'variance',
};

/**
 * Dashboard types
 */
export const DASHBOARD_TYPES = {
  EXECUTIVE: 'executive',
  OPERATIONAL: 'operational',
  REGULATORY: 'regulatory',
  CLINICAL: 'clinical',
  SCIENTIFIC: 'scientific',
  SUBMISSION: 'submission',
  CUSTOM: 'custom',
};

class MashableService {
  constructor() {
    this.currentUser = null;
    this.dashboardCache = new Map();
    this.datasetCache = new Map();
    this.metricListeners = new Map();
    this.lastSyncTimestamp = null;
    this.activeWidgets = new Set();
    this.visualizationConfigs = {};
    this.moduleIntegrations = {
      'ind-wizard': true,
      'csr-intelligence': true,
      'trial-vault': true,
      'study-architect': true,
      'ich-wiz': true,
      'clinical-metadata': true,
      analytics: true,
    };
  }

  /**
   * Initialize Mashable service
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} - Initialization status
   */
  async initialize(options = {}) {
    try {
      const response = await fetch(`${API_BASE}/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        throw new Error(`Failed to initialize Mashable: ${response.statusText}`);
      }

      const initStatus = await response.json();
      this.currentUser = initStatus.currentUser;
      this.lastSyncTimestamp = new Date().toISOString();
      this.visualizationConfigs = initStatus.visualizationConfigs || {};

      // Setup real-time metric connections if WebSockets available
      if (initStatus.socketEnabled) {
        this._setupRealtimeConnections();
      }

      // Initialize intelligence core for predictive analytics
      if (options.enableIntelligence !== false) {
        await regulatoryIntelligenceCore.initialize();
      }

      return initStatus;
    } catch (error) {
      console.error('Error initializing Mashable service:', error);
      throw error;
    }
  }

  /**
   * Setup real-time connections for metric updates
   * @private
   */
  _setupRealtimeConnections() {
    if (typeof window === 'undefined') return;

    // Setup WebSocket for real-time updates
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws-analytics`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('Mashable WebSocket connection established');
        this.socket.send(
          JSON.stringify({
            type: 'authenticate',
            userId: this.currentUser?.id,
          })
        );
      };

      this.socket.onmessage = event => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'metric_update':
            this._handleMetricUpdate(message.data);
            break;
          case 'dashboard_update':
            this._handleDashboardUpdate(message.data);
            break;
          case 'alert_triggered':
            this._handleAlertTriggered(message.data);
            break;
        }
      };

      this.socket.onerror = error => {
        console.error('Mashable WebSocket error:', error);
      };

      this.socket.onclose = () => {
        console.log('Mashable WebSocket connection closed');
        // Attempt to reconnect after 5 seconds
        setTimeout(() => this._setupRealtimeConnections(), 5000);
      };
    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
    }
  }

  /**
   * Handle real-time metric updates
   * @param {Object} data - Metric update data
   * @private
   */
  _handleMetricUpdate(data) {
    // Notify all metric listeners
    if (this.metricListeners.has(data.metricId)) {
      const listeners = this.metricListeners.get(data.metricId);
      listeners.forEach(listener => {
        listener(data);
      });
    }

    // Update dashboard cache if affected
    if (data.affectedDashboards && data.affectedDashboards.length) {
      data.affectedDashboards.forEach(dashboardId => {
        if (this.dashboardCache.has(dashboardId)) {
          const dashboard = this.dashboardCache.get(dashboardId);
          const widgetIndex = dashboard.widgets.findIndex(w => w.metrics.includes(data.metricId));

          if (widgetIndex >= 0) {
            // Update widget data
            dashboard.widgets[widgetIndex].latestData = data.value;
            dashboard.widgets[widgetIndex].lastUpdated = new Date().toISOString();
            dashboard.lastUpdated = new Date().toISOString();

            // Update cache
            this.dashboardCache.set(dashboardId, dashboard);
          }
        }
      });
    }

    // Update dataset cache if affected
    if (data.affectedDatasets && data.affectedDatasets.length) {
      data.affectedDatasets.forEach(datasetId => {
        if (this.datasetCache.has(datasetId)) {
          const dataset = this.datasetCache.get(datasetId);

          // Update dataset if it contains this metric
          if (dataset.metrics.includes(data.metricId)) {
            dataset.lastUpdated = new Date().toISOString();
            this.datasetCache.set(datasetId, dataset);
          }
        }
      });
    }
  }

  /**
   * Handle real-time dashboard updates
   * @param {Object} data - Dashboard update data
   * @private
   */
  _handleDashboardUpdate(data) {
    // Update dashboard cache
    if (data.dashboardId && this.dashboardCache.has(data.dashboardId)) {
      const dashboard = this.dashboardCache.get(data.dashboardId);

      // Update with new data
      Object.assign(dashboard, data.updates);
      dashboard.lastUpdated = new Date().toISOString();

      // Update cache
      this.dashboardCache.set(data.dashboardId, dashboard);
    }
  }

  /**
   * Handle real-time alert notifications
   * @param {Object} data - Alert data
   * @private
   */
  _handleAlertTriggered(data) {
    // Dispatch event for UI to show notification
    if (typeof window !== 'undefined') {
      const alertEvent = new CustomEvent('mashable-alert', { detail: data });
      window.dispatchEvent(alertEvent);
    }

    // Log alert
    console.log('Mashable Alert:', data.alertName, '-', data.message);
  }

  /**
   * Get dashboard by ID
   * @param {string} dashboardId - Dashboard ID
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Dashboard data
   */
  async getDashboard(dashboardId, options = {}) {
    try {
      // Check cache first if not forcing refresh
      if (!options.forceRefresh && this.dashboardCache.has(dashboardId)) {
        return Promise.resolve(this.dashboardCache.get(dashboardId));
      }

      const queryParams = new URLSearchParams({
        ...options,
      }).toString();

      const response = await fetch(`${API_BASE}/dashboards/${dashboardId}?${queryParams}`);
      if (!response.ok) {
        throw new Error(`Failed to get dashboard: ${response.statusText}`);
      }

      const dashboard = await response.json();

      // Cache dashboard data
      this.dashboardCache.set(dashboardId, dashboard);

      // Subscribe to real-time updates if requested
      if (options.subscribe && this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(
          JSON.stringify({
            type: 'subscribe_dashboard',
            dashboardId,
          })
        );
      }

      return dashboard;
    } catch (error) {
      console.error(`Error getting dashboard ${dashboardId}:`, error);
      throw error;
    }
  }

  /**
   * Get user dashboards
   * @param {Object} options - Request options
   * @returns {Promise<Array>} - User dashboards
   */
  async getUserDashboards(options = {}) {
    try {
      const queryParams = new URLSearchParams({
        ...options,
      }).toString();

      const response = await fetch(`${API_BASE}/dashboards?${queryParams}`);
      if (!response.ok) {
        throw new Error(`Failed to get user dashboards: ${response.statusText}`);
      }

      const dashboards = await response.json();

      // Cache dashboards
      dashboards.forEach(dashboard => {
        this.dashboardCache.set(dashboard.id, dashboard);
      });

      return dashboards;
    } catch (error) {
      console.error('Error getting user dashboards:', error);
      throw error;
    }
  }

  /**
   * Create dashboard
   * @param {Object} dashboard - Dashboard configuration
   * @returns {Promise<Object>} - Created dashboard
   */
  async createDashboard(dashboard) {
    try {
      const response = await fetch(`${API_BASE}/dashboards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dashboard),
      });

      if (!response.ok) {
        throw new Error(`Failed to create dashboard: ${response.statusText}`);
      }

      const createdDashboard = await response.json();

      // Cache dashboard
      this.dashboardCache.set(createdDashboard.id, createdDashboard);

      return createdDashboard;
    } catch (error) {
      console.error('Error creating dashboard:', error);
      throw error;
    }
  }

  /**
   * Update dashboard
   * @param {string} dashboardId - Dashboard ID
   * @param {Object} updates - Dashboard updates
   * @returns {Promise<Object>} - Updated dashboard
   */
  async updateDashboard(dashboardId, updates) {
    try {
      const response = await fetch(`${API_BASE}/dashboards/${dashboardId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update dashboard: ${response.statusText}`);
      }

      const updatedDashboard = await response.json();

      // Update cache
      this.dashboardCache.set(dashboardId, updatedDashboard);

      return updatedDashboard;
    } catch (error) {
      console.error(`Error updating dashboard ${dashboardId}:`, error);
      throw error;
    }
  }

  /**
   * Delete dashboard
   * @param {string} dashboardId - Dashboard ID
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteDashboard(dashboardId) {
    try {
      const response = await fetch(`${API_BASE}/dashboards/${dashboardId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete dashboard: ${response.statusText}`);
      }

      // Remove from cache
      this.dashboardCache.delete(dashboardId);

      return await response.json();
    } catch (error) {
      console.error(`Error deleting dashboard ${dashboardId}:`, error);
      throw error;
    }
  }

  /**
   * Get dashboard widget data
   * @param {string} dashboardId - Dashboard ID
   * @param {string} widgetId - Widget ID
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Widget data
   */
  async getWidgetData(dashboardId, widgetId, options = {}) {
    try {
      const queryParams = new URLSearchParams({
        ...options,
      }).toString();

      const response = await fetch(
        `${API_BASE}/dashboards/${dashboardId}/widgets/${widgetId}/data?${queryParams}`
      );
      if (!response.ok) {
        throw new Error(`Failed to get widget data: ${response.statusText}`);
      }

      const widgetData = await response.json();

      // Update widget in dashboard cache
      if (this.dashboardCache.has(dashboardId)) {
        const dashboard = this.dashboardCache.get(dashboardId);
        const widgetIndex = dashboard.widgets.findIndex(w => w.id === widgetId);

        if (widgetIndex >= 0) {
          dashboard.widgets[widgetIndex].data = widgetData.data;
          dashboard.widgets[widgetIndex].lastUpdated = new Date().toISOString();
          this.dashboardCache.set(dashboardId, dashboard);
        }
      }

      // Register active widget
      this.activeWidgets.add(widgetId);

      return widgetData;
    } catch (error) {
      console.error(`Error getting widget data for ${widgetId}:`, error);
      throw error;
    }
  }

  /**
   * Create dashboard widget
   * @param {string} dashboardId - Dashboard ID
   * @param {Object} widget - Widget configuration
   * @returns {Promise<Object>} - Created widget
   */
  async createWidget(dashboardId, widget) {
    try {
      const response = await fetch(`${API_BASE}/dashboards/${dashboardId}/widgets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(widget),
      });

      if (!response.ok) {
        throw new Error(`Failed to create widget: ${response.statusText}`);
      }

      const createdWidget = await response.json();

      // Update dashboard cache
      if (this.dashboardCache.has(dashboardId)) {
        const dashboard = this.dashboardCache.get(dashboardId);
        dashboard.widgets.push(createdWidget);
        dashboard.lastUpdated = new Date().toISOString();
        this.dashboardCache.set(dashboardId, dashboard);
      }

      return createdWidget;
    } catch (error) {
      console.error(`Error creating widget for dashboard ${dashboardId}:`, error);
      throw error;
    }
  }

  /**
   * Update dashboard widget
   * @param {string} dashboardId - Dashboard ID
   * @param {string} widgetId - Widget ID
   * @param {Object} updates - Widget updates
   * @returns {Promise<Object>} - Updated widget
   */
  async updateWidget(dashboardId, widgetId, updates) {
    try {
      const response = await fetch(`${API_BASE}/dashboards/${dashboardId}/widgets/${widgetId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update widget: ${response.statusText}`);
      }

      const updatedWidget = await response.json();

      // Update dashboard cache
      if (this.dashboardCache.has(dashboardId)) {
        const dashboard = this.dashboardCache.get(dashboardId);
        const widgetIndex = dashboard.widgets.findIndex(w => w.id === widgetId);

        if (widgetIndex >= 0) {
          dashboard.widgets[widgetIndex] = updatedWidget;
          dashboard.lastUpdated = new Date().toISOString();
          this.dashboardCache.set(dashboardId, dashboard);
        }
      }

      return updatedWidget;
    } catch (error) {
      console.error(`Error updating widget ${widgetId}:`, error);
      throw error;
    }
  }

  /**
   * Delete dashboard widget
   * @param {string} dashboardId - Dashboard ID
   * @param {string} widgetId - Widget ID
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteWidget(dashboardId, widgetId) {
    try {
      const response = await fetch(`${API_BASE}/dashboards/${dashboardId}/widgets/${widgetId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete widget: ${response.statusText}`);
      }

      // Update dashboard cache
      if (this.dashboardCache.has(dashboardId)) {
        const dashboard = this.dashboardCache.get(dashboardId);
        dashboard.widgets = dashboard.widgets.filter(w => w.id !== widgetId);
        dashboard.lastUpdated = new Date().toISOString();
        this.dashboardCache.set(dashboardId, dashboard);
      }

      // Remove from active widgets
      this.activeWidgets.delete(widgetId);

      return await response.json();
    } catch (error) {
      console.error(`Error deleting widget ${widgetId}:`, error);
      throw error;
    }
  }

  /**
   * Get metric data
   * @param {string} metricId - Metric ID
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Metric data
   */
  async getMetricData(metricId, options = {}) {
    try {
      const queryParams = new URLSearchParams({
        ...options,
      }).toString();

      const response = await fetch(`${API_BASE}/metrics/${metricId}/data?${queryParams}`);
      if (!response.ok) {
        throw new Error(`Failed to get metric data: ${response.statusText}`);
      }

      const metricData = await response.json();

      // Subscribe to real-time updates if requested
      if (options.subscribe && this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(
          JSON.stringify({
            type: 'subscribe_metric',
            metricId,
          })
        );
      }

      return metricData;
    } catch (error) {
      console.error(`Error getting metric data for ${metricId}:`, error);
      throw error;
    }
  }

  /**
   * Create metric
   * @param {Object} metric - Metric configuration
   * @returns {Promise<Object>} - Created metric
   */
  async createMetric(metric) {
    try {
      const response = await fetch(`${API_BASE}/metrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metric),
      });

      if (!response.ok) {
        throw new Error(`Failed to create metric: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating metric:', error);
      throw error;
    }
  }

  /**
   * Update metric
   * @param {string} metricId - Metric ID
   * @param {Object} updates - Metric updates
   * @returns {Promise<Object>} - Updated metric
   */
  async updateMetric(metricId, updates) {
    try {
      const response = await fetch(`${API_BASE}/metrics/${metricId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update metric: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error updating metric ${metricId}:`, error);
      throw error;
    }
  }

  /**
   * Delete metric
   * @param {string} metricId - Metric ID
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteMetric(metricId) {
    try {
      const response = await fetch(`${API_BASE}/metrics/${metricId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete metric: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error deleting metric ${metricId}:`, error);
      throw error;
    }
  }

  /**
   * Create dataset
   * @param {Object} dataset - Dataset configuration
   * @returns {Promise<Object>} - Created dataset
   */
  async createDataset(dataset) {
    try {
      const response = await fetch(`${API_BASE}/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataset),
      });

      if (!response.ok) {
        throw new Error(`Failed to create dataset: ${response.statusText}`);
      }

      const createdDataset = await response.json();

      // Cache dataset
      this.datasetCache.set(createdDataset.id, createdDataset);

      return createdDataset;
    } catch (error) {
      console.error('Error creating dataset:', error);
      throw error;
    }
  }

  /**
   * Get dataset by ID
   * @param {string} datasetId - Dataset ID
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Dataset data
   */
  async getDataset(datasetId, options = {}) {
    try {
      // Check cache first if not forcing refresh
      if (!options.forceRefresh && this.datasetCache.has(datasetId)) {
        return Promise.resolve(this.datasetCache.get(datasetId));
      }

      const queryParams = new URLSearchParams({
        ...options,
      }).toString();

      const response = await fetch(`${API_BASE}/datasets/${datasetId}?${queryParams}`);
      if (!response.ok) {
        throw new Error(`Failed to get dataset: ${response.statusText}`);
      }

      const dataset = await response.json();

      // Cache dataset
      this.datasetCache.set(datasetId, dataset);

      return dataset;
    } catch (error) {
      console.error(`Error getting dataset ${datasetId}:`, error);
      throw error;
    }
  }

  /**
   * Execute dataset query
   * @param {string} datasetId - Dataset ID
   * @param {Object} query - Query parameters
   * @returns {Promise<Object>} - Query results
   */
  async queryDataset(datasetId, query) {
    try {
      const response = await fetch(`${API_BASE}/datasets/${datasetId}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(query),
      });

      if (!response.ok) {
        throw new Error(`Failed to execute dataset query: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error querying dataset ${datasetId}:`, error);
      throw error;
    }
  }

  /**
   * Get cross-module analytics
   * @param {Array} modules - Modules to include
   * @param {Object} options - Analytics options
   * @returns {Promise<Object>} - Cross-module analytics
   */
  async getCrossModuleAnalytics(modules, options = {}) {
    try {
      const response = await fetch(`${API_BASE}/cross-module-analytics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modules,
          options,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get cross-module analytics: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting cross-module analytics:', error);
      throw error;
    }
  }

  /**
   * Generate report
   * @param {string} reportType - Report type
   * @param {Object} parameters - Report parameters
   * @returns {Promise<Object>} - Generated report
   */
  async generateReport(reportType, parameters) {
    try {
      const response = await fetch(`${API_BASE}/reports/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportType,
          parameters,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate report: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error generating ${reportType} report:`, error);
      throw error;
    }
  }

  /**
   * Get available report templates
   * @returns {Promise<Array>} - Report templates
   */
  async getReportTemplates() {
    try {
      const response = await fetch(`${API_BASE}/reports/templates`);
      if (!response.ok) {
        throw new Error(`Failed to get report templates: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting report templates:', error);
      throw error;
    }
  }

  /**
   * Create visualization
   * @param {Object} visualization - Visualization configuration
   * @returns {Promise<Object>} - Created visualization
   */
  async createVisualization(visualization) {
    try {
      const response = await fetch(`${API_BASE}/visualizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(visualization),
      });

      if (!response.ok) {
        throw new Error(`Failed to create visualization: ${response.statusText}`);
      }

      const createdVisualization = await response.json();

      // Update visualization configs
      this.visualizationConfigs[createdVisualization.id] = createdVisualization;

      return createdVisualization;
    } catch (error) {
      console.error('Error creating visualization:', error);
      throw error;
    }
  }

  /**
   * Get visualization by ID
   * @param {string} visualizationId - Visualization ID
   * @returns {Promise<Object>} - Visualization configuration
   */
  async getVisualization(visualizationId) {
    try {
      // Check cache first
      if (this.visualizationConfigs[visualizationId]) {
        return Promise.resolve(this.visualizationConfigs[visualizationId]);
      }

      const response = await fetch(`${API_BASE}/visualizations/${visualizationId}`);
      if (!response.ok) {
        throw new Error(`Failed to get visualization: ${response.statusText}`);
      }

      const visualization = await response.json();

      // Update visualization configs
      this.visualizationConfigs[visualizationId] = visualization;

      return visualization;
    } catch (error) {
      console.error(`Error getting visualization ${visualizationId}:`, error);
      throw error;
    }
  }

  /**
   * Create alert
   * @param {Object} alert - Alert configuration
   * @returns {Promise<Object>} - Created alert
   */
  async createAlert(alert) {
    try {
      const response = await fetch(`${API_BASE}/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(alert),
      });

      if (!response.ok) {
        throw new Error(`Failed to create alert: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating alert:', error);
      throw error;
    }
  }

  /**
   * Get user alerts
   * @param {Object} options - Request options
   * @returns {Promise<Array>} - User alerts
   */
  async getUserAlerts(options = {}) {
    try {
      const queryParams = new URLSearchParams({
        ...options,
      }).toString();

      const response = await fetch(`${API_BASE}/alerts?${queryParams}`);
      if (!response.ok) {
        throw new Error(`Failed to get user alerts: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting user alerts:', error);
      throw error;
    }
  }

  /**
   * Update alert
   * @param {string} alertId - Alert ID
   * @param {Object} updates - Alert updates
   * @returns {Promise<Object>} - Updated alert
   */
  async updateAlert(alertId, updates) {
    try {
      const response = await fetch(`${API_BASE}/alerts/${alertId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update alert: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error updating alert ${alertId}:`, error);
      throw error;
    }
  }

  /**
   * Get predictive analytics
   * @param {string} modelType - Predictive model type
   * @param {Object} parameters - Model parameters
   * @returns {Promise<Object>} - Predictive analytics
   */
  async getPredictiveAnalytics(modelType, parameters) {
    try {
      // Forward to intelligence core for advanced predictions
      switch (modelType) {
        case 'submission_success':
          return await regulatoryIntelligenceCore.predictSubmissionSuccess(
            parameters.submissionType,
            parameters.projectId,
            parameters
          );
        case 'study_outcome':
          return await regulatoryIntelligenceCore.analyzeCrossModulePatterns({
            analysisType: 'study_outcome_prediction',
            parameters,
          });
        case 'approval_timeline':
          return await regulatoryIntelligenceCore.analyzeCrossModulePatterns({
            analysisType: 'approval_timeline_prediction',
            parameters,
          });
        default:
          const response = await fetch(`${API_BASE}/predictive-analytics`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              modelType,
              parameters,
            }),
          });

          if (!response.ok) {
            throw new Error(`Failed to get predictive analytics: ${response.statusText}`);
          }

          return await response.json();
      }
    } catch (error) {
      console.error(`Error getting predictive analytics for ${modelType}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to metric updates
   * @param {string} metricId - Metric ID
   * @param {Function} listener - Update listener
   * @returns {string} - Subscription ID
   */
  subscribeToMetricUpdates(metricId, listener) {
    const subscriptionId = Date.now().toString(36) + Math.random().toString(36).substr(2);

    if (!this.metricListeners.has(metricId)) {
      this.metricListeners.set(metricId, new Map());
    }

    this.metricListeners.get(metricId).set(subscriptionId, listener);

    // Subscribe to real-time updates if available
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: 'subscribe_metric',
          metricId,
        })
      );
    }

    return subscriptionId;
  }

  /**
   * Unsubscribe from metric updates
   * @param {string} metricId - Metric ID
   * @param {string} subscriptionId - Subscription ID
   */
  unsubscribeFromMetricUpdates(metricId, subscriptionId) {
    if (this.metricListeners.has(metricId)) {
      this.metricListeners.get(metricId).delete(subscriptionId);

      // If no more listeners, unsubscribe from real-time updates
      if (this.metricListeners.get(metricId).size === 0) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(
            JSON.stringify({
              type: 'unsubscribe_metric',
              metricId,
            })
          );
        }
      }
    }
  }
}

// Create singleton instance
const mashableService = new MashableService();
export default mashableService;
