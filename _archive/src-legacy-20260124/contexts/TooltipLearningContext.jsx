import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * TooltipLearningContext
 *
 * A context provider that manages the state and behavior of the contextual
 * tooltip learning system throughout the application. It tracks which tooltips
 * have been seen, user preference settings, and provides methods for
 * showing/dismissing tooltips.
 */

// Create the context
const TooltipLearningContext = createContext(null);

// Custom hook for accessing the tooltip learning context
export const useTooltipLearning = () => {
  const context = useContext(TooltipLearningContext);
  if (!context) {
    throw new Error('useTooltipLearning must be used within a TooltipLearningProvider');
  }
  return context;
};

export const TooltipLearningProvider = ({ children }) => {
  // Settings for the tooltip system
  const [settings, setSettings] = useState({
    enabled: true, // Master toggle for the tooltip system
    showOnHover: true, // Whether tooltips show on hover or require click
    progressiveMode: true, // Whether to show advanced tips after basics are known
    autoHideDelay: 8000, // How long tooltips stay visible (in ms) before auto-hiding
  });

  // Track which tooltips have been seen/dismissed by the user
  const [seenTooltips, setSeenTooltips] = useState({});

  // Track the active tooltips currently being displayed
  const [activeTooltips, setActiveTooltips] = useState({});

  // Track the user's expertise level (1-5) for different feature areas
  const [expertiseLevels, setExpertiseLevels] = useState({
    general: 1,
    regulatory: 1,
    clinical: 1,
    technical: 1,
    workflow: 1,
  });

  // Load saved state from localStorage when component mounts
  useEffect(() => {
    try {
      // Load previous settings
      const savedSettings = localStorage.getItem('tooltipLearningSettings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }

      // Load previously seen tooltips
      const savedSeenTooltips = localStorage.getItem('tooltipLearningSeenTooltips');
      if (savedSeenTooltips) {
        setSeenTooltips(JSON.parse(savedSeenTooltips));
      }

      // Load expertise levels
      const savedExpertiseLevels = localStorage.getItem('tooltipLearningExpertiseLevels');
      if (savedExpertiseLevels) {
        setExpertiseLevels(JSON.parse(savedExpertiseLevels));
      }
    } catch (error) {
      console.error('Error loading tooltip learning settings:', error);
      // Continue with default settings on error
    }
  }, []);

  // Save state to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('tooltipLearningSettings', JSON.stringify(settings));
      localStorage.setItem('tooltipLearningSeenTooltips', JSON.stringify(seenTooltips));
      localStorage.setItem('tooltipLearningExpertiseLevels', JSON.stringify(expertiseLevels));
    } catch (error) {
      console.error('Error saving tooltip learning settings:', error);
    }
  }, [settings, seenTooltips, expertiseLevels]);

  /**
   * Show a tooltip
   *
   * @param {string} id - Unique identifier for the tooltip
   * @param {Object} options - Configuration options
   * @returns {boolean} Whether the tooltip was shown
   */
  const showTooltip = (id, options = {}) => {
    if (!settings.enabled) return false;

    // If tooltip has been dismissed permanently and we're not forcing it, don't show
    if (seenTooltips[id]?.permanentlyDismissed && !options.force) return false;

    // If tooltip requires higher expertise level than user has, don't show
    const requiredLevel = options.requiredExpertiseLevel || 1;
    const area = options.expertiseArea || 'general';
    if (requiredLevel > expertiseLevels[area] && !options.force) return false;

    // Mark as seen and set as active
    setSeenTooltips(prev => ({
      ...prev,
      [id]: { ...prev[id], seen: true, lastSeen: new Date().toISOString() },
    }));

    setActiveTooltips(prev => ({ ...prev, [id]: true }));

    // Auto-hide if configured
    if (options.autoHide !== false && settings.autoHideDelay > 0) {
      setTimeout(() => {
        hideTooltip(id);
      }, options.autoHideDelay || settings.autoHideDelay);
    }

    return true;
  };

  /**
   * Hide a tooltip
   *
   * @param {string} id - Unique identifier for the tooltip
   * @param {Object} options - Configuration options
   */
  const hideTooltip = (id, options = {}) => {
    setActiveTooltips(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });

    // If permanent dismissal, mark as such
    if (options.permanent) {
      setSeenTooltips(prev => ({
        ...prev,
        [id]: { ...prev[id], permanentlyDismissed: true },
      }));
    }
  };

  /**
   * Check if a tooltip is currently visible
   *
   * @param {string} id - Unique identifier for the tooltip
   * @returns {boolean} Whether the tooltip is visible
   */
  const isTooltipVisible = id => {
    return !!activeTooltips[id];
  };

  /**
   * Check if a tooltip has been seen before
   *
   * @param {string} id - Unique identifier for the tooltip
   * @returns {boolean} Whether the tooltip has been seen
   */
  const hasSeenTooltip = id => {
    return !!seenTooltips[id]?.seen;
  };

  /**
   * Reset one or all tooltips to be shown again
   *
   * @param {string} id - Optional specific tooltip to reset, or all if not provided
   */
  const resetTooltips = (id = null) => {
    if (id) {
      setSeenTooltips(prev => ({
        ...prev,
        [id]: { seen: false, permanentlyDismissed: false },
      }));
    } else {
      setSeenTooltips({});
    }
  };

  /**
   * Update a user's expertise level for a specific area
   *
   * @param {string} area - The expertise area to update
   * @param {number} level - The new expertise level (1-5)
   */
  const updateExpertiseLevel = (area, level) => {
    if (level < 1) level = 1;
    if (level > 5) level = 5;

    setExpertiseLevels(prev => ({
      ...prev,
      [area]: level,
    }));
  };

  /**
   * Update tooltip system settings
   *
   * @param {Object} newSettings - New settings to merge
   */
  const updateSettings = newSettings => {
    setSettings(prev => ({
      ...prev,
      ...newSettings,
    }));
  };

  // The value passed to the context consumers
  const contextValue = {
    settings,
    updateSettings,
    showTooltip,
    hideTooltip,
    isTooltipVisible,
    hasSeenTooltip,
    resetTooltips,
    expertiseLevels,
    updateExpertiseLevel,
    activeTooltips,
  };

  return (
    <TooltipLearningContext.Provider value={contextValue}>
      {children}
    </TooltipLearningContext.Provider>
  );
};

export default TooltipLearningContext;
