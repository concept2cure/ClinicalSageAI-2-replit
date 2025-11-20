
/**
 * Robust Dependency Loader
 * Ensures critical dependencies are loaded with retry mechanism and fallbacks
 */

import { packageMonitor } from '../services/packageMonitorService.js';

class DependencyLoader {
  constructor() {
    this.loadPromises = new Map();
    this.loadedModules = new Map();
    this.fallbackComponents = new Map();
    this.setupFallbacks();
  }

  setupFallbacks() {
    // Native HTML fallbacks for UI components
    this.fallbackComponents.set('Button', ({ children, onClick, className, ...props }) => {
      return React.createElement('button', {
        onClick,
        className: `btn ${className || ''}`,
        style: {
          padding: '8px 16px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px'
        },
        ...props
      }, children);
    });

    this.fallbackComponents.set('Badge', ({ children, className, variant, ...props }) => {
      return React.createElement('span', {
        className: `badge ${className || ''}`,
        style: {
          display: 'inline-block',
          padding: '2px 8px',
          backgroundColor: variant === 'destructive' ? '#ef4444' : '#10b981',
          color: 'white',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 'bold'
        },
        ...props
      }, children);
    });

    this.fallbackComponents.set('Switch', ({ checked, onCheckedChange, className, ...props }) => {
      return React.createElement('input', {
        type: 'checkbox',
        checked,
        onChange: (e) => onCheckedChange && onCheckedChange(e.target.checked),
        className: `switch ${className || ''}`,
        style: {
          width: '40px',
          height: '20px',
          cursor: 'pointer'
        },
        ...props
      });
    });
  }

  async loadComponent(componentPath, retries = 3) {
    // Return cached component if available
    if (this.loadedModules.has(componentPath)) {
      return this.loadedModules.get(componentPath);
    }

    // Return existing promise if loading is in progress
    if (this.loadPromises.has(componentPath)) {
      return this.loadPromises.get(componentPath);
    }

    const loadPromise = this._attemptLoad(componentPath, retries);
    this.loadPromises.set(componentPath, loadPromise);

    try {
      const component = await loadPromise;
      this.loadedModules.set(componentPath, component);
      this.loadPromises.delete(componentPath);
      return component;
    } catch (error) {
      this.loadPromises.delete(componentPath);
      throw error;
    }
  }

  async _attemptLoad(componentPath, retries) {
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Loading ${componentPath} (attempt ${attempt}/${retries})`);
        
        // Try dynamic import
        const module = await this._dynamicImport(componentPath);
        console.log(`✅ Successfully loaded ${componentPath}`);
        return module;
      } catch (error) {
        lastError = error;
        console.warn(`❌ Failed to load ${componentPath} (attempt ${attempt}/${retries}):`, error);
        
        if (attempt < retries) {
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await this._delay(delay);
        }
      }
    }

    // All retries failed, try fallback
    console.warn(`All load attempts failed for ${componentPath}, using fallback`);
    return this._getFallback(componentPath);
  }

  async _dynamicImport(componentPath) {
    // Handle different import patterns
    if (componentPath.startsWith('@/components/ui/')) {
      const componentName = componentPath.split('/').pop();
      
      try {
        // Try standard import
        const module = await import(/* @vite-ignore */ componentPath);
        return module.default || module[componentName];
      } catch (error) {
        // Try alternative path patterns
        const altPath = componentPath.replace('@/components/ui/', '../components/ui/');
        const altModule = await import(/* @vite-ignore */ altPath);
        return altModule.default || altModule[componentName];
      }
    }

    // Standard dynamic import
    const module = await import(/* @vite-ignore */ componentPath);
    return module.default || module;
  }

  _getFallback(componentPath) {
    const componentName = componentPath.split('/').pop();
    const fallback = this.fallbackComponents.get(componentName);
    
    if (fallback) {
      console.log(`Using fallback for ${componentName}`);
      return fallback;
    }

    // Ultimate fallback - return a div
    console.warn(`No fallback available for ${componentName}, using div`);
    return ({ children, ...props }) => React.createElement('div', {
      ...props,
      'data-fallback': componentName,
      style: { 
        border: '1px dashed #ccc', 
        padding: '8px', 
        margin: '4px',
        backgroundColor: '#f9f9f9'
      }
    }, children || `[${componentName} Fallback]`);
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Preload critical components
  async preloadCriticalComponents() {
    const criticalComponents = [
      '@/components/ui/button',
      '@/components/ui/badge',
      '@/components/ui/switch'
    ];

    console.log('Preloading critical components...');
    
    const loadPromises = criticalComponents.map(async (componentPath) => {
      try {
        await this.loadComponent(componentPath);
        return { path: componentPath, success: true };
      } catch (error) {
        console.error(`Failed to preload ${componentPath}:`, error);
        return { path: componentPath, success: false, error };
      }
    });

    const results = await Promise.allSettled(loadPromises);
    const failed = results
      .filter(result => result.status === 'rejected' || !result.value.success)
      .map(result => result.value?.path || 'unknown');

    if (failed.length > 0) {
      console.warn('Some critical components failed to preload:', failed);
      packageMonitor.activateEmergencyFallback();
    }

    return {
      total: criticalComponents.length,
      loaded: criticalComponents.length - failed.length,
      failed: failed.length,
      failedComponents: failed
    };
  }

  // Get component with automatic fallback
  getComponent(componentPath) {
    if (this.loadedModules.has(componentPath)) {
      return this.loadedModules.get(componentPath);
    }

    const componentName = componentPath.split('/').pop();
    return this.fallbackComponents.get(componentName) || this._getFallback(componentPath);
  }

  // Health check
  async healthCheck() {
    const status = {
      loadedComponents: this.loadedModules.size,
      activePromises: this.loadPromises.size,
      fallbacksAvailable: this.fallbackComponents.size,
      timestamp: new Date().toISOString()
    };

    // Test a sample component load
    try {
      await this.loadComponent('@/components/ui/button', 1);
      status.testLoad = 'success';
    } catch (error) {
      status.testLoad = 'failed';
      status.testError = error.message;
    }

    return status;
  }
}

// Create singleton instance
export const dependencyLoader = new DependencyLoader();

// Export convenient wrapper functions
export const loadComponent = (path) => dependencyLoader.loadComponent(path);
export const getComponent = (path) => dependencyLoader.getComponent(path);
export const preloadCriticalComponents = () => dependencyLoader.preloadCriticalComponents();

export default DependencyLoader;
